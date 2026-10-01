# Architecture Documentation

This document provides a detailed overview of the GetSign Flow Service architecture, components, and data flow.

## System Overview

GetSign Flow Service is a microservice that orchestrates digital certificate provisioning and PDF signing operations. It acts as a middleware layer between client applications and enterprise PKI infrastructure (EJBCA and SignServer).

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client Applications                        │
│              (Web Apps, Mobile Apps, API Clients)                │
└────────────────────────────┬────────────────────────────────────┘
                              │
                              │ HTTP/REST API
                              │
┌─────────────────────────────▼────────────────────────────────────┐
│                    GetSign Flow Service                           │
│                    (Node.js/TypeScript)                           │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │              Express HTTP Server (Port 9999)                │  │
│  │  ┌──────────────────┐  ┌──────────────────────────────┐   │  │
│  │  │  Health Checks   │  │  PDF Signing Endpoint        │   │  │
│  │  │  - /health       │  │  - /signserver/process       │   │  │
│  │  │  - /health/      │  │  - FormData input           │   │  │
│  │  │    signserver    │  │  - PDF stream output        │   │  │
│  │  └──────────────────┘  └──────────────────────────────┘   │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │              SQS Consumer Service                           │  │
│  │  ┌──────────────────────────────────────────────────────┐  │  │
│  │  │  Job Processor                                        │  │  │
│  │  │  - Polls SQS queue                                   │  │  │
│  │  │  - Certificate provisioning                           │  │  │
│  │  │  - Worker setup                                      │  │  │
│  │  └──────────────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │              Service Layer                                 │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐    │  │
│  │  │Certificate│ │Application│ │SignServer│ │   EJBCA  │    │  │
│  │  │  Service │ │  Service │ │  Service │ │  Service │    │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘    │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │              Infrastructure Layer                           │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐                  │  │
│  │  │ MongoDB  │ │  Sentry  │ │   Utils  │                  │  │
│  │  │  Driver │ │  Client  │ │  Helpers │                  │  │
│  │  └──────────┘ └──────────┘ └──────────┘                  │  │
│  └────────────────────────────────────────────────────────────┘  │
└─────────────────────────────┬─────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
┌───────▼──────┐    ┌─────────▼─────────┐  ┌───────▼────────┐
│   MongoDB    │    │   Docker Services  │  │  AWS Services  │
│              │    │                    │  │                │
│  - Apps      │    │  ┌──────────────┐  │  │  - SQS Queue   │
│  - Certs     │    │  │   EJBCA      │  │  │  - S3 Storage  │
│  - Users     │    │  │   Port 8082  │  │  │                │
│  - Envelopes │    │  └──────────────┘  │  └────────────────┘
│  - Files     │    │  ┌──────────────┐  │
└──────────────┘    │  │  SignServer  │  │
                    │  │   Port 8081  │  │
                    │  └──────────────┘  │
                    │  ┌──────────────┐  │
                    │  │   MariaDB    │  │
                    │  │  Databases   │  │
                    │  └──────────────┘  │
                    └────────────────────┘
```

## Component Details

### 1. Express HTTP Server

**Purpose:** Handles incoming HTTP requests for PDF signing operations.

**Key Responsibilities:**
- Route HTTP requests to appropriate handlers
- Parse multipart/form-data for PDF uploads
- Stream PDF data to/from SignServer
- Return signed PDFs to clients
- Provide health check endpoints

**Technology:** Express.js 5.x

**Endpoints:**
- `GET /health` - Service health check
- `GET /health/signserver` - SignServer health check
- `POST /signserver/process` - PDF signing endpoint

### 2. SQS Consumer Service

**Purpose:** Processes background jobs for certificate provisioning and worker setup.

**Key Responsibilities:**
- Poll AWS SQS queue for new jobs
- Process certificate provisioning requests
- Create and configure SignServer workers
- Handle job failures and retries

**Job Flow:**
1. Receive `SignJob` from SQS
2. Check if certificate exists for account
3. Create certificate via EJBCA if needed
4. Upload certificate to S3
5. Create crypto token worker in SignServer
6. Create PDF signer worker in SignServer
7. Update database records

**Technology:** AWS SDK v3 (@aws-sdk/client-sqs)

### 3. Service Layer

#### Certificate Service
- Manages certificate lifecycle
- Interfaces with EJBCA for certificate creation
- Stores certificate metadata in MongoDB
- Handles certificate encryption

#### Application Service
- Manages company/account data
- Retrieves account information for job processing
- Links certificates to accounts

#### SignServer Service
- Handles PDF signing operations
- Manages worker communication
- Streams PDFs to/from SignServer
- Performs health checks

#### EJBCA Service
- Interfaces with EJBCA REST API
- Creates certificates
- Manages certificate requests

### 4. Infrastructure Layer

#### MongoDB Integration
- **Driver:** Mongoose
- **Models:** Application, Certificate, Envelope, Files, Users
- **Features:** 
  - Field-level encryption (mongoose-encryption)
  - Connection pooling
  - Automatic reconnection

#### Sentry Integration
- **Purpose:** Error tracking and performance monitoring
- **Features:**
  - Automatic error capture
  - Request tracing
  - Performance profiling
  - Custom context and tags

#### Utility Functions
- PDF watermarking
- PDF metadata fixing
- Docker command execution
- File upload to S3
- Certificate creation helpers

## Data Flow

### PDF Signing Flow

```
1. Client Request
   └─> POST /signserver/process
       ├─> FormData: PDF file, workerName, watermark flag
       └─> Express parses multipart/form-data

