/**
 * OpenADR 3.0 VEN client (REST, polling). Reads programs and events from a VTN, turns each event into a grid
 * signal: window, requested kW reduction or import limit, and the VTN's own ids. It never acts: signals become
 * *proposed* DR events that still need the full approval chain (invariant 2 and the approval chain).
 */
export interface VenConfig {
  vtnUrl: string; // e.g. https://vtn.example/openadr3/3.0.1
  clientId?: string;
  clientSecret?: string;
  /** only events of these program names (empty = all) */
  programs?: string[];
  venName: string;
  fetch?: typeof fetch;
}

interface Interval {
  id: number;
  intervalPeriod?: { start: string; duration: string };
  payloads: Array<{ type: string; values: Array<number | string> }>;
}
export interface OadrEvent {
  id: string;
  programID: string;
  eventName?: string;
  priority?: number;
  intervalPeriod?: { start: string; duration: string };
  payloadDescriptors?: Array<{ payloadType: string; units?: string }>;
  intervals: Interval[];
  modificationDateTime?: string;
}
interface OadrProgram {
  id: string;
  programName: string;
}

export interface GridSignal {
  source: 'openadr' | 'discom_email' | 'manual';
  externalId: string;
  start: Date;
  end: Date;
  targetKw: number | null;
  /** import limit in kW, when the VTN asks for a cap rather than a reduction */
  importLimitKw: number | null;
  program: string | null;
  raw: unknown;
}

/** ISO 8601 duration (PnDTnHnMnS subset) to milliseconds. */
export function durationMs(iso: string): number {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(iso);
  if (!m) throw new Error(`unsupported duration ${iso}`);
  const [, d, h, mi, s] = m;
  return (((Number(d ?? 0) * 24 + Number(h ?? 0)) * 60 + Number(mi ?? 0)) * 60 + Number(s ?? 0)) * 1000;
}

/** Map one OpenADR event to a signal. Window: the union of its intervals (or the event's own period). */
export function toSignal(e: OadrEvent, program: string | null): GridSignal | null {
  const periods = e.intervals
    .map((i) => i.intervalPeriod ?? e.intervalPeriod)
    .filter((p): p is { start: string; duration: string } => !!p);
  if (!periods.length) return null;
  const start = Math.min(...periods.map((p) => Date.parse(p.start)));
  const end = Math.max(...periods.map((p) => Date.parse(p.start) + durationMs(p.duration)));
  if (!Number.isFinite(start) || !(end > start)) return null;
  const values = (type: string) =>
    e.intervals
      .flatMap((i) => i.payloads.filter((p) => p.type === type).flatMap((p) => p.values.map(Number)))
      .filter(Number.isFinite);
  const shed = [...values('LOAD_DISPATCH'), ...values('LOAD_CONTROL_SETPOINT')];
  const limit = values('IMPORT_CAPACITY_LIMIT');
  return {
    source: 'openadr',
    externalId: `${e.id}@${e.modificationDateTime ?? ''}`,
    start: new Date(start),
    end: new Date(end),
    targetKw: shed.length ? Math.max(...shed.map(Math.abs)) : null,
    importLimitKw: limit.length ? Math.min(...limit) : null,
    program,
    raw: e,
  };
}

export class Ven {
  private token: { value: string; until: number } | null = null;
  private readonly f: typeof fetch;
  constructor(private readonly cfg: VenConfig) {
    this.f = cfg.fetch ?? fetch;
  }

  private async auth(): Promise<Record<string, string>> {
    if (!this.cfg.clientId) return {};
    if (this.token && this.token.until > Date.now() + 30_000) return { authorization: `Bearer ${this.token.value}` };
    const r = await this.f(`${this.cfg.vtnUrl}/auth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.cfg.clientId,
        client_secret: this.cfg.clientSecret ?? '',
      }).toString(),
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) throw new Error(`VTN auth ${r.status}`);
    const j = (await r.json()) as { access_token: string; expires_in?: number };
    this.token = { value: j.access_token, until: Date.now() + (j.expires_in ?? 3600) * 1000 };
    return { authorization: `Bearer ${j.access_token}` };
  }

  private async get<T>(path: string): Promise<T> {
    const r = await this.f(`${this.cfg.vtnUrl}${path}`, {
      headers: { accept: 'application/json', ...(await this.auth()) },
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) throw new Error(`VTN ${path} ${r.status}`);
    return (await r.json()) as T;
  }

  /** Current and future events for our programs, as signals. */
  async poll(now = new Date()): Promise<GridSignal[]> {
    const programs = await this.get<OadrProgram[]>('/programs');
    const wanted = programs.filter((p) => !this.cfg.programs?.length || this.cfg.programs.includes(p.programName));
    const out: GridSignal[] = [];
    for (const p of wanted) {
      const events = await this.get<OadrEvent[]>(`/events?programID=${encodeURIComponent(p.id)}`);
      for (const e of events) {
        const s = toSignal(e, p.programName);
        if (s && s.end.getTime() > now.getTime()) out.push(s);
      }
    }
    return out;
  }
}
