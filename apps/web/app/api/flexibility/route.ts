import { flexAssets, getDb, latestReadings, schema } from '@drm/db';
import { eq } from 'drizzle-orm';
import { getHandler, SITE_ID } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** Flexibility registry: every asset with its class, seasonal relief, limits, equipment and live kW. */
export const GET = getHandler(async () => {
  const { db } = getDb();
  const assets = await db.select().from(schema.asset).where(eq(schema.asset.siteId, SITE_ID));
  const equipment = await db.select().from(schema.equipment);
  const nodes = await db.select().from(schema.node).where(eq(schema.node.siteId, SITE_ID));
  const month = Number(new Date(Date.now() + 330 * 60000).toISOString().slice(5, 7));
  const flex = new Map((await flexAssets(db, SITE_ID, month)).map((f) => [f.id, f]));
  const kwPoints = nodes.filter((n) => n.assetId).map((n) => `${n.id}.kw`);
  const want = new Set(kwPoints);
  const latest = new Map((await latestReadings(db)).filter((r) => want.has(r.pointId)).map((r) => [r.pointId, r]));
  return {
    month,
    assets: assets.map((a) => {
      const own = nodes.filter((n) => n.assetId === a.id);
      const kw = own.reduce((s, n) => s + (latest.get(`${n.id}.kw`)?.value ?? 0), 0);
      const seen = own.some((n) => latest.has(`${n.id}.kw`));
      return {
        id: a.id,
        name: a.name,
        drClass: a.drClass,
        ratedFlexKw: a.ratedFlexKw,
        flexKwNow: flex.get(a.id)?.flexKw ?? 0,
        limits: a.limits,
        authority: a.authority,
        interlock: a.interlock,
        profile: a.profile,
        nodes: own.map((n) => ({ id: n.id, title: n.title })),
        kwNow: seen ? kw : null,
        equipment: equipment.filter((e) => e.assetId === a.id).map((e) => ({ name: e.name, rating: e.rating })),
      };
    }),
  };
});
