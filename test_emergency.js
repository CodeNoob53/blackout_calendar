/**
 * Тестовий скрипт для перевірки системи аварійних відключень (ГАВ)
 */

import { fetchTelegramUpdates, isEmergencyBlackoutMessage, parseEmergencyBlackoutMessage } from './src/scraper/telegramScraper.js';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

console.log(colors.bright + '\n═══════════════════════════════════════════════════════════════');
console.log('  🚨 ТЕСТ СИСТЕМИ АВАРІЙНИХ ВІДКЛЮЧЕНЬ (ГАВ)');
console.log('═══════════════════════════════════════════════════════════════' + colors.reset);

console.log('\n' + colors.yellow + '⏳ Завантаження повідомлень з Telegram...' + colors.reset);

const messages = await fetchTelegramUpdates();

console.log(colors.green + `✓ Завантажено ${messages.length} повідомлень\n` + colors.reset);

console.log(colors.bright + '─────────────────────────────────────────────────────────────────' + colors.reset);
console.log(colors.bright + '  🔍 АНАЛІЗ ПОВІДОМЛЕНЬ' + colors.reset);
console.log(colors.bright + '─────────────────────────────────────────────────────────────────' + colors.reset + '\n');

let emergencyCount = 0;
const emergencies = [];

for (const msg of messages) {
  const isEmergency = isEmergencyBlackoutMessage(msg.text);

  if (isEmergency) {
    emergencyCount++;
    const parsed = parseEmergencyBlackoutMessage(msg.text);

    emergencies.push({
      id: msg.id,
      date: msg.messageDate,
      parsed
    });

    console.log(colors.red + '⚠️  АВАРІЙНЕ ВІДКЛЮЧЕННЯ ЗНАЙДЕНО!' + colors.reset);
    console.log(colors.cyan + `   ID: ${msg.id}` + colors.reset);
    console.log(colors.cyan + `   Дата повідомлення: ${msg.messageDate}` + colors.reset);
    console.log(colors.yellow + `   Дата відключення: ${parsed.date || colors.gray + 'не визначено' + colors.reset}` + colors.reset);
    console.log(colors.magenta + `   Для кого: ${parsed.affectedGroups.join(', ')}` + colors.reset);
    console.log(colors.gray + `   Текст: ${msg.text.substring(0, 150)}...` + colors.reset);
    console.log();
  }
}

console.log(colors.bright + '─────────────────────────────────────────────────────────────────' + colors.reset);
console.log(colors.bright + '  📊 СТАТИСТИКА' + colors.reset);
console.log(colors.bright + '─────────────────────────────────────────────────────────────────' + colors.reset + '\n');

console.log(colors.blue + `📝 Всього повідомлень: ${messages.length}` + colors.reset);
console.log(colors.red + `🚨 Аварійних відключень: ${emergencyCount}` + colors.reset);
console.log(colors.green + `✅ Звичайних повідомлень: ${messages.length - emergencyCount}` + colors.reset);

if (emergencyCount > 0) {
  console.log('\n' + colors.bright + '─────────────────────────────────────────────────────────────────' + colors.reset);
  console.log(colors.bright + '  📋 ДЕТАЛІ ГАВ' + colors.reset);
  console.log(colors.bright + '─────────────────────────────────────────────────────────────────' + colors.reset + '\n');

  // Групуємо по датах
  const byDate = {};
  emergencies.forEach(e => {
    const date = e.parsed.date || 'unknown';
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push(e);
  });

  Object.keys(byDate).sort().forEach(date => {
    const items = byDate[date];
    console.log(colors.bright + colors.magenta + `📅 ${date}` + colors.reset);

    items.forEach(item => {
      const groups = item.parsed.affectedGroups.map(g => {
        switch (g) {
          case 'industrial': return '🏭 Промислові';
          case 'residential': return '🏠 Населення';
          case 'business': return '💼 Бізнес';
          case 'all': return '🌍 Всі';
          default: return g;
        }
      });

      console.log(colors.gray + `   ├─` + colors.reset + ` ID: ${item.id}`);
      console.log(colors.gray + `   ├─` + colors.reset + ` Час: ${item.date}`);
      console.log(colors.gray + `   └─` + colors.reset + ` ${groups.join(', ')}`);
    });

    console.log();
  });
}

console.log(colors.bright + '═══════════════════════════════════════════════════════════════' + colors.reset);

if (emergencyCount === 0) {
  console.log(colors.green + '\n✓ Аварійних відключень не знайдено. Все добре!' + colors.reset);
} else {
  console.log(colors.yellow + `\n⚠️  Знайдено ${emergencyCount} аварійних відключень!` + colors.reset);
}

console.log(colors.bright + '\n═══════════════════════════════════════════════════════════════\n' + colors.reset);

// Тестуємо конкретні приклади
console.log(colors.bright + '🧪 ТЕСТ ПАРСИНГУ КОНКРЕТНИХ ПОВІДОМЛЕНЬ:' + colors.reset + '\n');

const testMessages = [
  `Увага! По Запорізькій області застосовано графіки аварійних відключень

З метою стабілізації ситуації в Об'єднаній енергосистемі за вказівкою НЕК «Укренерго» сьогодні, 09 грудня, по Запорізькій області для промислових споживачів введені графіки аварійних відключень (ГАВ).

Також продовжують діяти графіки погодинних відключень електроенергії.`,

  `Увага! По Запорізькій області застосовано графіки аварійних відключень

З метою стабілізації ситуації в Об'єднаній енергосистемі за вказівкою НЕК «Укренерго» сьогодні, 08 грудня, по Запорізькій області для промислових споживачів введені графіки аварійних відключень (ГАВ).

Також продовжують діяти графіки погодинних відключень електроенергії.`
];

testMessages.forEach((text, index) => {
  console.log(colors.cyan + `Тест ${index + 1}:` + colors.reset);

  const isEmergency = isEmergencyBlackoutMessage(text);
  console.log(`  Чи є ГАВ? ${isEmergency ? colors.green + 'Так ✓' : colors.red + 'Ні ✗'}${colors.reset}`);

  if (isEmergency) {
    const parsed = parseEmergencyBlackoutMessage(text);
    console.log(`  Дата: ${colors.yellow}${parsed.date}${colors.reset}`);
    console.log(`  Групи: ${colors.magenta}${parsed.affectedGroups.join(', ')}${colors.reset}`);
  }

  console.log();
});
