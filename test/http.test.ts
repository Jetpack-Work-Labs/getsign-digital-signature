import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import test from "node:test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { app } from "../src/app";
import { config } from "../src/config";
import { ensureLocalCa, enrollLocally } from "../src/services/ca/local";
import { releaseSignSlot, tryAcquireSignSlot } from "../src/services/jobs/pool";

async function samplePdf(): Promise<Blob> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 300]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("HTTP sign", { x: 40, y: 240, size: 16, font });
  return new Blob([Buffer.from(await doc.save())], { type: "application/pdf" });
}

async function start(): Promise<{ server: Server; base: string }> {
  const server = app.listen(0);
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  return { server, base: `http://127.0.0.1:${port}` };
}

test("sign routes accept a job, return the PDF, and reject overflow", async () => {
  ensureLocalCa();
  await enrollLocally({
    serialNumber: "http-account",
    commonName: "HTTP Co (qa@example.com)",
    organizationName: "HTTP Co",
    countryName: "US",
    state: "",
    localityName: "",
  });

  const { server, base } = await start();
  const headers = { "x-sign-token": config.signApiToken };
  try {
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);

    const signing = await fetch(`${base}/health/sign`);
    assert.equal(signing.status, 200);
    assert.equal((await signing.json()).signed, true);

    const enrolled = await fetch(`${base}/signserver/certificates/http-account`, {
      headers,
    });
    assert.equal(enrolled.status, 200);
    assert.equal((await enrolled.json()).enrolled, true);

    const notEnrolled = await fetch(
      `${base}/signserver/certificates/missing-account`,
      { headers },
    );
    assert.equal(notEnrolled.status, 404);

    const badId = await fetch(
      `${base}/signserver/certificates/${encodeURIComponent("bad id")}`,
      { headers },
    );
    assert.equal(badId.status, 400);

    const ca = await fetch(`${base}/health/ejbca`);
    assert.equal(ca.status, 200);
    assert.equal((await ca.json()).mode, "local-ca");

    const pdf = await samplePdf();
    const denied = new FormData();
    denied.append("accountId", "http-account");
    denied.append("datafile", pdf, "doc.pdf");
    const unauthorized = await fetch(`${base}/signserver/jobs`, {
      method: "POST",
      body: denied,
    });
    assert.equal(unauthorized.status, 401);

    const missing = new FormData();
    missing.append("workerName", "missing-account");
    missing.append("datafile", pdf, "doc.pdf");
    const notFound = await fetch(`${base}/signserver/jobs`, {
      method: "POST",
      headers,
      body: missing,
    });
    assert.equal(notFound.status, 404);

    assert.equal(tryAcquireSignSlot(), true);
    assert.equal(tryAcquireSignSlot(), true);
    const blocked = new FormData();
    blocked.append("accountId", "http-account");
    blocked.append("datafile", pdf, "doc.pdf");
    const full = await fetch(`${base}/signserver/jobs`, {
      method: "POST",
      headers,
      body: blocked,
    });
    assert.equal(full.status, 429);
    releaseSignSlot();
    releaseSignSlot();

    const form = new FormData();
    form.append("accountId", "http-account");
    form.append("watermark", "false");
    form.append("datafile", pdf, "doc.pdf");
    const accepted = await fetch(`${base}/signserver/jobs`, {
      method: "POST",
      headers,
      body: form,
    });
    assert.equal(accepted.status, 202);
    const { jobId } = (await accepted.json()) as { jobId: string };

    let signed: Buffer | undefined;
    for (let attempt = 0; attempt < 20; attempt++) {
      const polled = await fetch(`${base}/signserver/jobs/${jobId}`, { headers });
      if (polled.status === 202) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        continue;
      }
      assert.equal(polled.status, 200);
      signed = Buffer.from(await polled.arrayBuffer());
      break;
    }
    assert.ok(signed);
    assert.equal(signed.toString("latin1").includes("/ByteRange"), true);

    const syncForm = new FormData();
    syncForm.append("workerName", "http-account");
    syncForm.append("datafile", pdf, "doc.pdf");
    const sync = await fetch(`${base}/signserver/process`, {
      method: "POST",
      headers,
      body: syncForm,
    });
    assert.equal(sync.status, 200);
    const syncPdf = Buffer.from(await sync.arrayBuffer());
    assert.equal(syncPdf.toString("latin1").includes("/ByteRange"), true);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
