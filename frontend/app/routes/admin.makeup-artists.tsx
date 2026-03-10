import { AdminCategoryPage } from "../components/AdminCategoryPage";

function formatDate(row: Record<string, unknown>) {
  const value = row.created_at;
  const date = value ? new Date(String(value)) : null;
  return date ? date.toLocaleString() : "";
}

export default function AdminMakeupArtists() {
  return (
    <AdminCategoryPage
      type="makeup-artists"
      title="Makeup Artist Applications"
      columns={[
        { key: "full_name", label: "Full Name" },
        { key: "experience", label: "Experience" },
        { key: "contact_number", label: "Contact" },
        { key: "email", label: "Email" },
        { key: "specialization", label: "Specialization" },
        { key: "created_at", label: "Submitted", format: formatDate },
      ]}
    />
  );
}
