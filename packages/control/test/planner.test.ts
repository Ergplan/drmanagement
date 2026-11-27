import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { type FlexAsset, plan, seasonalFlexKw } from '../src/planner';

const assetsYaml = parse(
  readFileSync(fileURLToPath(new URL('../../../reference/assets.yaml', import.meta.url)), 'utf8'),
).assets;
const hrs = (s: unknown) => (typeof s === 'string' && /^[\d.]+ h$/.test(s) ? Number.parseFloat(s) : null);
const assets = (month: number): FlexAsset[] =>
  assetsYaml.map(
    (a: {
      id: string;
      name: string;
      dr_class: string;
      flex_kw: { nov_evening: number; jun_evening: number };
      max_duration: string;
      rebound: string;
    }) => ({
      id: a.id,
      name: a.name,
      drClass: a.dr_class,
      flexKw: seasonalFlexKw(a.flex_kw, month),
      maxDurationH: hrs(a.max_duration),
      responseMin: null,
      rebound: a.rebound,
    }),
  );
const curve = (peak: number) => Array.from({ length: 96 }, (_, k) => (k >= 70 && k < 80 ? peak : 420));

describe('DR planner', () => {
  it('never puts a protected, critical or meter asset in a plan, even with an impossible target', () => {
    for (const month of [1, 6, 11]) {
      const p = plan({
        forecastKva: curve(600),
        startBlock: 71,
        endBlock: 80,
        targetKw: 10_000,
        assets: assets(month),
        ceilingKva: 570,
      });
      const bad = p.actions.filter(
        (a) =>
          !['flexible', 'conditional'].includes(assetsYaml.find((x: { id: string }) => x.id === a.assetId).dr_class),
      );
      expect(bad).toEqual([]);
      expect(p.excluded.map((e) => e.id).sort()).toEqual(
        expect.arrayContaining(['clinicalhvac', 'icu', 'imaging', 'medgas']),
      );
      expect(p.meetsTarget).toBe(false);
    }
  });
  it('a 60 kW November evening uses flexible loads before HVAC', () => {
    const p = plan({
      forecastKva: curve(540),
      startBlock: 71,
      endBlock: 80,
      targetKw: 40,
      assets: assets(11),
      ceilingKva: 570,
    });
    expect(p.actions.map((a) => a.assetId)).toEqual(['laundry', 'pump', 'ev']);
    expect(p.needsMedicalSuperintendent).toBe(false);
    expect(p.plannedPeakKva).toBeLessThan(p.forecastPeakKva!);
  });
  it('June evening adds chiller reset and asks the medical superintendent; pre-charges hot water', () => {
    const p = plan({
      forecastKva: curve(610),
      startBlock: 71,
      endBlock: 78,
      targetKw: 120,
      assets: assets(6),
      ceilingKva: 570,
    });
    expect(p.actions.map((a) => a.assetId)).toContain('chiller');
    expect(p.actions.find((a) => a.assetId === 'chiller')?.action).toBe('setpoint');
    expect(p.needsMedicalSuperintendent).toBe(true);
    expect(p.precondition?.actions[0]?.assetId).toBe('heatpump');
  });
  it('skips loads that cannot hold for the whole window', () => {
    const p = plan({
      forecastKva: curve(540),
      startBlock: 69,
      endBlock: 80,
      targetKw: 200,
      assets: assets(6),
      ceilingKva: 570,
    });
    expect(p.skipped.map((s) => s.id)).toEqual(expect.arrayContaining(['chiller', 'ahu', 'laundry']));
  });
});
