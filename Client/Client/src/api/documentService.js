// src/api/documentService.js
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
console.log("API_URL:", API_URL, "Env var:", import.meta.env.VITE_API_URL);

// Set up axios with token
const api = axios.create({
  baseURL: API_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auth
export const register = (data) => api.post("/auth/register", data);
export const login = (data) => api.post("/auth/login", data);
export const verifyToken = () => api.get("/auth/verify");

// Documents
export const getDocuments = () => api.get("/documents");
export const getDocumentById = (id) => api.get(`/documents/${id}`);
export const createDocument = (data) => api.post("/documents", data);
export const updateDocument = (id, data) => api.put(`/documents/${id}`, data);
export const deleteDocument = (id) => api.delete(`/documents/${id}`);
export const shareDocument = (id, data) => api.post(`/documents/${id}/share`, data);
export const generateShareLink = (id) => api.post(`/documents/${id}/share-link`);
export const getDocumentByShareLink = (link) => api.get(`/documents/share/${link}`);
export const exportDocument = (id, format) => api.get(`/documents/${id}/export/${format}`);

// Versions
export const getVersions = (docId) => api.get(`/versions/document/${docId}`);
export const createVersion = (data) => api.post("/versions", data);
export const restoreVersion = (id) => api.post(`/versions/${id}/restore`);

// Comments
export const getComments = (docId) => api.get(`/comments/document/${docId}`);
export const createComment = (data) => api.post("/comments", data);
export const updateComment = (id, data) => api.put(`/comments/${id}`, data);
export const deleteComment = (id) => api.delete(`/comments/${id}`);

export default api;
