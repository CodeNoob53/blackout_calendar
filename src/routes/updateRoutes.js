import { Router } from 'express';
import { UpdateController } from '../controllers/UpdateController.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

// POST /api/updates/trigger - Оновити графік з Telegram (ручне)
router.post('/trigger', asyncHandler(UpdateController.triggerUpdate));

// GET /api/updates/recent - Останні оновлення
router.get('/recent', asyncHandler(UpdateController.getRecentUpdates));

// GET /api/updates/new - Нові графіки за останні N годин
router.get('/new', asyncHandler(UpdateController.getNewSchedules));

// GET /api/updates/changed - Змінені графіки за останні N годин
router.get('/changed', asyncHandler(UpdateController.getUpdatedSchedules));

export default router;
