const request = require('supertest');
const User = require('../models/User');
const UserService = require('../services/userService');

// Mock Firebase and Redis
jest.mock('../config/firebase', () => ({
  initializeFirebase: jest.fn().mockResolvedValue({}),
  verifyIdToken: jest.fn(),
  getUserByUid: jest.fn(),
  getAuth: jest.fn(() => ({
    setCustomUserClaims: jest.fn().mockResolvedValue()
  })),
  getFirestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue({ exists: false }),
        set: jest.fn().mockResolvedValue()
      })),
      where: jest.fn(() => ({
        limit: jest.fn(() => ({
          get: jest.fn().mockResolvedValue({ empty: true })
        }))
      }))
    }))
  }))
}));

jest.mock('../config/redis', () => ({
  initializeRedis: jest.fn().mockResolvedValue({}),
  session: {
    set: jest.fn().mockResolvedValue(),
    get: jest.fn().mockResolvedValue(null),
    delete: jest.fn().mockResolvedValue(),
    extend: jest.fn().mockResolvedValue()
  }
}));

const app = require('../server');
const { verifyIdToken, getUserByUid } = require('../config/firebase');

describe('Authentication API', () => {
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

  describe('POST /api/auth/verify-token', () => {
    it('should verify valid token and return user data', async () => {
      verifyIdToken.mockResolvedValue(mockDecodedToken);
      getUserByUid.mockResolvedValue(mockFirebaseUser);

      const response = await request(app)
        .post('/api/auth/verify-token')
        .send({ token: 'valid-firebase-token' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user).toHaveProperty('uid', 'test-uid-123');
      expect(response.body.data.user).toHaveProperty('email', 'test@example.com');
      expect(response.body.data).toHaveProperty('session');
    });

    it('should return error for invalid token', async () => {
      verifyIdToken.mockRejectedValue(new Error('Invalid token'));

      const response = await request(app)
        .post('/api/auth/verify-token')
        .send({ token: 'invalid-token' })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_TOKEN');
    });

    it('should return validation error for missing token', async () => {
      const response = await request(app)
        .post('/api/auth/verify-token')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/auth/profile', () => {
    it('should return user profile for authenticated user', async () => {
      verifyIdToken.mockResolvedValue(mockDecodedToken);
      getUserByUid.mockResolvedValue(mockFirebaseUser);

      const response = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user).toHaveProperty('uid', 'test-uid-123');
    });

    it('should return error for unauthenticated request', async () => {
      const response = await request(app)
        .get('/api/auth/profile')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('MISSING_TOKEN');
    });
  });

  describe('PUT /api/auth/profile', () => {
    it('should update user profile successfully', async () => {
      verifyIdToken.mockResolvedValue(mockDecodedToken);
      getUserByUid.mockResolvedValue(mockFirebaseUser);

      const updateData = {
        name: 'Updated Name',
        bio: 'Updated bio',
        gender: 'male'
      };

      const response = await request(app)
        .put('/api/auth/profile')
        .set('Authorization', 'Bearer valid-token')
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Profile updated successfully');
    });

    it('should return validation error for invalid data', async () => {
      verifyIdToken.mockResolvedValue(mockDecodedToken);
      getUserByUid.mockResolvedValue(mockFirebaseUser);

      const response = await request(app)
        .put('/api/auth/profile')
        .set('Authorization', 'Bearer valid-token')
        .send({ gender: 'invalid-gender' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PUT /api/auth/role', () => {
    it('should update user role successfully', async () => {
      verifyIdToken.mockResolvedValue(mockDecodedToken);
      getUserByUid.mockResolvedValue(mockFirebaseUser);

      const response = await request(app)
        .put('/api/auth/role')
        .set('Authorization', 'Bearer valid-token')
        .send({ role: 'provider' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Role updated successfully');
    });

    it('should return validation error for invalid role', async () => {
      verifyIdToken.mockResolvedValue(mockDecodedToken);
      getUserByUid.mockResolvedValue(mockFirebaseUser);

      const response = await request(app)
        .put('/api/auth/role')
        .set('Authorization', 'Bearer valid-token')
        .send({ role: 'invalid-role' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should logout user successfully', async () => {
      verifyIdToken.mockResolvedValue(mockDecodedToken);
      getUserByUid.mockResolvedValue(mockFirebaseUser);

      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Logged out successfully');
    });
  });
});