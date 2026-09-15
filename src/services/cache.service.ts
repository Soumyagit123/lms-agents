import Redis from 'ioredis';
import { config } from '../config';

let redis: Redis | null = null;

try {
  redis = new Redis(config.redisUrl, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      if (times > 3) {
        console.warn('Redis connection failed. Running without cache.');
        return null; // Stop retrying and fallback
      }
      return Math.min(times * 100, 2000);
    }
  });

  redis.on('error', (err) => {
    console.error('Redis Error:', err.message);
  });
} catch (e) {
  console.warn('Failed to initialize Redis client. Running without cache.');
}

export const cacheService = {
  /**
   * Set JSON value in Redis cache
   */
  async set(key: string, value: any, ttlSeconds: number = 86400): Promise<boolean> {
    if (!redis) return false;
    try {
      const stringValue = JSON.stringify(value);
      await redis.set(key, stringValue, 'EX', ttlSeconds);
      return true;
    } catch (err) {
      console.error(`Cache set error for key ${key}:`, err);
      return false;
    }
  },

  /**
   * Get parsed JSON value from Redis cache
   */
  async get<T>(key: string): Promise<T | null> {
    if (!redis) return null;
    try {
      const value = await redis.get(key);
      if (!value) return null;
      return JSON.parse(value) as T;
    } catch (err) {
      console.error(`Cache get error for key ${key}:`, err);
      return null;
    }
  },

  /**
   * Delete key from cache
   */
  async del(key: string): Promise<boolean> {
    if (!redis) return false;
    try {
      await redis.del(key);
      return true;
    } catch (err) {
      console.error(`Cache delete error for key ${key}:`, err);
      return false;
    }
  },

  /**
   * Directly get raw redis instance if needed (e.g. for BullMQ connection)
   */
  getClient(): Redis | null {
    return redis;
  }
};
