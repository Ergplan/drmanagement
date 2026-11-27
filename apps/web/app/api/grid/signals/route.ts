import { parseDiscomEmail } from '@drm/grid';
import { z } from 'zod';
import { actionHandler, getHandler, HttpError } from '@/lib/api';
import { ingestSignal, listSignals } from '@/lib/grid';

export const dynamic = 'force-dynamic';

export const GET = getHandler(async () => ({
  signals: await listSignals(),
  openadr: Boolean(process.env.OPENADR_VTN_URL),
}));

const Body = z.union([
  z.object({ email: z.string().min(10).max(20000) }),
  z.object({
    start: z.iso.datetime({ offset: true }),
    end: z.iso.datetime({ offset: true }),
    targetKw: z.number().positive().max(1000),
    reference: z.string().min(2).max(80),
  }),
]);

/** DISCOM inbox: paste a notice email (parsed; never guessed) or enter the event by hand. */
export const POST = actionHandler(
  async (req, user) => {
    const b = Body.safeParse(await req.json());
    if (!b.success) throw new HttpError(400, 'send {email} or {start, end, targetKw, reference}');
    const d = b.data;
    const s =
      'email' in d
        ? parseDiscomEmail(d.email)
        : {
            source: 'manual' as const,
            externalId: d.reference,
            start: new Date(d.start),
            end: new Date(d.end),
            targetKw: d.targetKw,
            importLimitKw: null,
            program: 'discom',
            raw: d,
          };
    if (!s) throw new HttpError(422, 'could not read the date and time window from that notice; enter it by hand');
    if (!(s.end > s.start)) throw new HttpError(400, 'end must be after start');
    return { ok: true, ...(await ingestSignal(s, user.id)) };
  },
  ['facility_manager', 'duty_engineer', 'joulewise_ops'],
);
