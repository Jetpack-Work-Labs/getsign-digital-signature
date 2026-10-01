# GetSign Digital Signature Service — Integration Guide

The service has two operations: **enroll** (provision a signing identity for a company) and **sign** (digitally sign a PDF). Enroll happens once per company via an SQS job; signing happens on demand via HTTP.

---

## Enroll a company

Send a message to the SQS queue. The service picks it up, calls EJBCA to issue a certificate in the company's name, and saves the signing keystore. This is idempotent — subsequent jobs for the same `accountId` are ignored.

**Queue URL (staging):**
```
https://sqs.us-east-1.amazonaws.com/239505812368/getsign-staging-signing-jobs
```

**Message body (JSON):**
```json
{
  "accountId": "12345",
  "companyName": "Acme Inc",
  "userEmail": "admin@acme.com",
  "organizationName": "Acme Inc",
  "countryName": "EU"
}
```

| Field | Required | Notes |
|---|---|---|
| `accountId` | ✅ | Unique identifier for the company. Used as the filename: `/keystores/{accountId}.p12` |
| `companyName` | ✅ | Appears as `CN` in the signing certificate |
| `userEmail` | ✅ | Included in the certificate common name: `CN=Acme Inc (admin@acme.com)` |
| `organizationName` | ✅ | Appears as `O` in the certificate |
| `countryName` | ❌ | Optional. ISO 3166-1 alpha-2 code (e.g. `IE`, `DE`) |

**AWS SDK example (Node.js):**
```typescript
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

const sqs = new SQSClient({ region: "us-east-1" });

await sqs.send(new SendMessageCommand({
  QueueUrl: "https://sqs.us-east-1.amazonaws.com/239505812368/getsign-staging-signing-jobs",
  MessageBody: JSON.stringify({
    accountId: "12345",
    companyName: "Acme Inc",
    userEmail: "admin@acme.com",
    organizationName: "Acme Inc",
    countryName: "EU",
  }),
}));
```

**Enrollment takes ~10–15 seconds** (RSA key generation + EJBCA certificate issuance). The signing endpoint returns 404 until enrollment is complete.

---

## Sign a PDF

```
POST /signserver/process
Host: <server>:9999
Content-Type: multipart/form-data
```

**Form fields:**

| Field | Required | Description |
|---|---|---|
| `datafile` | ✅ | The PDF file to sign |
| `accountId` | ✅ | Must match the `accountId` used during enrollment |
| `watermark` | ❌ | `"true"` to embed the GetSign watermark image. Default: no watermark |

**Response:** The signed PDF binary (`Content-Type: application/pdf`, `Content-Disposition: attachment; filename="signed-document.pdf"`).

**curl example:**
```bash
curl -X POST http://<server>:9999/signserver/process \
  -F "accountId=12345" \
  -F "datafile=@contract.pdf;type=application/pdf" \
  -F "watermark=false" \
  -o signed-contract.pdf
```

**Node.js example (form-data):**
```typescript
import FormData from "form-data";
import axios from "axios";
import fs from "fs";

const form = new FormData();
form.append("accountId", "12345");
form.append("datafile", fs.createReadStream("contract.pdf"), {
  filename: "contract.pdf",
  contentType: "application/pdf",
});
form.append("watermark", "false");

const response = await axios.post(
  "http://<server>:9999/signserver/process",
  form,
  {
    headers: form.getHeaders(),
    responseType: "arraybuffer",
  }
);

fs.writeFileSync("signed-contract.pdf", response.data);
```

**Error responses:**

| HTTP | Meaning |
|---|---|
| `404` | No signing cert found for this `accountId` — enroll first |
| `400` | Missing `accountId` or `datafile`, or malformed PDF |
| `500` | Signing failed (check server logs) |

---

## Health checks

```
GET /health          → { status: "OK", service: "GetSign Flow Service", ... }
GET /health/ejbca    → { status: "OK", cas: ["ManagementCA", "GetSign Signing CA"] }
```

---

## What the signature looks like

The service produces a **PAdES** (PDF Advanced Electronic Signature) — a standard digital signature embedded in the PDF according to ISO 32000. Each signature contains:

- The signer's **X.509 certificate** (`CN=Acme Inc, O=Acme Inc, Issuer=GetSign Signing CA`)
- The **certificate chain** up to GetSign Signing CA
- A **cryptographic hash** of the signed PDF bytes (tamper-evident)
- A **timestamp** of when the signature was applied

Opening the signed PDF in Adobe Acrobat → Signature Panel shows all of this. The signature will show as "signature validity unknown" until the GetSign Signing CA root certificate is trusted by the viewer — this is expected for a private CA (see `ManagementCA.pem` on the server for the root cert to distribute if needed).

---

## Sequence diagram

```
Caller                  SQS                  GetSign Service          EJBCA
  |                      |                        |                     |
  |--- enroll job ------>|                        |                     |
  |                      |--- dequeue ----------->|                     |
  |                      |                        |--- generate RSA --->|
  |                      |                        |--- CSR pkcs10 ----->|
  |                      |                        |<-- signed cert -----|
  |                      |                        |--- save .p12 ------>|
  |                      |                        |                     |
  |--- POST /signserver/process ----------------->|                     |
  |    (accountId + PDF)                          |                     |
  |                      |                        |--- fix PDF          |
  |                      |                        |--- add watermark    |
  |                      |                        |--- @signpdf/signpdf |
  |<-- signed PDF --------------------------------|                     |
```
