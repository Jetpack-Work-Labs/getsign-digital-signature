import express from "express";
import morgan from "morgan";
import { HandleQueue, pollAndProcessJobs } from "./services/sqs";
import { config } from "./config";
import { initializeSentry, Sentry } from "./infrastructure";
import { signPdf } from "./services/pdf/sign";
import { addWatermarkToPdf } from "./utils/watermark";
import { fixPdfForSignServer } from "./utils/pdf-fix";
import formidable from "formidable";
import * as fs from "fs";
import * as path from "path";

// Initialize Sentry before anything else
initializeSentry();

const app = express();
const PORT = 9999;
const REQUEST_BODY_LIMIT = "50mb";

// No additional middleware needed - Sentry auto-instruments Express

app.use(morgan("combined"));
app.use(express.json({ limit: REQUEST_BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: REQUEST_BODY_LIMIT }));

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    service: "GetSign Flow Service",
    version: "2.0.0",
    payloadSize: REQUEST_BODY_LIMIT,
  });
});

// EJBCA health check
app.get("/health/ejbca", async (req, res) => {
  try {
    const axios = require("axios");
    const https = require("https");
    const fs = require("fs");
    const agent = new https.Agent({
      pfx: fs.readFileSync(config.ejbca.adminP12),
      passphrase: config.ejbca.adminPassphrase,
      rejectUnauthorized: false,
    });
    const { data } = await axios.get(`${config.ejbca.restBase}/ca`, {
      httpsAgent: agent,
      headers: { "X-Keyfactor-Requested-With": "XMLHttpRequest" },
      timeout: 5000,
    });
    res.json({ status: "OK", timestamp: new Date().toISOString(), cas: data });
  } catch (error) {
    res.status(500).json({
      status: "ERROR",
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// PDF signing endpoint - handles FormData with formidable
app.post("/signserver/process", async (req, res) => {
  try {
    console.log("Processing PDF signing request");
    const form = formidable({
      maxFileSize: Infinity,
      keepExtensions: true,
      allowEmptyFiles: false,
    });
    form.parse(req, async (err, fields, files) => {
      if (err) {
        console.error("Error parsing FormData:", err);
        Sentry.captureException(err, {
          tags: {
            service: "signserver",
            operation: "parse_formdata",
          },
        });
        res
          .status(400)
          .json({ error: "Error parsing FormData", details: err.message });
        return;
      }

      try {
        const filePart = files.datafile?.[0];
        const watermark = fields.watermark?.[0];
        const accountId = fields.accountId?.[0];

        console.log({ accountId });
        if (!filePart) {
          res.status(400).json({
            error: "No file uploaded. Please provide a 'datafile' in the FormData",
          });
          return;
        }
        if (!accountId) {
          res.status(400).json({ error: "accountId field is required" });
          return;
        }

        // Derive the keystore path from accountId — no DB lookup needed.
        const keystorePath = path.join(config.keystoreDir, `${accountId}.p12`);
        if (!fs.existsSync(keystorePath)) {
          res.status(404).json({ error: `No signing certificate found for account ${accountId}. Enroll first via SQS.` });
          return;
        }

        const shouldAddWatermark = watermark === "true";

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          'attachment; filename="signed-document.pdf"',
        );

        let processedPdfBuffer: Buffer;

        if ((filePart as any).buffer) {
          processedPdfBuffer = (filePart as any).buffer;
        } else if (filePart.filepath) {
          processedPdfBuffer = require("fs").readFileSync(filePart.filepath);
        } else {
          throw new Error("No file data found");
        }

        // Step 1: Fix PDF metadata first (creates a new doc via copyPages, which strips annotations)
        try {
          processedPdfBuffer = await fixPdfForSignServer(processedPdfBuffer);
        } catch (fixError) {
          console.warn(
            "Could not fix PDF metadata, proceeding with original:",
            fixError,
          );
          Sentry.captureException(fixError, {
            tags: {
              service: "signserver",
              operation: "fix_pdf_metadata",
            },
            level: "warning",
            contexts: {
              file: {
                filename: filePart.originalFilename,
                accountId,
              },
            },
          });
        }

        // Step 2: Add watermark after metadata fix so the image and annotations survive
        if (shouldAddWatermark) {
          processedPdfBuffer = await addWatermarkToPdf(processedPdfBuffer);
        }

        // Step 3: Digitally sign locally using the company's EJBCA-issued cert.
        const signedBuffer = await signPdf({
          pdfBuffer: processedPdfBuffer,
          keystorePath,
          keystorePassword: config.keystorePassword,
          name: filePart.originalFilename || "document.pdf",
        });
        res.end(signedBuffer);
      } catch (parseError) {
        console.error("Error processing request:", parseError);
        Sentry.captureException(parseError, {
          tags: {
            service: "signserver",
            operation: "process_request",
          },
        });
        res.status(400).json({
          error: "Error processing request",
          details:
            parseError instanceof Error
              ? parseError.message
              : "Unknown parsing error",
        });
      }
    });
  } catch (error) {
    console.error("Error in sign-pdf endpoint:", error);
    Sentry.captureException(error, {
      tags: {
        service: "signserver",
        operation: "sign_pdf",
      },
    });
    res.status(500).json({
      error: "Failed to sign PDF",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Sentry error handler is already set up via setupExpressErrorHandler

app.use(
  (
    error: any,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    console.error("Express error:", error);
    res.status(500).json({ error: "Internal server error" });
  },
);

// Initialize the application
const initializeApp = async () => {
  try {
    // Start SQS polling
    pollAndProcessJobs(HandleQueue);
    console.log("✅ SQS polling started");

    // Start the server
    app.listen(PORT, () => {
      console.log(`✅ Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("❌ Failed to initialize application:", error);
    process.exit(1);
  }
};

// Initialize the app
initializeApp();
