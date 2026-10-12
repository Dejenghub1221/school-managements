/**
 * data.js — compatibility shim
 *
 * All routes still import from './data.js' (unchanged).
 * This file now re-exports everything from the real PostgreSQL
 * layer in ./db/index.js, so no route file needs to be touched.
 */
export { pool, CLS, SUB, feeStatus, nid, PREFIX, q, q1, qa } from './db/index.js';
