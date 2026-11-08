import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Load Next.js guidance through the conditional AGENTS.md pointer.
  agentRules: false,
  typescript: {
    // In CI the Verify typecheck step is the type gate, so the build need not repeat it.
    // Vercel and local builds leave the variable unset and keep the check.
    ignoreBuildErrors: process.env.CI_SKIP_BUILD_TYPECHECK === '1',
  },
}

export default nextConfig
