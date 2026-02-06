import webpush from 'web-push';
import { db } from '../db.js';
import Logger from '../utils/logger.js';
import process from 'process';

export class NotificationService {
    static initialized = false;
    // Dedupe map: endpoint -> Set<notification_key>
    // Очищається автоматично кожні 10 хвилин
    static recentNotifications = new Map();

    static init() {
        // Очищення dedupe кешу кожні 10 хвилин
        setInterval(() => {
            this.recentNotifications.clear();
            Logger.debug('NotificationService', 'Cleared notification dedupe cache');
        }, 10 * 60 * 1000);

        // Очищення старих записів денних лімітів (старіші 7 днів)
        setInterval(() => {
            try {
                const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                const result = db.prepare('DELETE FROM daily_notification_counts WHERE date < ?').run(sevenDaysAgo);
                if (result.changes > 0) {
                    Logger.debug('NotificationService', `Cleaned up ${result.changes} old daily count records`);
                }
            } catch (error) {
                Logger.error('NotificationService', 'Failed to cleanup daily counts', error);
            }
        }, 24 * 60 * 60 * 1000); // Раз на добу

        if (this.initialized) return;

        if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
            Logger.warning('NotificationService', 'VAPID keys not found. Push notifications disabled.');
            return;
        }

        try {
            webpush.setVapidDetails(
                process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
                process.env.VAPID_PUBLIC_KEY,
                process.env.VAPID_PRIVATE_KEY
            );
            this.initialized = true;
            Logger.success('NotificationService', 'Web Push initialized successfully');
        } catch (error) {
            Logger.error('NotificationService', 'Failed to initialize Web Push', error);
        }
    }

    /**
     * BEST PRACTICE: Check if current time is within user's quiet hours
     * @param {Object} subscription - Subscription object with quiet_hours_start/end
     * @returns {boolean} True if in quiet hours (should NOT send)
     */
    static isInQuietHours(subscription) {
        if (!subscription.quiet_hours_start || !subscription.quiet_hours_end) {
            return false; // Якщо не налаштовані тихі години - дозволяємо
        }

        try {
            // Get user's timezone, default to Ukraine
            const timezone = subscription.timezone || 'Europe/Kiev';
            const now = new Date();

            // Get current time in user's timezone (HH:MM format)
            const userTime = now.toLocaleTimeString('en-US', {
                timeZone: timezone,
                hour12: false,
                hour: '2-digit',
                minute: '2-digit'
            });

            const [currentHour, currentMinute] = userTime.split(':').map(Number);
            const [startHour, startMinute] = subscription.quiet_hours_start.split(':').map(Number);
            const [endHour, endMinute] = subscription.quiet_hours_end.split(':').map(Number);

            const currentMinutes = currentHour * 60 + currentMinute;
            const startMinutes = startHour * 60 + startMinute;
            const endMinutes = endHour * 60 + endMinute;

            // Handle case where quiet hours span midnight (e.g., 22:00 - 08:00)
            if (startMinutes > endMinutes) {
                return currentMinutes >= startMinutes || currentMinutes < endMinutes;
            } else {
                return currentMinutes >= startMinutes && currentMinutes < endMinutes;
            }
        } catch (error) {
            Logger.error('NotificationService', 'Error checking quiet hours', error);
            return false; // У разі помилки - дозволяємо відправку
        }
    }

    /**
     * BEST PRACTICE: Check if user has reached daily notification limit
     * @param {number} subscriptionId - Subscription ID
     * @param {number} maxDaily - Maximum daily notifications allowed
     * @returns {boolean} True if can send (under limit)
     */
    static canSendNotification(subscriptionId, maxDaily) {
        if (!maxDaily || maxDaily <= 0) return true; // Якщо ліміт не встановлений - дозволяємо

        try {
            const today = new Date().toISOString().split('T')[0];
            const count = db.prepare(`
                SELECT count FROM daily_notification_counts
                WHERE subscription_id = ? AND date = ?
            `).get(subscriptionId, today);

            const currentCount = count ? count.count : 0;
            return currentCount < maxDaily;
        } catch (error) {
            Logger.error('NotificationService', 'Error checking daily limit', error);
            return true; // У разі помилки - дозволяємо відправку
        }
    }

    /**
     * BEST PRACTICE: Increment daily notification counter
     * @param {number} subscriptionId - Subscription ID
     */
    static incrementDailyCount(subscriptionId) {
        try {
            const today = new Date().toISOString().split('T')[0];
            db.prepare(`
                INSERT INTO daily_notification_counts (subscription_id, date, count)
                VALUES (?, ?, 1)
                ON CONFLICT(subscription_id, date) DO UPDATE SET count = count + 1
            `).run(subscriptionId, today);
        } catch (error) {
            Logger.error('NotificationService', 'Error incrementing daily count', error);
        }
    }

    /**
     * BEST PRACTICE: Track notification analytics for monitoring engagement
     * @param {number} subscriptionId - Subscription ID
     * @param {string} notificationType - Type of notification
     * @param {Object} payloadData - Notification payload
     * @param {boolean} delivered - Whether successfully delivered
     * @param {Object} error - Error object if failed
     */
    static trackAnalytics(subscriptionId, notificationType, payloadData, delivered, error = null) {
        try {
            db.prepare(`
                INSERT INTO notification_analytics
                (subscription_id, notification_type, notification_title, notification_body, delivered, error_message, http_status_code)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(
                subscriptionId,
                notificationType,
                payloadData.title || '',
                payloadData.body || '',
                delivered ? 1 : 0,
                error ? error.message : null,
                error ? error.statusCode : null
            );
        } catch (err) {
            Logger.error('NotificationService', 'Error tracking analytics', err);
        }
    }

    /**
     * BEST PRACTICE: Enrich notification with actions and better content
     * @param {Object} basePayload - Base notification payload
     * @param {string} notificationType - Type of notification
     * @returns {Object} Enhanced payload with actions and better formatting
     */
    static enrichNotificationContent(basePayload, notificationType) {
        const payload = { ...basePayload };

        // Add vibration pattern based on urgency
        if (notificationType === 'emergency' || notificationType === 'power_off_30min') {
            payload.vibrate = [200, 100, 200]; // Urgent pattern
        } else {
            payload.vibrate = [100, 50, 100]; // Normal pattern
        }

        // Add badge for notification count
        payload.badge = '/badge-icon.png';

        // Add actions based on notification type
        // Reset actions if not provided in base payload (or we want to override/merge)
        // But for now let's just create fresh actions based on type
        payload.actions = [];

        if (notificationType === 'schedule_change' || notificationType === 'tomorrow_schedule') {
            // New "View Changes" action
            payload.actions.push({
                action: 'view_changes',
                title: 'Переглянути зміни',
                icon: '/icons/changes.png'
            });
            
            payload.actions.push({
                action: 'view',
                title: 'Переглянути графік',
                icon: '/icons/calendar.png'
            });
        } else if (notificationType === 'power_off_30min') {
            payload.actions.push({
                action: 'view',
                title: 'Переглянути',
                icon: '/icons/view.png'
            });
            payload.actions.push({
                action: 'snooze',
                title: 'Нагадати через 15хв',
                icon: '/icons/snooze.png'
            });
        } else if (notificationType === 'power_on') {
            payload.actions.push({
                action: 'view',
                title: 'Дякую!',
                icon: '/icons/check.png'
            });
        } else if (notificationType === 'emergency') {
            payload.actions.push({
                action: 'view',
                title: 'Деталі',
                icon: '/icons/info.png'
            });
            payload.actions.push({
                action: 'share',
                title: 'Поділитися',
                icon: '/icons/share.png'
            });
        }

        // Add requireInteraction for critical notifications
        if (notificationType === 'power_off_30min' || notificationType === 'emergency') {
            payload.requireInteraction = true; // User must interact to dismiss
        }

        return payload;
    }

    /**
     * BEST PRACTICE: Send notification with exponential backoff retry
     * @param {Object} pushSubscription - Push subscription object
     * @param {string} payload - JSON payload
     * @param {Object} options - Send options
     * @param {number} retryCount - Current retry attempt (0-based)
     * @returns {Promise<void>}
     */
    static async sendWithRetry(pushSubscription, payload, options, retryCount = 0) {
        const maxRetries = 3;
        const baseDelay = 1000; // 1 second

        try {
            await webpush.sendNotification(pushSubscription, payload, options);
        } catch (error) {
            // Don't retry on permanent failures
            if (error.statusCode === 410 || error.statusCode === 404 || error.statusCode === 400) {
                throw error;
            }

            // Retry on temporary failures (5xx, 429)
            if (retryCount < maxRetries && (error.statusCode >= 500 || error.statusCode === 429)) {
                const delay = baseDelay * Math.pow(2, retryCount); // Exponential backoff: 1s, 2s, 4s
                Logger.warning('NotificationService', `Retry ${retryCount + 1}/${maxRetries} after ${delay}ms (status: ${error.statusCode})`);

                await new Promise(resolve => setTimeout(resolve, delay));
                return this.sendWithRetry(pushSubscription, payload, options, retryCount + 1);
            }

            throw error;
        }
    }

    /**
     * Subscribe a new client
     * @param {Object} subscription - PushSubscription object from client
     * @param {string} userAgent - User agent string
     * @param {string} [queue] - Optional queue number to set immediately
     * @param {Array<string>} [notificationTypes] - Optional notification types
     */
    static saveSubscription(subscription, userAgent, queue = null, notificationTypes = null) {
        if (!subscription || !subscription.endpoint) {
            throw new Error('Invalid subscription object');
        }

        const fields = ['endpoint', 'keys_p256dh', 'keys_auth', 'user_agent'];
        const values = [
            subscription.endpoint,
            subscription.keys.p256dh,
            subscription.keys.auth,
            userAgent || 'Unknown'
        ];
        const updateFields = ['updated_at = CURRENT_TIMESTAMP', 'last_active = CURRENT_TIMESTAMP'];

        // Add optional queue
        if (queue !== null && queue !== undefined) {
            fields.push('selected_queue');
            values.push(queue);
            updateFields.push('selected_queue = excluded.selected_queue');
        }

        // Add optional notification types
        if (notificationTypes !== null && notificationTypes !== undefined) {
            fields.push('notification_types');
            values.push(JSON.stringify(notificationTypes));
            updateFields.push('notification_types = excluded.notification_types');
        }

        const placeholders = fields.map(() => '?').join(', ');
        const stmt = db.prepare(`
            INSERT INTO push_subscriptions (${fields.join(', ')})
            VALUES (${placeholders})
            ON CONFLICT(endpoint) DO UPDATE SET
                ${updateFields.join(', ')}
        `);

        try {
            stmt.run(...values);
            const queueInfo = queue ? ` (queue: ${queue})` : '';
            Logger.info('NotificationService', `Push subscription saved: ${subscription.endpoint.substring(0, 50)}...${queueInfo}`);
            return true;
        } catch (error) {
            Logger.error('NotificationService', 'Failed to save subscription', error);
            return false;
        }
    }

    /**
     * Remove subscription
     * @param {string} endpoint - Subscription endpoint
     */
    static removeSubscription(endpoint) {
        try {
            const result = db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
            if (result.changes > 0) {
                Logger.info('NotificationService', `Subscription removed: ${endpoint.substring(0, 50)}...`);
                return true;
            }
            return false;
        } catch (error) {
            Logger.error('NotificationService', 'Failed to remove subscription', error);
            return false;
        }
    }

    /**
     * Update user's selected queue and notification preferences
     * @param {string} endpoint - Subscription endpoint
     * @param {string|null} queue - Queue number (e.g., "1.1") or null to unset
     * @param {Array<string>} notificationTypes - Optional array of notification types
     */
    static updateUserQueue(endpoint, queue, notificationTypes) {
        try {
            const updates = [];
            const params = [];

            if (queue !== undefined) {
                updates.push('selected_queue = ?');
                params.push(queue);
            }

            if (notificationTypes !== undefined && Array.isArray(notificationTypes)) {
                updates.push('notification_types = ?');
                params.push(JSON.stringify(notificationTypes));
            }

            if (updates.length === 0) {
                return false;
            }

            updates.push('updated_at = CURRENT_TIMESTAMP');
            params.push(endpoint);

            const stmt = db.prepare(`
                UPDATE push_subscriptions
                SET ${updates.join(', ')}
                WHERE endpoint = ?
            `);

            const result = stmt.run(...params);

            if (result.changes > 0) {
                Logger.info('NotificationService', `Updated subscription: queue=${queue}, endpoint=${endpoint.substring(0, 50)}...`);
                return true;
            }

            // Log when subscription not found
            Logger.warning('NotificationService', `Subscription not found for endpoint: ${endpoint.substring(0, 50)}...`);
            return false;
        } catch (error) {
            Logger.error('NotificationService', 'Failed to update queue', error);
            return false;
        }
    }

    /**
     * BEST PRACTICE: Update user preferences (quiet hours, limits, timezone, language)
     * @param {string} endpoint - Subscription endpoint
     * @param {Object} preferences - Preferences to update
     * @returns {boolean} Success status
     */
    static updateUserPreferences(endpoint, preferences) {
        try {
            const updates = [];
            const params = [];

            if (preferences.quietHoursStart !== undefined) {
                updates.push('quiet_hours_start = ?');
                params.push(preferences.quietHoursStart);
            }

            if (preferences.quietHoursEnd !== undefined) {
                updates.push('quiet_hours_end = ?');
                params.push(preferences.quietHoursEnd);
            }

            if (preferences.maxDailyNotifications !== undefined) {
                updates.push('max_daily_notifications = ?');
                params.push(preferences.maxDailyNotifications);
            }

            if (preferences.timezone !== undefined) {
                updates.push('timezone = ?');
                params.push(preferences.timezone);
            }

            if (preferences.language !== undefined) {
                updates.push('language = ?');
                params.push(preferences.language);
            }

            if (updates.length === 0) {
                return false;
            }

            updates.push('updated_at = CURRENT_TIMESTAMP');
            params.push(endpoint);

            const stmt = db.prepare(`
                UPDATE push_subscriptions
                SET ${updates.join(', ')}
                WHERE endpoint = ?
            `);

            const result = stmt.run(...params);

            if (result.changes > 0) {
                Logger.info('NotificationService', `Updated preferences for endpoint: ${endpoint.substring(0, 50)}...`);
                return true;
            }

            return false;
        } catch (error) {
            Logger.error('NotificationService', 'Failed to update preferences', error);
            return false;
        }
    }

    /**
     * BEST PRACTICE: Get analytics summary
     * @param {number} days - Number of days to look back (default 7)
     * @returns {Object} Analytics summary
     */
    static getAnalyticsSummary(days = 7) {
        try {
            const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

            // Overall stats
            const overall = db.prepare(`
                SELECT
                    COUNT(*) as total_sent,
                    SUM(CASE WHEN delivered = 1 THEN 1 ELSE 0 END) as delivered,
                    SUM(CASE WHEN clicked = 1 THEN 1 ELSE 0 END) as clicked,
                    SUM(CASE WHEN dismissed = 1 THEN 1 ELSE 0 END) as dismissed
                FROM notification_analytics
                WHERE sent_at >= ?
            `).get(since);

            // By notification type
            const byType = db.prepare(`
                SELECT
                    notification_type,
                    COUNT(*) as total,
                    SUM(CASE WHEN delivered = 1 THEN 1 ELSE 0 END) as delivered,
                    SUM(CASE WHEN clicked = 1 THEN 1 ELSE 0 END) as clicked
                FROM notification_analytics
                WHERE sent_at >= ?
                GROUP BY notification_type
                ORDER BY total DESC
            `).all(since);

            // Error breakdown
            const errors = db.prepare(`
                SELECT
                    http_status_code,
                    COUNT(*) as count,
                    error_message
                FROM notification_analytics
                WHERE sent_at >= ? AND delivered = 0
                GROUP BY http_status_code, error_message
                ORDER BY count DESC
                LIMIT 10
            `).all(since);

            // Calculate rates
            const deliveryRate = overall.total_sent > 0
                ? (overall.delivered / overall.total_sent * 100).toFixed(2)
                : 0;

            const clickRate = overall.delivered > 0
                ? (overall.clicked / overall.delivered * 100).toFixed(2)
                : 0;

            return {
                period: `Last ${days} days`,
                overall: {
                    totalSent: overall.total_sent,
                    delivered: overall.delivered,
                    clicked: overall.clicked,
                    dismissed: overall.dismissed,
                    deliveryRate: `${deliveryRate}%`,
                    clickThroughRate: `${clickRate}%`
                },
                byType,
                topErrors: errors
            };
        } catch (error) {
            Logger.error('NotificationService', 'Failed to get analytics', error);
            return null;
        }
    }

    /**
     * Get subscription statistics
     */
    static getSubscriptionStats() {
        try {
            const total = db.prepare('SELECT COUNT(*) as count FROM push_subscriptions').get().count;
            const withQueue = db.prepare('SELECT COUNT(*) as count FROM push_subscriptions WHERE selected_queue IS NOT NULL').get().count;
            const active = db.prepare('SELECT COUNT(*) as count FROM push_subscriptions WHERE failure_count < 3').get().count;

            return {
                total,
                withQueue,
                active,
                inactive: total - active
            };
        } catch (error) {
            Logger.error('NotificationService', 'Failed to get stats', error);
            return { total: 0, withQueue: 0, active: 0, inactive: 0 };
        }
    }

    /**
     * Get detailed subscription statistics including breakdown by queue
     */
    static getDetailedSubscriptionStats() {
        try {
            const total = db.prepare('SELECT COUNT(*) as count FROM push_subscriptions').get().count;
            const withQueue = db.prepare('SELECT COUNT(*) as count FROM push_subscriptions WHERE selected_queue IS NOT NULL').get().count;
            const active = db.prepare('SELECT COUNT(*) as count FROM push_subscriptions WHERE failure_count < 3').get().count;

            // Get breakdown by queue
            const byQueue = db.prepare(`
                SELECT selected_queue, COUNT(*) as count
                FROM push_subscriptions
                GROUP BY selected_queue
                ORDER BY count DESC
            `).all();

            // Get recent subscriptions
            const recentSubs = db.prepare(`
                SELECT endpoint, selected_queue, created_at, last_active, failure_count
                FROM push_subscriptions
                ORDER BY created_at DESC
                LIMIT 10
            `).all();

            return {
                total,
                withQueue,
                active,
                inactive: total - active,
                byQueue: byQueue.map(row => ({
                    queue: row.selected_queue || 'NULL',
                    count: row.count
                })),
                recentSubscriptions: recentSubs.map(sub => ({
                    endpoint: sub.endpoint.substring(0, 60) + '...',
                    queue: sub.selected_queue,
                    createdAt: sub.created_at,
                    lastActive: sub.last_active,
                    failureCount: sub.failure_count
                }))
            };
        } catch (error) {
            Logger.error('NotificationService', 'Failed to get detailed stats', error);
            return {
                total: 0,
                withQueue: 0,
                active: 0,
                inactive: 0,
                byQueue: [],
                recentSubscriptions: []
            };
        }
    }

    /**
     * Send test notification
     * @param {string|null} endpoint - Optional specific endpoint, or null for all
     */
    static async sendTestNotification(endpoint = null) {
        if (!this.initialized) {
            throw new Error('NotificationService not initialized');
        }

        const payload = JSON.stringify({
            title: 'Тестове повідомлення',
            body: 'Це тестове push-повідомлення. Все працює!',
            icon: '/icon-192x192.png',
            data: {
                type: 'test',
                timestamp: new Date().toISOString()
            }
        });

        let subscriptions;
        if (endpoint) {
            const sub = db.prepare('SELECT * FROM push_subscriptions WHERE endpoint = ?').get(endpoint);
            subscriptions = sub ? [sub] : [];
        } else {
            subscriptions = db.prepare('SELECT * FROM push_subscriptions').all();
        }

        if (subscriptions.length === 0) {
            throw new Error('No subscriptions found');
        }

        let sent = 0;
        let failed = 0;
        const errors = [];

        for (const sub of subscriptions) {
            try {
                await webpush.sendNotification({
                    endpoint: sub.endpoint,
                    keys: {
                        p256dh: sub.keys_p256dh,
                        auth: sub.keys_auth
                    }
                }, payload, {
                    TTL: 300,        // 5 minutes - test notification doesn't need long TTL
                    urgency: 'normal' // Normal priority for test
                });
                sent++;
            } catch (error) {
                failed++;
                const errorInfo = {
                    subscriptionId: sub.id,
                    endpoint: sub.endpoint.substring(0, 80) + '...',
                    statusCode: error.statusCode,
                    message: error.message,
                    body: error.body
                };
                errors.push(errorInfo);
                Logger.error('NotificationService', `Test notification failed for ${sub.id}`, error);
            }
        }

        return { sent, failed, errors };
    }

    /**
     * Send notification about schedule change
     * Надсилається тільки про ОСТАННЮ актуальну зміну графіка
     * @param {Object} scheduleData - The schedule object
     * @param {string} changeType - 'new' or 'updated'
     * @param {string} notificationType - Type: 'schedule_change', 'tomorrow_schedule', 'emergency'
     * @param {Array} changedQueues - List of queues that have changed
     */
    static async notifyScheduleChange(scheduleData, changeType, notificationType = 'schedule_change', changedQueues = []) {
        if (!this.initialized) {
            Logger.debug('NotificationService', 'Service not initialized, skipping notification');
            return;
        }

        // Get schedule metadata to find when it was last updated
        const scheduleMetadata = db.prepare(`
            SELECT last_updated_at FROM schedule_metadata WHERE date = ?
        `).get(scheduleData.date);

        if (!scheduleMetadata) {
            Logger.debug('NotificationService', `No metadata found for ${scheduleData.date}`);
            return;
        }

        Logger.info('NotificationService', `📅 Schedule change for ${scheduleData.date}: ${changeType}, last_updated=${scheduleMetadata.last_updated_at}, changedQueues=${changedQueues.length}`);

        // ONLY send to users whose subscription was created/updated BEFORE this schedule change
        // This prevents new users from getting all historical notifications
        const subscriptions = db.prepare(`
            SELECT * FROM push_subscriptions
            WHERE failure_count < 5
            AND updated_at < ?
            AND (
                notification_types LIKE '%"all"%'
                OR notification_types LIKE ?
            )
                    `).all(scheduleMetadata.last_updated_at, `%"${notificationType}"%`);

        Logger.info('NotificationService', `👥 Found ${subscriptions.length} eligible subscribers (updated_at < ${scheduleMetadata.last_updated_at})`);

        if (subscriptions.length > 0) {
            subscriptions.forEach((sub, idx) => {
                Logger.debug('NotificationService', `  [${idx + 1}] endpoint=${sub.endpoint.substring(0, 50)}..., queue=${sub.selected_queue}`);
            });
        }

        // Dynamic payload factory for personalization
        const payloadFactory = (sub) => {
            let title = changeType === 'new' ? 'Новий графік відключень!' : 'Графік оновлено!';
            let body = `Отримано дані для: ${scheduleData.date}. Перевірте актуальний розклад.`;
            
            // Personalization based on queue
            if (sub.selected_queue) {
                // If we know which queues changed
                if (changedQueues && changedQueues.length > 0) {
                    if (changedQueues.includes(sub.selected_queue)) {
                        title = '⚠️ Зміни у вашій черзі!';
                        body = `Графік для черги ${sub.selected_queue} змінився! Перевірте новий розклад.`;
                    } else if (changeType === 'updated') {
                        // Schedule updated, but NOT for this queue
                         title = 'Графік оновлено';
                         body = `Оновлено загальний графік. Для вашої черги (${sub.selected_queue}) змін не виявлено.`;
                    }
                }
            }
            
            return JSON.stringify({
                title,
                body,
                icon: '/icon-192x192.png',
                tag: `schedule-${scheduleData.date}`, // Замінить старі повідомлення для тієї самої дати
                renotify: true, // Показати нове повідомлення навіть якщо старе вже було
                data: {
                    type: notificationType,
                    date: scheduleData.date,
                    url: `/?date=${scheduleData.date}`,
                    changedQueues: changedQueues // Pass to frontend
                }
            });
        };

        await this.sendNotifications(subscriptions, payloadFactory, notificationType, {
            ttl: 604800,     // 1 week - user can check schedule anytime
            urgency: 'low',  // Not time-critical, can wait for better battery conditions
            topic: `schedule-${scheduleData.date}` // Coalesce multiple updates for same date
        });
    }

    /**
     * Send emergency notification
     * Sends to ALL subscribers with 'emergency' or 'all' type, regardless of schedule metadata
     * @param {Object} emergencyData - Data about the emergency blackout
     */
    static async notifyEmergency(emergencyData) {
        if (!this.initialized) {
            Logger.debug('NotificationService', 'Service not initialized, skipping emergency notification');
            return;
        }

        const { date, title, body, affectedGroups } = emergencyData;

        Logger.info('NotificationService', `🚨 Sending EMERGENCY notification for ${date}`);

        // Select all eligible subscriptions
        // No check for updated_at vs schedule time - emergency is always relevant if it's new
        const subscriptions = db.prepare(`
            SELECT * FROM push_subscriptions
            WHERE failure_count < 5
            AND (
                notification_types LIKE '%"all"%'
                OR notification_types LIKE '%"emergency"%'
            )
        `).all();

        Logger.info('NotificationService', `👥 Found ${subscriptions.length} subscribers for emergency alert`);

        const payload = JSON.stringify({
            title: title || '⚠️ Аварійні відключення',
            body: body,
            icon: '/icon-192x192.png',
            tag: `emergency-${date}`, // Unique tag for this date's emergency
            renotify: true,
            data: {
                type: 'emergency',
                date: date,
                affectedGroups,
                url: `/?date=${date}&alert=emergency`
            }
        });

        await this.sendNotifications(subscriptions, () => payload, 'emergency_blackout', {
            ttl: 86400,      // 24 hours - important but loses relevance after a day
            urgency: 'high', // Emergency - deliver immediately!
            topic: `emergency-${date}` // Coalesce multiple emergency alerts for same date
        });
    }

    /**
     * Send personalized notification for specific queue
     * @param {string} queue - Queue number (e.g., "1.1")
     * @param {Object} data - Notification data
     * @param {string} notificationType - Type: 'power_off_30min', 'power_on'
     */
    static async notifyQueueSubscribers(queue, data, notificationType) {
        if (!this.initialized) return;

        const subscriptions = db.prepare(`
            SELECT * FROM push_subscriptions
            WHERE selected_queue = ?
            AND failure_count < 5
            AND (
                notification_types LIKE '%"all"%'
                OR notification_types LIKE ?
            )
        `).all(queue, `%"${notificationType}"%`);

        const payloadBuilder = () => JSON.stringify({
            title: data.title,
            body: data.body,
            icon: '/icon-192x192.png',
            data: {
                type: notificationType,
                queue,
                ...data
            }
        });

        // Different TTL and urgency based on notification type
        let options;
        if (notificationType === 'power_off_30min') {
            // CRITICAL: User needs to prepare for power outage
            options = {
                ttl: 3600,       // 1 hour - useless after power is already off
                urgency: 'high', // Deliver immediately, wake device if needed
                // No topic - each power-off warning is unique and important
            };
        } else if (notificationType === 'power_on') {
            // HELPFUL: User can plan to use power
            options = {
                ttl: 14400,       // 4 hours - still useful to know power is back
                urgency: 'normal', // Normal priority, don't wake device aggressively
                // No topic - each power-on notification is unique
            };
        } else {
            // Default for any other types
            options = {
                ttl: 7200,        // 2 hours default
                urgency: 'normal'
            };
        }

        await this.sendNotifications(subscriptions, payloadBuilder, `${notificationType} (queue ${queue})`, options);
    }

    // Shared sender to keep delivery logic consistent
    static async sendNotifications(subscriptions, payloadFactory, contextLabel, options = {}) {
        if (!subscriptions || subscriptions.length === 0) {
            Logger.debug('NotificationService', `No subscribers for ${contextLabel || 'notification'}`);
            return;
        }

        // Default options based on Web Push best practices
        const {
            ttl = 604800,      // Default: 1 week (in seconds)
            urgency = 'normal', // Default: normal priority (very-low, low, normal, high)
            topic = null       // Optional: topic for message coalescing (max 32 chars)
        } = options;

        Logger.info('NotificationService', `Sending ${contextLabel || 'notifications'} to ${subscriptions.length} subscribers (TTL: ${ttl}s, urgency: ${urgency})...`);

        const updateSuccessStmt = db.prepare('UPDATE push_subscriptions SET last_active = CURRENT_TIMESTAMP, failure_count = 0 WHERE id = ?');
        const incrementFailureStmt = db.prepare('UPDATE push_subscriptions SET failure_count = failure_count + 1 WHERE id = ?');
        const deleteStmt = db.prepare('DELETE FROM push_subscriptions WHERE id = ?');

        let skippedDuplicates = 0;
        let skippedQuietHours = 0;
        let skippedDailyLimit = 0;

        const tasks = subscriptions.map(async (sub) => {
            // BEST PRACTICE: Check quiet hours
            if (this.isInQuietHours(sub)) {
                skippedQuietHours++;
                Logger.debug('NotificationService', `Skipping notification for ${sub.id} (quiet hours)`);
                return;
            }

            // BEST PRACTICE: Check daily limit
            if (!this.canSendNotification(sub.id, sub.max_daily_notifications)) {
                skippedDailyLimit++;
                Logger.debug('NotificationService', `Skipping notification for ${sub.id} (daily limit reached)`);
                return;
            }

            const payload = payloadFactory(sub);
            const payloadData = JSON.parse(payload);

            // BEST PRACTICE: Enrich notification with actions and better content
            const notificationType = payloadData.data?.type || 'unknown';
            const enrichedPayload = this.enrichNotificationContent(payloadData, notificationType);
            const enrichedPayloadStr = JSON.stringify(enrichedPayload);

            // Dedupe: перевіряємо чи не відправляли вже це сповіщення цьому endpoint
            const dedupeKey = `${payloadData.data?.type || 'unknown'}:${payloadData.data?.queue || ''}:${payloadData.data?.url || payloadData.title}`;

            if (!this.recentNotifications.has(sub.endpoint)) {
                this.recentNotifications.set(sub.endpoint, new Set());
            }

            const userNotifications = this.recentNotifications.get(sub.endpoint);
            if (userNotifications.has(dedupeKey)) {
                skippedDuplicates++;
                Logger.debug('NotificationService', `Skipping duplicate notification for ${sub.endpoint.substring(0, 50)}... (${dedupeKey})`);
                return; // Пропускаємо дублікат
            }

            // Позначаємо що відправили
            userNotifications.add(dedupeKey);

            const pushSubscription = {
                endpoint: sub.endpoint,
                keys: {
                    p256dh: sub.keys_p256dh,
                    auth: sub.keys_auth
                }
            };

            let delivered = false;
            let sendError = null;

            try {
                // Build options for web-push
                const sendOptions = { TTL: ttl, urgency };
                if (topic) {
                    sendOptions.topic = topic;
                }

                // BEST PRACTICE: Use retry with exponential backoff
                await this.sendWithRetry(pushSubscription, enrichedPayloadStr, sendOptions);
                delivered = true;
                updateSuccessStmt.run(sub.id);

                // BEST PRACTICE: Increment daily counter
                this.incrementDailyCount(sub.id);
            } catch (error) {
                sendError = error;

                // Handle permanent failures (subscription expired/invalid)
                if (error.statusCode === 410 || error.statusCode === 404) {
                    deleteStmt.run(sub.id);
                    Logger.debug('NotificationService', `Removed invalid subscription ${sub.id} (${error.statusCode})`);
                }
                // Handle rate limiting - should retry later
                else if (error.statusCode === 429) {
                    Logger.warning('NotificationService', `Rate limited for subscription ${sub.id}, will retry on next schedule`);
                    // Don't increment failure count - this is temporary
                }
                // Handle server errors - temporary, don't penalize
                else if (error.statusCode >= 500 && error.statusCode < 600) {
                    Logger.warning('NotificationService', `Temporary server error for ${sub.id}: ${error.statusCode}`);
                    // Don't increment failure count immediately - might be temporary
                }
                // Other errors - increment failure count
                else {
                    incrementFailureStmt.run(sub.id);
                    Logger.error('NotificationService', `Failed to send to ${sub.id} (${error.statusCode}):`, error.message);
                }
            } finally {
                // BEST PRACTICE: Track analytics for all attempts
                this.trackAnalytics(sub.id, notificationType, enrichedPayload, delivered, sendError);
            }
        });

        await Promise.allSettled(tasks);

        // BEST PRACTICE: Log comprehensive statistics
        const stats = [];
        if (skippedDuplicates > 0) stats.push(`${skippedDuplicates} duplicates`);
        if (skippedQuietHours > 0) stats.push(`${skippedQuietHours} quiet hours`);
        if (skippedDailyLimit > 0) stats.push(`${skippedDailyLimit} daily limit`);

        if (stats.length > 0) {
            Logger.info('NotificationService', `Skipped: ${stats.join(', ')}`);
        }
    }
}
