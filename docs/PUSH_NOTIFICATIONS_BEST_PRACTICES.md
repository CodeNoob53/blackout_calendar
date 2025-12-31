# Push Notifications Best Practices Implementation

## Overview

This document describes the push notification system improvements implemented according to 2025 industry best practices. The system now includes advanced features for user control, engagement tracking, and reliability.

## 🎯 Key Improvements

### 1. **User Preferences & Controls**

#### Quiet Hours
Users can set "Do Not Disturb" hours to prevent notifications during specific times (e.g., 22:00-08:00).

**Database Fields:**
- `quiet_hours_start` - Start time (HH:MM format)
- `quiet_hours_end` - End time (HH:MM format)

**API Endpoint:**
```bash
POST /api/notifications/preferences
{
  "endpoint": "https://...",
  "quietHoursStart": "22:00",
  "quietHoursEnd": "08:00"
}
```

#### Daily Notification Limits
Prevents notification fatigue by limiting the number of notifications per day per user.

**Database Field:**
- `max_daily_notifications` - Maximum notifications per day (default: 10)

**Features:**
- Automatic tracking of daily notification count
- Automatic cleanup of old counts (7+ days)
- Respects emergency notifications even if limit reached

#### Timezone Support
Each user can set their timezone for accurate quiet hours calculation.

**Database Field:**
- `timezone` - IANA timezone (default: "Europe/Kiev")

#### Language Preference
Prepare for future multi-language support.

**Database Field:**
- `language` - Language code (default: "uk")

---

### 2. **Rich Notification Content**

#### Dynamic Actions
Notifications now include contextual action buttons based on notification type:

**Schedule Change:**
- 📅 "Переглянути графік" (View Schedule)
- ❌ "Закрити" (Dismiss)

**Power-Off Warning (30min):**
- 👁️ "Переглянути" (View)
- ⏰ "Нагадати через 15хв" (Snooze 15min)

**Power-On:**
- ✅ "Дякую!" (Thanks!)

**Emergency:**
- ℹ️ "Деталі" (Details)
- 🔗 "Поділитися" (Share)

#### Enhanced Features
- **Vibration patterns** - Different patterns for urgent vs normal notifications
- **Badge icons** - Visual indicators on app icon
- **requireInteraction** - Critical notifications require user interaction to dismiss
- **Better formatting** - Improved title and body text

---

### 3. **Analytics & Engagement Tracking**

#### Tracked Metrics
- Total notifications sent
- Delivery rate (%)
- Click-through rate (%)
- Dismissal rate (%)
- Error breakdown by HTTP status code

#### Database Table: `notification_analytics`
```sql
CREATE TABLE notification_analytics (
  id INTEGER PRIMARY KEY,
  subscription_id INTEGER,
  notification_type TEXT,
  notification_title TEXT,
  notification_body TEXT,
  sent_at DATETIME,
  delivered BOOLEAN,
  clicked BOOLEAN,
  dismissed BOOLEAN,
  clicked_at DATETIME,
  dismissed_at DATETIME,
  error_message TEXT,
  http_status_code INTEGER
);
```

#### API Endpoint:
```bash
GET /api/notifications/analytics?days=7
```

**Response Example:**
```json
{
  "success": true,
  "analytics": {
    "period": "Last 7 days",
    "overall": {
      "totalSent": 1250,
      "delivered": 1180,
      "clicked": 340,
      "dismissed": 200,
      "deliveryRate": "94.40%",
      "clickThroughRate": "28.81%"
    },
    "byType": [
      {
        "notification_type": "power_off_30min",
        "total": 450,
        "delivered": 425,
        "clicked": 180
      },
      ...
    ],
    "topErrors": [...]
  }
}
```

---

### 4. **Improved Error Handling**

#### Exponential Backoff Retry
Failed notifications are automatically retried with exponential backoff:
- Retry 1: after 1 second
- Retry 2: after 2 seconds
- Retry 3: after 4 seconds

**Only retries temporary failures:**
- 5xx server errors
- 429 rate limiting

**Permanent failures (no retry):**
- 410 Gone (subscription expired)
- 404 Not Found
- 400 Bad Request

#### Smart Failure Tracking
- Rate-limited requests (429) don't count as failures
- Temporary server errors (5xx) don't immediately penalize subscription
- After 5 failures, subscription is skipped but not deleted

---

### 5. **Notification Deduplication**

#### Multi-Level Protection
1. **In-memory cache** - Prevents duplicate sends within 10-minute window
2. **Dedupe key** - Based on `type:queue:url`
3. **Message coalescing** - Using Web Push `topic` parameter

#### Example:
If schedule for "2025-01-15" updates 3 times in 5 minutes, only the latest notification is sent.

---

## 📊 Database Schema Changes

### New Columns in `push_subscriptions`
```sql
ALTER TABLE push_subscriptions ADD COLUMN quiet_hours_start TEXT;
ALTER TABLE push_subscriptions ADD COLUMN quiet_hours_end TEXT;
ALTER TABLE push_subscriptions ADD COLUMN max_daily_notifications INTEGER DEFAULT 10;
ALTER TABLE push_subscriptions ADD COLUMN timezone TEXT DEFAULT 'Europe/Kiev';
ALTER TABLE push_subscriptions ADD COLUMN language TEXT DEFAULT 'uk';
```

