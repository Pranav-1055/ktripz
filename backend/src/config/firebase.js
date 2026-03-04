const admin = require('firebase-admin');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

let firebaseApp = null;
let isDevelopmentMode = false;

/**
 * Initialize Firebase Admin SDK
 */
async function initializeFirebase() {
  try {
    if (firebaseApp) {
      logger.info('Firebase Admin SDK already initialized');
      return firebaseApp;
    }

    // Check if we're in development mode with mock credentials
    // Relaxed check: if project ID is tripo-development OR NODE_ENV is development
    logger.info(`Checking Firebase mode. Project: ${process.env.FIREBASE_PROJECT_ID}, Env: ${process.env.NODE_ENV}`);

    const isDev = (process.env.NODE_ENV || '').trim().toLowerCase() === 'development';
    const isDevProject = (process.env.FIREBASE_PROJECT_ID || '').trim() === 'tripo-development';

    const hasRealCredentials = process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL;

    if ((isDevProject || isDev) && !hasRealCredentials) {

      logger.info('Running in development mode with mock Firebase credentials');
      isDevelopmentMode = true;

      // FORCE MOCK for development to avoid credential issues
      logger.warn('Using minimal Firebase mock for development');
      firebaseApp = {
        _isMock: true,
        name: 'tripo-development'
      };
      return firebaseApp;
    } else if (process.env.NODE_ENV === 'development' && process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
      const serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);

      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: process.env.FIREBASE_DATABASE_URL,
      });
    } else {
      // Use environment variables for production
      const serviceAccount = {
        type: 'service_account',
        project_id: process.env.FIREBASE_PROJECT_ID,
        private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
        private_key: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        client_id: process.env.FIREBASE_CLIENT_ID,
        auth_uri: process.env.FIREBASE_AUTH_URI || 'https://accounts.google.com/o/oauth2/auth',
        token_uri: process.env.FIREBASE_TOKEN_URI || 'https://oauth2.googleapis.com/token',
      };

      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: process.env.FIREBASE_DATABASE_URL,
      });
    }

    logger.info('Firebase Admin SDK initialized successfully');
    return firebaseApp;
  } catch (error) {
    logger.error('Failed to initialize Firebase Admin SDK:', error);

    // In development, create a mock app to prevent crashes
    if (process.env.NODE_ENV === 'development') {
      logger.warn('Creating mock Firebase app for development');
      isDevelopmentMode = true;
      firebaseApp = {
        _isMock: true,
        name: 'tripo-development-mock'
      };
      return firebaseApp;
    }

    throw error;
  }
}

/**
 * Get Firebase Auth instance
 */
function getAuth() {
  if (!firebaseApp) {
    throw new Error('Firebase not initialized. Call initializeFirebase() first.');
  }

  if (firebaseApp._isMock) {
    // Return mock auth for development
    return {
      verifyIdToken: async (token) => ({ uid: 'mock-user-id', email: 'mock@example.com' }),
      getUser: async (uid) => ({ uid, email: 'mock@example.com', displayName: 'Mock User' }),
      createUser: async (userData) => ({ uid: 'mock-new-user-id', ...userData }),
      updateUser: async (uid, data) => ({ uid, ...data }),
      setCustomUserClaims: async (uid, claims) => ({ uid, ...claims }),
    };
  }

  return admin.auth();
}

/**
 * Get Firestore instance
 */
