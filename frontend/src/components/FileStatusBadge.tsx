import React from 'react';
import type { FileHealthStatus } from '../types';
import { IconCheckCircle, IconAlertTriangle } from './Icons';

interface FileStatusBadgeProps {
  status?: FileHealthStatus | string;
  size?: 'sm' | 'md';
}

const FileStatusBadge: React.FC<FileStatusBadgeProps> = ({ status = 'HEALTHY', size = 'md' }) => {
  const normalized = String(status).toUpperCase();

  if (normalized === 'HEALTHY' || normalized === 'COMPLETE') {
    return (
      <span className={`status-badge healthy ${size}`} title="All replicas active & verified">
        <IconCheckCircle size={size === 'sm' ? 13 : 15} />
        <span>HEALTHY</span>
      </span>
    );
  }

  if (normalized === 'RECOVERING' || normalized === 'UPLOADING') {
    return (
      <span className={`status-badge recovering ${size}`} title="Replica replacement or upload in progress">
        <span className="pulsing-dot" />
        <span>RECOVERING</span>
      </span>
    );
  }

  // Fallback to DEGRADED
  return (
    <span className={`status-badge degraded ${size}`} title="Replica count below redundancy threshold">
      <IconAlertTriangle size={size === 'sm' ? 13 : 15} />
      <span>DEGRADED</span>
    </span>
  );
};

export default FileStatusBadge;
