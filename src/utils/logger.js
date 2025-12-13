import winston from "winston";

const isDebug = process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development';

const baseLogger = winston.createLogger({
  level: isDebug ? 'debug' : 'info',
  levels: winston.config.npm.levels,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.colorize(),
    winston.format.printf(({ level, message, timestamp }) => `[${timestamp}] ${level}: ${message}`)
  ),
  transports: [new winston.transports.Console()]
});

function formatMessage(label, message) {
  return label ? `[${label}] ${message}` : message;
}

function logWithData(level, label, message, data) {
  const base = formatMessage(label, message);
  if (data) {
    const serialized = typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data);
    baseLogger.log(level, `${base}\n${serialized}`);
  } else {
    baseLogger.log(level, base);
  }
}

const Logger = {
  info(label, message, data = null) {
    logWithData('info', label, message, data);
  },
  success(label, message, data = null) {
    logWithData('info', label || 'Success', message, data);
  },
  warning(label, message, data = null) {
    logWithData('warn', label, message, data);
  },
  error(label, message, error = null) {
    const errMsg = error ? `${message} | ${error.message || error}` : message;
    logWithData('error', label, errMsg, null);
  },
  debug(label, message, data = null) {
    logWithData('debug', label, message, data);
  },
  server(message, data = null) {
    this.info('Server', message, data);
  },
  db(message, data = null) {
    this.info('Database', message, data);
  },
  cron(message, data = null) {
    this.info('Scheduler', message, data);
  },
  api(message, data = null) {
    this.info('API', message, data);
  },
  stats(label, data) {
    const entries = Object.entries(data || {}).map(([k, v]) => `${k}: ${v}`).join(', ');
    this.info(label, `Stats: ${entries}`);
  },
  list(label, items, type = 'info') {
    if (!items || items.length === 0) {
      this.info(label, '(empty)');
      return;
    }
    logWithData(type, label, items.join(', '), null);
  },
  divider() {
    console.log('─'.repeat(60));
  },
  banner(title, version, env) {
    const lines = [
      '═'.repeat(60),
      `  ${title}${version ? ` v${version}` : ''}`,
      env ? `  Environment: ${env}` : null,
      '═'.repeat(60),
    ].filter(Boolean);
    console.log('\n' + lines.join('\n') + '\n');
  },
  updateSummary(result) {
    const { total = 0, updated = 0, skipped = 0, newSchedules = [], updatedSchedules = [] } = result || {};
    this.info('Scheduler', `Total: ${total}, Updated: ${updated}, Skipped: ${skipped}`);
    if (newSchedules.length) this.info('Scheduler', `New dates: ${newSchedules.map(s => s.date).join(', ')}`);
    if (updatedSchedules.length) this.info('Scheduler', `Updated dates: ${updatedSchedules.map(s => s.date).join(', ')}`);
  }
};

export default Logger;
