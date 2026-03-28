import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:8000",
});

export async function fetchPosts(params) {
  const { data } = await api.get("/api/posts", { params });
  return data;
}

export async function fetchPost(id) {
  const { data } = await api.get(`/api/posts/${id}`);
  return data;
}

export async function fetchPostStatus(id) {
  const { data } = await api.get(`/api/posts/status/${id}`);
  return data;
}

export async function deletePost(id) {
  const { data } = await api.delete(`/api/posts/${id}`);
  return data;
}

export async function updatePostLabels(id, payload) {
  const { data } = await api.patch(`/api/posts/${id}/labels`, payload);
  return data;
}

export async function retryPostAnalysis(id) {
  const { data } = await api.post(`/api/posts/${id}/retry`);
  return data;
}

export async function fetchResume() {
  const { data } = await api.get("/api/resume");
  return data;
}

export async function uploadResume(file, onUploadProgress) {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await api.post("/api/resume/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress,
  });
  return data;
}

export async function deleteResume() {
  const { data } = await api.delete("/api/resume");
  return data;
}
