/**
 * Тест виправлення часового поясу
 * Перевіряє що час завжди показується в київському поясі незалежно від сервера
 */

console.log('\n========================================');
console.log('ТЕСТ ВИПРАВЛЕННЯ TIMEZONE');
console.log('========================================\n');

// Створюємо тестову дату (UTC)
const testDate = new Date('2025-12-05T17:56:40Z'); // UTC час

console.log('Тестова дата (UTC):', testDate.toISOString());
console.log('Очікуваний київський час: 19:56 (UTC+2)\n');

// Тест 1: БЕЗ timeZone (використовує серверний timezone)
const withoutTimeZone = testDate.toLocaleTimeString('uk-UA', {
  hour: '2-digit',
  minute: '2-digit'
});

console.log('❌ БЕЗ timeZone:', withoutTimeZone);
console.log('   (показує час сервера - може бути неправильним)\n');

// Тест 2: З timeZone: 'Europe/Kiev'
const withTimeZone = testDate.toLocaleTimeString('uk-UA', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Kiev'
});

console.log('✅ З timeZone: \'Europe/Kiev\':', withTimeZone);
console.log('   (завжди показує київський час)\n');

// Перевірка результату
if (withTimeZone === '19:56') {
  console.log('========================================');
  console.log('✅ ТЕСТ ПРОЙДЕНО!');
  console.log('========================================\n');
  console.log('Час правильно форматується в київський пояс (UTC+2)');
  console.log('Незалежно від того де знаходиться сервер!\n');
} else {
  console.error('========================================');
  console.error('❌ ПОМИЛКА!');
  console.error('========================================\n');
  console.error(`Очікувалось: 19:56, отримано: ${withTimeZone}\n`);
  process.exit(1);
}

// Додатковий тест: перевірка що це працює з різними часами
console.log('Додаткові перевірки:');

const testCases = [
  { utc: '2025-12-05T00:00:00Z', expected: '02:00' },  // Північ UTC = 2:00 Київ
  { utc: '2025-12-05T12:00:00Z', expected: '14:00' },  // Полудень UTC = 14:00 Київ
  { utc: '2025-12-05T22:00:00Z', expected: '00:00' },  // 22:00 UTC = 00:00 наступного дня Київ
];

let allPassed = true;
for (const test of testCases) {
  const date = new Date(test.utc);
  const result = date.toLocaleTimeString('uk-UA', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Kiev'
  });

  const passed = result === test.expected;
  console.log(`  ${passed ? '✅' : '❌'} ${test.utc} → ${result} (очікувалось: ${test.expected})`);

  if (!passed) allPassed = false;
}

if (!allPassed) {
  console.error('\n❌ Деякі тести не пройшли!\n');
  process.exit(1);
}

console.log('\n✅ Всі тести пройшли успішно!\n');
