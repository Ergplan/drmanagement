/**
 * The one model module (Stage 7): typed in and out, versioned prompt, retries, one log row per call, key from env.
 * Read-only by construction: the only tools are in tools.ts and none of them writes (invariant 8).
 */
import { getDb, schema } from '@drm/db';
import { PROMPT_VERSION, SYSTEM } from './prompts/ask-ergos.v1';
import { TOOLS } from './tools';

export interface AskResult {
  answer: string;
  tools: string[];
  model: string;
  promptVersion: string;
}

type Block =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> };
interface Msg {
  role: 'user' | 'assistant';
  content: string | Array<Block | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }>;
}

async function call(
  body: unknown,
  key: string,
): Promise<{ content: Block[]; stop_reason: string; usage?: { input_tokens: number; output_tokens: number } }> {
  let wait = 1000;
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(process.env.ASSISTANT_API_URL ?? 'https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45_000),
    });
    if (r.ok) return (await r.json()) as never;
    if (attempt < 2 && (r.status === 429 || r.status >= 500)) {
      await new Promise((x) => setTimeout(x, wait));
      wait *= 3;
      continue;
    }
    throw new Error(`model API ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }
}

export async function ask(question: string, userId: string): Promise<AskResult> {
  const key = process.env.ASSISTANT_API_KEY;
  const model = process.env.ASSISTANT_MODEL ?? 'claude-sonnet-5-5';
  if (!key) throw new Error('Ask ergOS is not configured (ASSISTANT_API_KEY)');
  const t0 = Date.now();
  const used: string[] = [];
  let inTok = 0;
  let outTok = 0;
  const messages: Msg[] = [{ role: 'user', content: question }];
  const tools = TOOLS.map(({ run: _r, ...t }) => t);
  let answer = '';
  let error: string | null = null;
  try {
    for (let round = 0; round < 6; round++) {
      const res = await call({ model, max_tokens: 700, system: SYSTEM, tools, messages }, key);
      inTok += res.usage?.input_tokens ?? 0;
      outTok += res.usage?.output_tokens ?? 0;
      messages.push({ role: 'assistant', content: res.content });
      const uses = res.content.filter((b): b is Extract<Block, { type: 'tool_use' }> => b.type === 'tool_use');
      if (res.stop_reason !== 'tool_use' || !uses.length) {
        answer = res.content
          .filter((b): b is Extract<Block, { type: 'text' }> => b.type === 'text')
          .map((b) => b.text)
          .join('\n')
          .trim();
        break;
      }
      const results = [];
      for (const u of uses) {
        used.push(u.name);
        const t = TOOLS.find((x) => x.name === u.name);
        try {
          results.push({
            type: 'tool_result' as const,
            tool_use_id: u.id,
            content: JSON.stringify(t ? await t.run(u.input ?? {}) : { error: 'no such tool' }).slice(0, 30000),
          });
        } catch (e) {
          results.push({
            type: 'tool_result' as const,
            tool_use_id: u.id,
            content: `error: ${(e as Error).message}`,
            is_error: true,
          });
        }
      }
      messages.push({ role: 'user', content: results });
    }
    if (!answer) answer = 'I could not finish that answer from the data. Please ask it another way.';
    return { answer, tools: used, model, promptVersion: PROMPT_VERSION };
  } catch (e) {
    error = (e as Error).message;
    throw e;
  } finally {
    await getDb()
      .db.insert(schema.assistantCall)
      .values({
        userId,
        promptVersion: PROMPT_VERSION,
        model,
        question: question.slice(0, 2000),
        answer: answer || null,
        tools: used,
        inputTokens: inTok,
        outputTokens: outTok,
        ms: Date.now() - t0,
        error,
      })
      .catch(() => {});
  }
}
