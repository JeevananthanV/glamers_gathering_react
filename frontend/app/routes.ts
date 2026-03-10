import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("admin/login", "routes/admin.login.tsx"),
  route("admin", "routes/admin.overview.tsx"),
  route("admin/audience", "routes/admin.audience.tsx"),
  route("admin/audience-entry", "routes/admin.audience-entry.tsx"),
  route("admin/models", "routes/admin.models.tsx"),
  route("admin/makeup-artists", "routes/admin.makeup-artists.tsx"),
  route("admin/stall-owners", "routes/admin.stall-owners.tsx"),
] satisfies RouteConfig;
