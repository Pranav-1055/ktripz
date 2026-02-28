const express = require('express');
const router = express.Router();
const { body, param, query, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const paymentService = require('../services/paymentService');
const Payment = require('../models/Payment');
const Booking = require('../models/Booking');
const Ride = require('../models/Ride');
const logger = require('../utils/logger');

/**
 * @route POST /api/payments/initiate
 * @desc Initiate payment for a booking
 * @access Private
 */
router.post('/initiate', [
  authenticateToken,
  body('bookingId').notEmpty().withMessage('Booking ID is required'),
  body('gateway').isIn(['razorpay', 'stripe']).withMessage('Invalid payment gateway'),
  body('paymentMethod').optional().isString(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input data',
          details: errors.array(),
        },
      });
    }

    const { bookingId, gateway, paymentMethod } = req.body;
    const userId = req.user.uid;

    // Get booking details
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'BOOKING_NOT_FOUND',
          message: 'Booking not found',
        },
      });
    }

    // Verify booking belongs to user
    if (booking.passengerId !== userId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'You can only pay for your own bookings',
        },
      });
    }

    // Check if booking is in correct status
    if (booking.status !== 'confirmed') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_BOOKING_STATUS',
          message: 'Booking must be confirmed to process payment',
        },
      });
    }

    // Check if payment already exists
    const existingPayments = await Payment.findByBookingId(bookingId);
    const completedPayment = existingPayments.find(p => p.status === 'completed');
    if (completedPayment) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'PAYMENT_ALREADY_COMPLETED',
          message: 'Payment for this booking is already completed',
        },
      });
    }

    // Calculate payment amount
    const pricing = paymentService.calculateTotalAmount(booking.pricing.totalAmount);

    let paymentOrder;
    if (gateway === 'razorpay') {
      paymentOrder = await paymentService.createRazorpayOrder(
        pricing.totalAmount,
        'INR',
        `booking_${bookingId}`
      );
    } else if (gateway === 'stripe') {
      paymentOrder = await paymentService.createStripePaymentIntent(
        pricing.totalAmount,
        'inr',
        {
          bookingId,
          userId,
          rideId: booking.rideId,
        }
      );
    }

    // Create payment record
    const payment = new Payment({
      bookingId,
      userId,
      rideId: booking.rideId,
      amount: pricing.totalAmount,
      currency: gateway === 'razorpay' ? 'INR' : 'inr',
      gateway,
      gatewayOrderId: paymentOrder.orderId || paymentOrder.paymentIntentId,
      status: 'pending',
      paymentMethod,
      pricing: {
        baseAmount: pricing.baseAmount,
        serviceFee: pricing.serviceFee,
        totalAmount: pricing.totalAmount,
      },
      metadata: {
        bookingId,
        rideId: booking.rideId,
      },
    });

    await payment.save();

    logger.info('Payment initiated', {
      paymentId: payment.id,
      bookingId,
      userId,
      gateway,
      amount: pricing.totalAmount,
    });

    res.json({
      success: true,
      data: {
        paymentId: payment.id,
        gateway,
        orderId: paymentOrder.orderId,
        paymentIntentId: paymentOrder.paymentIntentId,
        clientSecret: paymentOrder.clientSecret,
        amount: pricing.totalAmount,
        currency: payment.currency,
        pricing,
      },
    });
  } catch (error) {
    logger.error('Error initiating payment', {
      error: error.message,
      userId: req.user?.uid,
      bookingId: req.body?.bookingId,
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'PAYMENT_INITIATION_FAILED',
        message: 'Failed to initiate payment',
        details: error.message,
      },
    });
  }
});

/**
 * @route POST /api/payments/verify
 * @desc Verify payment status
 * @access Private
 */
