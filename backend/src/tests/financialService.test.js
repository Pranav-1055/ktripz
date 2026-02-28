const financialService = require('../services/financialService');
const Payment = require('../models/Payment');
const Payout = require('../models/Payout');
const Booking = require('../models/Booking');

// Mock dependencies
jest.mock('../models/Payment');
jest.mock('../models/Payout');
jest.mock('../models/Booking');
jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
}));

// Mock Firebase
jest.mock('firebase-admin', () => ({
  database: () => ({
    ref: jest.fn(() => ({
      once: jest.fn(),
    })),
  }),
}));

describe('FinancialService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('calculateTotalAmount', () => {
    it('should calculate platform fee correctly', () => {
      const platformFee = financialService.calculatePlatformFee(1000);
      expect(platformFee).toBe(100); // 10% of 1000
    });

    it('should calculate payout processing fee correctly', () => {
      const processingFee = financialService.calculatePayoutProcessingFee(1000);
      expect(processingFee).toBe(20); // 2% of 1000
    });

    it('should apply minimum payout processing fee', () => {
      const processingFee = financialService.calculatePayoutProcessingFee(100);
      expect(processingFee).toBe(5); // Minimum ₹5 fee
    });
  });

  describe('calculateProviderEarnings', () => {
    const mockPayments = [
      {
        id: 'payment-1',
        bookingId: 'booking-1',
        rideId: 'ride-1',
        amount: 500,
        currency: 'INR',
        status: 'completed',
        updatedAt: '2024-01-01T10:00:00.000Z',
      },
      {
        id: 'payment-2',
        bookingId: 'booking-2',
        rideId: 'ride-2',
        amount: 800,
        currency: 'INR',
        status: 'completed',
        updatedAt: '2024-01-02T10:00:00.000Z',
      },
    ];

    const mockBookings = [
      {
        id: 'booking-1',
        driverId: 'provider-123',
        passengers: 2,
      },
      {
        id: 'booking-2',
        driverId: 'provider-123',
        passengers: 1,
      },
    ];

    beforeEach(() => {
      // Mock getProviderPayments method
      jest.spyOn(financialService, 'getProviderPayments').mockResolvedValue(mockPayments);
      
      // Mock Booking.findById
      Booking.findById.mockImplementation((bookingId) => {
        return Promise.resolve(mockBookings.find(b => b.id === bookingId));
      });
    });

    it('should calculate provider earnings correctly', async () => {
      const earnings = await financialService.calculateProviderEarnings('provider-123');

      expect(earnings.providerId).toBe('provider-123');
      expect(earnings.summary.totalEarnings).toBe(1170); // (500-50) + (800-80) = 450 + 720
      expect(earnings.summary.totalPlatformFees).toBe(130); // 50 + 80
      expect(earnings.summary.grossEarnings).toBe(1300); // 500 + 800
      expect(earnings.summary.totalRides).toBe(2);
      expect(earnings.summary.totalPassengers).toBe(3);
      expect(earnings.breakdown).toHaveLength(2);
    });

    it('should filter earnings by date range', async () => {
      const startDate = '2024-01-02T00:00:00.000Z';
      const endDate = '2024-01-02T23:59:59.000Z';

      const earnings = await financialService.calculateProviderEarnings(
        'provider-123',
        startDate,
        endDate
      );

      expect(financialService.getProviderPayments).toHaveBeenCalledWith(
        'provider-123',
        startDate,
        endDate
      );
    });

    it('should handle empty payments', async () => {
      jest.spyOn(financialService, 'getProviderPayments').mockResolvedValue([]);

      const earnings = await financialService.calculateProviderEarnings('provider-123');

      expect(earnings.summary.totalEarnings).toBe(0);
      expect(earnings.summary.totalRides).toBe(0);
      expect(earnings.breakdown).toHaveLength(0);
    });
  });

  describe('getAvailableBalance', () => {
    it('should calculate available balance correctly', async () => {
      const mockEarnings = {
        summary: {
          totalEarnings: 1000,
        },
      };

      const mockPayouts = [
        { status: 'pending', amount: 200 },
        { status: 'processing', amount: 100 },
        { status: 'completed', amount: 300 },
      ];

      jest.spyOn(financialService, 'calculateProviderEarnings').mockResolvedValue(mockEarnings);
      Payout.findByProviderId.mockResolvedValue(mockPayouts);

      const balance = await financialService.getAvailableBalance('provider-123');

      expect(balance.totalEarnings).toBe(1000);
      expect(balance.pendingPayouts).toBe(300); // 200 + 100 (pending + processing)
      expect(balance.availableBalance).toBe(700); // 1000 - 300
    });

    it('should not allow negative available balance', async () => {
      const mockEarnings = {
        summary: {
          totalEarnings: 100,
        },
      };

      const mockPayouts = [
        { status: 'pending', amount: 200 },
      ];

      jest.spyOn(financialService, 'calculateProviderEarnings').mockResolvedValue(mockEarnings);
      Payout.findByProviderId.mockResolvedValue(mockPayouts);

      const balance = await financialService.getAvailableBalance('provider-123');

      expect(balance.availableBalance).toBe(0); // Should not be negative
    });
  });

  describe('requestPayout', () => {
    beforeEach(() => {
      const mockBalance = {
        totalEarnings: 1000,
        pendingPayouts: 0,
        availableBalance: 1000,
      };

      const mockEarnings = {
        summary: { totalEarnings: 1000 },
        breakdown: [
          { paymentId: 'payment-1' },
          { paymentId: 'payment-2' },
        ],
      };

      jest.spyOn(financialService, 'getAvailableBalance').mockResolvedValue(mockBalance);
      jest.spyOn(financialService, 'calculateProviderEarnings').mockResolvedValue(mockEarnings);
    });

    it('should create payout request successfully', async () => {
      const mockPayout = {
        id: 'payout-123',
        save: jest.fn().mockResolvedValue(true),
      };
      Payout.mockImplementation(() => mockPayout);

      const payout = await financialService.requestPayout(
        'provider-123',
        500,
        'bank_transfer',
        { accountNumber: '123456789', ifscCode: 'HDFC0001234' }
      );

      expect(payout).toBe(mockPayout);
      expect(mockPayout.save).toHaveBeenCalled();
    });

    it('should reject payout request for insufficient balance', async () => {
      const mockBalance = {
        availableBalance: 100,
      };
      jest.spyOn(financialService, 'getAvailableBalance').mockResolvedValue(mockBalance);

      await expect(
        financialService.requestPayout('provider-123', 500, 'bank_transfer', {})
      ).rejects.toThrow('Insufficient balance');
    });

    it('should reject payout request below minimum amount', async () => {
      await expect(
        financialService.requestPayout('provider-123', 50, 'bank_transfer', {})
      ).rejects.toThrow('Minimum payout amount is ₹100');
    });
  });

  describe('calculateDailyEarnings', () => {
    it('should aggregate earnings by day', () => {
      const earningsBreakdown = [
        { netEarning: 100, paidAt: '2024-01-01T10:00:00.000Z' },
        { netEarning: 200, paidAt: '2024-01-01T15:00:00.000Z' },
        { netEarning: 150, paidAt: '2024-01-02T10:00:00.000Z' },
      ];

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-02');

      const dailyEarnings = financialService.calculateDailyEarnings(
        earningsBreakdown,
        startDate,
        endDate
      );

      expect(dailyEarnings).toHaveLength(2);
      expect(dailyEarnings[0]).toEqual({
        date: '2024-01-01',
        earnings: 300, // 100 + 200
      });
      expect(dailyEarnings[1]).toEqual({
        date: '2024-01-02',
        earnings: 150,
      });
    });

    it('should include days with zero earnings', () => {
      const earningsBreakdown = [
        { netEarning: 100, paidAt: '2024-01-01T10:00:00.000Z' },
      ];

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-03');

      const dailyEarnings = financialService.calculateDailyEarnings(
        earningsBreakdown,
        startDate,
        endDate
      );

      expect(dailyEarnings).toHaveLength(3);
      expect(dailyEarnings[1]).toEqual({
        date: '2024-01-02',
        earnings: 0,
      });
      expect(dailyEarnings[2]).toEqual({
        date: '2024-01-03',
        earnings: 0,
      });
    });
  });

  describe('calculateTrends', () => {
    it('should calculate increasing trend', () => {
      const dailyEarnings = [
        { date: '2024-01-01', earnings: 100 },
        { date: '2024-01-02', earnings: 100 },
        { date: '2024-01-03', earnings: 100 },
        { date: '2024-01-04', earnings: 100 },
        { date: '2024-01-05', earnings: 100 },
        { date: '2024-01-06', earnings: 100 },
        { date: '2024-01-07', earnings: 100 }, // Previous 7 days avg: 100
        { date: '2024-01-08', earnings: 150 },
        { date: '2024-01-09', earnings: 150 },
        { date: '2024-01-10', earnings: 150 },
        { date: '2024-01-11', earnings: 150 },
        { date: '2024-01-12', earnings: 150 },
        { date: '2024-01-13', earnings: 150 },
        { date: '2024-01-14', earnings: 150 }, // Recent 7 days avg: 150
      ];

      const trends = financialService.calculateTrends(dailyEarnings);

      expect(trends.trend).toBe('increasing');
      expect(trends.change).toBe(50); // 50% increase
    });

    it('should calculate decreasing trend', () => {
      const dailyEarnings = [
        { date: '2024-01-01', earnings: 200 },
        { date: '2024-01-02', earnings: 200 },
        { date: '2024-01-03', earnings: 200 },
        { date: '2024-01-04', earnings: 200 },
        { date: '2024-01-05', earnings: 200 },
        { date: '2024-01-06', earnings: 200 },
        { date: '2024-01-07', earnings: 200 }, // Previous 7 days avg: 200
        { date: '2024-01-08', earnings: 100 },
        { date: '2024-01-09', earnings: 100 },
        { date: '2024-01-10', earnings: 100 },
        { date: '2024-01-11', earnings: 100 },
        { date: '2024-01-12', earnings: 100 },
        { date: '2024-01-13', earnings: 100 },
        { date: '2024-01-14', earnings: 100 }, // Recent 7 days avg: 100
      ];

      const trends = financialService.calculateTrends(dailyEarnings);

      expect(trends.trend).toBe('decreasing');
      expect(trends.change).toBe(-50); // 50% decrease
    });

    it('should calculate stable trend for small changes', () => {
      const dailyEarnings = [
        { date: '2024-01-01', earnings: 100 },
        { date: '2024-01-02', earnings: 100 },
        { date: '2024-01-03', earnings: 100 },
        { date: '2024-01-04', earnings: 100 },
        { date: '2024-01-05', earnings: 100 },
        { date: '2024-01-06', earnings: 100 },
        { date: '2024-01-07', earnings: 100 }, // Previous 7 days avg: 100
        { date: '2024-01-08', earnings: 102 },
        { date: '2024-01-09', earnings: 102 },
        { date: '2024-01-10', earnings: 102 },
        { date: '2024-01-11', earnings: 102 },
        { date: '2024-01-12', earnings: 102 },
        { date: '2024-01-13', earnings: 102 },
        { date: '2024-01-14', earnings: 102 }, // Recent 7 days avg: 102
      ];

      const trends = financialService.calculateTrends(dailyEarnings);

      expect(trends.trend).toBe('stable'); // 2% change is considered stable
    });

    it('should handle insufficient data', () => {
      const dailyEarnings = [
        { date: '2024-01-01', earnings: 100 },
      ];

      const trends = financialService.calculateTrends(dailyEarnings);

      expect(trends.trend).toBe('stable');
      expect(trends.change).toBe(0);
    });
  });
});