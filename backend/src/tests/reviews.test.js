const request = require('supertest');
const { app } = require('../server');
const Review = require('../models/Review');
const RatingService = require('../services/ratingService');
const User = require('../models/User');
const Booking = require('../models/Booking');

// Mock Firebase
jest.mock('../config/firebase', () => ({
  getFirestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn(),
        set: jest.fn(),
        update: jest.fn()
      })),
      where: jest.fn(() => ({
        where: jest.fn(() => ({
          orderBy: jest.fn(() => ({
            limit: jest.fn(() => ({
              get: jest.fn()
            }))
          }))
        }))
      }))
    })),
    runTransaction: jest.fn()
  })),
  getAuth: jest.fn(() => ({
    verifyIdToken: jest.fn()
  }))
}));

// Mock authentication middleware
jest.mock('../middleware/auth', () => ({
  authenticateUser: (req, res, next) => {
    req.user = { uid: 'test-user-id' };
    next();
  }
}));

describe('Reviews API', () => {
  let mockBooking;
  let mockUser;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockBooking = {
      id: 'booking-123',
      rideId: 'ride-123',
      passengerId: 'passenger-123',
      driverId: 'driver-123',
      status: 'completed',
      completedAt: new Date()
    };

    mockUser = {
      uid: 'test-user-id',
      rating: {
        asDriver: { average: 4.5, count: 10, breakdown: {} },
        asPassenger: { average: 4.2, count: 5, breakdown: {} }
      },
      verification: { email: true, phone: true },
      stats: { completionRate: 95, memberSince: new Date('2023-01-01') }
    };
  });

  describe('POST /api/reviews', () => {
    it('should create a review successfully', async () => {
      // Mock Review.canReviewBooking
      jest.spyOn(Review, 'canReviewBooking').mockResolvedValue({
        canReview: true,
        reviewerRole: 'passenger',
        revieweeId: 'driver-123'
      });

      // Mock Review.createWithRatingUpdate
      const mockReview = {
        id: 'review-123',
        getPublicData: () => ({
          id: 'review-123',
          rating: { overall: 4.5, driving: 5, punctuality: 4, friendliness: 5, vehicleCondition: 4 },
          comment: 'Great trip!',
          reviewerRole: 'passenger'
        })
      };
      jest.spyOn(Review, 'createWithRatingUpdate').mockResolvedValue(mockReview);

      // Mock RatingService.updateUserVerificationLevel
      jest.spyOn(RatingService, 'updateUserVerificationLevel').mockResolvedValue({
        userId: 'test-user-id',
        level: 'verified'
      });

      const reviewData = {
        bookingId: 'booking-123',
        rating: {
          driving: 5,
          punctuality: 4,
          friendliness: 5,
          vehicleCondition: 4
        },
        comment: 'Great trip!',
        isAnonymous: false
      };

      const response = await request(app)
        .post('/api/reviews')
        .send(reviewData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.review.id).toBe('review-123');
      expect(Review.canReviewBooking).toHaveBeenCalledWith('booking-123', 'test-user-id');
      expect(Review.createWithRatingUpdate).toHaveBeenCalled();
    });

    it('should reject review if user cannot review booking', async () => {
      jest.spyOn(Review, 'canReviewBooking').mockResolvedValue({
        canReview: false,
        reason: 'Trip not completed yet'
      });

      const reviewData = {
        bookingId: 'booking-123',
        rating: { driving: 5, punctuality: 4, friendliness: 5, vehicleCondition: 4 }
      };

      const response = await request(app)
        .post('/api/reviews')
        .send(reviewData)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('CANNOT_REVIEW');
    });

    it('should validate rating data', async () => {
      jest.spyOn(Review, 'canReviewBooking').mockResolvedValue({
        canReview: true,
        reviewerRole: 'passenger',
        revieweeId: 'driver-123'
      });

      const reviewData = {
        bookingId: 'booking-123',
        rating: {
          driving: 6, // Invalid rating > 5
          punctuality: 4,
          friendliness: 5,
          vehicleCondition: 4
        }
      };

      const response = await request(app)
        .post('/api/reviews')
        .send(reviewData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_RATING');
    });

    it('should require all rating fields', async () => {
      const reviewData = {
        bookingId: 'booking-123'
        // Missing rating
      };

      const response = await request(app)
        .post('/api/reviews')
        .send(reviewData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('MISSING_REQUIRED_FIELDS');
    });
  });

  describe('GET /api/reviews/user/:userId', () => {
    it('should get user reviews successfully', async () => {
      const mockReviews = [
        {
          getPublicData: () => ({
            id: 'review-1',
            rating: { overall: 4.5 },
            comment: 'Good trip',
            reviewerRole: 'passenger'
          })
        },
        {
          getPublicData: () => ({
            id: 'review-2',
            rating: { overall: 5.0 },
            comment: 'Excellent!',
            reviewerRole: 'passenger'
          })
        }
      ];

      jest.spyOn(Review, 'findByRevieweeId').mockResolvedValue(mockReviews);

      const response = await request(app)
        .get('/api/reviews/user/driver-123')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.reviews).toHaveLength(2);
      expect(response.body.data.reviews[0].id).toBe('review-1');
    });

    it('should handle empty reviews', async () => {
      jest.spyOn(Review, 'findByRevieweeId').mockResolvedValue([]);

      const response = await request(app)
        .get('/api/reviews/user/driver-123')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.reviews).toHaveLength(0);
    });
  });

  describe('GET /api/reviews/can-review/:bookingId', () => {
    it('should check if user can review booking', async () => {
      jest.spyOn(Review, 'canReviewBooking').mockResolvedValue({
        canReview: true,
        reviewerRole: 'passenger',
        revieweeId: 'driver-123'
      });

      const response = await request(app)
        .get('/api/reviews/can-review/booking-123')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.canReview).toBe(true);
      expect(response.body.data.reviewerRole).toBe('passenger');
    });

    it('should return false if user cannot review', async () => {
      jest.spyOn(Review, 'canReviewBooking').mockResolvedValue({
        canReview: false,
        reason: 'Review already submitted'
      });

      const response = await request(app)
        .get('/api/reviews/can-review/booking-123')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.canReview).toBe(false);
      expect(response.body.data.reason).toBe('Review already submitted');
    });
  });

  describe('POST /api/reviews/:reviewId/report', () => {
    it('should report a review successfully', async () => {
      const mockReview = {
        report: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(Review, 'findById').mockResolvedValue(mockReview);

      const response = await request(app)
        .post('/api/reviews/review-123/report')
        .send({ reason: 'Inappropriate content' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockReview.report).toHaveBeenCalledWith('Inappropriate content', 'test-user-id');
    });

    it('should require report reason', async () => {
      const response = await request(app)
        .post('/api/reviews/review-123/report')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('MISSING_REASON');
    });

    it('should handle review not found', async () => {
      jest.spyOn(Review, 'findById').mockResolvedValue(null);

      const response = await request(app)
        .post('/api/reviews/review-123/report')
        .send({ reason: 'Inappropriate content' })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('REVIEW_NOT_FOUND');
    });
  });

  describe('GET /api/reviews/rating-summary/:userId', () => {
    it('should get rating summary successfully', async () => {
      const mockSummary = {
        userId: 'driver-123',
        verificationLevel: 'verified',
        ratings: {
          asDriver: { average: 4.5, count: 10 },
          asPassenger: { average: 4.2, count: 5 }
        }
      };

      jest.spyOn(RatingService, 'getUserRatingSummary').mockResolvedValue(mockSummary);

      const response = await request(app)
        .get('/api/reviews/rating-summary/driver-123')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.userId).toBe('driver-123');
      expect(response.body.data.verificationLevel).toBe('verified');
    });

    it('should handle role filter', async () => {
      const mockSummary = {
        userId: 'driver-123',
        verificationLevel: 'verified',
        ratings: { asDriver: { average: 4.5, count: 10 } }
      };

      jest.spyOn(RatingService, 'getUserRatingSummary').mockResolvedValue(mockSummary);

      const response = await request(app)
        .get('/api/reviews/rating-summary/driver-123?role=driver')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(RatingService.getUserRatingSummary).toHaveBeenCalledWith('driver-123', 'driver');
    });
  });

  describe('GET /api/reviews/rating-fields/:role', () => {
    it('should get rating fields for passenger role', async () => {
      const response = await request(app)
        .get('/api/reviews/rating-fields/passenger')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.role).toBe('passenger');
      expect(response.body.data.fields).toHaveProperty('driving');
      expect(response.body.data.fields).toHaveProperty('punctuality');
      expect(response.body.data.fields).toHaveProperty('friendliness');
      expect(response.body.data.fields).toHaveProperty('vehicleCondition');
    });

    it('should get rating fields for driver role', async () => {
      const response = await request(app)
        .get('/api/reviews/rating-fields/driver')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.role).toBe('driver');
      expect(response.body.data.fields).toHaveProperty('punctuality');
      expect(response.body.data.fields).toHaveProperty('friendliness');
      expect(response.body.data.fields).toHaveProperty('cleanliness');
    });

    it('should reject invalid role', async () => {
      const response = await request(app)
        .get('/api/reviews/rating-fields/invalid')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_ROLE');
    });
  });
});

