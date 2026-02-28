const request = require('supertest');
const express = require('express');
const paymentRoutes = require('../routes/payments');
const paymentService = require('../services/paymentService');
const Payment = require('../models/Payment');
const Booking = require('../models/Booking');
const Ride = require('../models/Ride');

// Mock dependencies
jest.mock('../services/paymentService');
jest.mock('../models/Payment');
jest.mock('../models/Booking');
jest.mock('../models/Ride');
jest.mock('../middleware/auth', () => (req, res, next) => {
  req.user = { uid: 'test-user-id' };
  next();
});

const app = express();
app.use(express.json());
app.use('/api/payments', paymentRoutes);

describe('Payment Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/payments/initiate', () => {
    const mockBooking = {
      id: 'booking-123',
      passengerId: 'test-user-id',
      rideId: 'ride-123',
      status: 'confirmed',
      pricing: {
        totalAmount: 500,
      },
    };

    const mockPaymentOrder = {
      success: true,
      orderId: 'order_123',
      amount: 525,
      currency: 'INR',
      gateway: 'razorpay',
    };

    it('should initiate payment successfully with Razorpay', async () => {
      Booking.findById.mockResolvedValue(mockBooking);
      Payment.findByBookingId.mockResolvedValue([]);
      paymentService.calculateTotalAmount.mockReturnValue({
        baseAmount: 500,
        serviceFee: 25,
        totalAmount: 525,
      });
      paymentService.createRazorpayOrder.mockResolvedValue(mockPaymentOrder);
      
      const mockPayment = {
        id: 'payment-123',
        save: jest.fn().mockResolvedValue(true),
      };
      Payment.mockImplementation(() => mockPayment);

      const response = await request(app)
        .post('/api/payments/initiate')
        .send({
          bookingId: 'booking-123',
          gateway: 'razorpay',
          paymentMethod: 'card',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.gateway).toBe('razorpay');
      expect(response.body.data.orderId).toBe('order_123');
      expect(response.body.data.amount).toBe(525);
    });

    it('should initiate payment successfully with Stripe', async () => {
      const mockStripePaymentIntent = {
        success: true,
        paymentIntentId: 'pi_123',
        clientSecret: 'pi_123_secret',
        amount: 525,
        currency: 'inr',
        gateway: 'stripe',
      };

      Booking.findById.mockResolvedValue(mockBooking);
      Payment.findByBookingId.mockResolvedValue([]);
      paymentService.calculateTotalAmount.mockReturnValue({
        baseAmount: 500,
        serviceFee: 25,
        totalAmount: 525,
      });
      paymentService.createStripePaymentIntent.mockResolvedValue(mockStripePaymentIntent);
      
      const mockPayment = {
        id: 'payment-123',
        save: jest.fn().mockResolvedValue(true),
      };
      Payment.mockImplementation(() => mockPayment);

      const response = await request(app)
        .post('/api/payments/initiate')
        .send({
          bookingId: 'booking-123',
          gateway: 'stripe',
          paymentMethod: 'card',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.gateway).toBe('stripe');
      expect(response.body.data.paymentIntentId).toBe('pi_123');
      expect(response.body.data.clientSecret).toBe('pi_123_secret');
    });

    it('should return 404 if booking not found', async () => {
      Booking.findById.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/payments/initiate')
        .send({
          bookingId: 'booking-123',
          gateway: 'razorpay',
        });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('BOOKING_NOT_FOUND');
    });

    it('should return 403 if user is not the passenger', async () => {
      const unauthorizedBooking = {
        ...mockBooking,
        passengerId: 'other-user-id',
      };
      Booking.findById.mockResolvedValue(unauthorizedBooking);

      const response = await request(app)
        .post('/api/payments/initiate')
        .send({
          bookingId: 'booking-123',
          gateway: 'razorpay',
        });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 400 if booking is not confirmed', async () => {
      const pendingBooking = {
        ...mockBooking,
        status: 'pending',
      };
      Booking.findById.mockResolvedValue(pendingBooking);

      const response = await request(app)
        .post('/api/payments/initiate')
        .send({
          bookingId: 'booking-123',
          gateway: 'razorpay',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_BOOKING_STATUS');
    });

    it('should return 400 if payment already completed', async () => {
      const completedPayment = {
        status: 'completed',
      };
      Booking.findById.mockResolvedValue(mockBooking);
      Payment.findByBookingId.mockResolvedValue([completedPayment]);

      const response = await request(app)
        .post('/api/payments/initiate')
        .send({
          bookingId: 'booking-123',
          gateway: 'razorpay',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('PAYMENT_ALREADY_COMPLETED');
    });
  });

  describe('POST /api/payments/verify', () => {
    const mockPayment = {
      id: 'payment-123',
      userId: 'test-user-id',
      bookingId: 'booking-123',
      amount: 525,
      currency: 'INR',
      updateStatus: jest.fn().mockResolvedValue(true),
    };

    const mockBooking = {
      id: 'booking-123',
      payment: {
        status: 'pending',
      },
      save: jest.fn().mockResolvedValue(true),
    };

    it('should verify Razorpay payment successfully', async () => {
      Payment.findById.mockResolvedValue(mockPayment);
      Booking.findById.mockResolvedValue(mockBooking);
      paymentService.verifyRazorpayPayment.mockReturnValue(true);

      const response = await request(app)
        .post('/api/payments/verify')
        .send({
          paymentId: 'payment-123',
          gateway: 'razorpay',
          razorpay_order_id: 'order_123',
          razorpay_payment_id: 'pay_123',
          razorpay_signature: 'signature_123',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('completed');
      expect(mockPayment.updateStatus).toHaveBeenCalledWith('completed', {
        gatewayPaymentId: 'pay_123',
      });
    });

    it('should verify Stripe payment successfully', async () => {
      Payment.findById.mockResolvedValue(mockPayment);
      Booking.findById.mockResolvedValue(mockBooking);
      paymentService.retrieveStripePaymentIntent.mockResolvedValue({
        success: true,
        paymentIntent: {
          status: 'succeeded',
          payment_method_types: ['card'],
        },
      });

      const response = await request(app)
        .post('/api/payments/verify')
        .send({
          paymentId: 'payment-123',
          gateway: 'stripe',
          payment_intent_id: 'pi_123',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('completed');
      expect(mockPayment.updateStatus).toHaveBeenCalledWith('completed', {
        gatewayPaymentId: 'pi_123',
        paymentMethod: 'card',
      });
    });

    it('should return 404 if payment not found', async () => {
      Payment.findById.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/payments/verify')
        .send({
          paymentId: 'payment-123',
          gateway: 'razorpay',
          razorpay_order_id: 'order_123',
          razorpay_payment_id: 'pay_123',
          razorpay_signature: 'signature_123',
        });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('PAYMENT_NOT_FOUND');
    });

    it('should return 400 if Razorpay verification fails', async () => {
      Payment.findById.mockResolvedValue(mockPayment);
      paymentService.verifyRazorpayPayment.mockReturnValue(false);

      const response = await request(app)
        .post('/api/payments/verify')
        .send({
          paymentId: 'payment-123',
          gateway: 'razorpay',
          razorpay_order_id: 'order_123',
          razorpay_payment_id: 'pay_123',
          razorpay_signature: 'invalid_signature',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('PAYMENT_VERIFICATION_FAILED');
    });
  });

  describe('POST /api/payments/refund', () => {
    const mockPayment = {
      id: 'payment-123',
      userId: 'test-user-id',
      bookingId: 'booking-123',
      rideId: 'ride-123',
      amount: 525,
      status: 'completed',
      gateway: 'razorpay',
      gatewayPaymentId: 'pay_123',
      addRefund: jest.fn().mockResolvedValue(true),
    };

    const mockBooking = {
      id: 'booking-123',
      passengerId: 'test-user-id',
      driverId: 'driver-123',
      status: 'confirmed',
      save: jest.fn().mockResolvedValue(true),
    };

    const mockRide = {
      id: 'ride-123',
      departureDate: '2024-12-31',
      departureTime: '10:00',
    };

    it('should process refund successfully', async () => {
      Payment.findById.mockResolvedValue(mockPayment);
      Booking.findById.mockResolvedValue(mockBooking);
      Ride.findById.mockResolvedValue(mockRide);
      
      // Mock future departure time (48 hours from now)
      const futureDate = new Date();
      futureDate.setHours(futureDate.getHours() + 48);
      mockRide.departureDate = futureDate.toISOString().split('T')[0];
      mockRide.departureTime = futureDate.toTimeString().split(' ')[0].substring(0, 5);

      paymentService.calculateRefundAmount.mockReturnValue({
        refundAmount: 525,
        refundPercentage: 100,
        refundType: 'full',
      });

      paymentService.processRazorpayRefund.mockResolvedValue({
        success: true,
        refundId: 'rfnd_123',
        amount: 525,
        status: 'processed',
        gateway: 'razorpay',
      });

      const response = await request(app)
        .post('/api/payments/refund')
        .send({
          paymentId: 'payment-123',
          reason: 'User requested cancellation',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.refundAmount).toBe(525);
      expect(response.body.data.refundType).toBe('full');
      expect(mockPayment.addRefund).toHaveBeenCalled();
    });

    it('should return 400 if no refund is eligible', async () => {
      Payment.findById.mockResolvedValue(mockPayment);
      Booking.findById.mockResolvedValue(mockBooking);
      Ride.findById.mockResolvedValue(mockRide);
      
      // Mock past departure time
      const pastDate = new Date();
      pastDate.setHours(pastDate.getHours() - 1);
      mockRide.departureDate = pastDate.toISOString().split('T')[0];
      mockRide.departureTime = pastDate.toTimeString().split(' ')[0].substring(0, 5);

      paymentService.calculateRefundAmount.mockReturnValue({
        refundAmount: 0,
        refundPercentage: 0,
        refundType: 'none',
      });

      const response = await request(app)
        .post('/api/payments/refund')
        .send({
          paymentId: 'payment-123',
          reason: 'User requested cancellation',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('NO_REFUND_ELIGIBLE');
    });

    it('should return 400 if payment is not completed', async () => {
      const pendingPayment = {
        ...mockPayment,
        status: 'pending',
      };
      Payment.findById.mockResolvedValue(pendingPayment);
      Booking.findById.mockResolvedValue(mockBooking);

      const response = await request(app)
        .post('/api/payments/refund')
        .send({
          paymentId: 'payment-123',
          reason: 'User requested cancellation',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_PAYMENT_STATUS');
    });
  });

  describe('GET /api/payments/history', () => {
    it('should return payment history successfully', async () => {
      const mockPayments = [
        {
          getSummary: () => ({
            id: 'payment-1',
            amount: 525,
            status: 'completed',
            createdAt: '2024-01-01T00:00:00.000Z',
          }),
        },
        {
          getSummary: () => ({
            id: 'payment-2',
            amount: 300,
            status: 'refunded',
            createdAt: '2024-01-02T00:00:00.000Z',
          }),
        },
      ];

      Payment.findByUserId.mockResolvedValue(mockPayments);

      const response = await request(app)
        .get('/api/payments/history')
        .query({ limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.payments).toHaveLength(2);
      expect(response.body.data.total).toBe(2);
    });

    it('should filter payments by status', async () => {
      const mockPayments = [
        {
          status: 'completed',
          getSummary: () => ({
            id: 'payment-1',
            amount: 525,
            status: 'completed',
            createdAt: '2024-01-01T00:00:00.000Z',
          }),
        },
      ];

      Payment.findByUserId.mockResolvedValue(mockPayments);

      const response = await request(app)
        .get('/api/payments/history')
        .query({ status: 'completed' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.payments).toHaveLength(1);
      expect(response.body.data.payments[0].status).toBe('completed');
    });
  });

  describe('GET /api/payments/:paymentId', () => {
    const mockPayment = {
      id: 'payment-123',
      userId: 'test-user-id',
      bookingId: 'booking-123',
      getDetails: () => ({
        id: 'payment-123',
        amount: 525,
        status: 'completed',
        gateway: 'razorpay',
      }),
    };

    const mockBooking = {
      id: 'booking-123',
      passengerId: 'test-user-id',
      driverId: 'driver-123',
    };

    it('should return payment details successfully', async () => {
      Payment.findById.mockResolvedValue(mockPayment);
      Booking.findById.mockResolvedValue(mockBooking);

      const response = await request(app)
        .get('/api/payments/payment-123');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe('payment-123');
      expect(response.body.data.amount).toBe(525);
    });

    it('should return 404 if payment not found', async () => {
      Payment.findById.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/payments/payment-123');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('PAYMENT_NOT_FOUND');
    });

    it('should return 403 if user is not authorized', async () => {
      const unauthorizedBooking = {
        id: 'booking-123',
        passengerId: 'other-user-id',
        driverId: 'other-driver-id',
      };
      Payment.findById.mockResolvedValue(mockPayment);
      Booking.findById.mockResolvedValue(unauthorizedBooking);

      const response = await request(app)
        .get('/api/payments/payment-123');

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });
  });
});

describe('PaymentService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('calculateTotalAmount', () => {
    it('should calculate total amount with service fee', () => {
      const result = paymentService.calculateTotalAmount(500, 5);
      
      expect(result.baseAmount).toBe(500);
      expect(result.serviceFee).toBe(25);
      expect(result.totalAmount).toBe(525);
    });

    it('should use default service fee percentage', () => {
      // Mock the config
      jest.doMock('../config/payment', () => ({
        config: { serviceFeePercentage: 5.0 },
      }));
      
      const result = paymentService.calculateTotalAmount(1000);
      
      expect(result.baseAmount).toBe(1000);
      expect(result.serviceFee).toBe(50);
      expect(result.totalAmount).toBe(1050);
    });
  });

  describe('calculateRefundAmount', () => {
    it('should return full refund for cancellation 24+ hours before', () => {
      const result = paymentService.calculateRefundAmount(500, 25);
      
      expect(result.refundAmount).toBe(500);
      expect(result.refundPercentage).toBe(100);
      expect(result.refundType).toBe('full');
    });

    it('should return partial refund for cancellation 2-24 hours before', () => {
      const result = paymentService.calculateRefundAmount(500, 5);
      
      expect(result.refundAmount).toBe(250);
      expect(result.refundPercentage).toBe(50);
      expect(result.refundType).toBe('partial');
    });

    it('should return no refund for cancellation less than 2 hours before', () => {
      const result = paymentService.calculateRefundAmount(500, 1);
      
      expect(result.refundAmount).toBe(0);
      expect(result.refundPercentage).toBe(0);
      expect(result.refundType).toBe('none');
    });
  });
});