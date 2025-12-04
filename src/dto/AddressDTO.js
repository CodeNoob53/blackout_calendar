/**
 * Address DTOs
 * DTO класи для адрес
 */

import { BaseDTO } from './BaseDTO.js';

/**
 * DTO для одної адреси
 */
export class AddressDTO extends BaseDTO {
  constructor(data) {
    super(data);
  }

  validate() {
    super.validate();

    if (!BaseDTO.isNonEmptyString(this.get('full_address'))) {
      this.addError('full_address', 'Full address must be a non-empty string');
    }

    if (!BaseDTO.isNonEmptyString(this.get('street'))) {
      this.addError('street', 'Street must be a non-empty string');
    }

    if (!BaseDTO.isNonEmptyString(this.get('house'))) {
      this.addError('house', 'House must be a non-empty string');
    }

    // Queue може бути null
    const queue = this.get('queue');
    if (queue !== null && !BaseDTO.isValidQueue(queue)) {
      this.addError('queue', 'Invalid queue format (expected X.X or null)');
    }

    return !this.hasErrors();
  }

  toObject() {
    return {
      id: this.get('id'),
      full_address: this.get('full_address'),
      street: this.get('street'),
      house: this.get('house'),
      queue: this.get('queue')
    };
  }
}

/**
 * DTO для результатів пошуку адрес
 * Використовується: searchAddresses
 */
export class AddressSearchResultDTO extends BaseDTO {
  constructor(data) {
    super(data);
  }

  validate() {
    super.validate();

    if (!BaseDTO.isNonEmptyString(this.get('query'))) {
      this.addError('query', 'Query must be a non-empty string');
    }

    if (!BaseDTO.isNonNegativeNumber(this.get('count'))) {
      this.addError('count', 'Count must be a non-negative number');
    }

    const addresses = this.get('addresses', []);
    if (!Array.isArray(addresses)) {
      this.addError('addresses', 'Addresses must be an array');
    } else {
      addresses.forEach((address, index) => {
        const dto = new AddressDTO(address);
        if (!dto.validate()) {
          this.addError(`addresses[${index}]`, `Invalid address: ${dto.getErrors()}`);
        }
      });
    }

    // Опціональні поля
    const total = this.get('total');
    if (total !== undefined && !BaseDTO.isNonNegativeNumber(total)) {
      this.addError('total', 'Total must be a non-negative number');
    }

    const truncated = this.get('truncated');
    if (truncated !== undefined && typeof truncated !== 'boolean') {
      this.addError('truncated', 'Truncated must be a boolean');
    }

    // Якщо є помилка (коротший запит)
    const error = this.get('error');
    if (error !== undefined && !BaseDTO.isNonEmptyString(error)) {
      this.addError('error', 'Error must be a non-empty string');
    }

    return !this.hasErrors();
  }

  toObject() {
    const result = {
      query: this.get('query'),
      count: this.get('count'),
      addresses: (this.get('addresses', []) || []).map(address =>
        new AddressDTO(address).toObject()
      )
    };

    // Додаємо опціональні поля якщо вони є
    const total = this.get('total');
    if (total !== undefined) {
      result.total = total;
    }

    const truncated = this.get('truncated');
    if (truncated !== undefined) {
      result.truncated = truncated;
    }

    const error = this.get('error');
    if (error !== undefined) {
      result.error = error;
    }

    return result;
  }
}

/**
 * DTO для списку адрес за чергою
 * Використовується: getAddressesByQueue
 */
export class AddressListDTO extends BaseDTO {
  constructor(data) {
    super(data);
  }

  validate() {
    super.validate();

    const addresses = this.get('addresses', []);
    if (!Array.isArray(addresses)) {
      this.addError('addresses', 'Addresses must be an array');
    } else {
      addresses.forEach((address, index) => {
        const dto = new AddressDTO(address);
        if (!dto.validate()) {
          this.addError(`addresses[${index}]`, `Invalid address: ${dto.getErrors()}`);
        }
      });
    }

    return !this.hasErrors();
  }

  toObject() {
    return {
      addresses: (this.get('addresses', []) || []).map(address =>
        new AddressDTO(address).toObject()
      )
    };
  }
}

/**
 * DTO для статистики адрес
 * Використовується: getStatistics
 */
export class AddressStatisticsDTO extends BaseDTO {
  constructor(data) {
    super(data);
  }

  validate() {
    super.validate();

    if (!BaseDTO.isNonNegativeNumber(this.get('total'))) {
      this.addError('total', 'Total must be a non-negative number');
    }

    if (!BaseDTO.isNonNegativeNumber(this.get('unique_streets'))) {
      this.addError('unique_streets', 'Unique streets must be a non-negative number');
    }

    if (!BaseDTO.isNonNegativeNumber(this.get('with_queue'))) {
      this.addError('with_queue', 'With queue must be a non-negative number');
    }

    if (!BaseDTO.isNonNegativeNumber(this.get('without_queue'))) {
      this.addError('without_queue', 'Without queue must be a non-negative number');
    }

    return !this.hasErrors();
  }

  toObject() {
    return {
      total: this.get('total'),
      unique_streets: this.get('unique_streets'),
      with_queue: this.get('with_queue'),
      without_queue: this.get('without_queue')
    };
  }
}
