import dotenv from 'dotenv';

dotenv.config();

// Валідація обов'язкових змінних
const requiredEnvVars = ['TELEGRAM_CHANNEL_URL'];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

export const config = {
  // Server Configuration
  server: {
    port: parseInt(process.env.PORT) || 3000,
    env: process.env.NODE_ENV || 'development',
    isDevelopment: process.env.NODE_ENV === 'development',
    isProduction: process.env.NODE_ENV === 'production'
  },

  // Auto-update Configuration
  autoUpdate: {
    enabled: process.env.AUTO_UPDATE !== 'false',
    interval: process.env.UPDATE_INTERVAL || '*/30 * * * *'
  },

  // Telegram Configuration
  telegram: {
    channelUrl: process.env.TELEGRAM_CHANNEL_URL
  },

  // Logging Configuration
  logging: {
    debug: process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development'
  }
};

export default config;
