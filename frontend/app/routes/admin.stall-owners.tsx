import { AdminCategoryPage } from "../components/AdminCategoryPage";

function formatDate(row: Record<string, unknown>) {
  const value = row.created_at;
  const date = value ? new Date(String(value)) : null;
  return date ? date.toLocaleString() : "";
}

export default function AdminStallOwners() {
  return (
    <AdminCategoryPage
      type="stall-owners"
      title="Stall Owner Applications"
      columns={[
        { key: "business_name", label: "Business" },
        { key: "owner_name", label: "Owner" },
        { key: "contact_number", label: "Contact" },
        { key: "email", label: "Email" },
        { key: "business_description", label: "Description" },
        { key: "created_at", label: "Submitted", format: formatDate },
      ]}
    />
  );
}
