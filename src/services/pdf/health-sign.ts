import * as fs from "fs";
import * as path from "path";
import { PDFDocument } from "pdf-lib";
import { config } from "../../config";
import { ensureLocalCa, enrollLocally, localCaReady } from "../ca/local";
import { signPdf } from "./sign";

/** Not a customer account. The probe keystore is {KEYSTORE_DIR}/health-check.p12. */
export const HEALTH_SIGN_ACCOUNT = "health-check";

/**
 * Sign a tiny PDF with the local CA. Used by GET /health/sign so a monitor
 * notices a broken signer instead of a process that is merely still running.
 */
export async function probeSigning(): Promise<void> {
  ensureLocalCa();
  if (!localCaReady()) {
    throw new Error("Local signing CA is not available");
  }

  const keystorePath = path.join(
    config.keystoreDir,
    `${HEALTH_SIGN_ACCOUNT}.p12`,
  );
  if (!fs.existsSync(keystorePath)) {
    await enrollLocally({
      serialNumber: HEALTH_SIGN_ACCOUNT,
      commonName: "GetSign health check",
      organizationName: "GetSign",
      countryName: "",
      state: "",
      localityName: "",
    });
  }

  const doc = await PDFDocument.create();
  doc.addPage([200, 200]);
  const signed = await signPdf({
    pdfBuffer: Buffer.from(await doc.save()),
    keystorePath,
    keystorePassword: config.keystorePassword,
    watermark: false,
    name: "health-check",
  });
  if (!signed.includes(Buffer.from("/ByteRange"))) {
    throw new Error("Health check signature is missing ByteRange");
  }
}
