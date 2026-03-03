/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@creativeid/api', '@creativeid/db', '@creativeid/types'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.r2.dev',
      },
      {
        protocol: 'https',
        hostname: 'img.clerk.com',
      },
    ],
  },
};

export default nextConfig;
