/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Remote images: Cloudinary + (future) upstream domains
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: '9expert-cdn.s3.ap-southeast-1.amazonaws.com' },
    ],
  },

  // Redirect "Online" menu to external academy subdomain
  async redirects() {
    return [
      {
        source: '/online-course',
        destination: 'https://academy.9experttraining.com',
        permanent: true,
      },
      {
        source: '/online-course/:path*',
        destination: 'https://academy.9experttraining.com/:path*',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
