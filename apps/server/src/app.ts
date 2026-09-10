import cors from 'cors';
import express from 'express';
import { isOriginAllowed } from './config.js';
import { createRoutes } from './routes.js';

export function createExpressApp(): express.Application {
  const app = express();

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || isOriginAllowed(origin)) {
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
