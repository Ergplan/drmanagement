import { getDb, reportPdf } from '@drm/db';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

/** Download a rendered report: from Vercel Blob when configured, else from the VM database. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await auth())?.user) return Response.json({ error: 'sign in required' }, { status: 401 });
  const { id } = await ctx.params;
  const r = await reportPdf(getDb().db, id);
  if (!r) return Response.json({ error: 'not found' }, { status: 404 });
  if (r.blobUrl) return Response.redirect(r.blobUrl, 302);
  if (!r.pdf) return Response.json({ error: 'not rendered yet' }, { status: 409 });
  const name = `ergos-${r.kind}-${r.periodFrom ?? id}.pdf`;
  return new Response(new Uint8Array(r.pdf), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${name}"`,
      'cache-control': 'private, no-store',
    },
  });
}
