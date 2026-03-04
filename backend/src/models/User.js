const { getFirestore } = require('../config/firebase');
const logger = require('../utils/logger');

class User {
  constructor(data) {
    this.uid = data.uid;
    this.email = data.email;
    this.displayName = data.displayName;
    this.phoneNumber = data.phoneNumber;
    this.photoURL = data.photoURL;
    this.emailVerified = data.emailVerified;
    this.role = data.role || 'passenger'; // passenger, provider, both
    this.profile = data.profile || {};
    this.location = data.location || {}; // Added location field
    this.onboardingCompleted = data.onboardingCompleted || false; // Added onboarding field
    this.verification = data.verification || {};
    this.rating = data.rating || {};
    this.preferences = data.preferences || {};
    this.stats = data.stats || {};
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
  }

  /**
   * Create or update user in Firestore
   */
  async save() {
    try {
      const db = getFirestore();
      const userRef = db.collection('users').doc(this.uid);

      const userData = {
        uid: this.uid,
        email: this.email,
        displayName: this.displayName,
        phoneNumber: this.phoneNumber,
        photoURL: this.photoURL,
        emailVerified: this.emailVerified,
        role: this.role,
        profile: this.profile,
        location: this.location, // Added location field
        onboardingCompleted: this.onboardingCompleted, // Added onboarding field
        verification: this.verification,
        rating: this.rating,
        preferences: this.preferences,
        stats: this.stats,
        updatedAt: new Date(),
      };

      // Only set createdAt if it's a new user
      const existingUser = await userRef.get();
      if (!existingUser.exists) {
        userData.createdAt = this.createdAt;
      }

      // Sanitize data: Use JSON parse/stringify to remove all undefined values recursively
      // Firestore throws error on 'undefined', but handles 'null' or missing fields fine.
      // JSON.stringify removes keys with undefined values.
      const sanitizedData = JSON.parse(JSON.stringify(userData));

      await userRef.set(sanitizedData, { merge: true });
      logger.info(`User saved: ${this.uid}`);
      return this;
    } catch (error) {
      logger.error('Error saving user:', error);
      throw error;
    }
  }

  /**
   * Get user by UID from Firestore
   */
  static async findByUid(uid) {
    try {
      const db = getFirestore();
      const userDoc = await db.collection('users').doc(uid).get();

      if (!userDoc.exists) {
        return null;
      }

      return new User(userDoc.data());
    } catch (error) {
      logger.error('Error finding user by UID:', error);
      throw error;
    }
  }

  /**
   * Get user by email from Firestore
   */
  static async findByEmail(email) {
    try {
      const db = getFirestore();
      const querySnapshot = await db.collection('users')
        .where('email', '==', email)
        .limit(1)
        .get();

      if (querySnapshot.empty) {
        return null;
      }

      const userDoc = querySnapshot.docs[0];
      return new User(userDoc.data());
    } catch (error) {
      logger.error('Error finding user by email:', error);
      throw error;
    }
  }

  /**
   * Create user from Firebase Auth record
   */
  static fromFirebaseUser(firebaseUser, additionalData = {}) {
    const userData = {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      displayName: firebaseUser.displayName,
      phoneNumber: firebaseUser.phoneNumber,
      photoURL: firebaseUser.photoURL,
      emailVerified: firebaseUser.emailVerified,
      role: additionalData.role || 'passenger',
      profile: {
        name: firebaseUser.displayName || '',
        email: firebaseUser.email,
        phone: firebaseUser.phoneNumber || '',
        avatar: firebaseUser.photoURL || '',
        bio: '',
        dateOfBirth: null,
        gender: '',
        ...additionalData.profile
      },
      verification: {
        email: firebaseUser.emailVerified,
        phone: !!firebaseUser.phoneNumber,
        identity: false,
        drivingLicense: false,
        backgroundCheck: false,
        ...additionalData.verification
      },
      rating: {
        asPassenger: {
          average: 0,
          count: 0,
          breakdown: {
            punctuality: 0,
            friendliness: 0,
            cleanliness: 0
          }
        },
        asDriver: {
          average: 0,
          count: 0,
          breakdown: {
            driving: 0,
            punctuality: 0,
            friendliness: 0,
            vehicleCondition: 0
          }
        },
        ...additionalData.rating
      },
      preferences: {
        smoking: false,
        pets: false,
        music: true,
        conversation: 'depends_on_mood',
        autoApproveBookings: false,
        notifications: {
          email: true,
          sms: true,
          push: true
        },
        ...additionalData.preferences
      },
      stats: {
        totalRidesAsPassenger: 0,
        totalRidesAsDriver: 0,
        totalEarnings: 0,
        memberSince: new Date(),
        lastActiveAt: new Date(),
        completionRate: 100,
        responseTime: 0,
        ...additionalData.stats
      },
      location: additionalData.location || {},
      onboardingCompleted: additionalData.onboardingCompleted || false
    };

    return new User(userData);
  }

