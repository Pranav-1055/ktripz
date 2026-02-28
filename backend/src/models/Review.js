const { getFirestore } = require('../config/firebase');
const logger = require('../utils/logger');

class Review {
  constructor(data) {
    this.id = data.id;
    this.rideId = data.rideId;
    this.bookingId = data.bookingId;
    this.reviewerId = data.reviewerId;
    this.revieweeId = data.revieweeId;
    this.reviewerRole = data.reviewerRole; // 'passenger' or 'driver'
    this.rating = data.rating || {};
    this.comment = data.comment || '';
    this.isAnonymous = data.isAnonymous || false;
    this.isReported = data.isReported || false;
    this.reportReason = data.reportReason || null;
    this.moderationStatus = data.moderationStatus || 'approved'; // 'pending', 'approved', 'rejected'
    this.moderatedBy = data.moderatedBy || null;
    this.moderatedAt = data.moderatedAt || null;
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
  }

  /**
   * Create or update review in Firestore
   */
  async save() {
    try {
      const db = getFirestore();
      let reviewRef;
      
      if (this.id) {
        reviewRef = db.collection('reviews').doc(this.id);
      } else {
        reviewRef = db.collection('reviews').doc();
        this.id = reviewRef.id;
      }
      
      const reviewData = {
        id: this.id,
        rideId: this.rideId,
        bookingId: this.bookingId,
        reviewerId: this.reviewerId,
        revieweeId: this.revieweeId,
        reviewerRole: this.reviewerRole,
        rating: this.rating,
        comment: this.comment,
        isAnonymous: this.isAnonymous,
        isReported: this.isReported,
        reportReason: this.reportReason,
        moderationStatus: this.moderationStatus,
        moderatedBy: this.moderatedBy,
        moderatedAt: this.moderatedAt,
        updatedAt: new Date(),
      };

      // Only set createdAt if it's a new review
      const existingReview = await reviewRef.get();
      if (!existingReview.exists) {
        reviewData.createdAt = this.createdAt;
      }

      await reviewRef.set(reviewData, { merge: true });
      logger.info(`Review saved: ${this.id}`);
      return this;
    } catch (error) {
      logger.error('Error saving review:', error);
      throw error;
    }
  }

