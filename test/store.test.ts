import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import test from "node:test";
import {
  completeSignJob,
  createSignJob,
  readSignJob,
  recoverSignJobs,
} from "../src/services/jobs/store";

test("a restart drops an in-flight sign job", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sign-jobs-"));
  const jobId = createSignJob(root, Buffer.from("%PDF-1.7"));
  assert.equal(readSignJob(root, jobId)?.status, "running");

  recoverSignJobs(root);

  assert.equal(readSignJob(root, jobId), null);
  assert.equal(fs.existsSync(path.join(root, jobId)), false);
});

test("a completed job is readable until it expires", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sign-jobs-"));
  const jobId = createSignJob(root, Buffer.from("%PDF-1.7"));
  completeSignJob(root, jobId, Buffer.from("%PDF-signed"));

  const record = readSignJob(root, jobId);
  assert.equal(record?.status, "completed");
  assert.equal(
    fs.readFileSync(path.join(root, jobId, "output.pdf")).toString(),
    "%PDF-signed",
  );

  recoverSignJobs(root);
  assert.equal(readSignJob(root, jobId)?.status, "completed");
});
