import { drizzle } from 'drizzle-orm/neon-http';
import { migrate } from 'drizzle-orm/neon-http/migrator';
import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';
import { ConfigurationError } from '../src/lib/errors';

config({ path: '.env.local' });

async function main() {
  const databaseUrl = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new ConfigurationError('DATABASE_URL is required to run migrations', 'DATABASE_URL');
  }

  const sql = neon(databaseUrl);
  const db = drizzle(sql);

  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Migrations applied successfully');
}

main().catch((err) => { console.error(err); process.exit(1); });
