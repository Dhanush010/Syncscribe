import axios from "axios";

const API_URL = "http://localhost:5000/api/documents";

export const getDocuments = () => axios.get(API_URL);
export const getDocumentById = (id) => axios.get(`${API_URL}/${id}`);
export const createDocument = (data) => axios.post(API_URL, data);
export const updateDocument = (id, data) => axios.put(`${API_URL}/${id}`, data);
export const deleteDocument = (id) => axios.delete(`${API_URL}/${id}`);
