const express = require('express');
const Review = require('../models/Review');
const RatingService = require('../services/ratingService');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * @route POST /api/reviews
 * @desc Create a new review
 * @access Private
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { bookingId, rating, comment, isAnonymous } = req.body;
    const reviewerId = req.user.uid;

    // Validate required fields
    if (!bookingId || !rating) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_REQUIRED_FIELDS',
          message: 'Booking ID and rating are required'
        }
      });
    }

    // Check if user can review this booking
    const canReview = await Review.canReviewBooking(bookingId, reviewerId);
    if (!canReview.canReview) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'CANNOT_REVIEW',
          message: canReview.reason
        }
      });
    }

    // Validate rating data
    const ratingValidation = RatingService.validateRating(rating, canReview.reviewerRole);
    if (!ratingValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_RATING',
          message: 'Invalid rating data',
          details: ratingValidation.errors
        }
      });
    }

    // Create review with rating update
    const review = await Review.createWithRatingUpdate({
      bookingId,
      reviewerId,
      rating,
      comment: comment || '',
      isAnonymous: isAnonymous || false
    });

    // Update reviewer's verification level
    await RatingService.updateUserVerificationLevel(reviewerId);
    await RatingService.updateUserVerificationLevel(canReview.revieweeId);

    res.status(201).json({
      success: true,
      data: {
        review: review.getPublicData(),
        message: 'Review submitted successfully'
      }
    });

    logger.info(`Review created: ${review.id} by ${reviewerId}`);
  } catch (error) {
    logger.error('Error creating review:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'REVIEW_CREATION_FAILED',
        message: error.message
      }
    });
  }
});

/**
 * @route GET /api/reviews/user/:userId
 * @desc Get reviews for a user
 * @access Public
 */
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { role, limit, minRating } = req.query;

    const filters = {
      limit: parseInt(limit) || 20,
      reviewerRole: role === 'driver' ? 'passenger' : (role === 'passenger' ? 'driver' : null),
      minRating: minRating ? parseFloat(minRating) : null
    };

    const reviews = await Review.findByRevieweeId(userId, filters);
    
    // Get public data only
    const publicReviews = reviews.map(review => review.getPublicData());

    res.json({
      success: true,
      data: {
        reviews: publicReviews,
        total: publicReviews.length
      }
    });
  } catch (error) {
    logger.error('Error getting user reviews:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'REVIEWS_FETCH_FAILED',
        message: error.message
      }
    });
  }
});

/**
 * @route GET /api/reviews/my-reviews
 * @desc Get reviews written by the authenticated user
 * @access Private
 */
router.get('/my-reviews', authenticateToken, async (req, res) => {
  try {
    const reviewerId = req.user.uid;
    const { limit } = req.query;

    const filters = {
      limit: parseInt(limit) || 20
    };

    const reviews = await Review.findByReviewerId(reviewerId, filters);

    res.json({
      success: true,
      data: {
        reviews: reviews.map(review => review.toJSON()),
        total: reviews.length
      }
    });
  } catch (error) {
    logger.error('Error getting user\'s reviews:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'MY_REVIEWS_FETCH_FAILED',
        message: error.message
      }
    });
  }
});

/**
 * @route GET /api/reviews/ride/:rideId
 * @desc Get reviews for a specific ride
 * @access Public
 */
router.get('/ride/:rideId', async (req, res) => {
  try {
    const { rideId } = req.params;

    const reviews = await Review.findByRideId(rideId);
    
    // Get public data only
    const publicReviews = reviews.map(review => review.getPublicData());

    res.json({
      success: true,
      data: {
        reviews: publicReviews,
        total: publicReviews.length
      }
    });
  } catch (error) {
    logger.error('Error getting ride reviews:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'RIDE_REVIEWS_FETCH_FAILED',
        message: error.message
      }
    });
  }
});

/**
 * @route GET /api/reviews/can-review/:bookingId
 * @desc Check if user can review a booking
 * @access Private
 */
router.get('/can-review/:bookingId', authenticateToken, async (req, res) => {
  try {
    const { bookingId } = req.params;
    const userId = req.user.uid;

    const canReview = await Review.canReviewBooking(bookingId, userId);

    res.json({
      success: true,
      data: canReview
    });
  } catch (error) {
    logger.error('Error checking review eligibility:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'REVIEW_CHECK_FAILED',
        message: error.message
      }
    });
  }
});

/**
 * @route POST /api/reviews/:reviewId/report
 * @desc Report a review for moderation
 * @access Private
 */
