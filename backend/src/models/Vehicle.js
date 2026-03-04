const { getFirestore } = require('../config/firebase');
const logger = require('../utils/logger');

class Vehicle {
  constructor(data) {
    this.id = data.id || data._id || null;
    this.ownerId = data.ownerId;
    this.details = {
      make: data.details?.make || '',
      model: data.details?.model || '',
      year: data.details?.year,
      color: data.details?.color || '',
      licensePlate: data.details?.licensePlate || '',
      seats: data.details?.seats || 1,
      fuelType: data.details?.fuelType || 'petrol',
      transmission: data.details?.transmission || 'manual'
    };
    this.amenities = Array.isArray(data.amenities) ? data.amenities : [];
    this.documents = data.documents || {
      registration: { verified: false },
      insurance: { verified: false },
      inspection: { verified: false },
      driverLicense: { verified: false }
    };
    this.verification = data.verification || {
      status: 'pending',
      verificationLevel: 'basic'
    };
    this.photos = Array.isArray(data.photos) ? data.photos : [];
    this.specifications = data.specifications || {
      maxBaggage: 2,
      rules: []
    };
    this.usage = data.usage || {
      totalRides: 0,
      totalDistance: 0,
      averageRating: 0
    };
    this.status = data.status || 'active';
    this.createdAt = data.createdAt ? new Date(data.createdAt) : new Date();
    this.updatedAt = data.updatedAt ? new Date(data.updatedAt) : new Date();

    // Add _id alias for compatibility
    this._id = this.id;
  }

  // Helper getters
  get isFullyVerified() {
    return this.verification.status === 'verified' &&
      this.documents.registration?.verified &&
      this.documents.insurance?.verified &&
      this.documents.inspection?.verified;
  }

  get documentCompletionPercentage() {
    const requiredDocs = ['registration', 'insurance', 'inspection'];
    const uploadedDocs = requiredDocs.filter(doc => this.documents[doc]?.url);
    return Math.round((uploadedDocs.length / requiredDocs.length) * 100);
  }

  canBeUsedForRides() {
    return this.status === 'active' &&
      this.verification.status === 'verified' &&
      this.isFullyVerified;
  }

  getNextExpiringDocument() {
    const docsWithExpiry = ['insurance', 'inspection'];
    let nextExpiring = null;
    let earliestDate = null;

    docsWithExpiry.forEach(docType => {
      const doc = this.documents[docType];
      if (doc?.expiryDate) {
        const expiryDate = new Date(doc.expiryDate);
        if (!earliestDate || expiryDate < earliestDate) {
          earliestDate = expiryDate;
          nextExpiring = { type: docType, expiryDate };
        }
      }
    });

    return nextExpiring;
  }

  /**
   * Save vehicle to Firestore
   */
  async save() {
    try {
      const db = getFirestore();

      const vehicleData = {
        ownerId: this.ownerId,
        details: this.details,
        amenities: this.amenities,
        documents: this.documents,
        verification: this.verification,
        photos: this.photos,
        specifications: this.specifications,
        usage: this.usage,
        status: this.status,
        updatedAt: new Date().toISOString()
      };

      // Sanitize undefined/dates
      const sanitize = (obj) => JSON.parse(JSON.stringify(obj));

      let vehicleRef;
      if (this.id) {
        vehicleRef = db.collection('vehicles').doc(this.id);
        await vehicleRef.update(sanitize(vehicleData));
      } else {
        vehicleData.createdAt = new Date().toISOString();
        vehicleRef = await db.collection('vehicles').add(sanitize(vehicleData));
        this.id = vehicleRef.id;
        this._id = this.id;
      }

      logger.info(`Vehicle saved: ${this.id}`);
      return this;
    } catch (error) {
      logger.error('Error saving vehicle:', error);
      throw error;
    }
  }

  /**
   * Find vehicle by ID
   */
  static async findById(id) {
    try {
      if (!id) return null;
      const db = getFirestore();
      const doc = await db.collection('vehicles').doc(id).get();

      if (!doc.exists) return null;

      return new Vehicle({ id: doc.id, ...doc.data() });
    } catch (error) {
      logger.error('Error finding vehicle by ID:', error);
      throw error;
    }
  }

  /**
   * Find one vehicle matching query
   * Simplified support for 'details.licensePlate', '_id', 'ownerId'
   */
  static async findOne(query) {
    try {
      const db = getFirestore();
      let firestoreQuery = db.collection('vehicles');

      if (query._id) {
        return this.findById(query._id);
      }

      if (query['details.licensePlate']) {
        firestoreQuery = firestoreQuery.where('details.licensePlate', '==', query['details.licensePlate']);
      }

      if (query.ownerId) {
        firestoreQuery = firestoreQuery.where('ownerId', '==', query.ownerId);
      }

      // Handle exclusion (e.g., unique license plate check)
      // Note: Firestore doesn't support $ne efficiently in the same way. 
      // Logic for excluding generic ID needs to be handled by caller or filter in memory if result set is small.
      // But for findOne, we usually check existence.

      const snapshot = await firestoreQuery.limit(1).get();
      if (snapshot.empty) return null;

      const doc = snapshot.docs[0];
      // If we need to filter out by ID (for update)
      if (query._id && query._id.$ne && doc.id === query._id.$ne) {
        return null;
      }

      return new Vehicle({ id: doc.id, ...doc.data() });
    } catch (error) {
      logger.error('Error finding one vehicle:', error);
      throw error;
    }
  }

  /**
   * Find vehicles by owner
   */
  static async findByOwner(ownerId, options = {}) {
    try {
      const db = getFirestore();
      let query = db.collection('vehicles').where('ownerId', '==', ownerId);

      if (options.verified) {
        query = query.where('verification.status', '==', 'verified');
      }

      if (options.active) {
        query = query.where('status', '==', 'active');
      }

      const snapshot = await query.get();
      const vehicles = [];

      snapshot.forEach(doc => {
        vehicles.push(new Vehicle({ id: doc.id, ...doc.data() }));
      });

      return vehicles;
    } catch (error) {
      logger.error('Error finding vehicles by owner:', error);
      throw error;
    }
  }

  /**
   * Delete vehicle by ID
   */
  static async findByIdAndDelete(id) {
    try {
      const db = getFirestore();
      await db.collection('vehicles').doc(id).delete();
      return { message: 'Vehicle deleted' };
    } catch (error) {
      logger.error('Error deleting vehicle:', error);
      throw error;
    }
  }

  /**
   * Find generic (for complex queries, usually not needed if we stick to basic ops)
   */
  static async find(query) {
    // Basic implementation for stats
    const db = getFirestore();
    let ref = db.collection('vehicles');

    if (query.ownerId) {
      ref = ref.where('ownerId', '==', query.ownerId);
    }
    if (query['verification.status']) {
      ref = ref.where('verification.status', '==', query['verification.status']);
    }
    if (query['status']) {
      ref = ref.where('status', '==', query['status']);
    }

    const snapshot = await ref.get();
    const vehicles = [];
    snapshot.forEach(doc => {
      vehicles.push(new Vehicle({ id: doc.id, ...doc.data() }));
    });
    return vehicles;
  }
}

module.exports = Vehicle;