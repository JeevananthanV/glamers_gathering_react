import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router";
import {
  API_BASE,
  fetchJson,
  getToken,
  clearToken,
} from "../components/adminClient";
import { AdminShell, BarChart, PieChart, StatCard } from "../components/AdminShell";
import {
  useAdminRealtime,
  type ActivityItem,
} from "../components/realtime";

type OverviewResponse = {
  counts: Record<string, number>;
  targets: Record<string, number>;
  remaining: Record<string, number>;
  total: number;
  entryCount: number;
  entryTickets: number;
  daily: Array<{ date: string; count: number }>;
};

const LABELS: Record<string, string> = {
  audience: "Audience Tickets",
  models: "Models",
  "makeup-artists": "Makeup Artists",
  "stall-owners": "Stall Owners",
};

function formatTimeAgo(dateStr: string) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "Recently";
  const diffSec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (diffSec < 45) return "Just now";
  if (diffSec < 90) return "1m ago";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return d.toLocaleDateString();
}

function getCategoryIcon(cat: string) {
  switch (cat) {
    case "audience":
      return "🎟️";
    case "models":
      return "💃";
    case "makeup-artists":
      return "💄";
    case "stall-owners":
      return "🎪";
    case "checkin":
      return "✅";
    default:
      return "✨";
  }
}

