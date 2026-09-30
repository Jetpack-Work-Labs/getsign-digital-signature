import assert from "node:assert/strict";
import * as fs from "fs";
import * as forge from "node-forge";
import test from "node:test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { config } from "../src/config";
import { ensureLocalCa, enrollLocally } from "../src/services/ca/local";
import { signPdf } from "../src/services/pdf/sign";

async function samplePdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 300]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("Sign me", { x: 40, y: 240, size: 16, font });
  return Buffer.from(await doc.save());
}

test("a local certificate signs a PDF", async () => {
  ensureLocalCa();
  const { keystorePath } = await enrollLocally({
    serialNumber: "unit-sign-account",
    commonName: "Unit Co (qa@example.com)",
    organizationName: "Unit Co",
    countryName: "US",
    state: "",
    localityName: "",
  });

  assert.equal(fs.existsSync(keystorePath), true);
  const p12 = forge.pkcs12.pkcs12FromAsn1(
    forge.asn1.fromDer(fs.readFileSync(keystorePath).toString("binary")),
    config.keystorePassword,
  );
  const bags = p12.getBags({ bagType: forge.pki.oids.certBag })[
    forge.pki.oids.certBag
  ];
  assert.equal(bags?.[0]?.cert?.subject.getField("CN")?.value, "Unit Co (qa@example.com)");

  const signed = await signPdf({
    pdfBuffer: await samplePdf(),
    keystorePath,
    keystorePassword: config.keystorePassword,
    watermark: true,
    name: "unit.pdf",
  });

  const text = signed.toString("latin1");
  assert.equal(text.includes("/ByteRange"), true);
  assert.equal(text.includes("getsign.io/digital-signature"), true);
});
