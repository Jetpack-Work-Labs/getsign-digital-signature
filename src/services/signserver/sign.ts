import axios from "axios";
import FormData from "form-data";
import https from "https";
import { Readable } from "stream";
import { SIGN_SERVER_URL } from "../../const";
import { Sentry } from "../../infrastructure";

export async function signPDFStream({
  inputStream,
  outputStream,
  WORKER_NAME,
  filename = "document.pdf",
}: {
  inputStream: Readable;
  outputStream: NodeJS.WritableStream;
  WORKER_NAME: string;
  filename?: string;
}): Promise<void> {
  const startedAt = Date.now();
  try {
    const form = new FormData();

    console.log(
      JSON.stringify({
        message: "signPDFStream - calling SignServer",
        worker: WORKER_NAME,
        filename,
      }),
    );
    form.append("workerName", WORKER_NAME);
    form.append("datafile", inputStream, {
      filename,
      contentType: "application/pdf",
    });

    // Stream the response directly to the output stream
    const response = await axios.post(SIGN_SERVER_URL, form, {
      headers: {
        ...form.getHeaders(),
      },
      responseType: "stream",
      httpsAgent: new https.Agent({
        rejectUnauthorized: false, // Only for testing, enable in production
      }),
    });
    console.log(
      JSON.stringify({
        message: "signPDFStream - SignServer headers received",
        worker: WORKER_NAME,
        filename,
        status: response.status,
        durationMs: Date.now() - startedAt,
      }),
    );
    response.data.on("end", () => {
      console.log(
        JSON.stringify({
          message: "signPDFStream - SignServer stream ended",
          worker: WORKER_NAME,
          filename,
          durationMs: Date.now() - startedAt,
        }),
      );
    });
    response.data.on("error", (streamErr: Error) => {
      console.error(
        JSON.stringify({
          message: "signPDFStream - SignServer stream error",
          worker: WORKER_NAME,
          filename,
          durationMs: Date.now() - startedAt,
          error: streamErr.message,
        }),
      );
    });
    outputStream.on("finish", () => {
      console.log(
        JSON.stringify({
          message: "signPDFStream - output stream finished",
          worker: WORKER_NAME,
          filename,
          durationMs: Date.now() - startedAt,
        }),
      );
    });
    response.data.pipe(outputStream);
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    if (err instanceof Error) {
      console.error(
        JSON.stringify({
          message: "signPDFStream - SignServer request failed",
          worker: WORKER_NAME,
          filename,
          durationMs,
          error: err.message,
        }),
      );
    } else {
      console.error("❌ Unknown error signing PDF stream");
    }
    
    // Capture error in Sentry with context
    Sentry.captureException(err, {
      tags: {
        service: "signserver",
        operation: "sign_pdf_stream",
        worker: WORKER_NAME,
      },
      contexts: {
        signserver: {
          url: SIGN_SERVER_URL,
          worker: WORKER_NAME,
          filename,
        },
      },
    });
    
    throw err;
  }
}
