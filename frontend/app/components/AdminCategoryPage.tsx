import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router";
import {
  API_BASE,
  clearToken,
  fetchJson,
  getToken,
} from "./adminClient";
import { AdminShell, BarChart, PieChart, StatCard } from "./AdminShell";
import { useAdminRealtime } from "./realtime";

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
  const [isExporting, setIsExporting] = useState(false);

  // Modals state
  const [viewingRow, setViewingRow] = useState<Record<string, unknown> | null>(null);
  const [editingRow, setEditingRow] = useState<Record<string, unknown> | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState("");

  const loadData = useCallback(() => {
    const trimmed = query.trim();
    const queryParam = trimmed ? `?q=${encodeURIComponent(trimmed)}` : "";
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
  }, [navigate, query, type]);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      navigate("/admin/login");
      return;
    }

    const timer = window.setTimeout(loadData, 250);
    return () => window.clearTimeout(timer);
  }, [loadData, navigate]);

  // Real-time listener for live submission updates
  const { status } = useAdminRealtime(
    useCallback(
      (eventName: string, payload: any) => {
        if (eventName === "new_submission" && payload.category === type) {
          setData((prev) => {
            if (!prev) return null;
            const newRecord = payload.record || {};
            // Prepend new record to rows
            const newRows = [newRecord, ...prev.rows];
            const countInc = type === "audience" ? Number(newRecord.tickets) || 1 : 1;
            const newTotal = prev.total + countInc;
            return {
              ...prev,
              rows: newRows,
              total: newTotal,
              remaining: Math.max(0, prev.target - newTotal),
            };
          });
        } else if (eventName === "submission_updated" && payload.category === type) {
          setData((prev) => {
            if (!prev) return null;
            const updated = payload.record || {};
            return {
              ...prev,
              rows: prev.rows.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)),
            };
          });
        } else if (eventName === "submission_deleted" && payload.category === type) {
          setData((prev) => {
            if (!prev) return null;
            const delId = payload.id;
            const remainingRows = prev.rows.filter((r) => r.id !== delId);
            return {
              ...prev,
              rows: remainingRows,
            };
          });
          loadData();
        }
      },
      [loadData, type]
    )
  );

  const dailyData = useMemo(() => {
    if (!data) return [];
    return data.daily.map((item) => ({
      label: item.date.slice(5),
      value: item.count,
    }));
  }, [data]);

  // Handle Save Edit
  async function handleSaveEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingRow?.id) return;

    setSaveLoading(true);
    setFeedbackMsg("");

    try {
      const payload = await fetchJson<{ ok: boolean; record: Record<string, unknown> }>(
        `/api/admin/submissions/${type}/${editingRow.id}`,
        {
          method: "PUT",
          body: JSON.stringify(editingRow),
        }
      );

      if (payload.ok && payload.record) {
        setData((prev) =>
          prev
            ? {
                ...prev,
                rows: prev.rows.map((r) =>
                  r.id === payload.record.id ? { ...r, ...payload.record } : r
                ),
              }
            : null
        );
        setEditingRow(null);
      }
    } catch (err: any) {
      setFeedbackMsg(err.message || "Failed to update record");
    } finally {
      setSaveLoading(false);
    }
  }

  // Handle Delete
  async function handleDeleteConfirm() {
    if (!deletingId) return;

    setSaveLoading(true);
    try {
      const payload = await fetchJson<{ ok: boolean }>(
        `/api/admin/submissions/${type}/${deletingId}`,
        { method: "DELETE" }
      );
      if (payload.ok) {
        setData((prev) =>
          prev
            ? {
                ...prev,
                rows: prev.rows.filter((r) => r.id !== deletingId),
              }
            : null
        );
        setDeletingId(null);
      }
    } catch (err: any) {
      alert(`Delete error: ${err.message}`);
    } finally {
      setSaveLoading(false);
    }
  }

  // Export CSV
  async function handleExport() {
    try {
      setIsExporting(true);
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
      setIsExporting(false);
    }
  }

  if (!data) {
    return (
      <AdminShell title={title} connectionState={status}>
        <div className="gg-admin-loading">
          {error ? error : "Loading submissions..."}
        </div>
      </AdminShell>
    );
  }

  const totalLabel = type === "audience" ? "Total Tickets" : "Total Submissions";

  return (
    <AdminShell
      title={title}
      connectionState={status}
      headerRight={
        <div className="gg-admin-header-btns">
          <button
            type="button"
            className="gg-admin-btn-action"
            onClick={handleExport}
            disabled={isExporting}
          >
            📥 Export CSV
          </button>
          <button
            type="button"
            className="gg-admin-btn-action"
            onClick={() => loadData()}
            title="Refresh submissions"
          >
            🔄 Refresh
          </button>
        </div>
      }
    >
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
          placeholder="Search by name, email, phone, ID, ticket..."
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
              <th style={{ textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} style={{ textAlign: "center", padding: "2rem" }}>
                  No submissions found.
                </td>
              </tr>
            ) : (
              data.rows.map((row, index) => (
                <tr key={String(row.id ?? index)} className="gg-admin-row">
                  {columns.map((col) => (
                    <td key={col.key}>
                      {col.format
                        ? col.format(row)
                        : String(row[col.key] ?? "")}
                    </td>
                  ))}
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <div className="gg-row-actions">
                      {/* Ticket Download for Audience */}
                      {type === "audience" && row.ticket_code ? (
                        <a
                          href={`${API_BASE}/api/tickets/${encodeURIComponent(String(row.ticket_code))}.png`}
                          target="_blank"
                          rel="noreferrer"
                          className="gg-btn-action-icon"
                          title="Download Entry Pass PNG"
                        >
                          🎫 Pass
                        </a>
                      ) : null}

                      <button
                        type="button"
                        className="gg-btn-action-icon"
                        title="View Full Details"
                        onClick={() => setViewingRow(row)}
                      >
                        👁️
                      </button>

                      <button
                        type="button"
                        className="gg-btn-action-icon"
                        title="Edit Submission"
                        onClick={() => setEditingRow(row)}
                      >
                        ✏️
                      </button>

                      <button
                        type="button"
                        className="gg-btn-action-icon gg-btn-action-icon--danger"
                        title="Delete Submission"
                        onClick={() => setDeletingId(Number(row.id))}
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {/* VIEW DETAILS MODAL */}
      {viewingRow ? (
        <div className="gg-modal-backdrop" onClick={() => setViewingRow(null)}>
          <div className="gg-modal" onClick={(e) => e.stopPropagation()}>
            <div className="gg-modal-header">
              <h3>Submission Details (#{String(viewingRow.id)})</h3>
              <button
                type="button"
                className="gg-modal-close"
                onClick={() => setViewingRow(null)}
              >
                ✕
              </button>
            </div>
            <div className="gg-modal-body">
              <dl className="gg-details-list">
                {Object.entries(viewingRow).map(([k, v]) => (
                  <div key={k} className="gg-detail-item">
                    <dt>{k.replace(/_/g, " ").toUpperCase()}:</dt>
                    <dd>{String(v ?? "N/A")}</dd>
                  </div>
                ))}
              </dl>
              {type === "audience" && viewingRow.ticket_code ? (
                <div className="gg-modal-ticket-preview">
                  <h4>Official Ticket Pass</h4>
                  <img
                    src={`${API_BASE}/api/tickets/${encodeURIComponent(String(viewingRow.ticket_code))}.png`}
                    alt="Ticket Pass"
                    className="gg-ticket-img-preview"
                  />
                  <div style={{ marginTop: "1rem" }}>
                    <a
                      href={`${API_BASE}/api/tickets/${encodeURIComponent(String(viewingRow.ticket_code))}.png`}
                      download={`GG-Ticket-${viewingRow.ticket_code}.png`}
                      className="gg-btn-primary"
                    >
                      📥 Download PNG Pass
                    </a>
                  </div>
                </div>
              ) : null}
            </div>
            <div className="gg-modal-footer">
              <button
                type="button"
                className="gg-btn-secondary"
                onClick={() => setViewingRow(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* EDIT SUBMISSION MODAL */}
      {editingRow ? (
        <div className="gg-modal-backdrop" onClick={() => setEditingRow(null)}>
          <div className="gg-modal" onClick={(e) => e.stopPropagation()}>
            <form onSubmit={handleSaveEdit}>
              <div className="gg-modal-header">
                <h3>Edit Submission (#{String(editingRow.id)})</h3>
                <button
                  type="button"
                  className="gg-modal-close"
                  onClick={() => setEditingRow(null)}
                >
                  ✕
                </button>
              </div>
              <div className="gg-modal-body">
                {feedbackMsg ? (
                  <div className="gg-modal-alert">{feedbackMsg}</div>
                ) : null}

                {/* Common fields: Name / Contact / Email */}
                {type === "stall-owners" ? (
                  <>
                    <div className="gg-form-group">
                      <label>Business Name</label>
                      <input
                        type="text"
                        value={String(editingRow.business_name ?? "")}
                        onChange={(e) =>
                          setEditingRow({ ...editingRow, business_name: e.target.value })
                        }
                        required
                      />
                    </div>
                    <div className="gg-form-group">
                      <label>Owner Name</label>
                      <input
                        type="text"
                        value={String(editingRow.owner_name ?? "")}
                        onChange={(e) =>
                          setEditingRow({ ...editingRow, owner_name: e.target.value })
                        }
                        required
                      />
                    </div>
                  </>
                ) : (
                  <div className="gg-form-group">
                    <label>Full Name</label>
                    <input
                      type="text"
                      value={String(editingRow.full_name ?? "")}
                      onChange={(e) =>
                        setEditingRow({ ...editingRow, full_name: e.target.value })
                      }
                      required
                    />
                  </div>
                )}

                <div className="gg-form-group">
                  <label>Contact Number</label>
                  <input
                    type="text"
                    value={String(editingRow.contact_number ?? "")}
                    onChange={(e) =>
                      setEditingRow({ ...editingRow, contact_number: e.target.value })
                    }
                    required
                  />
                </div>

                <div className="gg-form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    value={String(editingRow.email ?? "")}
                    onChange={(e) =>
                      setEditingRow({ ...editingRow, email: e.target.value })
                    }
                  />
                </div>

                {/* Type specific fields */}
                {type === "audience" ? (
                  <div className="gg-form-group">
                    <label>Number of Tickets</label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={Number(editingRow.tickets ?? 1)}
                      onChange={(e) =>
                        setEditingRow({ ...editingRow, tickets: Number(e.target.value) })
                      }
                      required
                    />
                  </div>
                ) : null}

                {type === "models" ? (
                  <>
                    <div className="gg-form-group">
                      <label>Age</label>
                      <input
                        type="number"
                        min={1}
                        value={Number(editingRow.age ?? 18)}
                        onChange={(e) =>
                          setEditingRow({ ...editingRow, age: Number(e.target.value) })
                        }
                        required
                      />
                    </div>
                    <div className="gg-form-group">
                      <label>Outfit Description</label>
                      <textarea
                        value={String(editingRow.outfit_description ?? "")}
                        onChange={(e) =>
                          setEditingRow({ ...editingRow, outfit_description: e.target.value })
                        }
                        rows={3}
                      />
                    </div>
                  </>
                ) : null}

                {type === "makeup-artists" ? (
                  <>
                    <div className="gg-form-group">
                      <label>Years Experience</label>
                      <input
                        type="number"
                        min={0}
                        value={Number(editingRow.experience ?? 0)}
                        onChange={(e) =>
                          setEditingRow({ ...editingRow, experience: Number(e.target.value) })
                        }
                        required
                      />
                    </div>
                    <div className="gg-form-group">
                      <label>Specialization</label>
                      <input
                        type="text"
                        value={String(editingRow.specialization ?? "")}
                        onChange={(e) =>
                          setEditingRow({ ...editingRow, specialization: e.target.value })
                        }
                      />
                    </div>
                  </>
                ) : null}

                {type === "stall-owners" ? (
                  <div className="gg-form-group">
                    <label>Business Description</label>
                    <textarea
                      value={String(editingRow.business_description ?? "")}
                      onChange={(e) =>
                        setEditingRow({ ...editingRow, business_description: e.target.value })
                      }
                      rows={3}
                    />
                  </div>
                ) : null}
              </div>

              <div className="gg-modal-footer">
                <button
                  type="button"
                  className="gg-btn-secondary"
                  onClick={() => setEditingRow(null)}
                  disabled={saveLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="gg-btn-primary"
                  disabled={saveLoading}
                >
                  {saveLoading ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* DELETE CONFIRMATION MODAL */}
      {deletingId ? (
        <div className="gg-modal-backdrop" onClick={() => setDeletingId(null)}>
          <div className="gg-modal gg-modal--sm" onClick={(e) => e.stopPropagation()}>
            <div className="gg-modal-header">
              <h3>Confirm Deletion</h3>
              <button
                type="button"
                className="gg-modal-close"
                onClick={() => setDeletingId(null)}
              >
                ✕
              </button>
            </div>
            <div className="gg-modal-body">
              <p>
                Are you sure you want to permanently delete submission #{deletingId}?
              </p>
              {type === "audience" ? (
                <p className="gg-text-danger" style={{ fontSize: "0.85rem", marginTop: "0.5rem" }}>
                  ⚠️ This will also invalidate and delete any associated gate check-in entry for this ticket pass.
                </p>
              ) : null}
            </div>
            <div className="gg-modal-footer">
              <button
                type="button"
                className="gg-btn-secondary"
                onClick={() => setDeletingId(null)}
                disabled={saveLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="gg-btn-danger"
                onClick={handleDeleteConfirm}
                disabled={saveLoading}
              >
                {saveLoading ? "Deleting..." : "Delete Permanently"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AdminShell>
  );
}
