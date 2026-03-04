# TripO Production Deployment Guide

This guide covers the complete production deployment setup for the TripO BlaBlaCar-like ride-sharing backend API.

## Prerequisites

- Docker and Docker Compose installed
- SSL certificates (Let's Encrypt recommended for production)
- Domain name configured with DNS pointing to your server
- Server with at least 4GB RAM and 2 CPU cores
- Ubuntu 20.04+ or similar Linux distribution

## Quick Start

1. **Clone the repository and navigate to backend:**
   ```bash
   git clone <repository-url>
   cd backend
   ```

2. **Create production environment file:**
   ```bash
   cp .env.production .env.prod
   # Edit .env.prod with your actual values
   ```

3. **Generate SSL certificates (for development/testing):**
   ```bash
   ./scripts/generate-ssl.sh yourdomain.com
   ```

4. **Deploy the application:**
   ```bash
   ./scripts/deploy.sh
   ```

## Detailed Setup

### 1. Environment Configuration

Copy the production environment template and configure all required values:

```bash
cp .env.production .env.prod
```

**Critical environment variables to configure:**

- **Database:** `MONGO_ROOT_PASSWORD`, `MONGO_APP_PASSWORD`
- **Redis:** `REDIS_PASSWORD`
- **Security:** `JWT_SECRET`, `ENCRYPTION_KEY`
- **Firebase:** `FIREBASE_PROJECT_ID`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL`
- **Payment:** `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `STRIPE_SECRET_KEY`
- **Communication:** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `SENDGRID_API_KEY`
- **Maps:** `GOOGLE_MAPS_API_KEY`

### 2. SSL Certificate Setup

#### Option A: Let's Encrypt (Recommended for Production)

```bash
# Install Certbot
sudo apt update
sudo apt install certbot

# Generate certificates
sudo certbot certonly --standalone -d yourdomain.com

# Copy certificates to nginx directory
sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem ./nginx/ssl/cert.pem
sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem ./nginx/ssl/key.pem
sudo chown $USER:$USER ./nginx/ssl/*.pem
```

#### Option B: Self-Signed (Development/Testing)

```bash
./scripts/generate-ssl.sh yourdomain.com
```

### 3. Production Deployment

#### Manual Deployment

```bash
# Make deployment script executable
chmod +x scripts/deploy.sh

# Run deployment
./scripts/deploy.sh
```

#### Automated Deployment with CI/CD

The repository includes GitHub Actions workflow for automated deployment:

1. **Set up repository secrets:**
   - `SSH_PRIVATE_KEY`: SSH private key for server access
   - `SERVER_HOST`: Production server IP/hostname
   - `SERVER_USER`: SSH username
   - `ENV_PRODUCTION`: Complete .env.prod file content
   - `SLACK_WEBHOOK`: (Optional) Slack webhook for notifications

2. **Deploy automatically:**
   - Push to `main` branch triggers automatic deployment
   - Manual deployment via GitHub Actions workflow dispatch

### 4. Service Architecture

The production deployment includes:

- **Nginx:** Load balancer and SSL termination
- **API Instances:** 2 Node.js application instances
- **MongoDB:** Primary database with authentication
- **Redis:** Caching and session management
- **Prometheus:** Metrics collection
- **Grafana:** Monitoring dashboard

### 5. Monitoring and Logging

#### Access Monitoring Dashboards

- **Grafana:** `http://your-server:3001`
  - Username: `admin`
  - Password: Set in `GRAFANA_ADMIN_PASSWORD`

- **Prometheus:** `http://your-server:9090`

#### Log Files

- **Application logs:** `./logs/`
- **Nginx logs:** `./nginx/logs/`
- **Deployment logs:** `./logs/deployment.log`

#### Health Checks

- **API Health:** `https://yourdomain.com/health`
- **Service Status:** `docker-compose -f docker-compose.prod.yml ps`

### 6. Backup and Recovery

#### Automated Backups

The deployment script automatically creates backups before deployment:

```bash
# Manual backup
./scripts/backup.sh

# Restore from backup
./scripts/restore.sh backup_20240109_143000
```

#### Database Backups

```bash
# MongoDB backup
docker-compose -f docker-compose.prod.yml exec mongodb mongodump --archive > backup.archive

# Redis backup
docker-compose -f docker-compose.prod.yml exec redis redis-cli --rdb - > backup.rdb
```

### 7. Scaling and Load Balancing

#### Horizontal Scaling

To add more API instances:

1. **Update docker-compose.prod.yml:**
   ```yaml
   api-3:
     # Copy api-1 configuration
     container_name: tripo-api-3
     environment:
       - INSTANCE_ID=api-3
   ```

2. **Update nginx.conf:**
   ```nginx
   upstream tripo_backend {
       least_conn;
       server api-1:3000;
       server api-2:3000;
       server api-3:3000;  # Add new instance
   }
   ```

3. **Redeploy:**
   ```bash
   ./scripts/deploy.sh
   ```

#### Vertical Scaling

Update resource limits in docker-compose.prod.yml:

```yaml
api-1:
  deploy:
    resources:
      limits:
        cpus: '2.0'
        memory: 2G
      reservations:
        cpus: '1.0'
        memory: 1G
```

### 8. Security Considerations

#### Firewall Configuration

```bash
# Allow only necessary ports
sudo ufw allow 22    # SSH
sudo ufw allow 80    # HTTP
sudo ufw allow 443   # HTTPS
sudo ufw enable
```

#### Regular Security Updates

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Update Docker images
docker-compose -f docker-compose.prod.yml pull
./scripts/deploy.sh
```

#### SSL Certificate Renewal

```bash
# Automatic renewal with cron
echo "0 12 * * * /usr/bin/certbot renew --quiet" | sudo crontab -
```

### 9. Troubleshooting

#### Common Issues

1. **Services not starting:**
   ```bash
   # Check logs
   docker-compose -f docker-compose.prod.yml logs api-1
   
   # Check service status
   docker-compose -f docker-compose.prod.yml ps
   ```

2. **Database connection issues:**
   ```bash
   # Test MongoDB connection
   docker-compose -f docker-compose.prod.yml exec mongodb mongosh
   
   # Check Redis connection
   docker-compose -f docker-compose.prod.yml exec redis redis-cli ping
   ```

3. **SSL certificate issues:**
   ```bash
   # Verify certificate
   openssl x509 -in nginx/ssl/cert.pem -text -noout
   
   # Test SSL connection
   openssl s_client -connect yourdomain.com:443
   ```

#### Performance Optimization

1. **Database indexing:**
   ```bash
   # Connect to MongoDB and create indexes
   docker-compose -f docker-compose.prod.yml exec mongodb mongosh tripo
   ```

2. **Redis memory optimization:**
   ```bash
   # Monitor Redis memory usage
   docker-compose -f docker-compose.prod.yml exec redis redis-cli info memory
   ```

### 10. Maintenance

#### Regular Maintenance Tasks

1. **Weekly:**
   - Review application logs
   - Check disk space usage
   - Monitor performance metrics

2. **Monthly:**
   - Update dependencies
   - Review security patches
   - Backup verification

3. **Quarterly:**
   - Security audit
   - Performance optimization review
   - Disaster recovery testing

#### Maintenance Commands

```bash
# Check system resources
df -h                    # Disk usage
free -h                  # Memory usage
docker system df         # Docker space usage

# Clean up Docker resources
docker system prune -f   # Remove unused containers/images
docker volume prune -f   # Remove unused volumes

# Update application
git pull origin main
./scripts/deploy.sh
```

## Support

For deployment issues or questions:

1. Check the logs: `./logs/deployment.log`
2. Review service status: `docker-compose -f docker-compose.prod.yml ps`
3. Check application health: `curl https://yourdomain.com/health`

## Security Notice

- Never commit `.env.prod` or any files containing secrets to version control
- Regularly update all dependencies and base images
- Monitor security advisories for all used technologies
- Implement proper backup and disaster recovery procedures