export default function AdminOverview() {
  const navigate = useNavigate();
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [error, setError] = useState("");
  const [isExporting, setIsExporting] = useState<string | null>(null);

  const loadOverview = useCallback(() => {
    fetchJson<OverviewResponse>("/api/admin/overview")
      .then((payload) => setData(payload))
      .catch((err: Error & { status?: number }) => {
        if (err.status === 401) {
          clearToken();
          navigate("/admin/login");
          return;
        }
        setError(err.message);
      });
  }, [navigate]);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      navigate("/admin/login");
      return;
    }
    loadOverview();
  }, [loadOverview, navigate]);

  // Hook into live Server-Sent Events
  const { status, activityFeed } = useAdminRealtime(
    useCallback(
      (eventName: string, payload: any) => {
        if (eventName === "stats_updated" || eventName === "slot_update") {
          setData((prev) =>
            prev
              ? {
                  ...prev,
                  counts: payload.counts || prev.counts,
                  remaining: payload.remaining || prev.remaining,
                  total: payload.total ?? prev.total,
                  entryCount: payload.entryCount ?? prev.entryCount,
                  entryTickets: payload.entryTickets ?? prev.entryTickets,
                }
              : null
          );
        } else if (eventName === "new_submission") {
          loadOverview();
        } else if (eventName === "checkin") {
          setData((prev) =>
            prev
              ? {
                  ...prev,
                  entryCount: payload.entryCount ?? prev.entryCount + 1,
                  entryTickets:
                    payload.entryTickets ??
                    prev.entryTickets + (Number(payload.entry?.tickets) || 1),
                }
              : null
          );
        }
      },
      [loadOverview]
    )
  );

  const chartData = useMemo(() => {
    if (!data) return [];
    return Object.keys(data.counts).map((key) => ({
      label: LABELS[key] || key,
      value: data.counts[key],
    }));
  }, [data]);

  const dailyData = useMemo(() => {
    if (!data) return [];
    return data.daily.map((item) => ({
      label: item.date.slice(5),
      value: item.count,
    }));
  }, [data]);

  const totalTarget = useMemo(() => {
    if (!data) return 0;
    return Object.values(data.targets).reduce((sum, val) => sum + val, 0);
  }, [data]);

  async function handleExport(type: string) {
    try {
      setIsExporting(type);
      const token = getToken();
      const res = await fetch(`${API_BASE}/api/admin/export/${type}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `glamour-${type}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Export error: ${err.message}`);
    } finally {
      setIsExporting(null);
    }
  }

  if (!data) {
    return (
      <AdminShell title="Overview" connectionState={status}>
        <div className="gg-admin-loading">
          {error ? error : "Loading overview..."}
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell
      title="Overview"
      connectionState={status}
      headerRight={
        <button
          type="button"
          className="gg-admin-btn-action"
          onClick={() => loadOverview()}
          title="Refresh stats"
        >
          🔄 Refresh
        </button>
      }
    >
      <section className="gg-admin-grid">
        <StatCard label="Total Submissions" value={data.total} />
        <StatCard
          label="Total Tickets"
          value={data.counts.audience || 0}
          sublabel={`${Math.max(
            0,
            (data.counts.audience || 0) - data.entryTickets
          )} pending entry`}
        />
        <StatCard
          label="Gate Check-ins"
          value={data.entryCount}
          sublabel={`${data.entryTickets} tickets checked in`}
        />
        <StatCard
          label="Check-in Rate"
          value={`${
            data.counts.audience > 0
              ? Math.round((data.entryTickets / data.counts.audience) * 100)
              : 0
          }%`}
        />
        {Object.keys(data.counts).map((key) => (
          <StatCard
            key={key}
            label={`${LABELS[key]} Filled`}
            value={data.counts[key]}
            sublabel={`${data.remaining[key]} remaining of ${data.targets[key] || 0}`}
          />
        ))}
      </section>

      {/* Real-time Activity Feed & CSV Export Toolbar */}
      <section className="gg-admin-feed-section">
        <div className="gg-admin-feed-card">
          <div className="gg-admin-feed-header">
            <h3>⚡ Live Real-Time Activity Feed</h3>
            <span className="gg-realtime-badge-inline">
              <span className="gg-realtime-dot" /> Live Stream
            </span>
          </div>

          <div className="gg-admin-feed-list">
            {activityFeed.length === 0 ? (
              <p className="gg-admin-feed-empty">
                Listening for real-time registrations and gate check-ins...
              </p>
            ) : (
              activityFeed.map((item, idx) => (
                <div
                  key={`${item.category}-${item.id}-${idx}`}
                  className={`gg-admin-feed-item gg-admin-feed-item--${item.category}`}
                >
                  <span className="gg-feed-icon">
                    {getCategoryIcon(item.category)}
                  </span>
                  <div className="gg-feed-info">
                    <strong className="gg-feed-name">
                      {item.full_name}
                      {item.ticket_code ? (
                        <span className="gg-feed-code"> [{item.ticket_code}]</span>
                      ) : null}
                    </strong>
                    <span className="gg-feed-action">
                      {item.action_label || item.category}
                      {item.tickets && item.tickets > 1
                        ? ` (${item.tickets} tickets)`
                        : ""}
                    </span>
                  </div>
                  <span className="gg-feed-time">
                    {formatTimeAgo(item.timestamp)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Quick CSV Export Tool */}
        <div className="gg-admin-export-card">
          <h3>📥 Export Data (CSV)</h3>
          <p>Download instant CSV sheets for participants, passes, and gate entries:</p>
          <div className="gg-export-btn-group">
            <button
              type="button"
              disabled={isExporting !== null}
              onClick={() => handleExport("audience")}
              className="gg-export-btn"
            >
              🎟️ Audience Tickets CSV
            </button>
            <button
              type="button"
              disabled={isExporting !== null}
              onClick={() => handleExport("entries")}
              className="gg-export-btn"
            >
              ✅ Gate Entries CSV
            </button>
            <button
              type="button"
              disabled={isExporting !== null}
              onClick={() => handleExport("models")}
              className="gg-export-btn"
            >
              💃 Models CSV
            </button>
            <button
              type="button"
              disabled={isExporting !== null}
              onClick={() => handleExport("makeup-artists")}
              className="gg-export-btn"
            >
              💄 Makeup Artists CSV
            </button>
            <button
              type="button"
              disabled={isExporting !== null}
              onClick={() => handleExport("stall-owners")}
              className="gg-export-btn"
            >
              🎪 Stall Owners CSV
            </button>
          </div>
        </div>
      </section>

      <section className="gg-admin-charts">
        <PieChart
          label="Total Filled vs Target"
          value={data.total}
          total={totalTarget}
        />
        <BarChart label="Submissions by Category" data={chartData} />
      </section>

      <section className="gg-admin-charts">
        <BarChart label="Last 14 Days Submissions" data={dailyData} />
      </section>
    </AdminShell>
  );
}
