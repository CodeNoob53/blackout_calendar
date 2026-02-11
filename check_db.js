#!/usr/bin/env node
/**
 * Перевірка локальної бази даних
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = join(__dirname, 'data', 'blackout.db');

try {
  const db = new Database(dbPath, { readonly: true });

  console.log('📊 Статистика локальної бази даних');
  console.log('═══════════════════════════════════════');
  console.log('');

  // Загальна кількість графіків
  const totalOutages = db.prepare('SELECT COUNT(*) as count FROM outages').get();
  console.log(`📈 Всього записів відключень: ${totalOutages.count}`);

  // Кількість дат
  const totalDates = db.prepare('SELECT COUNT(DISTINCT date) as count FROM outages').get();
  console.log(`📅 Унікальних дат: ${totalDates.count}`);

  // Перевірка конкретної дати
  console.log('');
  console.log('🔍 Графік на 2026-02-11:');
  const feb11 = db.prepare('SELECT * FROM outages WHERE date = ? ORDER BY queue, start_time').all('2026-02-11');

  if (feb11.length > 0) {
    console.log(`   ✅ Знайдено ${feb11.length} записів`);
    feb11.forEach((row, i) => {
      console.log(`   ${i+1}. Черга ${row.queue}: ${row.start_time} - ${row.end_time}`);
    });
  } else {
    console.log(`   ❌ Записів не знайдено`);
  }

  // Останні дати
  console.log('');
  console.log('📋 Останні 10 дат в базі:');
  const recentDates = db.prepare(`
    SELECT date, COUNT(*) as queues
    FROM outages
    GROUP BY date
    ORDER BY date DESC
    LIMIT 10
  `).all();

  if (recentDates.length > 0) {
    recentDates.forEach((row, i) => {
      const mark = row.date === '2026-02-11' ? '👉' : '  ';
      console.log(`   ${mark} ${i+1}. ${row.date} (${row.queues} черг)`);
    });
  } else {
    console.log('   ⚠️  База даних порожня');
  }

  // Метадані
  console.log('');
  console.log('📝 Метадані графіків:');
  const metadata = db.prepare('SELECT * FROM schedule_metadata ORDER BY date DESC LIMIT 5').all();

  if (metadata.length > 0) {
    metadata.forEach((row, i) => {
      const mark = row.date === '2026-02-11' ? '👉' : '  ';
      console.log(`   ${mark} ${i+1}. ${row.date} - джерело: ${row.source}, оновлень: ${row.update_count}`);
    });
  } else {
    console.log('   ⚠️  Метаданих немає');
  }

  db.close();

  console.log('');
  console.log('═══════════════════════════════════════');

} catch (e) {
  console.error('❌ Помилка:', e.message);
  process.exit(1);
}
