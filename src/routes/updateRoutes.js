import { Router } from 'express';
import { UpdateController } from '../controllers/UpdateController.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

/**
 * @swagger
 * /api/updates/new:
 *   get:
 *     summary: Get new schedules posted in the last N hours
 *     tags: [Updates]
 *     parameters:
 *       - in: query
 *         name: hours
 *         schema:
 *           type: integer
 *           default: 24
 *         description: Look back hours
 *     responses:
 *       200:
 *         description: List of new schedules
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 count:
 *                   type: integer
 *                 schedules:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       date:
 *                         type: string
 *                         format: date
 *                       publishedAt:
 *                         type: string
 *                         format: date-time
 *                       pushMessage:
 *                         type: string
 */
router.get('/new', asyncHandler(UpdateController.getNewSchedules));

/**
 * @swagger
 * /api/updates/changed:
 *   get:
 *     summary: Get schedules that were updated (changed) in the last N hours
 *     tags: [Updates]
 *     parameters:
 *       - in: query
 *         name: hours
 *         schema:
 *           type: integer
 *           default: 24
 *         description: Look back hours
 *     responses:
 *       200:
 *         description: List of updated schedules
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 count:
 *                   type: integer
 *                 schedules:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       date:
 *                         type: string
 *                         format: date
 *                       lastUpdatedAt:
 *                         type: string
 *                         format: date-time
 *                       pushMessage:
 *                         type: string
 */
router.get('/changed', asyncHandler(UpdateController.getUpdatedSchedules));

export default router;
