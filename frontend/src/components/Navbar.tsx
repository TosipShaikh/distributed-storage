import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { IconCloud, IconSearch, IconLogOut } from './Icons';

interface NavbarProps {
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
}

const Navbar: React.FC<NavbarProps> = ({ searchQuery = '', onSearchChange }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const getInitials = (name?: string): string => {
    if (!name) return 'U';
    return name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  return (
    <header className="app-navbar">
      <div className="navbar-brand">
        <Link to="/dashboard" className="brand-link">
          <div className="brand-logo-badge">
            <IconCloud size={24} />
          </div>
          <div className="brand-text">
            <span className="brand-name">DFS Drive</span>
            <span className="brand-tag">Cloud Storage</span>
          </div>
        </Link>
      </div>

      <div className="navbar-search">
        {onSearchChange && (
          <div className="search-input-wrapper">
            <IconSearch size={18} className="search-icon" />
            <input
              type="text"
              placeholder="Search files in drive..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="search-input"
              id="file-search-input"
            />
            {searchQuery && (
              <button
                className="clear-search-btn"
                onClick={() => onSearchChange('')}
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>
        )}
      </div>

      <div className="navbar-user-actions">
        {user && (
          <div className="user-profile-pill">
            <div className="user-avatar" title={user.name}>
              {getInitials(user.name)}
            </div>
            <div className="user-details-mini">
              <span className="user-name-text">{user.name}</span>
              <span className="user-email-text">{user.email}</span>
            </div>
          </div>
        )}

        <button className="btn outline logout-btn" onClick={handleLogout} title="Log Out" id="logout-btn">
          <IconLogOut size={16} />
          <span>Sign Out</span>
        </button>
      </div>
    </header>
  );
};

export default Navbar;
