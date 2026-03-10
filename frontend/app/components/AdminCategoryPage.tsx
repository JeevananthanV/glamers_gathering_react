import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  clearToken,
  fetchJson,
  getToken,
} from "./adminClient";
import { AdminShell, BarChart, PieChart, StatCard } from "./AdminShell";

type CategoryResponse = {
  type: string;
  label: string;
  rows: Array<Record<string, unknown>>;
  total: number;
  target: number;
  remaining: number;
  daily: Array<{ date: string; count: number }>;
};

type Column = {
  key: string;
  label: string;
  format?: (row: Record<string, unknown>) => string;
};

export function AdminCategoryPage({
  type,
  title,
  columns,
}: {
  type: string;
  title: string;
  columns: Column[];
}) {
  const navigate = useNavigate();
  const [data, setData] = useState<CategoryResponse | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const token = getToken();
    if (!token) {
      navigate("/admin/login");
      return;
    }

    const trimmed = query.trim();
    const queryParam = trimmed ? `?q=${encodeURIComponent(trimmed)}` : "";
    const timer = window.setTimeout(() => {
      fetchJson<CategoryResponse>(`/api/admin/category/${type}${queryParam}`)
        .then((payload) => setData(payload))
        .catch((err: Error & { status?: number }) => {
          if (err.status === 401) {
            clearToken();
            navigate("/admin/login");
            return;
          }
          setError(err.message);
        });
    }, 250);

    return () => window.clearTimeout(timer);
  }, [navigate, type, query]);

  const dailyData = useMemo(() => {
    if (!data) return [];
    return data.daily.map((item) => ({
      label: item.date.slice(5),
      value: item.count,
    }));
  }, [data]);

  if (!data) {
    return (
      <AdminShell title={title}>
        <div className="gg-admin-loading">
          {error ? error : "Loading submissions..."}
        </div>
      </AdminShell>
    );
  }

  const totalLabel = type === "audience" ? "Total Tickets" : "Total Submissions";

  return (
    <AdminShell title={title}>
      <section className="gg-admin-grid">
        <StatCard label={totalLabel} value={data.total} />
        <StatCard label="Target" value={data.target} />
        <StatCard label="Remaining" value={data.remaining} />
      </section>

      <section className="gg-admin-charts">
        <PieChart
          label="Filled vs Target"
          value={data.total}
          total={data.target || data.total}
        />
        <BarChart label="Last 14 Days" data={dailyData} />
      </section>

      <section className="gg-admin-search">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, email, phone, ID..."
          aria-label="Search submissions"
        />
        <button
          type="button"
          onClick={() => setQuery("")}
          disabled={!query}
        >
          Clear
        </button>
      </section>

      <section className="gg-admin-table-wrap">
        <table className="gg-admin-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, index) => (
              <tr key={String(row.id ?? index)}>
                {columns.map((col) => (
                  <td key={col.key}>
                    {col.format
                      ? col.format(row)
                      : String(row[col.key] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </AdminShell>
  );
}
