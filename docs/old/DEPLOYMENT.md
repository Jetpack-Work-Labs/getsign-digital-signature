# Deployment Guide

This guide covers deploying GetSign Flow Service to production environments.

## Pre-Deployment Checklist

- [ ] All environment variables configured
- [ ] MongoDB instance accessible and configured
- [ ] AWS credentials with proper permissions
- [ ] SQS queue created and accessible
- [ ] S3 bucket created for certificate storage
- [ ] Docker services (EJBCA/SignServer) running
- [ ] Sentry DSN configured (optional but recommended)
- [ ] SSL/TLS certificates for HTTPS (production)
- [ ] Process manager configured (PM2, systemd, etc.)
- [ ] Monitoring and logging set up
- [ ] Backup strategy for databases

## Environment Setup

### 1. Production Environment Variables

Create a `.env` file with production values:

```bash
# Environment
ENVIRONMENT=production

# AWS Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-production-access-key
AWS_SECRET_ACCESS_KEY=your-production-secret-key
SQS_SIGNING_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/account/queue-name

# Database (use connection string with authentication)
DB_URL=mongodb://username:password@host:27017/getsign-flow?authSource=admin&tls=true

# Encryption Keys (generate new keys for production)
SOME_32BYTE_BASE64_STRING=generate-32-byte-base64-key
SOME_64BYTE_BASE64_STRING=generate-64-byte-base64-key

# Sentry
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
```

### 2. Generate Encryption Keys

Generate secure encryption keys:

```bash
# Generate 32-byte key (base64)
openssl rand -base64 32

# Generate 64-byte key (base64)
openssl rand -base64 64
```

**Important:** Store these keys securely. If keys are lost, encrypted data cannot be decrypted.

### 3. MongoDB Setup

#### Using MongoDB Atlas (Recommended)

1. Create a MongoDB Atlas cluster
2. Configure network access (whitelist your server IP)
3. Create a database user
4. Get connection string
5. Update `DB_URL` in `.env`

#### Using Self-Hosted MongoDB

1. Install MongoDB on server
2. Enable authentication
3. Create database and user
4. Configure TLS/SSL
5. Update `DB_URL` in `.env`

### 4. AWS Configuration

#### SQS Queue Setup

1. Create SQS queue in AWS Console
2. Configure queue settings:
   - Visibility timeout: 300 seconds (5 minutes)
   - Message retention: 14 days
   - Dead letter queue: Recommended
3. Get queue URL
4. Update `SQS_SIGNING_QUEUE_URL` in `.env`

#### S3 Bucket Setup

