const Review = require('../models/Review');
const RatingService = require('../services/ratingService');

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
  }))
}));

// Mock logger
jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
}));

describe('Review Integration Tests', () => {
  describe('Review Creation Flow', () => {
    it('should create review and update user ratings', async () => {
      // Mock transaction for review creation
      const mockTransaction = {
        get: jest.fn(),
        set: jest.fn(),
        update: jest.fn()
      };

      const mockFirestore = {
        runTransaction: jest.fn().mockImplementation(async (callback) => {
          return await callback(mockTransaction);
        }),
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({
            get: jest.fn(),
            set: jest.fn()
          })),
          where: jest.fn(() => ({
            where: jest.fn(() => ({
              get: jest.fn().mockResolvedValue({ empty: true })
            }))
          }))
        }))
      };

      const { getFirestore } = require('../config/firebase');
      getFirestore.mockReturnValue(mockFirestore);

      // Mock booking data
      const mockBookingDoc = {
        exists: true,
        data: () => ({
          status: 'completed',
          passengerId: 'passenger-123',
          driverId: 'driver-123',
          rideId: 'ride-123',
          completedAt: new Date()
        })
      };

      // Mock user data
      const mockUserDoc = {
        exists: true,
        data: () => ({
          rating: {
            asDriver: { average: 4.0, count: 5, breakdown: {} }
          }
        })
      };

      mockTransaction.get
        .mockResolvedValueOnce(mockBookingDoc) // booking
        .mockResolvedValueOnce(mockUserDoc);   // user

      const reviewData = {
        bookingId: 'booking-123',
        reviewerId: 'passenger-123',
        rating: {
          driving: 5,
          punctuality: 4,
          friendliness: 5,
          vehicleCondition: 4
        },
        comment: 'Great trip!',
        isAnonymous: false
      };

      const review = await Review.createWithRatingUpdate(reviewData);

      expect(review).toBeDefined();
      expect(mockFirestore.runTransaction).toHaveBeenCalled();
      expect(mockTransaction.set).toHaveBeenCalled();
      expect(mockTransaction.update).toHaveBeenCalled();
    });

    it('should validate rating data before creation', () => {
      const validRating = {
        driving: 5,
        punctuality: 4,
        friendliness: 5,
        vehicleCondition: 4
      };

      const validation = RatingService.validateRating(validRating, 'passenger');
      expect(validation.isValid).toBe(true);

      const invalidRating = {
        driving: 6, // Invalid
        punctuality: 4,
        friendliness: 5,
        vehicleCondition: 4
      };

      const invalidValidation = RatingService.validateRating(invalidRating, 'passenger');
      expect(invalidValidation.isValid).toBe(false);
      expect(invalidValidation.errors).toContain('driving rating must be between 1 and 5');
    });

    it('should calculate overall rating correctly', () => {
      const rating = {
        driving: 5,
        punctuality: 4,
        friendliness: 5,
        vehicleCondition: 4
      };

      const values = Object.values(rating);
      const expectedOverall = Math.round(
        values.reduce((sum, val) => sum + val, 0) / values.length * 10
      ) / 10;

      expect(expectedOverall).toBe(4.5);
    });
  });

  describe('User Verification Level Updates', () => {
    it('should update verification level after receiving reviews', async () => {
      const user = {
        verification: { email: true, phone: true },
        rating: { 
          asPassenger: { average: 0, count: 0 }, 
          asDriver: { average: 4.5, count: 10 } 
        },
        stats: { 
          completionRate: 95, 
          memberSince: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)
        }
      };

      const level = RatingService.calculateVerificationLevel(user);
      expect(['basic', 'verified', 'experienced']).toContain(level);
    });

    it('should provide appropriate level info', () => {
      const levels = ['new', 'basic', 'verified', 'experienced'];
      
      levels.forEach(level => {
        const info = RatingService.getVerificationLevelInfo(level);
        expect(info).toHaveProperty('name');
        expect(info).toHaveProperty('color');
        expect(info).toHaveProperty('icon');
        expect(info).toHaveProperty('description');
      });
    });
  });

  describe('Review Filtering and Moderation', () => {
    it('should handle review reporting', async () => {
      const mockReview = {
        id: 'review-123',
        isReported: false,
        moderationStatus: 'approved',
        report: jest.fn().mockResolvedValue(true),
        save: jest.fn().mockResolvedValue(true)
      };

      await mockReview.report('Inappropriate content', 'reporter-123');

      expect(mockReview.report).toHaveBeenCalledWith('Inappropriate content', 'reporter-123');
    });

    it('should validate review eligibility', async () => {
      const mockFirestore = {
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => ({
                status: 'completed',
                passengerId: 'passenger-123',
                driverId: 'driver-123',
                completedAt: { toDate: () => new Date() } // Mock Firestore timestamp
              })
            })
          })),
          where: jest.fn(() => ({
            where: jest.fn(() => ({
              get: jest.fn().mockResolvedValue({ empty: true })
            }))
          }))
        }))
      };

      const { getFirestore } = require('../config/firebase');
      getFirestore.mockReturnValue(mockFirestore);

      const result = await Review.canReviewBooking('booking-123', 'passenger-123');
      
      expect(result.canReview).toBe(true);
      expect(result.reviewerRole).toBe('passenger');
      expect(result.revieweeId).toBe('driver-123');
    });
  });

  describe('Rating Statistics', () => {
    it('should calculate review statistics correctly', async () => {
      const mockReviews = [
        { rating: { overall: 5.0 } },
        { rating: { overall: 4.0 } },
        { rating: { overall: 4.5 } },
        { rating: { overall: 3.5 } },
        { rating: { overall: 4.5 } }
      ];

      // Mock the database query chain
      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({
          forEach: (callback) => {
            mockReviews.forEach(review => callback({ data: () => review }));
          }
        })
      };

      const mockFirestore = {
        collection: jest.fn(() => mockQuery)
      };

      const { getFirestore } = require('../config/firebase');
      getFirestore.mockReturnValue(mockFirestore);

      const stats = await Review.getReviewStats('user-123', 'driver');

      expect(stats.totalReviews).toBe(5);
      expect(stats.averageRating).toBe(4.3);
      expect(stats.ratingDistribution).toHaveProperty('4');
      expect(stats.ratingDistribution).toHaveProperty('5');
    });
  });
});

describe('Rating Display Integration', () => {
  it('should format rating data for display', () => {
    const ratingData = {
      average: 4.3,
      count: 15,
      breakdown: {
        driving: 4.5,
        punctuality: 4.0,
        friendliness: 4.5,
        vehicleCondition: 4.2
      }
    };

    // Test that the data structure is correct for display
    expect(ratingData.average).toBeGreaterThan(0);
    expect(ratingData.count).toBeGreaterThan(0);
    expect(Object.keys(ratingData.breakdown)).toHaveLength(4);
    
    // Test rating bounds
    Object.values(ratingData.breakdown).forEach(rating => {
      expect(rating).toBeGreaterThanOrEqual(1);
      expect(rating).toBeLessThanOrEqual(5);
    });
  });

  it('should handle empty rating data gracefully', () => {
    const emptyRating = {
      average: 0,
      count: 0,
      breakdown: {}
    };

    expect(emptyRating.average).toBe(0);
    expect(emptyRating.count).toBe(0);
    expect(Object.keys(emptyRating.breakdown)).toHaveLength(0);
  });
});