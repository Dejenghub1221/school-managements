import express from 'express';
import cors from 'cors';

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

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Authentication
app.post('/api/login', login);

// Generic CRUD for all entity types
setupCrud(app);

// Student profile aggregate
app.use('/api/students', auth, studentsRouter);

// Payments list
app.use('/api/payments', auth, paymentsRouter);

// Dashboard (stats + overview)
app.use('/api', auth, statsRouter);

// Attendance
app.use('/api/attendance', auth, attendanceRouter);

// Exam results / marks
app.use('/api/results', auth, resultsRouter);

// Timetable
app.use('/api/timetable', auth, timetableRouter);

// Reports
app.use('/api/reports', auth, reportsRouter);

// Settings (GET is public, PUT requires auth — handled inside the router)
app.use('/api/settings', settingsRouter);

// Classes list helper
app.use('/api/classes-list', auth, classesListRouter);

// Global error handler
app.use(errorHandler);

const PORT = Number(process.env.PORT) || 4000;

// Verify DB connection before accepting traffic
pool.query('SELECT 1')
  .then(() => {
    console.log('✅  Database connected.');
    app.listen(PORT, '0.0.0.0', () => console.log(`🚀  API on http://localhost:${PORT}`));
  })
  .catch(err => {
    console.error('❌  Database connection failed:', err.message);
    process.exit(1);
  });
