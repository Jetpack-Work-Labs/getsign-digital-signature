import { parentPort, workerData } from "worker_threads";
import * as fs from "fs";
import { signPdf } from "../pdf/sign";
import { enrollLocally } from "../ca/local";
import { CertificateDto } from "../../interfaces";

type SignPayload = {
  kind: "sign";
  inputPath: string;
  outputPath: string;
  keystorePath: string;
  keystorePassword: string;
  watermark: boolean;
  name: string;
};

type EnrollPayload = {
  kind: "enroll";
  dto: CertificateDto;
};

async function run(): Promise<unknown> {
  const payload = workerData as SignPayload | EnrollPayload;
  if (payload.kind === "enroll") {
    return enrollLocally(payload.dto);
  }
  const pdfBuffer = fs.readFileSync(payload.inputPath);
  const signed = await signPdf({
    pdfBuffer,
    keystorePath: payload.keystorePath,
    keystorePassword: payload.keystorePassword,
    watermark: payload.watermark,
    name: payload.name,
  });
  fs.writeFileSync(payload.outputPath, signed);
  return { bytes: signed.length };
}

run()
  .then((result) => parentPort?.postMessage({ ok: true, result }))
  .catch((error: unknown) => {
    parentPort?.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  });
