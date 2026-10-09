import http from 'http';
import { config } from '../config';
import { storageService } from './storageService';

export class NodeLifecycle {
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private isRegistered = false;
  private isShuttingDown = false;

  /**
   * Register this storage node with the backend coordinator.
   */
  async register(): Promise<boolean> {
    const stats = storageService.getStats();
    const payload = {
      nodeId: config.nodeId,
      host: config.host,
      port: config.port,
      totalCapacity: stats.totalStorage,
      currentUsage: stats.usedStorage,
    };

    try {
      console.log(`[${config.nodeId}] Registering with backend coordinator at ${config.backendUrl}/api/nodes/register...`);
      const response = await fetch(`${config.backendUrl}/api/nodes/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`[${config.nodeId}] Registration rejected by backend (HTTP ${response.status}): ${errorText}`);
        return false;
      }

      const result = await response.json();
      this.isRegistered = true;
      console.log(
        `[${config.nodeId}] Registered successfully with backend! (Capacity: ${stats.totalStorage} B, Used: ${stats.usedStorage} B)`
      );
      return true;
    } catch (error) {
      console.warn(
        `[${config.nodeId}] Backend coordinator unreachable during registration (${config.backendUrl}): ${(error as Error).message}. Will retry during heartbeat loop.`
      );
      return false;
    }
  }

  /**
   * Send a single heartbeat to the backend coordinator.
   */
  async sendHeartbeat(status: 'HEALTHY' | 'UNAVAILABLE' = 'HEALTHY'): Promise<boolean> {
    if (this.isShuttingDown && status === 'HEALTHY') {
      return false;
    }

    const stats = storageService.getStats();
    const payload = {
      nodeId: config.nodeId,
      currentUsage: stats.usedStorage,
      totalCapacity: stats.totalStorage,
      status,
    };

    try {
      const response = await fetch(`${config.backendUrl}/api/nodes/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.status === 404) {
        console.warn(`[${config.nodeId}] Backend reported node not registered. Attempting re-registration...`);
        this.isRegistered = false;
        await this.register();
        return false;
      }

      if (!response.ok) {
        console.warn(`[${config.nodeId}] Heartbeat rejected by backend (HTTP ${response.status})`);
        return false;
      }

      console.log(`[${config.nodeId}] Heartbeat sent to backend (Status: ${status}, Used: ${stats.usedStorage} B)`);
      return true;
    } catch (error) {
      console.warn(`[${config.nodeId}] Heartbeat transmission failed: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * Start lifecycle: register node and commence periodic heartbeat loop.
   */
  start(): void {
    // 1. Initial registration
    this.register().catch((err) => {
      console.warn(`[${config.nodeId}] Initial registration error:`, err.message);
    });

    // 2. Start heartbeat timer
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    console.log(
      `[${config.nodeId}] Starting heartbeat loop (interval: ${config.heartbeatIntervalMs}ms)`
    );

    this.heartbeatTimer = setInterval(async () => {
      if (!this.isRegistered) {
        const ok = await this.register();
        if (ok) {
          await this.sendHeartbeat('HEALTHY');
        }
      } else {
        await this.sendHeartbeat('HEALTHY');
      }
    }, config.heartbeatIntervalMs);
  }

  /**
   * Graceful node shutdown: notify coordinator of UNAVAILABLE status and clean up timers.
   */
  async shutdown(server?: http.Server, signal: string = 'SIGTERM'): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    console.log(`[${config.nodeId}] Initiating graceful shutdown (${signal})...`);

    // 1. Stop heartbeat loop
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    // 2. Notify backend coordinator of graceful departure (mark UNAVAILABLE)
    try {
      await this.sendHeartbeat('UNAVAILABLE');
      console.log(`[${config.nodeId}] Sent UNAVAILABLE status to coordinator.`);
    } catch {
      // Ignore departure transmission error during shutdown
    }

    // 3. Close HTTP server
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => {
          console.log(`[${config.nodeId}] HTTP server closed.`);
          resolve();
        });
      });
    }

    console.log(`[${config.nodeId}] Graceful shutdown complete. Exiting.`);
  }
}

export const nodeLifecycle = new NodeLifecycle();
