const Review = require('../models/Review');
const User = require('../models/User');
const logger = require('../utils/logger');

class RatingService {
  /**
   * Calculate user verification level based on ratings and other factors
   */
  static calculateVerificationLevel(user) {
    let score = 0;
    const weights = {
      emailVerified: 10,
      phoneVerified: 10,
      identityVerified: 20,
      drivingLicenseVerified: 15, // for drivers
      backgroundCheckVerified: 25, // for drivers
      ratingCount: 2, // per review (max 50 points)
      averageRating: 10, // multiplied by rating (max 50 points)
      completionRate: 20, // multiplied by rate (max 20 points)
      membershipDuration: 1 // per month (max 24 points)
    };

    // Basic verification points
    if (user.verification?.email) score += weights.emailVerified;
    if (user.verification?.phone) score += weights.phoneVerified;
    if (user.verification?.identity) score += weights.identityVerified;
    if (user.verification?.drivingLicense) score += weights.drivingLicenseVerified;
    if (user.verification?.backgroundCheck) score += weights.backgroundCheckVerified;

    // Rating-based points
    const asPassenger = user.rating?.asPassenger || { average: 0, count: 0 };
    const asDriver = user.rating?.asDriver || { average: 0, count: 0 };
    
    // Use the role with more reviews for verification
    const primaryRating = asDriver.count >= asPassenger.count ? asDriver : asPassenger;
    
    if (primaryRating.count > 0) {
      score += Math.min(primaryRating.count * weights.ratingCount, 50);
      score += Math.min(primaryRating.average * weights.averageRating, 50);
    }

    // Completion rate points
    if (user.stats?.completionRate) {
      score += (user.stats.completionRate / 100) * weights.completionRate;
    }

    // Membership duration points
    if (user.stats?.memberSince) {
      const memberSince = new Date(user.stats.memberSince);
      const monthsSinceMember = Math.floor((new Date() - memberSince) / (1000 * 60 * 60 * 24 * 30));
      score += Math.min(monthsSinceMember * weights.membershipDuration, 24);
    }

    // Determine verification level
    if (score >= 120) return 'experienced'; // Highly trusted user
    if (score >= 80) return 'verified';     // Well-established user
    if (score >= 40) return 'basic';       // New but verified user
    return 'new';                          // New user with minimal verification
  }

  /**
   * Get verification level details and requirements
   */
  static getVerificationLevelInfo(level) {
    const levels = {
      new: {
        name: 'New Member',
        color: '#gray',
        icon: '👤',
        description: 'New to the platform',
        benefits: ['Basic platform access'],
        requirements: 'Complete email verification'
      },
      basic: {
        name: 'Verified Member',
        color: '#blue',
        icon: '✓',
        description: 'Email and phone verified',
        benefits: ['Instant booking for some rides', 'Priority customer support'],
        requirements: 'Email and phone verification'
      },
      verified: {
        name: 'Trusted Member',
        color: '#green',
        icon: '⭐',
        description: 'Established member with good ratings',
        benefits: ['Instant booking for most rides', 'Lower service fees', 'Priority in search results'],
        requirements: '10+ completed trips with 4.0+ rating'
      },
      experienced: {
        name: 'Expert Member',
        color: '#gold',
        icon: '👑',
        description: 'Highly experienced and trusted member',
        benefits: ['Instant booking for all rides', 'Lowest service fees', 'Top priority in search', 'Beta features access'],
        requirements: '50+ completed trips with 4.5+ rating and identity verification'
      }
    };

    return levels[level] || levels.new;
  }

