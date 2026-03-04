const Joi = require('joi');
const validator = require('validator');
const logger = require('./logger');

/**
 * Data sanitization utilities
 */
class DataSanitizer {
  /**
   * Sanitize string input to prevent XSS attacks
   */
  static sanitizeString(input) {
    if (typeof input !== 'string') return input;

    // Remove HTML tags and encode special characters
    return validator.escape(input.trim());
  }

  /**
   * Sanitize HTML content (for rich text fields)
   */
  static sanitizeHtml(input) {
    if (typeof input !== 'string') return input;

    // Basic HTML sanitization - remove script tags and dangerous attributes
    return input
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/on\w+="[^"]*"/gi, '')
      .replace(/javascript:/gi, '')
      .trim();
  }

  /**
   * Sanitize phone number
   */
  static sanitizePhone(phone) {
    if (typeof phone !== 'string') return phone;

    // Remove all non-digit characters except +
    return phone.replace(/[^\d+]/g, '');
  }

  /**
   * Sanitize email
   */
  static sanitizeEmail(email) {
    if (typeof email !== 'string') return email;

    return validator.normalizeEmail(email.trim().toLowerCase()) || email;
  }

  /**
   * Sanitize object recursively
   */
  static sanitizeObject(obj, excludedKeys = ['avatar', 'photoURL', 'profilePic', 'image', 'url', 'link']) {
    if (obj === null || typeof obj !== 'object') return obj;

    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item, excludedKeys));
    }

    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      // Skip sanitization for excluded keys
      if (excludedKeys.includes(key)) {
        sanitized[key] = value;
        continue;
      }

      if (typeof value === 'string') {
        sanitized[key] = this.sanitizeString(value);
      } else if (typeof value === 'object') {
        sanitized[key] = this.sanitizeObject(value, excludedKeys);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }
}

/**
 * Common validation schemas using Joi
 */
const ValidationSchemas = {
  // User validation schemas
  userProfile: Joi.object({
    displayName: Joi.string().min(2).max(50).required(),
    bio: Joi.string().max(500).optional(),
    dateOfBirth: Joi.date().max('now').optional(),
    gender: Joi.string().valid('male', 'female', 'other', 'prefer_not_to_say').optional(),
    phoneNumber: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional(),
  }),

  userPreferences: Joi.object({
    smoking: Joi.boolean().optional(),
    pets: Joi.boolean().optional(),
    music: Joi.boolean().optional(),
    conversation: Joi.string().valid('love_to_chat', 'depends_on_mood', 'prefer_quiet').optional(),
    autoApproveBookings: Joi.boolean().optional(),
    notifications: Joi.object({
      email: Joi.boolean().optional(),
      sms: Joi.boolean().optional(),
      push: Joi.boolean().optional(),
    }).optional(),
  }),

  // Ride validation schemas
  rideCreate: Joi.object({
    origin: Joi.object({
      city: Joi.string().min(2).max(100).required(),
      address: Joi.string().min(5).max(200).required(),
      coordinates: Joi.object({
        lat: Joi.number().min(-90).max(90).required(),
        lng: Joi.number().min(-180).max(180).required(),
      }).required(),
    }).required(),
    destination: Joi.object({
      city: Joi.string().min(2).max(100).required(),
      address: Joi.string().min(5).max(200).required(),
      coordinates: Joi.object({
        lat: Joi.number().min(-90).max(90).required(),
        lng: Joi.number().min(-180).max(180).required(),
      }).required(),
    }).required(),
    departureDate: Joi.date().min('now').required(),
    departureTime: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
    pricePerSeat: Joi.number().min(1).max(10000).required(),
    totalSeats: Joi.number().min(1).max(8).required(),
    vehicleId: Joi.string().required(),
    preferences: Joi.object({
      smoking: Joi.boolean().optional(),
      pets: Joi.boolean().optional(),
      music: Joi.boolean().optional(),
      conversation: Joi.string().valid('love_to_chat', 'depends_on_mood', 'prefer_quiet').optional(),
    }).optional(),
    bookingPolicy: Joi.object({
      instantBooking: Joi.boolean().optional(),
      requiresApproval: Joi.boolean().optional(),
      cancellationPolicy: Joi.string().valid('flexible', 'moderate', 'strict').optional(),
    }).optional(),
  }),

  rideUpdate: Joi.object({
    departureDate: Joi.date().min('now').optional(),
    departureTime: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(),
    pricePerSeat: Joi.number().min(1).max(10000).optional(),
    totalSeats: Joi.number().min(1).max(8).optional(),
    preferences: Joi.object({
      smoking: Joi.boolean().optional(),
      pets: Joi.boolean().optional(),
      music: Joi.boolean().optional(),
      conversation: Joi.string().valid('love_to_chat', 'depends_on_mood', 'prefer_quiet').optional(),
    }).optional(),
    bookingPolicy: Joi.object({
      instantBooking: Joi.boolean().optional(),
      requiresApproval: Joi.boolean().optional(),
      cancellationPolicy: Joi.string().valid('flexible', 'moderate', 'strict').optional(),
    }).optional(),
  }),

  // Booking validation schemas
  bookingCreate: Joi.object({
    rideId: Joi.string().required(),
    seatsBooked: Joi.number().min(1).max(8).required(),
    pickupPointIndex: Joi.number().min(0).optional(),
    message: Joi.string().max(500).optional(),
  }),

  // Vehicle validation schemas
  vehicleCreate: Joi.object({
    make: Joi.string().min(2).max(50).required(),
    model: Joi.string().min(1).max(50).required(),
    year: Joi.number().min(1990).max(new Date().getFullYear() + 1).required(),
    color: Joi.string().min(3).max(30).required(),
    licensePlate: Joi.string().min(3).max(15).required(),
    seats: Joi.number().min(2).max(8).required(),
    amenities: Joi.array().items(
      Joi.string().valid('wifi', 'ac', 'music', 'charging', 'gps', 'bluetooth')
    ).optional(),
  }),

  // Review validation schemas
  reviewCreate: Joi.object({
    bookingId: Joi.string().required(),
    rating: Joi.object({
      overall: Joi.number().min(1).max(5).required(),
      punctuality: Joi.number().min(1).max(5).optional(),
      cleanliness: Joi.number().min(1).max(5).optional(),
      communication: Joi.number().min(1).max(5).optional(),
    }).required(),
    comment: Joi.string().max(1000).optional(),
  }),

  // Search validation schemas
  rideSearch: Joi.object({
    origin: Joi.string().min(2).max(100).required(),
    destination: Joi.string().min(2).max(100).required(),
    departureDate: Joi.date().min('now').optional(),
    passengers: Joi.number().min(1).max(8).optional(),
    priceRange: Joi.object({
      min: Joi.number().min(0).optional(),
      max: Joi.number().min(0).optional(),
    }).optional(),
    departureTimeRange: Joi.object({
      start: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(),
      end: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(),
    }).optional(),
    preferences: Joi.object({
      smoking: Joi.boolean().optional(),
      pets: Joi.boolean().optional(),
      music: Joi.boolean().optional(),
    }).optional(),
  }),

  // Payment validation schemas
  paymentInitiate: Joi.object({
    bookingId: Joi.string().required(),
    amount: Joi.number().min(1).max(100000).required(),
    currency: Joi.string().valid('INR', 'USD', 'EUR').default('INR'),
    paymentMethod: Joi.string().valid('card', 'upi', 'wallet', 'netbanking').required(),
  }),

  // Message validation schemas
  messageCreate: Joi.object({
    bookingId: Joi.string().required(),
    message: Joi.string().min(1).max(1000).required(),
    type: Joi.string().valid('text', 'location', 'photo').default('text'),
  }),
};