router.post('/verify', [
  authenticateToken,
  body('paymentId').notEmpty().withMessage('Payment ID is required'),
  body('gateway').isIn(['razorpay', 'stripe']).withMessage('Invalid payment gateway'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input data',
          details: errors.array(),
        },
      });
    }

    const { paymentId, gateway } = req.body;
    const userId = req.user.uid;

    // Get payment record
    const payment = await Payment.findById(paymentId);
    if (!payment) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PAYMENT_NOT_FOUND',
          message: 'Payment not found',
        },
      });
    }

    // Verify payment belongs to user
    if (payment.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'You can only verify your own payments',
        },
      });
    }

    let verificationResult = { success: false };

    if (gateway === 'razorpay') {
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
      
      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_RAZORPAY_DATA',
            message: 'Missing Razorpay verification data',
          },
        });
      }

      const isValid = paymentService.verifyRazorpayPayment(
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature
      );

      if (isValid) {
        await payment.updateStatus('completed', {
          gatewayPaymentId: razorpay_payment_id,
        });
        verificationResult = { success: true };
      }
    } else if (gateway === 'stripe') {
      const { payment_intent_id } = req.body;
      
      if (!payment_intent_id) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_STRIPE_DATA',
            message: 'Missing Stripe payment intent ID',
          },
        });
      }

      const stripeResult = await paymentService.retrieveStripePaymentIntent(payment_intent_id);
      
      if (stripeResult.success && stripeResult.paymentIntent.status === 'succeeded') {
        await payment.updateStatus('completed', {
          gatewayPaymentId: payment_intent_id,
          paymentMethod: stripeResult.paymentIntent.payment_method_types[0],
        });
        verificationResult = { success: true };
      }
    }

    if (verificationResult.success) {
      // Update booking status to paid
      const booking = await Booking.findById(payment.bookingId);
      if (booking) {
        booking.payment.status = 'completed';
        booking.payment.paidAt = new Date().toISOString();
        await booking.save();
      }

      logger.info('Payment verified successfully', {
        paymentId: payment.id,
        bookingId: payment.bookingId,
        userId,
        gateway,
        amount: payment.amount,
      });

      res.json({
        success: true,
        data: {
          paymentId: payment.id,
          status: 'completed',
          amount: payment.amount,
          currency: payment.currency,
          verifiedAt: new Date().toISOString(),
        },
      });
    } else {
      await payment.updateStatus('failed');
      
      res.status(400).json({
        success: false,
        error: {
          code: 'PAYMENT_VERIFICATION_FAILED',
          message: 'Payment verification failed',
        },
      });
    }
  } catch (error) {
    logger.error('Error verifying payment', {
      error: error.message,
      userId: req.user?.uid,
      paymentId: req.body?.paymentId,
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'PAYMENT_VERIFICATION_ERROR',
        message: 'Failed to verify payment',
        details: error.message,
      },
    });
  }
});

/**
 * @route POST /api/payments/refund
 * @desc Process refund for a payment
 * @access Private
 */
