const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
const TOKEN_KEY = "employee_management_token";

export function saveToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export async function apiRequest(path, options = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  if (token) {
    headers.Authorization = "Bearer " + token;
  }

  const response = await fetch(API_URL + path, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      typeof data?.detail === "string"
        ? data.detail
        : "The request failed. Please try again.";
    throw new Error(message);
  }

  return data;
}
