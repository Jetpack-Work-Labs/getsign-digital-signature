# Architecture

The process is one Node server. EJBCA, SignServer, and MariaDB are not part of the running stack. Company private keys stay in PKCS#12 files on disk.

```
getsign-backend
  document-generation queue
  envelope-signing queue
        |
        | POST /signserver/jobs
        | GET  /signserver/jobs/:id
        v
HTTP thread
  auth, 50mb cap, two-slot limit
        |
        | worker thread
        v
pdf-lib watermark + signature placeholder
@signpdf + {accountId}.p12
        |
        v
signed PDF

SQS enroll queue
        |
        v
local CA (CA_DIR/ca.crt + ca.key)
node-forge writes {accountId}.p12
```

## Signing

`POST /signserver/jobs` writes the upload under `JOBS_DIR` and returns `202` before the signature is built. A worker thread loads the PDF once, draws the watermark when requested, adds the PAdES placeholder, and signs with the company P12. The HTTP thread stays free for `/health`.

Two signatures may run. The third request gets `429`. There is no waiting backlog on this host. The backend queues already hold extra documents and retry.

`POST /signserver/process` still returns the PDF on the same connection for older callers. It uses the same two slots.

A restart deletes job directories that were still `running`. The backend sees `404` on the old job id and submits again. Completed files are removed after download.

## Certificates

`ensureLocalCa()` creates `ca.crt` and `ca.key` once. Enrollment generates an RSA key in a worker thread and stores the certificate plus that CA in `{KEYSTORE_DIR}/{accountId}.p12`.

If the P12 is missing, enrollment tries S3 key `{prod|dev}/p12/{accountId}.p12` in bucket `jetsign-digital-signature` before issuing a new key. A file that cannot be opened, or one inside 30 days of expiry, is replaced. Replacing an EJBCA-issued file changes the issuer to this local CA. The common name comes from the SQS message (`companyName`, `userEmail`). The backend must send those fields.

The CA key is an unencrypted PEM. Losing `CA_DIR` creates a new root on the next start. Existing P12 files still sign. Certificates issued after that chain to the new root.

## What this box does not do

- It does not create SignServer workers.
- It does not publish a CRL or OCSP.
- It does not keep a Mongo database. Readiness for an existing company is the P12 file.
