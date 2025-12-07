import { Router } from 'express';
import { NotificationService } from '../services/NotificationService.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import process from 'process';

const router = Router();

/**
 * @swagger
 * /api/notifications/vapid-key:
 *   get:
 *     summary: Get VAPID Public Key
 *     tags: [Notifications]
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
router.get('/vapid-key', (req, res) => {
    res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

/**
 * @swagger
 * /api/notifications/subscribe:
 *   post:
 *     summary: Subscribe to push notifications
 *     tags: [Notifications]
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
router.post('/subscribe', asyncHandler(async (req, res) => {
    const subscription = req.body;
    const userAgent = req.headers['user-agent'];

    const success = NotificationService.saveSubscription(subscription, userAgent);

    if (success) {
        res.status(201).json({ success: true, message: 'Subscribed successfully' });
    } else {
        res.status(500).json({ success: false, message: 'Failed to save subscription' });
    }
}));

export default router;
