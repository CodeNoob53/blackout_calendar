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
    interval: process.env.UPDATE_INTERVAL || '*/5 * * * *' // Кожні 5 хвилин
  },

  // Telegram Configuration
  telegram: {
    channelUrl: process.env.TELEGRAM_CHANNEL_URL
  },

  // Zoe Scraper Configuration
  zoe: {
    enabled: process.env.ENABLE_ZOE_SCRAPER !== 'false', // Enabled by default
    skipSslVerify: process.env.ZOE_SKIP_SSL_VERIFY === 'true'
  },

  // Sync Engine Configuration
  sync: {
    useSyncEngine: process.env.USE_SYNC_ENGINE === 'true'
  },

  // Logging Configuration
  logging: {
    debug: process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development'
  }
};

export default config;
