import webpush from 'web-push';
import { db } from '../db.js';
import Logger from '../utils/logger.js';
import process from 'process';

export class NotificationService {
    static initialized = false;

    static init() {
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
     */
    static saveSubscription(subscription, userAgent) {
        if (!subscription || !subscription.endpoint) {
            throw new Error('Invalid subscription object');
        }

        const stmt = db.prepare(`
      INSERT INTO push_subscriptions (endpoint, keys_p256dh, keys_auth, user_agent)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET
        updated_at = CURRENT_TIMESTAMP,
        last_active = CURRENT_TIMESTAMP
    `);

        try {
            stmt.run(
                subscription.endpoint,
                subscription.keys.p256dh,
                subscription.keys.auth,
                userAgent || 'Unknown'
            );
            Logger.info('NotificationService', 'New push subscription saved');
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
                Logger.info('NotificationService', `Updated subscription: queue=${queue}`);
                return true;
            }
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
     * @param {Object} scheduleData - The schedule object
     * @param {string} changeType - 'new' or 'updated'
     * @param {string} notificationType - Type: 'schedule_change', 'tomorrow_schedule', 'emergency'
     */
    static async notifyScheduleChange(scheduleData, changeType, notificationType = 'schedule_change') {
        if (!this.initialized) return;

        // Фільтруємо підписників, які хочуть отримувати цей тип повідомлень
        // ВАЖЛИВО: Загальні сповіщення НЕ надсилаються користувачам з вибраною чергою
        // (вони отримають адресні сповіщення через notifyQueueSubscribers)
        const subscriptions = db.prepare(`
            SELECT * FROM push_subscriptions
            WHERE failure_count < 5
            AND selected_queue IS NULL
            AND (
                notification_types LIKE '%"all"%'
                OR notification_types LIKE ?
            )
        `).all(`%"${notificationType}"%`);

        if (subscriptions.length === 0) {
            Logger.debug('NotificationService', `No subscribers for ${notificationType}`);
            return;
        }

        const payload = JSON.stringify({
            title: changeType === 'new' ? 'Новий графік відключень!' : 'Графік оновлено!',
            body: `Отримано дані для: ${scheduleData.date}. Перевірте актуальний розклад.`,
            icon: '/icon-192x192.png',
            data: {
                type: notificationType,
                date: scheduleData.date,
                url: `/?date=${scheduleData.date}`
            }
        });

        Logger.info('NotificationService', `Sending ${notificationType} to ${subscriptions.length} subscribers...`);

        const promises = subscriptions.map(async (sub) => {
            const pushSubscription = {
                endpoint: sub.endpoint,
                keys: {
                    p256dh: sub.keys_p256dh,
                    auth: sub.keys_auth
                }
            };

            try {
                await webpush.sendNotification(pushSubscription, payload);
                db.prepare('UPDATE push_subscriptions SET last_active = CURRENT_TIMESTAMP, failure_count = 0 WHERE id = ?').run(sub.id);
            } catch (error) {
                if (error.statusCode === 410 || error.statusCode === 404) {
                    db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(sub.id);
                    Logger.debug('NotificationService', `Removed invalid subscription ${sub.id}`);
                } else {
                    db.prepare('UPDATE push_subscriptions SET failure_count = failure_count + 1 WHERE id = ?').run(sub.id);
                    Logger.error('NotificationService', `Failed to send to ${sub.id}`, error);
                }
            }
        });

        await Promise.allSettled(promises);
        Logger.info('NotificationService', 'Notification blast completed');
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

        if (subscriptions.length === 0) {
            Logger.debug('NotificationService', `No subscribers for queue ${queue}, type ${notificationType}`);
            return;
        }

        const payload = JSON.stringify({
            title: data.title,
            body: data.body,
            icon: '/icon-192x192.png',
            data: {
                type: notificationType,
                queue,
                ...data
            }
        });

        Logger.info('NotificationService', `Sending ${notificationType} to ${subscriptions.length} subscribers (queue ${queue})`);

        const promises = subscriptions.map(async (sub) => {
            try {
                await webpush.sendNotification({
                    endpoint: sub.endpoint,
                    keys: {
                        p256dh: sub.keys_p256dh,
                        auth: sub.keys_auth
                    }
                }, payload);
                db.prepare('UPDATE push_subscriptions SET last_active = CURRENT_TIMESTAMP, failure_count = 0 WHERE id = ?').run(sub.id);
            } catch (error) {
                if (error.statusCode === 410 || error.statusCode === 404) {
                    db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(sub.id);
                } else {
                    db.prepare('UPDATE push_subscriptions SET failure_count = failure_count + 1 WHERE id = ?').run(sub.id);
                }
            }
        });

        await Promise.allSettled(promises);
    }
}
