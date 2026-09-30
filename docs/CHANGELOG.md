# Changelog

## Unreleased — `feat/async-signing`

### Async signing

- `POST /signserver/jobs` returns `202 { jobId }`. `GET /signserver/jobs/:jobId` returns the signed PDF.
- At most two signatures run at once. A third request receives `429`.
- Signing runs in a worker thread. The HTTP thread keeps answering `/health`.
- A restart deletes in-flight job files. Callers that poll those ids receive `404` and submit again.
- `POST /signserver/process` still returns the PDF and uses the same two-slot cap.
- `accountId` or `workerName` selects the P12. Uploads over 50mb receive `413`.
- When `SIGN_API_TOKEN` is set, sign routes require `x-sign-token`.

### Local certificates

- New certificates are issued with `node-forge` and `CA_DIR`. The private key is stored in `{accountId}.p12`.
- Existing P12 files are not regenerated on deploy. A missing file is restored from S3 before a new key is issued.
- Renewal inside 30 days of expiry reissues through the local CA. That changes the issuer away from EJBCA.
- An enrollment message with only `accountId` still issues a certificate. The common name is the company and email when both are present, and the account id otherwise.
- `GET /signserver/certificates/:accountId` reports whether that P12 exists. The backend uses it instead of Mongo `workerId`, which was the old SignServer worker id and is no longer written.
- EJBCA and MariaDB are removed from `docker-compose.yml`. The app container is limited to 1536mb.
- `GET /health/ejbca` reports whether the local CA files exist.

### Tests and docs

- `npm test` covers the job store, the two-slot cap, local enrollment plus signing, the certificate subject, and the HTTP routes.
- Current docs are [docs/README.md](README.md), [docs/API.md](API.md), and [docs/ARCHITECTURE.md](ARCHITECTURE.md).
- The previous SignServer and EJBCA docs are in [docs/old](old/).
