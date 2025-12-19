#!/usr/bin/env node

/**
 * Check subscription statistics on production and local
 */

const https = require('https');

const PRODUCTION_URL = 'https://blackout-calendar.onrender.com';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'boc_adm_4tTPLD9DUUwifeU19saan2MPUAUXFfPn0mZmWwa-ngw';

function makeRequest(url, adminKey) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'X-API-Key': adminKey,
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

    req.setTimeout(60000, () => {
      req.destroy();
      reject(new Error('Request timeout (60s) - server might be waking up from cold start'));
    });

    req.end();
  });
}

async function checkProduction() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🌐 PRODUCTION SERVER STATISTICS');
  console.log('═══════════════════════════════════════════════════════════════\n');
  console.log(`Server: ${PRODUCTION_URL}`);
  console.log(`Key: ${ADMIN_API_KEY.substring(0, 20)}...\n`);

  try {
    console.log('📡 Fetching detailed statistics...');
    console.log('⏳ Please wait (cold start may take 30-60 seconds)...\n');

    const stats = await makeRequest(`${PRODUCTION_URL}/api/notifications/subscriptions/details`, ADMIN_API_KEY);

    if (stats.success) {
      console.log('✅ SUCCESS!\n');
      console.log('📊 OVERVIEW:');
      console.log('───────────────────────────────────────────────────────────────');
      console.log(`Total subscriptions:    ${stats.total}`);
      console.log(`With queue selected:    ${stats.withQueue}`);
      console.log(`Active (working):       ${stats.active}`);
      console.log(`Inactive (failed 3+):   ${stats.inactive}`);

      if (stats.byQueue && stats.byQueue.length > 0) {
        console.log('\n📋 BREAKDOWN BY QUEUE:');
        console.log('───────────────────────────────────────────────────────────────');
        stats.byQueue.forEach(item => {
          console.log(`  Queue ${item.queue}: ${item.count} subscriber(s)`);
        });
      }

      if (stats.recentSubscriptions && stats.recentSubscriptions.length > 0) {
        console.log('\n📱 RECENT SUBSCRIPTIONS (last 10):');
        console.log('───────────────────────────────────────────────────────────────');
        stats.recentSubscriptions.forEach((sub, i) => {
          console.log(`\n${i + 1}. Endpoint: ${sub.endpoint}`);
          console.log(`   Queue: ${sub.queue || 'NULL'}`);
          console.log(`   Created: ${sub.createdAt}`);
          console.log(`   Last active: ${sub.lastActive}`);
          console.log(`   Failures: ${sub.failureCount}`);
        });
      }

      console.log('\n═══════════════════════════════════════════════════════════════\n');
    } else {
      console.log('❌ API returned error:', stats);
    }
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.log('\nPossible reasons:');
    console.log('  1. Server is cold starting (wait 60s and try again)');
    console.log('  2. Invalid API key');
    console.log('  3. Endpoint not yet deployed');
    console.log('  4. Network issue\n');
    process.exit(1);
  }
}

async function checkLocal() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('💻 LOCAL DATABASE STATISTICS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  try {
    const Database = require('better-sqlite3');
    const path = require('path');

    const dbPath = path.join(__dirname, '..', 'data', 'blackout.db');
    console.log(`Database: ${dbPath}\n`);

    const db = new Database(dbPath, { readonly: true });

    const total = db.prepare('SELECT COUNT(*) as count FROM push_subscriptions').get().count;
    const withQueue = db.prepare('SELECT COUNT(*) as count FROM push_subscriptions WHERE selected_queue IS NOT NULL').get().count;
    const active = db.prepare('SELECT COUNT(*) as count FROM push_subscriptions WHERE failure_count < 3').get().count;

    console.log('📊 OVERVIEW:');
    console.log('───────────────────────────────────────────────────────────────');
    console.log(`Total subscriptions:    ${total}`);
    console.log(`With queue selected:    ${withQueue}`);
    console.log(`Active (working):       ${active}`);
    console.log(`Inactive (failed 3+):   ${total - active}`);

    if (total > 0) {
      const byQueue = db.prepare(`
        SELECT selected_queue, COUNT(*) as count
        FROM push_subscriptions
        GROUP BY selected_queue
        ORDER BY count DESC
      `).all();

      console.log('\n📋 BREAKDOWN BY QUEUE:');
      console.log('───────────────────────────────────────────────────────────────');
      byQueue.forEach(row => {
        console.log(`  Queue ${row.selected_queue || 'NULL'}: ${row.count} subscriber(s)`);
      });

      const recentSubs = db.prepare(`
        SELECT endpoint, selected_queue, created_at, last_active, failure_count
        FROM push_subscriptions
        ORDER BY created_at DESC
        LIMIT 10
      `).all();

      console.log('\n📱 RECENT SUBSCRIPTIONS (last 10):');
      console.log('───────────────────────────────────────────────────────────────');
      recentSubs.forEach((sub, i) => {
        const endpointPreview = sub.endpoint.substring(0, 60) + '...';
        console.log(`\n${i + 1}. Endpoint: ${endpointPreview}`);
        console.log(`   Queue: ${sub.selected_queue || 'NULL'}`);
        console.log(`   Created: ${sub.created_at}`);
        console.log(`   Last active: ${sub.last_active}`);
        console.log(`   Failures: ${sub.failure_count}`);
      });
    }

    db.close();
    console.log('\n═══════════════════════════════════════════════════════════════\n');
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    console.log('Database file might not exist or is not accessible.\n');
  }
}

// Main
const args = process.argv.slice(2);
const mode = args[0] || 'production';

if (mode === 'local') {
  checkLocal();
} else if (mode === 'production' || mode === 'prod') {
  checkProduction();
} else if (mode === 'both') {
  checkLocal().then(() => checkProduction());
} else {
  console.log('Usage: node checkStats.js [production|local|both]');
  console.log('  production (default) - Check production server stats');
  console.log('  local - Check local database stats');
  console.log('  both - Check both');
  process.exit(1);
}
