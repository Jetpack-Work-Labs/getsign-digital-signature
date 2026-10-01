# GetSign Flow Service

A Node.js/TypeScript microservice that provides PDF digital signing capabilities via REST API and processes certificate provisioning jobs via AWS SQS. The service integrates with EJBCA (Certificate Authority) and SignServer for enterprise-grade digital signature operations.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [API Documentation](#api-documentation)
- [Services](#services)
- [Database Models](#database-models)
- [Docker Setup](#docker-setup)
- [Development](#development)
- [Deployment](#deployment)
- [Monitoring & Error Tracking](#monitoring--error-tracking)

## Overview

GetSign Flow Service is a backend service that:

- **Signs PDF documents** using digital certificates via SignServer
- **Provisions certificates** automatically via EJBCA when new accounts are created
- **Processes background jobs** from AWS SQS for certificate and worker setup
- **Manages cryptographic tokens** and PDF signer workers in SignServer
- **Adds watermarks** to PDFs with clickable links
- **Streams PDFs** efficiently without buffering entire files

## Features

### Core Functionality

- ✅ **Express REST API** running on port 9999
- ✅ **PDF Signing API** with streaming support (no file size limits)
- ✅ **Watermark functionality** with clickable links on PDFs
- ✅ **SQS Job Processing** for background certificate provisioning
- ✅ **Health Check** endpoints for service and SignServer monitoring
- ✅ **MongoDB Integration** with encrypted fields
- ✅ **Sentry Error Tracking** for production monitoring
- ✅ **Docker Integration** with EJBCA and SignServer containers

### Technical Highlights

- **Pure Streaming**: Processes PDFs as streams without buffering
- **No Temporary Files**: All processing happens in memory
- **Error Resilience**: Comprehensive error handling with Sentry integration
- **Type Safety**: Full TypeScript implementation
- **Production Ready**: Includes monitoring, logging, and health checks

## Architecture

```
┌─────────────────┐
│   Client Apps   │
└────────┬────────┘
         │
         │ HTTP/REST
         │
┌────────▼─────────────────────────────────┐
│      GetSign Flow Service                │
│  ┌─────────────────────────────────────┐ │
│  │  Express API (Port 9999)            │ │
│  │  - /health                          │ │
│  │  - /signserver/process              │ │
│  └─────────────────────────────────────┘ │
│  ┌─────────────────────────────────────┐ │
│  │  SQS Consumer                       │ │
│  │  - Certificate Provisioning         │ │
│  │  - Worker Setup                     │ │
│  └─────────────────────────────────────┘ │
└────────┬─────────────────────────────────┘
         │
    ┌────┴────┬──────────────┬──────────────┐
    │         │              │              │
┌───▼───┐ ┌──▼────┐    ┌────▼────┐   ┌────▼────┐
│MongoDB│ │SignServer│  │  EJBCA  │   │   AWS   │
│       │ │          │  │         │   │  SQS/S3 │
└───────┘ └──────────┘  └─────────┘   └─────────┘
```

### Component Overview

1. **Express API Server**: Handles HTTP requests for PDF signing
2. **SQS Consumer**: Processes background jobs for certificate provisioning
3. **SignServer Integration**: Performs actual PDF signing operations
4. **EJBCA Integration**: Issues and manages digital certificates
5. **MongoDB**: Stores application data, certificates, and user information
6. **AWS Services**: SQS for job queue, S3 for file storage

## Prerequisites

- **Node.js** 18+ and npm/yarn
- **Docker** and Docker Compose
- **MongoDB** instance (local or remote)
- **AWS Account** with SQS and S3 access
- **Sentry Account** (optional, for error tracking)

## Installation

### 1. Clone and Install Dependencies

```bash
git clone <repository-url>
cd getsign-flow_service
npm install
# or
yarn install
```

### 2. Set Up Docker Services

Start EJBCA and SignServer using Docker Compose:

```bash
docker-compose up -d
```

This will start:

- **EJBCA** on ports 8082 (HTTP) and 8445 (HTTPS)
- **SignServer** on ports 8081 (HTTP) and 8444 (HTTPS)
- **MariaDB databases** for both services

Wait for services to initialize (may take a few minutes on first run).

### 3. Configure Environment Variables

Create a `.env` file in the root directory:

```bash
# Environment
ENVIRONMENT=development  # or production

# AWS Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
SQS_SIGNING_QUEUE_URL=https://sqs.region.amazonaws.com/account/queue-name

# Database
DB_URL=mongodb://localhost:27017/getsign-flow

# Encryption Keys (32-byte and 64-byte base64 strings)
SOME_32BYTE_BASE64_STRING=your-32-byte-base64-encryption-key
SOME_64BYTE_BASE64_STRING=your-64-byte-base64-signature-key

# Sentry (Optional)
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
```

### 4. Start the Service

**Development mode:**

```bash
npm start
```

**Production mode:**

```bash
npm run build
npm run serve
```

The service will start on port 9999.

## Configuration

### Environment Variables

| Variable                    | Required | Description                      |
| --------------------------- | -------- | -------------------------------- |
| `ENVIRONMENT`               | Yes      | `development` or `production`    |
| `AWS_REGION`                | Yes      | AWS region for SQS/S3            |
| `AWS_ACCESS_KEY_ID`         | Yes      | AWS access key                   |
| `AWS_SECRET_ACCESS_KEY`     | Yes      | AWS secret key                   |
| `SQS_SIGNING_QUEUE_URL`     | Yes      | SQS queue URL for job processing |
| `DB_URL`                    | Yes      | MongoDB connection string        |
| `SOME_32BYTE_BASE64_STRING` | Yes      | 32-byte base64 encryption key    |
| `SOME_64BYTE_BASE64_STRING` | Yes      | 64-byte base64 signature key     |
| `SENTRY_DSN`                | No       | Sentry DSN for error tracking    |

### Docker Services

The `docker-compose.yml` file configures:

- **EJBCA Database**: MariaDB for EJBCA data
- **SignServer Database**: MariaDB for SignServer data
- **EJBCA Node**: Certificate Authority service
- **SignServer**: PDF signing service

See [Docker Setup](#docker-setup) for more details.

## API Documentation

### Health Check

Check if the service is running.

**Endpoint:** `GET /health`

**Response:**

```json
{
  "status": "OK",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "service": "GetSign Flow Service",
  "version": "1.0.0"
}
```

### SignServer Health Check

Check if SignServer is accessible and a specific worker is active.

**Endpoint:** `GET /health/signserver`

**Response:**

```json
{
  "status": "OK",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "service": "SignServer",
  "workerStatus": "Worker status output..."
}
```

### Sign PDF

Sign a PDF document using a SignServer worker.

**Endpoint:** `POST /signserver/process`

**Content-Type:** `multipart/form-data`

**Form Fields:**

- `datafile` (file, required): PDF file to sign
- `workerName` (string, required): SignServer worker name/ID
- `watermark` (string, optional): Set to `"true"` to add watermark

**Response:**

- **Content-Type:** `application/pdf`
- **Content-Disposition:** `attachment; filename="signed-document.pdf"`
- **Body:** Signed PDF binary stream

**Example using curl:**

```bash
curl -X POST \
  http://localhost:9999/signserver/process \
  -F "datafile=@document.pdf" \
  -F "workerName=6282336" \
  -F "watermark=true" \
  --output signed-document.pdf
```

**Example using JavaScript:**

```javascript
const FormData = require("form-data");
const fs = require("fs");
const axios = require("axios");

const form = new FormData();
form.append("datafile", fs.createReadStream("document.pdf"));
form.append("workerName", "6282336");
form.append("watermark", "true");

const response = await axios.post(
  "http://localhost:9999/signserver/process",
  form,
  {
    headers: form.getHeaders(),
    responseType: "arraybuffer",
  }
);

fs.writeFileSync("signed-document.pdf", response.data);
```

**Processing Steps:**

1. Receives PDF file via FormData
2. Optionally adds watermark to the last page (if `watermark=true`)
3. Fixes PDF metadata for SignServer compatibility
4. Streams PDF to SignServer for signing
5. Returns signed PDF as stream

## Services

### SQS Service

Processes background jobs from AWS SQS for certificate provisioning and worker setup.

**Job Flow:**

1. Receives `SignJob` from SQS queue
2. Checks if certificate exists for account
3. Creates certificate via EJBCA if needed
4. Uploads certificate to S3
5. Creates crypto token worker in SignServer
6. Creates PDF signer worker in SignServer
7. Updates certificate records in database

**Key Functions:**

- `pollAndProcessJobs()`: Polls SQS queue and processes jobs
- `HandleQueue()`: Handles individual signing jobs
- `enqueueSignJob()`: Enqueues new jobs to SQS

### Certificate Service

Manages digital certificates in the system.

**Features:**

- Create certificates via EJBCA
- Store certificate metadata in MongoDB
- Upload certificates to S3
- Link certificates to accounts and workers

### SignServer Service

Handles PDF signing operations via SignServer.

**Features:**

- Stream PDF signing (no file size limits)
- Worker management
- Health checks
- Error handling with Sentry

### Application Service

Manages application/company data.

### EJBCA Service

Interfaces with EJBCA for certificate operations.

## Database Models

The service uses MongoDB with Mongoose. Key models include:

### Application Model

- Company/account information
- User details
- Account slugs

### Certificate Model

- Certificate metadata
- S3 file URLs
- Docker file paths
- Worker and token IDs
- Encrypted password field

### Envelope Model

- Document envelope information

### Files Model

- File metadata and references

### Users Model

- User account information

All models use `mongoose-encryption` for sensitive field encryption.

## Docker Setup

### Starting Services

```bash
docker-compose up -d
```

### Service Ports

- **EJBCA**:
  - HTTP: `http://localhost:8082`
  - HTTPS: `https://localhost:8445`
- **SignServer**:
  - HTTP: `http://localhost:8081`
  - HTTPS: `https://localhost:8444`

### Service URLs

- **EJBCA Web UI**: `http://localhost:8082/ejbca`
- **SignServer Admin**: `http://localhost:8081/signserver`

### Database Volumes

- `./ejbca-db`: EJBCA database data
- `./signserver-db`: SignServer database data
- `./signserver-data`: SignServer configuration and keys

### Stopping Services

```bash
docker-compose down
```

### Viewing Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f signserver
docker-compose logs -f ejbca
```

## Development

### Project Structure

```
src/
├── config/          # Configuration management
├── const/           # Constants (AWS, EJBCA, SignServer)
├── infrastructure/  # Database, Sentry setup
├── interfaces/      # TypeScript interfaces
├── model/           # MongoDB models
├── public/          # Static assets (watermark images)
├── services/        # Business logic services
│   ├── application/
│   ├── certificate/
│   ├── ejbca/
│   ├── envelope/
│   ├── fileDetails/
│   ├── signserver/
│   ├── sqs/
│   └── users/
└── utils/           # Utility functions
```

### Available Scripts

```bash
# Start development server with hot reload
npm start

# Build for production
npm run build

# Start production server
npm run serve

# Copy public assets (runs automatically on build)
npm run copy-public
```

### Development Workflow

1. Start Docker services: `docker-compose up -d`
2. Set up `.env` file with required variables
3. Start development server: `npm start`
4. Make changes - server will auto-reload
5. Test API endpoints using curl, Postman, or your client

### TypeScript Configuration

The project uses TypeScript with:

- Strict mode enabled
- ES2016 target
- CommonJS modules
- Path aliases for services and types

## Deployment

### Build for Production

```bash
npm run build
```

This will:

1. Compile TypeScript to JavaScript in `dist/`
2. Copy public assets to `dist/public/`

### Production Checklist

- [ ] Set `ENVIRONMENT=production` in `.env`
- [ ] Use production MongoDB connection string
- [ ] Configure production AWS credentials
- [ ] Set up Sentry DSN for error tracking
- [ ] Ensure Docker services are running
- [ ] Test health check endpoints
- [ ] Verify SQS queue is accessible
- [ ] Set up process manager (PM2, systemd, etc.)

### Running in Production

```bash
npm run serve
```

Or use a process manager:

```bash
# Using PM2
pm2 start dist/index.js --name getsign-flow

# Using systemd
# Create a service file and enable it
```

### Environment-Specific Configuration

- **Development**: Debug logging enabled, relaxed error handling
- **Production**: Optimized logging, full error tracking, performance monitoring

## Monitoring & Error Tracking

### Sentry Integration

The service includes Sentry for error tracking and performance monitoring.

**Features:**

- Automatic error capture
- Request tracing
- Performance profiling
- Custom error context

See [SENTRY_SETUP.md](./SENTRY_SETUP.md) for detailed setup instructions.

### Health Checks

Monitor service health:

```bash
# Service health
curl http://localhost:9999/health

# SignServer health
curl http://localhost:9999/health/signserver
```

### Logging

The service logs to console with:

- ✅ Success messages
- ❌ Error messages
- ⚠️ Warning messages
- 📝 Info messages

In production, consider redirecting logs to a logging service.
