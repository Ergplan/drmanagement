/**
 * Heat-pump scheduler (reference/control.yaml `heat_pumps`): soak solar 10:00–15:00, locked off over the evening
 * peak 17:30–22:00, otherwise leave the store to its BMS thermostat. Returns the mode to hold; the runner sends a
 * command through the dispatcher only when the mode changes.
 */
export interface HeatPumpPolicy {
  soakStartMin: number;
  soakEndMin: number;
  lockStartMin: number;
  lockEndMin: number;
  topUpBelowSocPct: number;
}

const hm = (s: string) => {
  const [h, m] = s.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

export function heatPumpPolicyFromYaml(h: {
  solar_soak: { start: string; end: string };
  locked_off: { start: string; end: string };
  standby_top_up_below_soc_pct: number;
}): HeatPumpPolicy {
  return {
    soakStartMin: hm(h.solar_soak.start),
    soakEndMin: hm(h.solar_soak.end),
    lockStartMin: hm(h.locked_off.start),
    lockEndMin: hm(h.locked_off.end),
    topUpBelowSocPct: h.standby_top_up_below_soc_pct,
  };
}

export type HeatPumpMode = 'run' | 'shed' | 'auto';

/** istMinute: minutes since IST midnight. socPct: hot-water store state of charge. */
export function heatPumpMode(
  p: HeatPumpPolicy,
  istMinute: number,
  socPct: number,
): { mode: HeatPumpMode; why: string } {
  if (istMinute >= p.lockStartMin && istMinute < p.lockEndMin) return { mode: 'shed', why: 'evening peak lock-out' };
  if (istMinute >= p.soakStartMin && istMinute < p.soakEndMin)
    return socPct < 95 ? { mode: 'run', why: 'solar soak' } : { mode: 'auto', why: 'store full' };
  if (socPct < p.topUpBelowSocPct) return { mode: 'auto', why: 'standby top-up by thermostat' };
  return { mode: 'auto', why: 'thermostat' };
}
