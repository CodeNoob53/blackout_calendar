/**
 * Скрипт для аналізу таймлайну графіків з Zoe та Telegram
 * Показує всі оновлення по датам в хронологічному порядку
 */

import { fetchTelegramUpdates } from './src/scraper/telegramScraper.js';
import { fetchZoeUpdates, parseZoeHTML } from './src/scraper/zoeScraper.js';
import { parseScheduleMessage } from './src/scraper/parser.js';

// Кольорові коди для терміналу
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m'
};

function formatTime(isoString) {
  if (!isoString) return colors.gray + 'no time' + colors.reset;
  const date = new Date(isoString);
  return date.toLocaleString('uk-UA', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function formatQueues(queues) {
  if (!queues || queues.length === 0) return colors.red + 'no queues' + colors.reset;

  const queueIds = queues.map(q => q.queue).join(', ');
  const intervals = queues.map(q => {
    const int = q.intervals.map(i => `${i.start}-${i.end}`).join(', ');
    return `${q.queue}:[${int}]`;
  });

  return `${colors.cyan}${queues.length} черг${colors.reset} (${queueIds})`;
}

function formatSource(source) {
  if (source === 'telegram') {
    return colors.blue + '📱 Telegram' + colors.reset;
  } else if (source === 'zoe') {
    return colors.green + '🌐 Zoe     ' + colors.reset;
  }
  return source;
}

async function analyzeTimeline() {
  console.log(colors.bright + '\n═══════════════════════════════════════════════════════════════');
  console.log('  📊 АНАЛІЗ ТАЙМЛАЙНУ ГРАФІКІВ');
  console.log('═══════════════════════════════════════════════════════════════' + colors.reset);

  // Збираємо дані з Telegram
  console.log('\n' + colors.yellow + '⏳ Завантаження даних з Telegram...' + colors.reset);
  const telegramMessages = await fetchTelegramUpdates();
  const telegramUpdates = [];

  for (const msg of telegramMessages) {
    if (msg.text.includes('ГПВ') || msg.text.includes('Години відсутності') || msg.text.includes('ОНОВЛЕНО')) {
      const parsed = parseScheduleMessage(msg.text);
      if (parsed.date && parsed.queues.length > 0) {
        telegramUpdates.push({
          sourceId: msg.id,
          source: 'telegram',
          messageDate: msg.messageDate,
          parsed: parsed,
          rawText: msg.text.substring(0, 100)
        });
      }
    }
  }

  console.log(colors.green + `✓ Знайдено ${telegramUpdates.length} оновлень з Telegram` + colors.reset);

  // Збираємо дані з Zoe
  console.log('\n' + colors.yellow + '⏳ Завантаження даних з Zoe...' + colors.reset);
  const zoeHtml = await fetchZoeUpdates();
  const zoeParsed = parseZoeHTML(zoeHtml);

  const zoeUpdates = zoeParsed.map((schedule, index) => {
    const dateId = parseInt(schedule.parsed.date.replace(/-/g, ''), 10);
    const position = schedule.pagePosition ?? index;
    const sourceId = dateId * 1000 + position;

    return {
      sourceId: sourceId,
      source: 'zoe',
      messageDate: schedule.messageDate || null,
      parsed: schedule.parsed,
      rawText: schedule.rawText
    };
  });

  console.log(colors.green + `✓ Знайдено ${zoeUpdates.length} оновлень з Zoe` + colors.reset);

  // Об'єднуємо всі оновлення
  const allUpdates = [...telegramUpdates, ...zoeUpdates];

  // Фільтруємо останні 7 днів
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const minDateStr = sevenDaysAgo.toISOString().split('T')[0];

  const recentUpdates = allUpdates.filter(u => u.parsed.date >= minDateStr);

  console.log(colors.yellow + `\n📅 Фільтровано до останніх 7 днів (з ${minDateStr})` + colors.reset);
  console.log(colors.green + `✓ Залишилось ${recentUpdates.length} оновлень` + colors.reset);

  // Групуємо по датам
  const byDate = {};
  recentUpdates.forEach(update => {
    const date = update.parsed.date;
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push(update);
  });

  // Сортуємо дати
  const sortedDates = Object.keys(byDate).sort();

  console.log('\n' + colors.bright + '═══════════════════════════════════════════════════════════════');
  console.log('  📋 ТАЙМЛАЙН ПО ДАТАМ');
  console.log('═══════════════════════════════════════════════════════════════' + colors.reset);

  // Показуємо таймлайн для кожної дати
  sortedDates.forEach(date => {
    const updates = byDate[date];

    // Сортуємо оновлення хронологічно
    const sorted = updates.sort((a, b) => {
      const aTime = a.messageDate ? new Date(a.messageDate).getTime() : 0;
      const bTime = b.messageDate ? new Date(b.messageDate).getTime() : 0;

      if (aTime !== bTime) return aTime - bTime;
      return a.sourceId - b.sourceId;
    });

    console.log('\n' + colors.bright + colors.magenta + `╔═══ ${date} (${updates.length} оновлень) ═══` + colors.reset);

    sorted.forEach((update, index) => {
      const prefix = index === sorted.length - 1 ? '╚═' : '╠═';
      const time = formatTime(update.messageDate);
      const source = formatSource(update.source);
      const queues = formatQueues(update.parsed.queues);

      console.log(colors.gray + prefix + '▶' + colors.reset + ` [${time}] ${source} | ${queues}`);
      console.log(colors.gray + '  ' + (index === sorted.length - 1 ? '  ' : '║ ') + colors.reset +
                  colors.dim + `ID: ${update.sourceId}` + colors.reset);

      // Показуємо першу чергу для деталей
      if (update.parsed.queues.length > 0) {
        const firstQueue = update.parsed.queues[0];
        const intervals = firstQueue.intervals.map(i => `${i.start}-${i.end}`).join(', ');
        console.log(colors.gray + '  ' + (index === sorted.length - 1 ? '  ' : '║ ') + colors.reset +
                    colors.dim + `Перша черга: ${firstQueue.queue} [${intervals}]` + colors.reset);
      }
    });
  });

  // Статистика
  console.log('\n' + colors.bright + '═══════════════════════════════════════════════════════════════');
  console.log('  📊 СТАТИСТИКА');
  console.log('═══════════════════════════════════════════════════════════════' + colors.reset);

  const telegramCount = recentUpdates.filter(u => u.source === 'telegram').length;
  const zoeCount = recentUpdates.filter(u => u.source === 'zoe').length;

  console.log(colors.blue + `📱 Telegram:  ${telegramCount} оновлень` + colors.reset);
  console.log(colors.green + `🌐 Zoe:       ${zoeCount} оновлень` + colors.reset);
  console.log(colors.yellow + `📅 Дат:       ${sortedDates.length}` + colors.reset);
  console.log(colors.cyan + `📝 Всього:    ${recentUpdates.length} оновлень` + colors.reset);

  // Перевірка порядку оновлень
  console.log('\n' + colors.bright + '═══════════════════════════════════════════════════════════════');
  console.log('  🔍 ПЕРЕВІРКА ХРОНОЛОГІЇ');
  console.log('═══════════════════════════════════════════════════════════════' + colors.reset);

  let orderIssues = 0;
  sortedDates.forEach(date => {
    const updates = byDate[date];

    for (let i = 1; i < updates.length; i++) {
      const prev = updates[i - 1];
      const curr = updates[i];

      const prevTime = prev.messageDate ? new Date(prev.messageDate).getTime() : 0;
      const currTime = curr.messageDate ? new Date(curr.messageDate).getTime() : 0;

      if (prevTime > currTime && currTime !== 0) {
        console.log(colors.red + `✗ Порушення порядку в ${date}:` + colors.reset);
        console.log(colors.yellow + `  ${formatTime(prev.messageDate)} (${prev.source}) > ${formatTime(curr.messageDate)} (${curr.source})` + colors.reset);
        orderIssues++;
      }
    }
  });

  if (orderIssues === 0) {
    console.log(colors.green + '✓ Всі оновлення в хронологічному порядку!' + colors.reset);
  } else {
    console.log(colors.red + `✗ Знайдено ${orderIssues} порушень хронології` + colors.reset);
  }

  console.log('\n' + colors.bright + '═══════════════════════════════════════════════════════════════' + colors.reset + '\n');
}

// Запускаємо аналіз
analyzeTimeline().catch(error => {
  console.error(colors.red + '\n✗ Помилка:', error.message + colors.reset);
  console.error(error);
  process.exit(1);
});
