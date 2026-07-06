import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lese-Bibliotheken serverseitig laden statt bündeln (Vercel-sicher):
  serverExternalPackages: ["unpdf", "mammoth", "exceljs"],
};

export default nextConfig;
