# GetSign digital signature

Node service that signs PDFs with a per-company certificate. It listens on port 9999.

Signing does not go through SignServer. A company keystore at `{KEYSTORE_DIR}/{accountId}.p12` is read by `@signpdf`. New certificates are issued with `node-forge` and a local CA in `CA_DIR`. Existing keystores are left in place.

getsign-backend submits work to `POST /signserver/jobs` and polls `GET /signserver/jobs/:jobId`. At most two signatures run at once. A third call receives `429` and the backend queue waits.

## Docs

- [API](API.md)
- [Architecture](ARCHITECTURE.md)
- [Changelog](CHANGELOG.md)

The previous SignServer and EJBCA documentation is in [old](old/).

## Run

```bash
npm install
npm start
```

Required environment is listed in `.env.example`. `npm test` issues a local certificate and signs a sample PDF.