  /**
   * Update user profile
   */
  async updateProfile(profileData) {
    try {
      // Handle regular profile fields
      const profileFields = ['name', 'bio', 'dateOfBirth', 'gender', 'avatar', 'phone'];
      profileFields.forEach(field => {
        if (profileData[field] !== undefined) {
          this.profile[field] = profileData[field];
        }
      });

      // Sync avatar to root photoURL if updated
      if (profileData.avatar) {
        this.photoURL = profileData.avatar;
      }

      // Also update phoneNumber at root level if phone is provided
      if (profileData.phone) {
        this.phoneNumber = profileData.phone;
      }

      // Handle location separately
      if (profileData.location) {
        this.location = profileData.location;
      }

      // Handle onboarding completion
      if (profileData.onboardingCompleted !== undefined) {
        this.onboardingCompleted = profileData.onboardingCompleted;
      }

      this.updatedAt = new Date();
      await this.save();
      return this;
    } catch (error) {
      logger.error('Error updating user profile:', error);
      throw error;
    }
  }

  /**
   * Update user role
   */
  async updateRole(newRole) {
    try {
      if (!['passenger', 'provider', 'both', 'transport_provider'].includes(newRole)) {
        throw new Error('Invalid role');
      }

      this.role = newRole;
      this.updatedAt = new Date();
      await this.save();
      return this;
    } catch (error) {
      logger.error('Error updating user role:', error);
      throw error;
    }
  }

  /**
   * Update verification status
   */
  async updateVerification(verificationData) {
    try {
      this.verification = { ...this.verification, ...verificationData };
      this.updatedAt = new Date();
      await this.save();
      return this;
    } catch (error) {
      logger.error('Error updating user verification:', error);
      throw error;
    }
  }

  /**
   * Update user preferences
   */
  async updatePreferences(preferencesData) {
    try {
      this.preferences = { ...this.preferences, ...preferencesData };
      this.updatedAt = new Date();
      await this.save();
      return this;
    } catch (error) {
      logger.error('Error updating user preferences:', error);
      throw error;
    }
  }

  /**
   * Check if user has specific role
   */
  hasRole(role) {
    if (this.role === 'both') {
      return ['passenger', 'provider'].includes(role);
    }
    return this.role === role;
  }

  /**
   * Check if user is verified
   */
  isVerified() {
    return this.verification.email && this.verification.phone;
  }

  /**
   * Check if user can provide rides
   */
  canProvideRides() {
    return this.hasRole('provider') && this.verification.drivingLicense;
  }

  /**
   * Get user's public profile (safe for sharing)
   */
  getPublicProfile() {
    return {
      uid: this.uid,
      displayName: this.displayName,
      photoURL: this.photoURL,
      profile: {
        name: this.profile.name,
        avatar: this.profile.avatar,
        bio: this.profile.bio
      },
      rating: this.rating,
      verification: {
        email: this.verification.email,
        phone: this.verification.phone,
        identity: this.verification.identity
      },
      stats: {
        totalRidesAsPassenger: this.stats.totalRidesAsPassenger,
        totalRidesAsDriver: this.stats.totalRidesAsDriver,
        memberSince: this.stats.memberSince,
        completionRate: this.stats.completionRate
      }
    };
  }

  /**
   * Convert to JSON (removes sensitive data)
   */
  toJSON() {
    const { providerData, ...safeData } = this;

    // Remove sensitive provider data
    const safeCopy = {
      ...safeData,
      role: this.role, // Explicitly include role
      location: this.location, // Include location
      onboardingCompleted: this.onboardingCompleted, // Include onboarding status
    };

    return safeCopy;
  }
}

module.exports = User;