import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { API_BASE, setToken } from "../components/adminClient";

export default function AdminLogin() {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));

    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.error || "Login failed");
      }

      setToken(payload.token);
      navigate("/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="gg-admin-login">
      <form className="gg-admin-login-card" onSubmit={handleSubmit}>
        <h1>Admin Login</h1>
        <p>Use your admin credentials to access the dashboard.</p>

        <label htmlFor="admin-username">Username</label>
        <input
          id="admin-username"
          name="username"
          type="text"
          required
          autoComplete="username"
        />

        <label htmlFor="admin-password">Password</label>
        <input
          id="admin-password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
        />

        {error ? <div className="gg-admin-error">{error}</div> : null}

        <button type="submit" disabled={loading}>
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}
