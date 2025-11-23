import { Router } from 'express';
import { ScheduleController } from '../controllers/ScheduleController.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

/**
 * @swagger
 * /api/schedules/latest:
 *   get:
 *     summary: Get the latest available schedule
 *     tags: [Schedules]
 *     responses:
 *       200:
 *         description: The latest schedule
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 date:
 *                   type: string
 *                   format: date
 *                 queues:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       queue:
 *                         type: string
 *                       intervals:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             start:
 *                               type: string
 *                             end:
 *                               type: string
 */
router.get('/latest', asyncHandler(ScheduleController.getLatestSchedule));

/**
 * @swagger
 * /api/schedules/today/status:
 *   get:
 *     summary: Check if schedule for today is available
 *     tags: [Schedules]
 *     responses:
 *       200:
 *         description: Status object
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 today:
 *                   type: string
 *                   format: date
 *                 available:
 *                   type: boolean
 *                 message:
 *                   type: string
 */
router.get('/today/status', asyncHandler(ScheduleController.getTodayStatus));

/**
 * @swagger
 * /api/schedules/dates:
 *   get:
 *     summary: Get all available dates
 *     tags: [Schedules]
 *     responses:
 *       200:
 *         description: List of dates
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 dates:
 *                   type: array
 *                   items:
 *                     type: string
 *                     format: date
 */
router.get('/dates', asyncHandler(ScheduleController.getAllDates));

/**
 * @swagger
 * /api/schedules/queues/{queue}/latest:
 *   get:
 *     summary: Get latest schedule for specific queue
 *     tags: [Schedules]
 *     parameters:
 *       - in: path
 *         name: queue
 *         schema:
 *           type: string
 *         required: true
 *         description: Queue ID (e.g. 1.1)
 *     responses:
 *       200:
 *         description: Schedule for queue
 */
router.get('/queues/:queue/latest', asyncHandler(ScheduleController.getLatestScheduleByQueue));

/**
 * @swagger
 * /api/schedules/{date}:
 *   get:
 *     summary: Get schedule for specific date
 *     tags: [Schedules]
 *     parameters:
 *       - in: path
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *         required: true
 *         description: Date in YYYY-MM-DD format
 *     responses:
 *       200:
 *         description: Schedule for date
 */
router.get('/:date', asyncHandler(ScheduleController.getScheduleByDate));

/**
 * @swagger
 * /api/schedules/{date}/metadata:
 *   get:
 *     summary: Get metadata for specific date
 *     tags: [Schedules]
 *     parameters:
 *       - in: path
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *         required: true
 *     responses:
 *       200:
 *         description: Schedule metadata
 */
router.get('/:date/metadata', asyncHandler(ScheduleController.getMetadata));

/**
 * @swagger
 * /api/schedules/{date}/queues/{queue}:
 *   get:
 *     summary: Get schedule for specific date and queue
 *     tags: [Schedules]
 *     parameters:
 *       - in: path
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *         required: true
 *       - in: path
 *         name: queue
 *         schema:
 *           type: string
 *         required: true
 *     responses:
 *       200:
 *         description: Schedule for queue and date
 */
router.get('/:date/queues/:queue', asyncHandler(ScheduleController.getScheduleByQueue));

export default router;
