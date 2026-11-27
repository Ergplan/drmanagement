import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@drm/contracts', '@drm/domain', '@drm/db'],
  serverExternalPackages: ['@node-rs/argon2', 'postgres'],
  poweredByHeader: false,
};

export default config;
