# Development Guide

This guide covers setting up and developing GetSign Flow Service locally.

## Prerequisites

- **Node.js** 18+ ([Download](https://nodejs.org/))
- **npm** or **yarn** package manager
- **Docker** and **Docker Compose** ([Install](https://docs.docker.com/get-docker/))
- **Git** for version control
- **MongoDB** (local or remote instance)
- **Code Editor** (VS Code recommended)

## Initial Setup

### 1. Clone Repository

```bash
git clone <repository-url>
cd getsign-flow_service
```

### 2. Install Dependencies

```bash
npm install
# or
yarn install
```

### 3. Set Up Environment Variables

Create a `.env` file in the root directory:

```bash
cp .env.example .env  # If example exists
# or create manually
```

Edit `.env` with your local configuration:

```bash
# Environment
ENVIRONMENT=development

# AWS Configuration (use test/development credentials)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-dev-access-key
AWS_SECRET_ACCESS_KEY=your-dev-secret-key
SQS_SIGNING_QUEUE_URL=https://sqs.region.amazonaws.com/account/dev-queue

# Database (local MongoDB)
DB_URL=mongodb://localhost:27017/getsign-flow-dev

# Encryption Keys (generate for development)
SOME_32BYTE_BASE64_STRING=dev-32-byte-base64-key
SOME_64BYTE_BASE64_STRING=dev-64-byte-base64-key

# Sentry (optional for development)
SENTRY_DSN=your-dev-sentry-dsn
```

### 4. Start Docker Services

Start EJBCA and SignServer:

```bash
docker-compose up -d
```

Wait for services to initialize (check logs):

```bash
docker-compose logs -f
```

Services should be available at:
- EJBCA: http://localhost:8082
- SignServer: http://localhost:8081

### 5. Start MongoDB

If using local MongoDB:

```bash
# macOS (Homebrew)
brew services start mongodb-community

# Linux (systemd)
sudo systemctl start mongod

# Or use MongoDB Atlas for cloud instance
```

### 6. Start Development Server

```bash
npm start
```

The server will start on `http://localhost:9999` with hot reload enabled.

## Project Structure

```
getsign-flow_service/
├── src/
│   ├── config/          # Configuration management
│   │   └── index.ts
│   ├── const/           # Constants
│   │   ├── aws.ts
│   │   ├── ejbca.ts
│   │   ├── signserver.ts
│   │   └── worker.ts
│   ├── infrastructure/  # Infrastructure setup
│   │   ├── db.ts        # MongoDB connection
│   │   └── sentry.ts    # Sentry setup
│   ├── interfaces/      # TypeScript interfaces
│   │   ├── application.ts
│   │   ├── certificate.ts
│   │   ├── job.ts
│   │   └── ...
│   ├── model/           # MongoDB models
│   │   ├── application.ts
│   │   ├── certificate.ts
│   │   └── ...
│   ├── public/          # Static assets
│   │   └── watermark/
│   ├── services/        # Business logic
│   │   ├── application/
│   │   ├── certificate/
│   │   ├── ejbca/
│   │   ├── signserver/
│   │   ├── sqs/
│   │   └── ...
│   ├── utils/           # Utility functions
│   │   ├── watermark.ts
│   │   ├── pdf-fix.ts
│   │   └── ...
│   └── index.ts         # Application entry point
├── config/              # Additional config files
├── dist/                # Compiled JavaScript (generated)
├── docker-compose.yml   # Docker services
├── package.json
├── tsconfig.json
└── .env                 # Environment variables (not in git)
```

## Development Workflow

### Making Changes

1. **Create a feature branch:**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes:**
   - Edit TypeScript files in `src/`
   - Server auto-reloads on save (ts-node-dev)

3. **Test your changes:**
   ```bash
   # Test API endpoints
   curl http://localhost:9999/health
   
   # Test PDF signing
   curl -X POST http://localhost:9999/signserver/process \
     -F "datafile=@test.pdf" \
     -F "workerName=6282336"
   ```

4. **Check for errors:**
   - Watch console output
   - Check Sentry (if configured)
   - Review application logs

5. **Commit and push:**
   ```bash
   git add .
   git commit -m "Description of changes"
   git push origin feature/your-feature-name
   ```

### Code Style

- Use TypeScript strict mode
- Follow existing code patterns
- Use meaningful variable names
- Add comments for complex logic
- Keep functions focused and small

### TypeScript Configuration

The project uses:
- **Strict mode**: Enabled
- **Target**: ES2016
- **Module**: CommonJS
- **Path aliases**: `@services/*`, `@types/*`

## Testing

### Manual Testing

#### Health Check
```bash
curl http://localhost:9999/health
```

#### SignServer Health
```bash
curl http://localhost:9999/health/signserver
```

#### PDF Signing
```bash
curl -X POST http://localhost:9999/signserver/process \
  -F "datafile=@sample.pdf" \
  -F "workerName=6282336" \
  -F "watermark=true" \
  --output signed.pdf
```

### Testing SQS Jobs

1. Send a test message to SQS queue:
   ```javascript
   // Using AWS SDK
   const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
   
   const sqs = new SQSClient({ region: 'us-east-1' });
   await sqs.send(new SendMessageCommand({
     QueueUrl: process.env.SQS_SIGNING_QUEUE_URL,
     MessageBody: JSON.stringify({
       accountId: 'test-account-id'
     })
   }));
   ```

2. Check application logs for job processing

### Testing with Postman

1. Import collection (if available)
2. Set environment variables
3. Test endpoints:
   - Health checks
   - PDF signing with sample file

## Debugging

### VS Code Debugging

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug GetSign Flow",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["start"],
      "skipFiles": ["<node_internals>/**"],
      "env": {
        "NODE_ENV": "development"
      }
    }
  ]
}
```

### Console Logging

Add debug logs:

```typescript
console.log('Debug info:', variable);
console.error('Error:', error);
```

### MongoDB Debugging

Enable Mongoose debug mode (already enabled in development):

```typescript
// In db.ts
if (config.env === "development") {
  mongoose.set("debug", true);
}
```

### Docker Debugging

View container logs:

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f signserver
docker-compose logs -f ejbca

# Execute commands in container
docker exec -it signserver bash
```

## Common Development Tasks

### Adding a New Endpoint

1. Add route in `src/index.ts`:
   ```typescript
   app.post('/api/new-endpoint', async (req, res) => {
     // Handler logic
   });
   ```

2. Add error handling with Sentry:
   ```typescript
   try {
     // Logic
   } catch (error) {
     Sentry.captureException(error, {
       tags: { service: 'your-service', operation: 'your-operation' }
     });
     res.status(500).json({ error: 'Error message' });
   }
   ```

### Adding a New Service

1. Create service file in `src/services/your-service/`:
   ```typescript
   export class YourService {
     async yourMethod() {
       // Implementation
     }
   }
   ```

2. Export from `src/services/index.ts`:
   ```typescript
   export { YourService } from './your-service';
   ```

3. Use in other services or endpoints

### Adding a New Model

1. Create model file in `src/model/your-model.ts`:
   ```typescript
   import mongoose from 'mongoose';
   
   const YourModelSchema = new mongoose.Schema({
     field: { type: String, required: true }
   });
   
   export const YourModel = mongoose.model('YourModel', YourModelSchema);
   ```

2. Export from `src/model/index.ts`

### Working with SQS

#### Enqueue a Job

```typescript
import { enqueueSignJob } from './services/sqs';

await enqueueSignJob({
  accountId: 'account-123'
});
```

#### Process Jobs

Jobs are automatically processed by the SQS consumer. Check `src/services/sqs/handleQueue.ts` for job handling logic.

## Database Management

### MongoDB Operations

#### Connect to MongoDB

```bash
# Using MongoDB shell
mongosh mongodb://localhost:27017/getsign-flow-dev

# Or using MongoDB Compass (GUI)
```

#### View Collections

```javascript
// In MongoDB shell
show collections
db.applications.find()
db.certificates.find()
```

#### Reset Database (Development Only)

```bash
# Drop database
mongosh mongodb://localhost:27017/getsign-flow-dev --eval "db.dropDatabase()"
```

### Database Migrations

Currently, Mongoose handles schema automatically. For production migrations, consider using a migration tool like `migrate-mongo`.

## Docker Development

### Rebuild Containers

```bash
docker-compose down
docker-compose up -d --build
```

### Reset Docker Data

⚠️ **Warning**: This deletes all data

```bash
docker-compose down -v
docker-compose up -d
```

### Access Container Shells

```bash
# SignServer
docker exec -it signserver bash

# EJBCA
docker exec -it ejbca bash

# Database
docker exec -it signserver-database bash
```

## Troubleshooting

### Port Already in Use

```bash
# Find process using port 9999
lsof -i :9999

# Kill process
kill -9 <PID>
```

### MongoDB Connection Issues

1. Check MongoDB is running
2. Verify connection string in `.env`
3. Check network connectivity
4. Verify authentication credentials

### Docker Issues

1. Check Docker is running: `docker ps`
2. View container logs: `docker-compose logs`
3. Restart containers: `docker-compose restart`
4. Check disk space: `docker system df`

### TypeScript Errors

1. Check `tsconfig.json` configuration
2. Run type check: `npx tsc --noEmit`
3. Clear node_modules and reinstall: `rm -rf node_modules && npm install`

### SignServer Errors

1. Check SignServer is running: `docker ps | grep signserver`
2. Check SignServer logs: `docker-compose logs signserver`
3. Verify worker exists: Check health endpoint
4. Check certificate configuration

## Best Practices

### Code Organization

- Keep services focused on single responsibility
- Use interfaces for type safety
- Extract reusable logic to utils
- Keep models simple and focused

### Error Handling

- Always use try-catch blocks
- Capture errors in Sentry with context
- Provide meaningful error messages
- Log errors appropriately

### Performance

- Use streaming for large files
- Avoid loading entire files into memory
- Use connection pooling
- Optimize database queries

### Security

- Never commit `.env` file
- Use environment variables for secrets
- Validate all inputs
- Sanitize file uploads
- Use HTTPS in production

## Resources

- [Express.js Documentation](https://expressjs.com/)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [Mongoose Documentation](https://mongoosejs.com/docs/)
- [AWS SDK v3 Documentation](https://docs.aws.amazon.com/sdk-for-javascript/v3/)
- [SignServer Documentation](https://doc.primekey.com/signserver)
- [EJBCA Documentation](https://doc.primekey.com/ejbca)

## Getting Help

- Check existing documentation
- Review code comments
- Check Sentry for error history
- Review application logs
- Contact development team

