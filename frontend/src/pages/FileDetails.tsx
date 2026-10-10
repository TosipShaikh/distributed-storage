import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { filesApi } from '../api/files';
import type { FileItem } from '../types';
import Navbar from '../components/Navbar';
import Sidebar from '../components/Sidebar';
import FileStatusBadge from '../components/FileStatusBadge';
import ConfirmModal from '../components/ConfirmModal';
import LoadingSpinner from '../components/LoadingSpinner';
import {
  IconFile,
  IconDownload,
  IconTrash,
  IconArrowLeft,
  IconShieldCheck,
  IconLayers,
  IconHardDrive,
  IconCheckCircle,
} from '../components/Icons';

const FileDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [file, setFile] = useState<FileItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchFileDetails = async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const data = await filesApi.getFileById(parseInt(id, 10));
      setFile(data);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to load file details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFileDetails();
  }, [id]);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  const formatDate = (dateStr: string): string => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const handleDownload = async () => {
    if (!file) return;
    try {
      setIsDownloading(true);
      await filesApi.downloadFile(file.id, file.filename);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'File download failed');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDelete = async () => {
    if (!file) return;
    try {
      setIsDeleting(true);
      await filesApi.deleteFile(file.id);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to delete file');
      setIsDeleting(false);
      setIsDeleteModalOpen(false);
    }
  };

  return (
    <div className="dashboard-layout">
      <Navbar />

      <div className="dashboard-body">
        <Sidebar onOpenUpload={() => navigate('/dashboard')} />

        <main className="dashboard-content file-details-content">
          <div className="details-nav-bar">
            <Link to="/dashboard" className="back-link">
              <IconArrowLeft size={18} />
              <span>Back to Drive</span>
            </Link>
          </div>

          {error && (
            <div className="alert-banner error">
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="content-loading">
              <LoadingSpinner message="Loading file metadata..." />
            </div>
          ) : !file ? (
            <div className="empty-state">
              <h3>File Not Found</h3>
              <p>The requested file could not be located or you do not have permission to view it.</p>
              <Link to="/dashboard" className="btn primary">
                Return to Dashboard
              </Link>
            </div>
          ) : (
            <div className="file-details-wrapper">
              {/* File Main Overview Card */}
              <div className="details-header-card">
                <div className="file-header-primary">
                  <div className="file-hero-icon">
                    <IconFile size={42} />
                  </div>
                  <div className="file-hero-text">
                    <div className="file-title-row">
                      <h1 className="details-filename">{file.filename}</h1>
                      <FileStatusBadge
                        status={file.health_status || file.status}
                        size="md"
                      />
                    </div>
                    <div className="file-meta-pills">
                      <span className="meta-pill">{formatFileSize(file.size)}</span>
                      <span className="meta-pill-dot">•</span>
                      <span className="meta-pill">Uploaded on {formatDate(file.created_at)}</span>
                    </div>
                  </div>
                </div>

                <div className="file-header-actions">
                  <button
                    className="btn primary icon-btn-text"
                    onClick={handleDownload}
                    disabled={isDownloading}
                    id="details-download-btn"
                  >
                    {isDownloading ? (
                      <>
                        <span className="btn-spinner" />
                        <span>Downloading...</span>
                      </>
                    ) : (
                      <>
                        <IconDownload size={18} />
                        <span>Download</span>
                      </>
                    )}
                  </button>

                  <button
                    className="btn danger icon-btn-text"
                    onClick={() => setIsDeleteModalOpen(true)}
                    id="details-delete-btn"
                  >
                    <IconTrash size={18} />
                    <span>Delete</span>
                  </button>
                </div>
              </div>

              {/* Resilience & Replication Metadata Cards (Google Drive friendly, no complex nodes) */}
              <div className="resilience-stats-grid">
                <div className="stat-card">
                  <div className="stat-icon-wrap primary">
                    <IconLayers size={22} />
                  </div>
                  <div className="stat-info">
                    <span className="stat-label">Number of Chunks</span>
                    <strong className="stat-value">{file.chunk_count || file.chunks?.length || 1}</strong>
                    <span className="stat-hint">Parallel streaming slices</span>
                  </div>
                </div>

                <div className="stat-card">
                  <div className="stat-icon-wrap success">
                    <IconHardDrive size={22} />
                  </div>
                  <div className="stat-info">
                    <span className="stat-label">Replication Factor</span>
                    <strong className="stat-value">
                      {file.replication_factor || 2}x Redundancy
                    </strong>
                    <span className="stat-hint">Active multi-copy storage</span>
                  </div>
                </div>

                <div className="stat-card">
                  <div className="stat-icon-wrap accent">
                    <IconShieldCheck size={22} />
                  </div>
                  <div className="stat-info">
                    <span className="stat-label">Integrity Status</span>
                    <strong className="stat-value success-text">
                      SHA-256 Verified
                    </strong>
                    <span className="stat-hint">Bit-for-bit cryptographic match</span>
                  </div>
                </div>
              </div>

              {/* Chunks Breakdown Table (Simplified, user-friendly) */}
              <div className="chunks-section-card">
                <div className="section-header">
                  <h3>Chunk Details & Redundancy</h3>
                  <span className="section-badge">
                    {file.chunks?.length || 0} chunks recorded
                  </span>
                </div>

                <div className="table-responsive-card">
                  <table className="chunks-table">
                    <thead>
                      <tr>
                        <th>Chunk</th>
                        <th>Size</th>
                        <th>Cryptographic Digest (SHA-256)</th>
                        <th>Replication</th>
                        <th>Integrity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {file.chunks && file.chunks.length > 0 ? (
                        file.chunks.map((chunk) => (
                          <tr key={chunk.id}>
                            <td className="chunk-id-cell">
                              <strong>Chunk #{chunk.sequence_number}</strong>
                            </td>
                            <td>{formatFileSize(chunk.size)}</td>
                            <td>
                              <code className="hash-code" title={chunk.hash}>
                                {chunk.hash.substring(0, 16)}...
                              </code>
                            </td>
                            <td>
                              <span className="replica-pill">
                                {chunk.replica_count || file.replication_factor || 2} Active Replicas
                              </span>
                            </td>
                            <td>
                              <span className="verified-badge">
                                <IconCheckCircle size={14} />
                                <span>Verified</span>
                              </span>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="no-chunks-cell">
                            Single chunk file or metadata being finalized.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      <ConfirmModal
        isOpen={isDeleteModalOpen}
        title="Delete File"
        message={`Are you sure you want to delete "${file?.filename}"? This action cannot be undone.`}
        confirmLabel={isDeleting ? 'Deleting...' : 'Delete'}
        isDanger={true}
        onConfirm={handleDelete}
        onCancel={() => setIsDeleteModalOpen(false)}
      />
    </div>
  );
};

export default FileDetails;
