import * as fs from "fs";
import * as path from "path";
import * as forge from "node-forge";
import { config } from "../../config";
import { CertificateDto } from "../../interfaces";

export interface EnrollResult {
  keystorePath: string;
}

const caCertPath = () => path.join(config.caDir, "ca.crt");
const caKeyPath = () => path.join(config.caDir, "ca.key");

function loadCa(): { cert: forge.pki.Certificate; key: forge.pki.rsa.PrivateKey } {
  return {
    cert: forge.pki.certificateFromPem(fs.readFileSync(caCertPath(), "utf8")),
    key: forge.pki.privateKeyFromPem(
      fs.readFileSync(caKeyPath(), "utf8"),
    ) as forge.pki.rsa.PrivateKey,
  };
}

/**
 * Create the local signing CA once. Called at startup on the main thread so
 * two enrollments cannot generate two different roots.
 */
export function ensureLocalCa(): void {
  fs.mkdirSync(config.caDir, { recursive: true });
  if (fs.existsSync(caCertPath()) && fs.existsSync(caKeyPath())) return;

  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10);

  const subject: forge.pki.CertificateField[] = [
    { name: "commonName", value: "GetSign Signing CA" },
    { name: "organizationName", value: "GetSign" },
  ];
  cert.setSubject(subject);
  cert.setIssuer(subject);
  cert.setExtensions([
    { name: "basicConstraints", cA: true, critical: true },
    {
      name: "keyUsage",
      keyCertSign: true,
      cRLSign: true,
      critical: true,
    },
  ]);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  fs.writeFileSync(caKeyPath(), forge.pki.privateKeyToPem(keys.privateKey), {
    mode: 0o600,
  });
  fs.writeFileSync(caCertPath(), forge.pki.certificateToPem(cert));
  console.log(`✅ Created local signing CA at ${caCertPath()}`);
}

export function localCaReady(): boolean {
  return fs.existsSync(caCertPath()) && fs.existsSync(caKeyPath());
}

/**
 * Issue a per-company P12. The private key is generated here and never leaves
 * the file written under {keystoreDir}/{accountId}.p12.
 */
export const enrollLocally = async (dto: CertificateDto): Promise<EnrollResult> => {
  const { cert: caCert, key: caKey } = loadCa();
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = Date.now().toString(16);
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 2);

  const subject: forge.pki.CertificateField[] = [
    { name: "commonName", value: dto.commonName },
  ];
  if (dto.organizationName) {
    subject.push({ name: "organizationName", value: dto.organizationName });
  }
  if (dto.localityName) {
    subject.push({ name: "localityName", value: dto.localityName });
  }
  if (dto.state) subject.push({ shortName: "ST", value: dto.state });
  if (dto.countryName) {
    subject.push({ name: "countryName", value: dto.countryName });
  }

  cert.setSubject(subject);
  cert.setIssuer(caCert.subject.attributes);
  cert.setExtensions([
    { name: "basicConstraints", cA: false },
    {
      name: "keyUsage",
      digitalSignature: true,
      nonRepudiation: true,
      critical: true,
    },
    {
      name: "extKeyUsage",
      emailProtection: true,
    },
  ]);
  cert.sign(caKey, forge.md.sha256.create());

  const password = config.keystorePassword;
  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(
    keys.privateKey,
    [cert, caCert],
    password,
    { algorithm: "3des", friendlyName: `acct_${dto.serialNumber}` },
  );
  const p12Der = forge.asn1.toDer(p12Asn1).getBytes();

  fs.mkdirSync(config.keystoreDir, { recursive: true });
  const keystorePath = path.join(config.keystoreDir, `${dto.serialNumber}.p12`);
  fs.writeFileSync(keystorePath, Buffer.from(p12Der, "binary"), { mode: 0o600 });
  console.log(`✅ Enrolled ${dto.serialNumber} with local CA → ${keystorePath}`);
  return { keystorePath };
};
