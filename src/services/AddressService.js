/**
 * Address Service
 * Бізнес-логіка для роботи з адресами
 */

import { AddressRepository } from '../repositories/AddressRepository.js';
import { VALIDATION } from '../config/constants.js';

export class AddressService {
  /**
   * Пошук адрес за запитом
   * @param {string} query - Пошуковий запит
   * @returns {Object} Результати пошуку
   */
  static searchAddresses(query, options = {}) {
    // Валідація довжини запиту
    if (!query || query.length < VALIDATION.MIN_SEARCH_QUERY_LENGTH) {
      return {
        query,
        count: 0,
        addresses: [],
        error: `Мінімальна довжина запиту: ${VALIDATION.MIN_SEARCH_QUERY_LENGTH} символи`
      };
    }

    const addresses = AddressRepository.findByStreet(query);
    const total = addresses.length;

    // Пагінація
    const { limit = VALIDATION.MAX_SEARCH_RESULTS, offset = 0 } = options;
    const paginated = addresses.slice(offset, offset + limit);

    const result = {
      query,
      count: paginated.length,
      total,
      addresses: paginated
    };

    // Додаємо інформацію про пагінацію якщо використовується
    if (options.limit !== undefined) {
      result.pagination = {
        limit,
        offset,
        hasMore: offset + limit < total
      };
    } else {
      // Якщо пагінація не використовується, але результати обрізані
      result.truncated = total > VALIDATION.MAX_SEARCH_RESULTS;
    }

    return result;
  }

  /**
   * Знайти адресу за точною адресою
   * @param {string} fullAddress - Повна адреса
   * @returns {Object|null} Адреса або null
   */
  static findByExactAddress(fullAddress) {
    if (!fullAddress) {
      return null;
    }

    return AddressRepository.findByFullAddress(fullAddress);
  }

  /**
   * Отримати всі адреси для черги
   * @param {string} queue - Номер черги
   * @param {Object} options - Опції {limit, offset}
   * @returns {Object} Список адрес з пагінацією
   */
  static getAddressesByQueue(queue, options = {}) {
    const addresses = AddressRepository.findByQueue(queue);
    const total = addresses.length;

    // Якщо без пагінації - повертаємо всі
    if (!options.limit) {
      return {
        queue,
        total,
        count: addresses.length,
        addresses
      };
    }

    // З пагінацією
    const { limit, offset = 0 } = options;
    const paginated = addresses.slice(offset, offset + limit);

    return {
      queue,
      total,
      count: paginated.length,
      addresses: paginated,
      pagination: {
        limit,
        offset,
        hasMore: offset + limit < total
      }
    };
  }

  /**
   * Отримати статистику
   * @returns {Object} Статистика по адресам
   */
  static getStatistics() {
    return AddressRepository.getStatistics();
  }
}
