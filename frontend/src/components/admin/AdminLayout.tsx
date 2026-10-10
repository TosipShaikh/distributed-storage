import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, Link } from 'react-router-dom';
import {
  IconCloud,
  IconServer,
  IconDatabase,
  IconShieldCheck,
  IconRefresh,
  IconArrowLeft,
  IconEye,
  IconCheckCircle,
} from '../Icons';
import { adminApi, type AdminOverviewResponse } from '../../api/admin';

const AdminLayout: React.FC = () => {
  const [clusterInfo, setClusterInfo] = useState<AdminOverviewResponse | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchQuickStatus = async () => {
    try {
      setIsRefreshing(true);
      const data = await adminApi.getOverview();
      setClusterInfo(data);
    } catch (err) {
      console.error('Failed to fetch quick cluster status', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchQuickStatus();
    // Poll every 8 seconds for real-time cluster monitoring
    const interval = setInterval(fetchQuickStatus, 8000);
    return () => clearInterval(interval);
  }, []);

  const totalNodes = clusterInfo?.nodes.total ?? 4;
  const healthyNodes = clusterInfo?.nodes.healthy ?? 4;
  const failedNodes = clusterInfo?.nodes.failed ?? 0;
  const isAllHealthy = failedNodes === 0 && healthyNodes > 0;

  return (
    <div className="admin-app-container">
      {/* Admin Top Navigation Bar */}
      <header className="admin-top-navbar">
        <div className="admin-nav-left">
          <Link to="/admin" className="admin-brand-link">
            <div className="admin-brand-icon">
              <IconCloud size={24} />
            </div>
            <div className="admin-brand-text">
              <span className="admin-brand-title">DFS Control Plane</span>
              <span className="admin-brand-badge">Cluster Operations & Examiner Demo</span>
            </div>
          </Link>
        </div>

        <div className="admin-nav-center">
          <div className={`admin-cluster-status-pill ${isAllHealthy ? 'healthy' : 'degraded'}`}>
            <span className={`status-indicator-dot ${isAllHealthy ? 'green' : 'red'}`} />
            <span>
              Cluster: {isAllHealthy ? 'All Nodes Healthy' : `${failedNodes} Node(s) Failed / Degraded`}
            </span>
            <span className="node-count-tag">
              ({healthyNodes}/{totalNodes} Online)
            </span>
          </div>
        </div>

        <div className="admin-nav-right">
          <button
            className={`admin-refresh-btn ${isRefreshing ? 'spinning' : ''}`}
            onClick={fetchQuickStatus}
            title="Refresh Cluster State"
          >
            <IconRefresh size={16} />
            <span>Refresh</span>
          </button>

          <Link to="/dashboard" className="admin-exit-btn">
            <IconArrowLeft size={16} />
            <span>Switch to User Drive</span>
          </Link>
        </div>
      </header>

      <div className="admin-main-wrapper">
        {/* Admin Navigation Sidebar */}
        <aside className="admin-sidebar">
          <div className="admin-sidebar-section-title">CLUSTER MONITOR</div>
          <nav className="admin-nav-menu">
            <NavLink
              to="/admin"
              end
              className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}
            >
              <IconDatabase size={18} />
              <span>Overview</span>
            </NavLink>

            <NavLink
              to="/admin/nodes"
              className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}
            >
              <IconServer size={18} />
              <span>Storage Nodes</span>
              {failedNodes > 0 && <span className="admin-pill-badge danger">{failedNodes}</span>}
            </NavLink>

            <NavLink
              to="/admin/replication"
              className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}
            >
              <IconEye size={18} />
              <span>Replication Tree</span>
            </NavLink>

            <NavLink
              to="/admin/recovery"
              className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}
            >
              <IconShieldCheck size={18} />
              <span>Replica Recovery</span>
            </NavLink>

            <NavLink
              to="/admin/logs"
              className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}
            >
              <span className="admin-terminal-icon">&gt;_</span>
              <span>System Logs</span>
            </NavLink>
          </nav>

          <div className="admin-sidebar-footer">
            <div className="admin-examiner-card">
              <div className="examiner-card-header">
                <IconCheckCircle size={16} />
                <span>Examiner Demo Mode</span>
              </div>
              <p>Simulate node crashes in Storage Nodes to observe self-healing and replica recovery.</p>
            </div>
          </div>
        </aside>

        {/* Dynamic Admin Page View */}
        <main className="admin-content-area">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
