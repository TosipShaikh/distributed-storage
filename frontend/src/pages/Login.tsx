import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { IconCloud, IconAlertTriangle } from '../components/Icons';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please fill in both email and password.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await login(email.trim(), password);
      navigate('/dashboard');
    } catch (err: any) {
      setIsSubmitting(false);
      const message =
        err.response?.data?.message || err.message || 'Login failed. Please check your credentials.';
      setError(message);
    }
  };

  const fillDemoAccount = () => {
    setEmail('alice@example.com');
    setPassword('password123');
    setError(null);
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo-badge">
            <IconCloud size={32} />
          </div>
          <h1>Sign in to DFS Drive</h1>
          <p className="auth-subtitle">Secure, resilient distributed cloud storage</p>
        </div>

        {error && (
          <div className="alert-banner error" id="login-error-alert">
            <IconAlertTriangle size={18} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form" id="login-form">
          <div className="form-group">
            <label htmlFor="login-email">Email Address</label>
            <input
              id="login-email"
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              disabled={isSubmitting}
            />
          </div>

          <div className="form-group">
            <div className="label-with-hint">
              <label htmlFor="login-password">Password</label>
            </div>
            <input
              id="login-password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              disabled={isSubmitting}
            />
          </div>

          <button
            type="submit"
            className="btn primary btn-block"
            disabled={isSubmitting}
            id="login-submit-btn"
          >
            {isSubmitting ? (
              <>
                <span className="btn-spinner" />
                <span>Signing In...</span>
              </>
            ) : (
              <span>Sign In</span>
            )}
          </button>

          <button
            type="button"
            className="btn ghost btn-block quick-demo-btn"
            onClick={fillDemoAccount}
            title="Auto-fill test demo credentials"
          >
            Fill Demo Credentials
          </button>
        </form>

        <div className="auth-footer">
          <p>
            Don't have an account?{' '}
            <Link to="/register" className="auth-link">
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
