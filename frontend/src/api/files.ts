import apiClient from './client';
import type { FileItem, FileListResponse } from '../types';

export const filesApi = {
  async getFiles(): Promise<FileListResponse> {
    const response = await apiClient.get<FileListResponse>('/api/files');
    return response.data;
  },

  async getFileById(id: number): Promise<FileItem> {
    const response = await apiClient.get<FileItem>(`/api/files/${id}`);
    return response.data;
  },

  async uploadFile(file: File, onProgress?: (percentage: number) => void): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await apiClient.post('/api/files/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total && onProgress) {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percentCompleted);
        }
      },
    });

    return response.data;
  },

  async downloadFile(id: number, filename: string): Promise<void> {
    const response = await apiClient.get(`/api/files/${id}/download`, {
      responseType: 'blob',
    });

    // Create a temporary anchor element to trigger browser file download
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  async deleteFile(id: number): Promise<{ message: string; fileId: number }> {
    const response = await apiClient.delete<{ message: string; fileId: number }>(`/api/files/${id}`);
    return response.data;
  },
};
