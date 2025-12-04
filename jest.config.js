export default {
  // ES modules підтримка
  transform: {},
  testEnvironment: 'node',
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },

  // Розширення файлів для тестів
  testMatch: [
    '**/tests/**/*.test.js',
    '**/tests/**/*.spec.js'
  ],

  // Покриття коду
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server.js',
    '!src/**/*.test.js',
    '!src/**/*.spec.js',
    '!src/scraper/**/*.js' // Скрейпери складно тестувати через зовнішні залежності
  ],

  // Таймаут для тестів
  testTimeout: 10000,

  // Показувати покриття
  coverageDirectory: 'coverage',

  // Формат звітів покриття
  coverageReporters: ['text', 'lcov', 'html'],

  // Очистка моків між тестами
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,

  // Показувати детальну інформацію
  verbose: true
};
