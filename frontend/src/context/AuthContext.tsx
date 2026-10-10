import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { User } from '../types';
import { authApi } from '../api/auth';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    const savedUser = localStorage.getItem('dfs_user');
    return savedUser ? JSON.parse(savedUser) : null;
  });
  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem('dfs_token');
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Validate session on load
  useEffect(() => {
    const verifyAuth = async () => {
      const storedToken = localStorage.getItem('dfs_token');
      if (!storedToken) {
        setIsLoading(false);
        return;
      }

      try {
        const { user: verifiedUser } = await authApi.getMe();
        setUser(verifiedUser);
        localStorage.setItem('dfs_user', JSON.stringify(verifiedUser));
      } catch (err) {
        console.warn('[Auth] Session expired or invalid:', err);
        localStorage.removeItem('dfs_token');
        localStorage.removeItem('dfs_user');
        setUser(null);
        setToken(null);
      } finally {
        setIsLoading(false);
      }
    };

    verifyAuth();
  }, []);

  const login = async (email: string, password: string): Promise<void> => {
    const data = await authApi.login(email, password);
    setToken(data.token);
    setUser(data.user);
    localStorage.setItem('dfs_token', data.token);
    localStorage.setItem('dfs_user', JSON.stringify(data.user));
  };

  const register = async (name: string, email: string, password: string): Promise<void> => {
    const data = await authApi.register(name, email, password);
    setToken(data.token);
    setUser(data.user);
    localStorage.setItem('dfs_token', data.token);
    localStorage.setItem('dfs_user', JSON.stringify(data.user));
  };

  const logout = (): void => {
    localStorage.removeItem('dfs_token');
    localStorage.removeItem('dfs_user');
    setUser(null);
    setToken(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token && !!user,
        isLoading,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
