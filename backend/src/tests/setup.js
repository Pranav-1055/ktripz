// Test setup file
// This file runs before each test file

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.PORT = '3001';
process.env.LOG_LEVEL = 'error'; // Reduce log noise during tests
process.env.FIREBASE_PROJECT_ID = 'test-project';
process.env.FIREBASE_CLIENT_EMAIL = 'test@test.com';
process.env.FIREBASE_PRIVATE_KEY = 'test-key';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.JWT_SECRET = 'test-secret';

// Mock Firebase Admin SDK
jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  credential: {
    cert: jest.fn()
  },
  auth: jest.fn(() => ({
    verifyIdToken: jest.fn().mockResolvedValue({
      uid: 'test-uid',
      email: 'test@example.com'
    }),
    getUser: jest.fn().mockResolvedValue({
      uid: 'test-uid',
      email: 'test@example.com',
      displayName: 'Test User'
    })
  })),
  database: jest.fn(() => ({
    ref: jest.fn(() => ({
      push: jest.fn().mockResolvedValue({ key: 'test-key' }),
      set: jest.fn().mockResolvedValue(),
      update: jest.fn().mockResolvedValue(),
      remove: jest.fn().mockResolvedValue(),
      once: jest.fn().mockResolvedValue({
        val: () => ({ test: 'data' }),
        exists: () => true
      }),
      on: jest.fn(),
      off: jest.fn()
    }))
  })),
  firestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => ({ test: 'data' })
        }),
        set: jest.fn().mockResolvedValue(),
        update: jest.fn().mockResolvedValue(),
        delete: jest.fn().mockResolvedValue()
      })),
      add: jest.fn().mockResolvedValue({ id: 'test-id' }),
      where: jest.fn(() => ({
        get: jest.fn().mockResolvedValue({
          docs: []
        })
      }))
    }))
  }))
}));

// Mock Redis
jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
    connect: jest.fn().mockResolvedValue(),
    disconnect: jest.fn().mockResolvedValue(),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    exists: jest.fn().mockResolvedValue(0),
    expire: jest.fn().mockResolvedValue(1),
    flushAll: jest.fn().mockResolvedValue('OK')
  }))
}));

// Mock Razorpay
jest.mock('razorpay', () => {
  return jest.fn().mockImplementation(() => ({
    orders: {
      create: jest.fn().mockResolvedValue({
        id: 'order_test123',
        amount: 1000,
        currency: 'INR'
      }),
      fetch: jest.fn().mockResolvedValue({
        id: 'order_test123',
        status: 'created'
      })
    },
    payments: {
      fetch: jest.fn().mockResolvedValue({
        id: 'pay_test123',
        status: 'captured'
      })
    }
  }));
});

// Mock Stripe
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    paymentIntents: {
      create: jest.fn().mockResolvedValue({
        id: 'pi_test123',
        client_secret: 'pi_test123_secret'
      }),
      retrieve: jest.fn().mockResolvedValue({
        id: 'pi_test123',
        status: 'succeeded'
      })
    }
  }));
});

// Mock Twilio
jest.mock('twilio', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        sid: 'SM123',
        status: 'sent'
      })
    }
  }));
});

// Mock SendGrid
jest.mock('@sendgrid/mail', () => ({
  setApiKey: jest.fn(),
  send: jest.fn().mockResolvedValue([{ statusCode: 202 }])
}));

// Mock Socket.io
jest.mock('socket.io', () => ({
  Server: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    emit: jest.fn(),
    to: jest.fn(() => ({
      emit: jest.fn()
    }))
  }))
}));

// Mock console methods to reduce test output noise
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Global test timeout
jest.setTimeout(15000);