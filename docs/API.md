# API

Base URL: `http://<host>:9999`

When `SIGN_API_TOKEN` is set, sign routes require header `x-sign-token`. Health routes do not.

## GET /health

`200` with `{ "status": "OK", "service": "GetSign Flow Service", "version": "2.0.0" }`.

## GET /health/ejbca

Reports whether the local CA files exist. The path is unchanged so older monitors keep working. It does not call EJBCA.

`200` `{ "status": "OK", "mode": "local-ca" }` when `CA_DIR/ca.crt` and `ca.key` exist. `500` otherwise.

## GET /signserver/certificates/:accountId

`200` `{ "enrolled": true }` when `{KEYSTORE_DIR}/{accountId}.p12` exists. `404` `{ "enrolled": false }` when it does not. `400` when `accountId` is not letters, digits, `_`, or `-`. This is how the backend waits for enrollment without a SignServer worker id.

## POST /signserver/jobs

Accepts a PDF and returns immediately.

`multipart/form-data` fields:

| Field | Required | Description |
| --- | --- | --- |
| `datafile` | yes | PDF to sign. Maximum 50mb. |
| `accountId` | yes, unless `workerName` is sent | Keystore file name, `{KEYSTORE_DIR}/{accountId}.p12`. |
| `workerName` | no | Used as the account id when `accountId` is absent. |
| `watermark` | no | `"true"` draws the GetSign watermark and link on the last page. |

Responses:

| Status | Body |
| --- | --- |
| `202` | `{ "jobId", "status": "pending" }` |
| `401` | Missing or wrong `x-sign-token` |
| `404` | No P12 for that account |
| `413` | File larger than 50mb |
| `429` | Two signatures are already running |
| `400` | Missing file or account id |

## GET /signserver/jobs/:jobId

| Status | Body |
| --- | --- |
| `202` | `{ "jobId", "status": "pending" }` |
| `200` | Signed PDF (`application/pdf`). The job files are deleted after the response finishes. |
| `404` | Unknown job, or a job removed because the process restarted |
| `500` | `{ "error": "Failed to sign PDF", "details" }` |

Poll about every 5 seconds. Keep the `jobId` and do not submit the same PDF again while the status is pending.

## POST /signserver/process

Same form fields as `POST /signserver/jobs`. The response is the signed PDF, or `429` when both slots are taken. Prefer `/signserver/jobs` so nginx does not wait on the signature.

## Enrollment

Send JSON to `SQS_SIGNING_QUEUE_URL`:

```json
{
  "accountId": "12345",
  "companyName": "Acme Inc",
  "userEmail": "admin@acme.com",
  "organizationName": "Acme Inc",
  "countryName": "US"
}
```

`accountId` is enough to enroll. `companyName` and `userEmail` are included when the account has them. The common name is `{companyName} ({userEmail})` when both are present, and the account id otherwise. A second message for a still-valid P12 does nothing. Signing returns `404` until the file exists.
