const express = require('express');
const { param, query } = require('express-validator');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const { handleValidationErrors, asyncHandler, sendResponse, sendError } = require('../middleware');
const UserService = require('../services/userService');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * GET /api/users/:userId
 * Get user's public profile
 */
router.get('/:userId', [
  optionalAuth,
  param('userId').notEmpty().withMessage('User ID is required'),
  handleValidationErrors,
], asyncHandler(async (req, res) => {
  try {
    const { userId } = req.params;

    // If user is authenticated and is requesting their own profile, return full details
    if (req.user && req.user.uid === userId) {
      const user = await UserService.getUserProfile(userId);
      return sendResponse(res, 200, { user: user.toJSON() }, 'User profile retrieved successfully');
    }

    const publicProfile = await UserService.getPublicProfile(userId);

    sendResponse(res, 200, { user: publicProfile }, 'User profile retrieved successfully');
  } catch (error) {
    if (error.message === 'User not found') {
      return sendError(res, 404, 'USER_NOT_FOUND', 'User not found');
    }
    logger.error('Failed to get user profile:', error);
    sendError(res, 500, 'FETCH_FAILED', 'Failed to retrieve user profile');
  }
}));

/**
 * GET /api/users/:userId/rating
 * Get user's rating details
 */
router.get('/:userId/rating', [
  optionalAuth,
  param('userId').notEmpty().withMessage('User ID is required'),
  handleValidationErrors,
], asyncHandler(async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await UserService.getUserProfile(userId);

    const ratingData = {
      asPassenger: user.rating.asPassenger,
      asDriver: user.rating.asDriver,
      totalRides: user.stats.totalRidesAsPassenger + user.stats.totalRidesAsDriver,
      memberSince: user.stats.memberSince,
      completionRate: user.stats.completionRate
    };

    sendResponse(res, 200, { rating: ratingData }, 'User rating retrieved successfully');
  } catch (error) {
    if (error.message === 'User not found') {
      return sendError(res, 404, 'USER_NOT_FOUND', 'User not found');
    }
    logger.error('Failed to get user rating:', error);
    sendError(res, 500, 'FETCH_FAILED', 'Failed to retrieve user rating');
  }
}));

/**
 * POST /api/users/:userId/rating
 * Add rating/review for a user (after completing a ride)
 */
router.post('/:userId/rating', [
  authenticateToken,
  param('userId').notEmpty().withMessage('User ID is required'),
  // TODO: Add validation for rating data
  // This will be implemented when we add the review system
  handleValidationErrors,
], asyncHandler(async (req, res) => {
  try {
    // TODO: Implement rating/review functionality
    // This will be part of the rating and review system task
    sendError(res, 501, 'NOT_IMPLEMENTED', 'Rating functionality not yet implemented');
  } catch (error) {
    logger.error('Failed to add rating:', error);
    sendError(res, 500, 'RATING_FAILED', 'Failed to add rating');
  }
}));

/**
 * GET /api/users
 * Search users with filters
 */
router.get('/', [
  optionalAuth,
  query('role').optional().isIn(['passenger', 'provider', 'both']).withMessage('Invalid role filter'),
  query('verified').optional().isBoolean().withMessage('Verified filter must be boolean'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
  handleValidationErrors,
], asyncHandler(async (req, res) => {
  try {
    const { role, verified, limit = 20 } = req.query;

    const criteria = {};
    if (role) criteria.role = role;
    if (verified !== undefined) criteria.verified = verified === 'true';

    const users = await UserService.searchUsers(criteria, parseInt(limit));

    sendResponse(res, 200, {
      users,
      count: users.length,
      criteria
    }, 'Users retrieved successfully');
  } catch (error) {
    logger.error('Failed to search users:', error);
    sendError(res, 500, 'SEARCH_FAILED', 'Failed to search users');
  }
}));

/**
 * PUT /api/users/:userId/verify
 * Update user verification status (admin functionality)
 */
router.put('/:userId/verify', [
  authenticateToken,
  // TODO: Add admin role check when admin system is implemented
  param('userId').notEmpty().withMessage('User ID is required'),
  handleValidationErrors,
], asyncHandler(async (req, res) => {
  try {
    // For now, only allow users to verify themselves
    // In production, this should be restricted to admin users
    if (req.user.uid !== req.params.userId) {
      return sendError(res, 403, 'FORBIDDEN', 'Can only verify your own account');
    }

    const { userId } = req.params;
    const verificationData = req.body;

    const user = await UserService.updateUserVerification(userId, verificationData);

    sendResponse(res, 200, { user: user.toJSON() }, 'User verification updated successfully');
  } catch (error) {
    if (error.message === 'User not found') {
      return sendError(res, 404, 'USER_NOT_FOUND', 'User not found');
    }
    logger.error('Failed to update user verification:', error);
    sendError(res, 500, 'UPDATE_FAILED', 'Failed to update user verification');
  }
}));

/**
 * GET /api/users/:userId/stats
 * Get user statistics
 */
router.get('/:userId/stats', [
  optionalAuth,
  param('userId').notEmpty().withMessage('User ID is required'),
  handleValidationErrors,
], asyncHandler(async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await UserService.getUserProfile(userId);

    // Return public stats only
    const publicStats = {
      totalRidesAsPassenger: user.stats.totalRidesAsPassenger,
      totalRidesAsDriver: user.stats.totalRidesAsDriver,
      memberSince: user.stats.memberSince,
      completionRate: user.stats.completionRate,
      responseTime: user.stats.responseTime
    };

    // Include earnings only for the user themselves
    if (req.user && req.user.uid === userId) {
      publicStats.totalEarnings = user.stats.totalEarnings;
      publicStats.lastActiveAt = user.stats.lastActiveAt;
    }

    sendResponse(res, 200, { stats: publicStats }, 'User stats retrieved successfully');
  } catch (error) {
    if (error.message === 'User not found') {
      return sendError(res, 404, 'USER_NOT_FOUND', 'User not found');
    }
    logger.error('Failed to get user stats:', error);
    sendError(res, 500, 'FETCH_FAILED', 'Failed to retrieve user stats');
  }
}));

module.exports = router;