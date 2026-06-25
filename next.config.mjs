/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

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
      // MSDB public host — serves outline `download_url` streaming routes.
      // Used in <a href> (not next/image), so this is defensive in case a
      // course asset URL ever points here directly.
      { protocol: 'https', hostname: 'msdb.9expert.app', pathname: '/**' },
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

  async headers() {
    const securityHeaders = [
      // Start CSP in Report-Only mode first — switch to enforcing after
      // verifying no violations in Vercel logs (change key to
      // 'Content-Security-Policy' when ready to enforce).
      {
        key: 'Content-Security-Policy-Report-Only',
        value: [
          "default-src 'self'",
          "img-src 'self' https://res.cloudinary.com https://ddva7xvdt.res.cloudinary.com https://9expert-cdn.s3.ap-southeast-1.amazonaws.com https://www.9experttraining.com https://9experttraining.com https://9exp-sec.com https://msdb.9expert.app https://i.ytimg.com https://cdn.jsdelivr.net data: blob:",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.omise.co https://www.youtube.com https://www.googletagmanager.com",
          "style-src 'self' 'unsafe-inline'",
          "font-src 'self' data:",
          "frame-src https://www.youtube.com https://www.youtube-nocookie.com",
          "connect-src 'self' https://api.omise.co https://9exp-sec.com https://msdb.9expert.app https://res.cloudinary.com",
          "media-src 'self' blob:",
          "frame-ancestors 'self'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join('; '),
      },
      { key: 'X-Frame-Options',          value: 'SAMEORIGIN' },
      { key: 'X-Content-Type-Options',   value: 'nosniff' },
      { key: 'Referrer-Policy',          value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy',       value: 'camera=(), microphone=(), geolocation=()' },
      {
        key: 'Strict-Transport-Security',
        value: 'max-age=63072000; includeSubDomains; preload',
      },
    ];

    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
