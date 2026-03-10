import { AdminCategoryPage } from "../components/AdminCategoryPage";

function formatDate(row: Record<string, unknown>) {
  const value = row.created_at;
  const date = value ? new Date(String(value)) : null;
  return date ? date.toLocaleString() : "";
}

export default function AdminModels() {
  return (
    <AdminCategoryPage
      type="models"
      title="Model Applications"
      columns={[
        { key: "full_name", label: "Full Name" },
        { key: "age", label: "Age" },
        { key: "contact_number", label: "Contact" },
        { key: "email", label: "Email" },
        { key: "outfit_description", label: "Outfit" },
        { key: "created_at", label: "Submitted", format: formatDate },
      ]}
    />
  );
}
