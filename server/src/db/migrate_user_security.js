import 'dotenv/config';
import { pool } from './index.js';

export async function migrateUserSecuritySchema() {
  try {
    await pool.query(`
      ALTER TABLE public.users
      ADD COLUMN IF NOT EXISTS password_reset_by TEXT DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS password_reset_at TIMESTAMPTZ DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS password_status TEXT DEFAULT 'Default',
      ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false;

      CREATE TABLE IF NOT EXISTS public.password_reset_requests (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL,
        role TEXT,
        name TEXT,
        contact_info TEXT,
        reason TEXT,
        status TEXT DEFAULT 'Pending',
        requested_at TIMESTAMPTZ DEFAULT NOW(),
        resolved_at TIMESTAMPTZ,
        resolved_by TEXT,
        resolution_note TEXT
      );

      UPDATE public.users
      SET password_status = 'Default'
      WHERE password_status IS NULL;
    `);
    console.log('✅ User security and password reset schema verified in database.');
  } catch (err) {
    console.warn('⚠️ User security migration note:', err.message);
  }
}

// Allow direct CLI execution
if (process.argv[1]?.endsWith('migrate_user_security.js')) {
  migrateUserSecuritySchema().then(() => process.exit(0)).catch(e => {
    console.error(e);
    process.exit(1);
  });
}

