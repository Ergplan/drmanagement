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

/** Hindi line sent under the English text for each template (reviewed wording to be confirmed with the hospital). */
export const HINDI: Record<string, string> = {
  dr_proposed: 'ergOS ने एक डिमांड रिस्पॉन्स इवेंट प्रस्तावित किया है। कृपया डैशबोर्ड पर जाँच कर स्वीकृति दें।',
  dr_approved: 'फैसिलिटी मैनेजर ने इवेंट स्वीकृत किया है। अगला चरण: चिकित्सा अधीक्षक (HVAC हो तो) और ड्यूटी इंजीनियर।',
  dr_signed: 'चिकित्सा अधीक्षक ने हस्ताक्षर किए हैं। ड्यूटी इंजीनियर कृपया 17:00 से पहले आर्म करें।',
  dr_armed: 'इवेंट आर्म हो गया है। किसी भी इंटरलॉक ट्रिप पर सभी लोड तुरंत बहाल होंगे।',
  dr_aborted: 'इवेंट रोक दिया गया है और सभी लोड बहाल किए जा रहे हैं।',
  dr_rejected: 'इवेंट अस्वीकृत किया गया।',
  escalation: 'इस संदेश की 10 मिनट में पुष्टि नहीं हुई। कृपया तुरंत डैशबोर्ड देखें।',
};

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
  const hi = HINDI[m.template];
  const full = hi ? { ...m, text: `${m.text}\n\n${hi}` } : m;
  for (const u of users) {
    await db.insert(schema.notification).values({
      siteId,
      channel: 'in_app',
      to: u.id,
      template: m.template,
      payload: { ...m.payload, subject: m.subject, text: full.text },
      status: 'delivered',
    });
    const ext = email.enabled() ? email : consoleAdapter;
    let status = 'sent';
    try {
      await ext.send(u.email, full);
    } catch (e) {
      status = `failed: ${(e as Error).message}`;
    }
    await db
      .insert(schema.notification)
      .values({ siteId, channel: ext.channel, to: u.email, template: m.template, payload: m.payload, status });
  }
}

/**
 * Escalation: a proposal or arming request nobody acknowledged within 10 minutes, while the event still waits,
 * goes to jouleWise operations and the facility manager. Runs from the edge's housekeeping call.
 */
export async function escalate(siteId: string): Promise<number> {
  const { db } = getDb();
  const since = new Date(Date.now() - 6 * 3600000);
  const rows = (await db.select().from(schema.notification).where(eq(schema.notification.siteId, siteId))).filter(
    (n) => n.at >= since,
  );
  const events = await db
    .select({ id: schema.drEvent.id, status: schema.drEvent.status })
    .from(schema.drEvent)
    .where(eq(schema.drEvent.siteId, siteId));
  const waiting: Record<string, string[]> = {
    dr_proposed: ['proposed'],
    dr_approved: ['approved'],
    dr_signed: ['signed'],
  };
  let n = 0;
  for (const r of rows) {
    if (r.channel !== 'in_app' || !waiting[r.template] || Date.now() - r.at.getTime() < 10 * 60000) continue;
    const ev = String((r.payload as { eventId?: string }).eventId ?? '');
    const status = events.find((e) => e.id === ev)?.status;
    if (!status || !waiting[r.template]!.includes(status)) continue;
    const acked = rows.some((x) => x.channel === 'ack' && (x.payload as { eventId?: string }).eventId === ev);
    const done = rows.some(
      (x) =>
        x.template === 'escalation' &&
        (x.payload as { eventId?: string; of?: string }).eventId === ev &&
        (x.payload as { of?: string }).of === r.template,
    );
    if (acked || done) continue;
    await notifyRoles(siteId, ['joulewise_ops', 'facility_manager'], {
      template: 'escalation',
      subject: `No acknowledgement in 10 minutes: event ${ev}`,
      text: `The ${r.template.replace('dr_', '')} notice for event ${ev} has not been acknowledged and the event is still ${status}.`,
      payload: { eventId: ev, of: r.template },
    });
    n += 1;
  }
  return n;
}
