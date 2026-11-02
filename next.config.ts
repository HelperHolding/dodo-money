import type { NextConfig } from "next";
import { encabezadosSeguridad } from "./lib/seguridad";

const nextConfig: NextConfig = {
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
  async headers() {
    const encabezados = encabezadosSeguridad({
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      desarrollo: process.env.NODE_ENV !== "production",
    });
    return [{ source: "/:path*", headers: encabezados }];
  },
};

export default nextConfig;
