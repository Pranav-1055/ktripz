const crypto = require('crypto');
const logger = require('./logger');

/**
 * Encryption utilities for sensitive data
 */
class EncryptionService {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.keyLength = 32; // 256 bits
    this.ivLength = 16; // 128 bits
    this.tagLength = 16; // 128 bits
    this.saltLength = 32; // 256 bits
    
    // Get encryption key from environment or generate one
    this.masterKey = this.getMasterKey();
  }

  /**
   * Get or generate master encryption key
   */
  getMasterKey() {
    const envKey = process.env.ENCRYPTION_KEY;
    
    if (envKey) {
      // Derive key from environment variable
      return crypto.scryptSync(envKey, 'tripo-salt', this.keyLength);
    }
    
    // Generate a new key (should be stored securely in production)
    const key = crypto.randomBytes(this.keyLength);
    
    if (process.env.NODE_ENV === 'development') {
      logger.warn('Using generated encryption key. Set ENCRYPTION_KEY environment variable for production.');
    }
    
    return key;
  }

  /**
   * Encrypt sensitive data
   */
  encrypt(plaintext, additionalData = null) {
    try {
      if (!plaintext) return null;
      
      const iv = crypto.randomBytes(this.ivLength);
      const cipher = crypto.createCipher(this.algorithm, this.masterKey);
      cipher.setAAD(Buffer.from(additionalData || ''));
      
      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const tag = cipher.getAuthTag();
      
      // Combine IV, tag, and encrypted data
      const result = {
        iv: iv.toString('hex'),
        tag: tag.toString('hex'),
        encrypted: encrypted,
        algorithm: this.algorithm,
      };
      
      return Buffer.from(JSON.stringify(result)).toString('base64');
    } catch (error) {
      logger.error('Encryption failed:', error);
      throw new Error('Encryption failed');
    }
  }

  /**
   * Decrypt sensitive data
   */
  decrypt(encryptedData, additionalData = null) {
    try {
      if (!encryptedData) return null;
      
      const data = JSON.parse(Buffer.from(encryptedData, 'base64').toString());
      
      const decipher = crypto.createDecipher(data.algorithm, this.masterKey);
      decipher.setAuthTag(Buffer.from(data.tag, 'hex'));
      
      if (additionalData) {
        decipher.setAAD(Buffer.from(additionalData));
      }
      
      let decrypted = decipher.update(data.encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      logger.error('Decryption failed:', error);
      throw new Error('Decryption failed');
    }
  }

  /**
   * Hash sensitive data (one-way)
   */
  hash(data, salt = null) {
    try {
      const actualSalt = salt || crypto.randomBytes(this.saltLength);
      const hash = crypto.scryptSync(data, actualSalt, 64);
      
      return {
        hash: hash.toString('hex'),
        salt: actualSalt.toString('hex'),
      };
    } catch (error) {
      logger.error('Hashing failed:', error);
      throw new Error('Hashing failed');
    }
  }

  /**
   * Verify hashed data
   */
  verifyHash(data, hashedData, salt) {
    try {
      const saltBuffer = Buffer.from(salt, 'hex');
      const hash = crypto.scryptSync(data, saltBuffer, 64);
      
      return hash.toString('hex') === hashedData;
    } catch (error) {
      logger.error('Hash verification failed:', error);
      return false;
    }
  }

  /**
   * Generate secure random token
   */
  generateToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Generate cryptographically secure UUID
   */
  generateSecureUUID() {
    return crypto.randomUUID();
  }

  /**
   * Encrypt PII (Personally Identifiable Information)
   */
  encryptPII(data) {
    if (!data) return null;
    
    const piiContext = 'pii-data';
    return this.encrypt(JSON.stringify(data), piiContext);
  }

  /**
   * Decrypt PII
   */
  decryptPII(encryptedData) {
    if (!encryptedData) return null;
    
    const piiContext = 'pii-data';
    const decrypted = this.decrypt(encryptedData, piiContext);
    
    try {
      return JSON.parse(decrypted);
    } catch {
      return decrypted;
    }
  }

  /**
   * Encrypt payment information
   */
  encryptPaymentInfo(paymentData) {
    if (!paymentData) return null;
    
    const paymentContext = 'payment-data';
    return this.encrypt(JSON.stringify(paymentData), paymentContext);
  }

  /**
   * Decrypt payment information
   */
  decryptPaymentInfo(encryptedData) {
    if (!encryptedData) return null;
    
    const paymentContext = 'payment-data';
    const decrypted = this.decrypt(encryptedData, paymentContext);
    
    try {
      return JSON.parse(decrypted);
    } catch {
      return decrypted;
    }
  }
}

/**
 * Field-level encryption for database models
 */
class FieldEncryption {
  constructor(encryptionService) {
    this.encryption = encryptionService;
    
    // Define which fields should be encrypted
    this.encryptedFields = {
      users: ['phoneNumber', 'address', 'emergencyContact'],
      bookings: ['passengerPhone', 'driverPhone'],
      payments: ['cardNumber', 'bankAccount', 'upiId'],
      vehicles: ['licensePlate', 'registrationNumber'],
      messages: ['content', 'attachments'],
    };
  }

