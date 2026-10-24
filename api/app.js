import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import { requireAuth, requireAdmin } from './auth/middleware.js';
import authRouter from './routes/auth.js';
import usersRouter from './routes/users.js';
import salespeopleRouter from './routes/salespeople.js';
import auditRouter from './routes/audit.js';
import companiesRouter, { contactsRouter } from './routes/companies.js';
import visitsRouter from './routes/visits.js';
import tasksRouter from './routes/tasks.js';
import requirementsRouter from './routes/requirements.js';
import todayRouter from './routes/today.js';
import directoryRouter from './routes/directory.js';
import opportunitiesRouter, { quotationLinksRouter } from './routes/opportunities.js';
import performanceRouter from './routes/performance.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.set('trust proxy', 1);

// Same-origin by default: no CORS headers are sent. CLIENT_ORIGIN (comma-separated) allow-lists
// other origins, with credentials, only if the web app is ever served from a different domain.
function allowedOrigins() {
  return (process.env.CLIENT_ORIGIN || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

app.use(
  cors({
    origin: (origin, callback) => callback(null, Boolean(origin) && allowedOrigins().includes(origin)),
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (req.path.startsWith('/api')) res.setHeader('Cache-Control', 'private, no-store');
  next();
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.use('/api/auth', authRouter);

// Everything below requires a signed-in, active user. Each router then checks the role.
app.use('/api', requireAuth);
app.use('/api/admin/users', requireAdmin, usersRouter);
app.use('/api/admin/salespeople', requireAdmin, salespeopleRouter);
app.use('/api/admin/audit', requireAdmin, auditRouter);
app.use('/api/companies', companiesRouter);
app.use('/api/contacts', contactsRouter);
app.use('/api/visits', visitsRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/requirements', requirementsRouter);
app.use('/api/today', todayRouter);
app.use('/api/salespeople', directoryRouter);
app.use('/api/opportunities', opportunitiesRouter);
app.use('/api/quotation-links', quotationLinksRouter);
app.use('/api/performance', performanceRouter);

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Production: serve the built web app (npm run build) from the same origin as the API, with
// client-side routes falling back to index.html.
const webDist = path.resolve(__dirname, '../web/dist');
if (process.env.NODE_ENV === 'production' && fs.existsSync(webDist)) {
  app.use(express.static(webDist, { index: false, maxAge: '1h' }));
  // /api/* never reaches here: the 404 handler above answers it.
  app.get('*', (req, res) => res.sendFile(path.join(webDist, 'index.html')));
}

app.use((err, req, res, next) => {
  console.error('Unhandled API error:', err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

export default app;
