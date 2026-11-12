import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
  clearToken,
  fetchJson,
  getToken,
} from "../components/adminClient";
import { AdminShell } from "../components/AdminShell";

type EntryRow = {
  id: number;
  ticket_code: string;
  full_name: string;
  tickets: number;
  contact_number?: string | null;
  email?: string | null;
  scanned_at: string;
};

type EntryResponse = {
  ok: boolean;
  status: "checked-in" | "already" | "invalid";
  message?: string;
  entry?: EntryRow;
};

type EntriesListResponse = {
  rows: EntryRow[];
};

function extractCode(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as { code?: string };
      if (parsed?.code) return String(parsed.code).trim();
    } catch {
      // fall through
    }
  }
  return trimmed;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function AdminAudienceEntry() {
  const navigate = useNavigate();
  const [scanValue, setScanValue] = useState("");
  const [status, setStatus] = useState<string>("");
  const [statusKind, setStatusKind] = useState<
    "success" | "warning" | "error" | ""
  >("");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<EntryRow[]>([]);
  const scanInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      navigate("/admin/login");
      return;
    }
    scanInputRef.current?.focus();
  }, [navigate]);

  const loadEntries = useMemo(() => {
    return async (search: string) => {
      const trimmed = search.trim();
      const queryParam = trimmed ? `?q=${encodeURIComponent(trimmed)}` : "";
      const payload = await fetchJson<EntriesListResponse>(
        `/api/admin/audience/entries${queryParam}`
      );
      setRows(payload.rows || []);
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadEntries(query).catch((err: Error & { status?: number }) => {
        if (err.status === 401) {
          clearToken();
          navigate("/admin/login");
          return;
        }
        setError(err.message);
      });
    }, 250);

    return () => window.clearTimeout(timer);
  }, [loadEntries, navigate, query]);

  async function submitScan(raw: string) {
    const code = extractCode(raw);
    if (!code) {
      setStatus("");
      setError("Invalid QR data");
      setStatusKind("error");
      return;
    }

    setError("");
    setStatus("");
    setStatusKind("");

    const payload = await fetchJson<EntryResponse>(
      "/api/checkin",
      {
        method: "POST",
        body: JSON.stringify({ code }),
      }
    );

    if (!payload.ok || payload.status === "invalid") {
      setError(payload.message || "Invalid Ticket");
      setStatusKind("error");
      setScanValue("");
      scanInputRef.current?.focus();
      return;
    }

    const name = payload.entry?.full_name || "";
    if (payload.status === "already") {
      setStatus(payload.message || `Already Checked In${name ? `: ${name}` : ""}`);
      setStatusKind("warning");
    } else {
      setStatus(payload.message || `Check-in Success${name ? `: ${name}` : ""}`);
      setStatusKind("success");
    }
    setScanValue("");
    await loadEntries(query);
    scanInputRef.current?.focus();
  }

  return (
    <AdminShell title="Audience Entry">
      <section className="gg-admin-entry">
        <div className="gg-admin-entry-card">
          <h3>Scan QR → Auto Check-in</h3>
          <p>Focus the input and scan the QR code. It will auto-submit on Enter.</p>
          <input
            ref={scanInputRef}
            type="text"
            value={scanValue}
            onChange={(e) => setScanValue(e.target.value)}
            onBlur={() => scanInputRef.current?.focus()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitScan(scanValue).catch((err: Error & { status?: number }) => {
                  if (err.status === 401) {
                    clearToken();
                    navigate("/admin/login");
                    return;
                  }
                  setError(err.message);
                });
              }
            }}
            placeholder="Scan QR or paste ticket code"
          />
          <button
            type="button"
            onClick={() =>
              submitScan(scanValue).catch((err: Error & { status?: number }) => {
                if (err.status === 401) {
                  clearToken();
                  navigate("/admin/login");
                  return;
                }
                setError(err.message);
              })
            }
          >
            Check In
          </button>
          {status ? (
            <div
              className={`gg-admin-entry-status gg-admin-entry-status--${statusKind || "success"}`}
            >
              {status}
            </div>
          ) : null}
          {error ? (
            <div className="gg-admin-entry-status gg-admin-entry-status--error">
              {error}
            </div>
          ) : null}
        </div>

        <div className="gg-admin-entry-card">
          <h3>Recent Entries</h3>
          <div className="gg-admin-search">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, email, phone, ID..."
              aria-label="Search entries"
            />
            <button type="button" onClick={() => setQuery("")} disabled={!query}>
              Clear
            </button>
          </div>
          <div className="gg-admin-table-wrap">
            <table className="gg-admin-table">
              <thead>
                <tr>
                  <th>Ticket ID</th>
                  <th>Name</th>
                  <th>Tickets</th>
                  <th>Contact</th>
                  <th>Email</th>
                  <th>Checked In</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.ticket_code}</td>
                    <td>{row.full_name}</td>
                    <td>{row.tickets}</td>
                    <td>{row.contact_number || ""}</td>
                    <td>{row.email || ""}</td>
                    <td>{formatDate(row.scanned_at)}</td>
                  </tr>
                ))}
                {!rows.length ? (
                  <tr>
                    <td colSpan={6}>No entries yet</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </AdminShell>
  );
}
