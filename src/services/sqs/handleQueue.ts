import * as fs from "fs";
import * as path from "path";
import * as forge from "node-forge";
import { uploadFile } from "../../utils";
import { SignJob } from "../../interfaces";
import { enrollViaEjbca } from "../ejbca/enroll";
import { config } from "../../config";

const RENEW_BEFORE_MS = 30 * 24 * 60 * 60 * 1000;

function p12NeedsRenewal(filePath: string, password: string): boolean {
  if (!fs.existsSync(filePath)) {
    return true;
  }
  try {
    const p12 = forge.pkcs12.pkcs12FromAsn1(
      forge.asn1.fromDer(fs.readFileSync(filePath).toString("binary")),
      password
    );
    const bags = p12.getBags({ bagType: forge.pki.oids.certBag })[
      forge.pki.oids.certBag
    ];
    const until = bags?.[0]?.cert?.validity.notAfter;
    if (!until) {
      return true;
    }
    return until.getTime() - Date.now() < RENEW_BEFORE_MS;
  } catch {
    return true;
  }
}

// Provision a company's signing certificate on first encounter.
// Re-enroll when the existing P12 is missing, unreadable, or within 30 days of expiry.
export const HandleQueue = async (job: SignJob): Promise<void> => {
  const { accountId, companyName, userEmail, organizationName, countryName } = job;
  const keystorePath = path.join(config.keystoreDir, `${accountId}.p12`);

  if (
    fs.existsSync(keystorePath) &&
    !p12NeedsRenewal(keystorePath, config.keystorePassword)
  ) {
    console.log(`ℹ️  Account ${accountId} already enrolled — skipping`);
    return;
  }

  const { keystorePath: writtenPath } = await enrollViaEjbca({
    serialNumber: `${accountId}`,
    commonName: `${companyName} (${userEmail})`,
    countryName: countryName || "",
    state: "",
    localityName: "",
    organizationName: organizationName || "",
  });

  await uploadFile({ filePath: writtenPath, type: "p12" });
  console.log(`✅ Enrolled account ${accountId} → ${writtenPath}`);
};
