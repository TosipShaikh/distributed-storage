import { Router } from 'express';
import healthRouter from './health';
import nodesRouter from './nodes';
import storageNodesRouter from './storageNodes';
import authRouter from './auth';
import filesRouter from './files';
import adminRouter from './admin';

const router = Router();

router.use(healthRouter);
router.use('/nodes', nodesRouter);
router.use(storageNodesRouter);
router.use('/auth', authRouter);
router.use('/files', filesRouter);
router.use('/admin', adminRouter);

export default router;
