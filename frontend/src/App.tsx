import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import PublicRoute from './components/PublicRoute';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import FileDetails from './pages/FileDetails';
import AdminLayout from './components/admin/AdminLayout';
import AdminOverview from './pages/admin/AdminOverview';
import AdminNodes from './pages/admin/AdminNodes';
import AdminReplication from './pages/admin/AdminReplication';
import AdminRecovery from './pages/admin/AdminRecovery';
import AdminLogs from './pages/admin/AdminLogs';
import './App.css';
import './Admin.css';

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public guest routes (redirect to dashboard if already logged in) */}
          <Route element={<PublicRoute />}>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
          </Route>

          {/* Protected user authenticated routes */}
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/files/:id" element={<FileDetails />} />
          </Route>

          {/* Dedicated Admin Cluster Dashboard Routes */}
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminOverview />} />
            <Route path="nodes" element={<AdminNodes />} />
            <Route path="replication" element={<AdminReplication />} />
            <Route path="recovery" element={<AdminRecovery />} />
            <Route path="logs" element={<AdminLogs />} />
          </Route>

          {/* Fallback redirect */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
