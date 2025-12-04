/**
 * Response DTOs
 * DTO класи для стандартизації API відповідей
 */

import { BaseDTO } from './BaseDTO.js';

/**
 * DTO для успішної відповіді API
 */
export class SuccessResponseDTO extends BaseDTO {
  constructor(data, statusCode = 200) {
    super({
      success: true,
      statusCode,
      data
    });
  }

  validate() {
    super.validate();

    if (typeof this.get('success') !== 'boolean') {
      this.addError('success', 'Success must be a boolean');
    }

    if (!BaseDTO.isPositiveNumber(this.get('statusCode'))) {
      this.addError('statusCode', 'Status code must be a positive number');
    }

    // Data може бути будь-яким типом
    if (this.get('data') === undefined) {
      this.addError('data', 'Data is required');
    }

    return !this.hasErrors();
  }

  toObject() {
    return {
      success: this.get('success'),
      data: this.get('data')
    };
  }

  /**
   * Отримати HTTP статус код
   * @returns {number}
   */
  getStatusCode() {
    return this.get('statusCode');
  }
}

/**
 * DTO для відповіді з помилкою
 */
export class ErrorResponseDTO extends BaseDTO {
  constructor(message, statusCode = 400, details = null) {
    super({
      success: false,
      statusCode,
      error: {
        message,
        details
      }
    });
  }

  validate() {
    super.validate();

    if (typeof this.get('success') !== 'boolean') {
      this.addError('success', 'Success must be a boolean');
    }

    if (!BaseDTO.isPositiveNumber(this.get('statusCode'))) {
      this.addError('statusCode', 'Status code must be a positive number');
    }

    const error = this.get('error');
    if (!error || typeof error !== 'object') {
      this.addError('error', 'Error must be an object');
    } else {
      if (!BaseDTO.isNonEmptyString(error.message)) {
        this.addError('error.message', 'Error message must be a non-empty string');
      }
    }

    return !this.hasErrors();
  }

  toObject() {
    const result = {
      success: this.get('success'),
      error: {
        message: this.get('error').message
      }
    };

    const details = this.get('error').details;
    if (details !== null && details !== undefined) {
      result.error.details = details;
    }

    return result;
  }

  /**
   * Отримати HTTP статус код
   * @returns {number}
   */
  getStatusCode() {
    return this.get('statusCode');
  }
}

/**
 * DTO для відповіді "не знайдено"
 */
export class NotFoundResponseDTO extends ErrorResponseDTO {
  constructor(message = 'Resource not found') {
    super(message, 404);
  }
}

/**
 * DTO для відповіді з помилкою валідації
 */
export class ValidationErrorResponseDTO extends ErrorResponseDTO {
  constructor(message, validationErrors = []) {
    super(message, 400, { validationErrors });
  }

  validate() {
    super.validate();

    const details = this.get('error')?.details;
    if (details && details.validationErrors) {
      if (!Array.isArray(details.validationErrors)) {
        this.addError('error.details.validationErrors', 'Validation errors must be an array');
      }
    }

    return !this.hasErrors();
  }
}

/**
 * DTO для відповіді з пагінацією
 */
export class PaginatedResponseDTO extends SuccessResponseDTO {
  constructor(data, pagination, statusCode = 200) {
    super({ items: data, pagination }, statusCode);
  }

  validate() {
    super.validate();

    const data = this.get('data');
    if (!data || typeof data !== 'object') {
      this.addError('data', 'Data must be an object');
      return !this.hasErrors();
    }

    if (!Array.isArray(data.items)) {
      this.addError('data.items', 'Items must be an array');
    }

    const pagination = data.pagination;
    if (!pagination || typeof pagination !== 'object') {
      this.addError('data.pagination', 'Pagination must be an object');
    } else {
      if (!BaseDTO.isNonNegativeNumber(pagination.total)) {
        this.addError('data.pagination.total', 'Total must be a non-negative number');
      }

      if (!BaseDTO.isPositiveNumber(pagination.limit)) {
        this.addError('data.pagination.limit', 'Limit must be a positive number');
      }

      if (!BaseDTO.isNonNegativeNumber(pagination.offset)) {
        this.addError('data.pagination.offset', 'Offset must be a non-negative number');
      }

      if (typeof pagination.hasMore !== 'boolean') {
        this.addError('data.pagination.hasMore', 'HasMore must be a boolean');
      }
    }

    return !this.hasErrors();
  }

  toObject() {
    const data = this.get('data');
    return {
      success: this.get('success'),
      data: {
        items: data.items,
        pagination: { ...data.pagination }
      }
    };
  }
}

/**
 * Фабрика для створення Response DTOs
 */
export class ResponseDTOFactory {
  /**
   * Створити успішну відповідь
   * @param {*} data - Дані
   * @param {number} statusCode - HTTP статус код
   * @returns {SuccessResponseDTO}
   */
  static success(data, statusCode = 200) {
    return new SuccessResponseDTO(data, statusCode);
  }

  /**
   * Створити відповідь з помилкою
   * @param {string} message - Повідомлення про помилку
   * @param {number} statusCode - HTTP статус код
   * @param {*} details - Додаткові деталі
   * @returns {ErrorResponseDTO}
   */
  static error(message, statusCode = 400, details = null) {
    return new ErrorResponseDTO(message, statusCode, details);
  }

  /**
   * Створити відповідь "не знайдено"
   * @param {string} message - Повідомлення
   * @returns {NotFoundResponseDTO}
   */
  static notFound(message = 'Resource not found') {
    return new NotFoundResponseDTO(message);
  }

  /**
   * Створити відповідь з помилкою валідації
   * @param {string} message - Повідомлення
   * @param {Array} validationErrors - Помилки валідації
   * @returns {ValidationErrorResponseDTO}
   */
  static validationError(message, validationErrors = []) {
    return new ValidationErrorResponseDTO(message, validationErrors);
  }

  /**
   * Створити відповідь з пагінацією
   * @param {Array} data - Дані
   * @param {Object} pagination - Інформація про пагінацію
   * @param {number} statusCode - HTTP статус код
   * @returns {PaginatedResponseDTO}
   */
  static paginated(data, pagination, statusCode = 200) {
    return new PaginatedResponseDTO(data, pagination, statusCode);
  }
}
