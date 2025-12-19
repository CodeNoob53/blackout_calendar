# 🔍 Push Notifications Code Audit

**Date:** 2025-12-19
**Reviewed by:** Claude Sonnet 4.5
**Codebase:** Blackout Calendar API - Push Notification System

## 📚 References

Based on industry best practices from:
- [web-push NPM package](https://www.npmjs.com/package/web-push)
- [MDN Web Push API Best Practices](https://developer.mozilla.org/en-US/docs/Web/API/Push_API/Best_Practices)
- [Web.dev: Web Push Protocol](https://web.dev/articles/push-notifications-web-push-protocol)
- [Web Push Error Handling Guide](https://pushpad.xyz/blog/web-push-errors-explained-with-http-status-codes)
- [Gravitec: Web Push Best Practices 2025](https://gravitec.net/blog/web-push-notification-best-practices/)

---

## ✅ What We're Doing Right

### 1. **VAPID Authentication** ✅
- ✅ Using VAPID keys correctly for authentication
- ✅ Keys stored in environment variables
- ✅ Proper VAPID subject (mailto) configured

**Code:** `src/services/NotificationService.js`
```javascript
webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
);
```

### 2. **Payload Encryption** ✅
- ✅ Using proper subscription object with `p256dh` and `auth` keys
- ✅ Payloads are properly encrypted by web-push library

**Code:** Lines 474-480
```javascript
const pushSubscription = {
    endpoint: sub.endpoint,
    keys: {
        p256dh: sub.keys_p256dh,
        auth: sub.keys_auth
    }
};
```

### 3. **Error Handling for 410/404** ✅
- ✅ **EXCELLENT**: Properly handling permanent failures (410 Gone, 404 Not Found)
- ✅ Deleting invalid subscriptions immediately
- ✅ Not retrying permanent failures

**Code:** Lines 486-488
```javascript
if (error.statusCode === 410 || error.statusCode === 404) {
    deleteStmt.run(sub.id);
    Logger.debug('NotificationService', `Removed invalid subscription ${sub.id}`);
}
```

**Best Practice Match:** [Web Push 410 Error Handling](https://pushpad.xyz/blog/web-push-error-410-the-push-subscription-has-expired-or-the-user-has-unsubscribed)

### 4. **Notification Tags** ✅
- ✅ Using `tag` parameter to replace old notifications
- ✅ Using `renotify: true` to show new notifications

**Code:** Lines 348-349, 392-393
```javascript
tag: `schedule-${scheduleData.date}`,
renotify: true,
```

### 5. **Deduplication** ✅
- ✅ **CUSTOM SOLUTION**: In-memory cache to prevent duplicate notifications
- ✅ 10-minute auto-cleanup
- ✅ Deduplication by type:queue:url

**Code:** Lines 457-472

### 6. **Failure Tracking** ✅
- ✅ Tracking `failure_count` per subscription
- ✅ Filtering out subscriptions with 5+ failures
- ✅ Resetting failure count on success

### 7. **Database Integration** ✅
- ✅ SQLite for storing subscriptions
- ✅ Proper schema with indexes
- ✅ Tracking `last_active`, `created_at`, `updated_at`

### 8. **Security** ✅
- ✅ HTTPS endpoints (handled by Render/Cloud Run)
- ✅ API key authentication for admin endpoints
- ✅ No API keys required for public subscribe/unsubscribe

---

## ⚠️ Issues Found & Recommendations

### 🔴 CRITICAL: Missing TTL (Time To Live)

**Issue:** No TTL specified in `webpush.sendNotification()` calls.

**Current Code:** Lines 273-279, 483
```javascript
await webpush.sendNotification(pushSubscription, payload);
```

**Problem:**
- Default TTL is **4 weeks** (2,419,200 seconds)
- For time-sensitive notifications (power outages), this is too long
- If user is offline for 1 hour, notification about "power off in 30 min" is useless

**Recommendation:**
```javascript
// For power_off_30min notifications (time-sensitive)
await webpush.sendNotification(pushSubscription, payload, {
    TTL: 3600 // 1 hour - useless after that
});

// For power_on notifications (less time-sensitive)
await webpush.sendNotification(pushSubscription, payload, {
    TTL: 14400 // 4 hours
});

// For schedule_change notifications (can wait)
await webpush.sendNotification(pushSubscription, payload, {
    TTL: 604800 // 1 week (default)
});

// For emergency notifications (urgent but not time-critical)
await webpush.sendNotification(pushSubscription, payload, {
    TTL: 86400 // 24 hours
});
```

**References:**
- [Web Push TTL Best Practices](https://pushpad.xyz/blog/web-push-ttl-definition-and-maximum-value)
- [Mozilla: Time To Live](https://academy.insiderone.com/docs/web-push-time-to-live)

---

### 🔴 CRITICAL: Missing Urgency Parameter

**Issue:** No urgency specified for notifications.

**Problem:**
- No battery optimization hints for push services
- All notifications treated as normal priority
- Power-critical notifications ("light off in 30 min") should be `high` urgency

**Recommendation:**
```javascript
// For power_off_30min (URGENT - user needs to prepare)
await webpush.sendNotification(pushSubscription, payload, {
    TTL: 3600,
    urgency: 'high' // Deliver immediately, wake device
});

// For power_on (helpful but not urgent)
await webpush.sendNotification(pushSubscription, payload, {
    TTL: 14400,
    urgency: 'normal'
});

// For schedule_change (informational)
await webpush.sendNotification(pushSubscription, payload, {
    TTL: 604800,
    urgency: 'low' // Can wait for better battery conditions
});

// For emergency (important but short TTL already filters)
await webpush.sendNotification(pushSubscription, payload, {
    TTL: 86400,
    urgency: 'high'
});
```

**Values:** `very-low`, `low`, `normal`, `high`

**References:**
- [Web Push API Urgency](https://web.dev/articles/push-notifications-web-push-protocol)
- [MDN: Push API Best Practices](https://developer.mozilla.org/en-US/docs/Web/API/Push_API/Best_Practices)

---

### 🟡 MEDIUM: Missing Topic Parameter

**Issue:** No `topic` parameter for notification coalescing.

**Use Case:**
If we send multiple "schedule changed" notifications while user is offline, only the latest should be delivered.

**Recommendation:**
```javascript
// For schedule_change - use topic to replace old messages
await webpush.sendNotification(pushSubscription, payload, {
    TTL: 604800,
    urgency: 'low',
    topic: `schedule-${scheduleData.date}` // Max 32 chars
});

// For power_off_30min - each is unique, don't coalesce
await webpush.sendNotification(pushSubscription, payload, {
    TTL: 3600,
    urgency: 'high'
    // No topic - don't replace
});
```

**Note:** Topic coalescing happens at push service level (before delivery). Our `tag` parameter handles browser-level replacement (after delivery).

**References:**
- [Web Push Protocol: Topic](https://web.dev/articles/push-notifications-web-push-protocol)

---

### 🟡 MEDIUM: No Retry Logic for Temporary Errors

**Issue:** Not retrying temporary failures like 429 (Too Many Requests) or 500 (Server Error).

**Current Code:** Lines 485-492
```javascript
} catch (error) {
    if (error.statusCode === 410 || error.statusCode === 404) {
        deleteStmt.run(sub.id); // Good!
    } else {
        incrementFailureStmt.run(sub.id); // Just increment, no retry
    }
}
```

**Problem:**
- 429 (Rate Limited) - we should retry after delay
- 500/502/503 (Server errors) - temporary, should retry
- We just increment failure count and move on

**Recommendation:**
```javascript
} catch (error) {
    if (error.statusCode === 410 || error.statusCode === 404) {
        // Permanent failure - delete immediately
        deleteStmt.run(sub.id);
        Logger.debug('NotificationService', `Removed invalid subscription ${sub.id}`);
    } else if (error.statusCode === 429) {
        // Rate limited - mark for retry later
        Logger.warn('NotificationService', `Rate limited for ${sub.id}, will retry later`);
        // Could implement retry queue here
    } else if (error.statusCode >= 500 && error.statusCode < 600) {
        // Server error - temporary, don't increment failure count immediately
        Logger.warn('NotificationService', `Temporary server error for ${sub.id}: ${error.statusCode}`);
        // Could retry after delay
    } else {
        // Other errors - increment failure count
        incrementFailureStmt.run(sub.id);
        Logger.error('NotificationService', `Failed to send to ${sub.id}`, error);
    }
}
```

**References:**
- [Web Push Errors Explained](https://pushpad.xyz/blog/web-push-errors-explained-with-http-status-codes)

---

### 🟢 LOW: Consider Using Batch Sending

**Issue:** Sending notifications sequentially with `map` + `Promise.allSettled`.

**Current Code:** Line 496
```javascript
await Promise.allSettled(tasks);
```

**This is actually GOOD** - we're already parallelizing with `Promise.allSettled`.

**Potential Optimization:**
If we have thousands of subscriptions, consider batching to avoid memory issues:
```javascript
// Process in batches of 100
const BATCH_SIZE = 100;
for (let i = 0; i < subscriptions.length; i += BATCH_SIZE) {
    const batch = subscriptions.slice(i, i + BATCH_SIZE);
    const tasks = batch.map(async (sub) => { /* ... */ });
    await Promise.allSettled(tasks);
}
```

**Current Status:** Not needed yet (we have ~2 subscribers). Add when scale increases.

---

### 🟢 LOW: Missing Content-Encoding Header

**Issue:** Not specifying content encoding preference.

**Current Code:** Using default `web-push` behavior.

**Note:** The `web-push` library handles this automatically. No action needed unless we want to force a specific encoding.

**Reference:** [Web Push Protocol](https://web.dev/articles/push-notifications-web-push-protocol)

---

## 📊 Summary Score

| Category | Score | Notes |
|----------|-------|-------|
| **Security** | 9/10 | ✅ VAPID, encryption, HTTPS, API keys |
| **Error Handling** | 7/10 | ✅ 410/404 handled correctly<br>⚠️ Missing retry logic for 429/500 |
| **Performance** | 8/10 | ✅ Parallel sending<br>✅ Deduplication<br>⚠️ No batching (not needed yet) |
| **Best Practices** | 6/10 | ❌ Missing TTL<br>❌ Missing urgency<br>⚠️ Missing topic |
| **Reliability** | 8/10 | ✅ Failure tracking<br>✅ Auto-recovery<br>✅ Database persistence |
| **Code Quality** | 9/10 | ✅ Clean, well-documented<br>✅ Separation of concerns |

**Overall:** 7.8/10 - Good foundation, needs TTL/urgency implementation.

---

## 🎯 Action Plan (Priority Order)

### Priority 1 (CRITICAL - Implement Now)
1. **Add TTL to all notification sends** - Different TTL for different notification types
2. **Add urgency parameter** - Mark urgent notifications as high priority

### Priority 2 (MEDIUM - Implement Soon)
1. **Add topic for schedule_change notifications** - Coalesce outdated schedule updates
2. **Implement retry logic for 429/500 errors** - Don't lose notifications due to temporary failures

### Priority 3 (LOW - Implement Later)
1. **Add batch processing** - When subscriber count grows above 100
2. **Add retry queue with exponential backoff** - For failed sends due to rate limiting

---

## 🔧 Proposed Code Changes

### File: `src/services/NotificationService.js`

**Change 1:** Update `sendNotifications()` to accept options:

```javascript
static async sendNotifications(subscriptions, payloadFactory, contextLabel, options = {}) {
    const {
        ttl = 604800,      // Default: 1 week
        urgency = 'normal', // Default: normal
        topic = null       // Default: no topic
    } = options;

    // ... existing code ...

    try {
        const sendOptions = { TTL: ttl, urgency };
        if (topic) sendOptions.topic = topic;

        await webpush.sendNotification(pushSubscription, payload, sendOptions);
        updateSuccessStmt.run(sub.id);
    } catch (error) {
        // Enhanced error handling here
    }
}
```

**Change 2:** Update callers to specify TTL/urgency:

```javascript
// In notifyScheduleChange()
await this.sendNotifications(subscriptions, () => payload, notificationType, {
    ttl: 604800,     // 1 week
    urgency: 'low',  // Not urgent
    topic: `schedule-${scheduleData.date}` // Coalesce updates
});

// In notifyQueueSubscribers() for power_off_30min
await this.sendNotifications(subscriptions, payloadBuilder, `${notificationType} (queue ${queue})`, {
    ttl: 3600,      // 1 hour
    urgency: 'high' // URGENT!
});

// In notifyQueueSubscribers() for power_on
await this.sendNotifications(subscriptions, payloadBuilder, `${notificationType} (queue ${queue})`, {
    ttl: 14400,       // 4 hours
    urgency: 'normal'
});

// In notifyEmergency()
await this.sendNotifications(subscriptions, () => payload, 'emergency_blackout', {
    ttl: 86400,      // 24 hours
    urgency: 'high'  // Emergency!
});
```

---

## 📝 Conclusion

The current implementation is **solid and production-ready** with good error handling for permanent failures (410/404) and excellent deduplication logic.

**Main gaps:**
1. ❌ Missing TTL - causes stale notifications
2. ❌ Missing urgency - no battery optimization

**After implementing Priority 1 changes, the system will be at 9/10 quality.**

The codebase demonstrates good understanding of web push fundamentals and follows most best practices. The suggested improvements will make it even more robust and user-friendly.
