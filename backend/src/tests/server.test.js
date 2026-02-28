const request = require('supertest');

// Mock Firebase and Redis before importing the app
jest.mock('../config/firebase', () => ({
  initializeFirebase: jest.fn().mockResolvedValue({}),
  getAuth: jest.fn(),
  getFirestore: jest.fn(),
  getDatabase: jest.fn(),
  verifyIdToken: jest.fn(),
  getUserByUid: jest.fn(),
}));

jest.mock('../config/redis', () => ({
  initializeRedis: jest.fn().mockResolvedValue({}),
  getRedisClient: jest.fn(),
  cache: {
    set: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
    expire: jest.fn(),
    keys: jest.fn(),
    flushAll: jest.fn(),
  },
  session: {
    set: jest.fn(),
    get: jest.fn(),
    delete: jest.fn(),
    extend: jest.fn(),
  },
}));

const app = require('../server');

describe('TripO Backend API', () => {
  describe('Health Check', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'OK');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('environment');
    });
  });

  describe('API Info', () => {
    it('should return API information', async () => {
      const response = await request(app)
        .get('/api')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('name', 'TripO Backend API');
      expect(response.body.data).toHaveProperty('version', '1.0.0');
      expect(response.body.data).toHaveProperty('endpoints');
    });
  });

  describe('404 Handler', () => {
    it('should return 404 for non-existent endpoints', async () => {
      const response = await request(app)
        .get('/non-existent-endpoint')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toHaveProperty('code', 'NOT_FOUND');
      expect(response.body.error).toHaveProperty('message', 'Endpoint not found');
    });
  });

  describe('Rate Limiting', () => {
    it('should apply rate limiting to API endpoints', async () => {
      // This test would need to be more sophisticated in a real scenario
      // For now, just verify the endpoint exists
      const response = await request(app)
        .get('/api')
        .expect(200);

      expect(response.headers).toHaveProperty('ratelimit-limit');
      expect(response.headers).toHaveProperty('ratelimit-remaining');
    });
  });
});