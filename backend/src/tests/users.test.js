const request = require('supertest');

// Mock Firebase and Redis
jest.mock('../config/firebase', () => ({
  initializeFirebase: jest.fn().mockResolvedValue({}),
  verifyIdToken: jest.fn(),
  getUserByUid: jest.fn(),
  getFirestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue({ 
          exists: true,
          data: () => ({
            uid: 'test-uid-123',
            email: 'test@example.com',
            displayName: 'Test User',
            role: 'passenger'
          })
        }),
        set: jest.fn().mockResolvedValue()
      })),
      where: jest.fn(() => ({
        limit: jest.fn(() => ({
          get: jest.fn().mockResolvedValue({ 
            empty: false,
            docs: [{
              data: () => ({
                uid: 'test-uid-123',
                email: 'test@example.com',
                displayName: 'Test User',
                role: 'passenger'
              })
            }]
          })
        }))
      }))
    }))
  }))
}));

jest.mock('../config/redis', () => ({
  initializeRedis: jest.fn().mockResolvedValue({}),
  session: {
    set: jest.fn().mockResolvedValue(),
    get: jest.fn().mockResolvedValue({
      uid: 'test-uid-123',
      email: 'test@example.com',
      role: 'passenger'
    }),
    delete: jest.fn().mockResolvedValue(),
    extend: jest.fn().mockResolvedValue()
  }
}));

const app = require('../server');
const { verifyIdToken, getUserByUid } = require('../config/firebase');

describe('Users API', () => {
  const mockFirebaseUser = {
    uid: 'test-uid-123',
    email: 'test@example.com',
    displayName: 'Test User',
    phoneNumber: '+1234567890',
    photoURL: 'https://example.com/photo.jpg',
    emailVerified: true
  };

  const mockDecodedToken = {
    uid: 'test-uid-123',
    email: 'test@example.com'
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/users/:userId', () => {
    it('should return user public profile', async () => {
      const response = await request(app)
        .get('/api/users/test-uid-123')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user).toHaveProperty('uid', 'test-uid-123');
      expect(response.body.data.user).toHaveProperty('displayName', 'Test User');
    });

    it('should return 404 for non-existent user', async () => {
      // Mock user not found
      const { getFirestore } = require('../config/firebase');
      getFirestore().collection().doc().get.mockResolvedValue({ exists: false });

      const response = await request(app)
        .get('/api/users/non-existent-uid')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('USER_NOT_FOUND');
    });
  });

  describe('GET /api/users/:userId/rating', () => {
    it('should return user rating information', async () => {
      const response = await request(app)
        .get('/api/users/test-uid-123/rating')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.rating).toHaveProperty('asPassenger');
      expect(response.body.data.rating).toHaveProperty('asDriver');
    });
  });

  describe('GET /api/users/:userId/stats', () => {
    it('should return public user stats', async () => {
      const response = await request(app)
        .get('/api/users/test-uid-123/stats')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.stats).toHaveProperty('totalRidesAsPassenger');
      expect(response.body.data.stats).toHaveProperty('totalRidesAsDriver');
      expect(response.body.data.stats).toHaveProperty('memberSince');
      expect(response.body.data.stats).not.toHaveProperty('totalEarnings'); // Should not include earnings for public view
    });

    it('should include earnings for own profile', async () => {
      verifyIdToken.mockResolvedValue(mockDecodedToken);
      getUserByUid.mockResolvedValue(mockFirebaseUser);

      const response = await request(app)
        .get('/api/users/test-uid-123/stats')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.stats).toHaveProperty('totalEarnings'); // Should include earnings for own profile
    });
  });

  describe('GET /api/users', () => {
    it('should return list of users', async () => {
      const response = await request(app)
        .get('/api/users')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('users');
      expect(response.body.data).toHaveProperty('count');
      expect(Array.isArray(response.body.data.users)).toBe(true);
    });

    it('should filter users by role', async () => {
      const response = await request(app)
        .get('/api/users?role=provider')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.criteria).toHaveProperty('role', 'provider');
    });

    it('should return validation error for invalid role filter', async () => {
      const response = await request(app)
        .get('/api/users?role=invalid-role')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PUT /api/users/:userId/verify', () => {
    it('should allow user to verify their own account', async () => {
      verifyIdToken.mockResolvedValue(mockDecodedToken);
      getUserByUid.mockResolvedValue(mockFirebaseUser);

      const response = await request(app)
        .put('/api/users/test-uid-123/verify')
        .set('Authorization', 'Bearer valid-token')
        .send({ identity: true })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('User verification updated successfully');
    });

    it('should not allow user to verify other accounts', async () => {
      verifyIdToken.mockResolvedValue(mockDecodedToken);
      getUserByUid.mockResolvedValue(mockFirebaseUser);

      const response = await request(app)
        .put('/api/users/other-user-uid/verify')
        .set('Authorization', 'Bearer valid-token')
        .send({ identity: true })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });
  });
});