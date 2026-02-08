#!/usr/bin/env node

/**
 * Push Notification Testing Script
 *
 * Tests the full push notification pipeline:
 *   1. Check server health
 *   2. Show subscription stats
 *   3. Send test notification to all or specific endpoint
 *   4. Show analytics (delivery results)
 *
 * Usage:
 *   node scripts/testPushNotifications.cjs                    # Full diagnostic on production
 *   node scripts/testPushNotifications.cjs --local            # Test local server (localhost:3000)
 *   node scripts/testPushNotifications.cjs --send             # Send test push to all subscribers
 *   node scripts/testPushNotifications.cjs --send --endpoint "https://fcm.googleapis.com/..."
 *   node scripts/testPushNotifications.cjs --analytics        # Show delivery analytics
 *   node scripts/testPushNotifications.cjs --db               # Direct database diagnostic (local only)
 *   node scripts/testPushNotifications.cjs --test-all         # Test ALL notification types one by one
 *   node scripts/testPushNotifications.cjs --test-type emergency              # Test specific type
 *   node scripts/testPushNotifications.cjs --test-type power_off_30min --queue 4.1
 */

const https = require('https');
const http = require('http');
const path = require('path');

// ─── Configuration ───────────────────────────────────────────────────────────

const PRODUCTION_URL = process.env.PRODUCTION_URL || 'https://blackout-calendar-api.onrender.com';
const LOCAL_URL = 'http://localhost:3000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'boc_adm_4tTPLD9DUUwifeU19saan2MPUAUXFfPn0mZmWwa-ngw';

// ─── Argument Parsing ────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const isLocal = args.includes('--local');
const shouldSend = args.includes('--send');
const showAnalytics = args.includes('--analytics');
const dbDiagnostic = args.includes('--db');
const testAll = args.includes('--test-all');
const testTypeIdx = args.indexOf('--test-type');
const testType = testTypeIdx !== -1 ? args[testTypeIdx + 1] : null;
const endpointIdx = args.indexOf('--endpoint');
const targetEndpoint = endpointIdx !== -1 ? args[endpointIdx + 1] : null;
const queueIdx = args.indexOf('--queue');
const targetQueue = queueIdx !== -1 ? args[queueIdx + 1] : null;

const BASE_URL = isLocal ? LOCAL_URL : PRODUCTION_URL;

// ─── HTTP Helper ─────────────────────────────────────────────────────────────

