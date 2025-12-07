import { db } from '../src/db.js';

const today = new Date().toISOString().split('T')[0];
console.log('Today:', today);

const history = db.prepare('SELECT * FROM schedule_history WHERE date = ?').all(today);
console.log('History count:', history.length);
console.log('History rows:', JSON.stringify(history, null, 2));

const metadata = db.prepare('SELECT * FROM schedule_metadata WHERE date = ?').all(today);
console.log('Metadata:', JSON.stringify(metadata, null, 2));
