import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */

  // Allows loading the dev server from another device on the same
  // Wi-Fi network (e.g. testing on a phone via http://<lan-ip>:3000)
  // without Next.js blocking HMR/hydration as a cross-origin request.
  allowedDevOrigins: ["10.0.0.8"],
};

export default nextConfig;
