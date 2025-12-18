import { Router } from 'express';
import { NotificationService } from '../services/NotificationService.js';
import { rescheduleNotifications, getNotificationStats } from '../services/ScheduleNotificationService.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAdminKey } from '../middleware/apiKeyAuth.js';
import process from 'process';

const router = Router();

const validateSubscriptionPayload = (req, res, next) => {
    const { endpoint, keys } = req.body || {};
    if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
        return res.status(400).json({
            success: false,
            message: 'Invalid subscription payload: endpoint and keys.p256dh/auth are required'
        });
    }
    next();
};

const validateEndpointBody = (req, res, next) => {
    const { endpoint } = req.body || {};
    if (!endpoint) {
        return res.status(400).json({ success: false, message: 'Endpoint is required' });
    }
    next();
};

const validateUpdateQueuePayload = (req, res, next) => {
    const { endpoint, notificationTypes } = req.body || {};
    if (!endpoint) {
        return res.status(400).json({ success: false, message: 'Endpoint is required' });
    }
    if (notificationTypes !== undefined && !Array.isArray(notificationTypes)) {
        return res.status(400).json({ success: false, message: 'notificationTypes must be an array if provided' });
    }
    next();
};

/**
 * @swagger
 * /api/notifications/vapid-key:
 *   get:
 *     summary: Get VAPID Public Key
 *     tags: [Notifications]
 *     security: []
 *     responses:
 *       200:
 *         description: VAPID Public Key
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 publicKey:
 *                   type: string
 */
router.get('/vapid-key', (_req, res) => {
    res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

/**
 * @swagger
 * /api/notifications/subscribe:
 *   post:
 *     summary: Subscribe to push notifications
 *     tags: [Notifications]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [endpoint, keys]
 *             properties:
 *               endpoint:
 *                 type: string
 *               keys:
 *                 type: object
 *                 properties:
 *                   p256dh:
 *                     type: string
 *                   auth:
 *                     type: string
 *     responses:
 *       201:
 *         description: Subscribed successfully
 */
router.post('/subscribe', validateSubscriptionPayload, asyncHandler(async (req, res) => {
    const subscription = req.body;
    const userAgent = req.headers['user-agent'];

    try {
        const success = NotificationService.saveSubscription(subscription, userAgent);
        if (success) {
            res.status(201).json({ success: true, message: 'Subscribed successfully' });
        } else {
            res.status(500).json({ success: false, message: 'Failed to save subscription' });
        }
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
}));

/**
 * @swagger
 * /api/notifications/unsubscribe:
 *   post:
 *     summary: Unsubscribe from push notifications
 *     tags: [Notifications]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [endpoint]
 *             properties:
 *               endpoint:
 *                 type: string
 *     responses:
 *       200:
 *         description: Unsubscribed successfully
 */
router.post('/unsubscribe', validateEndpointBody, asyncHandler(async (req, res) => {
    const { endpoint } = req.body;

    const success = NotificationService.removeSubscription(endpoint);

    if (success) {
        res.json({ success: true, message: 'Unsubscribed successfully' });
    } else {
        res.status(404).json({ success: false, message: 'Subscription not found' });
    }
}));

/**
 * @swagger
 * /api/notifications/update-queue:
 *   post:
 *     summary: Update selected queue for personalized notifications
 *     tags: [Notifications]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [endpoint, queue]
 *             properties:
 *               endpoint:
 *                 type: string
 *               queue:
 *                 type: string
 *                 description: Queue number (e.g., "1.1", "2.3") or null to unset
 *               notificationTypes:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Optional array of notification types to subscribe to
 *     responses:
 *       200:
 *         description: Queue updated successfully
 */
router.post('/update-queue', validateUpdateQueuePayload, asyncHandler(async (req, res) => {
    const { endpoint, queue, notificationTypes } = req.body;

    const success = NotificationService.updateUserQueue(endpoint, queue, notificationTypes);

    if (success) {
        res.json({ success: true, message: 'Queue updated successfully', queue });
    } else {
        res.status(404).json({ success: false, message: 'Subscription not found' });
    }
}));

/**
 * @swagger
 * /api/notifications/test:
 *   post:
 *     summary: Send test notification (debug only)
 *     tags: [Notifications]
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               endpoint:
 *                 type: string
 *                 description: Optional specific endpoint to test, or all if not provided
 *     responses:
 *       200:
 *         description: Test notification sent
 */
router.post('/test', requireAdminKey, asyncHandler(async (req, res) => {
    const { endpoint } = req.body;

    try {
        const result = await NotificationService.sendTestNotification(endpoint);
        res.json({
            success: true,
            message: 'Test notification sent',
            sent: result.sent,
            failed: result.failed,
            errors: result.errors || []
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}));

/**
 * @swagger
 * /api/notifications/subscriptions/count:
 *   get:
 *     summary: Get subscription statistics
 *     tags: [Notifications]
 *     responses:
 *       200:
 *         description: Subscription count and stats
 */
router.get('/subscriptions/count', requireAdminKey, (_req, res) => {
    const stats = NotificationService.getSubscriptionStats();
    res.json({ success: true, ...stats });
});

/**
 * @swagger
 * /api/notifications/test-general:
 *   post:
 *     summary: Send test general notification (debug only)
 *     tags: [Notifications]
 *     description: Test general notifications (schedule_change) that should only go to users WITHOUT selected queue
 *     responses:
 *       200:
 *         description: Test notification sent
 */
router.post('/test-general', requireAdminKey, asyncHandler(async (_req, res) => {
    try {
        await NotificationService.notifyScheduleChange(
            { date: new Date().toISOString().split('T')[0] },
            'updated',
            'schedule_change'
        );
        res.json({
            success: true,
            message: 'Test general notification sent (only to users without selected queue)'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}));

/**
 * @swagger
 * /api/notifications/reschedule:
 *   post:
 *     summary: Manually reschedule notifications for a specific date (debug only)
 *     tags: [Notifications]
 *     description: Reschedules all notifications (power_off_30min, power_on) for the specified date based on current schedule
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               date:
 *                 type: string
 *                 format: date
 *                 description: Date in YYYY-MM-DD format. Defaults to today if not provided.
 *     responses:
 *       200:
 *         description: Notifications rescheduled
 */
router.post('/reschedule', requireAdminKey, asyncHandler(async (req, res) => {
    try {
        const date = req.body.date || new Date().toISOString().split('T')[0];
        rescheduleNotifications(date);
        res.json({
            success: true,
            message: `Notifications rescheduled for ${date}`
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}));

/**
 * @swagger
 * /api/notifications/schedule-stats:
 *   get:
 *     summary: Get statistics about sent schedule notifications (debug only)
 *     tags: [Notifications]
 *     responses:
 *       200:
 *         description: Schedule notification statistics
 */
router.get('/schedule-stats', requireAdminKey, (_req, res) => {
    const stats = getNotificationStats();
    res.json({ success: true, ...stats });
});

export default router;
