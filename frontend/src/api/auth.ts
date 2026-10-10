import apiClient from './client';
import type { AuthResponse, User } from '../types';

export const authApi = {
  async register(name: string, email: string, password: string): Promise<AuthResponse> {
    const response = await apiClient.post<AuthResponse>('/api/auth/register', {
      name,
      email,
      password,
    });
    return response.data;
  },

  async login(email: string, password: string): Promise<AuthResponse> {
    const response = await apiClient.post<AuthResponse>('/api/auth/login', {
      email,
      password,
    });
    return response.data;
  },

  async getMe(): Promise<{ user: User }> {
    const response = await apiClient.get<{ user: User }>('/api/auth/me');
    return response.data;
  },
};
