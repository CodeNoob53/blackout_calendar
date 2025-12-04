// Не імпортуємо config тут, щоб уникнути циклічних залежностей
// Використовуємо process.env напряму для logger

class Logger {
  static colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',

    // Foreground colors
    black: '\x1b[30m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    gray: '\x1b[90m',
  };

  static getTimestamp() {
    return new Date().toLocaleTimeString('uk-UA', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  static colorize(text, color) {
    return `${this.colors[color] || ''}${text}${this.colors.reset}`;
  }

  static formatPrefix(type, label) {
    const timestamp = this.colorize(`[${this.getTimestamp()}]`, 'gray');

    // Кольори для різних компонентів
    const labelColors = {
      'Scheduler': 'cyan',
      'TgScraper': 'blue',
      'ZoeScraper': 'green',
      'Database': 'magenta',
      'Server': 'yellow',
      'API': 'white'
    };

    const labelColor = labelColors[label] || 'bright';
    const labelFormatted = this.colorize(`[${label}]`, labelColor);

    const icons = {
      info: this.colorize('ℹ', 'blue'),
      success: this.colorize('✓', 'green'),
      warning: this.colorize('⚠', 'yellow'),
      error: this.colorize('✗', 'red'),
      debug: this.colorize('◆', 'magenta')
    };

    const icon = icons[type] || '';
    return `${timestamp} ${icon} ${labelFormatted}`;
  }

  static info(label, message, data = null) {
    console.log(this.formatPrefix('info', label), message);
    if (data) this.printData(data);
  }

  static success(label, message, data = null) {
    console.log(this.formatPrefix('success', label), message);
    if (data) this.printData(data);
  }

  static warning(label, message, data = null) {
    console.log(this.formatPrefix('warning', label), message);
    if (data) this.printData(data);
  }

  static error(label, message, error = null) {
    console.error(this.formatPrefix('error', label), message);
    if (error) {
      console.error(this.colorize(`  └─ ${error.message || error}`, 'red'));
    }
  }

  static debug(label, message, data = null) {
    // Перевіряємо DEBUG з .env або NODE_ENV
    const isDebug = process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development';
    if (isDebug) {
      console.log(this.formatPrefix('debug', label), message);
      if (data) this.printData(data);
    }
  }

  static printData(data) {
    const formatted = typeof data === 'object'
      ? JSON.stringify(data, null, 2)
      : data;

    formatted.split('\n').forEach(line => {
      console.log(this.colorize(`  │ ${line}`, 'gray'));
    });
  }

  // Спеціальні методи для компонентів
  static server(message, data = null) {
    this.info('Server', message, data);
  }

  static db(message, data = null) {
    this.info('Database', message, data);
  }

  static cron(message, data = null) {
    this.info('Scheduler', message, data);
  }

  static api(message, data = null) {
    this.info('API', message, data);
  }

  // Форматоване виведення статистики
  static stats(label, data) {
    console.log(this.formatPrefix('success', label), this.colorize('Статистика:', 'cyan'));

    const maxKeyLength = Math.max(...Object.keys(data).map(k => k.length));

    Object.entries(data).forEach(([key, value]) => {
      const formattedKey = key.padEnd(maxKeyLength + 2);
      const displayValue = this.colorize(String(value), 'yellow');
      console.log(`  ${this.colorize('│', 'gray')} ${formattedKey} ${displayValue}`);
    });
  }

  // Виведення списку
  static list(label, items, type = 'info') {
    if (!items || items.length === 0) {
      this.info(label, this.colorize('(порожньо)', 'gray'));
      return;
    }

    console.log(this.formatPrefix(type, label));
    items.forEach((item, index) => {
      const prefix = index === items.length - 1 ? '└─' : '├─';
      console.log(`  ${this.colorize(prefix, 'gray')} ${item}`);
    });
  }

  // Розділювач
  static divider() {
    console.log(this.colorize('─'.repeat(60), 'gray'));
  }

  // Банер при запуску
  static banner(title, version, env) {
    console.log('\n' + this.colorize('═'.repeat(60), 'cyan'));
    console.log(this.colorize(`  🚀 ${title}`, 'cyan') +
      (version ? this.colorize(` v${version}`, 'bright') : ''));
    if (env) {
      console.log(this.colorize(`  Environment: ${env}`, 'gray'));
    }
    console.log(this.colorize('═'.repeat(60), 'cyan') + '\n');
  }

  // Компактний update summary
  static updateSummary(result) {
    const { total, updated, skipped, newSchedules = [], updatedSchedules = [] } = result;

    const emoji = updated > 0 ? '✓' : '○';

    const summary = `${emoji} ${total} дат: оновлено ${this.colorize(updated, 'yellow')}, пропущено ${skipped}`;
    console.log(this.formatPrefix(updated > 0 ? 'success' : 'info', 'Scheduler'), summary);

    if (newSchedules.length > 0) {
      const dates = newSchedules.map(s => s.date).join(', ');
      console.log(`  ${this.colorize('├─', 'gray')} Нові: ${this.colorize(dates, 'green')}`);
    }

    if (updatedSchedules.length > 0) {
      const dates = updatedSchedules.map(s => s.date).join(', ');
      console.log(`  ${this.colorize('└─', 'gray')} Змінені: ${this.colorize(dates, 'yellow')}`);
    }
  }
}

export default Logger;