function makeRequest(urlPath, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const fullUrl = new URL(urlPath, BASE_URL);
    const isHttps = fullUrl.protocol === 'https:';
    const lib = isHttps ? https : http;

    const options = {
      hostname: fullUrl.hostname,
      port: fullUrl.port || (isHttps ? 443 : 80),
      path: fullUrl.pathname + fullUrl.search,
      method,
      headers: {
        'X-API-Key': ADMIN_API_KEY,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', (error) => reject(error));
    req.setTimeout(60000, () => {
      req.destroy();
      reject(new Error('Request timeout (60s)'));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// ─── Formatting Helpers ──────────────────────────────────────────────────────

function header(title) {
  console.log('\n' + '='.repeat(65));
  console.log(`  ${title}`);
  console.log('='.repeat(65));
}

function subheader(title) {
  console.log(`\n--- ${title} ---`);
}

function ok(msg) { console.log(`  [OK] ${msg}`); }
function fail(msg) { console.log(`  [FAIL] ${msg}`); }
function info(msg) { console.log(`  [INFO] ${msg}`); }
function warn(msg) { console.log(`  [WARN] ${msg}`); }

// ─── Test Steps ──────────────────────────────────────────────────────────────

async function checkHealth() {
  header('1. Server Health Check');
  info(`Target: ${BASE_URL}`);

  try {
    const res = await makeRequest('/healthz');
    if (res.status === 200) {
      ok(`Server is alive (HTTP ${res.status})`);
    } else {
      warn(`Server responded with HTTP ${res.status}`);
    }
    return true;
  } catch (error) {
    fail(`Cannot reach server: ${error.message}`);
    if (!isLocal) {
      info('Production server (Render) may need 30-60s cold start. Try again.');
    }
    return false;
  }
}

async function checkVapidKey() {
  subheader('VAPID Key');
  try {
    const res = await makeRequest('/api/notifications/vapid-key');
    if (res.status === 200 && res.data.publicKey) {
      const key = res.data.publicKey;
      ok(`VAPID public key configured: ${key.substring(0, 30)}...`);
      if (key.length < 60) {
        warn('VAPID key looks too short - might be invalid');
      }
    } else {
      fail('VAPID public key not returned');
      info('Check VAPID_PUBLIC_KEY in .env');
    }
  } catch (error) {
    fail(`VAPID key check failed: ${error.message}`);
  }
}

async function checkSubscriptions() {
  header('2. Subscription Statistics');

  try {
    const res = await makeRequest('/api/notifications/subscriptions/details');
    if (res.status !== 200 || !res.data.success) {
      fail(`Stats endpoint returned: HTTP ${res.status}`);
      return { total: 0 };
    }

    const stats = res.data;
    console.log(`
  Total subscriptions:    ${stats.total}
  With queue selected:    ${stats.withQueue}
  Active (low failures):  ${stats.active}
  Inactive (failed 3+):   ${stats.inactive}`);

    if (stats.total === 0) {
      warn('No subscriptions found! Push notifications have no recipients.');
      info('Users need to subscribe via the frontend first.');
      return stats;
    }

    if (stats.byQueue && stats.byQueue.length > 0) {
      subheader('Subscriptions by Queue');
      stats.byQueue.forEach(item => {
        console.log(`  Queue ${String(item.queue).padEnd(6)} : ${item.count} subscriber(s)`);
      });
    }

    if (stats.recentSubscriptions && stats.recentSubscriptions.length > 0) {
      subheader('Recent Subscriptions');
      stats.recentSubscriptions.forEach((sub, i) => {
        const status = sub.failureCount >= 3 ? '[INACTIVE]' : '[ACTIVE]';
        console.log(`  ${i + 1}. ${status} queue=${sub.queue || 'null'}, failures=${sub.failureCount}, created=${sub.createdAt}`);
      });
    }

    return stats;
  } catch (error) {
    fail(`Cannot fetch stats: ${error.message}`);
    return { total: 0 };
  }
}

async function sendTestPush() {
  header('3. Sending Test Push Notification');

  const body = targetEndpoint ? { endpoint: targetEndpoint } : {};
  const target = targetEndpoint ? `endpoint: ${targetEndpoint.substring(0, 50)}...` : 'ALL subscribers';
  info(`Target: ${target}`);

  try {
    const res = await makeRequest('/api/notifications/test', 'POST', body);

    if (res.status === 200 && res.data.success) {
      ok(`Sent: ${res.data.sent}, Failed: ${res.data.failed}`);

      if (res.data.errors && res.data.errors.length > 0) {
        subheader('Send Errors');
        res.data.errors.forEach((err, i) => {
          console.log(`  ${i + 1}. HTTP ${err.statusCode}: ${err.message}`);
          console.log(`     Endpoint: ${err.endpoint}`);
          if (err.statusCode === 410 || err.statusCode === 404) {
            info('     -> Subscription expired/invalid (will be auto-removed)');
          }
        });
      }

      if (res.data.sent > 0) {
        ok('Push notifications were accepted by push service!');
        info('Check browser/device for the notification.');
        info('If not received, check:');
        info('  - Browser notification permissions');
        info('  - Service worker registration');
        info('  - Browser DevTools > Application > Service Workers');
      }
    } else {
      fail(`Test send failed: ${JSON.stringify(res.data)}`);
    }
  } catch (error) {
    fail(`Send error: ${error.message}`);
    if (error.message.includes('401') || error.message.includes('403')) {
      info('Check ADMIN_API_KEY in .env');
    }
  }
}

async function checkAnalytics() {
  header('4. Notification Analytics (last 7 days)');

  try {
    const res = await makeRequest('/api/notifications/analytics?days=7');
    if (res.status !== 200 || !res.data.success) {
      fail(`Analytics endpoint returned: HTTP ${res.status}`);
      return;
    }

    const a = res.data.analytics;
    console.log(`
  Period:              ${a.period}
  Total sent:          ${a.overall.totalSent}
  Delivered:           ${a.overall.delivered}
  Clicked:             ${a.overall.clicked}
  Dismissed:           ${a.overall.dismissed}
  Delivery rate:       ${a.overall.deliveryRate}
  Click-through rate:  ${a.overall.clickThroughRate}`);

    if (a.overall.totalSent === 0) {
      warn('No notifications sent in the last 7 days');
      info('This could mean:');
      info('  - No schedule changes happened');
      info('  - notifyScheduleChange() is not being called');
      info('  - All subscribers were filtered out');
    }

    if (a.byType && a.byType.length > 0) {
      subheader('By Notification Type');
      a.byType.forEach(t => {
        console.log(`  ${t.notification_type.padEnd(20)} total=${t.total}, delivered=${t.delivered}, clicked=${t.clicked}`);
      });
    }

    if (a.topErrors && a.topErrors.length > 0) {
      subheader('Top Errors');
      a.topErrors.forEach(e => {
        console.log(`  HTTP ${e.http_status_code || 'N/A'}: ${e.count}x - ${e.error_message || 'unknown'}`);
      });

      // Diagnose common errors
      a.topErrors.forEach(e => {
        if (e.http_status_code === 410) {
          info('410 Gone = Expired subscriptions (normal, auto-cleaned)');
        } else if (e.http_status_code === 401) {
          warn('401 Unauthorized = VAPID keys might be misconfigured');
        } else if (e.http_status_code === 413) {
          warn('413 Payload Too Large = Notification payload exceeds 4KB limit');
        }
      });
    }
  } catch (error) {
    fail(`Analytics error: ${error.message}`);
  }
}

async function directDbDiagnostic() {
  header('DATABASE DIAGNOSTIC (Direct SQLite)');

  let Database;
  try {
    Database = require('better-sqlite3');
  } catch (e) {
    fail('better-sqlite3 not installed. Run: npm install');
    return;
  }

  const dbPath = path.join(__dirname, '..', 'data', 'blackout.db');
  info(`Database: ${dbPath}`);

  let db;
  try {
    db = new Database(dbPath, { readonly: true });
  } catch (e) {
    fail(`Cannot open database: ${e.message}`);
    return;
  }

  try {
    // 1. Subscriptions overview
    subheader('Push Subscriptions');
    const total = db.prepare('SELECT COUNT(*) as c FROM push_subscriptions').get().c;
    const active = db.prepare('SELECT COUNT(*) as c FROM push_subscriptions WHERE failure_count < 5').get().c;
    console.log(`  Total: ${total}, Active: ${active}, Inactive: ${total - active}`);

    if (total > 0) {
      // 2. Check updated_at vs created_at for the filter bug
      subheader('Subscription Timestamps (checking filter bug)');
      const subs = db.prepare(`
        SELECT id, selected_queue, created_at, updated_at, last_active, failure_count,
               notification_types
        FROM push_subscriptions
        ORDER BY created_at DESC
        LIMIT 10
      `).all();

      subs.forEach((sub, i) => {
        console.log(`  ${i + 1}. id=${sub.id}, queue=${sub.selected_queue || 'null'}`);
        console.log(`     created_at:  ${sub.created_at}`);
        console.log(`     updated_at:  ${sub.updated_at}`);
        console.log(`     last_active: ${sub.last_active}`);
        console.log(`     failures:    ${sub.failure_count}`);
        console.log(`     types:       ${sub.notification_types}`);

        if (sub.updated_at !== sub.created_at) {
          warn(`     updated_at != created_at (was ${sub.updated_at})`);
          info('     This would have blocked notifications with the old filter!');
        }
      });

      // 3. Check schedule_metadata to see latest updates
      subheader('Schedule Metadata (latest 5)');
      try {
        const metas = db.prepare(`
          SELECT date, last_updated_at, update_count
          FROM schedule_metadata
          ORDER BY last_updated_at DESC
          LIMIT 5
        `).all();

        if (metas.length === 0) {
          warn('No schedule metadata found');
        } else {
          metas.forEach(m => {
            console.log(`  ${m.date}: last_updated=${m.last_updated_at}, updates=${m.update_count}`);
          });

          // 4. Simulate the filter: how many subs would receive notification?
          const latestMeta = metas[0];
          subheader(`Filter Simulation for ${latestMeta.date}`);

          const oldFilter = db.prepare(`
            SELECT COUNT(*) as c FROM push_subscriptions
            WHERE failure_count < 5
            AND updated_at < ?
            AND (notification_types LIKE '%"all"%' OR notification_types LIKE '%"schedule_change"%')
          `).get(latestMeta.last_updated_at).c;

          const newFilter = db.prepare(`
            SELECT COUNT(*) as c FROM push_subscriptions
            WHERE failure_count < 5
            AND created_at < ?
            AND (notification_types LIKE '%"all"%' OR notification_types LIKE '%"schedule_change"%')
          `).get(latestMeta.last_updated_at).c;

          console.log(`  OLD filter (updated_at < ${latestMeta.last_updated_at}): ${oldFilter} / ${active} subscribers`);
          console.log(`  NEW filter (created_at < ${latestMeta.last_updated_at}): ${newFilter} / ${active} subscribers`);

          if (oldFilter < newFilter) {
            ok(`Fix recovered ${newFilter - oldFilter} subscriber(s) that were blocked!`);
          } else if (oldFilter === newFilter) {
            info('Both filters return same count (subscriptions were not updated after creation)');
          }
        }
      } catch (e) {
        warn(`schedule_metadata table might not exist: ${e.message}`);
      }

      // 5. Recent analytics
      subheader('Recent Notification Analytics (last 24h)');
      try {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const analytics = db.prepare(`
          SELECT notification_type, delivered, COUNT(*) as c
          FROM notification_analytics
          WHERE sent_at >= ?
          GROUP BY notification_type, delivered
          ORDER BY c DESC
        `).all(since);

        if (analytics.length === 0) {
          warn('No notifications sent in last 24 hours');
        } else {
          analytics.forEach(a => {
            const status = a.delivered ? 'delivered' : 'FAILED';
            console.log(`  ${a.notification_type.padEnd(20)} ${status}: ${a.c}`);
          });
        }
      } catch (e) {
        warn(`notification_analytics table might not exist: ${e.message}`);
      }
    }
  } finally {
    db.close();
  }
}

// ─── Test by Notification Type ───────────────────────────────────────────────

const NOTIFICATION_TYPES = [
  {
    type: 'schedule_change',
    label: 'Schedule Change (updated schedule)',
    description: 'Sent when existing schedule data is updated via SyncEngine'
  },
  {
    type: 'tomorrow_schedule',
    label: 'Tomorrow Schedule (new schedule)',
    description: 'Sent when a NEW schedule for tomorrow appears'
  },
  {
    type: 'emergency',
    label: 'Emergency Blackout',
    description: 'Sent to ALL subscribers when emergency outage is detected'
  },
  {
    type: 'power_off_30min',
    label: 'Power Off Warning (30 min)',
    description: 'Sent to queue subscribers 30 min before scheduled outage'
  },
  {
    type: 'power_on',
    label: 'Power Restored',
    description: 'Sent to queue subscribers when power comes back on'
  }
];

async function sendTestByType(type, queue) {
  const typeInfo = NOTIFICATION_TYPES.find(t => t.type === type);
  if (!typeInfo) {
    fail(`Unknown type: ${type}`);
    info(`Available types: ${NOTIFICATION_TYPES.map(t => t.type).join(', ')}`);
    return false;
  }

  const body = { type };
  if (queue) body.queue = queue;

  console.log(`\n  >> ${typeInfo.label}`);
  info(typeInfo.description);
  if (queue) info(`Queue: ${queue}`);

  try {
    const res = await makeRequest('/api/notifications/test-type', 'POST', body);

    if (res.status === 200 && res.data.success) {
      ok(res.data.message);
      return true;
    } else {
      fail(`${res.data.message || JSON.stringify(res.data)}`);
      return false;
    }
  } catch (error) {
    fail(`Request failed: ${error.message}`);
    return false;
  }
}

async function testAllTypes(queue) {
  header('TESTING ALL NOTIFICATION TYPES');
  info('Sending each notification type with a 3s delay between them.');
  info('Check your browser for each notification appearing.');
  if (queue) info(`Using queue: ${queue}`);
  console.log('');

  let passed = 0;
  let failed = 0;

  for (let i = 0; i < NOTIFICATION_TYPES.length; i++) {
    const t = NOTIFICATION_TYPES[i];
    console.log(`\n  [${i + 1}/${NOTIFICATION_TYPES.length}] Testing: ${t.type}`);
    console.log('  ' + '-'.repeat(50));

    const success = await sendTestByType(t.type, queue);
    if (success) passed++;
    else failed++;

    // Wait between sends to let user see each notification
    if (i < NOTIFICATION_TYPES.length - 1) {
      process.stdout.write('  Waiting 3s before next...');
      await new Promise(r => setTimeout(r, 3000));
      console.log(' done');
    }
  }

  subheader('Results');
  console.log(`  Passed: ${passed}/${NOTIFICATION_TYPES.length}`);
  if (failed > 0) console.log(`  Failed: ${failed}/${NOTIFICATION_TYPES.length}`);

  return { passed, failed };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n  Push Notification Diagnostic Tool');
  console.log(`  Server: ${BASE_URL}`);
  console.log(`  Mode:   ${isLocal ? 'LOCAL' : 'PRODUCTION'}`);
  console.log(`  Key:    ${ADMIN_API_KEY.substring(0, 20)}...`);

  if (dbDiagnostic) {
    await directDbDiagnostic();
    return;
  }

  const serverAlive = await checkHealth();
  if (!serverAlive) {
    console.log('\nServer unreachable. Aborting.\n');
    process.exit(1);
  }

  await checkVapidKey();
  const stats = await checkSubscriptions();

  if (testAll) {
    if (stats.total === 0) {
      warn('No subscribers. Cannot test notification types.');
    } else {
      await testAllTypes(targetQueue);
    }
  } else if (testType) {
    if (stats.total === 0) {
      warn('No subscribers. Cannot test notification type.');
    } else {
      await sendTestByType(testType, targetQueue);
    }
  } else if (shouldSend) {
    if (stats.total === 0 && !targetEndpoint) {
      warn('No subscribers to send to. Skipping test send.');
    } else {
      await sendTestPush();
    }
  }

  if (showAnalytics || (!shouldSend && !testAll && !testType)) {
    await checkAnalytics();
  }

  // Summary
  header('SUMMARY');

  if (stats.total === 0) {
    fail('No push subscriptions found.');
    info('Users need to enable notifications in the app first.');
  } else if (stats.active === 0) {
    fail('All subscriptions are inactive (too many failures).');
    info('Subscriptions might have expired. Users need to re-subscribe.');
  } else {
    ok(`${stats.active} active subscriber(s) ready to receive push notifications.`);
  }

  if (!shouldSend) {
    info('Run with --send to send a test push notification.');
  }

  console.log('');
}

main().catch(err => {
  console.error('\nUnexpected error:', err);
  process.exit(1);
});
