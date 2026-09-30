import express from "express";
import morgan from "morgan";
import { config } from "./config";
import { initializeSentry, Sentry } from "./infrastructure";
import formidable from "formidable";
import * as fs from "fs";
import * as path from "path";
import { localCaReady } from "./services/ca/local";
import {
  releaseSignSlot,
  signInWorker,
  tryAcquireSignSlot,
} from "./services/jobs/pool";
import {
  completeSignJob,
  createSignJob,
  deleteSignJob,
  failSignJob,
  inputPdfPath,
  outputPdfPath,
  readSignJob,
} from "./services/jobs/store";

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const REQUEST_BODY_LIMIT = "50mb";

initializeSentry();

export const app = express();

if (process.env.NODE_ENV !== "test") {
  app.use(morgan("combined"));
}
app.use(express.json({ limit: REQUEST_BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: REQUEST_BODY_LIMIT }));

app.get("/health", (_req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    service: "GetSign Flow Service",
    version: "2.0.0",
    payloadSize: REQUEST_BODY_LIMIT,
  });
});

function authorize(req: express.Request, res: express.Response): boolean {
  if (!config.signApiToken) return true;
  if (req.header("x-sign-token") === config.signApiToken) return true;
  res.status(401).json({ error: "unauthorized" });
  return false;
}

// Kept at the old path so existing monitors do not 404.
app.get("/health/ejbca", (_req, res) => {
  const ready = localCaReady();
  res.status(ready ? 200 : 500).json({
    status: ready ? "OK" : "ERROR",
    timestamp: new Date().toISOString(),
    mode: "local-ca",
  });
});

type ParsedSignRequest = {
  pdf: Buffer;
  accountId: string;
  watermark: boolean;
  filename: string;
};

function parseSignRequest(
  req: express.Request,
): Promise<ParsedSignRequest | { error: string; status: number }> {
  const form = formidable({
    maxFileSize: MAX_UPLOAD_BYTES,
    keepExtensions: true,
    allowEmptyFiles: false,
  });
  return new Promise((resolve) => {
    form.parse(req, (err, fields, files) => {
      if (err) {
        const tooLarge = /maxFileSize|maxTotalFileSize/i.test(err.message);
        resolve({
          error: tooLarge ? "File exceeds 50mb" : "Error parsing FormData",
          status: tooLarge ? 413 : 400,
        });
        return;
      }
      const filePart = files.datafile?.[0];
      const accountId = fields.accountId?.[0] || fields.workerName?.[0];
      if (!filePart) {
        resolve({
          error: "No file uploaded. Please provide a 'datafile' in the FormData",
          status: 400,
        });
        return;
      }
      if (!accountId) {
        resolve({ error: "accountId field is required", status: 400 });
        return;
      }
      const pdf = filePart.filepath
        ? fs.readFileSync(filePart.filepath)
        : Buffer.alloc(0);
      if (!pdf.length) {
        resolve({ error: "No file data found", status: 400 });
        return;
      }
      resolve({
        pdf,
        accountId,
        watermark: fields.watermark?.[0] === "true",
        filename: filePart.originalFilename || "document.pdf",
      });
    });
  });
}

function keystoreFor(accountId: string): string | null {
  const keystorePath = path.join(config.keystoreDir, `${accountId}.p12`);
  return fs.existsSync(keystorePath) ? keystorePath : null;
}

async function runSign(input: {
  inputPath: string;
  outputPath: string;
  keystorePath: string;
  watermark: boolean;
  filename: string;
}): Promise<void> {
  await signInWorker({
    inputPath: input.inputPath,
    outputPath: input.outputPath,
    keystorePath: input.keystorePath,
    keystorePassword: config.keystorePassword,
    watermark: input.watermark,
    name: input.filename,
  });
}

app.get("/signserver/certificates/:accountId", (req, res) => {
  if (!authorize(req, res)) return;
  const accountId = req.params.accountId;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(accountId)) {
    res.status(400).json({ error: "Invalid accountId" });
    return;
  }
  if (!keystoreFor(accountId)) {
    res.status(404).json({ enrolled: false });
    return;
  }
  res.json({ enrolled: true });
});

