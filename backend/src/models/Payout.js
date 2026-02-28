const { getDatabase } = require('../config/firebase');

// Helper function to get database instance
const getDB = () => getDatabase();

class Payout {
  constructor(data) {
    this.id = data.id || null;
    this.providerId = data.providerId;
    this.amount = data.amount;
    this.currency = data.currency || 'INR';
    this.status = data.status || 'pending'; // pending, processing, completed, failed, cancelled
    this.payoutMethod = data.payoutMethod; // bank_transfer, upi, wallet
    this.bankDetails = data.bankDetails || {};
    this.transactionIds = data.transactionIds || []; // Array of payment IDs included in this payout
    this.platformFee = data.platformFee || 0;
    this.netAmount = data.netAmount || 0;
    this.requestedAt = data.requestedAt || new Date().toISOString();
    this.processedAt = data.processedAt || null;
    this.completedAt = data.completedAt || null;
    this.failureReason = data.failureReason || null;
    this.metadata = data.metadata || {};
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || new Date().toISOString();
  }

  /**
   * Save payout to Firebase
   */
  async save() {
    try {
      const payoutData = {
        providerId: this.providerId,
        amount: this.amount,
        currency: this.currency,
        status: this.status,
        payoutMethod: this.payoutMethod,
        bankDetails: this.bankDetails,
        transactionIds: this.transactionIds,
        platformFee: this.platformFee,
        netAmount: this.netAmount,
        requestedAt: this.requestedAt,
        processedAt: this.processedAt,
        completedAt: this.completedAt,
        failureReason: this.failureReason,
        metadata: this.metadata,
        updatedAt: new Date().toISOString(),
      };

      if (this.id) {
        // Update existing payout
        await getDB().ref(`payouts/${this.id}`).update(payoutData);
      } else {
        // Create new payout
        payoutData.createdAt = this.createdAt;
        const newPayoutRef = await getDB().ref('payouts').push(payoutData);
        this.id = newPayoutRef.key;
      }

      return this;
    } catch (error) {
      throw new Error(`Failed to save payout: ${error.message}`);
    }
  }

  /**
   * Find payout by ID
   */
  static async findById(payoutId) {
    try {
      const snapshot = await getDB().ref(`payouts/${payoutId}`).once('value');
      const payoutData = snapshot.val();
      
      if (!payoutData) {
        return null;
      }

      return new Payout({ id: payoutId, ...payoutData });
    } catch (error) {
      throw new Error(`Failed to find payout: ${error.message}`);
    }
  }

  /**
   * Find payouts by provider ID
   */
  static async findByProviderId(providerId, limit = 50) {
    try {
      const snapshot = await getDB().ref('payouts')
        .orderByChild('providerId')
        .equalTo(providerId)
        .limitToLast(limit)
        .once('value');
      
      const payoutsData = snapshot.val();
      if (!payoutsData) {
        return [];
      }

      return Object.keys(payoutsData)
        .map(id => new Payout({ id, ...payoutsData[id] }))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } catch (error) {
      throw new Error(`Failed to find payouts by provider ID: ${error.message}`);
    }
  }

  /**
   * Find payouts by status
   */
  static async findByStatus(status, limit = 100) {
    try {
      const snapshot = await getDB().ref('payouts')
        .orderByChild('status')
        .equalTo(status)
        .limitToLast(limit)
        .once('value');
      
      const payoutsData = snapshot.val();
      if (!payoutsData) {
        return [];
      }

      return Object.keys(payoutsData)
        .map(id => new Payout({ id, ...payoutsData[id] }))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } catch (error) {
      throw new Error(`Failed to find payouts by status: ${error.message}`);
    }
  }

  /**
   * Update payout status
   */
  async updateStatus(status, additionalData = {}) {
    try {
      this.status = status;
      this.updatedAt = new Date().toISOString();
      
      // Set timestamps based on status
      if (status === 'processing' && !this.processedAt) {
        this.processedAt = new Date().toISOString();
      } else if (status === 'completed' && !this.completedAt) {
        this.completedAt = new Date().toISOString();
      }
      
      // Merge additional data
      Object.assign(this, additionalData);
      
      await this.save();
      return this;
    } catch (error) {
      throw new Error(`Failed to update payout status: ${error.message}`);
    }
  }

  /**
   * Get payout summary
   */
  getSummary() {
    return {
      id: this.id,
      providerId: this.providerId,
      amount: this.amount,
      currency: this.currency,
      status: this.status,
      payoutMethod: this.payoutMethod,
      platformFee: this.platformFee,
      netAmount: this.netAmount,
      requestedAt: this.requestedAt,
      processedAt: this.processedAt,
      completedAt: this.completedAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  /**
   * Get detailed payout information
   */
  getDetails() {
    return {
      id: this.id,
      providerId: this.providerId,
      amount: this.amount,
      currency: this.currency,
      status: this.status,
      payoutMethod: this.payoutMethod,
      bankDetails: this.bankDetails,
      transactionIds: this.transactionIds,
      platformFee: this.platformFee,
      netAmount: this.netAmount,
      requestedAt: this.requestedAt,
      processedAt: this.processedAt,
      completedAt: this.completedAt,
      failureReason: this.failureReason,
      metadata: this.metadata,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}

module.exports = Payout;
