import 'dotenv/config';
import { pool } from './index.js';

export async function migrateUserSecuritySchema() {
  try {
    await pool.query(`
      ALTER TABLE public.users
      ADD COLUMN IF NOT EXISTS password_reset_by TEXT DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS password_reset_at TIMESTAMPTZ DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS password_status TEXT DEFAULT 'Default',
      ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
      ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS disabled_by TEXT DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS disabled_reason TEXT DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS del_flg VARCHAR(1) DEFAULT 'N',
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS deleted_by TEXT DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS deletion_reason TEXT DEFAULT NULL;

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

      CREATE TABLE IF NOT EXISTS public.deleted_users_history (
        id SERIAL PRIMARY KEY,
        user_id TEXT,
        username TEXT NOT NULL,
        role TEXT NOT NULL,
        name TEXT,
        email TEXT,
        phone TEXT,
        teacher_id TEXT,
        student_id TEXT,
        parent_id TEXT,
        account_created_at TIMESTAMPTZ,
        last_password_change TIMESTAMPTZ,
        deleted_at TIMESTAMPTZ DEFAULT NOW(),
        deleted_by TEXT,
        deletion_reason TEXT,
        activity_snapshot JSONB
      );

      ALTER TABLE public.deleted_users_history
      ALTER COLUMN user_id TYPE TEXT;

      UPDATE public.users
      SET password_status = 'Default'
      WHERE password_status IS NULL;

      UPDATE public.users
      SET is_active = true
      WHERE is_active IS NULL;

      UPDATE public.users
      SET del_flg = 'N'
      WHERE del_flg IS NULL;
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

