/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Default Server Action body limit is 1 MB. Banner / promotion-banner
  // / instructor-portrait uploads frequently exceed that and surface as
  // either `write ECONNRESET` or `Unexpected end of form` (the request
  // body gets truncated mid-stream and the multipart parser explodes).
  // 25 MB covers typical phone-camera JPEGs (8–15 MB) plus headroom.
  experimental: {
    serverActions: {
      bodySizeLimit: '25mb',
    },
  },

  // Remote images. Add new hostnames here when next/image throws
  // "hostname X is not configured" — Vercel will refuse to optimize
  // any host not in this list.
  images: {
    remotePatterns: [
      // Cloudinary — covers all cloud accounts (cloud_name is in the path)
      { protocol: 'https', hostname: 'res.cloudinary.com', pathname: '/**' },
      // Project-specific Cloudinary subdomain (defensive — the standard
      // res.cloudinary.com pattern above already covers /ddva7xvdt/...)
      { protocol: 'https', hostname: 'ddva7xvdt.res.cloudinary.com', pathname: '/**' },
      // Legacy CDN bucket
      { protocol: 'https', hostname: '9expert-cdn.s3.ap-southeast-1.amazonaws.com', pathname: '/**' },
      // Production site assets — program roadmaps, skill icons from upstream
      { protocol: 'https', hostname: 'www.9experttraining.com', pathname: '/**' },
      { protocol: 'https', hostname: '9experttraining.com', pathname: '/**' },
      // Upstream API host — in case any item URL points here directly
      { protocol: 'https', hostname: '9exp-sec.com', pathname: '/**' },
      // YouTube thumbnails — used by the YouTubeFacade in HeroBannerCarousel
      { protocol: 'https', hostname: 'i.ytimg.com', pathname: '/vi/**' },
    ],
  },

  // Redirect "Online" menu to external academy subdomain.
  // Also redirect the legacy singular /promotion path to /promotions —
  // the placeholder used to live at /promotion, the real list is plural.
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
      {
        source: '/promotion',
        destination: '/promotions',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
