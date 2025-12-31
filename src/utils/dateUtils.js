/**
 * Utilities for Date manipulation in Kyiv timezone (UTC+2 / UTC+3)
 * Ukraine standard time is UTC+2.
 * Currently handling assuming permanent UTC+2 as per project context,
 * but using Intl for robustness where possible.
 */

/**
 * Returns the current date in Kyiv timezone as YYYY-MM-DD string
 * @returns {string} Date string
 */
export function getKyivDate() {
  return getKyivDateFor(new Date());
}

/**
 * Returns the date for a specific Date object in Kyiv timezone as YYYY-MM-DD string
 * @param {Date} date
 * @returns {string} Date string
 */
export function getKyivDateFor(date) {
  // Use Sweden locale as it consistently uses YYYY-MM-DD format
  // or use 'en-CA' (Canadian English) which is YYYY-MM-DD
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Kyiv',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(date);
}

/**
 * Returns detailed current time components in Kyiv timezone
 */
export function getKyivTimeComponents() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Kyiv',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  
  const [hours, minutes, seconds] = formatter.format(now).split(':').map(Number);
  return { hours, minutes, seconds };
}

/**
 * Adds days to a YYYY-MM-DD string
 * @param {string} dateStr - YYYY-MM-DD
 * @param {number} days - Number of days to add
 * @returns {string} New date in YYYY-MM-DD
 */
export function addDays(dateStr, days) {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days);
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
  // Note: Date() constructor parses "YYYY-MM-DD" as UTC usually, 
  // but we just need to add days, so it's safe for simple arithmetic 
  // as long as we don't cross DST boundaries weirdly in UTC. 
  // However, simple string manipulation or robust library is better.
  // Given we are sticking to vanilla JS:
  
  // Safe approach for "YYYY-MM-DD" addition without timezone shifts:
  const [y, m, d] = dateStr.split('-').map(Number);
  const safeDate = new Date(y, m - 1, d); // Local time 00:00
  safeDate.setDate(safeDate.getDate() + days);
  
  const year = safeDate.getFullYear();
  const month = String(safeDate.getMonth() + 1).padStart(2, '0');
  const day = String(safeDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
