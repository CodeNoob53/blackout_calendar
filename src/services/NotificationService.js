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
            Logger.warn('NotificationService', `Subscription not found for endpoint: ${endpoint.substring(0, 50)}...`);
            return false;
        } catch (error) {
            Logger.error('NotificationService', 'Failed to update queue', error);
            return false;
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
                }, payload);
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
     */
    static async notifyScheduleChange(scheduleData, changeType, notificationType = 'schedule_change') {
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

        Logger.info('NotificationService', `📅 Schedule change for ${scheduleData.date}: ${changeType}, last_updated=${scheduleMetadata.last_updated_at}`);

        // ONLY send to users whose subscription was created/updated BEFORE this schedule change
        // This prevents new users from getting all historical notifications
        const subscriptions = db.prepare(`
            SELECT * FROM push_subscriptions
            WHERE failure_count < 5
            AND selected_queue IS NULL
            AND updated_at < ?
            AND (
                notification_types LIKE '%"all"%'
                OR notification_types LIKE ?
            )
        `).all(scheduleMetadata.last_updated_at, `%"${notificationType}"%`);

        Logger.info('NotificationService', `👥 Found ${subscriptions.length} eligible subscribers (updated_at < ${scheduleMetadata.last_updated_at})`);

        if (subscriptions.length > 0) {
            subscriptions.forEach((sub, idx) => {
                Logger.debug('NotificationService', `  [${idx + 1}] endpoint=${sub.endpoint.substring(0, 50)}..., updated_at=${sub.updated_at}`);
            });
        }

        const payload = JSON.stringify({
            title: changeType === 'new' ? 'Новий графік відключень!' : 'Графік оновлено!',
            body: `Отримано дані для: ${scheduleData.date}. Перевірте актуальний розклад.`,
            icon: '/icon-192x192.png',
            tag: `schedule-${scheduleData.date}`, // Замінить старі повідомлення для тієї самої дати
            renotify: true, // Показати нове повідомлення навіть якщо старе вже було
            data: {
                type: notificationType,
                date: scheduleData.date,
                url: `/?date=${scheduleData.date}`
            }
        });

        await this.sendNotifications(subscriptions, () => payload, notificationType);
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

        await this.sendNotifications(subscriptions, () => payload, 'emergency_blackout');
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

        await this.sendNotifications(subscriptions, payloadBuilder, `${notificationType} (queue ${queue})`);
    }

    // Shared sender to keep delivery logic consistent
    static async sendNotifications(subscriptions, payloadFactory, contextLabel) {
        if (!subscriptions || subscriptions.length === 0) {
            Logger.debug('NotificationService', `No subscribers for ${contextLabel || 'notification'}`);
            return;
        }

        Logger.info('NotificationService', `Sending ${contextLabel || 'notifications'} to ${subscriptions.length} subscribers...`);

        const updateSuccessStmt = db.prepare('UPDATE push_subscriptions SET last_active = CURRENT_TIMESTAMP, failure_count = 0 WHERE id = ?');
        const incrementFailureStmt = db.prepare('UPDATE push_subscriptions SET failure_count = failure_count + 1 WHERE id = ?');
        const deleteStmt = db.prepare('DELETE FROM push_subscriptions WHERE id = ?');

        let skippedDuplicates = 0;

        const tasks = subscriptions.map(async (sub) => {
            const payload = payloadFactory(sub);
            const payloadData = JSON.parse(payload);

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

            try {
                await webpush.sendNotification(pushSubscription, payload);
                updateSuccessStmt.run(sub.id);
            } catch (error) {
                if (error.statusCode === 410 || error.statusCode === 404) {
                    deleteStmt.run(sub.id);
                    Logger.debug('NotificationService', `Removed invalid subscription ${sub.id}`);
                } else {
                    incrementFailureStmt.run(sub.id);
                    Logger.error('NotificationService', `Failed to send to ${sub.id}`, error);
                }
            }
        });

        await Promise.allSettled(tasks);

        if (skippedDuplicates > 0) {
            Logger.info('NotificationService', `Skipped ${skippedDuplicates} duplicate notification(s)`);
        }
    }
}
