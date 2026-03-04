const { getUserByUid, getAuth } = require('../config/firebase');
const TransportProvider = require('../models/TransportProvider');
const logger = require('../utils/logger');

class TransportProviderService {
  /**
   * Create new transport provider from Firebase user
   */
  static async createProvider(firebaseUid, additionalData = {}) {
    try {
      // Get user from Firebase Auth
      const firebaseUser = await getUserByUid(firebaseUid);
      
      // Check if provider already exists
      let provider = await TransportProvider.findByUid(firebaseUid);
      
      if (provider) {
        logger.info(`Transport provider already exists: ${firebaseUid}`);
        return provider;
      }
      
      // Create new transport provider
      provider = TransportProvider.fromFirebaseUser(firebaseUser, additionalData);
      await provider.save();
      
      logger.info(`New transport provider created: ${firebaseUid}`);
      return provider;
    } catch (error) {
      logger.error('Error creating transport provider:', error);
      throw error;
    }
  }

  /**
   * Sync Firebase user with transport provider profile
   */
  static async syncProvider(firebaseUid) {
    try {
      // Get user from Firebase Auth
      const firebaseUser = await getUserByUid(firebaseUid);
      
      // Check if provider exists
      let provider = await TransportProvider.findByUid(firebaseUid);
      
      if (provider) {
        // Update existing provider with latest Firebase data
        provider.email = firebaseUser.email;
        provider.displayName = firebaseUser.displayName;
        provider.phoneNumber = firebaseUser.phoneNumber;
        provider.photoURL = firebaseUser.photoURL;
        provider.emailVerified = firebaseUser.emailVerified;
        
        // Update verification status
        provider.verification.email = firebaseUser.emailVerified;
        provider.verification.phone = !!firebaseUser.phoneNumber;
        
        // Update profile completion
        provider.updateProfileCompletion();
        
        // Update last active time
        provider.lastActiveAt = new Date();
        
        await provider.save();
        logger.info(`Transport provider synced: ${firebaseUid}`);
      } else {
        // Create new provider
        provider = await this.createProvider(firebaseUid);
      }
      
      return provider;
    } catch (error) {
      logger.error('Error syncing transport provider:', error);
      throw error;
    }
  }

  /**
   * Get transport provider profile by UID
   */
  static async getProviderProfile(uid) {
    try {
      const provider = await TransportProvider.findByUid(uid);
      if (!provider) {
        throw new Error('Transport provider not found');
      }
      return provider;
    } catch (error) {
      logger.error('Error getting transport provider profile:', error);
      throw error;
    }
  }

  /**
   * Update personal information
   */
  static async updatePersonalInfo(uid, personalData) {
    try {
      const provider = await TransportProvider.findByUid(uid);
      if (!provider) {
        throw new Error('Transport provider not found');
      }

      await provider.updatePersonalInfo(personalData);
      logger.info(`Transport provider personal info updated: ${uid}`);
      return provider;
    } catch (error) {
      logger.error('Error updating personal info:', error);
      throw error;
    }
  }

  /**
   * Update business information
   */
  static async updateBusinessInfo(uid, businessData) {
    try {
      const provider = await TransportProvider.findByUid(uid);
      if (!provider) {
        throw new Error('Transport provider not found');
      }

      await provider.updateBusinessInfo(businessData);
      logger.info(`Transport provider business info updated: ${uid}`);
      return provider;
    } catch (error) {
      logger.error('Error updating business info:', error);
      throw error;
    }
  }

  /**
   * Update service information
   */
  static async updateServiceInfo(uid, serviceData) {
    try {
      const provider = await TransportProvider.findByUid(uid);
      if (!provider) {
        throw new Error('Transport provider not found');
      }

      await provider.updateServiceInfo(serviceData);
      logger.info(`Transport provider service info updated: ${uid}`);
      return provider;
    } catch (error) {
      logger.error('Error updating service info:', error);
      throw error;
    }
  }

  /**
   * Update fleet information
   */
  static async updateFleetInfo(uid, fleetData) {
    try {
      const provider = await TransportProvider.findByUid(uid);
      if (!provider) {
        throw new Error('Transport provider not found');
      }

      await provider.updateFleetInfo(fleetData);
      logger.info(`Transport provider fleet info updated: ${uid}`);
      return provider;
    } catch (error) {
      logger.error('Error updating fleet info:', error);
      throw error;
    }
  }

  /**
   * Update location information
   */
  static async updateLocation(uid, locationData) {
    try {
      const provider = await TransportProvider.findByUid(uid);
      if (!provider) {
        throw new Error('Transport provider not found');
      }

      await provider.updateLocation(locationData);
      logger.info(`Transport provider location updated: ${uid}`);
      return provider;
    } catch (error) {
      logger.error('Error updating location:', error);
      throw error;
    }
  }

