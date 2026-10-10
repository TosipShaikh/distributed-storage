import React, { useState, useEffect } from 'react';
import { adminApi, type RecoveryResponse } from '../../api/admin';
import { RecoveryEventsChart } from '../../components/admin/AdminCharts';
import LoadingSpinner from '../../components/LoadingSpinner';
import {
  IconShieldCheck,
  IconRefresh,
  IconCheckCircle,
  IconAlertTriangle,
  IconServer,
  IconDatabase,
} from '../../components/Icons';

const AdminRecovery: React.FC = () => {
  const [data, setData] = useState<RecoveryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isTriggering, setIsTriggering] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fetchRecovery = async () => {
    try {
      const res = await adminApi.getRecovery();
      setData(res);
    } catch (err) {
      console.error('Failed to load recovery auditor', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRecovery();
    const interval = setInterval(fetchRecovery, 6000);
    return () => clearInterval(interval);
  }, []);

  const handleManualTrigger = async () => {
    try {
      setIsTriggering(true);
      setActionMessage(null);
      const res = await adminApi.triggerRecovery();
      setActionMessage({
        text: `Manual recovery cycle completed! ${res.message || 'Checked all nodes & replica redundancy.'}`,
        type: 'success',
      });
      await fetchRecovery();
    } catch (err: any) {
      setActionMessage({
        text: err.response?.data?.message || 'Failed to trigger recovery pass',
        type: 'error',
      });
    } finally {
      setIsTriggering(false);
    }
  };

  if (isLoading && !data) {
    return <LoadingSpinner message="Checking background recovery service..." />;
  }

  const events = data?.events || [];
  const status = data?.status;
  const breakdown = data?.eventBreakdown || {};

  return (
    <div className="admin-page-container">
      <div className="admin-page-header">
        <div>
          <h2>Automated Failure Recovery & Replica Synthesis</h2>
          <p className="admin-page-subtitle">
            Background failure monitoring, distributed lock concurrency, and idempotent replica replacement
          </p>
        </div>
        <div className="admin-header-actions">
          <button
            onClick={handleManualTrigger}
            disabled={isTriggering}
            className="btn-primary"
            title="Force immediate cluster scan for failed nodes & under-replicated chunks"
          >
            <IconShieldCheck size={16} />
            <span>{isTriggering ? 'Running Recovery...' : 'Trigger Recovery Pass'}</span>
          </button>
          <button onClick={fetchRecovery} className="btn-secondary">
            <IconRefresh size={16} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {actionMessage && (
        <div className={`alert-banner ${actionMessage.type === 'success' ? 'info' : 'error'}`}>
          {actionMessage.type === 'success' ? <IconCheckCircle size={18} /> : <IconAlertTriangle size={18} />}
          <span>{actionMessage.text}</span>
        </div>
      )}

      {/* Recovery Engine Status Banner */}
      <div className="recovery-engine-card">
        <div className="engine-card-left">
          <div className="engine-icon-beacon">
            <IconShieldCheck size={32} />
          </div>
          <div>
            <h3>Autonomous Recovery Daemon</h3>
            <p>
              Status: <span className="text-success font-semibold">ACTIVE</span> &bull; Heartbeat Timeout: 15s &bull; Auto-Retry: 3 attempts with SHA-256 validation
            </p>
          </div>
        </div>

        <div className="engine-card-metrics">
          <div className="e-metric">
            <span className="e-label">Active Recovery Jobs</span>
            <span className="e-val">{status?.activeJobs || 0}</span>
          </div>
          <div className="e-metric">
            <span className="e-label">Total Audited Events</span>
            <span className="e-val">{events.length}</span>
          </div>
          <div className="e-metric">
            <span className="e-label">Last Check</span>
            <span className="e-val-sub">
              {status?.lastCheck ? new Date(status.lastCheck).toLocaleTimeString() : 'Recent'}
            </span>
          </div>
        </div>
      </div>

      {/* Breakdown Chart */}
      <div className="recovery-charts-area">
        <RecoveryEventsChart breakdown={breakdown} totalEvents={events.length} />
      </div>

      {/* Audit Events Table */}
      <div className="admin-section-box">
        <div className="section-box-header">
          <div>
            <h3>Recovery Audit Trail (recovery_events)</h3>
            <p className="section-sub">Immutable audit log of node failure detection and replica placements</p>
          </div>
          <span className="events-count-tag">{events.length} Recorded Operations</span>
        </div>

        {events.length === 0 ? (
          <div className="empty-events-banner">
            <IconCheckCircle size={20} />
            <span>No recovery events recorded. All nodes and replicas have remained healthy.</span>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Event ID</th>
                  <th>Event Type</th>
                  <th>Affected Node</th>
                  <th>Target Chunk</th>
                  <th>Operation Status</th>
                  <th>Execution Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {events.map((ev) => (
                  <tr key={ev.id}>
                    <td><code>#{ev.id}</code></td>
                    <td>
                      <span className="badge-type">{ev.event_type}</span>
                    </td>
                    <td>
                      {ev.node_id ? (
                        <span className="node-ref-pill">
                          <IconServer size={14} />
                          <span>Node #{ev.node_id}</span>
                        </span>
                      ) : (
                        <span className="text-muted">Cluster Wide</span>
                      )}
                    </td>
                    <td>
                      {ev.chunk_id ? (
                        <span className="chunk-ref-pill">
                          <IconDatabase size={14} />
                          <span>Chunk #{ev.chunk_id}</span>
                        </span>
                      ) : (
                        <span className="text-muted">N/A</span>
                      )}
                    </td>
                    <td>
                      <span className={`status-badge-sm ${ev.status}`}>
                        {ev.status.toUpperCase()}
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

export default AdminRecovery;
