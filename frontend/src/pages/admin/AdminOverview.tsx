import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  adminApi,
  type AdminOverviewResponse,
} from '../../api/admin';
import {
  StorageUtilizationChart,
  NodeDistributionChart,
} from '../../components/admin/AdminCharts';
import LoadingSpinner from '../../components/LoadingSpinner';
import {
  IconServer,
  IconDatabase,
  IconShieldCheck,
  IconCheckCircle,
  IconAlertTriangle,
  IconFile,
} from '../../components/Icons';

const formatBytes = (bytes: number): string => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
};

const AdminOverview: React.FC = () => {
  const [data, setData] = useState<AdminOverviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOverview = async () => {
    try {
      setError(null);
      const res = await adminApi.getOverview();
      setData(res);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to load cluster overview');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
    const interval = setInterval(fetchOverview, 6000);
    return () => clearInterval(interval);
  }, []);

  if (isLoading && !data) {
    return <LoadingSpinner message="Querying distributed cluster state..." />;
  }

  if (error && !data) {
    return (
      <div className="admin-error-box">
        <IconAlertTriangle size={32} />
        <h3>Failed to Connect to Cluster</h3>
        <p>{error}</p>
        <button onClick={fetchOverview} className="btn-primary">
          Retry
        </button>
      </div>
    );
  }

  const nodes = data?.nodes.list || [];
  const healthyCount = data?.nodes.healthy || 0;
  const failedCount = data?.nodes.failed || 0;
  const totalNodes = data?.nodes.total || nodes.length;

  return (
    <div className="admin-page-container">
      <div className="admin-page-header">
        <div>
          <h2>Distributed Storage Cluster Overview</h2>
          <p className="admin-page-subtitle">
            Real-time control plane telemetry, node health status, and replica metrics
          </p>
        </div>
        <div className="admin-header-actions">
          <Link to="/admin/nodes" className="btn-secondary">
            Manage Nodes
          </Link>
          <Link to="/admin/replication" className="btn-primary">
            View Replication Tree
          </Link>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="kpi-grid">
        {/* 1. Storage Nodes */}
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">Storage Nodes</span>
            <div className="kpi-icon-box blue">
              <IconServer size={20} />
            </div>
          </div>
          <div className="kpi-value">{totalNodes}</div>
          <div className="kpi-sub">
            <span className="kpi-tag success">🟢 {healthyCount} Healthy</span>
            {failedCount > 0 && <span className="kpi-tag danger">🔴 {failedCount} Failed</span>}
          </div>
        </div>

        {/* 2. Total Files */}
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">Stored Files</span>
            <div className="kpi-icon-box purple">
              <IconFile size={20} />
            </div>
          </div>
          <div className="kpi-value">{data?.data.totalFiles || 0}</div>
          <div className="kpi-sub">
            <span className="kpi-label">Volume: {formatBytes(data?.data.totalFileBytes || 0)}</span>
          </div>
        </div>

        {/* 3. Chunks & Replicas */}
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">Total Chunks</span>
            <div className="kpi-icon-box green">
              <IconDatabase size={20} />
            </div>
          </div>
          <div className="kpi-value">{data?.data.totalChunks || 0}</div>
          <div className="kpi-sub">
            <span className="kpi-label">{data?.data.totalReplicas || 0} Total Replicas ({data?.data.activeReplicas || 0} Active)</span>
          </div>
        </div>

        {/* 4. Replication Factor */}
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">Replication Factor</span>
            <div className="kpi-icon-box amber">
              <IconShieldCheck size={20} />
            </div>
          </div>
          <div className="kpi-value">{data?.data.replicationFactor || 2}x</div>
          <div className="kpi-sub">
            <span className="kpi-tag info">Target: 2 Copies/Chunk</span>
          </div>
        </div>
      </div>

      {/* Storage Nodes Visualization Matrix */}
      <div className="admin-section-box">
        <div className="section-box-header">
          <div>
            <h3>Storage Node Health Matrix</h3>
            <p className="section-sub">Live heartbeat indicators and storage allocation across cluster daemons</p>
          </div>
          <Link to="/admin/nodes" className="section-link">
            Explore All Nodes &rarr;
          </Link>
        </div>

        <div className="node-matrix-grid">
          {nodes.map((node, index) => {
            const isHealthy = node.status === 'HEALTHY' || node.status === 'online';
            const shortName = `N${index + 1}`;

            return (
              <div key={node.nodeId} className={`node-matrix-card ${isHealthy ? 'healthy' : 'failed'}`}>
                <div className="matrix-top">
                  <div className="matrix-name-row">
                    <span className="matrix-short-badge">{shortName}</span>
                    <span className="matrix-node-id">{node.nodeId}</span>
                  </div>
                  <span className={`matrix-status-pill ${isHealthy ? 'healthy' : 'failed'}`}>
                    {isHealthy ? '🟢 Healthy' : '🔴 Failed'}
                  </span>
                </div>

                <div className="matrix-specs">
                  <div className="spec-row">
                    <span>Host / Port:</span>
                    <strong>{node.host}:{node.port}</strong>
                  </div>
                  <div className="spec-row">
                    <span>Capacity Used:</span>
                    <strong>{formatBytes(node.usedStorage ?? node.currentUsage ?? 0)} / {formatBytes(node.totalStorage ?? node.totalCapacity ?? 0)}</strong>
                  </div>
                  <div className="spec-row">
                    <span>Active Replicas:</span>
                    <strong>{node.activeReplicas} chunks hosted</strong>
                  </div>
                </div>

                <div className="matrix-progress-bar">
                  <div
                    className={`matrix-progress-fill ${isHealthy ? 'green' : 'red'}`}
                    style={{ width: `${Math.max(4, node.utilizationPercent || 0)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Interactive Charts Section */}
      <div className="admin-charts-grid">
        <StorageUtilizationChart
          usedBytes={data?.storage.usedStorageBytes || 0}
          totalBytes={data?.storage.totalCapacityBytes || 0}
          utilizationPercent={data?.storage.utilizationPercent || 0}
          nodes={nodes.map((n) => ({
            nodeId: n.nodeId,
            usedStorage: n.usedStorage ?? n.currentUsage ?? 0,
            totalStorage: n.totalStorage ?? n.totalCapacity ?? 0,
          }))}
        />

        <NodeDistributionChart
          nodes={nodes.map((n) => ({
            nodeId: n.nodeId,
            activeReplicas: n.activeReplicas || 0,
            status: n.status,
          }))}
        />
      </div>

      {/* Recent Recovery Events Table */}
      <div className="admin-section-box">
        <div className="section-box-header">
          <div>
            <h3>Recent Automated Recovery Events</h3>
            <p className="section-sub">Autonomous node failure detection and replica replacement log</p>
          </div>
          <Link to="/admin/recovery" className="section-link">
            Recovery Center &rarr;
          </Link>
        </div>

        {(!data?.recovery.recentEvents || data.recovery.recentEvents.length === 0) ? (
          <div className="empty-events-banner">
            <IconCheckCircle size={20} />
            <span>No failure events detected yet. Cluster running in optimal state.</span>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Event ID</th>
                  <th>Type</th>
                  <th>Target Node</th>
                  <th>Status</th>
                  <th>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {data.recovery.recentEvents.slice(0, 5).map((ev: any) => (
                  <tr key={ev.id}>
                    <td><code>#{ev.id}</code></td>
                    <td><span className="badge-type">{ev.event_type}</span></td>
                    <td>Node ID #{ev.node_id ?? 'Cluster'}</td>
                    <td>
                      <span className={`status-badge-sm ${ev.status}`}>
                        {ev.status}
                      </span>
                    </td>
                    <td>{new Date(ev.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminOverview;
