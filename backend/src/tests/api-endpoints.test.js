const request = require('supertest');
const express = require('express');
const authRoutes = require('../routes/auth');
const rideRoutes = require('../routes/rides');
const bookingRoutes = require('../routes/bookings');
const userRoutes = require('../routes/users');
const vehicleRoutes = require('../routes/vehicles');
const searchRoutes = require('../routes/search');
const reviewRoutes = require('../routes/reviews');

// Create test app with all routes
const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/rides', rideRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/users', userRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/reviews', reviewRoutes);

// Mock authentication middleware
jest.mock('../middleware/auth', () => ({
  authenticateToken: (req, res, next) => {
    req.user = { uid: 'test-uid', email: 'test@example.com', role: 'both' };
    next();
  },
  optionalAuth: (req, res, next) => {
    req.user = { uid: 'test-uid', email: 'test@example.com', role: 'both' };
    next();
  },
  requireRole: (roles) => (req, res, next) => {
    if (roles.includes(req.user.role) || req.user.role === 'both') {
      next();
    } else {
      res.status(403).json({ success: false, error: { code: 'INSUFFICIENT_PERMISSIONS' } });
    }
  },
  requireProvider: (req, res, next) => {
    if (req.user.role === 'provider' || req.user.role === 'transport_provider' || req.user.role === 'both') {
      return next();
    }
    return res.status(403).json({ success: false, error: { code: 'INSUFFICIENT_PERMISSIONS' } });
  },
  requirePassenger: (req, res, next) => {
    if (req.user.role === 'passenger' || req.user.role === 'both') {
      return next();
    }
    return res.status(403).json({ success: false, error: { code: 'INSUFFICIENT_PERMISSIONS' } });
  },
  requireAdmin: (req, res, next) => {
    if (req.user.role === 'admin') {
      return next();
    }
    return res.status(403).json({ success: false, error: { code: 'INSUFFICIENT_PERMISSIONS' } });
  }
}));

