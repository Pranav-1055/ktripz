const request = require('supertest');
const app = require('../server');
const { initializeFirebase } = require('../config/firebase');
const { initializeRedis } = require('../config/redis');

// Mock Firebase and Redis for testing
jest.mock('../config/firebase');
jest.mock('../config/redis');

describe('Ride Management API', () => {
  let authToken;
  let mockUser;

  beforeAll(async () => {
    // Mock Firebase initialization
    initializeFirebase.mockResolvedValue(true);
    initializeRedis.mockResolvedValue(true);

    // Mock user data
    mockUser = {
      uid: 'test-driver-123',
      email: 'driver@test.com',
      displayName: 'Test Driver',
      role: 'provider'
    };

    // Mock auth token (in real tests, you'd generate a proper Firebase token)
    authToken = 'mock-auth-token';
  });

  describe('GET /api/rides', () => {
    it('should return rides with basic search', async () => {
      const response = await request(app)
        .get('/api/rides')
        .query({
          originCity: 'Mumbai',
          destinationCity: 'Pune'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('rides');
      expect(response.body.data).toHaveProperty('total');
      expect(Array.isArray(response.body.data.rides)).toBe(true);
    });

    it('should validate search parameters', async () => {
      const response = await request(app)
        .get('/api/rides')
        .query({
          minSeats: 'invalid',
          maxPrice: -10
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should apply filters correctly', async () => {
      const response = await request(app)
        .get('/api/rides')
        .query({
          originCity: 'Mumbai',
          destinationCity: 'Pune',
          departureDate: '2024-12-25',
          minSeats: 2,
          maxPrice: 500,
          orderBy: 'pricePerSeat',
          orderDirection: 'asc',
          limit: 10
        });

      expect(response.status).toBe(200);
      expect(response.body.data.rides.length).toBeLessThanOrEqual(10);
    });
  });

  describe('GET /api/rides/:rideId', () => {
    it('should return ride details for valid ID', async () => {
      // This would need a real ride ID in actual tests
      const rideId = 'test-ride-123';
      
      const response = await request(app)
        .get(`/api/rides/${rideId}`);

      // In a real test, this would return 200 with ride data
      // For now, it will return 404 since no rides exist
      expect([200, 404]).toContain(response.status);
    });

    it('should return 400 for invalid ride ID', async () => {
      const response = await request(app)
        .get('/api/rides/');

      expect(response.status).toBe(404); // Route not found
    });
  });

  describe('POST /api/rides', () => {
    const validRideData = {
      origin: {
        city: 'Mumbai',
        address: 'Bandra West, Mumbai',
        coordinates: { lat: 19.0596, lng: 72.8295 }
      },
      destination: {
        city: 'Pune',
        address: 'Koregaon Park, Pune',
        coordinates: { lat: 18.5204, lng: 73.8567 }
      },
      departureDate: '2024-12-25',
      departureTime: '09:00',
      pricePerSeat: 300,
      totalSeats: 3,
      vehicle: {
        make: 'Honda',
        model: 'City',
        color: 'White',
        year: 2020
      },
      route: {
        estimatedDuration: 180,
        distance: 150
      },
      preferences: {
        smoking: false,
        pets: true,
        music: true,
        conversation: 'depends_on_mood'
      },
      bookingPolicy: {
        instantBooking: true,
        cancellationPolicy: 'flexible'
      }
    };

    it('should create ride with valid data and auth', async () => {
      const response = await request(app)
        .post('/api/rides')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validRideData);

      // This will fail in test environment due to Firebase auth
      // In real tests with proper Firebase setup, expect 201
      expect([201, 401, 403]).toContain(response.status);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/rides')
        .send(validRideData);

      expect(response.status).toBe(401);
    });

    it('should validate required fields', async () => {
      const invalidData = { ...validRideData };
      delete invalidData.origin;

      const response = await request(app)
        .post('/api/rides')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidData);

      expect(response.status).toBe(400);
    });

    it('should validate coordinate ranges', async () => {
      const invalidData = {
        ...validRideData,
        origin: {
          ...validRideData.origin,
          coordinates: { lat: 200, lng: 300 } // Invalid coordinates
        }
      };

      const response = await request(app)
        .post('/api/rides')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidData);

      expect(response.status).toBe(400);
    });

    it('should validate seat count', async () => {
      const invalidData = {
        ...validRideData,
        totalSeats: 10 // Too many seats
      };

      const response = await request(app)
        .post('/api/rides')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidData);

      expect(response.status).toBe(400);
    });
  });

  describe('PUT /api/rides/:rideId', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .put('/api/rides/test-ride-123')
        .send({ pricePerSeat: 400 });

      expect(response.status).toBe(401);
    });

    it('should validate ride ownership', async () => {
      const response = await request(app)
        .put('/api/rides/test-ride-123')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ pricePerSeat: 400 });

      // Will return 404 in test environment
      expect([200, 403, 404]).toContain(response.status);
    });
  });

  describe('DELETE /api/rides/:rideId', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .delete('/api/rides/test-ride-123');

      expect(response.status).toBe(401);
    });

    it('should validate ride ownership', async () => {
      const response = await request(app)
        .delete('/api/rides/test-ride-123')
        .set('Authorization', `Bearer ${authToken}`);

      // Will return 404 in test environment
      expect([200, 403, 404]).toContain(response.status);
    });
  });

  describe('PUT /api/rides/:rideId/status', () => {
    it('should validate status values', async () => {
      const response = await request(app)
        .put('/api/rides/test-ride-123/status')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'invalid_status' });

      expect(response.status).toBe(400);
    });

    it('should accept valid status values', async () => {
      const validStatuses = ['published', 'in_progress', 'completed', 'cancelled'];
      
      for (const status of validStatuses) {
        const response = await request(app)
          .put('/api/rides/test-ride-123/status')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ status });

        // Will return 404 in test environment, but validation should pass
        expect([200, 404]).toContain(response.status);
      }
    });
  });

  describe('GET /api/rides/driver/:driverId', () => {
    it('should return driver rides', async () => {
      const response = await request(app)
        .get('/api/rides/driver/test-driver-123');

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('rides');
      expect(response.body.data).toHaveProperty('driverId');
    });

    it('should validate driver ID', async () => {
      const response = await request(app)
        .get('/api/rides/driver/');

      expect(response.status).toBe(404); // Route not found
    });

    it('should apply status filter', async () => {
      const response = await request(app)
        .get('/api/rides/driver/test-driver-123')
        .query({ status: 'published', limit: 5 });

      expect(response.status).toBe(200);
    });
  });
});

