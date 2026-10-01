import * as fs from "fs";
import * as path from "path";
import { Worker } from "worker_threads";
import { CertificateDto } from "../../interfaces";
import { EnrollResult } from "../ca/local";

export const MAX_CONCURRENT_SIGNS = 2;

let running = 0;
const waiters: Array<() => void> = [];

function release(): void {
  running -= 1;
  const next = waiters.shift();
  if (next) next();
}

/** Take a slot immediately. HTTP callers use this so a third request can 429. */
export function tryAcquireSignSlot(): boolean {
  if (running >= MAX_CONCURRENT_SIGNS) return false;
  running += 1;
  return true;
}

export function releaseSignSlot(): void {
  release();
}

/** Wait until a slot is free. Enrollment uses this; it is not on the HTTP path. */
function acquireSignSlot(): Promise<void> {
  if (running < MAX_CONCURRENT_SIGNS) {
    running += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    waiters.push(() => {
      running += 1;
      resolve();
    });
  });
}

function workerFilename(): { filename: string; execArgv: string[] } {
  const js = path.join(__dirname, "sign-thread.js");
  if (fs.existsSync(js)) {
    return { filename: js, execArgv: [] };
  }
  return {
    filename: path.join(__dirname, "sign-thread.ts"),
    execArgv: ["-r", "ts-node/register/transpile-only"],
  };
}

function runWorker<T>(workerData: unknown): Promise<T> {
  const { filename, execArgv } = workerFilename();
  return new Promise((resolve, reject) => {
    let settled = false;
    const worker = new Worker(filename, { workerData, execArgv });
    const finish = (error?: Error, value?: T) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve(value as T);
    };
    worker.on("message", (message: { ok: boolean; result?: T; error?: string }) => {
      if (message.ok) finish(undefined, message.result);
      else finish(new Error(message.error || "sign worker failed"));
    });
    worker.on("error", (error) => finish(error));
    worker.on("exit", (code) => {
      if (settled) return;
      finish(
        new Error(
          code === 0
            ? "sign worker exited without a result"
            : `sign worker exited with code ${code}`,
        ),
      );
    });
  });
}

export function signInWorker(input: {
  inputPath: string;
  outputPath: string;
  keystorePath: string;
  keystorePassword: string;
  watermark: boolean;
  name: string;
}): Promise<{ bytes: number }> {
  return runWorker<{ bytes: number }>({ kind: "sign", ...input });
}

export async function enrollInWorker(dto: CertificateDto): Promise<EnrollResult> {
  await acquireSignSlot();
  try {
    return await runWorker<EnrollResult>({ kind: "enroll", dto });
  } finally {
    release();
  }
}
