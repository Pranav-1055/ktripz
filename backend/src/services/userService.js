const { getUserByUid, getAuth } = require('../config/firebase');
const { session } = require('../config/redis');
const User = require('../models/User');
const logger = require('../utils/logger');

class UserService {
  /**
   * Sync Firebase user with Firestore user profile
   */
  static async syncUser(firebaseUid, additionalData = {}) {
    try {
      // Get user from Firebase Auth
      const firebaseUser = await getUserByUid(firebaseUid);

      logger.info(`[UserService] syncUser called for UID: ${firebaseUid}`);
      logger.info(`[UserService] additionalData received: ${JSON.stringify(additionalData, null, 2)}`);

      // Check if user already exists in Firestore
      let user = await User.findByUid(firebaseUid);

      if (user) {
        // Update existing user with latest Firebase data
        user.email = firebaseUser.email;
        user.displayName = firebaseUser.displayName;
        user.phoneNumber = firebaseUser.phoneNumber;
        user.photoURL = firebaseUser.photoURL;
        user.emailVerified = firebaseUser.emailVerified;

        // Update profile data
        // Update profile data from additionalData if provided
        if (additionalData.profile) {
          user.profile = { ...user.profile, ...additionalData.profile };
        }

        // Update location if provided
        if (additionalData.location) {
          user.location = additionalData.location;
        }

        // Update onboarding status
        if (additionalData.onboardingCompleted !== undefined) {
          user.onboardingCompleted = additionalData.onboardingCompleted;
        }

        // Update role if provided and different (e.g. promoting passenger to provider)
        if (additionalData.role && additionalData.role !== user.role) {
          logger.info(`[UserService] Updating role for user ${firebaseUid}. Current: ${user.role}, New: ${additionalData.role}`);

          let newRole = additionalData.role;
          if (
            (user.role === 'passenger' && additionalData.role === 'transport_provider') ||
            (user.role === 'transport_provider' && additionalData.role === 'passenger') ||
            (user.role === 'passenger' && additionalData.role === 'provider') || // Handle inconsistent naming
            (user.role === 'provider' && additionalData.role === 'passenger')
          ) {
            newRole = 'both';
          }

          if (newRole !== user.role) {
            logger.info(`[UserService] Merged role: ${newRole}`);
            user.role = newRole;

            // Update custom claims
            try {
              const auth = getAuth();
              await auth.setCustomUserClaims(firebaseUid, {
                role: user.role,
                roles: user.role === 'both' ? ['passenger', 'provider'] : [user.role]
              });
            } catch (claimsError) {
              logger.error(`[UserService] Failed to update claims for ${firebaseUid}:`, claimsError);
            }
          }
        }

        // Update profile data from Firebase (overwrites specific fields if they changed in Auth)
        if (user.profile.name !== firebaseUser.displayName && firebaseUser.displayName) {
          user.profile.name = firebaseUser.displayName;
        }
        if (user.profile.email !== firebaseUser.email) {
          user.profile.email = firebaseUser.email;
        }
        if (user.profile.phone !== firebaseUser.phoneNumber && firebaseUser.phoneNumber) {
          user.profile.phone = firebaseUser.phoneNumber;
        }
        if (user.profile.avatar !== firebaseUser.photoURL && firebaseUser.photoURL) {
          user.profile.avatar = firebaseUser.photoURL;
        }

        // Update verification status
        user.verification.email = firebaseUser.emailVerified;
        user.verification.phone = !!firebaseUser.phoneNumber;

        // Update last active time
        user.stats.lastActiveAt = new Date();

        await user.save();
        logger.info(`User synced: ${firebaseUid}`);
      } else {
        // Create new user from Firebase data
        user = User.fromFirebaseUser(firebaseUser, additionalData);
        await user.save();
        logger.info(`New user created: ${firebaseUid}`);
      }

      return user;
    } catch (error) {
      logger.error('Error syncing user:', error);
      throw error;
    }
  }

  /**
   * Get user profile by UID
   */
  static async getUserProfile(uid) {
    try {
      const user = await User.findByUid(uid);
      if (!user) {
        throw new Error('User not found');
      }
      return user;
    } catch (error) {
      logger.error('Error getting user profile:', error);
      throw error;
    }
  }

  /**
   * Update user profile
   */
  static async updateUserProfile(uid, profileData) {
    try {
      const user = await User.findByUid(uid);
      if (!user) {
        throw new Error('User not found');
      }

      // Validate profile data
      const allowedFields = [
        'name', 'bio', 'dateOfBirth', 'gender', 'avatar', 'location', 'onboardingCompleted'
      ];

      const filteredData = {};
      Object.keys(profileData).forEach(key => {
        if (allowedFields.includes(key)) {
          filteredData[key] = profileData[key];
        }
      });

      // Handle location data separately
      if (profileData.location) {
        user.location = {
          village: profileData.location.village || '',
          wadi: profileData.location.wadi || '',
          district: profileData.location.district || '',
          state: profileData.location.state || '',
          country: profileData.location.country || 'India',
          // Add support for new manual entry fields
          street: profileData.location.street || '',
          city: profileData.location.city || '',
          fullAddress: profileData.location.fullAddress || '',
          coordinates: profileData.location.coordinates || null
        };
      }

      // Handle onboarding completion
      if (profileData.onboardingCompleted !== undefined) {
        user.onboardingCompleted = profileData.onboardingCompleted;
      }

      await user.updateProfile(filteredData);
      logger.info(`User profile updated: ${uid}`);
      return user;
    } catch (error) {
      logger.error('Error updating user profile:', error);
      throw error;
    }
  }

