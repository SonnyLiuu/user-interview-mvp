import { drizzle } from 'drizzle-orm/neon-http';
import { migrate } from 'drizzle-orm/neon-http/migrator';
import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';
import { ConfigurationError } from '../src/lib/errors';

config({ path: '.env.local' });

// Import env validation to ensure all required vars are present
import '../src/lib/env';

async function main() {
  const sql = neon(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL!);
  const db = drizzle(sql);

  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Migrations applied successfully');
}

main().catch((err) => { console.error(err); process.exit(1); });