router.post('/refund', [
  authenticateToken,
  body('paymentId').notEmpty().withMessage('Payment ID is required'),
  body('reason').optional().isString(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input data',
          details: errors.array(),
        },
      });
    }

    const { paymentId, reason } = req.body;
    const userId = req.user.uid;

    // Get payment record
    const payment = await Payment.findById(paymentId);
    if (!payment) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PAYMENT_NOT_FOUND',
          message: 'Payment not found',
        },
      });
    }

    // Get booking to verify user access
    const booking = await Booking.findById(payment.bookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'BOOKING_NOT_FOUND',
          message: 'Associated booking not found',
        },
      });
    }

    // Verify user can request refund (passenger or driver)
    if (booking.passengerId !== userId && booking.driverId !== userId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'You can only request refunds for your own bookings',
        },
      });
    }

    // Check if payment is completed
    if (payment.status !== 'completed') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PAYMENT_STATUS',
          message: 'Only completed payments can be refunded',
        },
      });
    }

    // Get ride details to calculate refund amount
    const ride = await Ride.findById(payment.rideId);
    if (!ride) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'RIDE_NOT_FOUND',
          message: 'Associated ride not found',
        },
      });
    }

    // Calculate refund amount based on cancellation policy
    const departureTime = new Date(`${ride.departureDate} ${ride.departureTime}`);
    const currentTime = new Date();
    const hoursBeforeDeparture = (departureTime - currentTime) / (1000 * 60 * 60);

    const refundCalculation = paymentService.calculateRefundAmount(
      payment.amount,
      hoursBeforeDeparture
    );

    if (refundCalculation.refundAmount === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'NO_REFUND_ELIGIBLE',
          message: 'No refund is eligible based on the cancellation policy',
          details: {
            hoursBeforeDeparture: Math.round(hoursBeforeDeparture * 100) / 100,
            refundPolicy: refundCalculation,
          },
        },
      });
    }

    // Process refund through payment gateway
    let refundResult;
    if (payment.gateway === 'razorpay') {
      refundResult = await paymentService.processRazorpayRefund(
        payment.gatewayPaymentId,
        refundCalculation.refundAmount,
        reason
      );
    } else if (payment.gateway === 'stripe') {
      refundResult = await paymentService.processStripeRefund(
        payment.gatewayPaymentId,
        refundCalculation.refundAmount,
        reason
      );
    }

    // Add refund record to payment
    await payment.addRefund({
      ...refundResult,
      reason,
      refundType: refundCalculation.refundType,
      originalAmount: payment.amount,
    });

    // Update booking status
    booking.status = 'cancelled';
    booking.cancelledAt = new Date().toISOString();
    booking.cancellationReason = reason || 'Refund requested';
    await booking.save();

    logger.info('Refund processed successfully', {
      paymentId: payment.id,
      bookingId: payment.bookingId,
      userId,
      refundAmount: refundCalculation.refundAmount,
      refundType: refundCalculation.refundType,
    });

    res.json({
      success: true,
      data: {
        paymentId: payment.id,
        refundId: refundResult.refundId,
        refundAmount: refundCalculation.refundAmount,
        refundPercentage: refundCalculation.refundPercentage,
        refundType: refundCalculation.refundType,
        status: refundResult.status,
        processedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Error processing refund', {
      error: error.message,
      userId: req.user?.uid,
      paymentId: req.body?.paymentId,
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'REFUND_PROCESSING_FAILED',
        message: 'Failed to process refund',
        details: error.message,
      },
    });
  }
});

/**
 * @route GET /api/payments/history
 * @desc Get payment history for user
 * @access Private
 */
router.get('/history', [
  authenticateToken,
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('status').optional().isIn(['pending', 'completed', 'failed', 'refunded', 'partially_refunded']),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid query parameters',
          details: errors.array(),
        },
      });
    }

    const userId = req.user.uid;
    const limit = parseInt(req.query.limit) || 50;
    const statusFilter = req.query.status;

    // Get user's payments
    let payments = await Payment.findByUserId(userId, limit);

    // Filter by status if provided
    if (statusFilter) {
      payments = payments.filter(payment => payment.status === statusFilter);
    }

    // Get payment summaries
    const paymentSummaries = payments.map(payment => payment.getSummary());

    res.json({
      success: true,
      data: {
        payments: paymentSummaries,
        total: paymentSummaries.length,
        filters: {
          status: statusFilter,
          limit,
        },
      },
    });
  } catch (error) {
    logger.error('Error fetching payment history', {
      error: error.message,
      userId: req.user?.uid,
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'PAYMENT_HISTORY_FETCH_FAILED',
        message: 'Failed to fetch payment history',
        details: error.message,
      },
    });
  }
});

/**
 * @route GET /api/payments/:paymentId
 * @desc Get payment details
 * @access Private
 */
