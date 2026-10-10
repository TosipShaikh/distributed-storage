import React from 'react';
import { NavLink } from 'react-router-dom';
import { IconPlus, IconFile, IconShieldCheck, IconHardDrive } from './Icons';

interface SidebarProps {
  onOpenUpload: () => void;
  totalStorageUsed?: number;
}

const Sidebar: React.FC<SidebarProps> = ({ onOpenUpload, totalStorageUsed = 0 }) => {
  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '0 MB';
    const mb = bytes / (1024 * 1024);
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    return `${(mb / 1024).toFixed(2)} GB`;
  };

  return (
    <aside className="app-sidebar">
      <div className="sidebar-upload-wrap">
        <button
          className="btn upload-cta-btn"
          onClick={onOpenUpload}
          id="sidebar-upload-btn"
        >
          <IconPlus size={20} />
          <span>New Upload</span>
        </button>
      </div>

      <nav className="sidebar-nav">
        <NavLink
          to="/dashboard"
          className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
        >
          <IconFile size={18} />
          <span>My Files</span>
        </NavLink>

        <NavLink
          to="/admin"
          className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
        >
          <IconShieldCheck size={18} />
          <span>Admin Cluster</span>
        </NavLink>
      </nav>

      <div className="sidebar-storage-card">
        <div className="storage-card-header">
          <IconHardDrive size={18} />
          <span>Storage</span>
        </div>
        <div className="storage-meter-track">
          <div
            className="storage-meter-fill"
            style={{ width: `${Math.min(100, Math.max(3, (totalStorageUsed / (1024 * 1024 * 1024 * 5)) * 100))}%` }}
          />
        </div>
        <p className="storage-text">
          <strong>{formatSize(totalStorageUsed)}</strong> of 5 GB used
        </p>

        <div className="redundancy-pill">
          <IconShieldCheck size={14} />
          <span>Dual Replication Active</span>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
