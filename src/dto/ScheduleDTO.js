/**
 * Schedule DTOs
 * DTO класи для графіків відключень електроенергії
 */

import { BaseDTO } from './BaseDTO.js';

/**
 * DTO для інтервалу відключення
 */
export class OutageIntervalDTO extends BaseDTO {
  constructor(data) {
    super(data);
  }

  validate() {
    super.validate();

    if (!BaseDTO.isValidTime(this.get('start'))) {
      this.addError('start', 'Invalid start time format (expected HH:MM)');
    }

    if (!BaseDTO.isValidTime(this.get('end'))) {
      this.addError('end', 'Invalid end time format (expected HH:MM)');
    }

    return !this.hasErrors();
  }

  toObject() {
    return {
      start: this.get('start'),
      end: this.get('end')
    };
  }
}

/**
 * DTO для черги з графіком
 */
export class QueueScheduleDTO extends BaseDTO {
  constructor(data) {
    super(data);
  }

  validate() {
    super.validate();

    if (!BaseDTO.isValidQueue(this.get('queue'))) {
      this.addError('queue', 'Invalid queue format (expected X.X)');
    }

    const intervals = this.get('intervals', []);
    if (!Array.isArray(intervals)) {
      this.addError('intervals', 'Intervals must be an array');
    } else {
      intervals.forEach((interval, index) => {
        const dto = new OutageIntervalDTO(interval);
        if (!dto.validate()) {
          this.addError(`intervals[${index}]`, `Invalid interval: ${dto.getErrors()}`);
        }
      });
    }

    return !this.hasErrors();
  }

  toObject() {
    return {
      queue: this.get('queue'),
      intervals: (this.get('intervals', []) || []).map(interval =>
        new OutageIntervalDTO(interval).toObject()
      )
    };
  }
}

/**
 * DTO для графіку за датою
 * Використовується: getScheduleByDate, getLatestSchedule
 */
export class ScheduleByDateDTO extends BaseDTO {
  constructor(data) {
    super(data);
  }

  validate() {
    super.validate();

    if (!BaseDTO.isValidDate(this.get('date'))) {
      this.addError('date', 'Invalid date format (expected YYYY-MM-DD)');
    }

    const queues = this.get('queues', []);
    if (!Array.isArray(queues)) {
      this.addError('queues', 'Queues must be an array');
    } else {
      queues.forEach((queue, index) => {
        const dto = new QueueScheduleDTO(queue);
        if (!dto.validate()) {
          this.addError(`queues[${index}]`, `Invalid queue: ${dto.getErrors()}`);
        }
      });
    }

    return !this.hasErrors();
  }

  toObject() {
    return {
      date: this.get('date'),
      queues: (this.get('queues', []) || []).map(queue =>
        new QueueScheduleDTO(queue).toObject()
      )
    };
  }
}

/**
 * DTO для графіку за чергою
 * Використовується: getScheduleByQueue, getLatestScheduleByQueue
 */
export class ScheduleByQueueDTO extends BaseDTO {
  constructor(data) {
    super(data);
  }

  validate() {
    super.validate();

    if (!BaseDTO.isValidQueue(this.get('queue'))) {
      this.addError('queue', 'Invalid queue format (expected X.X)');
    }

    if (!BaseDTO.isValidDate(this.get('date'))) {
      this.addError('date', 'Invalid date format (expected YYYY-MM-DD)');
    }

    const intervals = this.get('intervals', []);
    if (!Array.isArray(intervals)) {
      this.addError('intervals', 'Intervals must be an array');
    } else {
      intervals.forEach((interval, index) => {
        const dto = new OutageIntervalDTO(interval);
        if (!dto.validate()) {
          this.addError(`intervals[${index}]`, `Invalid interval: ${dto.getErrors()}`);
        }
      });
    }

    return !this.hasErrors();
  }

  toObject() {
    return {
      queue: this.get('queue'),
      date: this.get('date'),
      intervals: (this.get('intervals', []) || []).map(interval =>
        new OutageIntervalDTO(interval).toObject()
      )
    };
  }
}

/**
 * DTO для списку дат
 * Використовується: getAllDates
 */
export class DatesListDTO extends BaseDTO {
  constructor(data) {
    super(data);
  }

