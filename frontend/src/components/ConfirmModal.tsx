import React from 'react';
import { IconAlertTriangle, IconX } from './Icons';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDanger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  isDanger = true,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-wrap">
            {isDanger && (
              <div className="modal-icon-badge danger">
                <IconAlertTriangle size={20} />
              </div>
            )}
            <h3>{title}</h3>
          </div>
          <button className="icon-btn close-btn" onClick={onCancel} title="Close">
            <IconX size={18} />
          </button>
        </div>

        <p className="modal-body-text">{message}</p>

        <div className="modal-actions">
          <button className="btn secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className={`btn ${isDanger ? 'danger' : 'primary'}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