  /**
   * Check if email is already registered as transport provider
   */
  static async isEmailRegistered(email) {
    try {
      const provider = await TransportProvider.findByEmail(email);
      return !!provider;
    } catch (error) {
      logger.error('Error checking email registration:', error);
      throw error;
    }
  }

  /**
   * Get provider's public profile
   */
  static async getPublicProfile(uid) {
    try {
      const provider = await TransportProvider.findByUid(uid);
      if (!provider) {
        throw new Error('Transport provider not found');
      }
      return provider.getPublicProfile();
    } catch (error) {
      logger.error('Error getting public profile:', error);
      throw error;
    }
  }

  /**
   * Search transport providers by criteria
   */
  static async searchProviders(criteria = {}, limit = 20) {
    try {
      const { getFirestore } = require('../config/firebase');
      const db = getFirestore();
      
      let query = db.collection('transport_providers');
      
      // Apply filters
      if (criteria.city) {
        query = query.where('serviceInfo.primaryCity', '==', criteria.city);
      }
      
      if (criteria.state) {
        query = query.where('serviceInfo.operatingState', '==', criteria.state);
      }
      
      if (criteria.serviceType) {
        query = query.where('serviceInfo.serviceTypes', 'array-contains', criteria.serviceType);
      }
      
      if (criteria.vehicleType) {
        query = query.where('fleetInfo.vehicleTypes', 'array-contains', criteria.vehicleType);
      }
      
      if (criteria.verified) {
        query = query.where('verification.business', '==', true);
      }
      
      if (criteria.active) {
        query = query.where('accountStatus.isActive', '==', true);
      }
      
      query = query.limit(limit);
      
      const snapshot = await query.get();
      const providers = [];
      
      snapshot.forEach(doc => {
        const provider = new TransportProvider(doc.data());
        providers.push(provider.getPublicProfile());
      });
      
      return providers;
    } catch (error) {
      logger.error('Error searching transport providers:', error);
      throw error;
    }
  }

  /**
   * Update provider metrics
   */
  static async updateMetrics(uid, metricsUpdate) {
    try {
      const provider = await TransportProvider.findByUid(uid);
      if (!provider) {
        throw new Error('Transport provider not found');
      }

      // Update metrics
      Object.keys(metricsUpdate).forEach(key => {
        if (provider.metrics.hasOwnProperty(key)) {
          provider.metrics[key] = metricsUpdate[key];
        }
      });

      provider.updatedAt = new Date();
      await provider.save();
      
      logger.info(`Transport provider metrics updated: ${uid}`);
      return provider;
    } catch (error) {
      logger.error('Error updating provider metrics:', error);
      throw error;
    }
  }

  /**
   * Approve transport provider
   */
  static async approveProvider(uid, approvedBy) {
    try {
      const provider = await TransportProvider.findByUid(uid);
      if (!provider) {
        throw new Error('Transport provider not found');
      }

      provider.accountStatus.status = 'active';
      provider.accountStatus.isActive = true;
      provider.accountStatus.canReceiveBookings = true;
      provider.accountStatus.approvedAt = new Date();
      provider.accountStatus.approvedBy = approvedBy;
      
      provider.updatedAt = new Date();
      await provider.save();
      
      logger.info(`Transport provider approved: ${uid} by ${approvedBy}`);
      return provider;
    } catch (error) {
      logger.error('Error approving transport provider:', error);
      throw error;
    }
  }

  /**
   * Reject transport provider
   */
  static async rejectProvider(uid, rejectionReason, rejectedBy) {
    try {
      const provider = await TransportProvider.findByUid(uid);
      if (!provider) {
        throw new Error('Transport provider not found');
      }

      provider.accountStatus.status = 'rejected';
      provider.accountStatus.isActive = false;
      provider.accountStatus.canReceiveBookings = false;
      provider.accountStatus.rejectionReason = rejectionReason;
      provider.accountStatus.approvedBy = rejectedBy;
      
      provider.updatedAt = new Date();
      await provider.save();
      
      logger.info(`Transport provider rejected: ${uid} by ${rejectedBy}`);
      return provider;
    } catch (error) {
      logger.error('Error rejecting transport provider:', error);
      throw error;
    }
  }

  /**
   * Suspend transport provider
   */
  static async suspendProvider(uid, reason, suspendedBy) {
    try {
      const provider = await TransportProvider.findByUid(uid);
      if (!provider) {
        throw new Error('Transport provider not found');
      }

      provider.accountStatus.status = 'suspended';
      provider.accountStatus.isActive = false;
      provider.accountStatus.canReceiveBookings = false;
      provider.accountStatus.rejectionReason = reason;
      
      provider.updatedAt = new Date();
      await provider.save();
      
      logger.info(`Transport provider suspended: ${uid} by ${suspendedBy}`);
      return provider;
    } catch (error) {
      logger.error('Error suspending transport provider:', error);
      throw error;
    }
  }
}

module.exports = TransportProviderService;