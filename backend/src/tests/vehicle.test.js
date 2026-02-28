const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../server');
const Vehicle = require('../models/Vehicle');
const vehicleService = require('../services/vehicleService');

// Mock Firebase Admin
jest.mock('firebase-admin', () => ({
  auth: () => ({
    verifyIdToken: jest.fn().mockResolvedValue({
      uid: 'test-user-id',
      email: 'test@example.com'
    })
  })
}));

describe('Vehicle Management System', () => {
  let authToken;
  let testVehicleId;

  beforeAll(async () => {
    // Connect to test database
    await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/tripo-test');
    
    // Mock auth token
    authToken = 'mock-firebase-token';
  });

  afterAll(async () => {
    // Clean up test data
    await Vehicle.deleteMany({});
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    // Clean up before each test
    await Vehicle.deleteMany({});
  });

  describe('Vehicle Registration', () => {
    test('should register a new vehicle successfully', async () => {
      const vehicleData = {
        details: {
          make: 'Toyota',
          model: 'Camry',
          year: 2020,
          color: 'White',
          licensePlate: 'ABC-1234',
          seats: 5,
          fuelType: 'petrol',
          transmission: 'automatic'
        },
        amenities: ['air_conditioning', 'bluetooth'],
        specifications: {
          description: 'Comfortable sedan for city rides'
        }
      };

      const response = await request(app)
        .post('/api/vehicles')
        .set('Authorization', `Bearer ${authToken}`)
        .send(vehicleData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.details.make).toBe('Toyota');
      expect(response.body.data.details.licensePlate).toBe('ABC-1234');
      expect(response.body.data.verification.status).toBe('pending');

      testVehicleId = response.body.data._id;
    });

    test('should reject duplicate license plate', async () => {
      // Create first vehicle
      const vehicleData1 = {
        details: {
          make: 'Toyota',
          model: 'Camry',
          year: 2020,
          color: 'White',
          licensePlate: 'ABC-1234',
          seats: 5
        }
      };

      await request(app)
        .post('/api/vehicles')
        .set('Authorization', `Bearer ${authToken}`)
        .send(vehicleData1)
        .expect(201);

      // Try to create second vehicle with same license plate
      const vehicleData2 = {
        details: {
          make: 'Honda',
          model: 'Civic',
          year: 2021,
          color: 'Black',
          licensePlate: 'ABC-1234',
          seats: 5
        }
      };

      const response = await request(app)
        .post('/api/vehicles')
        .set('Authorization', `Bearer ${authToken}`)
        .send(vehicleData2)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('license plate already exists');
    });

    test('should validate required fields', async () => {
      const invalidVehicleData = {
        details: {
          make: 'Toyota',
          // Missing required fields
        }
      };

      const response = await request(app)
        .post('/api/vehicles')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidVehicleData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.errors).toBeDefined();
    });
  });

  describe('Vehicle Retrieval', () => {
    beforeEach(async () => {
      // Create test vehicle
      const vehicle = new Vehicle({
        ownerId: 'test-user-id',
        details: {
          make: 'Toyota',
          model: 'Camry',
          year: 2020,
          color: 'White',
          licensePlate: 'TEST-123',
          seats: 5
        }
      });
      const savedVehicle = await vehicle.save();
      testVehicleId = savedVehicle._id;
    });

    test('should get user vehicles', async () => {
      const response = await request(app)
        .get('/api/vehicles')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].details.make).toBe('Toyota');
    });

    test('should get specific vehicle', async () => {
      const response = await request(app)
        .get(`/api/vehicles/${testVehicleId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.details.make).toBe('Toyota');
    });

    test('should return 404 for non-existent vehicle', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      
      const response = await request(app)
        .get(`/api/vehicles/${fakeId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Vehicle not found');
    });
  });

  describe('Vehicle Update', () => {
    beforeEach(async () => {
      const vehicle = new Vehicle({
        ownerId: 'test-user-id',
        details: {
          make: 'Toyota',
          model: 'Camry',
          year: 2020,
          color: 'White',
          licensePlate: 'TEST-123',
          seats: 5
        }
      });
      const savedVehicle = await vehicle.save();
      testVehicleId = savedVehicle._id;
    });

    test('should update vehicle details', async () => {
      const updateData = {
        details: {
          color: 'Black'
        },
        amenities: ['air_conditioning', 'wifi']
      };

      const response = await request(app)
        .put(`/api/vehicles/${testVehicleId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.details.color).toBe('Black');
      expect(response.body.data.amenities).toContain('air_conditioning');
    });
  });

  describe('Document Upload', () => {
    beforeEach(async () => {
      const vehicle = new Vehicle({
        ownerId: 'test-user-id',
        details: {
          make: 'Toyota',
          model: 'Camry',
          year: 2020,
          color: 'White',
          licensePlate: 'TEST-123',
          seats: 5
        }
      });
      const savedVehicle = await vehicle.save();
      testVehicleId = savedVehicle._id;
    });

    test('should upload vehicle document', async () => {
      // Create a mock file buffer
      const mockFile = Buffer.from('mock file content');

      const response = await request(app)
        .post(`/api/vehicles/${testVehicleId}/documents`)
        .set('Authorization', `Bearer ${authToken}`)
        .field('documentType', 'registration')
        .attach('document', mockFile, 'registration.pdf')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.documentType).toBe('registration');
      expect(response.body.data.url).toBeDefined();
    });

    test('should reject invalid document type', async () => {
      const mockFile = Buffer.from('mock file content');

      const response = await request(app)
        .post(`/api/vehicles/${testVehicleId}/documents`)
        .set('Authorization', `Bearer ${authToken}`)
        .field('documentType', 'invalid-type')
        .attach('document', mockFile, 'document.pdf')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid document type');
    });
  });

  describe('Vehicle Service', () => {
    test('should create vehicle through service', async () => {
      const vehicleData = {
        details: {
          make: 'Honda',
          model: 'Civic',
          year: 2021,
          color: 'Blue',
          licensePlate: 'XYZ-789',
          seats: 5
        }
      };

      const vehicle = await vehicleService.createVehicle('test-user-id', vehicleData);

      expect(vehicle.details.make).toBe('Honda');
      expect(vehicle.ownerId).toBe('test-user-id');
      expect(vehicle.verification.status).toBe('pending');
    });

    test('should get vehicle stats', async () => {
      // Create test vehicles with different statuses
      await Vehicle.create([
        {
          ownerId: 'test-user-id',
          details: { make: 'Toyota', model: 'Camry', year: 2020, color: 'White', licensePlate: 'TEST-1', seats: 5 },
          verification: { status: 'verified' }
        },
        {
          ownerId: 'test-user-id',
          details: { make: 'Honda', model: 'Civic', year: 2021, color: 'Blue', licensePlate: 'TEST-2', seats: 5 },
          verification: { status: 'pending' }
        }
      ]);

      const stats = await vehicleService.getVehicleStats('test-user-id');

      expect(stats.total).toBe(2);
      expect(stats.verified).toBe(1);
      expect(stats.pending).toBe(1);
    });

    test('should check vehicle can be used for rides', async () => {
      const vehicle = new Vehicle({
        ownerId: 'test-user-id',
        details: {
          make: 'Toyota',
          model: 'Camry',
          year: 2020,
          color: 'White',
          licensePlate: 'TEST-123',
          seats: 5
        },
        verification: { status: 'verified' },
        status: 'active',
        documents: {
          registration: { verified: true },
          insurance: { verified: true },
          inspection: { verified: true }
        }
      });

      expect(vehicle.canBeUsedForRides()).toBe(true);

      // Test with unverified vehicle
      vehicle.verification.status = 'pending';
      expect(vehicle.canBeUsedForRides()).toBe(false);
    });
  });

  describe('Vehicle Verification Workflow', () => {
    beforeEach(async () => {
      const vehicle = new Vehicle({
        ownerId: 'test-user-id',
        details: {
          make: 'Toyota',
          model: 'Camry',
          year: 2020,
          color: 'White',
          licensePlate: 'TEST-123',
          seats: 5
        },
        documents: {
          registration: { url: '/uploads/reg.pdf' },
          insurance: { url: '/uploads/ins.pdf' },
          inspection: { url: '/uploads/insp.pdf' }
        }
      });
      const savedVehicle = await vehicle.save();
      testVehicleId = savedVehicle._id;
    });

    test('should submit vehicle for verification', async () => {
      const response = await request(app)
        .post(`/api/vehicles/${testVehicleId}/submit-verification`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('in_review');
    });

    test('should reject submission without required documents', async () => {
      // Create vehicle without documents
      const incompleteVehicle = new Vehicle({
        ownerId: 'test-user-id',
        details: {
          make: 'Honda',
          model: 'Civic',
          year: 2021,
          color: 'Blue',
          licensePlate: 'INCOMPLETE',
          seats: 5
        }
      });
      const savedVehicle = await incompleteVehicle.save();

      const response = await request(app)
        .post(`/api/vehicles/${savedVehicle._id}/submit-verification`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Missing required documents');
    });
  });
});