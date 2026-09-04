import express from "express";
import morgan from "morgan";
import { HandleQueue, pollAndProcessJobs } from "./services/sqs";
import { config } from "./config";
import { connectDB, initializeSentry, Sentry } from "./infrastructure";
import { signPDFStream } from "./services/signserver/sign";
import { Readable } from "stream";
import { addWatermarkToPdf } from "./utils/watermark";
import { fixPdfForSignServer } from "./utils/pdf-fix";
import formidable from "formidable";

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

// SignServer health check endpoint
app.get("/health/signserver", async (req, res) => {
  try {
    const { exec } = require("child_process");
    const util = require("util");
    const execAsync = util.promisify(exec);

    const { stdout } = await execAsync(
      "docker exec signserver /opt/keyfactor/signserver/bin/signserver getstatus complete 62823351",
    );

    res.json({
      status: "OK",
      timestamp: new Date().toISOString(),
      service: "SignServer",
      workerStatus: stdout,
    });
  } catch (error) {
    Sentry.captureException(error, {
      tags: {
        service: "signserver",
        operation: "health_check",
      },
      contexts: {
        signserver: {
          endpoint: "/health/signserver",
        },
      },
    });
    res.status(500).json({
      status: "ERROR",
      timestamp: new Date().toISOString(),
      service: "SignServer",
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
        const workerName = fields.workerName?.[0];
        const watermark = fields.watermark?.[0];

        console.log({ workerName });
        if (!filePart) {
          res.status(400).json({
            error:
              "No file uploaded. Please provide a 'datafile' in the FormData",
          });
          return;
        }

        if (!workerName) {
          res.status(400).json({ error: "workerName field is required" });
          return;
        }

        const shouldAddWatermark = watermark === "true";
        const processStartedAt = Date.now();

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

        console.log(
          JSON.stringify({
            message: "POST /process - digital sign start",
            workerName,
            filename: filePart.originalFilename,
            watermark: shouldAddWatermark,
            inputBytes: processedPdfBuffer.length,
          }),
        );

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
                workerName,
              },
            },
          });
        }

        // Step 2: Add watermark after metadata fix so the image and annotations survive
        if (shouldAddWatermark) {
          processedPdfBuffer = await addWatermarkToPdf(processedPdfBuffer);
        }

        const fileStream = new Readable();
        fileStream.push(processedPdfBuffer);
        fileStream.push(null); // End the stream

        // Step 3: Digitally sign the PDF
        await signPDFStream({
          inputStream: fileStream,
          outputStream: res,
          WORKER_NAME: workerName,
          filename: filePart.originalFilename || "document.pdf",
        });
        console.log(
          JSON.stringify({
            message: "POST /process - digital sign handler returned",
            workerName,
            filename: filePart.originalFilename,
            durationMs: Date.now() - processStartedAt,
          }),
        );
      } catch (parseError) {
        console.error(
          JSON.stringify({
            message: "POST /process - digital sign failed",
            workerName: fields.workerName?.[0],
            filename: files.datafile?.[0]?.originalFilename,
            error:
              parseError instanceof Error
                ? parseError.message
                : String(parseError),
          }),
        );
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
    // Connect to database
    await connectDB(config.db);
    console.log("✅ Database connected successfully");

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
