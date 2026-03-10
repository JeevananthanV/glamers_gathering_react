import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  fetchJson,
  getToken,
  clearToken,
} from "../components/adminClient";
import { AdminShell, BarChart, PieChart, StatCard } from "../components/AdminShell";

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

export default function AdminOverview() {
  const navigate = useNavigate();
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = getToken();
    if (!token) {
      navigate("/admin/login");
      return;
    }

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

  if (!data) {
    return (
      <AdminShell title="Overview">
        <div className="gg-admin-loading">
          {error ? error : "Loading overview..."}
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell title="Overview">
      <section className="gg-admin-grid">
        <StatCard label="Total Submissions" value={data.total} />
        <StatCard label="Entry Check-ins" value={data.entryCount} />
        <StatCard label="Entry Tickets" value={data.entryTickets} />
        {Object.keys(data.counts).map((key) => (
          <StatCard
            key={key}
            label={`${LABELS[key]} Filled`}
            value={data.counts[key]}
            sublabel={`${data.remaining[key]} remaining`}
          />
        ))}
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
