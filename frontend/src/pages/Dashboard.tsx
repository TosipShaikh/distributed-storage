import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { filesApi } from '../api/files';
import type { FileItem } from '../types';
import Navbar from '../components/Navbar';
import Sidebar from '../components/Sidebar';
import FileStatusBadge from '../components/FileStatusBadge';
import FileUploadModal from '../components/FileUploadModal';
import ConfirmModal from '../components/ConfirmModal';
import LoadingSpinner from '../components/LoadingSpinner';
import {
  IconFile,
  IconDownload,
  IconTrash,
  IconEye,
  IconRefresh,
  IconCloud,
  IconPlus,
} from '../components/Icons';

const Dashboard: React.FC = () => {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<FileItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const navigate = useNavigate();

  const fetchFiles = async (isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);
      setError(null);
      const data = await filesApi.getFiles();
      setFiles(data.files || []);
    } catch (err: any) {
      if (!isSilent) {
        setError(err.response?.data?.message || err.message || 'Failed to load files from server');
      }
    } finally {
      if (!isSilent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
    // Auto-refresh periodically to reflect live status transitions
    const interval = setInterval(() => {
      fetchFiles(true);
    }, 12000);
    return () => clearInterval(interval);
  }, []);

  const totalStorageUsed = useMemo(() => {
    return files.reduce((acc, file) => acc + (file.size || 0), 0);
  }, [files]);

  const filteredFiles = useMemo(() => {
    if (!searchQuery.trim()) return files;
    const q = searchQuery.toLowerCase();
    return files.filter((f) => f.filename.toLowerCase().includes(q));
  }, [files, searchQuery]);

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

  const handleDownload = async (file: FileItem) => {
    try {
      setDownloadingId(file.id);
      await filesApi.downloadFile(file.id, file.filename);
      setActionNotice(`Downloaded ${file.filename}`);
      setTimeout(() => setActionNotice(null), 3000);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'File download failed');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!fileToDelete) return;
    try {
      setIsDeleting(true);
      await filesApi.deleteFile(fileToDelete.id);
      setFiles((prev) => prev.filter((f) => f.id !== fileToDelete.id));
      setActionNotice(`Deleted ${fileToDelete.filename}`);
      setTimeout(() => setActionNotice(null), 3000);
      setFileToDelete(null);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to delete file');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="dashboard-layout">
      <Navbar searchQuery={searchQuery} onSearchChange={setSearchQuery} />

      <div className="dashboard-body">
        <Sidebar
          onOpenUpload={() => setIsUploadOpen(true)}
          totalStorageUsed={totalStorageUsed}
        />

        <main className="dashboard-content">
          <div className="content-toolbar">
            <div className="toolbar-left">
              <h2>My Files</h2>
              <span className="file-count-badge">
                {filteredFiles.length} {filteredFiles.length === 1 ? 'file' : 'files'}
              </span>
            </div>

            <div className="toolbar-right">
              <button
                className="btn outline icon-btn-text"
                onClick={() => fetchFiles(false)}
                title="Refresh File List"
                id="refresh-files-btn"
              >
                <IconRefresh size={16} />
                <span>Refresh</span>
              </button>

              <button
                className="btn primary icon-btn-text mobile-upload-btn"
                onClick={() => setIsUploadOpen(true)}
              >
                <IconPlus size={16} />
                <span>Upload</span>
              </button>
            </div>
          </div>

          {actionNotice && (
            <div className="alert-banner success action-toast">
              <span>{actionNotice}</span>
            </div>
          )}

          {error && (
            <div className="alert-banner error">
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="content-loading">
              <LoadingSpinner message="Loading your drive files..." />
            </div>
          ) : filteredFiles.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon-wrap">
                <IconCloud size={56} />
              </div>
              <h3>
                {searchQuery ? `No files match "${searchQuery}"` : 'Your drive is empty'}
              </h3>
              <p>
                {searchQuery
                  ? 'Try checking for typos or searching for a different keyword.'
                  : 'Upload files to start storing them securely across our resilient distributed cluster.'}
              </p>
              {!searchQuery && (
                <button
                  className="btn primary"
                  onClick={() => setIsUploadOpen(true)}
                  id="empty-upload-btn"
                >
                  <IconPlus size={18} />
                  <span>Upload Your First File</span>
                </button>
              )}
            </div>
          ) : (
            <div className="table-responsive-card">
              <table className="files-table" id="files-table">
                <thead>
                  <tr>
                    <th className="col-name">File Name</th>
                    <th className="col-status">Status</th>
                    <th className="col-size">Size</th>
                    <th className="col-date">Uploaded</th>
                    <th className="col-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFiles.map((file) => (
                    <tr
                      key={file.id}
                      className="file-row"
                      onClick={() => navigate(`/files/${file.id}`)}
                    >
                      <td className="col-name">
                        <div className="filename-cell">
                          <div className="file-type-icon">
                            <IconFile size={20} />
                          </div>
                          <span className="file-title-text" title={file.filename}>
                            {file.filename}
                          </span>
                        </div>
                      </td>
                      <td className="col-status">
                        <FileStatusBadge
                          status={file.health_status || file.status}
                          size="sm"
                        />
                      </td>
                      <td className="col-size">{formatFileSize(file.size)}</td>
                      <td className="col-date">{formatDate(file.created_at)}</td>
                      <td className="col-actions" onClick={(e) => e.stopPropagation()}>
                        <div className="row-action-buttons">
                          <button
                            className="icon-action-btn view"
                            onClick={() => navigate(`/files/${file.id}`)}
                            title="View File Details"
                          >
                            <IconEye size={17} />
                          </button>

                          <button
                            className="icon-action-btn download"
                            onClick={() => handleDownload(file)}
                            disabled={downloadingId === file.id}
                            title="Download File"
                          >
                            {downloadingId === file.id ? (
                              <span className="mini-spinner" />
                            ) : (
                              <IconDownload size={17} />
                            )}
                          </button>

                          <button
                            className="icon-action-btn delete"
                            onClick={() => setFileToDelete(file)}
                            title="Delete File"
                          >
                            <IconTrash size={17} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>

      <FileUploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUploadSuccess={() => fetchFiles(false)}
      />

      <ConfirmModal
        isOpen={!!fileToDelete}
        title="Delete File"
        message={`Are you sure you want to permanently delete "${fileToDelete?.filename}"? This will delete all stored chunks and replicas.`}
        confirmLabel={isDeleting ? 'Deleting...' : 'Delete Permanently'}
        isDanger={true}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setFileToDelete(null)}
      />
    </div>
  );
};

export default Dashboard;
