const request = require('supertest');
const app = require('../server');
const mapsService = require('../utils/maps');

describe('Maps API Integration', () => {
  describe('GET /api/maps/geocode', () => {
    it('should geocode a valid address', async () => {
      const response = await request(app)
        .get('/api/maps/geocode')
        .query({ address: 'Paris, France' });

      if (process.env.GOOGLE_MAPS_API_KEY) {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('coordinates');
        expect(response.body.data).toHaveProperty('formattedAddress');
      } else {
        // If no API key, service should handle gracefully
        expect(response.status).toBe(404);
      }
    });

    it('should return 400 for missing address', async () => {
      const response = await request(app)
        .get('/api/maps/geocode');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('errors');
    });
  });

  describe('GET /api/maps/route', () => {
    it('should calculate route between two points', async () => {
      const response = await request(app)
        .get('/api/maps/route')
        .query({
          origin: '48.8566,2.3522', // Paris
          destination: '45.7640,4.8357' // Lyon
        });

      if (process.env.GOOGLE_MAPS_API_KEY) {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('routes');
      } else {
        expect(response.status).toBe(404);
      }
    });

    it('should return 400 for invalid coordinates', async () => {
      const response = await request(app)
        .get('/api/maps/route')
        .query({
          origin: 'invalid',
          destination: '45.7640,4.8357'
        });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/maps/distance', () => {
    it('should calculate distance between two points', async () => {
      const response = await request(app)
        .get('/api/maps/distance')
        .query({
          origin: '48.8566,2.3522',
          destination: '45.7640,4.8357'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('distance');
      expect(response.body.data.distance).toHaveProperty('kilometers');
      expect(response.body.data.distance).toHaveProperty('miles');
    });
  });

  describe('GET /api/maps/optimal-pickup', () => {
    it('should find optimal pickup points', async () => {
      const response = await request(app)
        .get('/api/maps/optimal-pickup')
        .query({
          originLat: 48.8566,
          originLng: 2.3522,
          destLat: 45.7640,
          destLng: 4.8357,
          userLat: 48.8600,
          userLng: 2.3500,
          maxWalkingDistance: 1000,
          maxResults: 5
        });

      if (process.env.GOOGLE_MAPS_API_KEY) {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('pickupPoints');
        expect(Array.isArray(response.body.data.pickupPoints)).toBe(true);
      } else {
        expect(response.status).toBe(200);
        expect(response.body.data.pickupPoints).toEqual([]);
      }
    });
  });

  describe('POST /api/maps/batch-geocode', () => {
    it('should batch geocode multiple addresses', async () => {
      const addresses = ['Paris, France', 'Lyon, France', 'Marseille, France'];
      
      const response = await request(app)
        .post('/api/maps/batch-geocode')
        .send({ addresses });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('results');
      expect(response.body.data.processed).toBe(3);
    });

    it('should return 400 for empty addresses array', async () => {
      const response = await request(app)
        .post('/api/maps/batch-geocode')
        .send({ addresses: [] });

      expect(response.status).toBe(400);
    });

    it('should return 400 for too many addresses', async () => {
      const addresses = new Array(51).fill('Paris, France');
      
      const response = await request(app)
        .post('/api/maps/batch-geocode')
        .send({ addresses });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/maps/distance-matrix', () => {
    it('should calculate distance matrix', async () => {
      const origins = [
        { lat: 48.8566, lng: 2.3522 }, // Paris
        { lat: 45.7640, lng: 4.8357 }  // Lyon
      ];
      const destinations = [
        { lat: 43.2965, lng: 5.3698 }, // Marseille
        { lat: 50.6292, lng: 3.0573 }  // Lille
      ];

      const response = await request(app)
        .post('/api/maps/distance-matrix')
        .send({ origins, destinations });

      if (process.env.GOOGLE_MAPS_API_KEY) {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('rows');
      } else {
        expect(response.status).toBe(500);
      }
    });
  });
});

describe('Maps Service Unit Tests', () => {
  describe('calculateDistance', () => {
    it('should calculate distance between Paris and Lyon', () => {
      const paris = { lat: 48.8566, lng: 2.3522 };
      const lyon = { lat: 45.7640, lng: 4.8357 };
      
      const distance = mapsService.calculateDistance(paris, lyon);
      
      // Distance should be approximately 392 km
      expect(distance).toBeGreaterThan(390);
      expect(distance).toBeLessThan(400);
    });

    it('should return 0 for same coordinates', () => {
      const point = { lat: 48.8566, lng: 2.3522 };
      const distance = mapsService.calculateDistance(point, point);
      
      expect(distance).toBe(0);
    });
  });

  describe('decodePolyline', () => {
    it('should decode a simple polyline', () => {
      // Simple polyline encoding for testing
      const polyline = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';
      const points = mapsService.decodePolyline(polyline);
      
      expect(Array.isArray(points)).toBe(true);
      expect(points.length).toBeGreaterThan(0);
      expect(points[0]).toHaveProperty('lat');
      expect(points[0]).toHaveProperty('lng');
    });
  });

  describe('assessAccessibility', () => {
    it('should assess transit station as highly accessible', () => {
      const place = {
        types: ['transit_station', 'point_of_interest'],
        rating: 4.5,
        openNow: true
      };
      
      const assessment = mapsService.assessAccessibility(place);
      
      expect(assessment.score).toBeGreaterThan(3);
      expect(assessment.level).toBe('excellent');
      expect(assessment.factors).toContain('Public transit access');
    });

    it('should assess basic location with lower score', () => {
      const place = {
        types: ['establishment'],
        rating: 3.0,
        openNow: false
      };
      
      const assessment = mapsService.assessAccessibility(place);
      
      expect(assessment.score).toBeLessThan(3);
      expect(assessment.level).toBe('basic');
    });
  });
});