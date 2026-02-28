const { getFirestore } = require('../config/firebase');
const logger = require('../utils/logger');

class TransportProvider {
  constructor(data) {
    this.uid = data.uid;
    this.email = data.email;
    this.displayName = data.displayName;
    this.phoneNumber = data.phoneNumber;
    this.photoURL = data.photoURL;
    this.emailVerified = data.emailVerified;

    // Business Information
    this.businessInfo = data.businessInfo || {
      businessName: '',
      businessType: 'individual', // individual, company, partnership
      licenseNumber: '',
      yearsInBusiness: '',
      businessAddress: '',
      gstNumber: '',
      panNumber: ''
    };

    // Personal Information
    this.personalInfo = data.personalInfo || {
      fullName: '',
      dateOfBirth: null,
      gender: '',
      address: '',
      emergencyContact: {
        name: '',
        phone: '',
        relation: ''
      }
    };

    // Service Information
    this.serviceInfo = data.serviceInfo || {
      primaryCity: '',
      operatingState: '',
      serviceTypes: [], // airport_transfer, city_tours, intercity, local_taxi, corporate, events
      operatingHours: '24/7',
      specialFeatures: [], // air_conditioning, wifi, gps_tracking, music_system, wheelchair_accessible
      serviceAreas: [],
      priceRange: {
        min: 0,
        max: 0,
        currency: 'INR'
      }
    };

    // Fleet Information
    this.fleetInfo = data.fleetInfo || {
      totalVehicles: 0,
      fleetSize: '', // 1, 2-5, 6-10, 11-25, 25+
      vehicleTypes: [], // luxury_car, minivan, bus, bike
      averageVehicleAge: '', // 0-2, 2-5, 5-8, 8+
      vehicles: [] // Array of vehicle IDs
    };

    // Location Information
    this.location = data.location || {
      village: '',
      city: '',
      district: '',
      state: '',
      country: 'India',
      coordinates: {
        latitude: null,
        longitude: null
      },
      operatingRadius: 50 // km
    };

    // Verification Status
    this.verification = data.verification || {
      email: false,
      phone: false,
      identity: false,
      business: false,
      drivingLicense: false,
      backgroundCheck: false,
      documents: {
        businessLicense: { verified: false, url: '', uploadedAt: null },
        drivingLicense: { verified: false, url: '', uploadedAt: null },
        identity: { verified: false, url: '', uploadedAt: null },
        insurance: { verified: false, url: '', uploadedAt: null }
      }
    };

    // Profile Completion Status
    this.profileCompletion = data.profileCompletion || {
      emailVerified: false,
      personalInfoComplete: false,
      businessInfoComplete: false,
      serviceInfoComplete: false,
      fleetInfoComplete: false,
      locationComplete: false,
      documentsUploaded: false,
      overallComplete: false,
      completionPercentage: 0
    };

    // Account Status
    this.accountStatus = data.accountStatus || {
      status: 'pending', // pending, active, suspended, rejected
      approvedAt: null,
      approvedBy: null,
      rejectionReason: '',
      isActive: false,
      canReceiveBookings: false
    };

    // Business Metrics
    this.metrics = data.metrics || {
      totalBookings: 0,
      completedRides: 0,
      cancelledRides: 0,
      totalEarnings: 0,
      averageRating: 0,
      totalRatings: 0,
      responseTime: 0, // minutes
      acceptanceRate: 100, // percentage
      completionRate: 100, // percentage
      onTimePercentage: 100
    };

    // Preferences
    this.preferences = data.preferences || {
      autoAcceptBookings: false,
      maxBookingsPerDay: 10,
      workingDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
      notifications: {
        email: true,
        sms: true,
        push: true,
        bookingAlerts: true,
        paymentAlerts: true
      },
      language: 'en',
      currency: 'INR'
    };

    // Financial Information
    this.financial = data.financial || {
      bankDetails: {
        accountNumber: '',
        ifscCode: '',
        accountHolderName: '',
        bankName: '',
        verified: false
      },
      upiId: '',
      commissionRate: 15, // percentage
      payoutSchedule: 'weekly' // daily, weekly, monthly
    };

    // Timestamps
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
    this.lastLoginAt = data.lastLoginAt || null;
    this.lastActiveAt = data.lastActiveAt || null;
  }

