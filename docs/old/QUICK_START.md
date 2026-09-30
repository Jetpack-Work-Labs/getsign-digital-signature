# Quick Start Guide

Get up and running with GetSign Flow Service in 5 minutes.

## Prerequisites

- Node.js 18+
- Docker and Docker Compose
- MongoDB (local or remote)

## Setup Steps

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Create `.env` file:

```bash
ENVIRONMENT=development
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
SQS_SIGNING_QUEUE_URL=your-queue-url
DB_URL=mongodb://localhost:27017/getsign-flow
SOME_32BYTE_BASE64_STRING=$(openssl rand -base64 32)
SOME_64BYTE_BASE64_STRING=$(openssl rand -base64 64)
```

### 3. Start Docker Services

```bash
docker-compose up -d
```

Wait ~2 minutes for services to initialize.

### 4. Start Application

```bash
npm start
```

Service runs on `http://localhost:9999`

## Quick Tests

### Health Check

```bash
curl http://localhost:9999/health
```

### Sign PDF

```bash
curl -X POST http://localhost:9999/signserver/process \
  -F "datafile=@sample.pdf" \
  -F "workerName=6282336" \
  -F "watermark=true" \
  --output signed.pdf
```

## Common Commands

```bash
# Start services
docker-compose up -d
npm start

# View logs
docker-compose logs -f
pm2 logs  # if using PM2

# Stop services
docker-compose down
pm2 stop getsign-flow

# Rebuild
npm run build
```

## Next Steps

- Read [README.md](./README.md) for full documentation
- Check [DEVELOPMENT.md](./DEVELOPMENT.md) for development guide
- Review [API.md](./API.md) for API reference
- See [DEPLOYMENT.md](./DEPLOYMENT.md) for production deployment

## Troubleshooting

**Service won't start?**
- Check all environment variables are set
- Verify MongoDB is running
- Ensure Docker services are up: `docker ps`

**SignServer errors?**
- Check SignServer is running: `docker ps | grep signserver`
- View logs: `docker-compose logs signserver`
- Wait for initialization (may take a few minutes)

**Port in use?**
```bash
lsof -i :9999  # Find process
kill -9 <PID>  # Kill process
```

## Need Help?

- Check the full [README.md](./README.md)
- Review [DEVELOPMENT.md](./DEVELOPMENT.md)
- Check application logs
- Review Docker container logs

