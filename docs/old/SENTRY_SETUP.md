# Sentry Error Tracking Setup

This document explains the Sentry integration for tracking SignServer errors in the GetSign Flow Service.

## Overview

Sentry has been integrated to capture and track errors throughout the application, with a specific focus on SignServer operations including:

- PDF signing operations
- Docker command execution
- Worker creation and management
- Crypto token operations
- Health check failures

## Configuration

### 1. Set up Sentry DSN

Add the following environment variables to your `.env` file:

```bash
SENTRY_DSN=your-sentry-dsn-here
ENVIRONMENT=production  # or development
```

### 2. Get Your Sentry DSN

1. Create a Sentry account at [sentry.io](https://sentry.io)
2. Create a new project for Node.js
3. Copy the DSN from your project settings
4. Add it to your `.env` file

## Features

### Error Tracking

All SignServer errors are automatically captured with:

- **Tags**: Service name, operation type, worker ID
- **Context**: Additional details like file names, worker names, command strings
- **Stack traces**: Full error stack traces for debugging

### Error Categories

#### 1. SignServer Health Check Errors

- **Operation**: `health_check`
- **Context**: Endpoint information

#### 2. PDF Signing Errors

- **Operations**:
  - `parse_formdata`: FormData parsing errors
  - `add_watermark`: Watermark addition errors (warning level)
  - `fix_pdf_metadata`: PDF metadata fixing errors (warning level)
  - `process_request`: Request processing errors
  - `sign_pdf`: General PDF signing errors
  - `sign_pdf_stream`: SignServer stream signing errors

#### 3. Docker Command Errors

- **Operation**: `docker_command`
- **Context**: Full command string that failed

#### 4. Worker Management Errors

- **Operations**:
  - `check_worker_exists`: Worker existence check failures
  - `activate_all`: Worker activation errors
  - `create_crypto_token`: Crypto token creation errors
  - `create_crypto_token_worker`: Crypto token worker setup errors
  - `create_pdf_worker`: PDF worker setup errors

### Performance Monitoring

The integration includes:

- Request tracing for all HTTP requests
- Performance profiling
- 100% trace sampling (configurable in production)

## Usage

### Viewing Errors

1. Log in to [sentry.io](https://sentry.io)
2. Navigate to your project
3. View errors in the Issues tab
4. Filter by tags:
   - `service:signserver`
   - `operation:<operation_name>`
   - `worker:<worker_id>`

### Understanding Error Context

Each error includes:

**Tags** (for filtering):

```javascript
{
  service: "signserver",
  operation: "sign_pdf_stream",
  worker: "62823351"
}
```

**Context** (for debugging):

```javascript
{
  signserver: {
    url: "https://...",
    worker: "62823351",
    filename: "document.pdf"
  },
  docker: {
    command: "docker exec signserver..."
  },
  file: {
    filename: "document.pdf",
    workerName: "62823351"
  }
}
```

## Customization

### Adjusting Sample Rates

In `src/infrastructure/sentry.ts`, you can adjust:

```typescript
Sentry.init({
  dsn,
  environment: process.env.ENVIRONMENT || "development",
  tracesSampleRate: 1.0, // 100% of transactions (change to 0.1 for 10%)
  profilesSampleRate: 1.0, // 100% profiling
});
```

### Adding Custom Error Capture

To manually capture errors with context:

```typescript
import { Sentry } from "./infrastructure";

try {
  // Your code
} catch (error) {
  Sentry.captureException(error, {
    tags: {
      service: "signserver",
      operation: "your_operation",
    },
    contexts: {
      custom: {
        key: "value",
      },
    },
  });
  throw error;
}
```

## Troubleshooting

### Sentry Not Initializing

If you see the warning: `⚠️ SENTRY_DSN not configured`, ensure:

1. Your `.env` file contains `SENTRY_DSN`
2. The DSN value is correct
3. The application has been restarted after adding the DSN

### No Errors Appearing in Sentry

1. Verify the DSN is correct
2. Check that errors are actually occurring
3. Ensure your network allows outbound connections to Sentry
4. Check the Sentry project's inbound filters

## Best Practices

1. **Use Warning Level**: For non-critical errors (like watermark failures), use `level: "warning"`
2. **Add Context**: Always include relevant context (file names, worker IDs, etc.)
3. **Tag Appropriately**: Use consistent tags for filtering
4. **Don't Log Sensitive Data**: Avoid capturing passwords or sensitive information
5. **Review Regularly**: Check Sentry dashboard regularly for new issues

## Security Note

The Sentry DSN is not a secret and can be included in client-side code. However, keep your Sentry auth token secure and never commit it to version control.
