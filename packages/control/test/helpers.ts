import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { type Actuator, type CommandRecord, Dispatcher, type DrClass } from '../src/dispatcher';
import type { InterlockSpec } from '../src/interlocks';

const REF = fileURLToPath(new URL('../../../reference/', import.meta.url));
export const controlYaml = parse(readFileSync(join(REF, 'control.yaml'), 'utf8'));
export const interlockSpecs = controlYaml.interlocks as InterlockSpec[];

/** Asset classes from reference/assets.yaml plus meter-only nodes from points.yaml */
export function classes(): Record<string, DrClass> {
  const a = parse(readFileSync(join(REF, 'assets.yaml'), 'utf8'));
  const list = (Array.isArray(a) ? a : a.assets) as Array<{ id: string; dr_class: DrClass }>;
  const out: Record<string, DrClass> = Object.fromEntries(list.map((x) => [x.id, x.dr_class]));
  const p = parse(readFileSync(join(REF, 'points.yaml'), 'utf8'));
  for (const n of p.nodes as Array<{ id: string; dr_class: DrClass }>) if (n.dr_class === 'meter') out[n.id] = 'meter';
  return out;
}

export function rig(opts: { healthy?: () => boolean; projected?: () => number } = {}) {
  const calls: Array<{ assetId: string; action: string }> = [];
  const records: CommandRecord[] = [];
  const actuator: Actuator = {
    actuate: (c) => {
      calls.push({ assetId: c.assetId, action: c.action });
      return { ok: true };
    },
  };
  const d = new Dispatcher(
    classes(),
    actuator,
    (r) => records.push(r),
    () => ({ healthy: opts.healthy ? opts.healthy() : true, why: 'OT 2 pressure tripped' }),
    () => ({ projectedKva: opts.projected ? opts.projected() : 400, restoreBelowKva: 520 }),
  );
  return { d, calls, records };
}
