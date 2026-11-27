import { auth } from '@/auth';

/** Wraps a GET handler: requires a signed-in user, returns JSON, and turns a missing database into a 503. */
export function getHandler<T>(fn: () => Promise<T>) {
  return async () => {
    const session = await auth();
    if (!session?.user) return Response.json({ error: 'sign in required' }, { status: 401 });
    if (!process.env.DATABASE_URL) return Response.json({ error: 'database not configured' }, { status: 503 });
    try {
      return Response.json(await fn(), { headers: { 'cache-control': 'private, max-age=5' } });
    } catch (e) {
      console.error(e);
      return Response.json({ error: 'server error' }, { status: 500 });
    }
  };
}

export const SITE_ID = 'globe-lko';