/**
 * Advanced validation middleware factory
 */
function createValidationMiddleware(schema, options = {}) {
  const {
    sanitize = true,
    source = 'body', // 'body', 'query', 'params'
    allowUnknown = false,
  } = options;

  return (req, res, next) => {
    try {
      let data = req[source];

      // Sanitize data if enabled
      if (sanitize && data) {
        data = DataSanitizer.sanitizeObject(data);
        req[source] = data;
      }

      // Validate with Joi
      const { error, value } = schema.validate(data, {
        allowUnknown,
        stripUnknown: !allowUnknown,
        abortEarly: false,
      });

      if (error) {
        const validationErrors = error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
          value: detail.context?.value,
        }));

        logger.warn(`Validation failed for ${req.method} ${req.originalUrl}:`, validationErrors);

        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input data',
            details: validationErrors,
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Replace original data with validated and sanitized data
      req[source] = value;
      next();
    } catch (err) {
      logger.error('Validation middleware error:', err);
      return res.status(500).json({
        success: false,
        error: {
          code: 'VALIDATION_MIDDLEWARE_ERROR',
          message: 'Internal validation error',
          timestamp: new Date().toISOString(),
        },
      });
    }
  };
}

/**
 * Custom validation functions
 */
const CustomValidators = {
  /**
   * Validate Firebase UID format
   */
  isValidFirebaseUid: (uid) => {
    return typeof uid === 'string' && uid.length >= 10 && uid.length <= 128;
  },

  /**
   * Validate coordinates
   */
  isValidCoordinates: (lat, lng) => {
    return (
      typeof lat === 'number' &&
      typeof lng === 'number' &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180
    );
  },

  /**
   * Validate Indian phone number
   */
  isValidIndianPhone: (phone) => {
    const indianPhoneRegex = /^(\+91|91)?[6-9]\d{9}$/;
    return indianPhoneRegex.test(phone.replace(/\s+/g, ''));
  },

  /**
   * Validate license plate (Indian format)
   */
  isValidLicensePlate: (plate) => {
    const indianPlateRegex = /^[A-Z]{2}[0-9]{1,2}[A-Z]{1,2}[0-9]{4}$/;
    return indianPlateRegex.test(plate.replace(/\s+/g, ''));
  },

  /**
   * Validate future date (for ride scheduling)
   */
  isFutureDate: (date) => {
    return new Date(date) > new Date();
  },

  /**
   * Validate business hours (for ride timing)
   */
  isBusinessHours: (time) => {
    const [hours] = time.split(':').map(Number);
    return hours >= 5 && hours <= 23; // 5 AM to 11 PM
  },
};

/**
 * Rate limiting configurations for different endpoints
 */
const RateLimitConfigs = {
  // Strict limits for sensitive operations
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per window
    message: 'Too many authentication attempts, please try again later',
  },

  // Moderate limits for booking operations
  booking: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 10, // 10 bookings per window
    message: 'Too many booking requests, please slow down',
  },

  // Lenient limits for search operations
  search: {
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 30, // 30 searches per minute
    message: 'Too many search requests, please wait a moment',
  },

  // Very strict limits for payment operations
  payment: {
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 3, // 3 payment attempts per window
    message: 'Too many payment attempts, please contact support',
  },

  // Moderate limits for messaging
  messaging: {
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 20, // 20 messages per minute
    message: 'Too many messages, please slow down',
  },
};

module.exports = {
  DataSanitizer,
  ValidationSchemas,
  createValidationMiddleware,
  CustomValidators,
  RateLimitConfigs,
};