2. PDF Processing
   ├─> Extract PDF buffer from FormData
   ├─> Add watermark (if requested)
   │   └─> Uses pdf-lib to add clickable watermark
   ├─> Fix PDF metadata
   │   └─> Ensures SignServer compatibility
   └─> Convert to stream

3. SignServer Signing
   ├─> Create FormData with worker name and PDF stream
   ├─> POST to SignServer REST API
   ├─> SignServer signs PDF
   └─> Receive signed PDF stream

4. Response
   └─> Stream signed PDF back to client
       ├─> Content-Type: application/pdf
       └─> Content-Disposition: attachment
```

### Certificate Provisioning Flow

```
1. SQS Job Received
   └─> SignJob with accountId

2. Check Certificate
   ├─> Query MongoDB for existing certificate
   └─> If exists, use existing; else create new

3. Certificate Creation (if needed)
   ├─> Call EJBCA service to create certificate
   ├─> Generate P12 file
   ├─> Upload to S3
   └─> Store metadata in MongoDB

4. Worker Setup
   ├─> Check if crypto token worker exists
   ├─> Create crypto token worker (if needed)
   │   └─> Uses Docker exec to configure SignServer
   ├─> Check if PDF signer worker exists
   └─> Create PDF signer worker (if needed)
       └─> Links to crypto token worker

5. Update Records
   └─> Update certificate with worker IDs
```

## Technology Stack

### Runtime
- **Node.js** 18+
- **TypeScript** 5.8+
- **Express.js** 5.1+

### Database
- **MongoDB** with Mongoose ODM
- **MariaDB** (via Docker for EJBCA/SignServer)

### AWS Services
- **SQS** - Job queue
- **S3** - File storage
- **AWS SDK v3** - AWS service clients

### PKI Infrastructure
- **EJBCA** - Certificate Authority (Docker)
- **SignServer** - PDF signing service (Docker)

### Monitoring
- **Sentry** - Error tracking and performance monitoring

### Utilities
- **pdf-lib** - PDF manipulation
- **formidable** - Multipart form parsing
- **axios** - HTTP client
- **node-forge** - Cryptographic operations

## Security Considerations

### Data Encryption
- Sensitive fields in MongoDB are encrypted using `mongoose-encryption`
- Encryption keys stored in environment variables
- Certificate passwords encrypted at rest

### Network Security
- HTTPS for production deployments
- TLS for MongoDB connections
- Secure AWS credential management

### Access Control
- Worker names tied to account IDs
- Certificate isolation per account
- No cross-account certificate access

## Scalability

### Horizontal Scaling
- Stateless API design allows multiple instances
- SQS queue distributes jobs across instances
- MongoDB connection pooling handles concurrent requests

### Performance Optimizations
- Streaming PDF processing (no file size limits)
- No temporary file creation
- Efficient memory usage
- Connection pooling for databases

### Limitations
- Single MongoDB instance (can be sharded)
- Docker containers on single host (can be orchestrated)
- SQS polling frequency (configurable)

## Error Handling

### Error Categories
1. **Client Errors** (400): Invalid requests, missing parameters
2. **Server Errors** (500): Internal processing failures
3. **Service Errors**: SignServer/EJBCA communication failures
4. **Infrastructure Errors**: Database, AWS service failures

### Error Recovery
- Automatic retries for transient failures
- Sentry capture for all errors
- Graceful degradation where possible
- Health check endpoints for monitoring

## Deployment Architecture

### Development
- Local MongoDB
- Docker Compose for EJBCA/SignServer
- Local file system for certificates

### Production
- Managed MongoDB (Atlas or self-hosted)
- Container orchestration (Kubernetes/Docker Swarm)
- AWS S3 for certificate storage
- Load balancer for API instances
- Process manager (PM2/systemd)

## Future Enhancements

### Potential Improvements
- Redis caching for certificate lookups
- WebSocket support for real-time status
- Batch PDF signing
- Certificate renewal automation
- Multi-region deployment
- GraphQL API option
- Enhanced monitoring dashboard

