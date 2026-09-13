import { Router } from 'express';
import healthRouter from './health';
import statsRouter from './stats';
import chunksRouter from './chunks';

const router = Router();

router.use(healthRouter);
router.use(statsRouter);
router.use(chunksRouter);

export default router;
