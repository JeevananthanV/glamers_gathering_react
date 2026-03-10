import { AdminCategoryPage } from "../components/AdminCategoryPage";

function formatDate(row: Record<string, unknown>) {
  const value = row.created_at;
  const date = value ? new Date(String(value)) : null;
  return date ? date.toLocaleString() : "";
}

export default function AdminAudience() {
  return (
    <AdminCategoryPage
      type="audience"
      title="Audience Submissions"
      columns={[
        { key: "full_name", label: "Full Name" },
        { key: "tickets", label: "Tickets" },
        { key: "ticket_code", label: "Ticket ID" },
        { key: "contact_number", label: "Contact" },
        { key: "email", label: "Email" },
        { key: "created_at", label: "Submitted", format: formatDate },
      ]}
    />
  );
}
