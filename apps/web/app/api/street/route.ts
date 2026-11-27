import { getDb, schema } from '@drm/db';
import { eq } from 'drizzle-orm';
import { getHandler, SITE_ID } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** Everything the 3D tour needs to build the scene: building, floors, nodes with points, and what each asset does. */
export const GET = getHandler(async () => {
  const { db } = getDb();
  const [site] = await db.select().from(schema.site).where(eq(schema.site.id, SITE_ID));
  const floors = await db.select().from(schema.floor).where(eq(schema.floor.siteId, SITE_ID));
  const nodes = await db.select().from(schema.node).where(eq(schema.node.siteId, SITE_ID));
  const points = await db.select().from(schema.point);
  const assets = await db.select().from(schema.asset).where(eq(schema.asset.siteId, SITE_ID));
  const f = (site?.facts ?? {}) as {
    building?: { footprint: { width_x: number; depth_z: number }; floor_height_m: number };
    solar?: { kwp?: number };
  };
  return {
    building: f.building ?? null,
    floors: floors
      .map((x) => ({ id: x.id, level: x.level, name: x.name, uses: x.uses as string[] }))
      .sort((a, b) => a.level - b.level),
    nodes: nodes.map((n) => ({
      id: n.id,
      floorId: n.floorId,
      title: n.title,
      drClass: n.drClass,
      assetId: n.assetId,
      pos: n.pos as [number, number],
      look: n.look,
      note: n.note,
      driverLater: n.driverLater,
      points: points.filter((p) => p.nodeId === n.id).map((p) => ({ id: p.id, kind: p.kind, unit: p.unit })),
    })),
    assets: assets.map((a) => ({
      id: a.id,
      name: a.name,
      drClass: a.drClass,
      action: (a.limits as { action?: string }).action ?? null,
      never: (a.limits as { never?: string }).never ?? null,
    })),
  };
});
