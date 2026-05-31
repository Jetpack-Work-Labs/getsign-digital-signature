import axios from "axios";
import * as fs from "fs";
import * as https from "https";
import * as path from "path";
import * as forge from "node-forge";
import { config } from "../../config";
import { CertificateDto } from "../../interfaces";
import { Sentry } from "../../infrastructure";

// EJBCA REST is reached with a SuperAdmin client certificate over mutual TLS.
// Using PEM cert+key (not PKCS#12) because Node 22/OpenSSL 3 rejects EJBCA's
// legacy-encrypted P12 files at the TLS handshake level.
const adminAgent = (): https.Agent => {
  const certPath = config.ejbca.adminP12.replace(/\.p12$/, ".pem");
  const keyPath = config.ejbca.adminP12.replace(/\.p12$/, "-key.pem");
  const hasPem = fs.existsSync(certPath) && fs.existsSync(keyPath);
  return new https.Agent(
    hasPem
      ? {
          cert: fs.readFileSync(certPath),
          key: fs.readFileSync(keyPath),
          rejectUnauthorized: false,
        }
      : {
          pfx: fs.readFileSync(config.ejbca.adminP12),
          passphrase: config.ejbca.adminPassphrase,
          rejectUnauthorized: false,
        }
  );
};

const ejbca = () =>
  axios.create({
    baseURL: config.ejbca.restBase,
    httpsAgent: adminAgent(),
    headers: {
      "X-Keyfactor-Requested-With": "XMLHttpRequest",
      "Content-Type": "application/json",
    },
    timeout: 60000,
  });

// Build a subject DN string from the account details, skipping empty fields.
const buildSubjectDn = (dto: CertificateDto): string => {
  const parts: string[] = [`CN=${dto.commonName}`];
  if (dto.organizationName) parts.push(`O=${dto.organizationName}`);
  if (dto.localityName) parts.push(`L=${dto.localityName}`);
  if (dto.state) parts.push(`ST=${dto.state}`);
  if (dto.countryName) parts.push(`C=${dto.countryName}`);
  return parts.join(",");
};

// Generate an RSA keypair locally and produce a PKCS#10 CSR. The private key
// never leaves this process — this is what gives the signatory sole control
// over the signing key (eIDAS AdES requirement).
const generateKeyPairAndCsr = (dto: CertificateDto) => {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const csr = forge.pki.createCertificationRequest();
  csr.publicKey = keys.publicKey;

  const subject: forge.pki.CertificateField[] = [
    { name: "commonName", value: dto.commonName },
  ];
  if (dto.organizationName)
    subject.push({ name: "organizationName", value: dto.organizationName });
  if (dto.localityName)
    subject.push({ name: "localityName", value: dto.localityName });
  if (dto.state) subject.push({ shortName: "ST", value: dto.state });
  if (dto.countryName)
    subject.push({ name: "countryName", value: dto.countryName });

  csr.setSubject(subject);
  csr.sign(keys.privateKey, forge.md.sha256.create());

  return { privateKey: keys.privateKey, csrPem: forge.pki.certificationRequestToPem(csr) };
};

// Decode an EJBCA base64-encoded DER certificate into a forge certificate.
const certFromBase64Der = (b64: string): forge.pki.Certificate =>
  forge.pki.certificateFromAsn1(
    forge.asn1.fromDer(forge.util.decode64(b64))
  );

// Register the end entity in EJBCA so the CSR can be enrolled against it.
// USERGENERATED token => EJBCA only signs our CSR, it does not generate keys.
const addEndEntity = async (
  username: string,
  password: string,
  subjectDn: string
): Promise<void> => {
  try {
    await ejbca().post("/endentity", {
      username,
      password,
      subject_dn: subjectDn,
      ca_name: config.ejbca.signingCa,
      certificate_profile_name: config.ejbca.certProfile,
      end_entity_profile_name: config.ejbca.eeProfile,
      token: "USERGENERATED",
      status: "NEW",
    });
  } catch (error: any) {
    // Already exists (re-enrollment) — reset it to NEW and reuse below.
    const status = error?.response?.status;
    if (status === 409 || status === 400) {
      console.warn(
        `End entity ${username} already exists; proceeding to enrollment.`
      );
      return;
    }
    throw error;
  }
};

export interface EnrollResult {
  /** Path to the per-company PKCS#12 keystore: {keystoreDir}/{accountId}.p12 */
  keystorePath: string;
}

/**
 * Enroll a signing certificate for one company from the GetSign Signing CA in
 * EJBCA. The RSA key is generated locally (eIDAS AdES sole-control) — EJBCA
 * only signs the CSR. The resulting key+cert is saved as a per-company PKCS#12
 * file that @signpdf/signpdf reads at signing time.
 */
export const enrollViaEjbca = async (
  dto: CertificateDto
): Promise<EnrollResult> => {
  const username = `getsign_${dto.serialNumber}`;
  const enrollmentCode = `Ec_${dto.serialNumber}_${Date.now().toString(36)}`;
  const subjectDn = buildSubjectDn(dto);

  try {
    const { privateKey, csrPem } = generateKeyPairAndCsr(dto);

    await addEndEntity(username, enrollmentCode, subjectDn);

    const { data } = await ejbca().post("/certificate/pkcs10enroll", {
      certificate_request: csrPem,
      certificate_profile_name: config.ejbca.certProfile,
      end_entity_profile_name: config.ejbca.eeProfile,
      certificate_authority_name: config.ejbca.signingCa,
      username,
      password: enrollmentCode,
      include_chain: true,
    });

    // EJBCA returns the leaf cert + chain as base64 DER.
    const leaf = certFromBase64Der(data.certificate);
    const chain: forge.pki.Certificate[] = Array.isArray(data.certificate_chain)
      ? data.certificate_chain.map((c: string) => certFromBase64Der(c))
      : [];

    // Pack key + cert + chain into a PKCS#12 file protected by the shared
    // keystore password (config.keystorePassword). No per-cert password storage needed.
    const password = config.keystorePassword;
    const p12Asn1 = forge.pkcs12.toPkcs12Asn1(
      privateKey,
      [leaf, ...chain],
      password,
      { algorithm: "3des", friendlyName: `acct_${dto.serialNumber}` }
    );
    const p12Der = forge.asn1.toDer(p12Asn1).getBytes();

    if (!fs.existsSync(config.keystoreDir)) {
      fs.mkdirSync(config.keystoreDir, { recursive: true });
    }
    const keystorePath = path.join(config.keystoreDir, `${dto.serialNumber}.p12`);
    fs.writeFileSync(keystorePath, Buffer.from(p12Der, "binary"));

    console.log(
      `✅ Enrolled ${username} — cert issued by ${config.ejbca.signingCa} → ${keystorePath}`
    );
    return { keystorePath };
  } catch (error: any) {
    console.error(
      "❌ EJBCA enrollment failed:",
      error?.response?.status,
      error?.response?.data || error?.message
    );
    Sentry.captureException(error, {
      tags: { service: "ejbca", operation: "enroll_via_ejbca" },
      contexts: {
        ejbca: {
          username,
          ca: config.ejbca.signingCa,
          certProfile: config.ejbca.certProfile,
          eeProfile: config.ejbca.eeProfile,
        },
      },
    });
    throw error;
  }
};