describe('API Endpoints Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Authentication Endpoints', () => {
    describe('POST /api/auth/verify-token', () => {
      test('should verify Firebase token successfully', async () => {
        const response = await request(app)
          .post('/api/auth/verify-token')
          .send({ token: 'valid-firebase-token' })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('user');
        expect(response.body.data).toHaveProperty('session');
      });

      test('should handle invalid token', async () => {
        const response = await request(app)
          .post('/api/auth/verify-token')
          .send({ token: 'invalid-token' })
          .expect(401);

        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('INVALID_TOKEN');
      });

      test('should validate request body', async () => {
        const response = await request(app)
          .post('/api/auth/verify-token')
          .send({}) // Missing token
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('VALIDATION_ERROR');
      });
    });

    describe('GET /api/auth/profile', () => {
      test('should get user profile', async () => {
        const response = await request(app)
          .get('/api/auth/profile')
          .set('Authorization', 'Bearer valid-token')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('user');
      });

      test('should require authentication', async () => {
        const response = await request(app)
          .get('/api/auth/profile')
          .expect(401);

        expect(response.body.success).toBe(false);
      });
    });
  });

  describe('Ride Management Endpoints', () => {
    const mockRideData = {
      origin: {
        city: 'Mumbai',
        address: 'Bandra West',
        coordinates: { lat: 19.0596, lng: 72.8295 }
      },
      destination: {
        city: 'Pune',
        address: 'Koregaon Park',
        coordinates: { lat: 18.5204, lng: 73.8567 }
      },
      departureDate: '2024-12-31',
      departureTime: '10:00',
      pricePerSeat: 500,
      totalSeats: 4,
      vehicle: {
        make: 'Honda',
        model: 'City',
        color: 'White',
        licensePlate: 'MH01AB1234'
      }
    };

    describe('POST /api/rides', () => {
      test('should create ride successfully', async () => {
        const response = await request(app)
          .post('/api/rides')
          .set('Authorization', 'Bearer provider-token')
          .send(mockRideData)
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data.ride).toHaveProperty('id');
        expect(response.body.data.ride.origin.city).toBe('Mumbai');
        expect(response.body.data.ride.destination.city).toBe('Pune');
      });

      test('should validate ride data', async () => {
        const invalidRideData = {
          ...mockRideData,
          pricePerSeat: -100 // Invalid negative price
        };

        const response = await request(app)
          .post('/api/rides')
          .set('Authorization', 'Bearer provider-token')
          .send(invalidRideData)
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('VALIDATION_ERROR');
      });

      test('should require provider role', async () => {
        // Mock user with passenger role only
        jest.doMock('../middleware/auth', () => ({
          authenticateToken: (req, res, next) => {
            req.user = { uid: 'test-uid', role: 'passenger' };
            next();
          },
          requireRole: (roles) => (req, res, next) => {
            if (!roles.includes(req.user.role)) {
              return res.status(403).json({ success: false, error: { code: 'INSUFFICIENT_PERMISSIONS' } });
            }
            next();
          }
        }));

        const response = await request(app)
          .post('/api/rides')
          .set('Authorization', 'Bearer passenger-token')
          .send(mockRideData)
          .expect(403);

        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
      });
    });

    describe('GET /api/rides', () => {
      test('should get rides with filters', async () => {
        const response = await request(app)
          .get('/api/rides')
          .query({
            origin: 'Mumbai',
            destination: 'Pune',
            date: '2024-12-31',
            passengers: 2
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('rides');
        expect(Array.isArray(response.body.data.rides)).toBe(true);
      });

      test('should support pagination', async () => {
        const response = await request(app)
          .get('/api/rides')
          .query({ page: 1, limit: 10 })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('pagination');
        expect(response.body.data.pagination).toHaveProperty('page', 1);
        expect(response.body.data.pagination).toHaveProperty('limit', 10);
      });
    });

    describe('GET /api/rides/:rideId', () => {
      test('should get ride details', async () => {
        const rideId = 'ride-123';
        
        const response = await request(app)
          .get(`/api/rides/${rideId}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('ride');
        expect(response.body.data.ride).toHaveProperty('id', rideId);
      });

      test('should handle non-existent ride', async () => {
        const response = await request(app)
          .get('/api/rides/non-existent-id')
          .expect(404);

        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('RIDE_NOT_FOUND');
      });
    });

    describe('PUT /api/rides/:rideId', () => {
      test('should update ride successfully', async () => {
        const rideId = 'ride-123';
        const updateData = {
          pricePerSeat: 550,
          departureTime: '11:00'
        };

        const response = await request(app)
          .put(`/api/rides/${rideId}`)
          .set('Authorization', 'Bearer provider-token')
          .send(updateData)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.ride.pricePerSeat).toBe(550);
        expect(response.body.data.ride.departureTime).toBe('11:00');
      });

      test('should only allow ride owner to update', async () => {
        const response = await request(app)
          .put('/api/rides/other-user-ride')
          .set('Authorization', 'Bearer unauthorized-token')
          .send({ pricePerSeat: 600 })
          .expect(403);

        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('UNAUTHORIZED');
      });
    });

    describe('DELETE /api/rides/:rideId', () => {
      test('should cancel ride successfully', async () => {
        const rideId = 'ride-123';

        const response = await request(app)
          .delete(`/api/rides/${rideId}`)
          .set('Authorization', 'Bearer provider-token')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe('Ride cancelled successfully');
      });

      test('should handle rides with existing bookings', async () => {
        const response = await request(app)
          .delete('/api/rides/ride-with-bookings')
          .set('Authorization', 'Bearer provider-token')
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('RIDE_HAS_BOOKINGS');
      });
    });
  });

  describe('Booking Management Endpoints', () => {
    const mockBookingData = {
      rideId: 'ride-123',
      seatsBooked: 2,
      pickupPoint: {
        name: 'Bandra Station',
        coordinates: { lat: 19.0596, lng: 72.8295 }
      }
    };

    describe('POST /api/bookings', () => {
      test('should create booking successfully', async () => {
        const response = await request(app)
          .post('/api/bookings')
          .set('Authorization', 'Bearer passenger-token')
          .send(mockBookingData)
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data.booking).toHaveProperty('id');
        expect(response.body.data.booking.seatsBooked).toBe(2);
      });

      test('should validate seat availability', async () => {
        const invalidBookingData = {
          ...mockBookingData,
          seatsBooked: 10 // More than available
        };

        const response = await request(app)
          .post('/api/bookings')
          .set('Authorization', 'Bearer passenger-token')
          .send(invalidBookingData)
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('INSUFFICIENT_SEATS');
      });

      test('should prevent self-booking', async () => {
        const response = await request(app)
          .post('/api/bookings')
          .set('Authorization', 'Bearer driver-token')
          .send({ ...mockBookingData, rideId: 'own-ride-123' })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('CANNOT_BOOK_OWN_RIDE');
      });
    });

    describe('GET /api/bookings', () => {
      test('should get user bookings', async () => {
        const response = await request(app)
          .get('/api/bookings')
          .set('Authorization', 'Bearer passenger-token')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('bookings');
        expect(Array.isArray(response.body.data.bookings)).toBe(true);
      });

      test('should filter bookings by status', async () => {
        const response = await request(app)
          .get('/api/bookings')
          .query({ status: 'confirmed' })
          .set('Authorization', 'Bearer passenger-token')
          .expect(200);

        expect(response.body.success).toBe(true);
      });
    });

    describe('PUT /api/bookings/:bookingId', () => {
      test('should update booking successfully', async () => {
        const bookingId = 'booking-123';
        const updateData = { seatsBooked: 1 };

        const response = await request(app)
          .put(`/api/bookings/${bookingId}`)
          .set('Authorization', 'Bearer passenger-token')
          .send(updateData)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.booking.seatsBooked).toBe(1);
      });

      test('should only allow booking owner to update', async () => {
        const response = await request(app)
          .put('/api/bookings/other-user-booking')
          .set('Authorization', 'Bearer unauthorized-token')
          .send({ seatsBooked: 1 })
          .expect(403);

        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('UNAUTHORIZED');
      });
    });

    describe('DELETE /api/bookings/:bookingId', () => {
      test('should cancel booking successfully', async () => {
        const bookingId = 'booking-123';

        const response = await request(app)
          .delete(`/api/bookings/${bookingId}`)
          .set('Authorization', 'Bearer passenger-token')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe('Booking cancelled successfully');
      });

      test('should handle cancellation policy', async () => {
        const response = await request(app)
          .delete('/api/bookings/late-cancellation-booking')
          .set('Authorization', 'Bearer passenger-token')
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('CANCELLATION_NOT_ALLOWED');
      });
    });
  });

  describe('User Management Endpoints', () => {
    describe('GET /api/users/:userId', () => {
      test('should get user profile', async () => {
        const userId = 'user-123';

        const response = await request(app)
          .get(`/api/users/${userId}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('user');
        expect(response.body.data.user).toHaveProperty('id', userId);
      });

      test('should handle non-existent user', async () => {
        const response = await request(app)
          .get('/api/users/non-existent-id')
          .expect(404);

        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('USER_NOT_FOUND');
      });
    });

    describe('PUT /api/users/:userId/verify', () => {
      test('should update verification status', async () => {
        const userId = 'user-123';
        const verificationData = {
          verificationType: 'identity',
          status: 'verified'
        };

        const response = await request(app)
          .put(`/api/users/${userId}/verify`)
          .set('Authorization', 'Bearer admin-token')
          .send(verificationData)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe('Verification status updated');
      });

      test('should require admin privileges', async () => {
        const response = await request(app)
          .put('/api/users/user-123/verify')
          .set('Authorization', 'Bearer regular-user-token')
          .send({ verificationType: 'identity', status: 'verified' })
          .expect(403);

        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
      });
    });
  });

  describe('Vehicle Management Endpoints', () => {
    const mockVehicleData = {
      details: {
        make: 'Honda',
        model: 'City',
        year: 2020,
        color: 'White',
        licensePlate: 'MH01AB1234',
        seats: 4
      },
      amenities: ['AC', 'Music']
    };

    describe('POST /api/vehicles', () => {
      test('should register vehicle successfully', async () => {
        const response = await request(app)
          .post('/api/vehicles')
          .set('Authorization', 'Bearer provider-token')
          .send(mockVehicleData)
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data.vehicle).toHaveProperty('id');
        expect(response.body.data.vehicle.details.make).toBe('Honda');
      });

      test('should validate vehicle data', async () => {
        const invalidVehicleData = {
          ...mockVehicleData,
          details: {
            ...mockVehicleData.details,
            seats: 0 // Invalid seat count
          }
        };

        const response = await request(app)
          .post('/api/vehicles')
          .set('Authorization', 'Bearer provider-token')
          .send(invalidVehicleData)
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('VALIDATION_ERROR');
      });

      test('should require provider role', async () => {
        const response = await request(app)
          .post('/api/vehicles')
          .set('Authorization', 'Bearer passenger-token')
          .send(mockVehicleData)
          .expect(403);

        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
      });
    });

    describe('GET /api/vehicles', () => {
      test('should get user vehicles', async () => {
        const response = await request(app)
          .get('/api/vehicles')
          .set('Authorization', 'Bearer provider-token')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('vehicles');
        expect(Array.isArray(response.body.data.vehicles)).toBe(true);
      });
    });
  });

  describe('Search Endpoints', () => {
    describe('GET /api/search/rides', () => {
      test('should search rides successfully', async () => {
        const response = await request(app)
          .get('/api/search/rides')
          .query({
            origin: 'Mumbai',
            destination: 'Pune',
            date: '2024-12-31',
            passengers: 2
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('rides');
        expect(response.body.data).toHaveProperty('total');
      });

      test('should handle empty search results', async () => {
        const response = await request(app)
          .get('/api/search/rides')
          .query({
            origin: 'NonExistentCity',
            destination: 'AnotherNonExistentCity',
            date: '2024-12-31'
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.rides).toHaveLength(0);
        expect(response.body.data.total).toBe(0);
      });

      test('should validate search parameters', async () => {
        const response = await request(app)
          .get('/api/search/rides')
          .query({
            // Missing required parameters
            passengers: 2
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('VALIDATION_ERROR');
      });
    });

    describe('GET /api/search/popular-routes', () => {
      test('should get popular routes', async () => {
        const response = await request(app)
          .get('/api/search/popular-routes')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('routes');
        expect(Array.isArray(response.body.data.routes)).toBe(true);
      });
    });

    describe('GET /api/search/suggestions', () => {
      test('should get search suggestions', async () => {
        const response = await request(app)
          .get('/api/search/suggestions')
          .query({ q: 'Mum' })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('suggestions');
        expect(Array.isArray(response.body.data.suggestions)).toBe(true);
      });
    });
  });

  describe('Review Endpoints', () => {
    const mockReviewData = {
      rideId: 'ride-123',
      bookingId: 'booking-123',
      revieweeId: 'driver-123',
      rating: {
        overall: 5,
        punctuality: 5,
        cleanliness: 4,
        communication: 5
      },
      comment: 'Great ride!'
    };

    describe('POST /api/reviews', () => {
      test('should create review successfully', async () => {
        const response = await request(app)
          .post('/api/reviews')
          .set('Authorization', 'Bearer passenger-token')
          .send(mockReviewData)
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data.review).toHaveProperty('id');
        expect(response.body.data.review.rating.overall).toBe(5);
      });

      test('should validate review data', async () => {
        const invalidReviewData = {
          ...mockReviewData,
          rating: {
            ...mockReviewData.rating,
            overall: 6 // Invalid rating (should be 1-5)
          }
        };

        const response = await request(app)
          .post('/api/reviews')
          .set('Authorization', 'Bearer passenger-token')
          .send(invalidReviewData)
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('VALIDATION_ERROR');
      });

      test('should prevent duplicate reviews', async () => {
        const response = await request(app)
          .post('/api/reviews')
          .set('Authorization', 'Bearer passenger-token')
          .send({ ...mockReviewData, bookingId: 'already-reviewed-booking' })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('REVIEW_ALREADY_EXISTS');
      });
    });

    describe('GET /api/reviews', () => {
      test('should get reviews for user', async () => {
        const response = await request(app)
          .get('/api/reviews')
          .query({ userId: 'user-123' })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('reviews');
        expect(Array.isArray(response.body.data.reviews)).toBe(true);
      });

      test('should filter reviews by rating', async () => {
        const response = await request(app)
          .get('/api/reviews')
          .query({ userId: 'user-123', minRating: 4 })
          .expect(200);

        expect(response.body.success).toBe(true);
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle 404 for non-existent endpoints', async () => {
      const response = await request(app)
        .get('/api/non-existent-endpoint')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('ENDPOINT_NOT_FOUND');
    });

    test('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/rides')
        .set('Authorization', 'Bearer provider-token')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_JSON');
    });

    test('should handle server errors gracefully', async () => {
      // Mock a service to throw an error
      jest.doMock('../services/rideService', () => ({
        createRide: jest.fn().mockRejectedValue(new Error('Database connection failed'))
      }));

      const response = await request(app)
        .post('/api/rides')
        .set('Authorization', 'Bearer provider-token')
        .send({
          origin: { city: 'Mumbai', coordinates: { lat: 19.0596, lng: 72.8295 } },
          destination: { city: 'Pune', coordinates: { lat: 18.5204, lng: 73.8567 } },
          departureDate: '2024-12-31',
          departureTime: '10:00',
          pricePerSeat: 500,
          totalSeats: 4
        })
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INTERNAL_SERVER_ERROR');
    });
  });

  describe('Rate Limiting', () => {
    test('should enforce rate limits', async () => {
      // Make multiple rapid requests
      const requests = Array(10).fill().map(() =>
        request(app)
          .get('/api/rides')
          .set('Authorization', 'Bearer test-token')
      );

      const responses = await Promise.all(requests);
      
      // At least one should be rate limited
      const rateLimitedResponse = responses.find(res => res.status === 429);
      if (rateLimitedResponse) {
        expect(rateLimitedResponse.body.success).toBe(false);
        expect(rateLimitedResponse.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
      }
    });
  });

  describe('Input Validation', () => {
    test('should sanitize input data', async () => {
      const maliciousData = {
        origin: {
          city: '<script>alert("xss")</script>Mumbai',
          coordinates: { lat: 19.0596, lng: 72.8295 }
        },
        destination: {
          city: 'Pune',
          coordinates: { lat: 18.5204, lng: 73.8567 }
        },
        departureDate: '2024-12-31',
        departureTime: '10:00',
        pricePerSeat: 500,
        totalSeats: 4
      };

      const response = await request(app)
        .post('/api/rides')
        .set('Authorization', 'Bearer provider-token')
        .send(maliciousData)
        .expect(201);

      expect(response.body.success).toBe(true);
      // Verify that the script tag was sanitized
      expect(response.body.data.ride.origin.city).not.toContain('<script>');
    });

    test('should validate data types', async () => {
      const invalidTypeData = {
        origin: {
          city: 'Mumbai',
          coordinates: { lat: 'invalid', lng: 72.8295 } // Invalid lat type
        },
        destination: {
          city: 'Pune',
          coordinates: { lat: 18.5204, lng: 73.8567 }
        },
        departureDate: '2024-12-31',
        departureTime: '10:00',
        pricePerSeat: 'invalid', // Invalid price type
        totalSeats: 4
      };

      const response = await request(app)
        .post('/api/rides')
        .set('Authorization', 'Bearer provider-token')
        .send(invalidTypeData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
