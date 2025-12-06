import { AddressService } from '../services/AddressService.js';
import { ResponseFormatter } from '../utils/responseFormatter.js';

export class AddressController {
  /**
   * GET /api/addresses/search?q=вулиця - Пошук адрес за вулицею
   * Мінімум 3 символи для пошуку
   */
  static searchAddresses(req, res) {
    let { q, limit, offset } = req.query;

    if (!q || q.trim().length === 0) {
      const error = ResponseFormatter.error(req.t('errors.queryRequired'), 400);
      return res.status(error.statusCode).json(error.response);
    }

    try {
      // Спробуємо декодувати, якщо це ще не зроблено
      if (q.includes('%')) {
        q = decodeURIComponent(q);
      }
    } catch (e) {
      // Ігноруємо помилки декодування, використовуємо як є
    }

    // Пагінація (опціонально): ?q=вулиця&limit=10&offset=0
    const options = {};
    if (limit) {
      const parsedLimit = parseInt(limit, 10);
      if (isNaN(parsedLimit) || parsedLimit <= 0) {
        const error = ResponseFormatter.error(req.t('errors.limitInvalid'), 400);
        return res.status(error.statusCode).json(error.response);
      }
      options.limit = parsedLimit;
    }

    if (offset) {
      const parsedOffset = parseInt(offset, 10);
      if (isNaN(parsedOffset) || parsedOffset < 0) {
        // Reuse limitInvalid or generic error if offset specific key is missing, 
        // but better to add it. For now using hardcoded translated string or existing key.
        // uk.js doesn't have offsetInvalid. I'll interpret this as parameter validation error.
        const error = ResponseFormatter.error(req.t('errors.limitInvalid'), 400);
        return res.status(error.statusCode).json(error.response);
      }
      options.offset = parsedOffset;
    }

    const result = AddressService.searchAddresses(q.trim(), options);

    // AddressService повертає об'єкт з error якщо query занадто короткий
    // AddressService повертає об'єкт з validationError якщо query занадто короткий
    if (result.validationError) {
      const errorMsg = result.validationError === 'queryTooShort'
        ? req.t('errors.queryTooShort')
        : req.t('common.error');

      const error = ResponseFormatter.error(errorMsg, 400);
      return res.status(error.statusCode).json(error.response);
    }

    res.json(ResponseFormatter.success(result));
  }

  /**
   * GET /api/addresses/exact?address=повна адреса - Пошук за точною адресою
   */
  static findByExactAddress(req, res) {
    let { address } = req.query;

    if (!address || address.trim().length === 0) {
      const error = ResponseFormatter.error(req.t('errors.addressRequired'), 400);
      return res.status(error.statusCode).json(error.response);
    }

    try {
      if (address.includes('%')) {
        address = decodeURIComponent(address);
      }
    } catch (e) {
      // Ігноруємо помилки декодування
    }

    const result = AddressService.findByExactAddress(address.trim());

    if (!result) {
      const error = ResponseFormatter.notFound(req.t('errors.addressNotFound', { address }));
      return res.status(error.statusCode).json(error.response);
    }

    res.json(ResponseFormatter.success({ address: result }));
  }
}