  /**
   * Save transport provider to Firestore
   */
  async save() {
    try {
      const db = getFirestore();
      const providerRef = db.collection('transport_providers').doc(this.uid);

      const providerData = {
        uid: this.uid,
        email: this.email,
        displayName: this.displayName,
        phoneNumber: this.phoneNumber,
        photoURL: this.photoURL,
        emailVerified: this.emailVerified,
        businessInfo: this.businessInfo,
        personalInfo: this.personalInfo,
        serviceInfo: this.serviceInfo,
        fleetInfo: this.fleetInfo,
        location: this.location,
        verification: this.verification,
        profileCompletion: this.profileCompletion,
        accountStatus: this.accountStatus,
        metrics: this.metrics,
        preferences: this.preferences,
        financial: this.financial,
        updatedAt: new Date(),
      };

      // Helper to remove undefined fields recursively
      const removeUndefined = (obj) => {
        if (Array.isArray(obj)) {
          return obj
            .map(v => removeUndefined(v))
            .filter(v => v !== undefined);
        } else if (obj !== null && typeof obj === 'object') {
          return Object.keys(obj).reduce((acc, key) => {
            const value = removeUndefined(obj[key]);
            if (value !== undefined) {
              acc[key] = value;
            }
            return acc;
          }, {});
        }
        return obj;
      };

      // Only set createdAt if it's a new provider
      const existingProvider = await providerRef.get();
      if (!existingProvider.exists) {
        providerData.createdAt = this.createdAt;
      }

      await providerRef.set(removeUndefined(providerData), { merge: true });
      logger.info(`Transport provider saved: ${this.uid}`);
      return this;
    } catch (error) {
      logger.error('Error saving transport provider:', error);
      throw error;
    }
  }

  /**
   * Find transport provider by UID
   */
  static async findByUid(uid) {
    try {
      const db = getFirestore();
      const providerDoc = await db.collection('transport_providers').doc(uid).get();

      if (!providerDoc.exists) {
        return null;
      }

      return new TransportProvider(providerDoc.data());
    } catch (error) {
      logger.error('Error finding transport provider by UID:', error);
      throw error;
    }
  }

  /**
   * Find transport provider by email
   */
  static async findByEmail(email) {
    try {
      const db = getFirestore();
      const querySnapshot = await db.collection('transport_providers')
        .where('email', '==', email)
        .limit(1)
        .get();

      if (querySnapshot.empty) {
        return null;
      }

      const providerDoc = querySnapshot.docs[0];
      return new TransportProvider(providerDoc.data());
    } catch (error) {
      logger.error('Error finding transport provider by email:', error);
      throw error;
    }
  }

  /**
   * Create transport provider from Firebase user
   */
  static fromFirebaseUser(firebaseUser, additionalData = {}) {
    const providerData = {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      displayName: firebaseUser.displayName,
      phoneNumber: firebaseUser.phoneNumber,
      photoURL: firebaseUser.photoURL,
      emailVerified: firebaseUser.emailVerified,
      verification: {
        email: firebaseUser.emailVerified,
        phone: !!firebaseUser.phoneNumber,
        identity: false,
        business: false,
        drivingLicense: false,
        backgroundCheck: false,
        documents: {
          businessLicense: { verified: false, url: '', uploadedAt: null },
          drivingLicense: { verified: false, url: '', uploadedAt: null },
          identity: { verified: false, url: '', uploadedAt: null },
          insurance: { verified: false, url: '', uploadedAt: null }
        }
      },
      profileCompletion: {
        emailVerified: firebaseUser.emailVerified,
        personalInfoComplete: false,
        businessInfoComplete: false,
        serviceInfoComplete: false,
        fleetInfoComplete: false,
        locationComplete: false,
        documentsUploaded: false,
        overallComplete: false,
        completionPercentage: firebaseUser.emailVerified ? 10 : 0
      },
      ...additionalData
    };

    return new TransportProvider(providerData);
  }

  /**
   * Update profile completion status
   */
  updateProfileCompletion() {
    const completion = this.profileCompletion;

    // Check email verification
    completion.emailVerified = this.emailVerified;

    // Check personal info completion
    completion.personalInfoComplete = !!(
      this.personalInfo.fullName &&
      this.personalInfo.dateOfBirth &&
      this.personalInfo.gender &&
      this.personalInfo.address
    );

    // Check business info completion
    completion.businessInfoComplete = !!(
      this.businessInfo.businessName &&
      this.businessInfo.businessType &&
      this.businessInfo.licenseNumber &&
      this.businessInfo.yearsInBusiness &&
      this.businessInfo.businessAddress
    );

    // Check service info completion
    completion.serviceInfoComplete = !!(
      this.serviceInfo.primaryCity &&
      this.serviceInfo.operatingState &&
      this.serviceInfo.serviceTypes.length > 0 &&
      this.serviceInfo.operatingHours
    );

    // Check fleet info completion
    completion.fleetInfoComplete = !!(
      this.fleetInfo.fleetSize &&
      this.fleetInfo.vehicleTypes.length > 0 &&
      this.fleetInfo.averageVehicleAge
    );

    // Check location completion
    completion.locationComplete = !!(
      this.location.village &&
      this.location.city &&
      this.location.district &&
      this.location.state
    );

    // Check documents uploaded
    const docs = this.verification.documents;
    completion.documentsUploaded = !!(
      docs.businessLicense.url &&
      docs.drivingLicense.url &&
      docs.identity.url
    );

    // Calculate overall completion percentage
    const completionSteps = [
      completion.emailVerified,
      completion.personalInfoComplete,
      completion.businessInfoComplete,
      completion.serviceInfoComplete,
      completion.fleetInfoComplete,
      completion.locationComplete,
      completion.documentsUploaded
    ];

    const completedSteps = completionSteps.filter(step => step).length;
    completion.completionPercentage = Math.round((completedSteps / completionSteps.length) * 100);
    completion.overallComplete = completion.completionPercentage === 100;

    // Update account status based on completion
    if (completion.overallComplete && this.accountStatus.status === 'pending') {
      this.accountStatus.status = 'active';
      this.accountStatus.isActive = true;
      this.accountStatus.canReceiveBookings = true;
      this.accountStatus.approvedAt = new Date();
    }
  }

