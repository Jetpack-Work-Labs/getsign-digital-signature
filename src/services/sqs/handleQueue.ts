import * as fs from "fs";
import * as path from "path";
import * as forge from "node-forge";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { uploadFile } from "../../utils";
import { SignJob } from "../../interfaces";
import { config } from "../../config";
import { enrollInWorker } from "../jobs/pool";
import { enrollmentIdentity } from "../ca/subject";
import { s3 } from "../../utils/aws";
import { BUCKET_NAME } from "../../const";
import { fileName } from "../../utils/path";

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

async function restoreKeystoreFromS3(keystorePath: string): Promise<boolean> {
  const Key = fileName(keystorePath, "p12");
  try {
    const response = await s3.send(
      new GetObjectCommand({ Bucket: BUCKET_NAME, Key }),
    );
    const body = response.Body;
    if (!body) return false;
    const bytes = Buffer.from(await body.transformToByteArray());
    fs.mkdirSync(path.dirname(keystorePath), { recursive: true });
    fs.writeFileSync(keystorePath, bytes, { mode: 0o600 });
    console.log(`✅ Restored keystore from S3 → ${keystorePath}`);
    return true;
  } catch {
    return false;
  }
}

// Provision a company's signing certificate on first encounter.
// Re-enroll when the existing P12 is missing, unreadable, or within 30 days of expiry.
export const HandleQueue = async (job: SignJob): Promise<void> => {
  const { accountId, countryName } = job;
  const keystorePath = path.join(config.keystoreDir, `${accountId}.p12`);

  if (!fs.existsSync(keystorePath)) {
    await restoreKeystoreFromS3(keystorePath);
  }

  if (
    fs.existsSync(keystorePath) &&
    !p12NeedsRenewal(keystorePath, config.keystorePassword)
  ) {
    console.log(`ℹ️  Account ${accountId} already enrolled — skipping`);
    return;
  }

  const identity = enrollmentIdentity(job);
  const { keystorePath: writtenPath } = await enrollInWorker({
    serialNumber: `${accountId}`,
    commonName: identity.commonName,
    countryName: countryName || "",
    state: "",
    localityName: "",
    organizationName: identity.organizationName,
  });

  await uploadFile({ filePath: writtenPath, type: "p12" });
  console.log(`✅ Enrolled account ${accountId} → ${writtenPath}`);
};