describe('RatingService', () => {
  describe('calculateVerificationLevel', () => {
    it('should calculate new user level', () => {
      const user = {
        verification: { email: false, phone: false },
        rating: { asPassenger: { average: 0, count: 0 }, asDriver: { average: 0, count: 0 } },
        stats: { completionRate: 100, memberSince: new Date() }
      };

      const level = RatingService.calculateVerificationLevel(user);
      expect(level).toBe('new');
    });

    it('should calculate basic user level', () => {
      const user = {
        verification: { email: true, phone: true },
        rating: { asPassenger: { average: 0, count: 0 }, asDriver: { average: 0, count: 0 } },
        stats: { completionRate: 100, memberSince: new Date() }
      };

      const level = RatingService.calculateVerificationLevel(user);
      expect(level).toBe('basic');
    });

    it('should calculate verified user level', () => {
      const user = {
        verification: { email: true, phone: true, identity: true },
        rating: { 
          asPassenger: { average: 0, count: 0 }, 
          asDriver: { average: 4.2, count: 15 } 
        },
        stats: { 
          completionRate: 95, 
          memberSince: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) // 1 year ago
        }
      };

      const level = RatingService.calculateVerificationLevel(user);
      expect(level).toBe('verified');
    });

    it('should calculate experienced user level', () => {
      const user = {
        verification: { 
          email: true, 
          phone: true, 
          identity: true, 
          drivingLicense: true,
          backgroundCheck: true 
        },
        rating: { 
          asPassenger: { average: 4.8, count: 20 }, 
          asDriver: { average: 4.7, count: 50 } 
        },
        stats: { 
          completionRate: 98, 
          memberSince: new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000) // 2 years ago
        }
      };

      const level = RatingService.calculateVerificationLevel(user);
      expect(level).toBe('experienced');
    });
  });

  describe('validateRating', () => {
    it('should validate passenger rating', () => {
      const rating = {
        driving: 5,
        punctuality: 4,
        friendliness: 5,
        vehicleCondition: 4
      };

      const result = RatingService.validateRating(rating, 'passenger');
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate driver rating', () => {
      const rating = {
        punctuality: 4,
        friendliness: 5,
        cleanliness: 4
      };

      const result = RatingService.validateRating(rating, 'driver');
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid ratings', () => {
      const rating = {
        driving: 6, // Invalid: > 5
        punctuality: 0, // Invalid: < 1
        friendliness: 3.5, // Invalid: not integer
        // vehicleCondition missing
      };

      const result = RatingService.validateRating(rating, 'passenger');
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should require all fields', () => {
      const rating = {
        driving: 5,
        punctuality: 4
        // Missing friendliness and vehicleCondition
      };

      const result = RatingService.validateRating(rating, 'passenger');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('friendliness rating is required');
      expect(result.errors).toContain('vehicleCondition rating is required');
    });
  });

  describe('getRatingFieldDescriptions', () => {
    it('should return passenger rating fields', () => {
      const fields = RatingService.getRatingFieldDescriptions('passenger');
      
      expect(fields).toHaveProperty('driving');
      expect(fields).toHaveProperty('punctuality');
      expect(fields).toHaveProperty('friendliness');
      expect(fields).toHaveProperty('vehicleCondition');
      expect(fields.driving).toContain('driving skill');
    });

    it('should return driver rating fields', () => {
      const fields = RatingService.getRatingFieldDescriptions('driver');
      
      expect(fields).toHaveProperty('punctuality');
      expect(fields).toHaveProperty('friendliness');
      expect(fields).toHaveProperty('cleanliness');
      expect(fields.punctuality).toContain('on time');
    });
  });
});

