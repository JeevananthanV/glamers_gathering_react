import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router";
import {
  API_BASE,
  clearToken,
  fetchJson,
  getToken,
} from "../components/adminClient";
import { AdminShell } from "../components/AdminShell";
import { useAdminRealtime } from "../components/realtime";

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

type VerifyResponse = {
  valid: boolean;
  checkedIn: boolean;
  ticket?: {
    id: number;
    fullName: string;
    tickets: number;
    contactNumber?: string | null;
    email?: string | null;
    ticketCode: string;
    createdAt: string;
  };
  entry?: EntryRow | null;
  message?: string;
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

// Web Audio API Synthesizer for instant audible scan feedback
function playSound(type: "success" | "warning" | "error") {
  if (typeof window === "undefined") return;
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    if (type === "success") {
      // Pleasant rising chime (C5 to E5)
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = "sine";
      osc1.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc1.frequency.exponentialRampToValueAtTime(659.25, ctx.currentTime + 0.15); // E5

      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.28);

      osc1.connect(gain);
      gain.connect(ctx.destination);
      osc1.start();
      osc1.stop(ctx.currentTime + 0.3);
    } else if (type === "warning") {
      // Alert double-tone (already checked in)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.setValueAtTime(349.23, ctx.currentTime + 0.12);

      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.28);
    } else {
      // Low error buzz
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(160, ctx.currentTime);

      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.38);
    }
  } catch {
    // Ignore web audio errors
  }
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
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [lastScannedEntry, setLastScannedEntry] = useState<EntryRow | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const scanInputRef = useRef<HTMLInputElement | null>(null);

  // Fast manual lookup verification
  const [lookupCode, setLookupCode] = useState("");
  const [verifyResult, setVerifyResult] = useState<VerifyResponse | null>(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      navigate("/admin/login");
      return;
    }
    scanInputRef.current?.focus();
  }, [navigate]);

  const loadEntries = useCallback(async (search: string) => {
    const trimmed = search.trim();
    const queryParam = trimmed ? `?q=${encodeURIComponent(trimmed)}` : "";
    const payload = await fetchJson<EntriesListResponse>(
      `/api/admin/audience/entries${queryParam}`
    );
    setRows(payload.rows || []);
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

  // Hook into live Server-Sent Events for multi-gate real-time check-in sync
  const { status: sseStatus, stats } = useAdminRealtime(
    useCallback(
      (eventName: string, payload: any) => {
        if (eventName === "checkin") {
          const entry = payload.entry as EntryRow;
          if (entry) {
            setRows((prev) => {
              if (prev.some((r) => r.id === entry.id)) return prev;
              return [entry, ...prev];
            });
          }
        }
      },
      []
    )
  );

  async function submitScan(raw: string) {
    const code = extractCode(raw);
    if (!code) {
      setStatus("");
      setError("Invalid QR data");
      setStatusKind("error");
      if (soundEnabled) playSound("error");
      return;
    }

    setError("");
    setStatus("");
    setStatusKind("");

    try {
      const payload = await fetchJson<EntryResponse>("/api/checkin", {
        method: "POST",
        body: JSON.stringify({ code }),
      });

      if (!payload.ok || payload.status === "invalid") {
        setError(payload.message || "Invalid Ticket");
        setStatusKind("error");
        setScanValue("");
        if (soundEnabled) playSound("error");
        scanInputRef.current?.focus();
        return;
      }

      const name = payload.entry?.full_name || "";
      if (payload.status === "already") {
        setStatus(payload.message || `Already Checked In${name ? `: ${name}` : ""}`);
        setStatusKind("warning");
        if (soundEnabled) playSound("warning");
      } else {
        setStatus(payload.message || `Check-in Success${name ? `: ${name}` : ""}`);
        setStatusKind("success");
        if (soundEnabled) playSound("success");
      }

      if (payload.entry) {
        setLastScannedEntry(payload.entry);
        setRows((prev) => {
          if (prev.some((r) => r.id === payload.entry?.id)) return prev;
          return [payload.entry!, ...prev];
        });
      }

      setScanValue("");
      scanInputRef.current?.focus();
    } catch (err: any) {
      setError(err.message || "Network error checking in");
      setStatusKind("error");
      if (soundEnabled) playSound("error");
    }
  }

  // Fast Verification
  async function handleVerify(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const code = extractCode(lookupCode);
    if (!code) return;

    setVerifying(true);
    setVerifyResult(null);

    try {
      const payload = await fetchJson<VerifyResponse>(
        `/api/tickets/verify/${encodeURIComponent(code)}`
      );
      setVerifyResult(payload);
    } catch (err: any) {
      setVerifyResult({
        valid: false,
        checkedIn: false,
        message: err.message || "Verification failed",
      });
    } finally {
      setVerifying(false);
    }
  }

  // Export Entries CSV
  async function handleExportEntries() {
    try {
      setIsExporting(true);
      const token = getToken();
      const res = await fetch(`${API_BASE}/api/admin/export/entries`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `glamour-audience-entries-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Export error: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  }

  const totalAudienceTickets = stats?.counts?.audience || 250;
  const checkedInTickets = stats?.entryTickets || rows.reduce((sum, r) => sum + (Number(r.tickets) || 1), 0);
  const checkinPct = Math.min(100, Math.round((checkedInTickets / Math.max(1, totalAudienceTickets)) * 100));

  return (
    <AdminShell
      title="Audience Entry"
      connectionState={sseStatus}
      headerRight={
        <div className="gg-admin-header-btns">
          <button
            type="button"
            className="gg-admin-btn-action"
            onClick={() => setSoundEnabled(!soundEnabled)}
            title={soundEnabled ? "Mute Scan Audio" : "Enable Scan Audio"}
          >
            {soundEnabled ? "🔊 Sound On" : "🔇 Muted"}
          </button>
          <button
            type="button"
            className="gg-admin-btn-action"
            onClick={handleExportEntries}
            disabled={isExporting}
          >
            📥 Export Entries CSV
          </button>
        </div>
      }
    >
      {/* Live Gate Progress Tracker */}
      <section className="gg-gate-progress-card">
        <div className="gg-gate-progress-header">
          <div>
            <strong>Gate Check-in Progress</strong>
            <span className="gg-gate-progress-stats">
              {checkedInTickets} / {totalAudienceTickets} tickets checked in ({checkinPct}%)
            </span>
          </div>
          <span className="gg-realtime-badge-inline">
            <span className="gg-realtime-dot" /> Multi-Gate Live Sync
          </span>
        </div>
        <div className="gg-progress-track">
          <div
            className="gg-progress-fill"
            style={{ width: `${checkinPct}%` }}
          />
        </div>
      </section>

      <section className="gg-admin-entry">
        {/* Scanner Card */}
        <div className="gg-admin-entry-card">
          <h3>⚡ Scan QR Pass → Auto Check-in</h3>
          <p>Point barcode/QR reader or paste the ticket code. Auto-checks in on Enter.</p>
          <input
            ref={scanInputRef}
            type="text"
            value={scanValue}
            onChange={(e) => setScanValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void submitScan(scanValue);
              }
            }}
            placeholder="Scan QR or paste ticket code (e.g. GG-1A2B3C4D)"
          />
          <button
            type="button"
            onClick={() => void submitScan(scanValue)}
          >
            Check In Pass
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

          {/* Last Checked in attendee highlight */}
          {lastScannedEntry ? (
            <div className="gg-last-scanned-card">
              <div className="gg-last-scanned-badge">LATEST PASS SCANNED</div>
              <h4>{lastScannedEntry.full_name}</h4>
              <p>
                <strong>Code:</strong> {lastScannedEntry.ticket_code} &nbsp;|&nbsp;
                <strong>Tickets:</strong> {lastScannedEntry.tickets} &nbsp;|&nbsp;
                <strong>Contact:</strong> {lastScannedEntry.contact_number || "N/A"}
              </p>
              <small>Scanned at {formatDate(lastScannedEntry.scanned_at)}</small>
            </div>
          ) : null}

          {/* Ticket Verification Card */}
          <div className="gg-verify-subcard">
            <h4>🔍 Manual Ticket Lookup & Verification</h4>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <input
                type="text"
                value={lookupCode}
                onChange={(e) => setLookupCode(e.target.value)}
                placeholder="Enter Ticket Code to verify"
                style={{ flex: 1, margin: 0 }}
              />
              <button
                type="button"
                onClick={() => void handleVerify()}
                disabled={verifying || !lookupCode}
                className="gg-btn-action-icon"
                style={{ padding: "0.5rem 1rem", borderRadius: "8px" }}
              >
                {verifying ? "Checking..." : "Verify"}
              </button>
            </div>

            {verifyResult ? (
              <div
                className={`gg-admin-entry-status gg-admin-entry-status--${
                  verifyResult.valid
                    ? verifyResult.checkedIn
                      ? "warning"
                      : "success"
                    : "error"
                }`}
                style={{ marginTop: "0.75rem" }}
              >
                <div>
                  <strong>{verifyResult.message}</strong>
                </div>
                {verifyResult.ticket && !verifyResult.checkedIn ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (verifyResult.ticket?.ticketCode) {
                        void submitScan(verifyResult.ticket.ticketCode);
                        setVerifyResult(null);
                        setLookupCode("");
                      }
                    }}
                    style={{
                      marginTop: "0.5rem",
                      background: "#22c55e",
                      color: "#fff",
                      border: "none",
                      padding: "0.4rem 0.8rem",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontWeight: 700,
                    }}
                  >
                    Check In Guest Now ({verifyResult.ticket.tickets} Tickets)
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {/* Live Recent Entries Table */}
        <div className="gg-admin-entry-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.8rem" }}>
            <h3 style={{ margin: 0 }}>Gate Entry Log</h3>
            <span className="gg-realtime-badge-inline">
              <span className="gg-realtime-dot" /> Live Feed
            </span>
          </div>

          <div className="gg-admin-search">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search entries by name, ticket code, phone..."
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
                  <th>Checked In</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <span className="gg-feed-code">{row.ticket_code}</span>
                    </td>
                    <td>
                      <strong>{row.full_name}</strong>
                    </td>
                    <td>
                      <span className="gg-badge-tickets">{row.tickets}</span>
                    </td>
                    <td>{row.contact_number || "-"}</td>
                    <td>{formatDate(row.scanned_at)}</td>
                  </tr>
                ))}
                {!rows.length ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", padding: "1.5rem" }}>
                      No entries scanned yet.
                    </td>
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
