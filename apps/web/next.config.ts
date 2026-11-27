import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@drm/contracts', '@drm/domain'],
  poweredByHeader: false,
};

export default config;
