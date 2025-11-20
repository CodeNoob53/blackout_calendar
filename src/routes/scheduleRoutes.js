import { Router } from 'express';
import { ScheduleController } from '../controllers/ScheduleController.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

// GET /api/schedules/latest - Останній доступний графік
router.get('/latest', asyncHandler(ScheduleController.getLatestSchedule));

// GET /api/schedules/dates - Список всіх доступних дат
router.get('/dates', asyncHandler(ScheduleController.getAllDates));

// GET /api/schedules/:date - Отримати графік на конкретну дату
router.get('/:date', asyncHandler(ScheduleController.getScheduleByDate));

// GET /api/schedules/:date/metadata - Метадані графіку
router.get('/:date/metadata', asyncHandler(ScheduleController.getMetadata));

// GET /api/schedules/:date/history - Історія змін для дати
router.get('/:date/history', asyncHandler(ScheduleController.getHistory));

// GET /api/schedules/:date/queues/:queue - Графік для конкретної черги
router.get('/:date/queues/:queue', asyncHandler(ScheduleController.getScheduleByQueue));

export default router;
