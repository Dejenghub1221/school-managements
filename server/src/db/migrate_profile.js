import 'dotenv/config';
import { pool } from './index.js';

export async function migrateProfileSchema() {
  try {
    await pool.query(`
      ALTER TABLE public.users
      ADD COLUMN IF NOT EXISTS avatar TEXT,
      ADD COLUMN IF NOT EXISTS email TEXT,
      ADD COLUMN IF NOT EXISTS phone TEXT,
      ADD COLUMN IF NOT EXISTS bio TEXT,
      ADD COLUMN IF NOT EXISTS address TEXT,
      ADD COLUMN IF NOT EXISTS gender TEXT,
      ADD COLUMN IF NOT EXISTS dob TEXT,
      ADD COLUMN IF NOT EXISTS emergency_contact TEXT,
      ADD COLUMN IF NOT EXISTS emergency_phone TEXT,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
    `);
    console.log('✅ User profile columns verified / updated in database.');
  } catch (err) {
    console.warn('⚠️ Profile migration note:', err.message);
  }
}

// Allow direct CLI execution
if (process.argv[1]?.endsWith('migrate_profile.js')) {
  migrateProfileSchema().then(() => process.exit(0)).catch(e => {
    console.error(e);
    process.exit(1);
  });
}
