import 'dotenv/config';
import { pool } from './index.js';

export async function migrateRegistrationPaymentSchema() {
  try {
    // 1. Fee structures table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.fee_structures (
        id TEXT PRIMARY KEY,
        cls TEXT NOT NULL,
        term TEXT NOT NULL DEFAULT 'Term 1',
        amount NUMERIC(10, 2) NOT NULL DEFAULT 500.00,
        min_initial_payment NUMERIC(10, 2) NOT NULL DEFAULT 250.00,
        description TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(cls, term)
      );
    `);

    // Seed default fee structures for classes 7A to 9B if empty
    const defaultStructures = [
      { id: 'FS_7A_Term1', cls: '7A', term: 'Term 1', amount: 500.00, min_initial: 250.00, desc: 'Grade 7A Standard Term 1 Tuition & Registration' },
      { id: 'FS_7B_Term1', cls: '7B', term: 'Term 1', amount: 500.00, min_initial: 250.00, desc: 'Grade 7B Standard Term 1 Tuition & Registration' },
      { id: 'FS_8A_Term1', cls: '8A', term: 'Term 1', amount: 600.00, min_initial: 300.00, desc: 'Grade 8A Standard Term 1 Tuition & Registration' },
      { id: 'FS_8B_Term1', cls: '8B', term: 'Term 1', amount: 600.00, min_initial: 300.00, desc: 'Grade 8B Standard Term 1 Tuition & Registration' },
      { id: 'FS_9A_Term1', cls: '9A', term: 'Term 1', amount: 700.00, min_initial: 350.00, desc: 'Grade 9A Standard Term 1 Tuition & Registration' },
      { id: 'FS_9B_Term1', cls: '9B', term: 'Term 1', amount: 700.00, min_initial: 350.00, desc: 'Grade 9B Standard Term 1 Tuition & Registration' },
    ];

    for (const fs of defaultStructures) {
      await pool.query(`
        INSERT INTO public.fee_structures (id, cls, term, amount, min_initial_payment, description)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (cls, term) DO UPDATE SET
          amount = EXCLUDED.amount,
          min_initial_payment = EXCLUDED.min_initial_payment;
      `, [fs.id, fs.cls, fs.term, fs.amount, fs.min_initial, fs.desc]);
    }

    // 2. Enhance students table
    await pool.query(`
      ALTER TABLE public.students
        ADD COLUMN IF NOT EXISTS registration_status TEXT DEFAULT 'Active',
        ADD COLUMN IF NOT EXISTS discount_applied NUMERIC(10, 2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS discount_reason TEXT,
        ADD COLUMN IF NOT EXISTS discount_by TEXT,
        ADD COLUMN IF NOT EXISTS enrolled_at TIMESTAMPTZ DEFAULT NOW();
    `);

    // 3. Enhance fees table
    await pool.query(`
      ALTER TABLE public.fees
        ADD COLUMN IF NOT EXISTS original_amount NUMERIC(10, 2),
        ADD COLUMN IF NOT EXISTS discount NUMERIC(10, 2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS discount_reason TEXT,
        ADD COLUMN IF NOT EXISTS discount_approved_by TEXT;
    `);

    // 4. Enhance payments table
    await pool.query(`
      ALTER TABLE public.payments
        ADD COLUMN IF NOT EXISTS fee_id TEXT,
        ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'Cash',
        ADD COLUMN IF NOT EXISTS reference_code TEXT,
        ADD COLUMN IF NOT EXISTS received_by TEXT,
        ADD COLUMN IF NOT EXISTS notes TEXT,
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
    `);

    console.log('✅ Mandatory student fee payment & structure schema verified in database.');
  } catch (err) {
    console.warn('⚠️ Mandatory student fee payment migration note:', err.message);
  }
}

// Allow direct CLI execution
if (process.argv[1]?.endsWith('migrate_registration_payment.js')) {
  migrateRegistrationPaymentSchema().then(() => process.exit(0)).catch(e => {
    console.error(e);
    process.exit(1);
  });
}

