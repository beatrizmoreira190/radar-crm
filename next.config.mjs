/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      { source: '/app', destination: '/crm' },
      { source: '/app/:path*', destination: '/crm/:path*' },
    ];
  },
};
export default nextConfig;
