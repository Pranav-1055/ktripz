const { getDatabase } = require('../config/firebase');

// Helper function to get database instance
const getDB = () => getDatabase();

class Payment {
  constructor(data) {
    this.id = data.id || null;
    this.bookingId = data.bookingId;
    this.userId = data.userId;
    this.rideId = data.rideId;
    this.amount = data.amount;
    this.currency = data.currency || 'INR';
    this.gateway = data.gateway; // 'razorpay' or 'stripe'
    this.gatewayOrderId = data.gatewayOrderId;
    this.gatewayPaymentId = data.gatewayPaymentId;
    this.status = data.status || 'pending'; // pending, completed, failed, refunded, partially_refunded
    this.paymentMethod = data.paymentMethod;
    this.pricing = data.pricing || {};
    this.refunds = data.refunds || [];
    this.metadata = data.metadata || {};
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || new Date().toISOString();
  }

  /**
   * Save payment to Firebase
   */
  async save() {
    try {
      const paymentData = {
        bookingId: this.bookingId,
        userId: this.userId,
        rideId: this.rideId,
        amount: this.amount,
        currency: this.currency,
        gateway: this.gateway,
        gatewayOrderId: this.gatewayOrderId,
        gatewayPaymentId: this.gatewayPaymentId,
        status: this.status,
        paymentMethod: this.paymentMethod,
        pricing: this.pricing,
        refunds: this.refunds,
        metadata: this.metadata,
        updatedAt: new Date().toISOString(),
      };

      if (this.id) {
        // Update existing payment
        await getDB().ref(`payments/${this.id}`).update(paymentData);
      } else {
        // Create new payment
        paymentData.createdAt = this.createdAt;
        const newPaymentRef = await getDB().ref('payments').push(paymentData);
        this.id = newPaymentRef.key;
      }

      return this;
    } catch (error) {
      throw new Error(`Failed to save payment: ${error.message}`);
    }
  }

  /**
   * Find payment by ID
   */
  static async findById(paymentId) {
    try {
      const snapshot = await getDB().ref(`payments/${paymentId}`).once('value');
      const paymentData = snapshot.val();
      
      if (!paymentData) {
        return null;
      }

      return new Payment({ id: paymentId, ...paymentData });
    } catch (error) {
      throw new Error(`Failed to find payment: ${error.message}`);
    }
  }

  /**
   * Find payment by booking ID
   */
  static async findByBookingId(bookingId) {
    try {
      const snapshot = await getDB().ref('payments')
        .orderByChild('bookingId')
        .equalTo(bookingId)
        .once('value');
      
      const paymentsData = snapshot.val();
      if (!paymentsData) {
        return [];
      }

      return Object.keys(paymentsData).map(id => 
        new Payment({ id, ...paymentsData[id] })
      );
    } catch (error) {
      throw new Error(`Failed to find payments by booking ID: ${error.message}`);
    }
  }

  /**
   * Find payment by gateway order ID
   */
  static async findByGatewayOrderId(gatewayOrderId) {
    try {
      const snapshot = await getDB().ref('payments')
        .orderByChild('gatewayOrderId')
        .equalTo(gatewayOrderId)
        .once('value');
      
      const paymentsData = snapshot.val();
      if (!paymentsData) {
        return null;
      }

      const paymentId = Object.keys(paymentsData)[0];
      return new Payment({ id: paymentId, ...paymentsData[paymentId] });
    } catch (error) {
      throw new Error(`Failed to find payment by gateway order ID: ${error.message}`);
    }
  }

  /**
   * Find payments by user ID
   */
  static async findByUserId(userId, limit = 50) {
    try {
      const snapshot = await getDB().ref('payments')
        .orderByChild('userId')
        .equalTo(userId)
        .limitToLast(limit)
        .once('value');
      
      const paymentsData = snapshot.val();
      if (!paymentsData) {
        return [];
      }

      return Object.keys(paymentsData)
        .map(id => new Payment({ id, ...paymentsData[id] }))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } catch (error) {
      throw new Error(`Failed to find payments by user ID: ${error.message}`);
    }
  }

  /**
   * Update payment status
   */
  async updateStatus(status, additionalData = {}) {
    try {
      this.status = status;
      this.updatedAt = new Date().toISOString();
      
      // Merge additional data
      Object.assign(this, additionalData);
      
      await this.save();
      return this;
    } catch (error) {
      throw new Error(`Failed to update payment status: ${error.message}`);
    }
  }

  /**
   * Add refund record
   */
  async addRefund(refundData) {
    try {
      const refund = {
        id: refundData.refundId,
        amount: refundData.amount,
        status: refundData.status,
        reason: refundData.reason || 'requested_by_customer',
        processedAt: new Date().toISOString(),
        gateway: refundData.gateway,
        ...refundData,
      };

      this.refunds.push(refund);
      
      // Update payment status based on refund amount
      const totalRefunded = this.refunds
        .filter(r => r.status === 'succeeded' || r.status === 'processed')
        .reduce((sum, r) => sum + r.amount, 0);
      
      if (totalRefunded >= this.amount) {
        this.status = 'refunded';
      } else if (totalRefunded > 0) {
        this.status = 'partially_refunded';
      }

      await this.save();
      return this;
    } catch (error) {
      throw new Error(`Failed to add refund record: ${error.message}`);
    }
  }

  /**
   * Get payment summary
   */
  getSummary() {
    const totalRefunded = this.refunds
      .filter(r => r.status === 'succeeded' || r.status === 'processed')
      .reduce((sum, r) => sum + r.amount, 0);

    return {
      id: this.id,
      bookingId: this.bookingId,
      amount: this.amount,
      currency: this.currency,
      status: this.status,
      gateway: this.gateway,
      paymentMethod: this.paymentMethod,
      totalRefunded,
      netAmount: this.amount - totalRefunded,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  /**
   * Get detailed payment information
   */
  getDetails() {
    return {
      id: this.id,
      bookingId: this.bookingId,
      userId: this.userId,
      rideId: this.rideId,
      amount: this.amount,
      currency: this.currency,
      gateway: this.gateway,
      gatewayOrderId: this.gatewayOrderId,
      gatewayPaymentId: this.gatewayPaymentId,
      status: this.status,
      paymentMethod: this.paymentMethod,
      pricing: this.pricing,
      refunds: this.refunds,
      metadata: this.metadata,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}

module.exports = Payment;
