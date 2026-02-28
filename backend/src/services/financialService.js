const Payment = require('../models/Payment');
const Payout = require('../models/Payout');
const Booking = require('../models/Booking');
const Ride = require('../models/Ride');
const logger = require('../utils/logger');

class FinancialService {
  /**
   * Calculate earnings for a provider
   */
  async calculateProviderEarnings(providerId, startDate = null, endDate = null) {
    try {
      // Get all completed payments for rides by this provider
      const payments = await this.getProviderPayments(providerId, startDate, endDate);
      
      let totalEarnings = 0;
      let totalPlatformFees = 0;
      let totalRides = 0;
      let totalPassengers = 0;
      const earningsBreakdown = [];

      for (const payment of payments) {
        if (payment.status === 'completed') {
          const booking = await Booking.findById(payment.bookingId);
          if (booking && booking.driverId === providerId) {
            const platformFee = this.calculatePlatformFee(payment.amount);
            const providerEarning = payment.amount - platformFee;
            
            totalEarnings += providerEarning;
            totalPlatformFees += platformFee;
            totalRides++;
            totalPassengers += booking.passengers || 1;

            earningsBreakdown.push({
              paymentId: payment.id,
              bookingId: payment.bookingId,
              rideId: payment.rideId,
              grossAmount: payment.amount,
              platformFee,
              netEarning: providerEarning,
              currency: payment.currency,
              paidAt: payment.updatedAt,
            });
          }
        }
      }

      return {
        providerId,
        period: {
          startDate: startDate || 'all-time',
          endDate: endDate || new Date().toISOString(),
        },
        summary: {
          totalEarnings,
          totalPlatformFees,
          grossEarnings: totalEarnings + totalPlatformFees,
          totalRides,
          totalPassengers,
          averageEarningPerRide: totalRides > 0 ? Math.round(totalEarnings / totalRides) : 0,
        },
        breakdown: earningsBreakdown,
      };
    } catch (error) {
      logger.error('Error calculating provider earnings', {
        error: error.message,
        providerId,
        startDate,
        endDate,
      });
      throw new Error(`Failed to calculate provider earnings: ${error.message}`);
    }
  }