describe('Review Model', () => {
  describe('canReviewBooking', () => {
    it('should allow review for completed booking', async () => {
      const mockBookingDoc = {
        exists: true,
        data: () => ({
          status: 'completed',
          passengerId: 'passenger-123',
          driverId: 'driver-123',
          completedAt: new Date()
        })
      };

      const mockFirestore = {
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockBookingDoc)
          })),
          where: jest.fn(() => ({
            where: jest.fn(() => ({
              get: jest.fn().mockResolvedValue({ empty: true })
            }))
          }))
        }))
      };

      // Mock the Firebase config
      const { getFirestore } = require('../config/firebase');
      getFirestore.mockReturnValue(mockFirestore);

      const result = await Review.canReviewBooking('booking-123', 'passenger-123');
      
      expect(result.canReview).toBe(true);
      expect(result.reviewerRole).toBe('passenger');
      expect(result.revieweeId).toBe('driver-123');
    });

    it('should reject review for non-completed booking', async () => {
      const mockBookingDoc = {
        exists: true,
        data: () => ({
          status: 'confirmed',
          passengerId: 'passenger-123',
          driverId: 'driver-123'
        })
      };

      const mockFirestore = {
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockBookingDoc)
          }))
        }))
      };

      const { getFirestore } = require('../config/firebase');
      getFirestore.mockReturnValue(mockFirestore);

      const result = await Review.canReviewBooking('booking-123', 'passenger-123');
      
      expect(result.canReview).toBe(false);
      expect(result.reason).toBe('Trip not completed yet');
    });

    it('should reject review from unauthorized user', async () => {
      const mockBookingDoc = {
        exists: true,
        data: () => ({
          status: 'completed',
          passengerId: 'passenger-123',
          driverId: 'driver-123',
          completedAt: new Date()
        })
      };

      const mockFirestore = {
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(mockBookingDoc)
          }))
        }))
      };

      const { getFirestore } = require('../config/firebase');
      getFirestore.mockReturnValue(mockFirestore);

      const result = await Review.canReviewBooking('booking-123', 'unauthorized-user');
      
      expect(result.canReview).toBe(false);
      expect(result.reason).toBe('Not authorized to review this trip');
    });
  });
});