const { verifyIdToken } = require('../config/firebase');
const { session } = require('../config/redis');
const cacheService = require('../services/cacheService');
const UserService = require('../services/userService');
const logger = require('../utils/logger');

/**
 * Verify Firebase token (for Socket.io authentication)
 * @param {string} token - Firebase ID token
 * @returns {Object} Decoded token
 */
async function verifyFirebaseToken(token) {
  return await verifyIdToken(token);
}

/**
 * Standard API error response helper
 */
function sendError(res, statusCode, code, message, details = null) {
  const response = {
    success: false,
    error: {
      code,
      message,
      timestamp: new Date().toISOString(),
    },
  };

  if (details) {
    response.error.details = details;
  }

  res.status(statusCode).json(response);
}

/**
 * Authentication middleware to verify Firebase tokens with enhanced caching
 */
async function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return sendError(res, 401, 'MISSING_TOKEN', 'Access token is required');
    }

    // Verify Firebase ID token
    logger.debug(`Verifying token: ${token.substring(0, 10)}...`);
    const decodedToken = await verifyIdToken(token);
    logger.debug(`Token verified for uid: ${decodedToken.uid}`);

    // Try to get user data from enhanced cache first
    let user = await cacheService.getCachedUserProfile(decodedToken.uid);
    let sessionData = await cacheService.getCachedUserSession(decodedToken.uid);

    if (!user) {
      // Sync user with Firestore and get complete profile
      user = await UserService.syncUser(decodedToken.uid);
      // Cache the user profile
      await cacheService.cacheUserProfile(decodedToken.uid, user);
    }

    if (!sessionData) {
      // Get or create user session
      sessionData = await UserService.getUserSession(decodedToken.uid);
      if (!sessionData) {
        sessionData = await UserService.createUserSession(decodedToken.uid, {
          loginTime: new Date(),
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          lastActivity: new Date()
        });
      }
      // Cache the session data
      await cacheService.cacheUserSession(decodedToken.uid, sessionData);
    } else {
      // Update last activity in cached session
      sessionData.lastActivity = new Date();
      await cacheService.cacheUserSession(decodedToken.uid, sessionData);
    }

    // Attach user info to request
    req.user = {
      uid: user.uid,
      email: user.email,
      emailVerified: user.emailVerified,
      displayName: user.displayName,
      photoURL: user.photoURL,
      phoneNumber: user.phoneNumber,
      role: user.role,
      profile: user.profile,
      verification: user.verification,
      preferences: user.preferences,
      rating: user.rating,
      stats: user.stats,
      sessionData: sessionData,
      // Helper methods
      hasRole: (role) => user.hasRole ? user.hasRole(role) : (user.role === role || user.role === 'both'),
      isVerified: () => user.isVerified ? user.isVerified() : (user.verification?.email && user.verification?.phone),
      canProvideRides: () => user.canProvideRides ? user.canProvideRides() : (user.role === 'provider' || user.role === 'transport_provider' || user.role === 'both'),
    };

    logger.debug(`User authenticated: ${req.user.uid} (${req.user.role}) - cached: ${!!user && !!sessionData}`);
    next();
  } catch (error) {
    logger.error(`Authentication error: ${error.code} - ${error.message}`);

    if (error.code === 'auth/id-token-expired') {
      return sendError(res, 401, 'TOKEN_EXPIRED', 'Access token has expired');
    }

    if (error.code === 'auth/id-token-revoked') {
      return sendError(res, 401, 'TOKEN_REVOKED', 'Access token has been revoked');
    }

    if (error.code === 'auth/invalid-id-token') {
      return sendError(res, 401, 'INVALID_TOKEN', 'Invalid access token');
    }

    return sendError(res, 401, 'AUTHENTICATION_FAILED', 'Authentication failed');
  }
}

/**
 * Optional authentication middleware with enhanced caching (doesn't fail if no token)
 */
async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      req.user = null;
      return next();
    }

    // Try to authenticate, but don't fail if it doesn't work
    const decodedToken = await verifyIdToken(token);

    // Try cache first
    let user = await cacheService.getCachedUserProfile(decodedToken.uid);
    let sessionData = await cacheService.getCachedUserSession(decodedToken.uid);

    if (!user) {
      user = await UserService.syncUser(decodedToken.uid);
      await cacheService.cacheUserProfile(decodedToken.uid, user);
    }

    if (!sessionData) {
      sessionData = await UserService.getUserSession(decodedToken.uid);
      if (sessionData) {
        await cacheService.cacheUserSession(decodedToken.uid, sessionData);
      }
    } else {
      // Update activity and extend session
      sessionData.lastActivity = new Date();
      await cacheService.cacheUserSession(decodedToken.uid, sessionData);
      await session.extend(decodedToken.uid);
    }

    req.user = {
      uid: user.uid,
      email: user.email,
      emailVerified: user.emailVerified,
      displayName: user.displayName,
      photoURL: user.photoURL,
      phoneNumber: user.phoneNumber,
      role: user.role,
      profile: user.profile,
      verification: user.verification,
      preferences: user.preferences,
      rating: user.rating,
      stats: user.stats,
      sessionData: sessionData,
      hasRole: (role) => user.hasRole ? user.hasRole(role) : (user.role === role || user.role === 'both'),
      isVerified: () => user.isVerified ? user.isVerified() : (user.verification?.email && user.verification?.phone),
      canProvideRides: () => user.canProvideRides ? user.canProvideRides() : (user.role === 'provider' || user.role === 'both'),
    };

    logger.debug(`Optional auth successful: ${req.user.uid} - cached: ${!!user && !!sessionData}`);
  } catch (error) {
    logger.debug('Optional auth failed, continuing without user:', error.message);
    req.user = null;
  }

  next();
}

/**
 * Role-based authorization middleware
 */
function requireRole(roles) {
  return (req, res, next) => {
    if (!req.user) {
      return sendError(res, 401, 'AUTHENTICATION_REQUIRED', 'Authentication required');
    }

    const hasRequiredRole = roles.some(role => req.user.hasRole(role));

    if (!hasRequiredRole) {
      logger.warn(`Access denied for user ${req.user.uid}. Required roles: ${roles.join(', ')}, User role: ${req.user.role}`);
      return sendError(res, 403, 'INSUFFICIENT_PERMISSIONS', 'Insufficient permissions');
    }

    next();
  };
}

/**
 * Check if user is a passenger
 */
function requirePassenger(req, res, next) {
  return requireRole(['passenger', 'both'])(req, res, next);
}

/**
 * Check if user is a provider
 */
function requireProvider(req, res, next) {
  return requireRole(['provider', 'transport_provider', 'both'])(req, res, next);
}

/**
 * Check if user is admin
 */
function requireAdmin(req, res, next) {
  return requireRole(['admin'])(req, res, next);
}

module.exports = {
  authenticateToken,
  optionalAuth,
  requireRole,
  requirePassenger,
  requireProvider,
  requireAdmin,
  verifyFirebaseToken,
};