  /**
   * Update personal information
   */
  async updatePersonalInfo(personalData) {
    try {
      Object.keys(personalData).forEach(key => {
        if (this.personalInfo.hasOwnProperty(key)) {
          this.personalInfo[key] = personalData[key];
        }
      });

      this.updateProfileCompletion();
      this.updatedAt = new Date();
      await this.save();
      return this;
    } catch (error) {
      logger.error('Error updating personal info:', error);
      throw error;
    }
  }

  /**
   * Update business information
   */
  async updateBusinessInfo(businessData) {
    try {
      Object.keys(businessData).forEach(key => {
        if (this.businessInfo.hasOwnProperty(key)) {
          this.businessInfo[key] = businessData[key];
        }
      });

      this.updateProfileCompletion();
      this.updatedAt = new Date();
      await this.save();
      return this;
    } catch (error) {
      logger.error('Error updating business info:', error);
      throw error;
    }
  }

  /**
   * Update service information
   */
  async updateServiceInfo(serviceData) {
    try {
      Object.keys(serviceData).forEach(key => {
        if (this.serviceInfo.hasOwnProperty(key)) {
          this.serviceInfo[key] = serviceData[key];
        }
      });

      this.updateProfileCompletion();
      this.updatedAt = new Date();
      await this.save();
      return this;
    } catch (error) {
      logger.error('Error updating service info:', error);
      throw error;
    }
  }

  /**
   * Update fleet information
   */
  async updateFleetInfo(fleetData) {
    try {
      Object.keys(fleetData).forEach(key => {
        if (this.fleetInfo.hasOwnProperty(key)) {
          this.fleetInfo[key] = fleetData[key];
        }
      });

      this.updateProfileCompletion();
      this.updatedAt = new Date();
      await this.save();
      return this;
    } catch (error) {
      logger.error('Error updating fleet info:', error);
      throw error;
    }
  }

  /**
   * Update location information
   */
  async updateLocation(locationData) {
    try {
      Object.keys(locationData).forEach(key => {
        if (this.location.hasOwnProperty(key)) {
          this.location[key] = locationData[key];
        }
      });

      this.updateProfileCompletion();
      this.updatedAt = new Date();
      await this.save();
      return this;
    } catch (error) {
      logger.error('Error updating location:', error);
      throw error;
    }
  }

  /**
   * Get public profile (safe for sharing)
   */
  getPublicProfile() {
    return {
      uid: this.uid,
      displayName: this.displayName,
      businessInfo: {
        businessName: this.businessInfo.businessName,
        businessType: this.businessInfo.businessType,
        yearsInBusiness: this.businessInfo.yearsInBusiness
      },
      serviceInfo: {
        primaryCity: this.serviceInfo.primaryCity,
        operatingState: this.serviceInfo.operatingState,
        serviceTypes: this.serviceInfo.serviceTypes,
        specialFeatures: this.serviceInfo.specialFeatures
      },
      fleetInfo: {
        fleetSize: this.fleetInfo.fleetSize,
        vehicleTypes: this.fleetInfo.vehicleTypes
      },
      location: {
        city: this.location.city,
        state: this.location.state
      },
      metrics: {
        averageRating: this.metrics.averageRating,
        totalRatings: this.metrics.totalRatings,
        completionRate: this.metrics.completionRate,
        responseTime: this.metrics.responseTime
      },
      verification: {
        email: this.verification.email,
        phone: this.verification.phone,
        business: this.verification.business
      },
      accountStatus: {
        status: this.accountStatus.status,
        isActive: this.accountStatus.isActive
      }
    };
  }

  /**
   * Convert to JSON (removes sensitive data)
   */
  toJSON() {
    const { financial, ...safeData } = this;

    // Remove sensitive financial data
    const safeCopy = {
      ...safeData,
      financial: {
        bankDetails: {
          verified: financial.bankDetails.verified
        },
        commissionRate: financial.commissionRate,
        payoutSchedule: financial.payoutSchedule
      }
    };

    return safeCopy;
  }
}

module.exports = TransportProvider;