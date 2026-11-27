import { getDb, schema } from '@drm/db';
import { and, eq, gte } from 'drizzle-orm';
import { z } from 'zod';
import { actionHandler, HttpError } from '@/lib/api';
import { ask } from '@/lib/assistant/ask';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Ask ergOS: read-only answers from site data, with the screen that shows each figure. 30 questions an hour a user. */
export const POST = actionHandler(async (req, user) => {
  const b = z.object({ question: z.string().min(3).max(500) }).safeParse(await req.json());
  if (!b.success) throw new HttpError(400, 'ask a question of 3 to 500 characters');
  if (!process.env.ASSISTANT_API_KEY)
    throw new HttpError(503, 'Ask ergOS is not switched on yet (needs ASSISTANT_API_KEY in Vercel)');
  const recent = await getDb()
    .db.select({ id: schema.assistantCall.id })
    .from(schema.assistantCall)
    .where(and(eq(schema.assistantCall.userId, user.id), gte(schema.assistantCall.at, new Date(Date.now() - 3600000))));
  if (recent.length >= 30) throw new HttpError(429, 'question limit reached for this hour');
  try {
    return await ask(b.data.question, user.id);
  } catch (e) {
    throw new HttpError(502, `Ask ergOS could not answer: ${(e as Error).message.slice(0, 120)}`);
  }
});
