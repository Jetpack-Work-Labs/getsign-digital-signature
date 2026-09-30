# Project Architecture

Complete architecture documentation for GetSign Flow Service, including system design, component interactions, data flows, and deployment architecture.

## Table of Contents

- [System Overview](#system-overview)
- [High-Level Architecture](#high-level-architecture)
- [Component Architecture](#component-architecture)
- [Data Flow Diagrams](#data-flow-diagrams)
- [Sequence Diagrams](#sequence-diagrams)
- [Technology Stack](#technology-stack)
- [Integration Architecture](#integration-architecture)
- [Security Architecture](#security-architecture)
- [Deployment Architecture](#deployment-architecture)
- [Scalability & Performance](#scalability--performance)

---

## System Overview

GetSign Flow Service is a microservice-based system that provides enterprise-grade PDF digital signing capabilities. It orchestrates certificate provisioning, worker management, and PDF signing operations through integration with EJBCA (Certificate Authority) and SignServer (PDF signing service).

### Core Responsibilities

1. **PDF Digital Signing**: Sign PDF documents using digital certificates
2. **Certificate Provisioning**: Automatically provision and manage digital certificates
3. **Worker Management**: Create and configure SignServer workers for signing operations
4. **Job Processing**: Process background jobs via AWS SQS
5. **Watermark Management**: Add clickable watermarks to PDFs

### Key Characteristics

- **Stateless API Design**: Enables horizontal scaling
- **Streaming Processing**: Handles large PDFs without memory constraints
- **Event-Driven**: Uses SQS for asynchronous job processing
- **Microservice Architecture**: Modular, service-oriented design
- **Container-Based**: Docker containers for PKI infrastructure

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           EXTERNAL SYSTEMS                                    │
│                                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │ Web Clients  │  │ Mobile Apps  │  │ API Clients  │  │ Admin Tools  │   │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘   │
│         │                 │                 │                 │             │
└─────────┼─────────────────┼─────────────────┼─────────────────┼─────────────┘
          │                 │                 │                 │
          │                 │                 │                 │
          └─────────────────┴─────────────────┴─────────────────┘
                            │
                            │ HTTP/REST (Port 9999)
                            │
┌───────────────────────────▼───────────────────────────────────────────────────┐
│                      GETSIGN FLOW SERVICE                                      │
│                      (Node.js/TypeScript Application)                         │
│                                                                               │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                        API LAYER                                         │ │
│  │  ┌────────────────┐  ┌────────────────┐  ┌──────────────────────────┐  │ │
│  │  │ Health Checks │  │ PDF Signing    │  │ Error Handling           │  │ │
│  │  │ /health       │  │ /signserver/   │  │ Sentry Integration       │  │ │
│  │  │ /health/      │  │ process        │  │ Express Middleware       │  │ │
│  │  │ signserver    │  │                │  │                          │  │ │
│  │  └───────────────┘  └────────────────┘  └──────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                               │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                        BUSINESS LOGIC LAYER                              │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │ │
│  │  │ Certificate  │  │ Application  │  │ SignServer   │  │   EJBCA    │ │ │
│  │  │   Service    │  │   Service    │  │   Service    │  │  Service   │ │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  └────────────┘ │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                │ │
│  │  │   Envelope   │  │ File Details │  │    Users     │                │ │
│  │  │   Service    │  │   Service    │  │   Service    │                │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘                │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                               │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                        BACKGROUND PROCESSING LAYER                       │ │
│  │  ┌──────────────────────────────────────────────────────────────────┐  │ │
│  │  │                    SQS Consumer Service                            │  │ │
│  │  │  ┌────────────────┐  ┌────────────────┐  ┌──────────────────────┐  │  │ │
│  │  │  │ Queue Poller  │  │ Job Processor │  │ Error Handler       │  │  │ │
│  │  │  │ (Long Poll)   │  │ HandleQueue() │  │ Retry Logic         │  │  │ │
│  │  │  └────────────────┘  └────────────────┘  └──────────────────────┘  │  │ │
│  │  └──────────────────────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                               │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                        INFRASTRUCTURE LAYER                              │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │ │
│  │  │   MongoDB    │  │    Sentry    │  │   Utils      │  │  Config    │ │ │
│  │  │  (Mongoose)  │  │  (Error      │  │  (Helpers)   │  │ Management │ │ │
│  │  │              │  │  Tracking)   │  │              │  │            │ │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  └────────────┘ │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└───────────────────────────┬───────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┬───────────────────┐
        │                   │                   │                   │
┌───────▼────────┐  ┌───────▼────────┐  ┌───────▼────────┐  ┌───────▼────────┐
│   MongoDB      │  │  Docker Stack   │  │  AWS Services  │  │  File System   │
│                │  │                 │  │                 │  │                │
│  Collections:  │  │  ┌───────────┐  │  │  ┌───────────┐ │  │  Watermark     │
│  - Apps        │  │  │  EJBCA    │  │  │  │ SQS Queue │ │  │  Images        │
│  - Certs       │  │  │  :8082     │  │  │  │           │ │  │                │
│  - Users       │  │  └───────────┘  │  │  └───────────┘ │  │                │
│  - Envelopes   │  │  ┌───────────┐  │  │  ┌───────────┐ │  │                │
│  - Files       │  │  │ SignServer│  │  │  │ S3 Bucket │ │  │                │
│                │  │  │  :8081    │  │  │  │           │ │  │                │
│                │  │  └───────────┘  │  │  └───────────┘ │  │                │
│                │  │  ┌───────────┐  │  │                │  │                │
│                │  │  │  MariaDB  │  │  │                │  │                │
│                │  │  │ Databases │  │  │                │  │                │
│                │  │  └───────────┘  │  │                │  │                │
└────────────────┘  └─────────────────┘  └────────────────┘  └────────────────┘
```

---

## Component Architecture

### 1. API Layer

```
┌─────────────────────────────────────────────────────────────┐
│                    Express HTTP Server                       │
│                    (Port 9999)                               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Request Middleware                        │  │
│  │  - Body Parser (JSON, URL-encoded)                   │  │
│  │  - FormData Parser (formidable)                      │  │
│  │  - Sentry Request Handler                             │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Route Handlers                            │  │
│  │                                                         │  │
│  │  GET  /health              → Health Check             │  │
│  │  GET  /health/signserver   → SignServer Status        │  │
│  │  POST /signserver/process  → PDF Signing              │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Error Middleware                           │  │
│  │  - Sentry Error Capture                               │  │
│  │  - Error Response Formatting                          │  │
│  │  - Logging                                            │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 2. Business Logic Layer

```
┌─────────────────────────────────────────────────────────────────┐
│                      Service Layer                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐  ┌──────────────────┐                    │
│  │ Certificate      │  │ Application      │                    │
│  │ Service          │  │ Service          │                    │
│  ├──────────────────┤  ├──────────────────┤                    │
│  │ - create()       │  │ - findCompany()  │                    │
│  │ - findByCompany()│  │ - getAccount()   │                    │
│  │ - update()       │  │                  │                    │
│  └──────────────────┘  └──────────────────┘                    │
│                                                                  │
│  ┌──────────────────┐  ┌──────────────────┐                    │
│  │ SignServer       │  │ EJBCA            │                    │
│  │ Service          │  │ Service          │                    │
│  ├──────────────────┤  ├──────────────────┤                    │
│  │ - signPDFStream()│  │ - createCert()   │                    │
│  │ - checkWorker()  │  │ - getCert()      │                    │
│  │ - healthCheck()  │  │                  │                    │
│  └──────────────────┘  └──────────────────┘                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3. Background Processing Layer

```
┌─────────────────────────────────────────────────────────────────┐
│                    SQS Consumer Service                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Queue Poller (pollAndProcessJobs)             │  │
│  │  - Long polling (20s wait time)                           │  │
│  │  - Batch processing (up to 5 messages)                   │  │
│  │  - Continuous loop                                         │  │
│  └──────────────────────────────────────────────────────────┘  │
│                            │                                     │
│                            ▼                                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Job Handler (HandleQueue)                      │  │
│  │                                                             │  │
│  │  1. Receive SignJob { accountId }                          │  │
│  │  2. Find/Create Certificate                                │  │
│  │  3. Upload Certificate to S3                               │  │
│  │  4. Create Crypto Token Worker                             │  │
│  │  5. Create PDF Signer Worker                               │  │
│  │  6. Update Database Records                                │  │
│  │  7. Delete Message from Queue                              │  │
│  └──────────────────────────────────────────────────────────┘  │
│                            │                                     │
│                            ▼                                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Error Handler                                  │  │
│  │  - Log errors                                              │  │
│  │  - Sentry capture                                          │  │
│  │  - Retry logic (via SQS visibility timeout)                │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 4. Infrastructure Layer

```
┌─────────────────────────────────────────────────────────────────┐
│                  Infrastructure Components                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              MongoDB (Mongoose)                             │  │
│  │  - Connection Pooling (max 10 connections)                 │  │
│  │  - Automatic Reconnection                                  │  │
│  │  - Field-level Encryption (mongoose-encryption)            │  │
│  │  - Models: Application, Certificate, Envelope, Files, User │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Sentry Integration                             │  │
│  │  - Automatic Error Capture                                │  │
│  │  - Request Tracing                                        │  │
│  │  - Performance Profiling                                  │  │
│  │  - Custom Context & Tags                                 │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Utility Functions                              │  │
│  │  - PDF Watermarking (pdf-lib)                             │  │
│  │  - PDF Metadata Fixing                                    │  │
│  │  - Docker Command Execution                               │  │
│  │  - S3 File Upload                                         │  │
│  │  - Certificate Creation (node-forge)                      │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Diagrams

### PDF Signing Flow (Synchronous)

```
┌──────────┐
│  Client  │
└────┬─────┘
     │
     │ 1. POST /signserver/process
     │    FormData: { datafile, workerName, watermark }
     │
     ▼
┌─────────────────────────────────────────────────────────────┐
│              Express Server (Port 9999)                      │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Parse FormData (formidable)                          │  │
│  │  - Extract PDF buffer                                │  │
│  │  - Extract workerName                                │  │
│  │  - Extract watermark flag                            │  │
│  └──────────────────────────────────────────────────────┘  │
│                        │                                     │
│                        ▼                                     │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  PDF Processing Pipeline                              │  │
│  │                                                        │  │
│  │  IF watermark == "true":                              │  │
│  │    └─> addWatermarkToPdf()                            │  │
│  │         - Load watermark image                        │  │
│  │         - Add to last page (bottom right)            │  │
│  │         - Make clickable                              │  │
│  │                                                        │  │
│  │  fixPdfForSignServer()                                │  │
│  │    - Fix PDF metadata                                 │  │
│  │    - Ensure SignServer compatibility                 │  │
│  │                                                        │  │
│  │  Convert to Stream                                    │  │
│  └──────────────────────────────────────────────────────┘  │
│                        │                                     │
│                        ▼                                     │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  SignServer Service                                   │  │
│  │  signPDFStream()                                      │  │
│  │    - Create FormData with workerName and PDF stream  │  │
│  │    - POST to SignServer REST API                     │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │ 2. HTTP POST to SignServer
                         │    FormData: { workerName, datafile }
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              SignServer Container                            │
│              (Port 8081)                                     │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  PDF Signing Process                                  │  │
│  │    - Load worker configuration                        │  │
│  │    - Retrieve certificate from crypto token          │  │
│  │    - Sign PDF with digital certificate                │  │
│  │    - Return signed PDF stream                         │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │ 3. Signed PDF Stream
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              Express Server                                  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Stream Response to Client                            │  │
│  │    - Content-Type: application/pdf                   │  │
│  │    - Content-Disposition: attachment                  │  │
│  │    - Pipe signed PDF stream                          │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │ 4. HTTP 200 OK
                         │    Signed PDF Stream
                         │
                         ▼
┌──────────┐
│  Client  │
└──────────┘
```

### Certificate Provisioning Flow (Asynchronous)

```
┌──────────┐
│ External │
│  System  │
└────┬─────┘
     │
     │ 1. Send Message to SQS
     │    { accountId: "12345" }
     │
     ▼
┌─────────────────────────────────────────────────────────────┐
│              AWS SQS Queue                                   │
│              (SQS_SIGNING_QUEUE_URL)                         │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │ 2. Long Poll (20s wait)
                         │    Receive up to 5 messages
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              SQS Consumer Service                            │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  pollAndProcessJobs()                                │  │
│  │    - ReceiveMessageCommand                           │  │
│  │    - Parse message body                              │  │
│  │    - Call HandleQueue(job)                          │  │
│  └──────────────────────────────────────────────────────┘  │
│                        │                                     │
│                        ▼                                     │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  HandleQueue(job)                                    │  │
│  │                                                       │  │
│  │  Step 1: Find Company                               │  │
│  │    └─> ApplicationService.findCompany(accountId)     │  │
│  │         └─> MongoDB Query                            │  │
│  │                                                       │  │
│  │  Step 2: Check Certificate                           │  │
│  │    └─> CertificateService.findByCompanyId(accountId) │  │
│  │         └─> MongoDB Query                            │  │
│  │                                                       │  │
│  │  IF certificate NOT exists:                          │  │
│  │    Step 3: Create Certificate                        │  │
│  │      ├─> createCertificate()                        │  │
│  │      │   └─> EJBCA REST API                          │  │
│  │      ├─> Generate P12 file                           │  │
│  │      ├─> Upload to S3                                │  │
│  │      └─> Save to MongoDB                             │  │
│  │                                                       │  │
│  │  Step 4: Check Workers                                │  │
│  │    ├─> checkWorkerExists(accountId + "0")           │  │
│  │    └─> checkWorkerExists(accountId + "1")           │  │
│  │         └─> Docker exec to SignServer                │  │
│  │                                                       │  │
│  │  IF crypto token NOT exists:                          │  │
│  │    Step 5: Create Crypto Token Worker                │  │
│  │      └─> CreateCryptoToken()                          │  │
│  │          └─> Docker exec to SignServer               │  │
│  │                                                       │  │
│  │  IF PDF signer NOT exists:                            │  │
│  │    Step 6: Create PDF Signer Worker                  │  │
│  │      └─> createPdfWorker()                           │  │
│  │          └─> Docker exec to SignServer               │  │
│  │                                                       │  │
│  │  Step 7: Update Certificate Records                  │  │
│  │    └─> CertificateService.updateCertificates()       │  │
│  │         └─> MongoDB Update                            │  │
│  │                                                       │  │
│  │  Step 8: Delete Message from Queue                   │  │
│  │    └─> DeleteMessageCommand                           │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## Sequence Diagrams

### PDF Signing Sequence

```
Client          Express API      PDF Utils      SignServer      MongoDB
  │                 │                │              │              │
  │──POST /signserver/process───────>│              │              │
  │   (FormData)    │                │              │              │
  │                 │                │              │              │
  │                 │──Parse FormData│              │              │
  │                 │                │              │              │
  │                 │──Extract PDF──>│              │              │
  │                 │                │              │              │
  │                 │──Add Watermark?│              │              │
  │                 │<───PDF Buffer──│              │              │
  │                 │                │              │              │
  │                 │──Fix Metadata──>│              │              │
  │                 │<───Fixed PDF───│              │              │
  │                 │                │              │              │
  │                 │──Stream to SignServer────────>│              │
  │                 │   (FormData)   │              │              │
  │                 │                │              │              │
  │                 │                │              │──Sign PDF───>│
  │                 │                │              │<──Signed PDF─│
  │                 │                │              │              │
  │                 │<──Signed PDF Stream───────────│              │
  │                 │                │              │              │
  │<──200 OK (PDF Stream)────────────│              │              │
  │                 │                │              │              │
```

### Certificate Provisioning Sequence

```
SQS Queue    SQS Consumer    App Service    Cert Service    EJBCA      SignServer    S3        MongoDB
    │              │              │              │            │            │          │            │
    │──Message─────>│              │              │            │            │          │            │
    │  {accountId}  │              │              │            │            │          │            │
    │              │              │              │            │            │          │            │
    │              │──Find Company──────────────>│            │            │          │            │
    │              │              │              │            │            │          │<──Query─────│
    │              │<──Company Data─────────────│            │            │          │            │
    │              │              │              │            │            │          │            │
    │              │──Find Certificate───────────────────────>│            │          │            │
    │              │              │              │            │            │          │<──Query─────│
    │              │<──Not Found──────────────────│            │            │          │            │
    │              │              │              │            │            │          │            │
    │              │──Create Certificate──────────────────────>│            │          │            │
    │              │              │              │            │            │          │            │
    │              │              │              │──Create Cert──>│          │          │            │
    │              │              │              │<──P12 File───│          │          │            │
    │              │              │              │            │            │          │            │
    │              │──Upload to S3─────────────────────────────────────────>│          │            │
    │              │              │              │            │            │          │            │
    │              │──Save Certificate──────────────────────────────────────────────────>│            │
    │              │              │              │            │            │          │            │
    │              │──Check Workers──────────────────────────────────────────>│          │            │
    │              │              │              │            │            │          │            │
    │              │              │              │            │<──Not Found─│          │            │
    │              │              │              │            │            │          │            │
    │              │──Create Crypto Token─────────────────────────────────────>│          │            │
    │              │              │              │            │            │          │            │
    │              │──Create PDF Worker───────────────────────────────────────>│          │            │
    │              │              │              │            │            │          │            │
    │              │──Update Certificate──────────────────────────────────────────────────>│            │
    │              │              │              │            │            │          │            │
    │              │──Delete Message───────────>│            │            │          │            │
    │              │              │              │            │            │          │            │
```

---

## Technology Stack

### Runtime & Framework

```
┌─────────────────────────────────────────────────────────┐
│                  Runtime Environment                      │
├─────────────────────────────────────────────────────────┤
│  Node.js 18+          │  JavaScript Runtime              │
│  TypeScript 5.8+      │  Type Safety & Compilation      │
│  Express.js 5.1+      │  Web Framework                 │
└─────────────────────────────────────────────────────────┘
```

### Data Layer

```
┌─────────────────────────────────────────────────────────┐
│                    Database Layer                        │
├─────────────────────────────────────────────────────────┤
│  MongoDB              │  Document Database              │
│  └─ Mongoose 6.8+     │  ODM with Encryption            │
│                       │                                 │
│  MariaDB              │  Relational Database              │
│  └─ Via Docker        │  For EJBCA/SignServer           │
└─────────────────────────────────────────────────────────┘
```

### AWS Services

```
┌─────────────────────────────────────────────────────────┐
│                    AWS Integration                        │
├─────────────────────────────────────────────────────────┤
│  SQS                   │  Message Queue                  │
│  └─ @aws-sdk/client-sqs│  Job Processing                │
│                       │                                 │
│  S3                   │  Object Storage                 │
│  └─ @aws-sdk/client-s3│  Certificate Storage            │
└─────────────────────────────────────────────────────────┘
```

### PKI Infrastructure

```
┌─────────────────────────────────────────────────────────┐
│                  PKI Services (Docker)                    │
├─────────────────────────────────────────────────────────┤
│  EJBCA CE              │  Certificate Authority          │
│  └─ Port 8082/8445     │  Certificate Issuance           │
│                       │                                 │
│  SignServer CE        │  PDF Signing Service             │
│  └─ Port 8081/8444     │  Digital Signatures             │
└─────────────────────────────────────────────────────────┘
```

### Libraries & Utilities

```
┌─────────────────────────────────────────────────────────┐
│                  Supporting Libraries                     │
├─────────────────────────────────────────────────────────┤
│  pdf-lib 1.17+         │  PDF Manipulation               │
│  formidable 3.5+       │  FormData Parsing               │
│  axios 1.9+            │  HTTP Client                    │
│  node-forge 1.3+       │  Cryptography                   │
│  mongoose-encryption   │  Field Encryption               │
│  @sentry/node          │  Error Tracking                 │
└─────────────────────────────────────────────────────────┘
```

---

## Integration Architecture

### EJBCA Integration

```
┌─────────────────────────────────────────────────────────┐
│              EJBCA Service Integration                    │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  GetSign Flow Service                                    │
│         │                                                │
│         │ HTTP REST API                                  │
│         │                                                │
│         ▼                                                │
│  ┌──────────────────────────────────────┐              │
│  │         EJBCA Container               │              │
│  │  (http://localhost:8082/ejbca)        │              │
│  │                                        │              │
│  │  ┌────────────────────────────────┐  │              │
│  │  │  REST API Endpoints             │  │              │
│  │  │  - /ejbca/rest/v1/ca/...        │  │              │
│  │  │  - /ejbca/rest/v1/certificate/..│  │              │
│  │  └────────────────────────────────┘  │              │
│  │                                        │              │
│  │  ┌────────────────────────────────┐  │              │
│  │  │  Certificate Operations         │  │              │
│  │  │  - Create Certificate           │  │              │
│  │  │  - Issue Certificate             │  │              │
│  │  │  - Revoke Certificate            │  │              │
│  │  └────────────────────────────────┘  │              │
│  │                                        │              │
│  │         │                              │              │
│  │         ▼                              │              │
│  │  ┌────────────────────────────────┐  │              │
│  │  │  MariaDB Database               │  │              │
│  │  │  - Certificate Data             │  │              │
│  │  │  - CA Configuration             │  │              │
│  │  └────────────────────────────────┘  │              │
│  └──────────────────────────────────────┘              │
└─────────────────────────────────────────────────────────┘
```

### SignServer Integration

```
┌─────────────────────────────────────────────────────────┐
│            SignServer Service Integration                 │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  GetSign Flow Service                                    │
│         │                                                │
│         │ HTTP REST API                                  │
│         │                                                │
│         ▼                                                │
│  ┌──────────────────────────────────────┐              │
│  │       SignServer Container            │              │
│  │  (http://localhost:8081/signserver)   │              │
│  │                                        │              │
│  │  ┌────────────────────────────────┐  │              │
│  │  │  REST API Endpoints             │  │              │
│  │  │  - /signserver/process          │  │              │
│  │  │  - /signserver/worker/...       │  │              │
│  │  └────────────────────────────────┘  │              │
│  │                                        │              │
│  │  ┌────────────────────────────────┐  │              │
│  │  │  Worker Management               │  │              │
│  │  │  - Crypto Token Workers         │  │              │
│  │  │  - PDF Signer Workers           │  │              │
│  │  │  - Worker Configuration         │  │              │
│  │  └────────────────────────────────┘  │              │
│  │                                        │              │
│  │  ┌────────────────────────────────┐  │              │
│  │  │  PDF Signing Process            │  │              │
│  │  │  - Load Certificate             │  │              │
│  │  │  - Sign PDF Document            │  │              │
│  │  │  - Return Signed PDF            │  │              │
│  │  └────────────────────────────────┘  │              │
│  │                                        │              │
│  │         │                              │              │
│  │         ▼                              │              │
│  │  ┌────────────────────────────────┐  │              │
│  │  │  MariaDB Database               │  │              │
│  │  │  - Worker Configuration         │  │              │
│  │  │  - Key Data                     │  │              │
│  │  │  - Audit Records                │  │              │
│  │  └────────────────────────────────┘  │              │
│  └──────────────────────────────────────┘              │
└─────────────────────────────────────────────────────────┘
```

### AWS Integration

```
┌─────────────────────────────────────────────────────────┐
│                  AWS Services Integration                 │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────────────────────────────┐              │
│  │         AWS SQS Queue                 │              │
│  │                                        │              │
│  │  Message Format:                      │              │
│  │  {                                    │              │
│  │    "accountId": "12345"              │              │
│  │  }                                    │              │
│  │                                        │              │
│  │  Queue Attributes:                    │              │
│  │  - Visibility Timeout: 300s          │              │
│  │  - Message Retention: 14 days       │              │
│  │  - Long Polling: 20s                 │              │
│  └──────────────────────────────────────┘              │
│         ▲                    │                           │
│         │                    │                           │
│  ┌──────┴──────┐    ┌───────▼────────┐                │
│  │   Producer  │    │    Consumer     │                │
│  │  (External) │    │ (GetSign Flow)  │                │
│  └─────────────┘    └────────────────┘                │
│                                                          │
│  ┌──────────────────────────────────────┐              │
│  │         AWS S3 Bucket                │              │
│  │                                        │              │
│  │  Certificate Storage:                 │              │
│  │  - P12 Files                          │              │
│  │  - Metadata                           │              │
│  │                                        │              │
│  │  Operations:                          │              │
│  │  - PutObject (Upload)                 │              │
│  │  - GetObject (Download)                │              │
│  │  - DeleteObject (Cleanup)              │              │
│  └──────────────────────────────────────┘              │
└─────────────────────────────────────────────────────────┘
```

---

## Security Architecture

### Security Layers

```
┌─────────────────────────────────────────────────────────┐
│                  Security Architecture                    │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │  Layer 1: Network Security                          │ │
│  │  - HTTPS/TLS for production                         │ │
│  │  - Firewall rules                                   │ │
│  │  - VPN/Private network for internal services        │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │  Layer 2: Application Security                      │ │
│  │  - Input validation                                 │ │
│  │  - File type validation                             │ │
│  │  - Rate limiting (to be implemented)                │ │
│  │  - Authentication/Authorization (to be implemented) │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │  Layer 3: Data Security                              │ │
│  │  - Field-level encryption (mongoose-encryption)     │ │
│  │  - Encrypted certificate passwords                 │ │
│  │  - Secure key storage (environment variables)        │ │
│  │  - TLS for database connections                    │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │  Layer 4: Infrastructure Security                   │ │
│  │  - Docker container isolation                        │ │
│  │  - AWS IAM roles and policies                       │ │
│  │  - Secure credential management                     │ │
│  │  - Regular security updates                         │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### Data Encryption Flow

```
┌─────────────────────────────────────────────────────────┐
│              Data Encryption Architecture                 │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Certificate Password Encryption:                        │
│                                                          │
│  ┌──────────┐                                           │
│  │  Client  │                                           │
│  └────┬─────┘                                           │
│       │                                                 │
│       │ Certificate Password                            │
│       ▼                                                 │
│  ┌──────────────────────────────────────┐              │
│  │  mongoose-encryption                 │              │
│  │  - Encryption Key: 32-byte base64   │              │
│  │  - Signature Key: 64-byte base64    │              │
│  │  - Automatic encryption on save      │              │
│  │  - Automatic decryption on read     │              │
│  └──────────────────────────────────────┘              │
│       │                                                 │
│       │ Encrypted Data                                  │
│       ▼                                                 │
│  ┌──────────────────────────────────────┐              │
│  │  MongoDB                              │              │
│  │  - Encrypted password field           │              │
│  │  - Plain metadata fields              │              │
│  └──────────────────────────────────────┘              │
└─────────────────────────────────────────────────────────┘
```

---

## Deployment Architecture

### Development Environment

```
┌─────────────────────────────────────────────────────────┐
│              Development Deployment                       │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────────────────────────────┐              │
│  │  Developer Machine                    │              │
│  │                                       │              │
│  │  ┌────────────────────────────────┐  │              │
│  │  │  GetSign Flow Service          │  │              │
│  │  │  - npm start (ts-node-dev)     │  │              │
│  │  │  - Port 9999                   │  │              │
│  │  │  - Hot reload enabled           │  │              │
│  │  └────────────────────────────────┘  │              │
│  │                                       │              │
│  │  ┌────────────────────────────────┐  │              │
│  │  │  Docker Compose                 │  │              │
│  │  │  - EJBCA (8082)                 │  │              │
│  │  │  - SignServer (8081)            │  │              │
│  │  │  - MariaDB databases            │  │              │
│  │  └────────────────────────────────┘  │              │
│  │                                       │              │
│  │  ┌────────────────────────────────┐  │              │
│  │  │  Local MongoDB                 │  │              │
│  │  │  - Development database         │  │              │
│  │  └────────────────────────────────┘  │              │
│  └──────────────────────────────────────┘              │
└─────────────────────────────────────────────────────────┘
```

### Production Environment

```
┌─────────────────────────────────────────────────────────┐
│              Production Deployment                       │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │  Load Balancer (Nginx/ALB)                         │ │
│  │  - SSL Termination                                 │ │
│  │  - Request Routing                                 │ │
│  │  - Health Checks                                   │ │
│  └────────────────────────────────────────────────────┘ │
│         │                    │                           │
│         │                    │                           │
│  ┌──────▼──────┐    ┌───────▼────────┐                │
│  │  Instance 1 │    │  Instance 2     │                │
│  │             │    │                │                │
│  │  ┌────────┐ │    │  ┌──────────┐ │                │
│  │  │ PM2    │ │    │  │ PM2      │ │                │
│  │  │ Cluster│ │    │  │ Cluster  │ │                │
│  │  └────────┘ │    │  └──────────┘ │                │
│  │             │    │                │                │
│  │  ┌────────┐ │    │  ┌──────────┐ │                │
│  │  │ Node.js │ │    │  │ Node.js  │ │                │
│  │  │ App     │ │    │  │ App      │ │                │
│  │  └────────┘ │    │  └──────────┘ │                │
│  └─────────────┘    └────────────────┘                │
│         │                    │                           │
│         └──────────┬─────────┘                           │
│                    │                                     │
│  ┌─────────────────▼─────────────────────────────────┐ │
│  │  Shared Services                                    │ │
│  │                                                     │ │
│  │  ┌──────────────────────────────────────────────┐ │ │
│  │  │  MongoDB (Atlas/Self-hosted)                 │ │ │
│  │  │  - Replica Set                                │ │ │
│  │  │  - Automated Backups                         │ │ │
│  │  └──────────────────────────────────────────────┘ │ │
│  │                                                     │ │
│  │  ┌──────────────────────────────────────────────┐ │ │
│  │  │  Docker Services (Orchestrated)               │ │ │
│  │  │  - EJBCA Cluster                              │ │ │
│  │  │  - SignServer Cluster                         │ │ │
│  │  │  - MariaDB (Master-Slave)                     │ │ │
│  │  └──────────────────────────────────────────────┘ │ │
│  │                                                     │ │
│  │  ┌──────────────────────────────────────────────┐ │ │
│  │  │  AWS Services                                  │ │ │
│  │  │  - SQS Queue                                  │ │ │
│  │  │  - S3 Bucket                                  │ │ │
│  │  └──────────────────────────────────────────────┘ │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

---

## Scalability & Performance

### Horizontal Scaling Strategy

```
┌─────────────────────────────────────────────────────────┐
│              Scaling Architecture                        │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Stateless API Design:                                   │
│  ┌────────────────────────────────────────────────────┐ │
│  │  - No session state                                │ │
│  │  - No local file storage                           │ │
│  │  - All state in external services                  │ │
│  │  - Enables instant horizontal scaling               │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  Load Distribution:                                       │
│                                                          │
│         ┌──────────┐                                    │
│         │   LB     │                                    │
│         └────┬─────┘                                    │
│              │                                           │
│    ┌─────────┼─────────┐                               │
│    │         │         │                               │
│  ┌─▼─┐    ┌─▼─┐    ┌─▼─┐                             │
│  │App1│    │App2│    │App3│                             │
│  └───┘    └───┘    └───┘                             │
│    │         │         │                               │
│    └─────────┼─────────┘                               │
│              │                                           │
│         ┌────▼─────┐                                   │
│         │  Shared   │                                   │
│         │  Services │                                   │
│         └───────────┘                                   │
│                                                          │
│  SQS Job Distribution:                                   │
│  ┌────────────────────────────────────────────────────┐ │
│  │  - Multiple consumers poll same queue               │ │
│  │  - SQS distributes messages across consumers       │ │
│  │  - Visibility timeout prevents duplicate processing│ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### Performance Optimizations

```
┌─────────────────────────────────────────────────────────┐
│              Performance Features                        │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1. Streaming Processing:                               │
│     - PDFs processed as streams (no size limits)        │
│     - No temporary file creation                        │
│     - Memory efficient                                  │
│                                                          │
│  2. Connection Pooling:                                 │
│     - MongoDB: max 10 connections per instance          │
│     - Reuse connections across requests                  │
│                                                          │
│  3. Asynchronous Processing:                             │
│     - SQS for background jobs                           │
│     - Non-blocking I/O operations                       │
│                                                          │
│  4. Caching Opportunities:                              │
│     - Worker status (future)                             │
│     - Certificate metadata (future)                      │
│     - Company data (future)                             │
└─────────────────────────────────────────────────────────┘
```

---

## Summary

This architecture document provides a comprehensive overview of the GetSign Flow Service system. Key highlights:

- **Microservice Architecture**: Modular, scalable design
- **Streaming Processing**: Efficient handling of large PDFs
- **Event-Driven**: Asynchronous job processing via SQS
- **Container-Based**: Docker for PKI infrastructure
- **Security-First**: Multiple layers of security
- **Horizontally Scalable**: Stateless design enables easy scaling

For implementation details, see:
- [README.md](./README.md) - Setup and usage
- [API.md](./API.md) - API reference
- [DEVELOPMENT.md](./DEVELOPMENT.md) - Development guide
- [DEPLOYMENT.md](./DEPLOYMENT.md) - Deployment guide

