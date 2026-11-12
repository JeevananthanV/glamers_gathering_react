import type { Config } from "@react-router/dev/config";

export default {
  // Server-side render by default, to enable SPA mode set this to `false`
  ssr: false,
  basename: process.env.PUBLIC_PATH || "/",
} satisfies Config;
