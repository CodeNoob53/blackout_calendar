import {
  findAddressByFullAddress,
  findAddressesByStreet
} from '../db.js';
import { ResponseFormatter } from '../utils/responseFormatter.js';

export class AddressController {
  /**
   * GET /api/addresses/search?q=вулиця - Пошук адрес за вулицею
   * Мінімум 3 символи для пошуку
   */
  static searchAddresses(req, res) {
    const { q } = req.query;

    if (!q || q.trim().length === 0) {
      const error = ResponseFormatter.error('Query parameter "q" is required', 400);
      return res.status(error.statusCode).json(error.response);
    }

    if (q.trim().length < 3) {
      const error = ResponseFormatter.error('Query must be at least 3 characters long', 400);
      return res.status(error.statusCode).json(error.response);
    }

    const addresses = findAddressesByStreet(q.trim());

    res.json(ResponseFormatter.success({
      query: q,
      count: addresses.length,
      addresses
    }));
  }

  /**
   * GET /api/addresses/exact?address=повна адреса - Пошук за точною адресою
   */
  static findByExactAddress(req, res) {
    const { address } = req.query;

    if (!address || address.trim().length === 0) {
      const error = ResponseFormatter.error('Query parameter "address" is required', 400);
      return res.status(error.statusCode).json(error.response);
    }

    const result = findAddressByFullAddress(address.trim());

    if (!result) {
      const error = ResponseFormatter.notFound(`Адресу "${address}" не знайдено в базі`);
      return res.status(error.statusCode).json(error.response);
    }

    res.json(ResponseFormatter.success({ address: result }));
  }
}
