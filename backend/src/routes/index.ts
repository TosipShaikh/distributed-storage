import { Router } from 'express';
import healthRouter from './health';
import nodesRouter from './nodes';

const router = Router();

router.use(healthRouter);
router.use(nodesRouter);

export default router;