  /**
   * Update user role
   */
  static async updateUserRole(uid, newRole) {
    try {
      const user = await User.findByUid(uid);
      if (!user) {
        throw new Error('User not found');
      }

      await user.updateRole(newRole);

      // Update Firebase custom claims
      const auth = getAuth();
      await auth.setCustomUserClaims(uid, {
        role: newRole,
        roles: newRole === 'both' ? ['passenger', 'provider'] : [newRole]
      });

      logger.info(`User role updated: ${uid} -> ${newRole}`);
      return user;
    } catch (error) {
      logger.error('Error updating user role:', error);
      throw error;
    }
  }

  /**
   * Update user preferences
   */
  static async updateUserPreferences(uid, preferencesData) {
    try {
      const user = await User.findByUid(uid);
      if (!user) {
        throw new Error('User not found');
      }

      await user.updatePreferences(preferencesData);
      logger.info(`User preferences updated: ${uid}`);
      return user;
    } catch (error) {
      logger.error('Error updating user preferences:', error);
      throw error;
    }
  }

  /**
   * Update user verification status
   */
  static async updateUserVerification(uid, verificationData) {
    try {
      const user = await User.findByUid(uid);
      if (!user) {
        throw new Error('User not found');
      }

      await user.updateVerification(verificationData);
      logger.info(`User verification updated: ${uid}`);
      return user;
    } catch (error) {
      logger.error('Error updating user verification:', error);
      throw error;
    }
  }

  /**
   * Create user session
   */
  static async createUserSession(uid, sessionData = {}) {
    try {
      const user = await User.findByUid(uid);
      if (!user) {
        throw new Error('User not found');
      }

      const sessionInfo = {
        uid: user.uid,
        email: user.email,
        role: user.role,
        displayName: user.displayName,
        photoURL: user.photoURL,
        lastActiveAt: new Date(),
        ...sessionData
      };

      await session.set(uid, sessionInfo, 86400); // 24 hours
      logger.info(`User session created: ${uid}`);
      return sessionInfo;
    } catch (error) {
      logger.error('Error creating user session:', error);
      throw error;
    }
  }

  /**
   * Get user session
   */
  static async getUserSession(uid) {
    try {
      const sessionData = await session.get(uid);
      if (sessionData) {
        // Extend session
        await session.extend(uid);
      }
      return sessionData;
    } catch (error) {
      logger.error('Error getting user session:', error);
      throw error;
    }
  }

  /**
   * Delete user session
   */
  static async deleteUserSession(uid) {
    try {
      await session.delete(uid);
      logger.info(`User session deleted: ${uid}`);
    } catch (error) {
      logger.error('Error deleting user session:', error);
      throw error;
    }
  }

  /**
   * Get user's public profile
   */
  static async getPublicProfile(uid) {
    try {
      const user = await User.findByUid(uid);
      if (!user) {
        throw new Error('User not found');
      }
      return user.getPublicProfile();
    } catch (error) {
      logger.error('Error getting public profile:', error);
      throw error;
    }
  }

  /**
   * Search users by criteria
   */
  static async searchUsers(criteria = {}, limit = 20) {
    try {
      const { getFirestore } = require('../config/firebase');
      const db = getFirestore();

      let query = db.collection('users');

      // Apply filters
      if (criteria.role) {
        query = query.where('role', '==', criteria.role);
      }

      if (criteria.verified) {
        query = query.where('verification.email', '==', true)
          .where('verification.phone', '==', true);
      }

      query = query.limit(limit);

      const snapshot = await query.get();
      const users = [];

      snapshot.forEach(doc => {
        const user = new User(doc.data());
        users.push(user.getPublicProfile());
      });

      return users;
    } catch (error) {
      logger.error('Error searching users:', error);
      throw error;
    }
  }

  /**
   * Update user stats
   */
  static async updateUserStats(uid, statsUpdate) {
    try {
      const user = await User.findByUid(uid);
      if (!user) {
        throw new Error('User not found');
      }

      // Update stats
      Object.keys(statsUpdate).forEach(key => {
        if (user.stats.hasOwnProperty(key)) {
          user.stats[key] = statsUpdate[key];
        }
      });

      user.updatedAt = new Date();
      await user.save();

      logger.info(`User stats updated: ${uid}`);
      return user;
    } catch (error) {
      logger.error('Error updating user stats:', error);
      throw error;
    }
  }
}

module.exports = UserService;