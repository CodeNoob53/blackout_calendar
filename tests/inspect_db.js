
import { db } from '../src/db.js';

const date = '2025-11-30';
const row = db.prepare('SELECT * FROM schedule_metadata WHERE date = ?').get(date);

console.log('Metadata for', date, ':', row);
