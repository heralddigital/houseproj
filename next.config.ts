import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Nothing to override yet. Plan images reach the server through the
  // /api/extract-plan route handler, which streams its body and is not subject
  // to the server-action size limit; the 5MB image cap is enforced in the route
  // itself, where it can return a useful message.
};

export default nextConfig;