  /**
   * Get available balance for payout
   */
  async getAvailableBalance(providerId) {
    try {
      const earnings = await this.calculateProviderEarnings(providerId);
      const pendingPayouts = await Payout.findByProviderId(providerId);
      
      // Calculate total pending payout amounts
      const pendingAmount = pendingPayouts
        .filter(payout => ['pending', 'processing'].includes(payout.status))
        .reduce((sum, payout) => sum + payout.amount, 0);

      const availableBalance = earnings.summary.totalEarnings - pendingAmount;

      return {
        totalEarnings: earnings.summary.totalEarnings,
        pendingPayouts: pendingAmount,
        availableBalance: Math.max(0, availableBalance),
        currency: 'INR',
        lastUpdated: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Error getting available balance', {
        error: error.message,
        providerId,
      });
      throw new Error(`Failed to get available balance: ${error.message}`);
    }
  }

  /**
   * Request payout for provider
   */
  async requestPayout(providerId, amount, payoutMethod, bankDetails = {}) {
    try {
      // Check available balance
      const balance = await this.getAvailableBalance(providerId);
      
      if (amount > balance.availableBalance) {
        throw new Error(`Insufficient balance. Available: ₹${balance.availableBalance}, Requested: ₹${amount}`);
      }

      // Minimum payout amount check
      const minimumPayout = 100; // ₹100 minimum
      if (amount < minimumPayout) {
        throw new Error(`Minimum payout amount is ₹${minimumPayout}`);
      }

      // Get transactions to include in this payout
      const earnings = await this.calculateProviderEarnings(providerId);
      const transactionIds = earnings.breakdown
        .slice(0, Math.ceil(earnings.breakdown.length * (amount / earnings.summary.totalEarnings)))
        .map(transaction => transaction.paymentId);

      // Calculate platform fee for payout processing
      const platformFee = this.calculatePayoutProcessingFee(amount);
      const netAmount = amount - platformFee;

      // Create payout record
      const payout = new Payout({
        providerId,
        amount,
        currency: 'INR',
        status: 'pending',
        payoutMethod,
        bankDetails,
        transactionIds,
        platformFee,
        netAmount,
        metadata: {
          requestedBalance: balance.availableBalance,
          totalEarnings: balance.totalEarnings,
        },
      });

      await payout.save();

      logger.info('Payout requested', {
        payoutId: payout.id,
        providerId,
        amount,
        netAmount,
        payoutMethod,
      });

      return payout;
    } catch (error) {
      logger.error('Error requesting payout', {
        error: error.message,
        providerId,
        amount,
        payoutMethod,
      });
      throw error;
    }
  }

  /**
   * Process payout (admin function)
   */
  async processPayout(payoutId, adminId) {
    try {
      const payout = await Payout.findById(payoutId);
      if (!payout) {
        throw new Error('Payout not found');
      }

      if (payout.status !== 'pending') {
        throw new Error(`Cannot process payout with status: ${payout.status}`);
      }

      // Update status to processing
      await payout.updateStatus('processing', {
        processedBy: adminId,
      });

      // Here you would integrate with actual payout processing
      // For now, we'll simulate successful processing
      setTimeout(async () => {
        try {
          await payout.updateStatus('completed');
          logger.info('Payout completed', {
            payoutId: payout.id,
            providerId: payout.providerId,
            amount: payout.amount,
          });
        } catch (error) {
          logger.error('Error completing payout', {
            error: error.message,
            payoutId,
          });
          await payout.updateStatus('failed', {
            failureReason: error.message,
          });
        }
      }, 5000); // Simulate 5 second processing time

      return payout;
    } catch (error) {
      logger.error('Error processing payout', {
        error: error.message,
        payoutId,
        adminId,
      });
      throw error;
    }
  }

  /**
   * Get financial analytics for provider
   */
  async getProviderAnalytics(providerId, period = '30d') {
    try {
      const endDate = new Date();
      let startDate = new Date();
      
      // Calculate start date based on period
      switch (period) {
        case '7d':
          startDate.setDate(endDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(endDate.getDate() - 30);
          break;
        case '90d':
          startDate.setDate(endDate.getDate() - 90);
          break;
        case '1y':
          startDate.setFullYear(endDate.getFullYear() - 1);
          break;
        default:
          startDate = null;
      }

      const earnings = await this.calculateProviderEarnings(
        providerId,
        startDate?.toISOString(),
        endDate.toISOString()
      );

      // Calculate daily earnings for trend analysis
      const dailyEarnings = this.calculateDailyEarnings(earnings.breakdown, startDate, endDate);
      
      // Calculate performance metrics
      const performanceMetrics = await this.calculatePerformanceMetrics(providerId, startDate, endDate);

      return {
        providerId,
        period,
        dateRange: {
          startDate: startDate?.toISOString() || 'all-time',
          endDate: endDate.toISOString(),
        },
        earnings: earnings.summary,
        dailyEarnings,
        performanceMetrics,
        trends: this.calculateTrends(dailyEarnings),
      };
    } catch (error) {
      logger.error('Error getting provider analytics', {
        error: error.message,
        providerId,
        period,
      });
      throw new Error(`Failed to get provider analytics: ${error.message}`);
    }
  }

  /**
   * Get transaction history for provider
   */
  async getTransactionHistory(providerId, limit = 50, offset = 0) {
    try {
      const payments = await this.getProviderPayments(providerId);
      const payouts = await Payout.findByProviderId(providerId);

      // Combine and sort transactions
      const transactions = [];

      // Add payment transactions
      for (const payment of payments) {
        const booking = await Booking.findById(payment.bookingId);
        if (booking && booking.driverId === providerId) {
          const platformFee = this.calculatePlatformFee(payment.amount);
          transactions.push({
            id: payment.id,
            type: 'earning',
            amount: payment.amount - platformFee,
            grossAmount: payment.amount,
            platformFee,
            currency: payment.currency,
            status: payment.status,
            description: `Ride earnings - Booking ${payment.bookingId}`,
            date: payment.updatedAt,
            metadata: {
              bookingId: payment.bookingId,
              rideId: payment.rideId,
              paymentId: payment.id,
            },
          });
        }
      }

      // Add payout transactions
      for (const payout of payouts) {
        transactions.push({
          id: payout.id,
          type: 'payout',
          amount: -payout.amount, // Negative for outgoing
          netAmount: -payout.netAmount,
          platformFee: payout.platformFee,
          currency: payout.currency,
          status: payout.status,
          description: `Payout to ${payout.payoutMethod}`,
          date: payout.createdAt,
          metadata: {
            payoutId: payout.id,
            payoutMethod: payout.payoutMethod,
            transactionIds: payout.transactionIds,
          },
        });
      }

      // Sort by date (newest first)
      transactions.sort((a, b) => new Date(b.date) - new Date(a.date));

      // Apply pagination
      const paginatedTransactions = transactions.slice(offset, offset + limit);

      return {
        transactions: paginatedTransactions,
        pagination: {
          total: transactions.length,
          limit,
          offset,
          hasMore: offset + limit < transactions.length,
        },
      };
    } catch (error) {
      logger.error('Error getting transaction history', {
        error: error.message,
        providerId,
        limit,
        offset,
      });
      throw new Error(`Failed to get transaction history: ${error.message}`);
    }
  }

  /**
   * Helper: Get all payments for a provider's rides
   */
  async getProviderPayments(providerId, startDate = null, endDate = null) {
    try {
      // This is a simplified approach - in a real implementation,
      // you might want to create an index for better performance
      const allPayments = await this.getAllPayments();
      const providerPayments = [];

      for (const payment of allPayments) {
        const booking = await Booking.findById(payment.bookingId);
        if (booking && booking.driverId === providerId) {
          // Filter by date range if provided
          if (startDate && new Date(payment.createdAt) < new Date(startDate)) continue;
          if (endDate && new Date(payment.createdAt) > new Date(endDate)) continue;
          
          providerPayments.push(payment);
        }
      }

      return providerPayments;
    } catch (error) {
      throw new Error(`Failed to get provider payments: ${error.message}`);
    }
  }

  /**
   * Helper: Get all payments (simplified - would need optimization for production)
   */
  async getAllPayments() {
    try {
      const { getDatabase } = require('../config/firebase');
      const db = getDatabase();
      
      const snapshot = await db.ref('payments').once('value');
      const paymentsData = snapshot.val();
      
      if (!paymentsData) {
        return [];
      }

      return Object.keys(paymentsData).map(id => 
        new Payment({ id, ...paymentsData[id] })
      );
    } catch (error) {
      throw new Error(`Failed to get all payments: ${error.message}`);
    }
  }

  /**
   * Helper: Calculate platform fee
   */
  calculatePlatformFee(amount) {
    const platformFeePercentage = 10; // 10% platform fee
    return Math.round((amount * platformFeePercentage) / 100);
  }

  /**
   * Helper: Calculate payout processing fee
   */
  calculatePayoutProcessingFee(amount) {
    const processingFeePercentage = 2; // 2% processing fee
    const minimumFee = 5; // Minimum ₹5 fee
    const calculatedFee = Math.round((amount * processingFeePercentage) / 100);
    return Math.max(calculatedFee, minimumFee);
  }

  /**
   * Helper: Calculate daily earnings
   */
  calculateDailyEarnings(earningsBreakdown, startDate, endDate) {
    const dailyEarnings = {};
    
    // Initialize all days with 0
    if (startDate && endDate) {
      const currentDate = new Date(startDate);
      while (currentDate <= endDate) {
        const dateKey = currentDate.toISOString().split('T')[0];
        dailyEarnings[dateKey] = 0;
        currentDate.setDate(currentDate.getDate() + 1);
      }
    }

    // Aggregate earnings by day
    for (const earning of earningsBreakdown) {
      const dateKey = earning.paidAt.split('T')[0];
      dailyEarnings[dateKey] = (dailyEarnings[dateKey] || 0) + earning.netEarning;
    }

    return Object.keys(dailyEarnings)
      .sort()
      .map(date => ({
        date,
        earnings: dailyEarnings[date],
      }));
  }

  /**
   * Helper: Calculate performance metrics
   */
  async calculatePerformanceMetrics(providerId, startDate, endDate) {
    // This would include metrics like:
    // - Average rating
    // - Completion rate
    // - Cancellation rate
    // - Response time
    // For now, returning mock data
    return {
      averageRating: 4.5,
      totalRides: 25,
      completionRate: 95,
      cancellationRate: 5,
      averageResponseTime: '2 minutes',
    };
  }

  /**
   * Helper: Calculate trends
   */
  calculateTrends(dailyEarnings) {
    if (dailyEarnings.length < 2) {
      return { trend: 'stable', change: 0 };
    }

    const recent = dailyEarnings.slice(-7); // Last 7 days
    const previous = dailyEarnings.slice(-14, -7); // Previous 7 days

    const recentAvg = recent.reduce((sum, day) => sum + day.earnings, 0) / recent.length;
    const previousAvg = previous.reduce((sum, day) => sum + day.earnings, 0) / previous.length;

    if (previousAvg === 0) {
      return { trend: 'stable', change: 0 };
    }

    const changePercentage = ((recentAvg - previousAvg) / previousAvg) * 100;
    
    let trend = 'stable';
    if (changePercentage > 5) trend = 'increasing';
    else if (changePercentage < -5) trend = 'decreasing';

    return {
      trend,
      change: Math.round(changePercentage * 100) / 100,
    };
  }
}

module.exports = new FinancialService();