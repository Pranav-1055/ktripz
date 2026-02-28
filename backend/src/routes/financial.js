const express = require('express');
const router = express.Router();
const { body, param, query, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const financialService = require('../services/financialService');
const Payout = require('../models/Payout');
const logger = require('../utils/logger');

/**
 * @route GET /api/financial/earnings
 * @desc Get provider earnings summary
 * @access Private
 */
router.get('/earnings', [
  authenticateToken,
  query('startDate').optional().isISO8601().withMessage('Invalid start date format'),
  query('endDate').optional().isISO8601().withMessage('Invalid end date format'),
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

    const providerId = req.user.uid;
    const { startDate, endDate } = req.query;

    const earnings = await financialService.calculateProviderEarnings(
      providerId,
      startDate,
      endDate
    );

    res.json({
      success: true,
      data: earnings,
    });
  } catch (error) {
    logger.error('Error fetching provider earnings', {
      error: error.message,
      providerId: req.user?.uid,
      startDate: req.query?.startDate,
      endDate: req.query?.endDate,
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'EARNINGS_FETCH_FAILED',
        message: 'Failed to fetch earnings',
        details: error.message,
      },
    });
  }
});

/**
 * @route GET /api/financial/balance
 * @desc Get available balance for payout
 * @access Private
 */
router.get('/balance', authenticateToken, async (req, res) => {
  try {
    const providerId = req.user.uid;
    const balance = await financialService.getAvailableBalance(providerId);

    res.json({
      success: true,
      data: balance,
    });
  } catch (error) {
    logger.error('Error fetching available balance', {
      error: error.message,
      providerId: req.user?.uid,
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'BALANCE_FETCH_FAILED',
        message: 'Failed to fetch available balance',
        details: error.message,
      },
    });
  }
});

/**
 * @route POST /api/financial/payout/request
 * @desc Request payout
 * @access Private
 */
router.post('/payout/request', [
  authenticateToken,
  body('amount').isFloat({ min: 100 }).withMessage('Amount must be at least ₹100'),
  body('payoutMethod').isIn(['bank_transfer', 'upi', 'wallet']).withMessage('Invalid payout method'),
  body('bankDetails').optional().isObject().withMessage('Bank details must be an object'),
  body('bankDetails.accountNumber').optional().isString().withMessage('Account number is required for bank transfer'),
  body('bankDetails.ifscCode').optional().isString().withMessage('IFSC code is required for bank transfer'),
  body('bankDetails.accountHolderName').optional().isString().withMessage('Account holder name is required'),
  body('bankDetails.upiId').optional().isString().withMessage('UPI ID is required for UPI transfer'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid payout request data',
          details: errors.array(),
        },
      });
    }

    const providerId = req.user.uid;
    const { amount, payoutMethod, bankDetails } = req.body;

    // Validate bank details based on payout method
    if (payoutMethod === 'bank_transfer') {
      if (!bankDetails?.accountNumber || !bankDetails?.ifscCode || !bankDetails?.accountHolderName) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_BANK_DETAILS',
            message: 'Account number, IFSC code, and account holder name are required for bank transfer',
          },
        });
      }
    } else if (payoutMethod === 'upi') {
      if (!bankDetails?.upiId) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_UPI_ID',
            message: 'UPI ID is required for UPI transfer',
          },
        });
      }
    }

    const payout = await financialService.requestPayout(
      providerId,
      amount,
      payoutMethod,
      bankDetails
    );

    logger.info('Payout requested successfully', {
      payoutId: payout.id,
      providerId,
      amount,
      payoutMethod,
    });

    res.json({
      success: true,
      data: payout.getSummary(),
    });
  } catch (error) {
    logger.error('Error requesting payout', {
      error: error.message,
      providerId: req.user?.uid,
      amount: req.body?.amount,
      payoutMethod: req.body?.payoutMethod,
    });

    res.status(400).json({
      success: false,
      error: {
        code: 'PAYOUT_REQUEST_FAILED',
        message: error.message,
      },
    });
  }
});

/**
 * @route GET /api/financial/payouts
 * @desc Get payout history
 * @access Private
 */
