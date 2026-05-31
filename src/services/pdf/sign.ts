import * as fs from "fs";
import { PDFDocument } from "pdf-lib";
import { SignPdf } from "@signpdf/signpdf";
import { P12Signer } from "@signpdf/signer-p12";
import { pdflibAddPlaceholder } from "@signpdf/placeholder-pdf-lib";
import { Sentry } from "../../infrastructure";

const signer = new SignPdf();

/**
 * Digitally sign a PDF buffer using the company's EJBCA-issued PKCS#12
 * keystore. Produces a PAdES-compatible CMS signature (eIDAS AdES).
 *
 * Flow:
 *  1. Add a signature placeholder (ByteRange + /Contents) via pdf-lib.
 *  2. @signpdf/signpdf computes the hash of everything outside /Contents,
 *     hands it to P12Signer which builds a PKCS#7 CMS signature using the
 *     company's key+cert, and writes it into the placeholder.
 */
export const signPdf = async ({
  pdfBuffer,
  keystorePath,
  keystorePassword,
  reason = "Signed via GetSign",
  contactInfo = "",
  name = "",
  location = "",
}: {
  pdfBuffer: Buffer;
  keystorePath: string;
  keystorePassword: string;
  reason?: string;
  contactInfo?: string;
  name?: string;
  location?: string;
}): Promise<Buffer> => {
  try {
    // Step 1: add signature placeholder with pdf-lib.
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    await pdflibAddPlaceholder({
      pdfDoc,
      reason,
      contactInfo,
      name,
      location,
      // 8192 bytes is enough for a typical PKCS#7 with cert chain.
      signatureLength: 8192,
    });
    const pdfWithPlaceholder = Buffer.from(await pdfDoc.save({ useObjectStreams: false }));

    // Step 2: sign the placeholder with the company's P12.
    const p12Buffer = fs.readFileSync(keystorePath);
    const p12Signer = new P12Signer(p12Buffer, { passphrase: keystorePassword });
    const signedPdf = await signer.sign(pdfWithPlaceholder, p12Signer);

    return Buffer.from(signedPdf);
  } catch (error) {
    Sentry.captureException(error, {
      tags: { service: "pdf", operation: "sign_pdf" },
      contexts: { pdf: { keystorePath } },
    });
    throw error;
  }
};
