import { PDFDocument, PDFName, PDFArray, PDFString } from "pdf-lib";
import fs from "fs";
import path from "path";
import { GETSIGN_DIGITAL_SIGNATURE_URL } from "../const";

export function watermarkImagePath(): string {
  return path.resolve(__dirname, "../public/watermark/watermark.png");
}

/** Draw the watermark onto an already loaded document so signing can stay one pass. */
export async function applyWatermark(pdfDoc: PDFDocument): Promise<void> {
  const pages = pdfDoc.getPages();
  const lastPage = pages[pages.length - 1];
  if (!lastPage) {
    throw new Error("PDF has no pages to watermark");
  }

  const pageWidth = lastPage.getWidth();

  const watermarkWidth = 120;
  const watermarkHeight = 60;
  const margin = 10;
  const x = pageWidth - watermarkWidth - margin; // Right side
  const y = margin; // Bottom area

  const imagePath = watermarkImagePath();

  if (!fs.existsSync(imagePath)) {
    console.error(`Watermark image not found at: ${imagePath}`);
    throw new Error(`Watermark image not found at: ${imagePath}`);
  }

  const watermarkImageBytes = fs.readFileSync(imagePath);
  const watermarkImage = await pdfDoc.embedPng(watermarkImageBytes);
  lastPage.drawImage(watermarkImage, {
    x,
    y,
    width: watermarkWidth,
    height: watermarkHeight,
  });

  // Add clickable link annotation
  const linkAnnot = pdfDoc.context.obj({
    Type: "Annot",
    Subtype: "Link",
    Rect: [x, y, x + watermarkWidth, y + watermarkHeight],
    Border: [0, 0, 0], // No border
    A: {
      Type: "Action",
      S: "URI",
      URI: PDFString.of(GETSIGN_DIGITAL_SIGNATURE_URL),
    },
    F: 4, // Print annotation
  });

  // Add annotation to the last page
  const annots = lastPage.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
  if (annots) {
    annots.push(linkAnnot);
  } else {
    const newAnnots = pdfDoc.context.obj([linkAnnot]);
    lastPage.node.set(PDFName.of("Annots"), newAnnots);
  }

}

export async function addWatermarkToPdf(pdfBuffer: Buffer): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  await applyWatermark(pdfDoc);
  return Buffer.from(await pdfDoc.save());
}
