export const API_BASE =
  import.meta.env.VITE_API_URL ?? "http://localhost:5000";

const TOKEN_KEY = "gg_admin_token";

export function getToken() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(TOKEN_KEY) || "";
}

export function setToken(token: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
}

export async function fetchJson<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const message =
      (await res.json().catch(() => null))?.error || res.statusText;
    const error = new Error(message);
    (error as Error & { status?: number }).status = res.status;
    throw error;
  }

  return res.json() as Promise<T>;
}