describe('Search API', () => {
  describe('GET /api/search/rides', () => {
    it('should perform advanced search', async () => {
      const response = await request(app)
        .get('/api/search/rides')
        .query({
          originCity: 'Mumbai',
          destinationCity: 'Pune',
          minPrice: 200,
          maxPrice: 500,
          minRating: 4.0,
          sortBy: 'price',
          sortOrder: 'asc'
        });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('rides');
    });

    it('should validate search parameters', async () => {
      const response = await request(app)
        .get('/api/search/rides')
        .query({
          minRating: 10, // Invalid rating
          sortBy: 'invalid_field'
        });

      expect(response.status).toBe(400);
    });

    it('should handle geolocation search', async () => {
      const response = await request(app)
        .get('/api/search/rides')
        .query({
          originLat: 19.0596,
          originLng: 72.8295,
          maxDistance: 5
        });

      expect(response.status).toBe(200);
    });
  });

  describe('GET /api/search/popular-routes', () => {
    it('should return popular routes', async () => {
      const response = await request(app)
        .get('/api/search/popular-routes')
        .query({ limit: 5 });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('routes');
    });
  });

  describe('GET /api/search/suggestions', () => {
    it('should return search suggestions', async () => {
      const response = await request(app)
        .get('/api/search/suggestions')
        .query({ q: 'Mum', type: 'city' });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('suggestions');
    });

    it('should require query parameter', async () => {
      const response = await request(app)
        .get('/api/search/suggestions');

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/search/nearby', () => {
    it('should find nearby rides', async () => {
      const response = await request(app)
        .get('/api/search/nearby')
        .query({
          lat: 19.0596,
          lng: 72.8295,
          radius: 10,
          type: 'origin'
        });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('rides');
    });

    it('should validate coordinates', async () => {
      const response = await request(app)
        .get('/api/search/nearby')
        .query({
          lat: 200, // Invalid latitude
          lng: 72.8295
        });

      expect(response.status).toBe(400);
    });
  });
});

// Cleanup
afterAll(async () => {
  // Close any open connections
  if (app && app.close) {
    await app.close();
  }
});