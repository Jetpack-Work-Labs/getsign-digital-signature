# Changelog

## Unreleased — `feat/async-signing`

Not released. No automated tests or regression run were executed for this branch. The signature server has no test script. Typecheck and a live sign against a sample PDF are still outstanding.

### Async signing

- `POST /signserver/jobs` accepts the PDF and returns `202 { jobId }` without holding the connection for the signature.
- `GET /signserver/jobs/:jobId` returns `202` while pending, the signed PDF when complete, or the error when the job failed.
- At most two signatures run at once. A third request receives `429`.
- Signing runs in a worker thread so the HTTP thread can still answer `/health`.
- Job files live under `JOBS_DIR`. A restart marks in-flight jobs failed. Callers submit again.
- `POST /signserver/process` still returns the signed PDF for older callers. It uses the same two-slot cap and returns `429` when both slots are taken.
- `accountId` or `workerName` selects `/keystores/{id}.p12`.
- Uploads larger than 50mb are rejected with `413`.
- When `SIGN_API_TOKEN` is set, sign routes require header `x-sign-token`.

### Local certificates

- New company certificates are issued with `node-forge` and a local CA in `CA_DIR` (`ca.crt`, `ca.key`). The private key is written only to `{accountId}.p12`.
- Existing `.p12` files are not regenerated. A missing file is restored from S3 before a new key is created.
- Renewal still happens inside 30 days of expiry, now through the local CA.
- EJBCA and MariaDB are removed from `docker-compose.yml`. The Node app is limited to 1536mb.
- `GET /health/ejbca` now reports whether the local CA files exist. It does not call EJBCA.

### Still manual before production

- Sign one existing-customer PDF and confirm the signature and watermark link.
- Enroll one new account and confirm `{accountId}.p12` is created without EJBCA.
- Confirm the backend on this same branch polls `/signserver/jobs` and delays on `429`.
- Keep the keystore and CA volumes. Then stop the EJBCA containers and resize the instance.
