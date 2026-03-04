const express = require('express');
const { body, query } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const { handleValidationErrors, asyncHandler, sendResponse, sendError } = require('../middleware');
const TransportProviderService = require('../services/transportProviderService');
const { verifyIdToken } = require('../config/firebase');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * POST /api/transport-providers/register
 * Register new transport provider
 */
router.post('/register', [
  body('token').notEmpty().withMessage('Firebase token is required'),
  // Optional: Add deeper validation if needed, but for now allow the objects through suitable service validation
  body('businessInfo').optional().isObject(),
  body('fleetInfo').optional().isObject(),
  handleValidationErrors,
], asyncHandler(async (req, res) => {
  const { token, businessInfo, fleetInfo, location, personalInfo } = req.body;

  try {
    // Verify Firebase ID token
    const decodedToken = await verifyIdToken(token);

    // Check if email is already registered as transport provider
    const isRegistered = await TransportProviderService.isEmailRegistered(decodedToken.email);
    if (isRegistered) {
      return sendError(res, 409, 'EMAIL_ALREADY_REGISTERED', 'This email is already registered as a transport provider');
    }

    // Create transport provider
    const additionalData = {
      businessInfo,
      fleetInfo,
      location,
      personalInfo
    };

    const provider = await TransportProviderService.createProvider(decodedToken.uid, additionalData);

    sendResponse(res, 201, {
      provider: provider.toJSON()
    }, 'Transport provider registered successfully');
  } catch (error) {
    // Debug logging to file
    try {
      const fs = require('fs');
      const path = require('path');
      const logPath = path.join(process.cwd(), 'error_log.txt');
      fs.appendFileSync(logPath, `[${new Date().toISOString()}] Registration Error: ${error.message}\nStack: ${error.stack}\n\n`);
    } catch (e) { }

    logger.error('Transport provider registration failed:', error);
    if (error.message.includes('already registered')) {
      sendError(res, 409, 'EMAIL_ALREADY_REGISTERED', error.message);
    } else {
      sendError(res, 500, 'REGISTRATION_FAILED', `Failed to register transport provider: ${error.message}`);
    }
  }
}));

/**
 * POST /api/transport-providers/verify-token
 * Verify Firebase token and return transport provider info
 */
router.post('/verify-token', [
  body('token').notEmpty().withMessage('Token is required'),
  handleValidationErrors,
], asyncHandler(async (req, res) => {
  const { token } = req.body;

  try {
    // Verify Firebase ID token
    const decodedToken = await verifyIdToken(token);

    // Sync transport provider with Firestore
    const provider = await TransportProviderService.syncProvider(decodedToken.uid);

    sendResponse(res, 200, {
      provider: provider.toJSON()
    }, 'Token verified successfully');
  } catch (error) {
    logger.error('Token verification failed:', error);
    sendError(res, 401, 'INVALID_TOKEN', 'Invalid or expired token');
  }
}));

/**
 * GET /api/transport-providers/profile
 * Get current transport provider's profile
 */
router.get('/profile', authenticateToken, asyncHandler(async (req, res) => {
  try {
    const provider = await TransportProviderService.getProviderProfile(req.user.uid);
    sendResponse(res, 200, { provider: provider.toJSON() }, 'Profile retrieved successfully');
  } catch (error) {
    logger.error('Failed to get transport provider profile:', error);
    sendError(res, 404, 'PROVIDER_NOT_FOUND', 'Transport provider profile not found');
  }
}));

/**
 * PUT /api/transport-providers/personal-info
 * Update personal information
 */
router.put('/personal-info', [
  authenticateToken,
  body('fullName').optional().isLength({ min: 1, max: 100 }).withMessage('Full name must be 1-100 characters'),
  body('dateOfBirth').optional().isISO8601().withMessage('Invalid date format'),
  body('gender').optional().isIn(['male', 'female', 'other']).withMessage('Invalid gender'),
  body('address').optional().isLength({ min: 1, max: 500 }).withMessage('Address must be 1-500 characters'),
  body('emergencyContact.name').optional().isLength({ min: 1, max: 100 }).withMessage('Emergency contact name must be 1-100 characters'),
  body('emergencyContact.phone').optional().isLength({ min: 10, max: 20 }).withMessage('Emergency contact phone must be 10-20 characters'),
  body('emergencyContact.relation').optional().isLength({ min: 1, max: 50 }).withMessage('Emergency contact relation must be 1-50 characters'),
  handleValidationErrors,
], asyncHandler(async (req, res) => {
  try {
    const personalData = req.body;
    const provider = await TransportProviderService.updatePersonalInfo(req.user.uid, personalData);
    sendResponse(res, 200, { provider: provider.toJSON() }, 'Personal information updated successfully');
  } catch (error) {
    logger.error('Failed to update personal info:', error);
    sendError(res, 500, 'UPDATE_FAILED', 'Failed to update personal information');
  }
}));

