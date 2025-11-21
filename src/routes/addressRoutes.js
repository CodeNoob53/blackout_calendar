import { Router } from 'express';
import { AddressController } from '../controllers/AddressController.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

// GET /api/addresses/search?q=вулиця - Пошук адрес за вулицею (мінімум 3 символи)
router.get('/search', asyncHandler(AddressController.searchAddresses));

// GET /api/addresses/exact?address=повна адреса - Пошук за точною адресою
router.get('/exact', asyncHandler(AddressController.findByExactAddress));

export default router;