  /**
   * Create review with validation and user rating update
   */
  static async createWithRatingUpdate(reviewData) {
    const db = getFirestore();
    
    try {
      const result = await db.runTransaction(async (transaction) => {
        // Validate that the booking exists and is completed
        const bookingRef = db.collection('bookings').doc(reviewData.bookingId);
        const bookingDoc = await transaction.get(bookingRef);
        
        if (!bookingDoc.exists) {
          throw new Error('Booking not found');
        }
        
        const booking = bookingDoc.data();
        
        if (booking.status !== 'completed') {
          throw new Error('Can only review completed trips');
        }
        
        // Check if reviewer is part of this booking
        const isPassenger = booking.passengerId === reviewData.reviewerId;
        const isDriver = booking.driverId === reviewData.reviewerId;
        
        if (!isPassenger && !isDriver) {
          throw new Error('Only passengers and drivers can review this trip');
        }
        
        // Set reviewee and reviewer role
        reviewData.revieweeId = isPassenger ? booking.driverId : booking.passengerId;
        reviewData.reviewerRole = isPassenger ? 'passenger' : 'driver';
        reviewData.rideId = booking.rideId;
        
        // Check if review already exists
        const existingReviewQuery = await db.collection('reviews')
          .where('bookingId', '==', reviewData.bookingId)
          .where('reviewerId', '==', reviewData.reviewerId)
          .get();
        
        if (!existingReviewQuery.empty) {
          throw new Error('Review already exists for this booking');
        }
        
        // Validate rating structure based on reviewer role
        const requiredRatingFields = reviewData.reviewerRole === 'passenger' 
          ? ['driving', 'punctuality', 'friendliness', 'vehicleCondition']
          : ['punctuality', 'friendliness', 'cleanliness'];
        
        for (const field of requiredRatingFields) {
          if (!reviewData.rating[field] || reviewData.rating[field] < 1 || reviewData.rating[field] > 5) {
            throw new Error(`Invalid rating for ${field}. Must be between 1 and 5`);
          }
        }
        
        // Calculate overall rating
        const ratingValues = Object.values(reviewData.rating);
        reviewData.rating.overall = Math.round(
          ratingValues.reduce((sum, val) => sum + val, 0) / ratingValues.length * 10
        ) / 10;
        
        // Create review
        const reviewRef = db.collection('reviews').doc();
        const review = new Review({
          ...reviewData,
          id: reviewRef.id
        });
        
        transaction.set(reviewRef, review.toJSON());
        
        // Update reviewee's rating
        const revieweeRef = db.collection('users').doc(reviewData.revieweeId);
        const revieweeDoc = await transaction.get(revieweeRef);
        
        if (revieweeDoc.exists) {
          const reviewee = revieweeDoc.data();
          const roleKey = reviewData.reviewerRole === 'passenger' ? 'asDriver' : 'asPassenger';
          
          // Calculate new rating
          const currentRating = reviewee.rating?.[roleKey] || { average: 0, count: 0, breakdown: {} };
          const newCount = currentRating.count + 1;
          
          // Update overall average
          const newAverage = Math.round(
            ((currentRating.average * currentRating.count) + reviewData.rating.overall) / newCount * 10
          ) / 10;
          
          // Update breakdown averages
          const newBreakdown = { ...currentRating.breakdown };
          for (const [field, value] of Object.entries(reviewData.rating)) {
            if (field !== 'overall') {
              const currentFieldAvg = newBreakdown[field] || 0;
              newBreakdown[field] = Math.round(
                ((currentFieldAvg * currentRating.count) + value) / newCount * 10
              ) / 10;
            }
          }
          
          // Update user rating
          const updatedRating = {
            ...reviewee.rating,
            [roleKey]: {
              average: newAverage,
              count: newCount,
              breakdown: newBreakdown
            }
          };
          
          transaction.update(revieweeRef, {
            rating: updatedRating,
            updatedAt: new Date()
          });
        }
        
        return review;
      });
      
      logger.info(`Review created with rating update: ${result.id}`);
      return result;
    } catch (error) {
      logger.error('Error creating review with rating update:', error);
      throw error;
    }
  }

  /**
   * Get review by ID
   */
  static async findById(reviewId) {
    try {
      const db = getFirestore();
      const reviewDoc = await db.collection('reviews').doc(reviewId).get();
      
      if (!reviewDoc.exists) {
        return null;
      }

      return new Review(reviewDoc.data());
    } catch (error) {
      logger.error('Error finding review by ID:', error);
      throw error;
    }
  }

  /**
   * Get reviews for a user (as reviewee)
   */
  static async findByRevieweeId(revieweeId, filters = {}) {
    try {
      const db = getFirestore();
      let query = db.collection('reviews')
        .where('revieweeId', '==', revieweeId)
        .where('moderationStatus', '==', 'approved');

      // Filter by reviewer role if provided
      if (filters.reviewerRole) {
        query = query.where('reviewerRole', '==', filters.reviewerRole);
      }

      // Filter by minimum rating if provided
      if (filters.minRating) {
        query = query.where('rating.overall', '>=', filters.minRating);
      }

      // Order by creation date (most recent first)
      query = query.orderBy('createdAt', 'desc');

      // Limit results
      const limit = parseInt(filters.limit) || 20;
      query = query.limit(limit);

      const querySnapshot = await query.get();
      const reviews = [];

      querySnapshot.forEach(doc => {
        reviews.push(new Review(doc.data()));
      });

      return reviews;
    } catch (error) {
      logger.error('Error finding reviews by reviewee ID:', error);
      throw error;
    }
  }

