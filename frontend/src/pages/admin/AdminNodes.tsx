import React, { useState, useEffect } from 'react';
import { adminApi, type AdminNode } from '../../api/admin';
import LoadingSpinner from '../../components/LoadingSpinner';
import {
  IconAlertTriangle,
  IconCheckCircle,
  IconRefresh,
  IconShieldCheck,
  IconServer,
  IconDatabase,
} from '../../components/Icons';

const formatBytes = (bytes: number): string => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
};

const AdminNodes: React.FC = () => {
  const [nodes, setNodes] = useState<AdminNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fetchNodes = async () => {
    try {
      const res = await adminApi.getNodes();
      setNodes(res.nodes);
    } catch (err: any) {
      console.error('Failed to fetch storage nodes', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchNodes();
    const interval = setInterval(fetchNodes, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleSimulateFailure = async (nodeId: string) => {
    try {
      setActionLoading(nodeId);
      setMessage(null);
      await adminApi.simulateNodeFailure(nodeId);
      setMessage({
        text: `Simulated crash for '${nodeId}'. Node marked FAILED in MySQL & Redis! Examiner can observe replica failover.`,
        type: 'error',
      });
      await fetchNodes();
    } catch (err: any) {
      setMessage({
        text: err.response?.data?.message || `Failed to simulate failure for ${nodeId}`,
        type: 'error',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleSimulateRestore = async (nodeId: string) => {
    try {
      setActionLoading(nodeId);
      setMessage(null);
      const res = await adminApi.simulateNodeRestore(nodeId);
      setMessage({
        text: `Restored node '${nodeId}' back to HEALTHY! ${res.message || 'All replicas re-synchronized.'}`,
        type: 'success',
      });
      await fetchNodes();
    } catch (err: any) {
      setMessage({
        text: err.response?.data?.message || `Failed to restore ${nodeId}`,
        type: 'error',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleReconcile = async (nodeId: string) => {
    try {
      setActionLoading(`rec-${nodeId}`);
      setMessage(null);
      const res = await adminApi.reconcileNode(nodeId);
      setMessage({
        text: res.message || `Node '${nodeId}' reconciled successfully! Replicas synchronized with disk storage.`,
        type: 'success',
      });
      await fetchNodes();
    } catch (err: any) {
      setMessage({
        text: err.response?.data?.message || `Failed to reconcile node ${nodeId}`,
        type: 'error',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleReconcileAll = async () => {
    try {
      setActionLoading('all-rec');
      setMessage(null);
      for (const n of nodes) {
        await adminApi.reconcileNode(n.nodeId);
      }
      setMessage({
        text: 'All cluster nodes reconciled! Replicas and disk storage synchronized across the entire cluster.',
        type: 'success',
      });
      await fetchNodes();
    } catch (err: any) {
      setMessage({
        text: err.response?.data?.message || 'Failed to reconcile all cluster nodes',
        type: 'error',
      });
    } finally {
      setActionLoading(null);
    }
  };

  if (isLoading && nodes.length === 0) {
    return <LoadingSpinner message="Inspecting storage nodes..." />;
  }

  const healthyCount = nodes.filter((n) => n.status === 'HEALTHY' || n.status === 'online').length;
  const failedCount = nodes.filter((n) => n.status === 'FAILED').length;
  const totalClusterUsed = nodes.reduce((acc, n) => acc + (n.usedStorage || 0), 0);
  const totalClusterCap = nodes.reduce((acc, n) => acc + (n.totalStorage || 0), 0);
  const totalReplicasCount = nodes.reduce((acc, n) => acc + (n.activeReplicas || 0), 0);

  return (
    <div className="admin-page-container">
      {/* Page Header */}
      <div className="admin-page-header">
        <div>
          <h2>Storage Nodes & Cluster Topology</h2>
          <p className="admin-page-subtitle">
            Physical storage node telemetry, disk volume capacity, heartbeat health, and examiner failover simulation
          </p>
        </div>
        <div className="admin-header-actions">
          <button onClick={handleReconcileAll} disabled={actionLoading === 'all-rec'} className="btn-secondary" title="Reconcile replicas with physical storage across all nodes">
            <IconShieldCheck size={16} />
            <span>{actionLoading === 'all-rec' ? 'Reconciling...' : 'Reconcile Replicas'}</span>
          </button>
          <button onClick={fetchNodes} className="btn-secondary">
            <IconRefresh size={16} />
            <span>Poll Nodes</span>
          </button>
        </div>
      </div>

      {message && (
        <div className={`alert-banner ${message.type === 'success' ? 'info' : 'error'}`}>
          {message.type === 'success' ? <IconCheckCircle size={18} /> : <IconAlertTriangle size={18} />}
          <span>{message.text}</span>
        </div>
      )}

      {/* High-Tech Cluster Topology KPI Strip */}
      <div className="node-kpi-strip">
        <div className="node-kpi-item">
          <div className="kpi-icon-wrap blue">
            <IconServer size={20} />
          </div>
          <div className="kpi-info-wrap">
            <span className="kpi-sub-label">Cluster Daemons</span>
            <span className="kpi-main-val">
              {healthyCount} / {nodes.length} <span className="kpi-unit">Online</span>
            </span>
            <span className="kpi-foot-label text-success">
              {failedCount === 0 ? '● 100% Availability' : `● ${failedCount} Node(s) Down`}
            </span>
          </div>
        </div>

        <div className="node-kpi-item">
          <div className="kpi-icon-wrap emerald">
            <IconDatabase size={20} />
          </div>
          <div className="kpi-info-wrap">
            <span className="kpi-sub-label">Active Stored Data</span>
            <span className="kpi-main-val">{formatBytes(totalClusterUsed)}</span>
            <span className="kpi-foot-label text-muted">Across {totalReplicasCount} chunk replicas</span>
          </div>
        </div>

        <div className="node-kpi-item">
          <div className="kpi-icon-wrap purple">
            <IconShieldCheck size={20} />
          </div>
          <div className="kpi-info-wrap">
            <span className="kpi-sub-label">Replication Factor</span>
            <span className="kpi-main-val">2x <span className="kpi-unit">Target</span></span>
            <span className="kpi-foot-label text-info">● Round-Robin Balanced</span>
          </div>
        </div>

        <div className="node-kpi-item">
          <div className="kpi-icon-wrap cyan">
            <IconServer size={20} />
          </div>
          <div className="kpi-info-wrap">
            <span className="kpi-sub-label">Total Disk Capacity</span>
            <span className="kpi-main-val">{formatBytes(totalClusterCap)}</span>
            <span className="kpi-foot-label text-success">● {formatBytes(Math.max(0, totalClusterCap - totalClusterUsed))} Free Disk</span>
          </div>
        </div>
      </div>

      {/* Storage Node Visualization Cards (2x2 Balanced Grid) */}
      <div className="nodes-cards-grid-balanced">
        {nodes.map((node, index) => {
          const isHealthy = node.status === 'HEALTHY' || node.status === 'online';
          const shortName = `N${index + 1}`;
          const isActing = actionLoading === node.nodeId || actionLoading === `rec-${node.nodeId}`;
          const failedReplicas = node.failedReplicas || 0;

          // Calculate cluster data share percentage for a realistic visible bar
          const clusterSharePct =
            totalClusterUsed > 0
              ? Math.round((node.usedStorage / totalClusterUsed) * 1000) / 10
              : 25;
          const visibleBarWidth = Math.max(10, Math.min(100, clusterSharePct));

          return (
            <div
              key={node.nodeId}
              className={`storage-node-card-modern ${isHealthy ? 'status-healthy' : 'status-failed'}`}
            >
              {/* Card Top: Avatar, Node ID, Live Beacon */}
              <div className="node-card-top-modern">
                <div className="node-badge-group-modern">
                  <div className={`node-short-avatar ${isHealthy ? 'green' : 'red'}`}>
                    <span>{shortName}</span>
                  </div>
                  <div>
                    <div className="node-title-row">
                      <h3 className="node-id-title-modern">{node.nodeId}</h3>
                      <span className="node-port-tag">:{node.port}</span>
                    </div>
                    <span className="node-url-code">{node.url}</span>
                  </div>
                </div>

                <div className={`node-live-status-pill ${isHealthy ? 'healthy' : 'failed'}`}>
                  <span className="pulsing-beacon" />
                  <span>{isHealthy ? 'Healthy' : 'Failed'}</span>
                </div>
              </div>

              {/* Heartbeat & Sync Strip */}
              <div className="node-heartbeat-strip">
                <div className="hb-left">
                  <span className="hb-dot-indicator" />
                  <span className="hb-title-sub">Heartbeat:</span>
                  <span className="hb-val-text">
                    {node.secondsSinceHeartbeat !== null
                      ? `${node.secondsSinceHeartbeat}s ago`
                      : 'Awaiting sync'}
                  </span>
                </div>
                <span className={`hb-pill-modern ${node.secondsSinceHeartbeat !== null && node.secondsSinceHeartbeat < 15 ? 'active' : 'stale'}`}>
                  {node.secondsSinceHeartbeat !== null && node.secondsSinceHeartbeat < 15 ? 'Synchronized' : 'Missed'}
                </span>
              </div>

              {/* Physical Storage & Volume Utilization */}
              <div className="node-storage-section">
                <div className="storage-label-row">
                  <span className="storage-sub">Physical Data Used:</span>
                  <div className="storage-vals">
                    <strong className="used-strong">{formatBytes(node.usedStorage)}</strong>
                    <span className="slash">/</span>
                    <span className="cap-total">{formatBytes(node.totalStorage)}</span>
                  </div>
                </div>

                <div className="storage-progress-track">
                  <div
                    className={`storage-progress-bar-glow ${isHealthy ? 'green' : 'red'}`}
                    style={{ width: `${visibleBarWidth}%` }}
                  />
                </div>

                <div className="storage-detail-row">
                  <span className="share-text">
                    <strong>{clusterSharePct}%</strong> of active cluster data
                  </span>
                  <span className="free-text">
                    {formatBytes(node.availableStorage)} Available
                  </span>
                </div>
              </div>

              {/* Replica Health & Consistency Row */}
              <div className="node-replica-health-box">
                <div className="replica-col">
                  <span className="rep-label">Active Replicas</span>
                  <div className="rep-val-row">
                    <span className="rep-num">{node.activeReplicas}</span>
                    <span className="rep-unit">chunks</span>
                  </div>
                </div>

                {failedReplicas > 0 ? (
                  <div className="stale-replica-warning">
                    <div className="stale-warn-text">
                      <IconAlertTriangle size={14} />
                      <span>{failedReplicas} Stale / Failover ({formatBytes(node.usedStorage)})</span>
                    </div>
                    {isHealthy && (
                      <button
                        onClick={() => handleReconcile(node.nodeId)}
                        disabled={isActing}
                        className="btn-reconcile-sm"
                        title="Re-activate replicas to match disk storage"
                      >
                        {isActing ? 'Syncing...' : 'Re-sync'}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="replica-healthy-tag">
                    <IconCheckCircle size={14} />
                    <span>In Sync with Disk</span>
                  </div>
                )}
              </div>

              {/* Hardware & Network Metrics Chip Grid */}
              <div className="node-telemetry-chips">
                <div className="t-chip">
                  <span className="t-label">Host Container</span>
                  <span className="t-val">{node.host}</span>
                </div>
                <div className="t-chip">
                  <span className="t-label">Port Binding</span>
                  <span className="t-val">:{node.port}</span>
                </div>
                <div className="t-chip">
                  <span className="t-label">Disk Free</span>
                  <span className="t-val">{formatBytes(node.availableStorage)}</span>
                </div>
                <div className="t-chip">
                  <span className="t-label">Uptime State</span>
                  <span className={`t-val ${isHealthy ? 'text-success' : 'text-danger'}`}>
                    {isHealthy ? '100% Operational' : 'Node Offline'}
                  </span>
                </div>
              </div>

              {/* Examiner Simulation & Demonstration Controls */}
              <div className="node-examiner-panel">
                <div className="examiner-header-row">
                  <span className="examiner-title">EXAMINER DEMONSTRATION CONTROLS</span>
                  <span className="examiner-badge">Simulate Fault</span>
                </div>

                <div className="examiner-btn-group">
                  {isHealthy ? (
                    <button
                      className="btn-danger-examiner"
                      disabled={isActing}
                      onClick={() => handleSimulateFailure(node.nodeId)}
                      title="Simulate sudden node failure to trigger automated failover recovery"
                    >
                      {isActing ? 'Crashing...' : 'Simulate Node Crash (Failover Test 🔴)'}
                    </button>
                  ) : (
                    <button
                      className="btn-success-examiner"
                      disabled={isActing}
                      onClick={() => handleSimulateRestore(node.nodeId)}
                      title="Restore storage node back to online health & synchronize replicas"
                    >
                      {isActing ? 'Restoring...' : 'Restore Storage Node (Online 🟢)'}
                    </button>
                  )}

                  {isHealthy && (
                    <button
                      className="btn-sync-examiner"
                      disabled={isActing}
                      onClick={() => handleReconcile(node.nodeId)}
                      title="Force synchronization between MySQL replica registry and physical disk"
                    >
                      {isActing ? 'Syncing...' : 'Reconcile Replicas 🔄'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AdminNodes;
