import express from 'express';
import cors from 'cors';
import { config } from './config';
import routes from './routes';
import { errorHandler } from './middleware/errorHandler';
import { runMigrations } from './database/migration';

// Import to initialize connections
import './config/db';
import './config/redis';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Routes
app.use('/api', routes);

// Root endpoint
app.get('/', (_req, res) => {
  res.json({
    service: 'Distributed File Storage - Coordinator',
    version: '1.0.0',
    docs: '/api/health',
  });
});

// Global error handler (must be last)
app.use(errorHandler);

// Start server after ensuring database schema is migrated
async function startServer(): Promise<void> {
  try {
    await runMigrations();

    app.listen(config.port, () => {
      console.log(`================================================`);
      console.log(`  DFS Coordinator Backend`);
      console.log(`  Port:    ${config.port}`);
      console.log(`  Nodes:   ${config.storageNodes.length} configured`);
      console.log(`  Started: ${new Date().toISOString()}`);
      console.log(`================================================`);
    });
  } catch (error) {
    console.error('Fatal: Failed to initialize database metadata layer:', (error as Error).message);
    process.exit(1);
  }
}

startServer();

export default app;
