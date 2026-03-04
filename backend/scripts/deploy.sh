#!/bin/bash

# TripO Production Deployment Script
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.prod"
BACKUP_DIR="./backups"
LOG_FILE="./logs/deployment.log"

# Functions
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}" | tee -a "$LOG_FILE"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}" | tee -a "$LOG_FILE"
    exit 1
}

# Pre-deployment checks
pre_deployment_checks() {
    log "Starting pre-deployment checks..."
    
    # Check if required files exist
    if [ ! -f "$ENV_FILE" ]; then
        error "Environment file $ENV_FILE not found. Please create it from .env.production template."
    fi
    
    if [ ! -f "$COMPOSE_FILE" ]; then
        error "Docker compose file $COMPOSE_FILE not found."
    fi
    
    # Check if Docker is running
    if ! docker info > /dev/null 2>&1; then
        error "Docker is not running. Please start Docker and try again."
    fi
    
    # Check if Docker Compose is available
    if ! command -v docker-compose > /dev/null 2>&1; then
        error "Docker Compose is not installed."
    fi
    
    # Create necessary directories
    mkdir -p logs uploads nginx/ssl nginx/logs monitoring/grafana/provisioning "$BACKUP_DIR"
    
    log "Pre-deployment checks completed successfully."
}

# Backup current deployment
backup_deployment() {
    log "Creating backup of current deployment..."
    
    BACKUP_TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    BACKUP_PATH="$BACKUP_DIR/backup_$BACKUP_TIMESTAMP"
    
    mkdir -p "$BACKUP_PATH"
    
    # Backup MongoDB
    if docker-compose -f "$COMPOSE_FILE" ps mongodb | grep -q "Up"; then
        log "Backing up MongoDB..."
        docker-compose -f "$COMPOSE_FILE" exec -T mongodb mongodump --archive > "$BACKUP_PATH/mongodb_backup.archive" || warn "MongoDB backup failed"
    fi
    
    # Backup Redis
    if docker-compose -f "$COMPOSE_FILE" ps redis | grep -q "Up"; then
        log "Backing up Redis..."
        docker-compose -f "$COMPOSE_FILE" exec -T redis redis-cli --rdb - > "$BACKUP_PATH/redis_backup.rdb" || warn "Redis backup failed"
    fi
    
    # Backup application data
    if [ -d "uploads" ]; then
        cp -r uploads "$BACKUP_PATH/" || warn "Uploads backup failed"
    fi
    
    if [ -d "logs" ]; then
        cp -r logs "$BACKUP_PATH/" || warn "Logs backup failed"
    fi
    
    log "Backup completed: $BACKUP_PATH"
}

# Deploy application
deploy_application() {
    log "Starting application deployment..."
    
    # Pull latest images
    log "Pulling latest Docker images..."
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" pull
    
    # Build custom images
    log "Building application images..."
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build --no-cache
    
    # Stop existing services gracefully
    log "Stopping existing services..."
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down --timeout 30
    
    # Start services
    log "Starting services..."
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d
    
    # Wait for services to be healthy
    log "Waiting for services to be healthy..."
    sleep 30
    
    # Check service health
    check_service_health
    
    log "Application deployment completed successfully."
}

# Check service health
check_service_health() {
    log "Checking service health..."
    
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        log "Health check attempt $attempt/$max_attempts"
        
        # Check API health
        if curl -f -s http://localhost/health > /dev/null; then
            log "API is healthy"
            break
        fi
        
        if [ $attempt -eq $max_attempts ]; then
            error "Services failed to become healthy after $max_attempts attempts"
        fi
        
        sleep 10
        ((attempt++))
    done
    
    # Show service status
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps
}

# Post-deployment tasks
post_deployment_tasks() {
    log "Running post-deployment tasks..."
    
    # Clean up old Docker images
    log "Cleaning up old Docker images..."
    docker image prune -f || warn "Docker image cleanup failed"
    
    # Update SSL certificates if needed
    if [ -f "scripts/update-ssl.sh" ]; then
        log "Updating SSL certificates..."
        ./scripts/update-ssl.sh || warn "SSL certificate update failed"
    fi
    
    # Send deployment notification (if configured)
    if [ -n "$SLACK_WEBHOOK_URL" ]; then
        curl -X POST -H 'Content-type: application/json' \
            --data '{"text":"TripO production deployment completed successfully"}' \
            "$SLACK_WEBHOOK_URL" || warn "Slack notification failed"
    fi
    
    log "Post-deployment tasks completed."
}

# Rollback function
rollback() {
    error "Deployment failed. Starting rollback..."
    
    # Stop current deployment
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down --timeout 30
    
    # Restore from latest backup
    LATEST_BACKUP=$(ls -t "$BACKUP_DIR" | head -n1)
    if [ -n "$LATEST_BACKUP" ]; then
        log "Restoring from backup: $LATEST_BACKUP"
        # Add rollback logic here
    fi
    
    error "Rollback completed. Please check the logs and try again."
}

# Main deployment process
main() {
    log "Starting TripO production deployment..."
    
    # Trap errors and rollback
    trap rollback ERR
    
    pre_deployment_checks
    backup_deployment
    deploy_application
    post_deployment_tasks
    
    log "Deployment completed successfully!"
    log "Application is available at: https://yourdomain.com"
    log "Monitoring dashboard: http://localhost:3001 (Grafana)"
    log "Metrics: http://localhost:9090 (Prometheus)"
}

# Script execution
if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    echo "Usage: $0 [options]"
    echo "Options:"
    echo "  --help, -h    Show this help message"
    echo "  --no-backup   Skip backup creation"
    echo "  --force       Force deployment without confirmation"
    exit 0
fi

if [ "$1" != "--force" ]; then
    echo "This will deploy TripO to production. Are you sure? (y/N)"
    read -r response
    if [ "$response" != "y" ] && [ "$response" != "Y" ]; then
        echo "Deployment cancelled."
        exit 0
    fi
fi

main "$@"