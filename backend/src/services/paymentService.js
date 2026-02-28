const { razorpay, stripe, config } = require('../config/payment');
const logger = require('../utils/logger');
const crypto = require('crypto');

// Simple UUID v4 generator to avoid module issues
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

class PaymentService {
  /**
   * Calculate total amount including service fee
   */
  calculateTotalAmount(baseAmount, serviceFeePercentage = config.serviceFeePercentage) {
    const serviceFee = Math.round((baseAmount * serviceFeePercentage) / 100);
    const totalAmount = baseAmount + serviceFee;
    
    return {
      baseAmount,
      serviceFee,
      totalAmount,
    };
  }

  /**
   * Create payment order using Razorpay
   */
  async createRazorpayOrder(amount, currency = config.razorpay.currency, receipt = null) {
    try {
      const orderData = {
        amount: amount * 100, // Razorpay expects amount in paise
        currency,
        receipt: receipt || `${config.razorpay.receipt_prefix}${generateUUID()}`,
        payment_capture: 1, // Auto capture payment
      };

      const order = await razorpay.orders.create(orderData);
      
      logger.info('Razorpay order created', {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
      });

      return {
        success: true,
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        receipt: order.receipt,
        gateway: 'razorpay',
      };
    } catch (error) {
      logger.error('Error creating Razorpay order', {
        error: error.message,
        amount,
        currency,
      });
      
      throw new Error(`Failed to create Razorpay order: ${error.message}`);
    }
  }

  /**
   * Create payment intent using Stripe
   */
  async createStripePaymentIntent(amount, currency = config.stripe.currency, metadata = {}) {
    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount * 100, // Stripe expects amount in smallest currency unit
        currency,
        automatic_payment_methods: config.stripe.automatic_payment_methods,
        metadata: {
          ...metadata,
          service: 'tripo',
        },
      });

      logger.info('Stripe payment intent created', {
        paymentIntentId: paymentIntent.id,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
      });

      return {
        success: true,
        paymentIntentId: paymentIntent.id,
        clientSecret: paymentIntent.client_secret,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        gateway: 'stripe',
      };
    } catch (error) {
      logger.error('Error creating Stripe payment intent', {
        error: error.message,
        amount,
        currency,
      });
      
      throw new Error(`Failed to create Stripe payment intent: ${error.message}`);
    }
  }

  /**
   * Verify Razorpay payment signature
   */
  verifyRazorpayPayment(orderId, paymentId, signature) {
    try {
      const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      const isValid = expectedSignature === signature;
      
      logger.info('Razorpay payment verification', {
        orderId,
        paymentId,
        isValid,
      });

      return isValid;
    } catch (error) {
      logger.error('Error verifying Razorpay payment', {
        error: error.message,
        orderId,
        paymentId,
      });
      
      return false;
    }
  }

  /**
   * Retrieve Stripe payment intent
   */
  async retrieveStripePaymentIntent(paymentIntentId) {
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      
      logger.info('Stripe payment intent retrieved', {
        paymentIntentId,
        status: paymentIntent.status,
        amount: paymentIntent.amount,
      });

      return {
        success: true,
        paymentIntent,
      };
    } catch (error) {
      logger.error('Error retrieving Stripe payment intent', {
        error: error.message,
        paymentIntentId,
      });
      
      throw new Error(`Failed to retrieve Stripe payment intent: ${error.message}`);
    }
  }

  /**
   * Process refund for Razorpay payment
   */
  async processRazorpayRefund(paymentId, amount, reason = 'requested_by_customer') {
    try {
      const refund = await razorpay.payments.refund(paymentId, {
        amount: amount * 100, // Amount in paise
        speed: 'normal',
        notes: {
          reason,
          service: 'tripo',
        },
      });

      logger.info('Razorpay refund processed', {
        refundId: refund.id,
        paymentId,
        amount: refund.amount,
        status: refund.status,
      });

      return {
        success: true,
        refundId: refund.id,
        amount: refund.amount,
        status: refund.status,
        gateway: 'razorpay',
      };
    } catch (error) {
      logger.error('Error processing Razorpay refund', {
        error: error.message,
        paymentId,
        amount,
      });
      
      throw new Error(`Failed to process Razorpay refund: ${error.message}`);
    }
  }

  /**
   * Process refund for Stripe payment
   */
  async processStripeRefund(paymentIntentId, amount, reason = 'requested_by_customer') {
    try {
      const refund = await stripe.refunds.create({
        payment_intent: paymentIntentId,
        amount: amount * 100, // Amount in smallest currency unit
        reason,
        metadata: {
          service: 'tripo',
        },
      });

      logger.info('Stripe refund processed', {
        refundId: refund.id,
        paymentIntentId,
        amount: refund.amount,
        status: refund.status,
      });

      return {
        success: true,
        refundId: refund.id,
        amount: refund.amount,
        status: refund.status,
        gateway: 'stripe',
      };
    } catch (error) {
      logger.error('Error processing Stripe refund', {
        error: error.message,
        paymentIntentId,
        amount,
      });
      
      throw new Error(`Failed to process Stripe refund: ${error.message}`);
    }
  }

  /**
   * Calculate refund amount based on cancellation policy
   */
  calculateRefundAmount(originalAmount, hoursBeforeDeparture) {
    const { fullRefundHours, partialRefundHours, partialRefundPercentage } = config.refund;
    
    if (hoursBeforeDeparture >= fullRefundHours) {
      return {
        refundAmount: originalAmount,
        refundPercentage: 100,
        refundType: 'full',
      };
    } else if (hoursBeforeDeparture >= partialRefundHours) {
      const refundAmount = Math.round((originalAmount * partialRefundPercentage) / 100);
      return {
        refundAmount,
        refundPercentage: partialRefundPercentage,
        refundType: 'partial',
      };
    } else {
      return {
        refundAmount: 0,
        refundPercentage: 0,
        refundType: 'none',
      };
    }
  }

  /**
   * Get payment gateway webhooks signature verification
   */
  verifyWebhookSignature(payload, signature, gateway) {
    try {
      if (gateway === 'razorpay') {
        const expectedSignature = crypto
          .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
          .update(payload)
          .digest('hex');
        
        return expectedSignature === signature;
      } else if (gateway === 'stripe') {
        const event = stripe.webhooks.constructEvent(
          payload,
          signature,
          process.env.STRIPE_WEBHOOK_SECRET
        );
        return event;
      }
      
      return false;
    } catch (error) {
      logger.error('Error verifying webhook signature', {
        error: error.message,
        gateway,
      });
      
      return false;
    }
  }
}

module.exports = new PaymentService();