  /**
   * Encrypt specified fields in an object
   */
  encryptFields(modelName, data) {
    if (!data || typeof data !== 'object') return data;
    
    const fieldsToEncrypt = this.encryptedFields[modelName] || [];
    const encrypted = { ...data };
    
    for (const field of fieldsToEncrypt) {
      if (encrypted[field] !== undefined && encrypted[field] !== null) {
        try {
          encrypted[field] = this.encryption.encrypt(
            String(encrypted[field]),
            `${modelName}.${field}`
          );
        } catch (error) {
          logger.error(`Failed to encrypt field ${field} in ${modelName}:`, error);
        }
      }
    }
    
    return encrypted;
  }

  /**
   * Decrypt specified fields in an object
   */
  decryptFields(modelName, data) {
    if (!data || typeof data !== 'object') return data;
    
    const fieldsToDecrypt = this.encryptedFields[modelName] || [];
    const decrypted = { ...data };
    
    for (const field of fieldsToDecrypt) {
      if (decrypted[field] !== undefined && decrypted[field] !== null) {
        try {
          decrypted[field] = this.encryption.decrypt(
            decrypted[field],
            `${modelName}.${field}`
          );
        } catch (error) {
          logger.error(`Failed to decrypt field ${field} in ${modelName}:`, error);
          // Keep encrypted value if decryption fails
        }
      }
    }
    
    return decrypted;
  }

  /**
   * Check if a field should be encrypted
   */
  shouldEncryptField(modelName, fieldName) {
    const fieldsToEncrypt = this.encryptedFields[modelName] || [];
    return fieldsToEncrypt.includes(fieldName);
  }
}

/**
 * Secure key management
 */
class KeyManager {
  constructor() {
    this.keys = new Map();
    this.keyRotationInterval = 24 * 60 * 60 * 1000; // 24 hours
    this.setupKeyRotation();
  }

  /**
   * Generate a new encryption key
   */
  generateKey(keyId) {
    const key = crypto.randomBytes(32);
    const metadata = {
      id: keyId,
      created: new Date(),
      algorithm: 'aes-256-gcm',
      status: 'active',
    };
    
    this.keys.set(keyId, { key, metadata });
    logger.info(`Generated new encryption key: ${keyId}`);
    
    return key;
  }

  /**
   * Get encryption key by ID
   */
  getKey(keyId) {
    const keyData = this.keys.get(keyId);
    return keyData ? keyData.key : null;
  }

  /**
   * Rotate encryption keys
   */
  rotateKey(keyId) {
    const oldKeyData = this.keys.get(keyId);
    
    if (oldKeyData) {
      // Mark old key as deprecated
      oldKeyData.metadata.status = 'deprecated';
      oldKeyData.metadata.deprecated = new Date();
    }
    
    // Generate new key
    return this.generateKey(keyId);
  }

  /**
   * Setup automatic key rotation
   */
  setupKeyRotation() {
    setInterval(() => {
      for (const [keyId, keyData] of this.keys.entries()) {
        const age = Date.now() - keyData.metadata.created.getTime();
        
        if (age > this.keyRotationInterval && keyData.metadata.status === 'active') {
          logger.info(`Rotating encryption key: ${keyId}`);
          this.rotateKey(keyId);
        }
      }
    }, 60 * 60 * 1000); // Check every hour
  }

  /**
   * Clean up old deprecated keys
   */
  cleanupOldKeys() {
    const cutoffTime = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days
    
    for (const [keyId, keyData] of this.keys.entries()) {
      if (keyData.metadata.status === 'deprecated' &&
          keyData.metadata.deprecated &&
          keyData.metadata.deprecated.getTime() < cutoffTime) {
        
        this.keys.delete(keyId);
        logger.info(`Cleaned up old encryption key: ${keyId}`);
      }
    }
  }
}

// Create singleton instances
const encryptionService = new EncryptionService();
const fieldEncryption = new FieldEncryption(encryptionService);
const keyManager = new KeyManager();

/**
 * Middleware to encrypt/decrypt request/response data
 */
function encryptionMiddleware(options = {}) {
  const {
    encryptRequest = false,
    decryptResponse = false,
    modelName = null,
  } = options;

  return (req, res, next) => {
    // Encrypt request body if needed
    if (encryptRequest && req.body && modelName) {
      req.body = fieldEncryption.encryptFields(modelName, req.body);
    }

    // Override response methods to decrypt data
    if (decryptResponse && modelName) {
      const originalJson = res.json;
      
      res.json = function(obj) {
        if (obj && obj.data) {
          if (Array.isArray(obj.data)) {
            obj.data = obj.data.map(item => 
              fieldEncryption.decryptFields(modelName, item)
            );
          } else {
            obj.data = fieldEncryption.decryptFields(modelName, obj.data);
          }
        }
        
        return originalJson.call(this, obj);
      };
    }

    next();
  };
}

module.exports = {
  EncryptionService,
  FieldEncryption,
  KeyManager,
  encryptionService,
  fieldEncryption,
  keyManager,
  encryptionMiddleware,
};