const paymentService = require('../services/paymentService');

// Mock the payment config
jest.mock('../config/payment', () => ({
  razorpay: {
    orders: {
      create: jest.fn(),
    },
    payments: {
      refund: jest.fn(),
    },
  },
  stripe: {
    paymentIntents: {
      create: jest.fn(),
      retrieve: jest.fn(),
    },
    refunds: {
      create: jest.fn(),
    },
    webhooks: {
      constructEvent: jest.fn(),
    },
  },
  config: {
    serviceFeePercentage: 5.0,
    razorpay: {
      currency: 'INR',
      receipt_prefix: 'tripo_',
    },
    stripe: {
      currency: 'inr',
      automatic_payment_methods: {
        enabled: true,
      },
    },
    refund: {
      fullRefundHours: 24,
      partialRefundHours: 2,
      partialRefundPercentage: 50,
    },
  },
}));

// Mock logger
jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
}));

describe('PaymentService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('calculateTotalAmount', () => {
    it('should calculate total amount with default service fee', () => {
      const result = paymentService.calculateTotalAmount(500);
      
      expect(result.baseAmount).toBe(500);
      expect(result.serviceFee).toBe(25); // 5% of 500
      expect(result.totalAmount).toBe(525);
    });

    it('should calculate total amount with custom service fee', () => {
      const result = paymentService.calculateTotalAmount(1000, 10);
      
      expect(result.baseAmount).toBe(1000);
      expect(result.serviceFee).toBe(100); // 10% of 1000
      expect(result.totalAmount).toBe(1100);
    });

    it('should handle zero amount', () => {
      const result = paymentService.calculateTotalAmount(0);
      
      expect(result.baseAmount).toBe(0);
      expect(result.serviceFee).toBe(0);
      expect(result.totalAmount).toBe(0);
    });

    it('should round service fee to nearest integer', () => {
      const result = paymentService.calculateTotalAmount(333, 5); // 5% of 333 = 16.65
      
      expect(result.baseAmount).toBe(333);
      expect(result.serviceFee).toBe(17); // Rounded up
      expect(result.totalAmount).toBe(350);
    });
  });

  describe('calculateRefundAmount', () => {
    it('should return full refund for cancellation 24+ hours before departure', () => {
      const result = paymentService.calculateRefundAmount(500, 25);
      
      expect(result.refundAmount).toBe(500);
      expect(result.refundPercentage).toBe(100);
      expect(result.refundType).toBe('full');
    });

    it('should return full refund exactly at 24 hours before departure', () => {
      const result = paymentService.calculateRefundAmount(500, 24);
      
      expect(result.refundAmount).toBe(500);
      expect(result.refundPercentage).toBe(100);
      expect(result.refundType).toBe('full');
    });

    it('should return partial refund for cancellation between 2-24 hours before departure', () => {
      const result = paymentService.calculateRefundAmount(500, 12);
      
      expect(result.refundAmount).toBe(250); // 50% of 500
      expect(result.refundPercentage).toBe(50);
      expect(result.refundType).toBe('partial');
    });

    it('should return partial refund exactly at 2 hours before departure', () => {
      const result = paymentService.calculateRefundAmount(500, 2);
      
      expect(result.refundAmount).toBe(250);
      expect(result.refundPercentage).toBe(50);
      expect(result.refundType).toBe('partial');
    });

    it('should return no refund for cancellation less than 2 hours before departure', () => {
      const result = paymentService.calculateRefundAmount(500, 1);
      
      expect(result.refundAmount).toBe(0);
      expect(result.refundPercentage).toBe(0);
      expect(result.refundType).toBe('none');
    });

    it('should return no refund for past departure time', () => {
      const result = paymentService.calculateRefundAmount(500, -1);
      
      expect(result.refundAmount).toBe(0);
      expect(result.refundPercentage).toBe(0);
      expect(result.refundType).toBe('none');
    });

    it('should handle zero amount', () => {
      const result = paymentService.calculateRefundAmount(0, 25);
      
      expect(result.refundAmount).toBe(0);
      expect(result.refundPercentage).toBe(100);
      expect(result.refundType).toBe('full');
    });

    it('should round partial refund amount', () => {
      const result = paymentService.calculateRefundAmount(333, 12); // 50% of 333 = 166.5
      
      expect(result.refundAmount).toBe(167); // Rounded up
      expect(result.refundPercentage).toBe(50);
      expect(result.refundType).toBe('partial');
    });
  });

  describe('verifyRazorpayPayment', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
      process.env.RAZORPAY_KEY_SECRET = 'test_secret_key';
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should verify valid Razorpay payment signature', () => {
      const orderId = 'order_123';
      const paymentId = 'pay_123';
      
      // Create expected signature using the same logic
      const crypto = require('crypto');
      const expectedSignature = crypto
        .createHmac('sha256', 'test_secret_key')
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      const result = paymentService.verifyRazorpayPayment(orderId, paymentId, expectedSignature);
      
      expect(result).toBe(true);
    });

    it('should reject invalid Razorpay payment signature', () => {
      const orderId = 'order_123';
      const paymentId = 'pay_123';
      const invalidSignature = 'invalid_signature';

      const result = paymentService.verifyRazorpayPayment(orderId, paymentId, invalidSignature);
      
      expect(result).toBe(false);
    });

    it('should handle missing environment variable gracefully', () => {
      delete process.env.RAZORPAY_KEY_SECRET;

      const result = paymentService.verifyRazorpayPayment('order_123', 'pay_123', 'signature');
      
      expect(result).toBe(false);
    });
  });

  describe('verifyWebhookSignature', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
      process.env.RAZORPAY_WEBHOOK_SECRET = 'webhook_secret';
      process.env.STRIPE_WEBHOOK_SECRET = 'stripe_webhook_secret';
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should verify valid Razorpay webhook signature', () => {
      const payload = JSON.stringify({ event: 'payment.captured' });
      
      // Create expected signature
      const crypto = require('crypto');
      const expectedSignature = crypto
        .createHmac('sha256', 'webhook_secret')
        .update(payload)
        .digest('hex');

      const result = paymentService.verifyWebhookSignature(payload, expectedSignature, 'razorpay');
      
      expect(result).toBe(true);
    });

    it('should reject invalid Razorpay webhook signature', () => {
      const payload = JSON.stringify({ event: 'payment.captured' });
      const invalidSignature = 'invalid_signature';

      const result = paymentService.verifyWebhookSignature(payload, invalidSignature, 'razorpay');
      
      expect(result).toBe(false);
    });

    it('should handle Stripe webhook verification', () => {
      const { stripe } = require('../config/payment');
      const mockEvent = { type: 'payment_intent.succeeded' };
      
      stripe.webhooks.constructEvent.mockReturnValue(mockEvent);

      const result = paymentService.verifyWebhookSignature('payload', 'signature', 'stripe');
      
      expect(result).toEqual(mockEvent);
      expect(stripe.webhooks.constructEvent).toHaveBeenCalledWith(
        'payload',
        'signature',
        'stripe_webhook_secret'
      );
    });

    it('should return false for unknown gateway', () => {
      const result = paymentService.verifyWebhookSignature('payload', 'signature', 'unknown');
      
      expect(result).toBe(false);
    });
  });
});