router.get('/:paymentId', [
  authenticateToken,
  param('paymentId').notEmpty().withMessage('Payment ID is required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid payment ID',
          details: errors.array(),
        },
      });
    }

    const { paymentId } = req.params;
    const userId = req.user.uid;

    // Get payment record
    const payment = await Payment.findById(paymentId);
    if (!payment) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PAYMENT_NOT_FOUND',
          message: 'Payment not found',
        },
      });
    }

    // Verify payment belongs to user or user is the driver
    const booking = await Booking.findById(payment.bookingId);
    if (!booking || (booking.passengerId !== userId && booking.driverId !== userId)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'You can only view your own payment details',
        },
      });
    }

    res.json({
      success: true,
      data: payment.getDetails(),
    });
  } catch (error) {
    logger.error('Error fetching payment details', {
      error: error.message,
      userId: req.user?.uid,
      paymentId: req.params?.paymentId,
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'PAYMENT_DETAILS_FETCH_FAILED',
        message: 'Failed to fetch payment details',
        details: error.message,
      },
    });
  }
});

/**
 * @route POST /api/payments/webhook/razorpay
 * @desc Handle Razorpay webhooks
 * @access Public (but verified)
 */
router.post('/webhook/razorpay', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const payload = req.body;

    // Verify webhook signature
    const isValid = paymentService.verifyWebhookSignature(payload, signature, 'razorpay');
    if (!isValid) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_WEBHOOK_SIGNATURE',
          message: 'Invalid webhook signature',
        },
      });
    }

    const event = JSON.parse(payload);
    logger.info('Razorpay webhook received', {
      event: event.event,
      paymentId: event.payload?.payment?.entity?.id,
    });

    // Handle different webhook events
    switch (event.event) {
      case 'payment.captured':
        // Payment was successfully captured
        const paymentEntity = event.payload.payment.entity;
        const payment = await Payment.findByGatewayOrderId(paymentEntity.order_id);
        
        if (payment && payment.status === 'pending') {
          await payment.updateStatus('completed', {
            gatewayPaymentId: paymentEntity.id,
          });
        }
        break;

      case 'payment.failed':
        // Payment failed
        const failedPaymentEntity = event.payload.payment.entity;
        const failedPayment = await Payment.findByGatewayOrderId(failedPaymentEntity.order_id);
        
        if (failedPayment && failedPayment.status === 'pending') {
          await failedPayment.updateStatus('failed');
        }
        break;

      default:
        logger.info('Unhandled Razorpay webhook event', { event: event.event });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Error handling Razorpay webhook', {
      error: error.message,
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'WEBHOOK_PROCESSING_FAILED',
        message: 'Failed to process webhook',
      },
    });
  }
});

/**
 * @route POST /api/payments/webhook/stripe
 * @desc Handle Stripe webhooks
 * @access Public (but verified)
 */
router.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const signature = req.headers['stripe-signature'];
    const payload = req.body;

    // Verify webhook signature and construct event
    const event = paymentService.verifyWebhookSignature(payload, signature, 'stripe');
    if (!event) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_WEBHOOK_SIGNATURE',
          message: 'Invalid webhook signature',
        },
      });
    }

    logger.info('Stripe webhook received', {
      event: event.type,
      paymentIntentId: event.data?.object?.id,
    });

    // Handle different webhook events
    switch (event.type) {
      case 'payment_intent.succeeded':
        // Payment was successfully completed
        const paymentIntent = event.data.object;
        const payment = await Payment.findByGatewayOrderId(paymentIntent.id);
        
        if (payment && payment.status === 'pending') {
          await payment.updateStatus('completed', {
            gatewayPaymentId: paymentIntent.id,
          });
        }
        break;

      case 'payment_intent.payment_failed':
        // Payment failed
        const failedPaymentIntent = event.data.object;
        const failedPayment = await Payment.findByGatewayOrderId(failedPaymentIntent.id);
        
        if (failedPayment && failedPayment.status === 'pending') {
          await failedPayment.updateStatus('failed');
        }
        break;

      default:
        logger.info('Unhandled Stripe webhook event', { event: event.type });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Error handling Stripe webhook', {
      error: error.message,
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'WEBHOOK_PROCESSING_FAILED',
        message: 'Failed to process webhook',
      },
    });
  }
});

module.exports = router;
