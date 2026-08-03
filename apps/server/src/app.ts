import cors from 'cors';
import express from 'express';
import { ORIGIN_ALLOWLIST } from './config.js';
import { createRoutes } from './routes.js';

export function createExpressApp(): express.Application {
  const app = express();

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || ORIGIN_ALLOWLIST.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Origin not allowed'));
        }
      },
      credentials: true,
    }),
  );

  app.use(express.json({ limit: '32kb' }));
  app.use(createRoutes());

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  return app;
}