/**
 * PUT /api/transport-providers/business-info
 * Update business information
 */
router.put('/business-info', [
  authenticateToken,
  body('businessName').optional().isLength({ min: 1, max: 100 }).withMessage('Business name must be 1-100 characters'),
  body('businessType').optional().isIn(['individual', 'company', 'partnership']).withMessage('Invalid business type'),
  body('licenseNumber').optional().isLength({ min: 1, max: 50 }).withMessage('License number must be 1-50 characters'),
  body('yearsInBusiness').optional().isIn(['0-1', '1-3', '3-5', '5-10', '10+']).withMessage('Invalid years in business'),
  body('businessAddress').optional().isLength({ min: 1, max: 500 }).withMessage('Business address must be 1-500 characters'),
  body('gstNumber').optional().isLength({ min: 15, max: 15 }).withMessage('GST number must be 15 characters'),
  body('panNumber').optional().isLength({ min: 10, max: 10 }).withMessage('PAN number must be 10 characters'),
  handleValidationErrors,
], asyncHandler(async (req, res) => {
  try {
    const businessData = req.body;
    const provider = await TransportProviderService.updateBusinessInfo(req.user.uid, businessData);
    sendResponse(res, 200, { provider: provider.toJSON() }, 'Business information updated successfully');
  } catch (error) {
    logger.error('Failed to update business info:', error);
    sendError(res, 500, 'UPDATE_FAILED', 'Failed to update business information');
  }
}));

/**
 * PUT /api/transport-providers/service-info
 * Update service information
 */
router.put('/service-info', [
  authenticateToken,
  body('primaryCity').optional().isLength({ min: 1, max: 100 }).withMessage('Primary city must be 1-100 characters'),
  body('operatingState').optional().isLength({ min: 1, max: 100 }).withMessage('Operating state must be 1-100 characters'),
  body('serviceTypes').optional().isArray().withMessage('Service types must be an array'),
  body('serviceTypes.*').optional().isIn(['airport_transfer', 'city_tours', 'intercity', 'local_taxi', 'corporate', 'events']).withMessage('Invalid service type'),
  body('operatingHours').optional().isIn(['24/7', '6am-10pm', '8am-8pm', 'custom']).withMessage('Invalid operating hours'),
  body('specialFeatures').optional().isArray().withMessage('Special features must be an array'),
  body('specialFeatures.*').optional().isIn(['air_conditioning', 'wifi', 'gps_tracking', 'music_system', 'wheelchair_accessible']).withMessage('Invalid special feature'),
  handleValidationErrors,
], asyncHandler(async (req, res) => {
  try {
    const serviceData = req.body;
    const provider = await TransportProviderService.updateServiceInfo(req.user.uid, serviceData);
    sendResponse(res, 200, { provider: provider.toJSON() }, 'Service information updated successfully');
  } catch (error) {
    logger.error('Failed to update service info:', error);
    sendError(res, 500, 'UPDATE_FAILED', 'Failed to update service information');
  }
}));

/**
 * PUT /api/transport-providers/fleet-info
 * Update fleet information
 */
router.put('/fleet-info', [
  authenticateToken,
  body('fleetSize').optional().isIn(['1', '2-5', '6-10', '11-25', '25+']).withMessage('Invalid fleet size'),
  body('vehicleTypes').optional().isArray().withMessage('Vehicle types must be an array'),
  body('vehicleTypes.*').optional().isIn(['luxury_car', 'minivan', 'bus', 'bike']).withMessage('Invalid vehicle type'),
  body('averageVehicleAge').optional().isIn(['0-2', '2-5', '5-8', '8+']).withMessage('Invalid vehicle age'),
  body('totalVehicles').optional().isInt({ min: 0, max: 1000 }).withMessage('Total vehicles must be between 0 and 1000'),
  handleValidationErrors,
], asyncHandler(async (req, res) => {
  try {
    const fleetData = req.body;
    const provider = await TransportProviderService.updateFleetInfo(req.user.uid, fleetData);
    sendResponse(res, 200, { provider: provider.toJSON() }, 'Fleet information updated successfully');
  } catch (error) {
    logger.error('Failed to update fleet info:', error);
    sendError(res, 500, 'UPDATE_FAILED', 'Failed to update fleet information');
  }
}));

