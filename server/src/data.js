/**
 * data.js — backwards-compatibility shim.
 *
 * Routes that still do `import { CLS, SUB, feeStatus } from '../data.js'`
 * continue to work without any change. The in-memory `db` object no longer
 * exists — all data is now in PostgreSQL via db/index.js.
 */
export { pool, CLS, SUB, feeStatus, nid, PREFIX, q, q1, qa } from './db/index.js';
