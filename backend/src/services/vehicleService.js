const Vehicle = require('../models/Vehicle');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

class VehicleService {
  constructor() {
    this.setupFileUpload();
  }

  setupFileUpload() {
    // Configure multer for file uploads
    const storage = multer.diskStorage({
      destination: async (req, file, cb) => {
        const uploadPath = path.join(__dirname, '../../uploads/vehicles');
        try {
          await fs.mkdir(uploadPath, { recursive: true });
          cb(null, uploadPath);
        } catch (error) {
          cb(error);
        }
      },
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, `${req.user.uid}-${uniqueSuffix}${ext}`);
      }
    });

    const fileFilter = (req, file, cb) => {
      const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
      if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Invalid file type. Only JPEG, PNG, and PDF files are allowed.'), false);
      }
    };

    this.upload = multer({
      storage,
      limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
      },
      fileFilter
    });
  }

  async createVehicle(ownerId, vehicleData) {
    try {
      // Check if license plate already exists
      const existingVehicle = await Vehicle.findOne({
        'details.licensePlate': vehicleData.details.licensePlate.toUpperCase()
      });

      if (existingVehicle) {
        throw new Error('A vehicle with this license plate already exists');
      }

      const vehicle = new Vehicle({
        ownerId,
        ...vehicleData
      });

      await vehicle.save();
      return vehicle;
    } catch (error) {
      throw error;
    }
  }

  async getVehiclesByOwner(ownerId, options = {}) {
    try {
      return await Vehicle.findByOwner(ownerId, options);
    } catch (error) {
      throw error;
    }
  }

  async getVehicleById(vehicleId, ownerId) {
    try {
      const vehicle = await Vehicle.findById(vehicleId);
      if (!vehicle || vehicle.ownerId !== ownerId) {
        throw new Error('Vehicle not found');
      }
      return vehicle;
    } catch (error) {
      throw error;
    }
  }

  async updateVehicle(vehicleId, ownerId, updateData) {
    try {
      const vehicle = await Vehicle.findById(vehicleId);
      if (!vehicle || vehicle.ownerId !== ownerId) {
        throw new Error('Vehicle not found');
      }

      // Check license plate uniqueness if being updated
      if (updateData.details?.licensePlate) {
        const existingVehicle = await Vehicle.findOne({
          'details.licensePlate': updateData.details.licensePlate.toUpperCase(),
          _id: { $ne: vehicleId }
        });

        if (existingVehicle) {
          throw new Error('A vehicle with this license plate already exists');
        }
      }

      // Apply updates (deep merge appropriately)
      // Since specific fields are passed, we need to map them carefully or use Object.assign for top levels
      if (updateData.details) Object.assign(vehicle.details, updateData.details);
      if (updateData.amenities) vehicle.amenities = updateData.amenities;
      if (updateData.specifications) Object.assign(vehicle.specifications, updateData.specifications);
      if (updateData.status) vehicle.status = updateData.status;

      await vehicle.save();
      return vehicle;
    } catch (error) {
      throw error;
    }
  }

  async deleteVehicle(vehicleId, ownerId) {
    try {
      const vehicle = await Vehicle.findById(vehicleId);
      if (!vehicle || vehicle.ownerId !== ownerId) {
        throw new Error('Vehicle not found');
      }

      // Check if vehicle is being used in active rides (TODO: Impl in RideService)

      await Vehicle.findByIdAndDelete(vehicleId);

      // Clean up uploaded files
      await this.cleanupVehicleFiles(vehicle);

      return { message: 'Vehicle deleted successfully' };
    } catch (error) {
      throw error;
    }
  }

  async uploadDocument(vehicleId, ownerId, documentType, file) {
    try {
      const vehicle = await Vehicle.findById(vehicleId);
      if (!vehicle || vehicle.ownerId !== ownerId) {
        throw new Error('Vehicle not found');
      }

      const validDocTypes = ['registration', 'insurance', 'inspection', 'driverLicense'];
      if (!validDocTypes.includes(documentType)) {
        throw new Error('Invalid document type');
      }

      // Store file path relative to uploads directory
      const documentUrl = `/uploads/vehicles/${file.filename}`;

      if (!vehicle.documents) vehicle.documents = {};

      vehicle.documents[documentType] = {
        url: documentUrl,
        uploadedAt: new Date(),
        verified: false
      };

      await vehicle.save();

      return {
        documentType,
        url: documentUrl,
        uploadedAt: vehicle.documents[documentType].uploadedAt
      };
    } catch (error) {
      throw error;
    }
  }

  async uploadVehiclePhoto(vehicleId, ownerId, photoType, file) {
    try {
      const vehicle = await Vehicle.findById(vehicleId);
      if (!vehicle || vehicle.ownerId !== ownerId) {
        throw new Error('Vehicle not found');
      }

      const validPhotoTypes = ['exterior_front', 'exterior_back', 'exterior_side', 'interior', 'dashboard', 'trunk'];
      if (!validPhotoTypes.includes(photoType)) {
        throw new Error('Invalid photo type');
      }

      const photoUrl = `/uploads/vehicles/${file.filename}`;

      // Remove existing photo of same type
      if (!vehicle.photos) vehicle.photos = [];
      vehicle.photos = vehicle.photos.filter(photo => photo.type !== photoType);

      // Add new photo
      vehicle.photos.push({
        url: photoUrl,
        type: photoType,
        uploadedAt: new Date(),
        verified: false
      });

      await vehicle.save();

      return {
        photoType,
        url: photoUrl,
        uploadedAt: new Date()
      };
    } catch (error) {
      throw error;
    }
  }

  async submitForVerification(vehicleId, ownerId) {
    try {
      const vehicle = await Vehicle.findById(vehicleId);
      if (!vehicle || vehicle.ownerId !== ownerId) {
        throw new Error('Vehicle not found');
      }

      // Check if all required documents are uploaded
      const requiredDocs = ['registration', 'insurance', 'inspection'];
      const missingDocs = requiredDocs.filter(doc => !vehicle.documents[doc]?.url);

      if (missingDocs.length > 0) {
        throw new Error(`Missing required documents: ${missingDocs.join(', ')}`);
      }

      vehicle.verification = vehicle.verification || {};
      vehicle.verification.status = 'in_review';
      vehicle.verification.submittedAt = new Date();

      await vehicle.save();

      return {
        message: 'Vehicle submitted for verification',
        status: vehicle.verification.status
      };
    } catch (error) {
      throw error;
    }
  }

  async getVehicleStats(ownerId) {
    try {
      const vehicles = await Vehicle.findByOwner(ownerId);

      const stats = {
        total: vehicles.length,
        verified: vehicles.filter(v => v.verification.status === 'verified').length,
        pending: vehicles.filter(v => v.verification.status === 'pending').length,
        inReview: vehicles.filter(v => v.verification.status === 'in_review').length,
        rejected: vehicles.filter(v => v.verification.status === 'rejected').length,
        active: vehicles.filter(v => v.status === 'active').length,
        documentCompletion: {
          complete: vehicles.filter(v => v.documentCompletionPercentage === 100).length,
          partial: vehicles.filter(v => v.documentCompletionPercentage > 0 && v.documentCompletionPercentage < 100).length,
          none: vehicles.filter(v => v.documentCompletionPercentage === 0).length
        }
      };

      return stats;
    } catch (error) {
      throw error;
    }
  }

  async getExpiringDocuments(ownerId, daysAhead = 30) {
    try {
      const vehicles = await Vehicle.findByOwner(ownerId);
      const expiringDocs = [];
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() + daysAhead);

      vehicles.forEach(vehicle => {
        const nextExpiring = vehicle.getNextExpiringDocument();
        if (nextExpiring && new Date(nextExpiring.expiryDate) <= cutoffDate) {
          expiringDocs.push({
            vehicleId: vehicle.id,
            vehicleName: `${vehicle.details.make} ${vehicle.details.model}`,
            licensePlate: vehicle.details.licensePlate,
            documentType: nextExpiring.type,
            expiryDate: nextExpiring.expiryDate,
            daysUntilExpiry: Math.ceil((new Date(nextExpiring.expiryDate) - new Date()) / (1000 * 60 * 60 * 24))
          });
        }
      });

      return expiringDocs.sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
    } catch (error) {
      throw error;
    }
  }

  async cleanupVehicleFiles(vehicle) {
    try {
      const filesToDelete = [];

      // Collect document files
      if (vehicle.documents) {
        Object.values(vehicle.documents).forEach(doc => {
          if (doc?.url) {
            filesToDelete.push(path.join(__dirname, '../../', doc.url));
          }
        });
      }

      // Collect photo files
      if (vehicle.photos) {
        vehicle.photos.forEach(photo => {
          if (photo.url) {
            filesToDelete.push(path.join(__dirname, '../../', photo.url));
          }
        });
      }

      // Delete files
      await Promise.all(
        filesToDelete.map(async (filePath) => {
          try {
            await fs.unlink(filePath);
          } catch (error) {
            console.warn(`Failed to delete file: ${filePath}`, error.message);
          }
        })
      );
    } catch (error) {
      console.error('Error cleaning up vehicle files:', error);
    }
  }

  // Admin methods for verification workflow
  async verifyVehicle(vehicleId, adminId, verificationData) {
    try {
      const vehicle = await Vehicle.findById(vehicleId);
      if (!vehicle) {
        throw new Error('Vehicle not found');
      }

      const { status, notes, documentVerifications } = verificationData;

      vehicle.verification.status = status;
      vehicle.verification.reviewedAt = new Date();
      vehicle.verification.reviewedBy = adminId;
      vehicle.verification.notes = notes;

      // Update individual document verifications
      if (documentVerifications) {
        Object.entries(documentVerifications).forEach(([docType, verification]) => {
          if (vehicle.documents && vehicle.documents[docType]) {
            vehicle.documents[docType].verified = verification.verified;
            vehicle.documents[docType].verifiedAt = verification.verified ? new Date() : null;
            vehicle.documents[docType].rejectionReason = verification.rejectionReason || null;
          }
        });
      }

      await vehicle.save();
      return vehicle;
    } catch (error) {
      throw error;
    }
  }

  async getPendingVerifications() {
    try {
      const db = require('../config/firebase').getFirestore();
      const snapshot = await db.collection('vehicles')
        .where('verification.status', '==', 'in_review')
        .orderBy('verification.submittedAt', 'asc')
        .get();

      // Populate owner is tricky in NoSQL. 
      // We'll return vehicles and let frontend fetch users or do it here efficiently?
      // For now, just return vehicles to avoid N+1 query complexity in this snippet
      const vehicles = [];
      snapshot.forEach(doc => {
        vehicles.push(new Vehicle({ id: doc.id, ...doc.data() }));
      });

      return vehicles;
    } catch (error) {
      throw error;
    }
  }
}

module.exports = new VehicleService();