/**
 * PUT /api/transport-providers/location
 * Update location information
 */
router.put('/location', [
  authenticateToken,
  body('village').optional().isLength({ min: 1, max: 100 }).withMessage('Village must be 1-100 characters'),
  body('city').optional().isLength({ min: 1, max: 100 }).withMessage('City must be 1-100 characters'),
  body('district').optional().isLength({ min: 1, max: 100 }).withMessage('District must be 1-100 characters'),
  body('state').optional().isLength({ min: 1, max: 100 }).withMessage('State must be 1-100 characters'),
  body('country').optional().isLength({ min: 1, max: 100 }).withMessage('Country must be 1-100 characters'),
  body('coordinates.latitude').optional().isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude'),
  body('coordinates.longitude').optional().isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude'),
  body('operatingRadius').optional().isInt({ min: 1, max: 500 }).withMessage('Operating radius must be between 1 and 500 km'),
  handleValidationErrors,
], asyncHandler(async (req, res) => {
  try {
    const locationData = req.body;
    const provider = await TransportProviderService.updateLocation(req.user.uid, locationData);
    sendResponse(res, 200, { provider: provider.toJSON() }, 'Location information updated successfully');
  } catch (error) {
    logger.error('Failed to update location:', error);
    sendError(res, 500, 'UPDATE_FAILED', 'Failed to update location information');
  }
}));

/**
 * GET /api/transport-providers/search
 * Search transport providers
 */
router.get('/search', [
  query('city').optional().isLength({ min: 1, max: 100 }).withMessage('City must be 1-100 characters'),
  query('state').optional().isLength({ min: 1, max: 100 }).withMessage('State must be 1-100 characters'),
  query('serviceType').optional().isIn(['airport_transfer', 'city_tours', 'intercity', 'local_taxi', 'corporate', 'events']).withMessage('Invalid service type'),
  query('vehicleType').optional().isIn(['luxury_car', 'minivan', 'bus', 'bike']).withMessage('Invalid vehicle type'),
  query('verified').optional().isBoolean().withMessage('Verified must be boolean'),
  query('active').optional().isBoolean().withMessage('Active must be boolean'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  handleValidationErrors,
], asyncHandler(async (req, res) => {
  try {
    const criteria = req.query;
    const limit = parseInt(criteria.limit) || 20;
    delete criteria.limit;

    const providers = await TransportProviderService.searchProviders(criteria, limit);
    sendResponse(res, 200, { providers, count: providers.length }, 'Transport providers retrieved successfully');
  } catch (error) {
    logger.error('Failed to search transport providers:', error);
    sendError(res, 500, 'SEARCH_FAILED', 'Failed to search transport providers');
  }
}));

/**
 * GET /api/transport-providers/:uid/public
 * Get transport provider's public profile
 */
router.get('/:uid/public', [
  authenticateToken,
], asyncHandler(async (req, res) => {
  try {
    const { uid } = req.params;
    const publicProfile = await TransportProviderService.getPublicProfile(uid);
    sendResponse(res, 200, { provider: publicProfile }, 'Public profile retrieved successfully');
  } catch (error) {
    logger.error('Failed to get public profile:', error);
    sendError(res, 404, 'PROVIDER_NOT_FOUND', 'Transport provider not found');
  }
}));

/**
 * POST /api/transport-providers/check-email
 * Check if email is already registered
 */
router.post('/check-email', [
  body('email').isEmail().withMessage('Valid email is required'),
  handleValidationErrors,
], asyncHandler(async (req, res) => {
  try {
    const { email } = req.body;
    const isRegistered = await TransportProviderService.isEmailRegistered(email);
    sendResponse(res, 200, { isRegistered }, 'Email check completed');
  } catch (error) {
    logger.error('Failed to check email:', error);
    sendError(res, 500, 'CHECK_FAILED', 'Failed to check email registration');
  }
}));

module.exports = router;