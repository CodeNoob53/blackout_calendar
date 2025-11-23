import { Router } from 'express';
import { AddressController } from '../controllers/AddressController.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

/**
 * @swagger
 * /api/addresses/search:
 *   get:
 *     summary: Search addresses by street name
 *     tags: [Addresses]
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         required: true
 *         description: Street name (min 3 chars). Can be Cyrillic.
 *         example: Шевченка
 *     responses:
 *       200:
 *         description: List of matching addresses
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 query:
 *                   type: string
 *                 count:
 *                   type: integer
 *                 addresses:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       street:
 *                         type: string
 *                       house:
 *                         type: string
 *                       full_address:
 *                         type: string
 *                       queue:
 *                         type: string
 *       400:
 *         description: Invalid query parameter
 */
router.get('/search', asyncHandler(AddressController.searchAddresses));

/**
 * @swagger
 * /api/addresses/exact:
 *   get:
 *     summary: Find queue by exact address
 *     tags: [Addresses]
 *     parameters:
 *       - in: query
 *         name: address
 *         schema:
 *           type: string
 *         required: true
 *         description: Full address string
 *         example: вулиця Шевченка, 1
 *     responses:
 *       200:
 *         description: Address details found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 address:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     street:
 *                       type: string
 *                     house:
 *                       type: string
 *                     full_address:
 *                       type: string
 *                     queue:
 *                       type: string
 *       404:
 *         description: Address not found
 */
router.get('/exact', asyncHandler(AddressController.findByExactAddress));

export default router;
