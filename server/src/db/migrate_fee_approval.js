import 'dotenv/config';
import { pool } from './index.js';

export async function migrateFeeApprovalSchema() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.fee_payment_submissions (
        id TEXT PRIMARY KEY,
        fee_id TEXT NOT NULL REFERENCES fees(id) ON DELETE CASCADE,
        student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        parent_id TEXT REFERENCES parents(id) ON DELETE SET NULL,
        parent_name TEXT,
        amount NUMERIC(10, 2) NOT NULL,
        payment_method TEXT NOT NULL,
        reference_code TEXT,
        receipt_filename TEXT NOT NULL,
        receipt_file TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Pending',
        submitted_at TIMESTAMPTZ DEFAULT NOW(),
        reviewed_by TEXT,
        reviewed_at TIMESTAMPTZ,
        review_notes TEXT
      );

      ALTER TABLE public.fees
      ADD COLUMN IF NOT EXISTS pending_submission_id TEXT;
    `);
    console.log('✅ Fee payment approval schema verified in database.');
  } catch (err) {
    console.warn('⚠️ Fee payment approval migration note:', err.message);
  }
}

// Allow direct CLI execution
if (process.argv[1]?.endsWith('migrate_fee_approval.js')) {
  migrateFeeApprovalSchema().then(() => process.exit(0)).catch(e => {
    console.error(e);
    process.exit(1);
  });
}
