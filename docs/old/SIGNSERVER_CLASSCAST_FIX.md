# SignServer ClassCastException Fix

## Problem

The SignServer CE 7.1.1 is experiencing a `ClassCastException` when processing PDFs:

```
java.lang.ClassCastException: class com.lowagie.text.pdf.PdfDictionary cannot be cast to class com.lowagie.text.pdf.PRIndirectReference
```

This error occurs in the `PDFSigner.modifyProducer()` method at line 1289 when trying to modify PDF metadata.

## Root Cause

The issue is caused by incompatibility between the iText PDF library versions used in SignServer CE 7.1.1. The PDFSigner tries to modify the producer metadata but encounters incompatible PDF object types.

## Solutions Implemented

### 1. PDF Metadata Pre-processing

Before sending PDFs to SignServer, we now fix the PDF metadata structure:

```typescript
// src/utils/pdf-fix.ts
export async function fixPdfForSignServer(pdfBuffer: Buffer): Promise<Buffer> {
  // Creates a new PDF with clean metadata to prevent ClassCastException
  const newPdfDoc = await PDFDocument.create();
  const pages = await newPdfDoc.copyPages(pdfDoc, pdfDoc.getPageIndices());
  pages.forEach((page) => newPdfDoc.addPage(page));

  // Set clean metadata
  newPdfDoc.setTitle("Document");
  newPdfDoc.setAuthor("GetSign");
  newPdfDoc.setSubject("Digitally Signed Document");
  newPdfDoc.setCreator("GetSign Digital Signature Service");
  newPdfDoc.setProducer("GetSign PDF Signer");

  return Buffer.from(await newPdfDoc.save());
}
```

### 2. SignServer Worker Configuration

Updated worker configurations to disable problematic metadata modifications:

```bash
# Disable metadata modification properties
MODIFY_PRODUCER=false
PRESERVE_PDF_METADATA=true
DISABLE_METADATA_MODIFICATION=true
```

### 3. Automatic Worker Updates

Added automatic worker updates on application startup:

```typescript
// src/utils/worker.ts
export async function updateExistingWorkersWithFix() {
  // Updates existing workers with metadata preservation properties
}
```

## Implementation

### Files Modified:

1. `src/utils/pdf-fix.ts` - PDF metadata fixing utility
2. `src/utils/worker.ts` - Worker creation and update functions
3. `src/services/signserver/index.ts` - SignServer initialization
4. `src/index.ts` - Main application with PDF pre-processing

### Usage:

The fix is automatically applied:

1. On application startup - existing workers are updated
2. During PDF processing - PDFs are pre-processed before signing
3. For new workers - proper configuration is applied during creation

## Testing

To test the fix:

1. Start the application:

```bash
npm start
```

2. Check worker status:

```bash
curl http://localhost:9999/health/signserver
```

3. Test PDF signing:

```bash
curl -X POST http://localhost:9999/signserver/process \
  -F "workerName=62823351" \
  -F "datafile=@test.pdf"
```

## Alternative Solutions

If the above doesn't work, consider:

1. **Upgrade SignServer**: Wait for a newer version that fixes this issue
2. **Use Different PDF Library**: Implement custom PDF signing without SignServer
3. **PDF Pre-processing**: Strip all metadata before sending to SignServer
4. **Custom PDFSigner**: Create a custom PDFSigner implementation

## Monitoring

Monitor the application logs for:

- "PDF metadata fixed for SignServer compatibility" - Success
- "Could not fix PDF metadata" - Warning, but continues
- ClassCastException errors - Should be eliminated

## Notes

- This is a workaround for a known SignServer CE 7.1.1 issue
- The fix preserves PDF content while making metadata compatible
- All existing functionality (watermarks, signing) remains intact
- The solution is backward compatible
