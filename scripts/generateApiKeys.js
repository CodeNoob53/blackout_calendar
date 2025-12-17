#!/usr/bin/env node

/**
 * API Key Generator
 *
 * Generates secure random API keys for public and admin access
 *
 * Usage:
 *   node scripts/generateApiKeys.js
 */

import crypto from 'crypto';

/**
 * Generate a secure random API key
 * Format: boc_[type]_[32 random bytes in base64url]
 *
 * @param {string} type - 'pub' for public, 'adm' for admin
 * @returns {string} - Generated API key
 */
function generateApiKey(type) {
  const randomBytes = crypto.randomBytes(32);
  const base64url = randomBytes
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  return `boc_${type}_${base64url}`;
}

// Generate keys
const publicKey = generateApiKey('pub');
const adminKey = generateApiKey('adm');

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║           Blackout Calendar API Keys Generated                ║');
console.log('╚════════════════════════════════════════════════════════════════╝');
console.log('');
console.log('📋 Add these to your .env file:');
console.log('');
console.log('# Public API Key (read-only access)');
console.log(`PUBLIC_API_KEY=${publicKey}`);
console.log('');
console.log('# Admin API Key (full access)');
console.log(`ADMIN_API_KEY=${adminKey}`);
console.log('');
console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  ⚠️  IMPORTANT: Keep these keys secret!                       ║');
console.log('║  ⚠️  Never commit them to git!                                ║');
console.log('║  ⚠️  Add .env to .gitignore                                   ║');
console.log('╚════════════════════════════════════════════════════════════════╝');
console.log('');
console.log('📚 Key Format:');
console.log('   boc_pub_xxx - Public key (for frontend, mobile apps)');
console.log('   boc_adm_xxx - Admin key (for admin dashboard, internal tools)');
console.log('');
console.log('✅ Keys have been generated successfully!');
