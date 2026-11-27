export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({
    ok: true,
    service: 'drmanagement-web',
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local',
    at: new Date().toISOString(),
  });
}
