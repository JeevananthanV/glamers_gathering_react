import { Link, useLocation, useNavigate } from "react-router";
import { clearToken } from "./adminClient";

type ShellProps = {
  title: string;
  children: React.ReactNode;
};

export function AdminShell({ title, children }: ShellProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const links = [
    { to: "/admin", label: "Overview" },
    { to: "/admin/audience", label: "Audience" },
    { to: "/admin/audience-entry", label: "Audience Entry" },
    { to: "/admin/models", label: "Models" },
    { to: "/admin/makeup-artists", label: "Makeup Artists" },
    { to: "/admin/stall-owners", label: "Stall Owners" },
  ];

  return (
    <div className="gg-admin-page">
      <div className="gg-admin-shell">
        <aside className="gg-admin-nav">
          <div className="gg-admin-brand">Glamour Admin</div>
          <nav>
            {links.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={
                  location.pathname === link.to ? "active" : undefined
                }
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <button
            type="button"
            className="gg-admin-logout"
            onClick={() => {
              clearToken();
              navigate("/admin/login");
            }}
          >
            Log out
          </button>
        </aside>

        <main className="gg-admin-content">
          <header className="gg-admin-header">
            <h1>{title}</h1>
          </header>
          {children}
        </main>
      </div>
    </div>
  );
}

export function StatCard({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: string | number;
  sublabel?: string;
}) {
  return (
    <div className="gg-admin-card">
      <span className="gg-admin-card-label">{label}</span>
      <strong className="gg-admin-card-value">{value}</strong>
      {sublabel ? <span className="gg-admin-card-sub">{sublabel}</span> : null}
    </div>
  );
}

export function PieChart({
  value,
  total,
  label,
}: {
  value: number;
  total: number;
  label: string;
}) {
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const ratio = total > 0 ? Math.min(value / total, 1) : 0;
  const dash = `${circumference * ratio} ${circumference}`;

  return (
    <div className="gg-admin-chart">
      <div className="gg-admin-chart-title">{label}</div>
      <svg viewBox="0 0 120 120" className="gg-admin-pie">
        <circle
          cx="60"
          cy="60"
          r={radius}
          className="gg-admin-pie-track"
        />
        <circle
          cx="60"
          cy="60"
          r={radius}
          className="gg-admin-pie-fill"
          strokeDasharray={dash}
          strokeDashoffset={circumference * 0.25}
        />
        <text x="60" y="56" textAnchor="middle" className="gg-admin-pie-value">
          {value}
        </text>
        <text x="60" y="74" textAnchor="middle" className="gg-admin-pie-sub">
          of {total}
        </text>
      </svg>
    </div>
  );
}

export function BarChart({
  data,
  label,
}: {
  data: Array<{ label: string; value: number }>;
  label: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="gg-admin-chart">
      <div className="gg-admin-chart-title">{label}</div>
      <div className="gg-admin-bars">
        {data.map((item) => (
          <div className="gg-admin-bar" key={item.label}>
            <div
              className="gg-admin-bar-fill"
              style={{ height: `${(item.value / max) * 100}%` }}
            >
              <span>{item.value}</span>
            </div>
            <small>{item.label}</small>
          </div>
        ))}
      </div>
    </div>
  );
}
