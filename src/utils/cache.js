/**
 * Простий in-memory кеш з TTL (Time To Live)
 */
class Cache {
  constructor() {
    this.store = new Map();
  }

  /**
   * Отримати значення з кешу
   * @param {string} key - Ключ кешу
   * @returns {any|null} - Значення або null якщо не знайдено або прострочено
   */
  get(key) {
    const item = this.store.get(key);
    
    if (!item) {
      return null;
    }

    // Перевіряємо чи не прострочено
    if (Date.now() > item.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return item.value;
  }

  /**
   * Зберегти значення в кеш
   * @param {string} key - Ключ кешу
   * @param {any} value - Значення для збереження
   * @param {number} ttlSeconds - Час життя в секундах (за замовчуванням 60)
   */
  set(key, value, ttlSeconds = 60) {
    const expiresAt = Date.now() + (ttlSeconds * 1000);
    this.store.set(key, { value, expiresAt });
  }

  /**
   * Видалити значення з кешу
   * @param {string} key - Ключ кешу
   */
  delete(key) {
    this.store.delete(key);
  }

  /**
   * Очистити весь кеш
   */
  clear() {
    this.store.clear();
  }

  /**
   * Очистити прострочені записи
   */
  cleanup() {
    const now = Date.now();
    for (const [key, item] of this.store.entries()) {
      if (now > item.expiresAt) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Отримати статистику кешу
   */
  getStats() {
    this.cleanup(); // Очистити прострочені перед підрахунком
    return {
      size: this.store.size,
      keys: Array.from(this.store.keys())
    };
  }
}

// Експортуємо singleton instance
export default new Cache();

