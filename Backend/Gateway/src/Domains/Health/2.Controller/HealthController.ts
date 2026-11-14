import { Router } from 'express';
import { checkChainHealth } from '../3.Services/CheckChainHealth';

export class HealthController {
  registerRoutes(): Router {
    const router = Router();
    // Solo el proceso del Gateway.
    router.get('/isAlive', (_req, res) => {
      res.json({ data: { ok: true } });
    });
    // Ida y vuelta Gateway → Business → DataAccess (→ Postgres en la tanda 3).
    router.get('/isAliveChain', async (_req, res) => {
      await checkChainHealth();
      res.json({ data: { ok: true } });
    });
    return router;
  }
}
