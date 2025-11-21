import { Router } from 'express';
import { ScheduleController } from '../controllers/ScheduleController.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

// GET /api/schedules/latest - Останній доступний графік
router.get('/latest', asyncHandler(ScheduleController.getLatestSchedule));

// GET /api/schedules/today/status - Перевірити наявність графіку на сьогодні
router.get('/today/status', asyncHandler(ScheduleController.getTodayStatus));

// GET /api/schedules/dates - Список всіх доступних дат
router.get('/dates', asyncHandler(ScheduleController.getAllDates));

// GET /api/schedules/queues/:queue/latest - Останній графік для конкретної черги
router.get('/queues/:queue/latest', asyncHandler(ScheduleController.getLatestScheduleByQueue));

// GET /api/schedules/:date - Отримати графік на конкретну дату
router.get('/:date', asyncHandler(ScheduleController.getScheduleByDate));

// GET /api/schedules/:date/metadata - Метадані графіку
router.get('/:date/metadata', asyncHandler(ScheduleController.getMetadata));

// GET /api/schedules/:date/queues/:queue - Графік для конкретної черги
router.get('/:date/queues/:queue', asyncHandler(ScheduleController.getScheduleByQueue));

export default router;
