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

export interface SessionUser {
  id: string;
  name: string;
  role: string;
}

/** Wraps a POST handler: signed-in user with one of `roles` (any role when omitted), JSON in and out. */
export function actionHandler<T>(fn: (req: Request, user: SessionUser) => Promise<T>, roles?: readonly string[]) {
  return async (req: Request) => {
    const session = await auth();
    const u = session?.user as { email?: string | null; name?: string | null; role?: string } | undefined;
    if (!u?.email) return Response.json({ error: 'sign in required' }, { status: 401 });
    const user = { id: u.email, name: u.name ?? u.email, role: u.role ?? 'viewer' };
    if (roles && !roles.includes(user.role))
      return Response.json({ error: `needs ${roles.join(' or ')}` }, { status: 403 });
    if (!process.env.DATABASE_URL) return Response.json({ error: 'database not configured' }, { status: 503 });
    try {
      return Response.json(await fn(req, user));
    } catch (e) {
      if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
      console.error(e);
      return Response.json({ error: 'server error' }, { status: 500 });
    }
  };
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
