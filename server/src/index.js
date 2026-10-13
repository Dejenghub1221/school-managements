import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { existsSync } from 'fs';

import { pool } from './db/index.js';
import { login, auth } from './API/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { setupCrud } from './routes/crud.js';
import studentsRouter    from './routes/students.js';
import paymentsRouter    from './routes/payments.js';
import statsRouter       from './routes/stats.js';
import attendanceRouter  from './routes/attendance.js';
import resultsRouter     from './routes/results.js';
import timetableRouter   from './routes/timetable.js';
import reportsRouter     from './routes/reports.js';
import settingsRouter    from './routes/settings.js';
import classesListRouter from './routes/classesList.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Try several candidate paths for client/dist — works both locally and on Aletcloud
const DIST_CANDIDATES = [
  join(__dirname, '..', '..', 'client', 'dist'),   // server/src → server → repo root → client/dist
  join(__dirname, '..', '..', '..', 'client', 'dist'), // one level deeper
  resolve(process.cwd(), '..', 'client', 'dist'),   // cwd=server → ../client/dist
  resolve(process.cwd(), 'client', 'dist'),          // cwd=repo root → client/dist
];

const DIST = DIST_CANDIDATES.find(p => existsSync(p));

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// ── API routes ────────────────────────────────────────────────────────────
app.post('/api/login', login);
setupCrud(app);
app.use('/api/students',     auth, studentsRouter);
app.use('/api/payments',     auth, paymentsRouter);
app.use('/api',              auth, statsRouter);
app.use('/api/attendance',   auth, attendanceRouter);
app.use('/api/results',      auth, resultsRouter);
app.use('/api/timetable',    auth, timetableRouter);
app.use('/api/reports',      auth, reportsRouter);
app.use('/api/settings',     settingsRouter);
app.use('/api/classes-list', auth, classesListRouter);

// ── Serve React frontend ──────────────────────────────────────────────────
if (DIST) {
  app.use(express.static(DIST));
  app.get('*', (req, res) => res.sendFile(join(DIST, 'index.html')));
  console.log('📦  Serving frontend from', DIST);
} else {
  console.warn('⚠️   client/dist not found — API-only mode. Run npm run build first.');
}

app.use(errorHandler);

const PORT = Number(process.env.PORT) || 4000;

pool.query('SELECT 1')
  .then(() => {
    console.log('✅  Database connected.');
    app.listen(PORT, '0.0.0.0', () => console.log(`🚀  App on http://localhost:${PORT}`));
  })
  .catch(err => {
    console.error('❌  Database connection failed:', err.message);
    process.exit(1);
  });
