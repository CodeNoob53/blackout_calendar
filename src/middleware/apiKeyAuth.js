/**
 * API Key Authentication Middleware
 *
 * Supports two types of API keys:
 * - Public API Key: Read-only access to schedule data
 * - Admin API Key: Full access including admin operations
 */

import Logger from '../utils/logger.js';

// API Keys from environment variables
const PUBLIC_API_KEY = process.env.PUBLIC_API_KEY;
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;

/**
 * Middleware to validate API key
 * @param {string} requiredLevel - 'public' or 'admin'
 */
export const requireApiKey = (requiredLevel = 'public') => {
  return (req, res, next) => {
    // Get API key from headers
    const apiKey = req.headers['x-api-key'] || req.query.api_key;

    // No API key provided
    if (!apiKey) {
      Logger.warning('ApiKeyAuth', `Missing API key for ${req.method} ${req.path}`);
      return res.status(401).json({
        success: false,
        error: 'API key is required',
        message: 'Please provide an API key in X-API-Key header or api_key query parameter'
      });
    }

    // Check if API keys are configured
    if (!PUBLIC_API_KEY && !ADMIN_API_KEY) {
      Logger.error('ApiKeyAuth', 'API keys not configured in environment variables');
      return res.status(500).json({
        success: false,
        error: 'API keys not configured',
        message: 'Server configuration error'
      });
    }

    // Validate API key based on required level
    let isValid = false;
    let keyType = null;

    if (requiredLevel === 'admin') {
      // Admin endpoints require admin key
      if (apiKey === ADMIN_API_KEY) {
        isValid = true;
        keyType = 'admin';
      }
    } else {
      // Public endpoints accept both public and admin keys
      if (apiKey === PUBLIC_API_KEY) {
        isValid = true;
        keyType = 'public';
      } else if (apiKey === ADMIN_API_KEY) {
        isValid = true;
        keyType = 'admin';
      }
    }

    if (!isValid) {
      Logger.warning('ApiKeyAuth', `Invalid ${requiredLevel} API key attempt for ${req.method} ${req.path}`);
      return res.status(403).json({
        success: false,
        error: 'Invalid API key',
        message: requiredLevel === 'admin'
          ? 'This endpoint requires an admin API key'
          : 'Invalid or expired API key'
      });
    }

    // Attach key info to request for logging
    req.apiKeyType = keyType;

    Logger.debug('ApiKeyAuth', `Authenticated with ${keyType} key: ${req.method} ${req.path}`);
    next();
  };
};

/**
 * Middleware for admin-only endpoints
 */
export const requireAdminKey = requireApiKey('admin');

/**
 * Middleware for public endpoints (accepts both public and admin keys)
 */
export const requirePublicKey = requireApiKey('public');

/**
 * Optional API key middleware (doesn't require key but validates if provided)
 * Useful for endpoints that work without auth but have rate limits for authenticated users
 */
export const optionalApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;

  if (!apiKey) {
    // No key provided, continue as anonymous
    req.apiKeyType = 'anonymous';
    return next();
  }

  // Validate if key is provided
  if (apiKey === PUBLIC_API_KEY) {
    req.apiKeyType = 'public';
  } else if (apiKey === ADMIN_API_KEY) {
    req.apiKeyType = 'admin';
  } else {
    req.apiKeyType = 'invalid';
  }

  next();
};
