import { Router } from 'express';
import { UpdateController } from '../controllers/UpdateController.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

// GET /api/updates/new - Нові графіки за останні N годин
router.get('/new', asyncHandler(UpdateController.getNewSchedules));

// GET /api/updates/changed - Змінені графіки за останні N годин
router.get('/changed', asyncHandler(UpdateController.getUpdatedSchedules));

export default router;
