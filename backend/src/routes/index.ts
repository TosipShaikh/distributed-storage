import { Router } from 'express';
import healthRouter from './health';
import nodesRouter from './nodes';
import storageNodesRouter from './storageNodes';
import authRouter from './auth';
import filesRouter from './files';

const router = Router();

router.use(healthRouter);
router.use(nodesRouter);
router.use(storageNodesRouter);
router.use('/auth', authRouter);
router.use('/files', filesRouter);

export default router;
