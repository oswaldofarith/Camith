import type { NextConfig } from "next";

// En desarrollo, Next reenvía /api y /media a Django para que el navegador vea
// un único origen (cookie de sesión y CSRF). En producción lo hace Caddy.
const backend = process.env.BACKEND_URL ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  output: "standalone",
  env: {
    NEXT_PUBLIC_APP_VERSION: process.env.npm_package_version,
  },
  // Rutas de la versión anterior (marcadores guardados) → nuevas.
  async redirects() {
    return [
      { source: "/reports/monthly-completion", destination: "/reports/solicitudes-mensual", permanent: true },
      { source: "/reports/monthly-request-summary", destination: "/reports/solicitudes-mensual", permanent: true },
      { source: "/reports/monthly-productivity", destination: "/reports/productividad-mensual", permanent: true },
      { source: "/reports/equipment-ranking", destination: "/reports/ranking-equipos", permanent: true },
      { source: "/reports/user-stats", destination: "/reports/tecnicos", permanent: true },
      { source: "/reports/work-order-summary", destination: "/work-orders", permanent: true },
    ];
  },
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${backend}/api/:path*` },
      { source: "/media/:path*", destination: `${backend}/media/:path*` },
    ];
  },
};

export default nextConfig;
