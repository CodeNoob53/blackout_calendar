#!/usr/bin/env node
/**
 * Діагностика: перевірка наявності графіка на 11 лютого 2026
 * Використання: node check_feb11.js [url]
 * Приклад: node check_feb11.js https://blackout-calendar.onrender.com
 */

import https from 'https';
import http from 'http';

const PROD_URL = process.argv[2] || 'https://blackout-calendar.onrender.com';
const TARGET_DATE = '2026-02-11';

console.log('🔍 Перевірка календаря на', TARGET_DATE);
console.log('📍 URL:', PROD_URL);
console.log('');

// Функція для запиту
function makeRequest(url, apiKey = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'DiagnosticScript/1.0'
      }
    };

    if (apiKey) {
      options.headers['X-API-Key'] = apiKey;
    }

    const req = client.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, data: json, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, data: data, headers: res.headers, parseError: true });
        }
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

async function checkSchedule() {
  const results = {
    today: null,
    specificDate: null,
    allDates: null,
    errors: []
  };

  // 1. Перевірка /api/schedules/today/status
  console.log('1️⃣ Перевірка статусу на сьогодні...');
  try {
    const res = await makeRequest(`${PROD_URL}/api/schedules/today/status`);
    results.today = res.data;
    console.log(`   ✅ Статус: ${res.status}`);
    console.log(`   📅 Сьогодні: ${res.data.date}`);
    console.log(`   📊 Є графік: ${res.data.available ? 'ТАК ✅' : 'НІ ❌'}`);

    if (res.data.date !== TARGET_DATE) {
      console.log(`   ⚠️  УВАГА: Системна дата сервера не 11.02! (${res.data.date})`);
    }
  } catch (e) {
    console.log(`   ❌ Помилка: ${e.message}`);
    results.errors.push({ endpoint: '/today/status', error: e.message });
  }
  console.log('');

  // 2. Перевірка конкретної дати 11.02
  console.log('2️⃣ Перевірка графіка на', TARGET_DATE);
  try {
    const res = await makeRequest(`${PROD_URL}/api/schedules/${TARGET_DATE}`);
    results.specificDate = res.data;
    console.log(`   ✅ Статус: ${res.status}`);
    console.log(`   📊 Є графік: ${res.data.available ? 'ТАК ✅' : 'НІ ❌'}`);

    if (res.data.available && res.data.queues) {
      console.log(`   🔢 Кількість черг: ${res.data.queues.length}`);
      res.data.queues.forEach((q, i) => {
        const intervals = q.intervals.length;
        const times = q.intervals.map(int => `${int.start}-${int.end}`).join(', ');
        console.log(`      ${i+1}. Черга ${q.queue}: ${intervals} інтервалів (${times})`);
      });
    } else {
      console.log(`   ⚠️  Графік відсутній або порожній`);
    }
  } catch (e) {
    console.log(`   ❌ Помилка: ${e.message}`);
    results.errors.push({ endpoint: `/schedules/${TARGET_DATE}`, error: e.message });
  }
  console.log('');

  // 3. Перевірка всіх доступних дат
  console.log('3️⃣ Перевірка списку доступних дат...');
  try {
    const res = await makeRequest(`${PROD_URL}/api/schedules/dates?limit=30`);
    results.allDates = res.data;
    console.log(`   ✅ Статус: ${res.status}`);
    console.log(`   📋 Всього дат: ${res.data.dates?.length || 0}`);

    if (res.data.dates && res.data.dates.length > 0) {
      console.log(`   📅 Доступні дати:`);
      const datesList = res.data.dates.slice(0, 15).join(', ');
      console.log(`      ${datesList}`);

      if (res.data.dates.includes(TARGET_DATE)) {
        console.log(`   ✅ ${TARGET_DATE} присутня в списку!`);
      } else {
        console.log(`   ❌ ${TARGET_DATE} ВІДСУТНЯ в списку!`);
      }
    } else {
      console.log(`   ⚠️  Список дат порожній`);
    }
  } catch (e) {
    console.log(`   ❌ Помилка: ${e.message}`);
    results.errors.push({ endpoint: '/schedules/dates', error: e.message });
  }
  console.log('');

  // Фінальний висновок
  console.log('═══════════════════════════════════════════════════');
  console.log('📊 ПІДСУМОК');
  console.log('═══════════════════════════════════════════════════');

  const hasFeb11 = results.specificDate?.available === true;

  if (hasFeb11) {
    console.log(`✅ Графік на ${TARGET_DATE} ПРИСУТНІЙ`);
    console.log(`📈 Черги: ${results.specificDate.queues.length}`);
  } else {
    console.log(`❌ Графік на ${TARGET_DATE} ВІДСУТНІЙ`);
    console.log('');
    console.log('🔍 Можливі причини:');
    console.log('   1. Графік не опублікований на джерелах (Telegram/ZOE)');
    console.log('   2. Скрейпер не спрацював через помилку парсингу');
    console.log('   3. ZOE scraper недоступний (geo-blocking)');
    console.log('   4. Графік відфільтрувався як "лайнографік"');
    console.log('');
    console.log('💡 Рекомендації:');
    console.log('   • Перевір Telegram канал вручну: https://t.me/s/Zaporizhzhyaoblenergo_news');
    console.log('   • Перевір сайт ZOE: https://www.zoe.com.ua/графіки-погодинних-стабілізаційних/');
    console.log('   • Подивись логи крону на продакшні');
    console.log('   • Запусти вручну: npm run sync:orchestrator');
  }

  if (results.errors.length > 0) {
    console.log('');
    console.log('⚠️  Виявлені помилки:');
    results.errors.forEach(err => {
      console.log(`   • ${err.endpoint}: ${err.error}`);
    });
  }

  console.log('═══════════════════════════════════════════════════');

  return hasFeb11;
}

// Запуск
checkSchedule()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((e) => {
    console.error('💥 Критична помилка:', e);
    process.exit(2);
  });
