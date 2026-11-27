import { getDb, schema } from '@drm/db';
import { eq } from 'drizzle-orm';

/**
 * Notification adapters (locked decision: email via Resend, WhatsApp/SMS adapters with a console fallback until
 * keys exist, in-app). Every send is an append-only `notification` row with its status.
 */
export interface Message {
  template: string;
  subject: string;
  text: string;
  payload: Record<string, unknown>;
}

interface Adapter {
  channel: string;
  enabled: () => boolean;
  send: (to: string, m: Message) => Promise<void>;
}

const email: Adapter = {
  channel: 'email',
  enabled: () => Boolean(process.env.RESEND_API_KEY && process.env.NOTIFY_FROM),
  send: async (to, m) => {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: process.env.NOTIFY_FROM, to, subject: m.subject, text: m.text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) throw new Error(`resend ${r.status}`);
  },
};
const consoleAdapter: Adapter = {
  channel: 'console',
  enabled: () => true,
  send: async (to, m) => console.log(JSON.stringify({ notify: m.template, to, subject: m.subject })),
};

/** Who hears about each step of a DR event, by role. */
export const ROUTING: Record<string, string[]> = {
  proposed: ['facility_manager'],
  approved: ['medical_superintendent', 'duty_engineer'],
  signed: ['duty_engineer'],
  armed: ['facility_manager', 'medical_superintendent', 'duty_engineer'],
  aborted: ['facility_manager', 'medical_superintendent', 'duty_engineer', 'joulewise_ops'],
  rejected: ['facility_manager', 'joulewise_ops'],
};

export async function notifyRoles(siteId: string, roles: string[], m: Message): Promise<void> {
  const { db } = getDb();
  const users = (await db.select().from(schema.appUser).where(eq(schema.appUser.siteId, siteId))).filter(
    (u) => u.active && roles.includes(u.role),
  );
  for (const u of users) {
    await db.insert(schema.notification).values({
      siteId,
      channel: 'in_app',
      to: u.id,
      template: m.template,
      payload: { ...m.payload, subject: m.subject, text: m.text },
      status: 'delivered',
    });
    const ext = email.enabled() ? email : consoleAdapter;
    let status = 'sent';
    try {
      await ext.send(u.email, m);
    } catch (e) {
      status = `failed: ${(e as Error).message}`;
    }
    await db
      .insert(schema.notification)
      .values({ siteId, channel: ext.channel, to: u.email, template: m.template, payload: m.payload, status });
  }
}
