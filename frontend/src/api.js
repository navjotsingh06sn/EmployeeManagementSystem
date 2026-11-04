const API_URL = import.meta.env.DEV
  ? ""
  : import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
const API_TARGET = API_URL || "the Vite proxy to http://127.0.0.1:8000";
const TOKEN_KEY = "employee_management_token";

async function apiFetch(path, options) {
  try {
    return await fetch(API_URL + path, options);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(
        `Could not connect to ${API_TARGET}. Check that the backend is running and that VITE_API_URL is correct for this deployment.`
      );
    }
    throw error;
  }
}

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

  const response = await apiFetch(path, {
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

export async function uploadFile(path, file, documentType = "aadhaar") {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers = {
    "Content-Type": file.type || "application/octet-stream",
    "X-File-Name": encodeURIComponent(file.name),
    "X-Document-Type": documentType,
  };

  if (token) {
    headers.Authorization = "Bearer " + token;
  }

  const response = await apiFetch(path, {
    method: "POST",
    headers,
    body: file,
  });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      typeof data?.detail === "string"
        ? data.detail
        : "The file could not be uploaded. Please try again."
    );
  }

  return data;
}

export async function downloadFile(path, filename) {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers = token ? { Authorization: "Bearer " + token } : {};
  const response = await apiFetch(path, { headers });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(
      typeof data?.detail === "string"
        ? data.detail
        : "The document could not be downloaded. Please try again."
    );
  }

  const objectUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

export async function viewFile(path) {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers = token ? { Authorization: "Bearer " + token } : {};
  const response = await apiFetch(path, { headers });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(
      typeof data?.detail === "string"
        ? data.detail
        : "The document preview could not be loaded."
    );
  }

  return URL.createObjectURL(await response.blob());
}
