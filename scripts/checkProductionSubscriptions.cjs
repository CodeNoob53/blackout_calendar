#!/usr/bin/env node

/**
 * Check subscription statistics on production server
 * Requires ADMIN_API_KEY to be set in environment
 */

const https = require('https');

const PRODUCTION_URL = process.env.PRODUCTION_URL || 'https://blackout-calendar-api.onrender.com';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'boc_adm_4tTPLD9DUUwifeU19saan2MPUAUXFfPn0mZmWwa-ngw';

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║       Production Subscription Statistics Check                ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');
console.log(`🌐 Checking: ${PRODUCTION_URL}`);
console.log(`🔑 Using admin key: ${ADMIN_API_KEY.substring(0, 20)}...\n`);

function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, PRODUCTION_URL);

    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'X-API-Key': ADMIN_API_KEY,
        'Accept': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Failed to parse JSON: ${data}`));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.end();
  });
}

async function checkSubscriptions() {
  try {
    console.log('📡 Fetching subscription statistics...\n');

    // Check if we have an admin endpoint for stats
    // If not, we'll need to create one or check local DB

    console.log('ℹ️  Note: Production server uses ephemeral storage on Render free tier');
    console.log('ℹ️  Database is reset on every deploy');
    console.log('\n❌ Admin stats endpoint not yet implemented');
    console.log('\n💡 To check production subscriptions, we need to:');
    console.log('   1. Add GET /admin/subscriptions/stats endpoint to the API');
    console.log('   2. Or check logs on Render dashboard');
    console.log('   3. Or use local database backup if available\n');

    // For now, let's just check if the API is alive
    try {
      const healthCheck = await makeRequest('/api/health');
      console.log('✅ API is alive:', healthCheck);
    } catch (error) {
      console.log('❌ API health check failed:', error.message);
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

checkSubscriptions();
