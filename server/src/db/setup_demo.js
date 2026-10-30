import 'dotenv/config';
import { pool } from './index.js';

async function updateSetup() {
  await pool.query("UPDATE students SET cls = '7A', guardian = 'P23' WHERE id = 'S1034'");
  await pool.query("UPDATE teachers SET classes = ARRAY['7A', '8A', '8B'] WHERE id = 'T01'");
  console.log('✅ S1034 updated to 7A & guardian P23.');
  console.log('✅ T01 updated to teach 7A, 8A, and 8B.');
  process.exit(0);
}

updateSetup().catch(err => {
  console.error(err);
  process.exit(1);
});