function getFirestore() {
  if (!firebaseApp) {
    throw new Error('Firebase not initialized. Call initializeFirebase() first.');
  }

  if (firebaseApp._isMock) {
    // Return stateful mock Firestore for development
    const MOCK_DB_FILE = path.join(process.cwd(), 'mock-firestore-data.json');

    // Load data from file if global is empty
    if (!global.mockFirestoreDb) {
      try {
        if (fs.existsSync(MOCK_DB_FILE)) {
          const data = fs.readFileSync(MOCK_DB_FILE, 'utf8');
          global.mockFirestoreDb = JSON.parse(data);
          logger.info('Loaded mock Firestore data from file');
        } else {
          global.mockFirestoreDb = {};
        }
      } catch (err) {
        logger.warn('Failed to load mock Firestore data:', err.message);
        global.mockFirestoreDb = {};
      }
    }

    const mockDb = global.mockFirestoreDb;

    // Helper to save DB to file
    const saveDb = () => {
      try {
        fs.writeFileSync(MOCK_DB_FILE, JSON.stringify(mockDb, null, 2));
        logger.info(`Saved mock Firestore data to ${MOCK_DB_FILE}`);
        try {
          fs.appendFileSync(path.join(process.cwd(), 'auth-debug.log'), `[MockDB] Saved data to disk. Keys in verification_tokens: ${Object.keys(mockDb.verification_tokens || {}).length}\n`);
        } catch (e) { }
      } catch (err) {
        logger.error('Failed to save mock Firestore data:', err.message);
      }
    };

    return {
      collection: (collectionName) => {
        if (!mockDb[collectionName]) mockDb[collectionName] = {};

        // Recursive chainable query object
        const createQuery = () => ({
          where: () => createQuery(),
          orderBy: () => createQuery(),
          limit: () => createQuery(),
          get: async () => ({
            docs: [],
            empty: true,
            forEach: () => { }
          })
        });

        return {
          doc: (docId) => ({
            get: async () => {
              const data = mockDb[collectionName][docId];
              return {
                exists: !!data,
                data: () => data
              };
            },
            set: async (data, options) => {
              if (options && options.merge && mockDb[collectionName][docId]) {
                mockDb[collectionName][docId] = { ...mockDb[collectionName][docId], ...data };
              } else {
                mockDb[collectionName][docId] = data;
              }
              saveDb();
              return mockDb[collectionName][docId];
            },
            update: async (data) => {
              if (!mockDb[collectionName][docId]) throw new Error('Document not found');
              mockDb[collectionName][docId] = { ...mockDb[collectionName][docId], ...data };
              saveDb();
              return mockDb[collectionName][docId];
            },
            delete: async () => {
              delete mockDb[collectionName][docId];
              saveDb();
              return {};
            },
          }),
          add: async (data) => {
            const id = 'mock-doc-' + Date.now();
            mockDb[collectionName][id] = data;
            saveDb();
            return { id };
          },
          get: async () => {
            const docs = Object.keys(mockDb[collectionName] || {}).map(id => ({
              id,
              data: () => mockDb[collectionName][id]
            }));
            return {
              docs,
              empty: docs.length === 0,
              forEach: (callback) => docs.forEach(callback)
            };
          },
          ...createQuery()
        };
      },
      batch: () => ({
        set: (ref, data) => {
          // Mock set in batch
        },
        update: (ref, data) => {
          // Mock update in batch
        },
        delete: (ref) => {
          // Mock delete in batch
        },
        commit: async () => {
          return [];
        }
      })
    };
  }

  return admin.firestore();
}

/**
 * Get Realtime Database instance
 */
function getDatabase() {
  if (!firebaseApp) {
    throw new Error('Firebase not initialized. Call initializeFirebase() first.');
  }

  if (firebaseApp._isMock) {
    // Return mock database for development (RTDB-like)
    const getStore = () => {
      if (!global.mockRtdb) {
        global.mockRtdb = {};
      }
      return global.mockRtdb;
    };

    const getAtPath = (store, pathParts) => {
      return pathParts.reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : null), store);
    };

    const setAtPath = (store, pathParts, value, merge = false) => {
      let curr = store;
      for (let i = 0; i < pathParts.length - 1; i++) {
        const part = pathParts[i];
        if (!curr[part] || typeof curr[part] !== 'object') curr[part] = {};
        curr = curr[part];
      }
      const last = pathParts[pathParts.length - 1];
      if (merge && typeof curr[last] === 'object' && curr[last] !== null) {
        curr[last] = { ...curr[last], ...value };
      } else {
        curr[last] = value;
      }
    };

    const makeRef = (pathParts = []) => {
      const key = pathParts.length ? pathParts[pathParts.length - 1] : null;
      return {
        key,
        child: (childPath) => makeRef([...pathParts, ...childPath.split('/').filter(Boolean)]),
        set: async (data) => {
          const store = getStore();
          setAtPath(store, pathParts, data, false);
          return {};
        },
        update: async (data) => {
          const store = getStore();
          setAtPath(store, pathParts, data, true);
          return {};
        },
        remove: async () => {
          const store = getStore();
          setAtPath(store, pathParts, null, false);
          return {};
        },
        once: async () => {
          const store = getStore();
          const value = getAtPath(store, pathParts);
          return {
            val: () => value,
            exists: () => value !== null && value !== undefined
          };
        },
        on: () => { },
        off: () => { },
        orderByChild: () => makeRef(pathParts),
        equalTo: () => makeRef(pathParts),
        push: () => {
          const newKey = `mock-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
          return makeRef([...pathParts, newKey]);
        }
      };
    };

    return {
      ref: (path = '') => makeRef(path.split('/').filter(Boolean)),
    };
  }

  try {
    return admin.database();
  } catch (error) {
    if (error.code === 'database/invalid-argument' || error.message.includes('Can\'t determine Firebase Database URL')) {
      logger.error('Firebase Database URL is missing or invalid. Set FIREBASE_DATABASE_URL in backend/.env to use real rides.');
      throw new Error('Firebase Realtime Database is not configured. Please set FIREBASE_DATABASE_URL.');
    }
    throw error;
  }
}

/**
 * Verify Firebase ID token
 */
async function verifyIdToken(idToken) {
  try {
    const auth = getAuth();
    const decodedToken = await auth.verifyIdToken(idToken);
    return decodedToken;
  } catch (error) {
    logger.error('Failed to verify Firebase ID token:', error);
    throw error;
  }
}

/**
 * Get user by UID
 */
async function getUserByUid(uid) {
  try {
    const auth = getAuth();
    const userRecord = await auth.getUser(uid);
    return userRecord;
  } catch (error) {
    logger.error('Failed to get user by UID:', error);
    throw error;
  }
}

module.exports = {
  initializeFirebase,
  getAuth,
  getFirestore,
  getDatabase,
  verifyIdToken,
  getUserByUid,
};