router.get('/payouts', [
  authenticateToken,
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('status').optional().isIn(['pending', 'processing', 'completed', 'failed', 'cancelled']),
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

    const providerId = req.user.uid;
    const limit = parseInt(req.query.limit) || 50;
    const statusFilter = req.query.status;

    let payouts = await Payout.findByProviderId(providerId, limit);

    // Filter by status if provided
    if (statusFilter) {
      payouts = payouts.filter(payout => payout.status === statusFilter);
    }

    // Get payout summaries
    const payoutSummaries = payouts.map(payout => payout.getSummary());

    res.json({
      success: true,
      data: {
        payouts: payoutSummaries,
        total: payoutSummaries.length,
        filters: {
          status: statusFilter,
          limit,
        },
      },
    });
  } catch (error) {
    logger.error('Error fetching payout history', {
      error: error.message,
      providerId: req.user?.uid,
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'PAYOUT_HISTORY_FETCH_FAILED',
        message: 'Failed to fetch payout history',
        details: error.message,
      },
    });
  }
});

/**
 * @route GET /api/financial/payouts/:payoutId
 * @desc Get payout details
 * @access Private
 */
router.get('/payouts/:payoutId', [
  authenticateToken,
  param('payoutId').notEmpty().withMessage('Payout ID is required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid payout ID',
          details: errors.array(),
        },
      });
    }

    const { payoutId } = req.params;
    const providerId = req.user.uid;

    const payout = await Payout.findById(payoutId);
    if (!payout) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PAYOUT_NOT_FOUND',
          message: 'Payout not found',
        },
      });
    }

    // Verify payout belongs to the provider
    if (payout.providerId !== providerId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'You can only view your own payout details',
        },
      });
    }

    res.json({
      success: true,
      data: payout.getDetails(),
    });
  } catch (error) {
    logger.error('Error fetching payout details', {
      error: error.message,
      providerId: req.user?.uid,
      payoutId: req.params?.payoutId,
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'PAYOUT_DETAILS_FETCH_FAILED',
        message: 'Failed to fetch payout details',
        details: error.message,
      },
    });
  }
});

/**
 * @route GET /api/financial/analytics
 * @desc Get financial analytics dashboard
 * @access Private
 */
router.get('/analytics', [
  authenticateToken,
  query('period').optional().isIn(['7d', '30d', '90d', '1y']).withMessage('Invalid period'),
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

    const providerId = req.user.uid;
    const period = req.query.period || '30d';

    const analytics = await financialService.getProviderAnalytics(providerId, period);

    res.json({
      success: true,
      data: analytics,
    });
  } catch (error) {
    logger.error('Error fetching financial analytics', {
      error: error.message,
      providerId: req.user?.uid,
      period: req.query?.period,
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'ANALYTICS_FETCH_FAILED',
        message: 'Failed to fetch financial analytics',
        details: error.message,
      },
    });
  }
});

/**
 * @route GET /api/financial/transactions
 * @desc Get transaction history
 * @access Private
 */
router.get('/transactions', [
  authenticateToken,
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be non-negative'),
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

    const providerId = req.user.uid;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const transactionHistory = await financialService.getTransactionHistory(
      providerId,
      limit,
      offset
    );

    res.json({
      success: true,
      data: transactionHistory,
    });
  } catch (error) {
    logger.error('Error fetching transaction history', {
      error: error.message,
      providerId: req.user?.uid,
      limit: req.query?.limit,
      offset: req.query?.offset,
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'TRANSACTION_HISTORY_FETCH_FAILED',
        message: 'Failed to fetch transaction history',
        details: error.message,
      },
    });
  }
});

/**
 * @route POST /api/financial/payout/:payoutId/cancel
 * @desc Cancel pending payout
 * @access Private
 */
router.post('/payout/:payoutId/cancel', [
  authenticateToken,
  param('payoutId').notEmpty().withMessage('Payout ID is required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid payout ID',
          details: errors.array(),
        },
      });
    }

    const { payoutId } = req.params;
    const providerId = req.user.uid;

    const payout = await Payout.findById(payoutId);
    if (!payout) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PAYOUT_NOT_FOUND',
          message: 'Payout not found',
        },
      });
    }

    // Verify payout belongs to the provider
    if (payout.providerId !== providerId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'You can only cancel your own payouts',
        },
      });
    }

    // Check if payout can be cancelled
    if (payout.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'CANNOT_CANCEL_PAYOUT',
          message: `Cannot cancel payout with status: ${payout.status}`,
        },
      });
    }

    await payout.updateStatus('cancelled');

    logger.info('Payout cancelled', {
      payoutId: payout.id,
      providerId,
      amount: payout.amount,
    });

    res.json({
      success: true,
      data: {
        payoutId: payout.id,
        status: 'cancelled',
        cancelledAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Error cancelling payout', {
      error: error.message,
      providerId: req.user?.uid,
      payoutId: req.params?.payoutId,
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'PAYOUT_CANCELLATION_FAILED',
        message: 'Failed to cancel payout',
        details: error.message,
      },
    });
  }
});

module.exports = router;
