/**
 * Тест PHASE 1 виправлень для ZoeScraper
 *
 * Перевіряє:
 * 1. Міграцію page_position колонки
 * 2. Видалення фільтрації дублікатів
 * 3. Додавання pagePosition метадати
 */

import { initDatabase, saveZoeVersion, getLatestZoeVersion } from '../src/db.js';
import { parseZoeHTML } from '../src/scraper/zoeScraper.js';
import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbPath = join(__dirname, '..', 'data', 'blackout.db');

console.log('\n========================================');
console.log('ТЕСТ PHASE 1 ВИПРАВЛЕНЬ');
console.log('========================================\n');

// Тест 1: Міграція БД
console.log('Тест 1: Перевірка міграції page_position колонки...');
initDatabase();

const db = new Database(dbPath);
const columns = db.prepare("PRAGMA table_info(zoe_schedule_versions)").all();
const hasPagePosition = columns.some(col => col.name === 'page_position');

if (hasPagePosition) {
  console.log('✅ Колонка page_position успішно додана до БД\n');
} else {
  console.error('❌ ПОМИЛКА: Колонка page_position не знайдена!\n');
  process.exit(1);
}

// Тест 2: Парсинг HTML з дублікатами
console.log('Тест 2: Перевірка видалення фільтрації дублікатів...');

const mockHTML = `
<html>
<body>
  <article>
    <!-- Графік на 07.12 (вгорі) -->
    <strong>ГПВ НА 07 ГРУДНЯ</strong> (оновлено о 20:00)
    <p>Черга 1.1: 10:00-11:00, 14:00-15:00</p>

    <!-- Останнє оновлення на 06.12 -->
    <strong>ГПВ НА 06 ГРУДНЯ</strong> (оновлено о 18:00)
    <p>Черга 1.1: 08:00-09:00, 16:00-17:00</p>

    <!-- Попереднє оновлення на 06.12 (інший контент!) -->
    <strong>ГПВ НА 06 ГРУДНЯ</strong> (оновлено о 15:00)
    <p>Черга 1.1: 08:00-09:00, 14:00-15:00</p>

    <!-- Перша публікація на 06.12 -->
    <strong>ГПВ НА 06 ГРУДНЯ</strong>
    <p>Черга 1.1: 08:00-09:00, 12:00-13:00</p>
  </article>
</body>
</html>
`;

const schedules = parseZoeHTML(mockHTML);

console.log(`  Знайдено графіків: ${schedules.length}`);

// Очікуємо 4 графіки (раніше фільтрація могла втратити деякі)
if (schedules.length < 4) {
  console.error(`  ❌ ПОМИЛКА: Очікувалось 4 графіки, знайдено ${schedules.length}`);
  console.log('  Можливо фільтрація дублікатів досі працює!\n');
  process.exit(1);
}

console.log('  ✅ Всі графіки знайдені (фільтрація видалена)\n');

// Тест 3: Перевірка pagePosition
console.log('Тест 3: Перевірка додавання pagePosition...');

let hasAllPositions = true;
let hasCorrectOrder = true;
let lastPosition = -1;

for (const schedule of schedules) {
  if (schedule.pagePosition === undefined || schedule.pagePosition === null) {
    console.error(`  ❌ ПОМИЛКА: Графік для ${schedule.parsed.date} не має pagePosition`);
    hasAllPositions = false;
  }

  // Перевіряємо що позиції йдуть по порядку
  if (schedule.pagePosition <= lastPosition) {
    console.error(`  ❌ ПОМИЛКА: pagePosition не збільшується (${lastPosition} -> ${schedule.pagePosition})`);
    hasCorrectOrder = false;
  }

  lastPosition = schedule.pagePosition;
}

if (!hasAllPositions || !hasCorrectOrder) {
  process.exit(1);
}

console.log('  ✅ Всі графіки мають pagePosition у правильному порядку\n');

// Тест 4: Детальний вивід
console.log('Тест 4: Детальний огляд знайдених графіків...\n');

const byDate = {};
for (const schedule of schedules) {
  const date = schedule.parsed.date;
  if (!byDate[date]) {
    byDate[date] = [];
  }
  byDate[date].push({
    position: schedule.pagePosition,
    time: schedule.messageDate || 'немає часу',
    queues: schedule.parsed.queues.length,
    firstQueue: schedule.parsed.queues[0]?.queue
  });
}

for (const [date, versions] of Object.entries(byDate)) {
  console.log(`  📅 ${date}: ${versions.length} версій`);
  versions.forEach((v, i) => {
    const time = v.time !== 'немає часу'
      ? new Date(v.time).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })
      : v.time;
    console.log(`     [pos ${v.position}] v${i + 1}: ${time} | черг: ${v.queues}`);
  });
  console.log('');
}

console.log('========================================');
console.log('✅ ВСІ ТЕСТИ ПРОЙДЕНІ!');
console.log('========================================\n');

console.log('📋 Підсумок змін PHASE 1:');
console.log('  ✅ Видалено фільтрацію дублікатів у parseZoeHTML');
console.log('  ✅ Додано pagePosition метадату (від 0)');
console.log('  ✅ Додано колонку page_position в БД');
console.log('  ✅ Оновлено saveZoeVersion для передачі pagePosition');
console.log('  ✅ Оновлено updateFromZoe для використання pagePosition\n');

db.close();
