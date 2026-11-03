import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool } from '../db/index.js';
import { auditLog } from '../API/auth.js';

async function main() {
  const args = process.argv.slice(2);
  const username = args[0];
  const newPassword = args[1] || 'school123';

  if (!username) {
    console.log(`
=============================================================
  School Management - Administrator Database Password Reset
=============================================================
Usage:
  node src/scripts/admin_reset_password.js <username> [newPassword]

Examples:
  node src/scripts/admin_reset_password.js student
  node src/scripts/admin_reset_password.js teacher MySecretPass123
  node src/scripts/admin_reset_password.js admin NewAdmin2026!
`);
    process.exit(1);
  }

  const cleanUsername = username.trim().toLowerCase();
  const hash = bcrypt.hashSync(newPassword, 8);

  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `UPDATE users SET
         password_hash = $1,
         password_reset_by = 'admin (database)',
         password_reset_at = NOW(),
         password_status = 'Reset by Admin (DB)',
         must_change_password = true,
         updated_at = NOW()
       WHERE LOWER(username) = $2
       RETURNING id, username, role, name, password_status, password_reset_by, password_reset_at`,
      [hash, cleanUsername]
    );

    if (!rows.length) {
      console.error(`❌ User '${username}' not found in database users table.`);
      process.exit(1);
    }

    const u = rows[0];

    // Also mark any pending reset requests for this user as resolved
    await client.query(
      `UPDATE password_reset_requests SET
         status = 'Resolved',
         resolved_at = NOW(),
         resolved_by = 'admin (database)',
         resolution_note = 'Reset directly via database administrator CLI'
       WHERE LOWER(username) = $1 AND status = 'Pending'`,
      [cleanUsername]
    );

    await auditLog(
      'admin (database)',
      'admin',
      'ADMIN_RESET_PASSWORD_DB',
      'users',
      u.id,
      { username: u.username, resetBy: 'admin (database)', timestamp: new Date() }
    );

    console.log(`
=============================================================
  PASSWORD SUCCESSFULLY RESET IN DATABASE
=============================================================
  User Name:       ${u.name}
  Username:        ${u.username}
  User Role:       ${u.role}
  New Password:    ${newPassword}
  Database Label:  ${u.password_status}
  Reset By:        ${u.password_reset_by}
  Timestamp:       ${new Date(u.password_reset_at).toLocaleString()}
=============================================================
`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Error updating password:', err.message);
    process.exit(1);
  } finally {
    client.release();
  }
}

main();