1. Create S3 bucket for certificate storage
2. Configure bucket policy:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::ACCOUNT:user/SERVICE-USER"
      },
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::BUCKET-NAME/*"
    }
  ]
}
```
3. Enable versioning (optional but recommended)
4. Configure lifecycle policies if needed

#### IAM User Permissions

Create IAM user with following permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes",
        "sqs:SendMessage"
      ],
      "Resource": "arn:aws:sqs:*:*:QUEUE-NAME"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::BUCKET-NAME/*"
    }
  ]
}
```

### 5. Docker Services Setup

#### Production Docker Compose

Create `docker-compose.prod.yml`:

```yaml
version: "3"
networks:
  application-bridge:
    driver: bridge
services:
  ejbca-database:
    container_name: ejbca-database-prod
    image: "mariadb:latest"
    networks:
      - application-bridge
    environment:
      - MYSQL_ROOT_PASSWORD=${EJBCA_DB_ROOT_PASSWORD}
      - MYSQL_DATABASE=ejbca
      - MYSQL_USER=ejbca
      - MYSQL_PASSWORD=${EJBCA_DB_PASSWORD}
    volumes:
      - ./ejbca-db:/var/lib/mysql:rw
    restart: unless-stopped

  signserver-database:
    container_name: signserver-database-prod
    image: "mariadb:latest"
    networks:
      - application-bridge
    environment:
      - MYSQL_ROOT_PASSWORD=${SIGNSERVER_DB_ROOT_PASSWORD}
      - MYSQL_DATABASE=signserver
      - MYSQL_USER=signserver
      - MYSQL_PASSWORD=${SIGNSERVER_DB_PASSWORD}
    volumes:
      - ./signserver-db:/var/lib/mysql:rw
    restart: unless-stopped

  ejbca-node1:
    hostname: ejbca-node1
    container_name: ejbca-prod
    image: keyfactor/ejbca-ce:latest
    depends_on:
      - ejbca-database
    networks:
      - application-bridge
    environment:
      - DATABASE_JDBC_URL=jdbc:mariadb://ejbca-database:3306/ejbca?characterEncoding=UTF-8
      - LOG_LEVEL_APP=INFO
      - LOG_LEVEL_SERVER=INFO
      - TLS_SETUP_ENABLED=simple
      - EJBCA_WEB_RESTAPI_ENABLED=true
    ports:
      - "8082:8080"
      - "8445:8443"
    restart: unless-stopped

  signserver:
    container_name: signserver-prod
    image: keyfactor/signserver-ce:latest
    depends_on:
      - signserver-database
    networks:
      - application-bridge
    environment:
      - DATABASE_JDBC_URL=jdbc:mariadb://signserver-database:3306/signserver?characterEncoding=UTF-8
      - DATABASE_NAME=signserver
      - DATABASE_USER=signserver
      - DATABASE_PASSWORD=${SIGNSERVER_DB_PASSWORD}
      - LOG_LEVEL_APP=INFO
      - LOG_LEVEL_SERVER=INFO
      - GLOB.ALLOWANYWSADMIN=true
      - SIGNSERVER_REST_API_ENABLED=true
    ports:
      - "8081:8080"
      - "8444:8443"
    volumes:
      - ./signserver-data:/opt/signserver/data:rw
      - ./src/public/watermark/watermark.png:/opt/keyfactor/signserver/watermark.png:ro
    restart: unless-stopped
```

Start services:
```bash
docker-compose -f docker-compose.prod.yml up -d
```

## Build and Deploy

### 1. Build Application

```bash
# Install dependencies
npm ci --production

# Build TypeScript
npm run build

# Verify build
ls -la dist/
```

### 2. Deploy Files

Copy to production server:
- `dist/` directory
- `package.json`
- `.env` file (securely)
- `src/public/` directory (for watermark image)
- `docker-compose.prod.yml` (if using)

### 3. Install Production Dependencies

On production server:

```bash
npm ci --production
```

## Process Management

### Option 1: PM2 (Recommended)

#### Install PM2

```bash
npm install -g pm2
```

#### Create PM2 Ecosystem File

Create `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'getsign-flow',
    script: './dist/index.js',
    instances: 2, // Number of instances
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production'
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    max_memory_restart: '1G',
    watch: false
  }]
};
```

#### Start with PM2

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # Setup startup script
```

#### PM2 Commands

```bash
# View status
pm2 status

# View logs
pm2 logs getsign-flow

# Restart
pm2 restart getsign-flow

# Stop
pm2 stop getsign-flow

# Monitor
pm2 monit
```

### Option 2: systemd

#### Create Service File

Create `/etc/systemd/system/getsign-flow.service`:

```ini
[Unit]
Description=GetSign Flow Service
After=network.target mongod.service

[Service]
Type=simple
User=getsign
WorkingDirectory=/opt/getsign-flow
Environment=NODE_ENV=production
ExecStart=/usr/bin/node /opt/getsign-flow/dist/index.js
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=getsign-flow

[Install]
WantedBy=multi-user.target
```

#### Enable and Start

```bash
sudo systemctl daemon-reload
sudo systemctl enable getsign-flow
sudo systemctl start getsign-flow
sudo systemctl status getsign-flow
```

### Option 3: Docker

#### Create Dockerfile

Create `Dockerfile`:

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --production

# Copy built application
COPY dist/ ./dist/
COPY src/public/ ./src/public/

# Expose port
EXPOSE 9999

# Start application
CMD ["node", "dist/index.js"]
```

#### Build and Run

```bash
docker build -t getsign-flow:latest .
docker run -d \
  --name getsign-flow \
  --env-file .env \
  -p 9999:9999 \
  --restart unless-stopped \
  getsign-flow:latest
```

## Reverse Proxy (Nginx)

### Nginx Configuration

Create `/etc/nginx/sites-available/getsign-flow`:

```nginx
upstream getsign-flow {
    server localhost:9999;
    # Add more instances for load balancing
    # server localhost:9998;
}

server {
    listen 80;
    server_name api.getsign.example.com;
    
    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.getsign.example.com;

    ssl_certificate /etc/ssl/certs/getsign.crt;
    ssl_certificate_key /etc/ssl/private/getsign.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    client_max_body_size 100M;  # Adjust for large PDFs

    location / {
        proxy_pass http://getsign-flow;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;  # For large PDF processing
    }
}
```

Enable site:
```bash
sudo ln -s /etc/nginx/sites-available/getsign-flow /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## Monitoring

### Health Checks

Set up monitoring to check:

```bash
# Service health
curl https://api.getsign.example.com/health

# SignServer health
curl https://api.getsign.example.com/health/signserver
```

### Logging

#### Application Logs

- PM2: `pm2 logs`
- systemd: `journalctl -u getsign-flow`
- Docker: `docker logs getsign-flow`

#### Log Rotation

Configure log rotation in `/etc/logrotate.d/getsign-flow`:

```
/opt/getsign-flow/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 getsign getsign
    sharedscripts
    postrotate
        pm2 reloadLogs
    endscript
}
```

### Sentry Monitoring

Sentry automatically tracks:
- Errors and exceptions
- Performance metrics
- Request traces

View dashboard at: https://sentry.io

## Backup Strategy

### MongoDB Backup

```bash
# Backup
mongodump --uri="mongodb://user:pass@host:27017/getsign-flow" --out=/backup/$(date +%Y%m%d)

# Restore
mongorestore --uri="mongodb://user:pass@host:27017/getsign-flow" /backup/20240101
```

### Docker Volumes Backup

```bash
# Backup EJBCA database
docker exec ejbca-database-prod mysqldump -u root -p ejbca > ejbca-backup.sql

# Backup SignServer database
docker exec signserver-database-prod mysqldump -u root -p signserver > signserver-backup.sql

# Backup SignServer data
tar -czf signserver-data-backup.tar.gz ./signserver-data
```

### S3 Backup

S3 versioning should be enabled. For additional backup:
```bash
aws s3 sync s3://certificate-bucket s3://certificate-bucket-backup
```

## Security Hardening

### 1. Firewall Configuration

```bash
# Allow only necessary ports
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

### 2. Environment Variables Security

- Never commit `.env` to version control
- Use secrets management (AWS Secrets Manager, HashiCorp Vault)
- Rotate keys regularly
- Use least privilege IAM policies

### 3. Application Security

- Enable HTTPS only
- Implement rate limiting
- Add authentication/authorization
- Validate all inputs
- Sanitize file uploads

### 4. Container Security

- Keep Docker images updated
- Scan images for vulnerabilities
- Use non-root user in containers
- Limit container resources

## Scaling

### Horizontal Scaling

1. Deploy multiple instances
2. Use load balancer (Nginx, AWS ALB)
3. Ensure MongoDB can handle connections
4. Configure SQS for distributed processing

### Vertical Scaling

1. Increase server resources
2. Adjust PM2 instances
3. Tune MongoDB connection pool
4. Optimize Docker container resources

## Rollback Procedure

### 1. Stop Current Version

```bash
pm2 stop getsign-flow
# or
sudo systemctl stop getsign-flow
```

### 2. Restore Previous Version

```bash
# Restore files from backup
cp -r backup/dist/* dist/

# Restore database if needed
mongorestore --uri="..." /backup/previous
```

### 3. Start Previous Version

```bash
pm2 start getsign-flow
# or
sudo systemctl start getsign-flow
```

## Troubleshooting

### Service Won't Start

1. Check environment variables
2. Verify MongoDB connection
3. Check Docker services
4. Review application logs
5. Verify port availability

### Performance Issues

1. Check MongoDB performance
2. Monitor SignServer response times
3. Review SQS queue depth
4. Check server resources (CPU, memory)
5. Review application logs for errors

### Certificate Issues

1. Verify EJBCA is running
2. Check certificate expiration
3. Verify worker configuration
4. Review SignServer logs

## Maintenance

### Regular Tasks

- [ ] Monitor error rates in Sentry
- [ ] Review application logs weekly
- [ ] Check disk space usage
- [ ] Verify backup integrity
- [ ] Update dependencies monthly
- [ ] Review security patches
- [ ] Monitor performance metrics

### Updates

1. Test in staging environment
2. Backup production data
3. Deploy during maintenance window
4. Monitor after deployment
5. Have rollback plan ready

