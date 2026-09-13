import { useState, useEffect } from 'react';
import apiClient from '../api/client';

interface ServiceHealth {
  mysql: boolean;
  redis: boolean;
}

interface HealthData {
  status: string;
  uptime: number;
  timestamp: string;
  services: ServiceHealth;
}

interface StorageNode {
  url: string;
  status: string;
  nodeId?: string;
  uptime?: number;
  error?: string;
}

interface NodesData {
  totalNodes: number;
  onlineNodes: number;
  nodes: StorageNode[];
}

function Dashboard() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [nodes, setNodes] = useState<NodesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      setError(null);

      const [healthRes, nodesRes] = await Promise.all([
        apiClient.get('/api/health'),
        apiClient.get('/api/nodes'),
      ]);

      setHealth(healthRes.data);
      setNodes(nodesRes.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to backend');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 15000);
    return () => clearInterval(interval);
  }, []);

  const formatUptime = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h}h ${m}m ${s}s`;
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'ok':
      case 'online':
        return '#22c55e';
      case 'degraded':
        return '#f59e0b';
      default:
        return '#ef4444';
    }
  };

  const getStatusEmoji = (status: string): string => {
    switch (status) {
      case 'ok':
      case 'online':
        return '●';
      case 'degraded':
        return '●';
      default:
        return '●';
    }
  };

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>Distributed File Storage</h1>
        <p className="subtitle">System Dashboard</p>
        <button className="refresh-btn" onClick={fetchStatus} disabled={loading}>
          {loading ? 'Refreshing...' : '↻ Refresh'}
        </button>
      </div>

      {error && (
        <div className="card error-card">
          <h3>⚠ Connection Error</h3>
          <p>{error}</p>
          <p className="hint">Make sure the backend is running on port 4000.</p>
        </div>
      )}

      {health && (
        <div className="card">
          <h2>
            <span
              className="status-dot"
              style={{ color: getStatusColor(health.status) }}
            >
              {getStatusEmoji(health.status)}
            </span>
            {' '}Coordinator Status
          </h2>
          <div className="status-grid">
            <div className="status-item">
              <span className="label">Status</span>
              <span className="value" style={{ color: getStatusColor(health.status) }}>
                {health.status.toUpperCase()}
              </span>
            </div>
            <div className="status-item">
              <span className="label">Uptime</span>
              <span className="value">{formatUptime(health.uptime)}</span>
            </div>
            <div className="status-item">
              <span className="label">MySQL</span>
              <span className="value" style={{ color: health.services.mysql ? '#22c55e' : '#ef4444' }}>
                {health.services.mysql ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            <div className="status-item">
              <span className="label">Redis</span>
              <span className="value" style={{ color: health.services.redis ? '#22c55e' : '#ef4444' }}>
                {health.services.redis ? 'Connected' : 'Disconnected'}
              </span>
            </div>
          </div>
        </div>
      )}

      {nodes && (
        <div className="card">
          <h2>Storage Nodes ({nodes.onlineNodes}/{nodes.totalNodes} online)</h2>
          <div className="nodes-grid">
            {nodes.nodes.map((node, index) => (
              <div key={index} className={`node-card ${node.status}`}>
                <div className="node-header">
                  <span
                    className="status-dot"
                    style={{ color: getStatusColor(node.status) }}
                  >
                    {getStatusEmoji(node.status)}
                  </span>
                  <span className="node-id">{node.nodeId || `Node ${index + 1}`}</span>
                </div>
                <div className="node-details">
                  <span className="node-status" style={{ color: getStatusColor(node.status) }}>
                    {node.status.toUpperCase()}
                  </span>
                  {node.uptime !== undefined && (
                    <span className="node-uptime">Up: {formatUptime(node.uptime)}</span>
                  )}
                  {node.error && (
                    <span className="node-error">{node.error}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && !error && !health && (
        <div className="card">
          <p>No data available. The backend may still be starting up.</p>
        </div>
      )}
    </div>
  );
}

export default Dashboard;
