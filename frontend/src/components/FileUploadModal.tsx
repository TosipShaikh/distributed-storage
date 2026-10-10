import React, { useState, useRef } from 'react';
import { filesApi } from '../api/files';
import { IconUpload, IconFile, IconX, IconAlertTriangle } from './Icons';

interface FileUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess: () => void;
}

const FileUploadModal: React.FC<FileUploadModalProps> = ({ isOpen, onClose, onUploadSuccess }) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setSelectedFile(e.dataTransfer.files[0]);
      setError(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
      setError(null);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    try {
      setIsUploading(true);
      setError(null);
      setUploadProgress(0);

      await filesApi.uploadFile(selectedFile, (percent) => {
        setUploadProgress(percent);
      });

      // Brief delay to allow completion feedback
      setTimeout(() => {
        setIsUploading(false);
        setSelectedFile(null);
        setUploadProgress(null);
        onUploadSuccess();
        onClose();
      }, 500);
    } catch (err: any) {
      setIsUploading(false);
      setUploadProgress(null);
      const message = err.response?.data?.message || err.message || 'File upload failed';
      setError(message);
    }
  };

  const handleClose = () => {
    if (isUploading) return;
    setSelectedFile(null);
    setError(null);
    setUploadProgress(null);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={handleClose}>
      <div className="modal-card upload-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-wrap">
            <div className="modal-icon-badge primary">
              <IconUpload size={20} />
            </div>
            <h3>Upload New File</h3>
          </div>
          <button
            className="icon-btn close-btn"
            onClick={handleClose}
            disabled={isUploading}
            title="Close"
          >
            <IconX size={18} />
          </button>
        </div>

        {error && (
          <div className="alert-banner error">
            <IconAlertTriangle size={18} />
            <span>{error}</span>
          </div>
        )}

        {!selectedFile ? (
          <div
            className={`dropzone ${isDragging ? 'dragging' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              style={{ display: 'none' }}
              id="file-input-modal"
            />
            <div className="dropzone-icon">
              <IconUpload size={48} />
            </div>
            <h4>Drag & Drop your file here</h4>
            <p className="dropzone-sub">or click to browse from your computer</p>
            <span className="dropzone-hint">
              Supports documents, media, code archives (any file size)
            </span>
          </div>
        ) : (
          <div className="selected-file-card">
            <div className="file-info-header">
              <div className="file-icon-box">
                <IconFile size={28} />
              </div>
              <div className="file-info-details">
                <span className="filename-text" title={selectedFile.name}>
                  {selectedFile.name}
                </span>
                <span className="filesize-text">{formatFileSize(selectedFile.size)}</span>
              </div>
              {!isUploading && (
                <button
                  className="icon-btn remove-file-btn"
                  onClick={() => setSelectedFile(null)}
                  title="Remove file"
                >
                  <IconX size={16} />
                </button>
              )}
            </div>

            {isUploading && uploadProgress !== null && (
              <div className="progress-section">
                <div className="progress-labels">
                  <span>Uploading & Chunking...</span>
                  <span className="progress-percent">{uploadProgress}%</span>
                </div>
                <div className="progress-bar-track">
                  <div
                    className="progress-bar-fill"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <p className="progress-note">
                  Streaming chunks across distributed storage nodes with SHA-256 verification
                </p>
              </div>
            )}
          </div>
        )}

        <div className="modal-actions">
          <button className="btn secondary" onClick={handleClose} disabled={isUploading}>
            Cancel
          </button>
          <button
            className="btn primary"
            onClick={handleUpload}
            disabled={!selectedFile || isUploading}
            id="start-upload-btn"
          >
            {isUploading ? (
              <>
                <span className="btn-spinner" />
                <span>Uploading ({uploadProgress || 0}%)</span>
              </>
            ) : (
              <>
                <IconUpload size={18} />
                <span>Start Upload</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FileUploadModal;
