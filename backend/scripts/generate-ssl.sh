#!/bin/bash

# SSL Certificate Generation Script for TripO
set -e

# Configuration
SSL_DIR="./nginx/ssl"
DOMAIN="${1:-localhost}"
COUNTRY="US"
STATE="State"
CITY="City"
ORGANIZATION="TripO"
ORGANIZATIONAL_UNIT="IT Department"
EMAIL="admin@tripo.com"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

# Create SSL directory
mkdir -p "$SSL_DIR"

log "Generating SSL certificates for domain: $DOMAIN"

# Generate private key
log "Generating private key..."
openssl genrsa -out "$SSL_DIR/key.pem" 2048

# Generate certificate signing request
log "Generating certificate signing request..."
openssl req -new -key "$SSL_DIR/key.pem" -out "$SSL_DIR/cert.csr" -subj "/C=$COUNTRY/ST=$STATE/L=$CITY/O=$ORGANIZATION/OU=$ORGANIZATIONAL_UNIT/CN=$DOMAIN/emailAddress=$EMAIL"

# Generate self-signed certificate (for development/testing)
log "Generating self-signed certificate..."
openssl x509 -req -days 365 -in "$SSL_DIR/cert.csr" -signkey "$SSL_DIR/key.pem" -out "$SSL_DIR/cert.pem"

# Set proper permissions
chmod 600 "$SSL_DIR/key.pem"
chmod 644 "$SSL_DIR/cert.pem"

# Clean up CSR file
rm "$SSL_DIR/cert.csr"

log "SSL certificates generated successfully!"
log "Certificate: $SSL_DIR/cert.pem"
log "Private Key: $SSL_DIR/key.pem"

warn "This is a self-signed certificate suitable for development/testing only."
warn "For production, use certificates from a trusted CA like Let's Encrypt."

# Display certificate information
log "Certificate information:"
openssl x509 -in "$SSL_DIR/cert.pem" -text -noout | grep -E "(Subject:|Issuer:|Not Before:|Not After:)"