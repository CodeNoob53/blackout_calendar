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
     * Send notification about schedule change
     * @param {Object} scheduleData - The schedule object
     * @param {string} changeType - 'new' or 'updated'
     */
    static async notifyScheduleChange(scheduleData, changeType) {
        if (!this.initialized) return;

        const payload = JSON.stringify({
            title: changeType === 'new' ? 'Новий графік відключень!' : 'Графік оновлено!',
            body: `Отримано дані для: ${scheduleData.date}. Перевірте актуальний розклад.`,
            icon: '/icon-192x192.png', // Adjust path as needed
            data: {
                date: scheduleData.date,
                url: `/?date=${scheduleData.date}` // Adjust URL as needed
            }
        });

        const subscriptions = db.prepare('SELECT * FROM push_subscriptions').all();

        if (subscriptions.length === 0) {
            Logger.debug('NotificationService', 'No subscribers to notify');
            return;
        }

        Logger.info('NotificationService', `Sending notifications to ${subscriptions.length} subscribers...`);

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
                // Update last_active
                db.prepare('UPDATE push_subscriptions SET last_active = CURRENT_TIMESTAMP, failure_count = 0 WHERE id = ?').run(sub.id);
            } catch (error) {
                if (error.statusCode === 410 || error.statusCode === 404) {
                    // Subscription expired or invalid
                    db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(sub.id);
                    Logger.debug('NotificationService', `Removed invalid subscription ${sub.id}`);
                } else {
                    // Increment failure count
                    db.prepare('UPDATE push_subscriptions SET failure_count = failure_count + 1 WHERE id = ?').run(sub.id);
                    Logger.error('NotificationService', `Failed to send to ${sub.id}`, error);
                }
            }
        });

        await Promise.allSettled(promises);
        Logger.info('NotificationService', 'Notification blast completed');
    }
}
