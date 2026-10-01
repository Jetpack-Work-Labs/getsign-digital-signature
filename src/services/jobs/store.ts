import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";

export type SignJobStatus = "running" | "completed" | "failed";

export interface SignJobRecord {
  status: SignJobStatus;
  error?: string;
  createdAt: number;
}

const JOB_TTL_MS = 60 * 60 * 1000;

function jobDir(root: string, jobId: string): string {
  return path.join(root, jobId);
}

function statusPath(root: string, jobId: string): string {
  return path.join(jobDir(root, jobId), "status.json");
}

export function readSignJob(root: string, jobId: string): SignJobRecord | null {
  const file = statusPath(root, jobId);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8")) as SignJobRecord;
}

function writeStatus(root: string, jobId: string, record: SignJobRecord): void {
  fs.writeFileSync(statusPath(root, jobId), JSON.stringify(record));
}

export function createSignJob(root: string, pdf: Buffer): string {
  fs.mkdirSync(root, { recursive: true });
  const jobId = randomUUID();
  const dir = jobDir(root, jobId);
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, "input.pdf"), pdf);
  writeStatus(root, jobId, { status: "running", createdAt: Date.now() });
  return jobId;
}

export function inputPdfPath(root: string, jobId: string): string {
  return path.join(jobDir(root, jobId), "input.pdf");
}

export function outputPdfPath(root: string, jobId: string): string {
  return path.join(jobDir(root, jobId), "output.pdf");
}

export function completeSignJob(root: string, jobId: string, signed: Buffer): void {
  fs.writeFileSync(outputPdfPath(root, jobId), signed);
  const current = readSignJob(root, jobId);
  writeStatus(root, jobId, {
    status: "completed",
    createdAt: current?.createdAt ?? Date.now(),
  });
  const input = inputPdfPath(root, jobId);
  if (fs.existsSync(input)) fs.unlinkSync(input);
}

export function failSignJob(root: string, jobId: string, error: string): void {
  const current = readSignJob(root, jobId);
  if (!current) return;
  writeStatus(root, jobId, {
    status: "failed",
    error,
    createdAt: current.createdAt,
  });
}

export function deleteSignJob(root: string, jobId: string): void {
  fs.rmSync(jobDir(root, jobId), { recursive: true, force: true });
}

/** Drop jobs a restart interrupted, and anything older than an hour. */
export function recoverSignJobs(root: string): void {
  if (!fs.existsSync(root)) return;
  const now = Date.now();
  for (const jobId of fs.readdirSync(root)) {
    const record = readSignJob(root, jobId);
    if (!record || record.status === "running" || now - record.createdAt > JOB_TTL_MS) {
      deleteSignJob(root, jobId);
    }
  }
}