  /**
   * Update user verification level
   */
  static async updateUserVerificationLevel(userId) {
    try {
      const user = await User.findByUid(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const newLevel = this.calculateVerificationLevel(user);
      const currentLevel = user.verification?.level || 'new';

      if (newLevel !== currentLevel) {
        user.verification = {
          ...user.verification,
          level: newLevel,
          levelUpdatedAt: new Date()
        };

        await user.save();
        logger.info(`User verification level updated: ${userId} -> ${newLevel}`);
        
        return {
          userId,
          oldLevel: currentLevel,
          newLevel,
          levelInfo: this.getVerificationLevelInfo(newLevel)
        };
      }

      return {
        userId,
        level: currentLevel,
        levelInfo: this.getVerificationLevelInfo(currentLevel)
      };
    } catch (error) {
      logger.error('Error updating user verification level:', error);
      throw error;
    }
  }

  /**
   * Get rating summary for a user
   */
  static async getUserRatingSummary(userId, role = null) {
    try {
      const user = await User.findByUid(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Get review statistics
      const reviewStats = await Review.getReviewStats(userId, role);
      
      // Get verification level
      const verificationLevel = this.calculateVerificationLevel(user);
      const levelInfo = this.getVerificationLevelInfo(verificationLevel);

      // Combine user rating data with review stats
      const asPassenger = user.rating?.asPassenger || { average: 0, count: 0, breakdown: {} };
      const asDriver = user.rating?.asDriver || { average: 0, count: 0, breakdown: {} };

      return {
        userId,
        verificationLevel,
        levelInfo,
        ratings: {
          asPassenger: {
            ...asPassenger,
            stats: role === 'passenger' ? reviewStats : null
          },
          asDriver: {
            ...asDriver,
            stats: role === 'driver' ? reviewStats : null
          }
        },
        overallStats: {
          totalTrips: user.stats?.totalRidesAsPassenger + user.stats?.totalRidesAsDriver || 0,
          completionRate: user.stats?.completionRate || 100,
          memberSince: user.stats?.memberSince,
          responseTime: user.stats?.responseTime || 0
        }
      };
    } catch (error) {
      logger.error('Error getting user rating summary:', error);
      throw error;
    }
  }

  /**
   * Calculate rating trends for a user
   */
  static async getUserRatingTrends(userId, role = null, days = 30) {
    try {
      const reviews = await Review.findByRevieweeId(userId, { 
        reviewerRole: role === 'driver' ? 'passenger' : 'driver',
        limit: 100 
      });

      if (reviews.length === 0) {
        return {
          trend: 'stable',
          change: 0,
          recentAverage: 0,
          previousAverage: 0
        };
      }

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const recentReviews = reviews.filter(review => 
        new Date(review.createdAt) >= cutoffDate
      );
      
      const previousReviews = reviews.filter(review => 
        new Date(review.createdAt) < cutoffDate
      );

      const recentAverage = recentReviews.length > 0 
        ? recentReviews.reduce((sum, r) => sum + r.rating.overall, 0) / recentReviews.length
        : 0;

      const previousAverage = previousReviews.length > 0 
        ? previousReviews.reduce((sum, r) => sum + r.rating.overall, 0) / previousReviews.length
        : recentAverage;

      const change = recentAverage - previousAverage;
      let trend = 'stable';
      
      if (change > 0.2) trend = 'improving';
      else if (change < -0.2) trend = 'declining';

      return {
        trend,
        change: Math.round(change * 10) / 10,
        recentAverage: Math.round(recentAverage * 10) / 10,
        previousAverage: Math.round(previousAverage * 10) / 10,
        recentReviewCount: recentReviews.length,
        previousReviewCount: previousReviews.length
      };
    } catch (error) {
      logger.error('Error calculating user rating trends:', error);
      throw error;
    }
  }

  /**
   * Get rating insights and recommendations
   */
  static async getRatingInsights(userId, role = null) {
    try {
      const summary = await this.getUserRatingSummary(userId, role);
      const trends = await this.getUserRatingTrends(userId, role);
      
      const insights = [];
      const recommendations = [];

      const rating = role === 'driver' ? summary.ratings.asDriver : summary.ratings.asPassenger;
      
      // Rating insights
      if (rating.average >= 4.5) {
        insights.push({
          type: 'positive',
          message: 'Excellent rating! You\'re in the top 10% of users.',
          icon: '🌟'
        });
      } else if (rating.average >= 4.0) {
        insights.push({
          type: 'good',
          message: 'Good rating! Most users trust your service.',
          icon: '👍'
        });
      } else if (rating.average >= 3.5) {
        insights.push({
          type: 'warning',
          message: 'Your rating could use improvement.',
          icon: '⚠️'
        });
        recommendations.push('Focus on punctuality and communication');
      } else if (rating.average > 0) {
        insights.push({
          type: 'critical',
          message: 'Your rating needs immediate attention.',
          icon: '🚨'
        });
        recommendations.push('Consider reviewing recent feedback and improving service quality');
      }

      // Trend insights
      if (trends.trend === 'improving') {
        insights.push({
          type: 'positive',
          message: `Your rating is improving! Up ${trends.change} points recently.`,
          icon: '📈'
        });
      } else if (trends.trend === 'declining') {
        insights.push({
          type: 'warning',
          message: `Your rating is declining. Down ${Math.abs(trends.change)} points recently.`,
          icon: '📉'
        });
        recommendations.push('Review recent trips and address any issues');
      }

      // Verification level insights
      if (summary.verificationLevel === 'new') {
        recommendations.push('Complete phone verification to unlock more features');
      } else if (summary.verificationLevel === 'basic') {
        recommendations.push('Complete more trips to reach Verified status');
      }

      // Breakdown insights (for drivers)
      if (role === 'driver' && rating.breakdown) {
        const lowestCategory = Object.entries(rating.breakdown)
          .sort(([,a], [,b]) => a - b)[0];
        
        if (lowestCategory && lowestCategory[1] < 4.0) {
          const categoryNames = {
            driving: 'driving skills',
            punctuality: 'punctuality',
            friendliness: 'friendliness',
            vehicleCondition: 'vehicle condition'
          };
          
          recommendations.push(
            `Focus on improving ${categoryNames[lowestCategory[0]]} (${lowestCategory[1]}/5)`
          );
        }
      }

      return {
        insights,
        recommendations,
        summary,
        trends
      };
    } catch (error) {
      logger.error('Error getting rating insights:', error);
      throw error;
    }
  }

  /**
   * Validate rating data
   */
  static validateRating(rating, reviewerRole) {
    const requiredFields = reviewerRole === 'passenger' 
      ? ['driving', 'punctuality', 'friendliness', 'vehicleCondition']
      : ['punctuality', 'friendliness', 'cleanliness'];

    const errors = [];

    for (const field of requiredFields) {
      if (!rating[field] && rating[field] !== 0) {
        errors.push(`${field} rating is required`);
      } else if (rating[field] < 1 || rating[field] > 5) {
        errors.push(`${field} rating must be between 1 and 5`);
      } else if (!Number.isInteger(rating[field])) {
        errors.push(`${field} rating must be a whole number`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Get rating field descriptions
   */
  static getRatingFieldDescriptions(reviewerRole) {
    if (reviewerRole === 'passenger') {
      return {
        driving: 'How was the driver\'s driving skill and safety?',
        punctuality: 'Was the driver on time for pickup and arrival?',
        friendliness: 'How friendly and respectful was the driver?',
        vehicleCondition: 'How was the condition and cleanliness of the vehicle?'
      };
    } else {
      return {
        punctuality: 'Was the passenger ready on time?',
        friendliness: 'How friendly and respectful was the passenger?',
        cleanliness: 'Did the passenger keep the vehicle clean?'
      };
    }
  }

  /**
   * Get aggregated platform rating statistics
   */
  static async getPlatformRatingStats() {
    try {
      // This would typically be cached and updated periodically
      const stats = {
        totalReviews: 0,
        averageRating: 0,
        ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        verificationLevelDistribution: {
          new: 0,
          basic: 0,
          verified: 0,
          experienced: 0
        },
        topRatedUsers: [],
        recentTrends: {
          thisMonth: 0,
          lastMonth: 0,
          change: 0
        }
      };

      // In a real implementation, this would query aggregated data
      // For now, return placeholder stats
      return stats;
    } catch (error) {
      logger.error('Error getting platform rating stats:', error);
      throw error;
    }
  }
}

module.exports = RatingService;