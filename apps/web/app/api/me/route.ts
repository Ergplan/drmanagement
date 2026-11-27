import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

/** The signed-in user's name and role, so screens show only the actions that role may take. */
export async function GET() {
  const s = await auth();
  const u = s?.user as { email?: string | null; name?: string | null; role?: string; admin?: boolean } | undefined;
  if (!u?.email) return Response.json({ error: 'sign in required' }, { status: 401 });
  return Response.json({ id: u.email, name: u.name ?? u.email, role: u.role ?? 'viewer', admin: u.admin === true });
}
