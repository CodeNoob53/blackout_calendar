#!/usr/bin/env node

/**
 * CLI для запуску Sync Engine
 *
 * Команди:
 * - bootstrap: Початкова синхронізація всіх даних
 * - orchestrator: Регулярна синхронізація (останні 7 днів)
 * - sync-date <date>: Синхронізація конкретної дати
 */

import { bootstrap, orchestrator, syncDate } from '../services/SyncEngine.js';
import { initDatabase } from '../db.js';
import Logger from '../utils/logger.js';

const command = process.argv[2];
const args = process.argv.slice(3);

async function main() {
  // Ініціалізуємо БД
  initDatabase();

  switch (command) {
    case 'bootstrap':
      Logger.info('CLI', '=== Running Bootstrap ===');
      try {
        const result = await bootstrap();
        Logger.success('CLI', 'Bootstrap completed successfully!');
        console.log('\nResults:');
        console.log(`  Total dates: ${result.total}`);
        console.log(`  Synced: ${result.synced}`);
        console.log(`  Skipped: ${result.skipped}`);

        if (result.dates.length > 0) {
          console.log('\nSynced dates:');
          result.dates.forEach(d => {
            console.log(`  - ${d.date}: ${d.updateCount} updates (${d.changeType})`);
          });
        }

        process.exit(0);
      } catch (error) {
        Logger.error('CLI', 'Bootstrap failed', error);
        process.exit(1);
      }
      break;

    case 'orchestrator':
      Logger.info('CLI', '=== Running Orchestrator ===');
      try {
        const result = await orchestrator();
        Logger.success('CLI', 'Orchestrator completed successfully!');
        console.log('\nResults:');
        console.log(`  Total dates: ${result.total}`);
        console.log(`  Synced: ${result.synced}`);
        console.log(`  Skipped: ${result.skipped}`);

        if (result.dates.length > 0) {
          console.log('\nSynced dates:');
          result.dates.forEach(d => {
            console.log(`  - ${d.date}: ${d.updateCount} updates (${d.changeType})`);
          });
        }

        process.exit(0);
      } catch (error) {
        Logger.error('CLI', 'Orchestrator failed', error);
        process.exit(1);
      }
      break;

    case 'sync-date':
      if (args.length === 0) {
        console.error('Error: Date argument required');
        console.error('Usage: npm run sync:date -- <YYYY-MM-DD>');
        process.exit(1);
      }

      const date = args[0];
      Logger.info('CLI', `=== Syncing date: ${date} ===`);

      try {
        const result = await syncDate(date);
        Logger.success('CLI', `Sync completed for ${date}!`);
        console.log('\nResults:');
        console.log(`  Total dates: ${result.total}`);
        console.log(`  Synced: ${result.synced}`);
        console.log(`  Skipped: ${result.skipped}`);

        if (result.dates.length > 0) {
          console.log('\nSynced dates:');
          result.dates.forEach(d => {
            console.log(`  - ${d.date}: ${d.updateCount} updates (${d.changeType})`);
          });
        }

        process.exit(0);
      } catch (error) {
        Logger.error('CLI', `Sync failed for ${date}`, error);
        process.exit(1);
      }
      break;

    case 'help':
    case '--help':
    case '-h':
      console.log('Sync Engine CLI');
      console.log('');
      console.log('Usage:');
      console.log('  npm run sync:bootstrap     - Initial sync of all data');
      console.log('  npm run sync:orchestrator  - Periodic sync (last 7 days)');
      console.log('  npm run sync:date <date>   - Sync specific date (YYYY-MM-DD)');
      console.log('');
      console.log('Examples:');
      console.log('  npm run sync:bootstrap');
      console.log('  npm run sync:orchestrator');
      console.log('  npm run sync:date -- 2024-11-26');
      process.exit(0);
      break;

    default:
      console.error(`Unknown command: ${command}`);
      console.error('Run "npm run sync:help" for usage information');
      process.exit(1);
  }
}

main().catch(error => {
  Logger.error('CLI', 'Unexpected error', error);
  process.exit(1);
});