### New Table: `notification_analytics`
Tracks all notification attempts with delivery and engagement metrics.

### New Table: `daily_notification_counts`
Tracks daily notification count per user for limit enforcement.

```sql
CREATE TABLE daily_notification_counts (
  id INTEGER PRIMARY KEY,
  subscription_id INTEGER,
  date TEXT,
  count INTEGER DEFAULT 0,
  UNIQUE(subscription_id, date)
);
```

---

## 🔧 API Endpoints

### User-Facing Endpoints

#### Update Preferences
```http
POST /api/notifications/preferences
Content-Type: application/json

{
  "endpoint": "https://fcm.googleapis.com/...",
  "quietHoursStart": "22:00",
  "quietHoursEnd": "08:00",
  "maxDailyNotifications": 15,
  "timezone": "Europe/Kiev",
  "language": "uk"
}
```

### Admin Endpoints

#### Get Analytics
```http
GET /api/notifications/analytics?days=30
Authorization: Bearer ADMIN_API_KEY
```

#### Get Subscription Stats
```http
GET /api/notifications/subscriptions/details
Authorization: Bearer ADMIN_API_KEY
```

---

## 🎨 Best Practices Implemented

### ✅ Segmentation & Personalization
- Queue-based targeting (e.g., only notify users in queue "1.1")
- Notification type preferences (e.g., only emergency alerts)
- Timezone-aware scheduling

### ✅ User Control & Respect
- Quiet hours (Do Not Disturb)
- Daily notification limits
- Easy opt-out with notification type preferences

### ✅ Timing & Frequency
- Smart scheduling respecting user timezone
- Daily limits to prevent notification fatigue
- Deduplication to avoid spam

### ✅ Content Quality
- Rich notifications with action buttons
- Context-aware vibration patterns
- requireInteraction for critical alerts
- Message coalescing (replace old with new)

### ✅ Platform Best Practices
- Proper TTL values per notification type
- Urgency levels (very-low, low, normal, high)
- Topic-based message coalescing
- Exponential backoff for retries

### ✅ Analytics & Optimization
- Comprehensive delivery tracking
- Click-through rate monitoring
- Error analysis for debugging
- Type-based performance metrics

---

## 📈 Key Metrics to Monitor

### Delivery Rate
Target: >95%
- Current metric shows how many notifications successfully reached devices
- Low delivery rate indicates subscription health issues

### Click-Through Rate (CTR)
Industry Average: 20-30%
- Measures engagement and content relevance
- High CTR = users find notifications valuable

### Daily Limits Hit
Target: <5% of users
- If many users hit daily limits, consider raising defaults or improving targeting

### Error Rate by Type
- Monitor HTTP status codes
- High 410/404 = need subscription cleanup
- High 5xx = push service issues

---

## 🔮 Future Enhancements

### Planned Features
1. **A/B Testing** - Test different notification copy and timing
2. **Smart Send Time** - ML-based optimal send time per user
3. **Message Templates** - Multi-language support using `language` field
4. **Geographic Targeting** - Region-based notifications
5. **Push Priority Levels** - User-configurable importance per type

### Potential Optimizations
- Batch send with rate limiting control
- Predictive delivery failure detection
- User engagement score calculation
- Automated re-engagement campaigns

---

## 📚 References & Standards

This implementation follows industry best practices from:
- [Braze Push Notification Best Practices](https://www.braze.com/resources/articles/push-notifications-best-practices)
- [Pushwoosh 2025 Best Practices](https://www.pushwoosh.com/blog/push-notification-best-practices/)
- [MoEngage Push Notification Guide](https://www.moengage.com/learn/push-notification-best-practices/)
- W3C Push API Specification
- Web Push Protocol (RFC 8030)

---

## 🛠️ Developer Notes

### Testing Quiet Hours
```javascript
// Simulate user in quiet hours
UPDATE push_subscriptions
SET quiet_hours_start = '00:00', quiet_hours_end = '23:59'
WHERE id = 1;
```

### Testing Daily Limits
```javascript
// Manually set daily count
INSERT INTO daily_notification_counts (subscription_id, date, count)
VALUES (1, '2025-01-15', 9); -- Next notification will hit limit of 10
```

### Testing Analytics
```javascript
// Query recent analytics
SELECT * FROM notification_analytics
WHERE sent_at > datetime('now', '-1 day')
ORDER BY sent_at DESC;
```

---

## ✨ Summary

The push notification system now implements **7 major best practices**:

1. ✅ **Quiet Hours** - Respect user sleep/work schedules
2. ✅ **Daily Limits** - Prevent notification fatigue
3. ✅ **Rich Content** - Action buttons, vibration, badges
4. ✅ **Analytics** - Track delivery, CTR, errors
5. ✅ **Retry Logic** - Exponential backoff for reliability
6. ✅ **Deduplication** - Avoid spam from rapid updates
7. ✅ **Smart Targeting** - Queue-based and type-based filtering

These improvements align with industry standards and significantly enhance user experience while providing valuable insights for optimization.
