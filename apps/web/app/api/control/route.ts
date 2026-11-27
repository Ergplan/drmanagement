import { getDb, schema } from '@drm/db';
import { and, desc, eq, gte } from 'drizzle-orm';
import { getHandler, SITE_ID } from '@/lib/api';
import { siteControl } from '@/lib/site';

export const dynamic = 'force-dynamic';

/** Edge control state (interlocks, active curtailment, heat pumps, running intents) plus the recent record. */
export const GET = getHandler(async () => {
  const { db } = getDb();
  const since = new Date(Date.now() - 7 * 86400000);
  const [device] = await db.select().from(schema.device).where(eq(schema.device.siteId, SITE_ID)).limit(1);
  const [site] = await db.select({ facts: schema.site.facts }).from(schema.site).where(eq(schema.site.id, SITE_ID));
  const [ceiling] = await db.select().from(schema.ceilingState).where(eq(schema.ceilingState.siteId, SITE_ID));
  const interlocks = await db.select().from(schema.interlock).where(eq(schema.interlock.siteId, SITE_ID));
  const commands = await db
    .select()
    .from(schema.command)
    .where(and(eq(schema.command.siteId, SITE_ID), gte(schema.command.sentAt, since)))
    .orderBy(desc(schema.command.sentAt))
    .limit(60);
  const actions = await db
    .select()
    .from(schema.ceilingAction)
    .where(and(eq(schema.ceilingAction.siteId, SITE_ID), gte(schema.ceilingAction.at, since)))
    .orderBy(desc(schema.ceilingAction.at))
    .limit(60);
  const trips = await db
    .select()
    .from(schema.interlockEvent)
    .where(gte(schema.interlockEvent.at, since))
    .orderBy(desc(schema.interlockEvent.at))
    .limit(60);
  const audit = await db
    .select()
    .from(schema.auditLog)
    .where(gte(schema.auditLog.at, since))
    .orderBy(desc(schema.auditLog.at))
    .limit(40);
  const health = (device?.health ?? {}) as {
    live?: {
      control?: unknown;
      projectedKva?: number;
      kva?: number;
      blockNo?: number;
      blockElapsedMin?: number;
      at?: string;
    } | null;
  };
  const ageS = device?.lastSeen ? (Date.now() - new Date(device.lastSeen).getTime()) / 1000 : null;
  const f = site?.facts as { control?: { ceiling?: unknown; heat_pumps?: unknown } } | undefined;
  return {
    edge: { online: ageS !== null && ageS < 60, ageS },
    live: health.live ?? null,
    control: health.live?.control ?? null,
    ceiling: ceiling ?? null,
    ladder: (await siteControl(SITE_ID)).ladder,
    rules: f?.control?.ceiling ?? null,
    heatPumps: f?.control?.heat_pumps ?? null,
    interlocks: interlocks.map((i) => ({ id: i.id, name: i.name, limit: i.limitText })),
    commands,
    ceilingActions: actions,
    interlockEvents: trips,
    audit,
  };
});
