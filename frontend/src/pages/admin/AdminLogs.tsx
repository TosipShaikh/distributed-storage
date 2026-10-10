import React, { useState, useEffect } from 'react';
import { adminApi, type LogItem } from '../../api/admin';
import LoadingSpinner from '../../components/LoadingSpinner';
import { IconRefresh } from '../../components/Icons';

const AdminLogs: React.FC = () => {
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterLevel, setFilterLevel] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchLogs = async () => {
    try {
      const res = await adminApi.getLogs();
      setLogs(res.logs);
    } catch (err) {
      console.error('Failed to fetch system logs', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    if (!autoRefresh) return;
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  if (isLoading && logs.length === 0) {
    return <LoadingSpinner message="Streaming distributed cluster logs..." />;
  }

  const filteredLogs = logs.filter((log) => {
    const matchesLevel = filterLevel === 'ALL' || log.level === filterLevel;
    const matchesSearch =
      searchTerm.trim() === '' ||
      log.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.component.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesLevel && matchesSearch;
  });

  return (
    <div className="admin-page-container">
      <div className="admin-page-header">
        <div>
          <h2>System Telemetry & Operational Logs</h2>
          <p className="admin-page-subtitle">
            Consolidated event stream across heartbeat monitor, chunk distribution, and recovery coordinator
          </p>
        </div>
        <div className="admin-header-actions">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`btn-secondary ${autoRefresh ? 'active-pulse' : ''}`}
          >
            <span>Auto-Stream: {autoRefresh ? 'ON (5s)' : 'PAUSED'}</span>
          </button>
          <button onClick={fetchLogs} className="btn-secondary">
            <IconRefresh size={16} />
            <span>Fetch Latest</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="logs-filter-toolbar">
        <div className="filter-level-buttons">
          {['ALL', 'INFO', 'SUCCESS', 'WARN', 'ERROR'].map((lvl) => (
            <button
              key={lvl}
              onClick={() => setFilterLevel(lvl)}
              className={`filter-btn ${filterLevel === lvl ? 'active' : ''} ${lvl.toLowerCase()}`}
            >
              {lvl}
            </button>
          ))}
        </div>

        <div className="logs-search-wrapper">
          <input
            type="text"
            placeholder="Search log messages or component..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="logs-search-input"
          />
        </div>
      </div>

      {/* Terminal Viewport */}
      <div className="terminal-container">
        <div className="terminal-topbar">
          <div className="terminal-dots">
            <span className="dot red" />
            <span className="dot yellow" />
            <span className="dot green" />
          </div>
          <span className="terminal-title">dfs-cluster-daemon.log &mdash; {filteredLogs.length} events matching</span>
          <span className="terminal-tail-tag">TAIL -F LIVE</span>
        </div>

        <div className="terminal-body">
          {filteredLogs.length === 0 ? (
            <div className="terminal-empty">No log records matched the current query.</div>
          ) : (
            filteredLogs.map((log) => (
              <div key={log.id} className={`terminal-log-line ${log.level.toLowerCase()}`}>
                <span className="log-time">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                <span className={`log-level-tag ${log.level.toLowerCase()}`}>[{log.level}]</span>
                <span className="log-component">&lt;{log.component}&gt;</span>
                <span className="log-text">{log.message}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminLogs;
