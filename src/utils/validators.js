export class DateValidator {
  static isValidDateFormat(dateStr) {
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(dateStr)) return false;

    const date = new Date(dateStr);
    return date instanceof Date && !isNaN(date);
  }

  static isValidQueue(queue) {
    return /^\d\.\d$/.test(queue);
  }

  static validateHours(hours) {
    // Перевіряємо, що це число (не рядок) та валідуємо діапазон
    if (typeof hours !== 'number' || isNaN(hours)) {
      return false;
    }
    return hours > 0 && hours <= 720; // max 30 days
  }

  static validateLimit(limit) {
    const num = parseInt(limit);
    return !isNaN(num) && num > 0 && num <= 100;
  }
}
