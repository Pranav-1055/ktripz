const { createClient } = require('redis');
const logger = require('../utils/logger');

let redisClient = null;

/**
 * Initialize Redis connection
 */
async function initializeRedis() {
  try {
    if (redisClient) {
      logger.info('Redis client already initialized');
      return redisClient;
    }

    const hasExplicitRedisConfig = Boolean(process.env.REDIS_URL || process.env.REDIS_HOST);

    // Skip Redis unless it is explicitly configured or required.
    if (!hasExplicitRedisConfig && !process.env.REDIS_REQUIRED) {
      logger.info('Redis disabled (no REDIS_URL/REDIS_HOST configured)');
      redisClient = null;
      return null;
    }

    // Production mode - Redis is required
    let redisConfig;

    if (process.env.REDIS_URL) {
      // Production (Render)
      redisConfig = {
        url: process.env.REDIS_URL
      };
    } else {
      redisConfig = {
        socket: {
          host: process.env.REDIS_HOST,
          port: parseInt(process.env.REDIS_PORT) || 6379,
        },
        database: parseInt(process.env.REDIS_DB) || 0,
      };

      if (process.env.REDIS_PASSWORD) {
        redisConfig.password = process.env.REDIS_PASSWORD;
      }
    }

    redisClient = createClient(redisConfig);

    // Error handling
    redisClient.on('error', (err) => {
      logger.error('Redis Client Error:', err);
    });

    redisClient.on('connect', () => {
      logger.info('Redis client connected');
    });

    redisClient.on('ready', () => {
      logger.info('Redis client ready');
    });

    redisClient.on('end', () => {
      logger.info('Redis client disconnected');
    });

    // Connect to Redis
    await redisClient.connect();

    logger.info('Redis connection established successfully');
    return redisClient;
  } catch (error) {
    if (process.env.NODE_ENV === 'development' || process.env.VERCEL) {
      logger.warn('Redis not available, continuing without cache:', error.message);
      redisClient = null;
      return null;
    } else {
      logger.error('Failed to initialize Redis:', error);
      throw error;
    }
  }
}

/**
 * Get Redis client instance
 */
function getRedisClient() {
  if (!redisClient) {
    if (process.env.NODE_ENV === 'development' || process.env.VERCEL) {
      logger.debug('Redis not available in this runtime, continuing without cache');
      return null;
    }
    throw new Error('Redis not initialized. Call initializeRedis() first.');
  }
  return redisClient;
}

/**
 * Cache helper functions
 */
const cache = {
  /**
   * Set cache with expiration
   */
  async set(key, value, expirationInSeconds = 3600) {
    try {
      const client = getRedisClient();
      if (!client) {
        logger.debug('Redis not available, skipping cache set');
        return;
      }
      const serializedValue = JSON.stringify(value);
      await client.setEx(key, expirationInSeconds, serializedValue);
      logger.debug(`Cache set: ${key}`);
    } catch (error) {
      logger.error('Cache set error:', error);
      if (process.env.NODE_ENV !== 'development') {
        throw error;
      }
    }
  },

  /**
   * Get cache value
   */
  async get(key) {
    try {
      const client = getRedisClient();
      if (!client) {
        logger.debug('Redis not available, cache miss');
        return null;
      }
      const value = await client.get(key);
      if (value) {
        logger.debug(`Cache hit: ${key}`);
        return JSON.parse(value);
      }
      logger.debug(`Cache miss: ${key}`);
      return null;
    } catch (error) {
      logger.error('Cache get error:', error);
      if (process.env.NODE_ENV !== 'development') {
        throw error;
      }
      return null;
    }
  },

  /**
   * Delete cache key
   */
  async del(key) {
    try {
      const client = getRedisClient();
      if (!client) {
        logger.debug('Redis not available, skipping cache delete');
        return;
      }
      await client.del(key);
      logger.debug(`Cache deleted: ${key}`);
    } catch (error) {
      logger.error('Cache delete error:', error);
      if (process.env.NODE_ENV !== 'development') {
        throw error;
      }
    }
  },

  /**
   * Check if key exists
   */
  async exists(key) {
    try {
      const client = getRedisClient();
      if (!client) {
        logger.debug('Redis not available, key does not exist');
        return false;
      }
      const exists = await client.exists(key);
      return exists === 1;
    } catch (error) {
      logger.error('Cache exists error:', error);
      if (process.env.NODE_ENV !== 'development') {
        throw error;
      }
      return false;
    }
  },

  /**
   * Set expiration for existing key
   */
  async expire(key, seconds) {
    try {
      const client = getRedisClient();
      if (!client) {
        logger.debug('Redis not available, skipping cache expiration');
        return;
      }
      await client.expire(key, seconds);
      logger.debug(`Cache expiration set: ${key} (${seconds}s)`);
    } catch (error) {
      logger.error('Cache expire error:', error);
      if (process.env.NODE_ENV !== 'development') {
        throw error;
      }
    }
  },

  /**
   * Get all keys matching pattern
   */
  async keys(pattern) {
    try {
      const client = getRedisClient();
      if (!client) {
        logger.debug('Redis not available, returning empty keys');
        return [];
      }
      return await client.keys(pattern);
    } catch (error) {
      logger.error('Cache keys error:', error);
      if (process.env.NODE_ENV !== 'development') {
        throw error;
      }
      return [];
    }
  },

  /**
   * Clear all cache (use with caution)
   */
  async flushAll() {
    try {
      const client = getRedisClient();
      if (!client) {
        logger.debug('Redis not available, skipping cache flush');
        return;
      }
      await client.flushAll();
      logger.info('All cache cleared');
    } catch (error) {
      logger.error('Cache flush error:', error);
      if (process.env.NODE_ENV !== 'development') {
        throw error;
      }
    }
  }
};

/**
 * Session management helpers
 */
const session = {
  /**
   * Store user session
   */
  async set(userId, sessionData, expirationInSeconds = 86400) { // 24 hours default
    const key = `session:${userId}`;
    await cache.set(key, sessionData, expirationInSeconds);
  },

  /**
   * Get user session
   */
  async get(userId) {
    const key = `session:${userId}`;
    return await cache.get(key);
  },

  /**
   * Delete user session
   */
  async delete(userId) {
    const key = `session:${userId}`;
    await cache.del(key);
  },

  /**
   * Extend session expiration
   */
  async extend(userId, expirationInSeconds = 86400) {
    const key = `session:${userId}`;
    await cache.expire(key, expirationInSeconds);
  }
};

module.exports = {
  initializeRedis,
  getRedisClient,
  cache,
  session,
};