  /**
   * Get reviews by reviewer ID
   */
  static async findByReviewerId(reviewerId, filters = {}) {
    try {
      const db = getFirestore();
      let query = db.collection('reviews').where('reviewerId', '==', reviewerId);

      // Order by creation date (most recent first)
      query = query.orderBy('createdAt', 'desc');

      // Limit results
      const limit = parseInt(filters.limit) || 20;
      query = query.limit(limit);

      const querySnapshot = await query.get();
      const reviews = [];

      querySnapshot.forEach(doc => {
        reviews.push(new Review(doc.data()));
      });

      return reviews;
    } catch (error) {
      logger.error('Error finding reviews by reviewer ID:', error);
      throw error;
    }
  }

  /**
   * Get reviews for a specific ride
   */
  static async findByRideId(rideId, filters = {}) {
    try {
      const db = getFirestore();
      let query = db.collection('reviews')
        .where('rideId', '==', rideId)
        .where('moderationStatus', '==', 'approved');

      // Order by creation date
      query = query.orderBy('createdAt', 'desc');

      const querySnapshot = await query.get();
      const reviews = [];

      querySnapshot.forEach(doc => {
        reviews.push(new Review(doc.data()));
      });

      return reviews;
    } catch (error) {
      logger.error('Error finding reviews by ride ID:', error);
      throw error;
    }
  }

  /**
   * Get pending reviews for moderation
   */
  static async findPendingReviews(filters = {}) {
    try {
      const db = getFirestore();
      let query = db.collection('reviews').where('moderationStatus', '==', 'pending');

      // Order by creation date (oldest first for moderation queue)
      query = query.orderBy('createdAt', 'asc');

      // Limit results
      const limit = parseInt(filters.limit) || 50;
      query = query.limit(limit);

      const querySnapshot = await query.get();
      const reviews = [];

      querySnapshot.forEach(doc => {
        reviews.push(new Review(doc.data()));
      });

      return reviews;
    } catch (error) {
      logger.error('Error finding pending reviews:', error);
      throw error;
    }
  }

  /**
   * Report review for moderation
   */
  async report(reportReason, reportedBy) {
    try {
      this.isReported = true;
      this.reportReason = reportReason;
      this.moderationStatus = 'pending';
      this.updatedAt = new Date();
      
      await this.save();
      
      logger.info(`Review reported: ${this.id} by ${reportedBy}`);
      return this;
    } catch (error) {
      logger.error('Error reporting review:', error);
      throw error;
    }
  }

  /**
   * Moderate review (approve/reject)
   */
  async moderate(status, moderatorId, reason = null) {
    try {
      if (!['approved', 'rejected'].includes(status)) {
        throw new Error('Invalid moderation status');
      }
      
      this.moderationStatus = status;
      this.moderatedBy = moderatorId;
      this.moderatedAt = new Date();
      this.updatedAt = new Date();
      
      if (reason) {
        this.reportReason = reason;
      }
      
      await this.save();
      
      logger.info(`Review moderated: ${this.id} - ${status} by ${moderatorId}`);
      return this;
    } catch (error) {
      logger.error('Error moderating review:', error);
      throw error;
    }
  }