  validate() {
    super.validate();

    const dates = this.get('dates', []);
    if (!Array.isArray(dates)) {
      this.addError('dates', 'Dates must be an array');
    } else {
      dates.forEach((date, index) => {
        if (!BaseDTO.isValidDate(date)) {
          this.addError(`dates[${index}]`, `Invalid date format: ${date}`);
        }
      });
    }

    // Пагінація (опціонально)
    const pagination = this.get('pagination');
    if (pagination) {
      if (!BaseDTO.isNonNegativeNumber(pagination.total)) {
        this.addError('pagination.total', 'Total must be a non-negative number');
      }
      if (!BaseDTO.isPositiveNumber(pagination.limit)) {
        this.addError('pagination.limit', 'Limit must be a positive number');
      }
      if (!BaseDTO.isNonNegativeNumber(pagination.offset)) {
        this.addError('pagination.offset', 'Offset must be a non-negative number');
      }
    }

    return !this.hasErrors();
  }

  toObject() {
    const result = {
      dates: this.get('dates', [])
    };

    const pagination = this.get('pagination');
    if (pagination) {
      result.pagination = { ...pagination };
    }

    return result;
  }
}

/**
 * DTO для статусу на сьогодні
 * Використовується: getTodayStatus
 */
export class TodayStatusDTO extends BaseDTO {
  constructor(data) {
    super(data);
  }

  validate() {
    super.validate();

    if (!BaseDTO.isValidDate(this.get('today'))) {
      this.addError('today', 'Invalid date format (expected YYYY-MM-DD)');
    }

    if (typeof this.get('available') !== 'boolean') {
      this.addError('available', 'Available must be a boolean');
    }

    if (!BaseDTO.isNonEmptyString(this.get('message'))) {
      this.addError('message', 'Message must be a non-empty string');
    }

    return !this.hasErrors();
  }

  toObject() {
    return {
      today: this.get('today'),
      available: this.get('available'),
      message: this.get('message')
    };
  }
}

/**
 * DTO для метаданих графіку
 * Використовується: getMetadata
 */
export class ScheduleMetadataDTO extends BaseDTO {
  constructor(data) {
    super(data);
  }

  validate() {
    super.validate();

    if (!BaseDTO.isValidDate(this.get('date'))) {
      this.addError('date', 'Invalid date format (expected YYYY-MM-DD)');
    }

    const metadata = this.get('metadata');
    if (!metadata || typeof metadata !== 'object') {
      this.addError('metadata', 'Metadata must be an object');
    } else {
      // Валідація структури метаданих
      if (!BaseDTO.isNonEmptyString(metadata.source)) {
        this.addError('metadata.source', 'Source must be a non-empty string');
      }

      if (metadata.firstPublishedAt && !this.constructor.isValidISO8601(metadata.firstPublishedAt)) {
        this.addError('metadata.firstPublishedAt', 'Invalid ISO 8601 timestamp');
      }

      if (metadata.lastUpdatedAt && !this.constructor.isValidISO8601(metadata.lastUpdatedAt)) {
        this.addError('metadata.lastUpdatedAt', 'Invalid ISO 8601 timestamp');
      }
    }

    return !this.hasErrors();
  }

  toObject() {
    return {
      date: this.get('date'),
      metadata: { ...this.get('metadata') }
    };
  }

  /**
   * Перевірити чи є значення валідним ISO 8601 timestamp
   * @param {string} timestamp - Timestamp
   * @returns {boolean}
   */
  static isValidISO8601(timestamp) {
    if (!timestamp || typeof timestamp !== 'string') {
      return false;
    }

    const date = new Date(timestamp);
    return date instanceof Date && !isNaN(date) && date.toISOString() === timestamp;
  }
}

/**
 * DTO для списку оновлень
 * Використовується: getNewSchedules, getUpdatedSchedules
 */
export class UpdatesListDTO extends BaseDTO {
  constructor(data) {
    super(data);
  }

  validate() {
    super.validate();

    if (!BaseDTO.isPositiveNumber(this.get('hours'))) {
      this.addError('hours', 'Hours must be a positive number');
    }

    if (!BaseDTO.isNonNegativeNumber(this.get('count'))) {
      this.addError('count', 'Count must be a non-negative number');
    }

    const schedules = this.get('schedules', []);
    if (!Array.isArray(schedules)) {
      this.addError('schedules', 'Schedules must be an array');
    }

    return !this.hasErrors();
  }

  toObject() {
    return {
      hours: this.get('hours'),
      count: this.get('count'),
      schedules: this.get('schedules', [])
    };
  }
}
