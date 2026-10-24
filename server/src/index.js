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
import featuresRouter    from './routes/features.js';

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
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Browser direct navigation helper:
// If a user navigates to /api or /api/students in their browser URL bar (text/html without auth),
// seamlessly redirect them to the corresponding frontend UI page.
app.use('/api', (req, res, next) => {
  const isBrowserNav = req.method === 'GET'
    && (req.headers.accept || '').includes('text/html')
    && !req.headers.authorization
    && !req.xhr;
  if (isBrowserNav) {
    const uiPath = req.path === '/' || req.path === '' ? '/' : req.path;
    return res.redirect(uiPath);
  }
  next();
});

app.get(['/api', '/api/health'], (req, res) => {
  res.json({
    status: 'online',
    name: 'School Management API',
    version: '1.0.0',
    appUrl: '/'
  });
});
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
app.use('/api',              auth, featuresRouter);

// ── Serve React frontend ──────────────────────────────────────────────────
if (DIST) {
  app.use(express.static(DIST, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
    }
  }));
  app.get('*', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(join(DIST, 'index.html'));
  });
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