  /**
   * Get review statistics for a user
   */
  static async getReviewStats(userId, role = null) {
    try {
      const db = getFirestore();
      let query = db.collection('reviews')
        .where('revieweeId', '==', userId)
        .where('moderationStatus', '==', 'approved');

      if (role) {
        // Filter by the role being reviewed (opposite of reviewer role)
        const reviewerRole = role === 'driver' ? 'passenger' : 'driver';
        query = query.where('reviewerRole', '==', reviewerRole);
      }

      const querySnapshot = await query.get();
      const reviews = [];

      querySnapshot.forEach(doc => {
        reviews.push(doc.data());
      });

      if (reviews.length === 0) {
        return {
          totalReviews: 0,
          averageRating: 0,
          ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
          breakdown: {}
        };
      }

      // Calculate statistics
      const totalReviews = reviews.length;
      const totalRating = reviews.reduce((sum, review) => sum + review.rating.overall, 0);
      const averageRating = Math.round(totalRating / totalReviews * 10) / 10;

      // Rating distribution
      const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      reviews.forEach(review => {
        const roundedRating = Math.round(review.rating.overall);
        ratingDistribution[roundedRating]++;
      });

      // Breakdown averages
      const breakdown = {};
      const firstReview = reviews[0];
      if (firstReview.rating) {
        Object.keys(firstReview.rating).forEach(field => {
          if (field !== 'overall') {
            const fieldTotal = reviews.reduce((sum, review) => 
              sum + (review.rating[field] || 0), 0);
            breakdown[field] = Math.round(fieldTotal / totalReviews * 10) / 10;
          }
        });
      }

      return {
        totalReviews,
        averageRating,
        ratingDistribution,
        breakdown
      };
    } catch (error) {
      logger.error('Error getting review stats:', error);
      throw error;
    }
  }

  /**
   * Check if user can review a booking
   */
  static async canReviewBooking(bookingId, userId) {
    try {
      const db = getFirestore();
      
      // Check if booking exists and is completed
      const bookingDoc = await db.collection('bookings').doc(bookingId).get();
      if (!bookingDoc.exists) {
        return { canReview: false, reason: 'Booking not found' };
      }
      
      const booking = bookingDoc.data();
      if (booking.status !== 'completed') {
        return { canReview: false, reason: 'Trip not completed yet' };
      }
      
      // Check if user is part of this booking
      const isPassenger = booking.passengerId === userId;
      const isDriver = booking.driverId === userId;
      
      if (!isPassenger && !isDriver) {
        return { canReview: false, reason: 'Not authorized to review this trip' };
      }
      
      // Check if review already exists
      const existingReviewQuery = await db.collection('reviews')
        .where('bookingId', '==', bookingId)
        .where('reviewerId', '==', userId)
        .get();
      
      if (!existingReviewQuery.empty) {
        return { canReview: false, reason: 'Review already submitted' };
      }
      
      // Check if trip was completed recently (within 30 days)
      const completedAt = booking.completedAt?.toDate() || new Date(booking.completedAt);
      const daysSinceCompletion = (new Date() - completedAt) / (1000 * 60 * 60 * 24);
      
      if (daysSinceCompletion > 30) {
        return { canReview: false, reason: 'Review period has expired (30 days)' };
      }
      
      return { 
        canReview: true, 
        reviewerRole: isPassenger ? 'passenger' : 'driver',
        revieweeId: isPassenger ? booking.driverId : booking.passengerId
      };
    } catch (error) {
      logger.error('Error checking if user can review booking:', error);
      throw error;
    }
  }

  /**
   * Get public review data (safe for sharing)
   */
  getPublicData() {
    return {
      id: this.id,
      reviewerRole: this.reviewerRole,
      rating: this.rating,
      comment: this.comment,
      isAnonymous: this.isAnonymous,
      createdAt: this.createdAt,
      // Don't include reviewer/reviewee IDs for privacy
      rideId: this.rideId
    };
  }

  /**
   * Convert to JSON
   */
  toJSON() {
    return {
      id: this.id,
      rideId: this.rideId,
      bookingId: this.bookingId,
      reviewerId: this.reviewerId,
      revieweeId: this.revieweeId,
      reviewerRole: this.reviewerRole,
      rating: this.rating,
      comment: this.comment,
      isAnonymous: this.isAnonymous,
      isReported: this.isReported,
      reportReason: this.reportReason,
      moderationStatus: this.moderationStatus,
      moderatedBy: this.moderatedBy,
      moderatedAt: this.moderatedAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

module.exports = Review;