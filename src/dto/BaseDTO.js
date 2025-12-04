/**
 * Base DTO Class
 * Базовий клас для всіх DTO (Data Transfer Objects)
 * Надає методи для валідації, серіалізації та документації
 */

export class BaseDTO {
  /**
   * Конструктор базового DTO
   * @param {Object} data - Вхідні дані
   */
  constructor(data = {}) {
    this._data = data;
    this._errors = [];
  }

  /**
   * Валідувати дані
   * @returns {boolean} true якщо валідно
   */
  validate() {
    this._errors = [];
    return this._errors.length === 0;
  }

  /**
   * Додати помилку валідації
   * @param {string} field - Поле з помилкою
   * @param {string} message - Повідомлення про помилку
   */
  addError(field, message) {
    this._errors.push({ field, message });
  }

  /**
   * Отримати помилки валідації
   * @returns {Array} Масив помилок
   */
  getErrors() {
    return this._errors;
  }

  /**
   * Чи є помилки
   * @returns {boolean}
   */
  hasErrors() {
    return this._errors.length > 0;
  }

  /**
   * Перетворити в простий JavaScript об'єкт
   * @returns {Object}
   */
  toObject() {
    return { ...this._data };
  }

  /**
   * Серіалізувати в JSON
   * @returns {string}
   */
  toJSON() {
    return JSON.stringify(this.toObject());
  }

  /**
   * Отримати значення поля
   * @param {string} field - Назва поля
   * @param {*} defaultValue - Значення за замовчуванням
   * @returns {*}
   */
  get(field, defaultValue = null) {
    return this._data[field] ?? defaultValue;
  }

  /**
   * Встановити значення поля
   * @param {string} field - Назва поля
   * @param {*} value - Значення
   */
  set(field, value) {
    this._data[field] = value;
  }

  /**
   * Перевірити чи поле існує
   * @param {string} field - Назва поля
   * @returns {boolean}
   */
  has(field) {
    return field in this._data;
  }

  /**
   * Перевірити чи є значення валідною датою
   * @param {string} dateString - Рядок дати
   * @returns {boolean}
   */
  static isValidDate(dateString) {
    if (!dateString || typeof dateString !== 'string') {
      return false;
    }

    // Формат YYYY-MM-DD
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(dateString)) {
      return false;
    }

    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date);
  }

  /**
   * Перевірити чи є значення валідним числом черги (X.X)
   * @param {string} queue - Номер черги
   * @returns {boolean}
   */
  static isValidQueue(queue) {
    if (!queue || typeof queue !== 'string') {
      return false;
    }

    // Формат X.X (1.1, 2.3, etc.)
    const regex = /^\d+\.\d+$/;
    return regex.test(queue);
  }

  /**
   * Перевірити чи є значення валідним часом (HH:MM)
   * @param {string} time - Час
   * @returns {boolean}
   */
  static isValidTime(time) {
    if (!time || typeof time !== 'string') {
      return false;
    }

    // Формат HH:MM
    const regex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    return regex.test(time);
  }

  /**
   * Перевірити чи є значення непорожнім рядком
   * @param {*} value - Значення
   * @returns {boolean}
   */
  static isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
  }

  /**
   * Перевірити чи є значення позитивним числом
   * @param {*} value - Значення
   * @returns {boolean}
   */
  static isPositiveNumber(value) {
    return typeof value === 'number' && value > 0 && !isNaN(value);
  }

  /**
   * Перевірити чи є значення невід'ємним числом
   * @param {*} value - Значення
   * @returns {boolean}
   */
  static isNonNegativeNumber(value) {
    return typeof value === 'number' && value >= 0 && !isNaN(value);
  }
}
