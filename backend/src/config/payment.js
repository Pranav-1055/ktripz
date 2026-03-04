const Razorpay = require('razorpay');
const Stripe = require('stripe');

// Initialize Razorpay (only if credentials are provided)
let razorpay = null;
if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
  razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
}

// Initialize Stripe (only if credentials are provided)
let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = Stripe(process.env.STRIPE_SECRET_KEY);
}

module.exports = {
  razorpay,
  stripe,
  
  // Payment gateway configuration
  config: {
    defaultGateway: process.env.DEFAULT_PAYMENT_GATEWAY || 'razorpay',
    currency: process.env.PAYMENT_CURRENCY || 'INR',
    serviceFeePercentage: parseFloat(process.env.SERVICE_FEE_PERCENTAGE) || 5.0,
    
    // Razorpay configuration
    razorpay: {
      currency: 'INR',
      receipt_prefix: 'tripo_',
    },
    
    // Stripe configuration
    stripe: {
      currency: 'inr',
      automatic_payment_methods: {
        enabled: true,
      },
    },
    
    // Refund policies
    refund: {
      fullRefundHours: 24, // Full refund if cancelled 24 hours before
      partialRefundHours: 2, // Partial refund if cancelled 2 hours before
      partialRefundPercentage: 50, // 50% refund for partial refunds
    },
  },
};