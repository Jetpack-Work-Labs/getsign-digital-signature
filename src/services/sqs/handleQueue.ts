import * as fs from "fs";
import * as path from "path";
import { uploadFile } from "../../utils";
import { SignJob } from "../../interfaces";
import { enrollViaEjbca } from "../ejbca/enroll";
import { config } from "../../config";

// Provision a company's signing certificate on first encounter.
// Subsequent jobs for the same account are a no-op (P12 already on disk).
export const HandleQueue = async (job: SignJob): Promise<void> => {
  const { accountId, companyName, userEmail, organizationName, countryName } = job;
  const keystorePath = path.join(config.keystoreDir, `${accountId}.p12`);

  if (fs.existsSync(keystorePath)) {
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

  // Back up the keystore to S3 so it survives a volume loss.
  await uploadFile({ filePath: writtenPath, type: "p12" });
  console.log(`✅ Enrolled account ${accountId} → ${writtenPath}`);
};
