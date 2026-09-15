import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '3002', 10),
  redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  lmsBaseUrl: process.env.LMS_BASE_URL || 'http://localhost:3000',
  lmsAuthToken: process.env.LMS_AUTH_TOKEN || '',
  lmsRefreshToken: process.env.LMS_REFRESH_TOKEN || '',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
};

// LangChain v2 reads GOOGLE_API_KEY automatically — set it from our GEMINI_API_KEY
if (config.geminiApiKey && config.geminiApiKey !== 'your_gemini_api_key_here') {
  process.env.GOOGLE_API_KEY = config.geminiApiKey;
  console.log('[Config] GOOGLE_API_KEY set for LangChain v2 Google GenAI SDK.');
} else {
  console.warn('WARNING: GEMINI_API_KEY is not set or has placeholder value in .env file.');
}