app.post("/signserver/jobs", async (req, res) => {
  if (!authorize(req, res)) return;
  const parsed = await parseSignRequest(req);
  if ("error" in parsed) {
    res.status(parsed.status).json({ error: parsed.error });
    return;
  }
  const keystorePath = keystoreFor(parsed.accountId);
  if (!keystorePath) {
    res.status(404).json({
      error: `No signing certificate found for account ${parsed.accountId}. Enroll first via SQS.`,
    });
    return;
  }
  if (!tryAcquireSignSlot()) {
    res.status(429).json({ error: "Signing capacity is full" });
    return;
  }
  let jobId: string;
  try {
    jobId = createSignJob(config.jobsDir, parsed.pdf);
  } catch (error) {
    releaseSignSlot();
    throw error;
  }
  res.status(202).json({ jobId, status: "pending" });
  void runSign({
    inputPath: inputPdfPath(config.jobsDir, jobId),
    outputPath: outputPdfPath(config.jobsDir, jobId),
    keystorePath,
    watermark: parsed.watermark,
    filename: parsed.filename,
  })
    .then(() => {
      const signed = fs.readFileSync(outputPdfPath(config.jobsDir, jobId));
      completeSignJob(config.jobsDir, jobId, signed);
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(JSON.stringify({ message: "sign job failed", jobId, error: message }));
      Sentry.captureException(error);
      failSignJob(config.jobsDir, jobId, message);
    })
    .finally(() => releaseSignSlot());
});

app.get("/signserver/jobs/:jobId", (req, res) => {
  if (!authorize(req, res)) return;
  const record = readSignJob(config.jobsDir, req.params.jobId);
  if (!record) {
    res.status(404).json({ error: "Sign job not found" });
    return;
  }
  if (record.status === "running") {
    res.status(202).json({ jobId: req.params.jobId, status: "pending" });
    return;
  }
  if (record.status === "failed") {
    res.status(500).json({ error: "Failed to sign PDF", details: record.error });
    return;
  }
  const output = outputPdfPath(config.jobsDir, req.params.jobId);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", 'attachment; filename="signed-document.pdf"');
  fs.createReadStream(output)
    .on("error", (error) => {
      Sentry.captureException(error);
      if (!res.headersSent) res.status(500).json({ error: "Failed to read signed PDF" });
    })
    .pipe(res)
    .on("finish", () => deleteSignJob(config.jobsDir, req.params.jobId));
});

// Synchronous PDF response. Shares the two-slot pool with the async route.
app.post("/signserver/process", async (req, res) => {
  if (!authorize(req, res)) return;
  const parsed = await parseSignRequest(req);
  if ("error" in parsed) {
    res.status(parsed.status).json({ error: parsed.error });
    return;
  }
  const keystorePath = keystoreFor(parsed.accountId);
  if (!keystorePath) {
    res.status(404).json({
      error: `No signing certificate found for account ${parsed.accountId}. Enroll first via SQS.`,
    });
    return;
  }
  if (!tryAcquireSignSlot()) {
    res.status(429).json({ error: "Signing capacity is full" });
    return;
  }
  const jobId = createSignJob(config.jobsDir, parsed.pdf);
  const output = outputPdfPath(config.jobsDir, jobId);
  try {
    await runSign({
      inputPath: inputPdfPath(config.jobsDir, jobId),
      outputPath: output,
      keystorePath,
      watermark: parsed.watermark,
      filename: parsed.filename,
    });
    const signed = fs.readFileSync(output);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="signed-document.pdf"',
    );
    res.end(signed);
  } catch (error) {
    console.error("Error in sign-pdf endpoint:", error);
    Sentry.captureException(error, {
      tags: { service: "signserver", operation: "sign_pdf" },
    });
    if (!res.headersSent) {
      res.status(500).json({
        error: "Failed to sign PDF",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  } finally {
    deleteSignJob(config.jobsDir, jobId);
    releaseSignSlot();
  }
});

app.use(
  (
    error: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error("Express error:", error);
    res.status(500).json({ error: "Internal server error" });
  },
);
