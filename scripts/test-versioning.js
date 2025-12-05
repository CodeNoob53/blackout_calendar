/**
 * Скрипт для тестування системи версіонування графіків
 * Перевіряє міграцію БД та функціональність нової системи
 */

import { initDatabase, getVersionStats, getAllVersionsForDate } from '../src/db.js';
import Logger from '../src/utils/logger.js';
import {
  generateScheduleHash,
  generateZoeVersionId,
  generateTelegramVersionId,
  parseVersionId,
  findScheduleDifferences,
  formatDifferencesDescription
} from '../src/utils/versionHelper.js';

console.log('\n========================================');
console.log('ТЕСТ СИСТЕМИ ВЕРСІОНУВАННЯ ГРАФІКІВ');
console.log('========================================\n');

// Тест 1: Ініціалізація БД та міграція
console.log('Тест 1: Ініціалізація БД та міграція...');
try {
  initDatabase();
  console.log('✅ База даних ініціалізована, міграція виконана\n');
} catch (error) {
  console.error('❌ Помилка ініціалізації:', error.message);
  process.exit(1);
}

// Тест 2: Генерація version ID
console.log('Тест 2: Генерація version ID...');
const zoeV1 = generateZoeVersionId('2025-12-05', 1);
const zoeV2 = generateZoeVersionId('2025-12-05', 2);
const tgV1 = generateTelegramVersionId(2537);

console.log(`  Zoe v1: ${zoeV1}`);
console.log(`  Zoe v2: ${zoeV2}`);
console.log(`  Telegram: ${tgV1}`);

if (zoeV1 === 'zoe-2025-12-05-v001' && zoeV2 === 'zoe-2025-12-05-v002' && tgV1 === 'tg-2537') {
  console.log('✅ Version ID генеруються правильно\n');
} else {
  console.error('❌ Неправильний формат version ID');
  process.exit(1);
}

// Тест 3: Парсинг version ID
console.log('Тест 3: Парсинг version ID...');
const parsedZoe = parseVersionId(zoeV1);
const parsedTg = parseVersionId(tgV1);

console.log('  Zoe parsed:', parsedZoe);
console.log('  Telegram parsed:', parsedTg);

if (
  parsedZoe.source === 'zoe' &&
  parsedZoe.date === '2025-12-05' &&
  parsedZoe.versionNumber === 1 &&
  parsedTg.source === 'telegram' &&
  parsedTg.postId === 2537
) {
  console.log('✅ Парсинг version ID працює правильно\n');
} else {
  console.error('❌ Помилка парсингу version ID');
  process.exit(1);
}

// Тест 4: Генерація хешів
console.log('Тест 4: Генерація хешів контенту...');
const schedule1 = {
  date: '2025-12-05',
  queues: [
    {
      queue: '1.1',
      intervals: [
        { start: '10:00', end: '11:00' },
        { start: '14:00', end: '15:00' }
      ]
    }
  ]
};

const schedule2 = {
  date: '2025-12-05',
  queues: [
    {
      queue: '1.1',
      intervals: [
        { start: '14:00', end: '15:00' }, // Інший порядок
        { start: '10:00', end: '11:00' }
      ]
    }
  ]
};

const schedule3 = {
  date: '2025-12-05',
  queues: [
    {
      queue: '1.1',
      intervals: [
        { start: '10:00', end: '11:00' },
        { start: '14:00', end: '16:00' } // Інший час
      ]
    }
  ]
};

const hash1 = generateScheduleHash(schedule1);
const hash2 = generateScheduleHash(schedule2);
const hash3 = generateScheduleHash(schedule3);

console.log(`  Hash 1: ${hash1.substring(0, 16)}...`);
console.log(`  Hash 2: ${hash2.substring(0, 16)}...`);
console.log(`  Hash 3: ${hash3.substring(0, 16)}...`);

if (hash1 === hash2 && hash1 !== hash3) {
  console.log('✅ Хеші генеруються правильно (порядок інтервалів не впливає)\n');
} else {
  console.error('❌ Помилка генерації хешів');
  console.error(`  hash1 === hash2: ${hash1 === hash2}`);
  console.error(`  hash1 !== hash3: ${hash1 !== hash3}`);
  process.exit(1);
}

// Тест 5: Знаходження відмінностей
console.log('Тест 5: Знаходження відмінностей між графіками...');
const diff = findScheduleDifferences(schedule1, schedule3);
const diffDesc = formatDifferencesDescription(diff);

console.log('  Знайдені зміни:', diffDesc);

if (diff.hasChanges && diff.queuesModified.length === 1) {
  console.log('✅ Відмінності знайдені правильно\n');
} else {
  console.error('❌ Помилка пошуку відмінностей');
  process.exit(1);
}

// Тест 6: Статистика версій
console.log('Тест 6: Отримання статистики версій...');
try {
  const stats = getVersionStats();
  console.log('  Zoe:', stats.zoe);
  console.log('  Telegram:', stats.telegram);
  console.log('✅ Статистика отримана\n');
} catch (error) {
  console.error('❌ Помилка отримання статистики:', error.message);
  process.exit(1);
}

console.log('========================================');
console.log('✅ ВСІ ТЕСТИ ПРОЙШЛИ УСПІШНО!');
console.log('========================================\n');

console.log('Система версіонування готова до використання!');
console.log('\nНаступні кроки:');
console.log('1. Запустити scraper для збору даних: npm run sync:bootstrap');
console.log('2. Переглянути версії через API: GET /api/schedule/versions/:date');
console.log('3. Порівняти версії: GET /api/schedule/versions/:date/compare?v1=...&v2=...');
console.log();
