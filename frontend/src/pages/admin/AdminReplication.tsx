import React, { useState, useEffect } from 'react';
import { adminApi, type ReplicationResponse } from '../../api/admin';
import LoadingSpinner from '../../components/LoadingSpinner';
import {
  IconFile,
  IconDatabase,
  IconServer,
  IconShieldCheck,
  IconAlertTriangle,
  IconCheckCircle,
  IconRefresh,
} from '../../components/Icons';

const formatBytes = (bytes: number): string => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
};

const AdminReplication: React.FC = () => {
  const [data, setData] = useState<ReplicationResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedFileId, setSelectedFileId] = useState<number | null>(null);
  const [searchFilter, setSearchFilter] = useState('');

  const fetchReplication = async () => {
    try {
      const res = await adminApi.getReplication();
      setData(res);
      if (res.files.length > 0 && selectedFileId === null) {
        setSelectedFileId(res.files[0].id);
      }
    } catch (err) {
      console.error('Failed to load replication tree', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReplication();
    const interval = setInterval(fetchReplication, 6000);
    return () => clearInterval(interval);
  }, []);

  if (isLoading && !data) {
    return <LoadingSpinner message="Constructing distributed replication tree..." />;
  }

  const files = data?.files || [];
  const filteredFiles = files.filter((f) =>
    f.filename.toLowerCase().includes(searchFilter.toLowerCase())
  );

  const activeFile = files.find((f) => f.id === selectedFileId) || files[0] || null;

  return (
    <div className="admin-page-container">
      <div className="admin-page-header">
        <div>
          <h2>Distributed File Replication & Chunk Topology</h2>
          <p className="admin-page-subtitle">
            Visual hierarchy of file chunking and multi-node replica placement for examiner demonstration
          </p>
        </div>
        <div className="admin-header-actions">
          <button onClick={fetchReplication} className="btn-secondary">
            <IconRefresh size={16} />
            <span>Refresh Tree</span>
          </button>
        </div>
      </div>

      {/* Replication Policy Banner */}
      <div className="replication-policy-banner">
        <div className="policy-info">
          <IconShieldCheck size={24} />
          <div>
            <strong>Replication Policy: $R = {data?.replicationFactor || 2}$ Active Replicas per Chunk</strong>
            <p>Every sequential 10 MB chunk is placed on 2 distinct nodes with anti-colocation and cryptographic verification.</p>
          </div>
        </div>
        <div className="policy-stats">
          <div className="p-stat">
            <span>Indexed Files:</span>
            <strong>{data?.fileCount || 0}</strong>
          </div>
          <div className="p-stat">
            <span>Replication Factor:</span>
            <strong>{data?.replicationFactor || 2}x Redundancy</strong>
          </div>
        </div>
      </div>

      {files.length === 0 ? (
        <div className="empty-files-placeholder">
          <IconDatabase size={48} />
          <h3>No Files Stored in Cluster Yet</h3>
          <p>Upload a file from the user drive to observe the replication tree and chunk distribution.</p>
        </div>
      ) : (
        <div className="replication-split-view">
          {/* Left Column: File Selector List */}
          <div className="file-selector-sidebar">
            <div className="file-search-box">
              <input
                type="text"
                placeholder="Filter files..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="search-input-field"
              />
            </div>

            <div className="file-selector-items">
              {filteredFiles.map((file) => {
                const isSelected = activeFile?.id === file.id;
                return (
                  <button
                    key={file.id}
                    onClick={() => setSelectedFileId(file.id)}
                    className={`file-item-button ${isSelected ? 'active' : ''}`}
                  >
                    <div className="file-item-icon">
                      <IconFile size={18} />
                    </div>
                    <div className="file-item-info">
                      <span className="file-item-name" title={file.filename}>
                        {file.filename}
                      </span>
                      <span className="file-item-sub">
                        {formatBytes(file.size)} &bull; {file.chunks.length} chunks
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Column: Replication Tree Visualization */}
          <div className="replication-tree-canvas">
            {activeFile ? (
              <div className="tree-container">
                {/* 1. Root File Node */}
                <div className="tree-root-card">
                  <div className="root-badge">
                    <IconFile size={28} />
                  </div>
                  <div className="root-meta">
                    <div className="root-title-row">
                      <h3>{activeFile.filename}</h3>
                      <span className={`file-status-tag ${activeFile.status}`}>
                        {activeFile.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="root-specs-row">
                      <span>Total File Size: <strong>{formatBytes(activeFile.size)}</strong></span>
                      <span>Constituent Chunks: <strong>{activeFile.chunks.length}</strong></span>
                      <span>Uploaded: <strong>{new Date(activeFile.createdAt).toLocaleString()}</strong></span>
                    </div>
                  </div>
                </div>

                <div className="tree-stem-arrow">
                  <div className="arrow-line" />
                  <span className="arrow-head">&darr; Split into Sequential Chunks</span>
                </div>

                {/* 2. Chunks & Replicas Branches */}
                <div className="chunks-branch-list">
                  {activeFile.chunks.map((chunk) => {
                    const hasTargetReplicas = chunk.replicas.length >= (data?.replicationFactor || 2);

                    return (
                      <div key={chunk.id} className="chunk-branch-node">
                        {/* Chunk Card Header */}
                        <div className="chunk-card-header">
                          <div className="chunk-info-left">
                            <span className="chunk-seq-pill">Chunk #{chunk.sequenceNumber + 1}</span>
                            <span className="chunk-size-tag">{formatBytes(chunk.size)}</span>
                            <span className="chunk-hash-pill" title={chunk.hash}>
                              SHA-256: {chunk.hash.slice(0, 12)}...
                            </span>
                          </div>

                          <div className="chunk-status-right">
                            {hasTargetReplicas ? (
                              <span className="redundancy-pill optimal">
                                <IconCheckCircle size={14} />
                                <span>{chunk.replicas.length} Active Replicas</span>
                              </span>
                            ) : (
                              <span className="redundancy-pill degraded">
                                <IconAlertTriangle size={14} />
                                <span>{chunk.replicas.length}/{(data?.replicationFactor || 2)} Replicas (Degraded)</span>
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Replicas Tree Branches */}
                        <div className="replicas-tree-branches">
                          {chunk.replicas.map((rep, rIndex) => {
                            const isBranchEnd = rIndex === chunk.replicas.length - 1;
                            const isNodeHealthy = rep.node.status === 'HEALTHY' || rep.node.status === 'online';

                            return (
                              <div key={rep.id} className="replica-branch-row">
                                <span className="branch-symbol">
                                  {isBranchEnd ? '└──' : '├──'}
                                </span>

                                <div className={`replica-node-box ${isNodeHealthy ? 'node-healthy' : 'node-failed'}`}>
                                  <div className="rep-icon">
                                    <IconServer size={18} />
                                  </div>
                                  <div className="rep-details">
                                    <div className="rep-title">
                                      <strong>{rep.node.nodeId}</strong>
                                      <span className="rep-url">({rep.node.host}:{rep.node.port})</span>
                                    </div>
                                    <div className="rep-badges">
                                      <span className={`rep-status-badge ${rep.status}`}>
                                        Replica: {rep.status.toUpperCase()}
                                      </span>
                                      <span className={`node-health-tag ${isNodeHealthy ? 'healthy' : 'failed'}`}>
                                        {isNodeHealthy ? '🟢 Node Healthy' : '🔴 Node Failed'}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="select-file-prompt">Select a file from the left to visualize its replication graph.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminReplication;
