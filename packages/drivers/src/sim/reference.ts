import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

/** Reference data the simulator is built from (repo /reference, or REFERENCE_DIR in containers). */
const here = dirname(fileURLToPath(import.meta.url));
export const REF_DIR = process.env.REFERENCE_DIR ?? join(here, '..', '..', '..', '..', 'reference');

// biome-ignore lint/suspicious/noExplicitAny: reference files are shaped by hand and checked by the calibration tests
const yaml = (f: string): any => parse(readFileSync(join(REF_DIR, f), 'utf8'));
// biome-ignore lint/suspicious/noExplicitAny: as above
const json = (f: string): any => JSON.parse(readFileSync(join(REF_DIR, f), 'utf8'));

export interface AssetRef {
  id: string;
  name: string;
  dr_class: string;
  rated_flex_kw: number;
  hourly_profile_kw_nov: number[];
  response_time: string;
}

export function loadReference() {
  const assets = yaml('assets.yaml').assets as AssetRef[];
  const points = yaml('points.yaml').nodes as Array<{
    id: string;
    points: string[];
    asset: string | null;
    dr_class: string;
  }>;
  const profiles = json('modelled-profiles.json');
  const targets = yaml('calibration-targets.yaml');
  let calibration: Record<string, { base: number; cool: number }> = {};
  try {
    calibration = json('calibration.json').months;
  } catch {
    calibration = {};
  }
  return { assets, points, profiles, targets, calibration };
}

export type Reference = ReturnType<typeof loadReference>;
