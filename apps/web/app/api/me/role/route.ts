import { z } from 'zod';
import { auth, ROLES, unstable_update } from '@/auth';

export const dynamic = 'force-dynamic';

/** Demo admin only (DEMO_ADMIN=1): switch the role this session acts as. */
export async function POST(req: Request) {
  const s = await auth();
  const u = s?.user as { admin?: boolean } | undefined;
  if (!u?.admin || process.env.DEMO_ADMIN !== '1') return Response.json({ error: 'not allowed' }, { status: 403 });
  const b = z.object({ role: z.enum(ROLES) }).safeParse(await req.json());
  if (!b.success) return Response.json({ error: 'unknown role' }, { status: 400 });
  await unstable_update({ role: b.data.role } as never);
  return Response.json({ ok: true, role: b.data.role });
}
