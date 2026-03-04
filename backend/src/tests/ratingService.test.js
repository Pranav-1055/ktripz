const RatingService = require('../services/ratingService');

// Mock logger
jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
}));

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
        verification: { email: true, phone: true }, // Remove identity to lower score
        rating: { 
          asPassenger: { average: 0, count: 0 }, 
          asDriver: { average: 4.0, count: 10 } // Lower count and rating
        },
        stats: { 
          completionRate: 85, 
          memberSince: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) // 3 months ago
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

  describe('getVerificationLevelInfo', () => {
    it('should return correct info for each level', () => {
      const newInfo = RatingService.getVerificationLevelInfo('new');
      expect(newInfo.name).toBe('New Member');
      expect(newInfo.color).toBe('#gray');

      const basicInfo = RatingService.getVerificationLevelInfo('basic');
      expect(basicInfo.name).toBe('Verified Member');
      expect(basicInfo.color).toBe('#blue');

      const verifiedInfo = RatingService.getVerificationLevelInfo('verified');
      expect(verifiedInfo.name).toBe('Trusted Member');
      expect(verifiedInfo.color).toBe('#green');

      const experiencedInfo = RatingService.getVerificationLevelInfo('experienced');
      expect(experiencedInfo.name).toBe('Expert Member');
      expect(experiencedInfo.color).toBe('#gold');
    });

    it('should return new level info for invalid level', () => {
      const info = RatingService.getVerificationLevelInfo('invalid');
      expect(info.name).toBe('New Member');
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

    it('should require all fields for passenger', () => {
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

    it('should require all fields for driver', () => {
      const rating = {
        punctuality: 4
        // Missing friendliness and cleanliness
      };

      const result = RatingService.validateRating(rating, 'driver');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('friendliness rating is required');
      expect(result.errors).toContain('cleanliness rating is required');
    });

    it('should validate rating ranges', () => {
      const rating = {
        driving: 0, // Too low
        punctuality: 6, // Too high
        friendliness: 3,
        vehicleCondition: 4
      };

      const result = RatingService.validateRating(rating, 'passenger');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('driving rating must be between 1 and 5');
      expect(result.errors).toContain('punctuality rating must be between 1 and 5');
    });

    it('should require integer ratings', () => {
      const rating = {
        driving: 4.5, // Not integer
        punctuality: 4,
        friendliness: 5,
        vehicleCondition: 4
      };

      const result = RatingService.validateRating(rating, 'passenger');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('driving rating must be a whole number');
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

  describe('getPlatformRatingStats', () => {
    it('should return platform statistics structure', async () => {
      const stats = await RatingService.getPlatformRatingStats();
      
      expect(stats).toHaveProperty('totalReviews');
      expect(stats).toHaveProperty('averageRating');
      expect(stats).toHaveProperty('ratingDistribution');
      expect(stats).toHaveProperty('verificationLevelDistribution');
      expect(stats).toHaveProperty('topRatedUsers');
      expect(stats).toHaveProperty('recentTrends');
      
      expect(stats.ratingDistribution).toHaveProperty('1');
      expect(stats.ratingDistribution).toHaveProperty('2');
      expect(stats.ratingDistribution).toHaveProperty('3');
      expect(stats.ratingDistribution).toHaveProperty('4');
      expect(stats.ratingDistribution).toHaveProperty('5');
      
      expect(stats.verificationLevelDistribution).toHaveProperty('new');
      expect(stats.verificationLevelDistribution).toHaveProperty('basic');
      expect(stats.verificationLevelDistribution).toHaveProperty('verified');
      expect(stats.verificationLevelDistribution).toHaveProperty('experienced');
    });
  });
});