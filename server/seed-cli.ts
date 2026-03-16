import { closeDb, getDb } from './db.js';
import { runMigrations } from './schema.js';
import { runSeed } from './seed.js';

async function main() {
  const db = getDb();
  await runMigrations(db);
  await runSeed(db);
  await closeDb();
  console.log('Seed completado.');
}

main().catch(async (error) => {
  console.error('Error ejecutando seed:', error);
  await closeDb();
  process.exit(1);
});
