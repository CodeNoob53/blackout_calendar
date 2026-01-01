
const today = new Date();
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);

const todayStr = today.toISOString().split('T')[0];
const tomorrowStr = tomorrow.toISOString().split('T')[0];

console.log('Local time:', new Date().toString());
console.log('UTC time:', new Date().toISOString());
console.log('todayStr (UTC):', todayStr);
console.log('tomorrowStr (UTC):', tomorrowStr);

// Imitate Kyiv timezone check
const kyivDate = new Date().toLocaleDateString('uk-UA', { timeZone: 'Europe/Kyiv' }); // DD.MM.YYYY
const parts = kyivDate.split('.');
const kyivTodayStr = `${parts[2]}-${parts[1]}-${parts[0]}`;

console.log('Kyiv Today:', kyivTodayStr);

const kyivTomorrow = new Date();
kyivTomorrow.setDate(kyivTomorrow.getDate() + 1);
const kParts = kyivTomorrow.toLocaleDateString('uk-UA', { timeZone: 'Europe/Kyiv' }).split('.');
const kyivTomorrowStr = `${kParts[2]}-${kParts[1]}-${kParts[0]}`;

console.log('Kyiv Tomorrow:', kyivTomorrowStr);

if (todayStr !== kyivTodayStr) {
    console.warn('MISMATCH: UTC date is different from Kyiv date!');
} else {
    console.log('MATCH: UTC date matches Kyiv date (for now)');
}
