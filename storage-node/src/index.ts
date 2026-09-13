import express from 'express';
import cors from 'cors';
import fs from 'fs';
import { config } from './config';
import routes from './routes';
import { requestLogger } from './middleware/logger';
import { errorHandler } from './middleware/errorHandler';

const app = express();

// Middlewares
app.use(cors());
app.use(requestLogger);

// Parsers
app.use(express.raw({ type: ['application/octet-stream', 'application/x-binary'], limit: '100mb' }));
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// Ensure data directory exists
if (!fs.existsSync(config.dataDir)) {
  fs.mkdirSync(config.dataDir, { recursive: true });
  console.log(`[${config.nodeId}] Created data directory: ${config.dataDir}`);
}

// Routes
app.use(routes);

// Global Error Handler
app.use(errorHandler);

// Start server
app.listen(config.port, () => {
  console.log(`================================================`);
  console.log(`  Storage Node: ${config.nodeId}`);
  console.log(`  Port:         ${config.port}`);
  console.log(`  Data Dir:     ${config.dataDir}`);
  console.log(`  Started:      ${new Date().toISOString()}`);
  console.log(`================================================`);
});

export default app;