router.post('/:reviewId/report', authenticateToken, async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { reason } = req.body;
    const reportedBy = req.user.uid;

    if (!reason) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_REASON',
          message: 'Report reason is required'
        }
      });
    }

    const review = await Review.findById(reviewId);
    if (!review) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'REVIEW_NOT_FOUND',
          message: 'Review not found'
        }
      });
    }

    await review.report(reason, reportedBy);

    res.json({
      success: true,
      data: {
        message: 'Review reported successfully'
      }
    });

    logger.info(`Review reported: ${reviewId} by ${reportedBy}`);
  } catch (error) {
    logger.error('Error reporting review:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'REVIEW_REPORT_FAILED',
        message: error.message
      }
    });
  }
});

/**
 * @route GET /api/reviews/rating-summary/:userId
 * @desc Get rating summary for a user
 * @access Public
 */
router.get('/rating-summary/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.query;

    const summary = await RatingService.getUserRatingSummary(userId, role);

    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    logger.error('Error getting rating summary:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'RATING_SUMMARY_FAILED',
        message: error.message
      }
    });
  }
});

/**
 * @route GET /api/reviews/rating-insights/:userId
 * @desc Get rating insights and recommendations for a user
 * @access Private (user can only see their own insights)
 */
router.get('/rating-insights/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.query;
    const requesterId = req.user.uid;

    // Users can only see their own insights
    if (userId !== requesterId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'You can only view your own rating insights'
        }
      });
    }

    const insights = await RatingService.getRatingInsights(userId, role);

    res.json({
      success: true,
      data: insights
    });
  } catch (error) {
    logger.error('Error getting rating insights:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'RATING_INSIGHTS_FAILED',
        message: error.message
      }
    });
  }
});

/**
 * @route GET /api/reviews/rating-fields/:role
 * @desc Get rating field descriptions for a role
 * @access Public
 */
router.get('/rating-fields/:role', (req, res) => {
  try {
    const { role } = req.params;

    if (!['passenger', 'driver'].includes(role)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_ROLE',
          message: 'Role must be either passenger or driver'
        }
      });
    }

    const descriptions = RatingService.getRatingFieldDescriptions(role);

    res.json({
      success: true,
      data: {
        role,
        fields: descriptions
      }
    });
  } catch (error) {
    logger.error('Error getting rating fields:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'RATING_FIELDS_FAILED',
        message: error.message
      }
    });
  }
});

/**
 * @route PUT /api/reviews/update-verification/:userId
 * @desc Update user verification level (manual trigger)
 * @access Private
 */
router.put('/update-verification/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const requesterId = req.user.uid;

    // Users can only update their own verification level
    if (userId !== requesterId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'You can only update your own verification level'
        }
      });
    }

    const result = await RatingService.updateUserVerificationLevel(userId);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Error updating verification level:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'VERIFICATION_UPDATE_FAILED',
        message: error.message
      }
    });
  }
});

// Admin routes (would require admin authentication in production)

/**
 * @route GET /api/reviews/admin/pending
 * @desc Get pending reviews for moderation
 * @access Admin
 */
router.get('/admin/pending', authenticateToken, async (req, res) => {
  try {
    // In production, add admin role check here
    const { limit } = req.query;

    const filters = {
      limit: parseInt(limit) || 50
    };

    const reviews = await Review.findPendingReviews(filters);

    res.json({
      success: true,
      data: {
        reviews: reviews.map(review => review.toJSON()),
        total: reviews.length
      }
    });
  } catch (error) {
    logger.error('Error getting pending reviews:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'PENDING_REVIEWS_FAILED',
        message: error.message
      }
    });
  }
});

/**
 * @route PUT /api/reviews/admin/:reviewId/moderate
 * @desc Moderate a review (approve/reject)
 * @access Admin
 */
router.put('/admin/:reviewId/moderate', authenticateToken, async (req, res) => {
  try {
    // In production, add admin role check here
    const { reviewId } = req.params;
    const { status, reason } = req.body;
    const moderatorId = req.user.uid;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_STATUS',
          message: 'Status must be either approved or rejected'
        }
      });
    }

    const review = await Review.findById(reviewId);
    if (!review) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'REVIEW_NOT_FOUND',
          message: 'Review not found'
        }
      });
    }

    await review.moderate(status, moderatorId, reason);

    res.json({
      success: true,
      data: {
        review: review.toJSON(),
        message: `Review ${status} successfully`
      }
    });

    logger.info(`Review moderated: ${reviewId} - ${status} by ${moderatorId}`);
  } catch (error) {
    logger.error('Error moderating review:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'REVIEW_MODERATION_FAILED',
        message: error.message
      }
    });
  }
});

module.exports = router;
