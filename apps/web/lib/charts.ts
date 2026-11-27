/** Strata chart options built from API data, following the builders in design/canvas/lib/eoc.js. */
import { blockTime } from './format';

export const C = {
  solar: '#eda100',
  grid: '#2a78d6',
  hp: '#1f9a50',
  ink: '#10231a',
  green: '#1f7a3c',
  amber: '#b4541a',
  red: '#b3261e',
  lilac: '#6a4fb3',
};

export interface DayBlock {
  date: string; // IST YYYY-MM-DD
  blockNo: number;
  gridKwh: number | null;
  solarKwh: number | null;
  forecastKwh?: number | null;
  planKwh?: number | null;
}

/** Supply by source: solar + grid bars per block, forecast and plan lines, floor and sanction as kWh per block. */
export function dayChart(
  rows: DayBlock[],
  opt: {
    pf: number;
    floorKva: number;
    sanctionKva: number;
    title?: string;
    height?: number;
    cards?: boolean;
    bands?: Array<{ start: string; end: string; label: string }>;
  },
) {
  const floor = (opt.floorKva * opt.pf) / 4;
  const sanction = (opt.sanctionKva * opt.pf) / 4;
  return {
    time: 'date',
    data: rows.map((r) => ({
      date: `${r.date}T${blockTime(r.blockNo)}`,
      solar: r.solarKwh ?? 0,
      grid: r.gridKwh ?? 0,
      forecast: r.forecastKwh ?? null,
      plan: r.planKwh ?? null,
      floor,
      sanction,
    })),
    columns: { solar: 'solar', grid: 'grid', forecast: 'forecast', plan: 'plan', floor: 'floor', sanction: 'sanction' },
    series: [
      { key: 'solar', label: 'Solar', color: C.solar },
      { key: 'grid', label: 'Grid', color: C.grid },
      { key: 'forecast', label: 'Grid forecast', type: 'line', dash: '5 4', width: 1.75, color: C.ink },
      { key: 'plan', label: 'Plan with event', type: 'line', width: 2, color: C.green },
      {
        key: 'floor',
        label: `${opt.floorKva} kVA billing floor`,
        type: 'line',
        dash: '1 5',
        width: 2,
        color: C.amber,
        legend: false,
      },
      {
        key: 'sanction',
        label: `${opt.sanctionKva} kVA sanction`,
        type: 'line',
        dash: '6 3',
        width: 1.5,
        color: C.red,
        legend: false,
      },
    ],
    readout: 'band',
    primary: 'total',
    totalLabel: 'Total supply',
    kind: 'energy',
    axisUnit: 'kWh per block',
    title: opt.title ?? 'Supply by source · Globe Medicare',
    heroLabel: 'Supplied in view · grid + solar',
    view: 'day',
    periods: ['hour', 'day'],
    period: 'hour',
    bands: opt.bands ?? [],
    tools: ['table', 'download'],
    height: opt.height ?? 300,
  };
}

export function forecastChart(
  rows: Array<{ date: string; blockNo: number; actual: number | null; p10: number; p50: number; p90: number }>,
  floorKva: number,
  sanctionKva: number,
  range: [string, string],
) {
  return {
    time: 'date',
    data: rows.map((r) => ({
      date: `${r.date}T${blockTime(r.blockNo)}`,
      actual: r.actual,
      p50: r.p50,
      p10: r.p10,
      p90: r.p90,
      floor: floorKva,
      sanction: sanctionKva,
    })),
    columns: { actual: 'actual', p50: 'p50', p10: 'p10', p90: 'p90', floor: 'floor', sanction: 'sanction' },
    series: [
      { key: 'actual', label: 'Metered', color: C.grid },
      { key: 'p50', label: 'Forecast P50', type: 'line', width: 2, color: C.ink },
      { key: 'p90', label: 'P90', type: 'line', dash: '4 4', width: 1.5, color: C.lilac },
      { key: 'p10', label: 'P10', type: 'line', dash: '4 4', width: 1.5, color: '#8fa79a' },
      { key: 'floor', label: `${floorKva} kVA floor`, type: 'line', dash: '1 5', width: 2, color: C.amber },
      { key: 'sanction', label: `${sanctionKva} kVA sanction`, type: 'line', width: 1.5, color: C.red },
    ],
    kind: 'number',
    hero: false,
    axisUnit: 'kVA',
    title: 'Grid demand forecast · next 48 hours',
    readout: 'tooltip',
    view: 'custom',
    views: ['day', 'custom'],
    customRange: range,
    periods: ['hour', 'day'],
    period: 'hour',
    tools: ['table', 'download'],
    height: 300,
    icons: false,
  };
}

export function solarDaily(rows: Array<{ day: string; solarKwh: number }>) {
  return {
    time: 'date',
    data: rows.map((r) => ({ date: r.day, solar: Math.round(r.solarKwh) })),
    columns: { solar: 'solar' },
    series: [{ key: 'solar', label: 'Solar', color: C.solar }],
    kind: 'energy',
    title: 'Rooftop solar · daily yield',
    heroLabel: 'Generated in view',
    periods: ['day', 'week'],
    period: 'day',
    selection: 'latest',
    tools: ['download'],
    height: 220,
    maxBarWidth: 10,
    barWidth: 0.55,
  };
}

export function billedMd(rows: Array<{ month: string; kva: number }>, floorKva: number, sanctionKva: number) {
  return {
    time: 'date',
    data: rows.map((r) => ({ date: r.month, md: r.kva, floor: floorKva, sanction: sanctionKva })),
    columns: { md: 'md', floor: 'floor', sanction: 'sanction' },
    series: [
      { key: 'md', label: 'Billed demand', color: C.ink },
      { key: 'floor', label: `${floorKva} kVA floor`, type: 'line', dash: '1 5', width: 2, color: C.amber },
      { key: 'sanction', label: `${sanctionKva} kVA sanction`, type: 'line', width: 1.5, color: C.red },
    ],
    kind: 'number',
    hero: false,
    axisUnit: 'kVA',
    title: 'Billed maximum demand by bill month',
    periods: ['month', 'quarter'],
    period: 'month',
    tools: ['download'],
    height: 220,
    maxBarWidth: 18,
    barWidth: 0.5,
  };
}

/** One point's 1-minute series as a line. */
export function pointSeries(
  rows: Array<{ ts: string; value: number }>,
  label: string,
  unit: string,
  color = C.grid,
  height = 180,
) {
  return {
    time: 'date',
    data: rows.map((r) => {
      const t = new Date(new Date(r.ts).getTime() + 330 * 60000).toISOString().slice(0, 16);
      return { date: t, v: r.value };
    }),
    columns: { v: 'v' },
    series: [{ key: 'v', label, type: 'line', width: 2, color }],
    kind: 'number',
    hero: false,
    axisUnit: unit,
    title: label,
    readout: 'tooltip',
    view: 'day',
    periods: ['hour'],
    period: 'hour',
    tools: [],
    height,
    icons: false,
  };
}

/** Grid kVA for one IST day: forecast without the plan, with the plan, metered, against the ceiling ladder. */
export function planChart(
  rows: Array<{ date: string; blockNo: number; without: number | null; with: number | null; metered?: number | null }>,
  ladder: { stage1: number; ceiling: number; sanction: number },
  opt: { title: string; band?: { start: string; end: string; label: string }; height?: number },
) {
  return {
    time: 'date',
    data: rows.map((r) => ({
      date: `${r.date}T${blockTime(r.blockNo)}`,
      metered: r.metered ?? null,
      without: r.without,
      with: r.with,
      stage1: ladder.stage1,
      ceiling: ladder.ceiling,
      sanction: ladder.sanction,
    })),
    columns: {
      metered: 'metered',
      without: 'without',
      with: 'with',
      stage1: 'stage1',
      ceiling: 'ceiling',
      sanction: 'sanction',
    },
    series: [
      { key: 'metered', label: 'Metered', color: C.grid },
      { key: 'without', label: 'Forecast without the plan', type: 'line', dash: '5 4', width: 1.75, color: C.ink },
      { key: 'with', label: 'With the plan', type: 'line', width: 2.25, color: C.green },
      { key: 'stage1', label: `Stage 1 at ${ladder.stage1}`, type: 'line', dash: '1 5', width: 2, color: C.amber },
      { key: 'ceiling', label: `Ceiling ${ladder.ceiling}`, type: 'line', dash: '6 3', width: 1.75, color: C.red },
      {
        key: 'sanction',
        label: `Sanction ${ladder.sanction}`,
        type: 'line',
        width: 1.25,
        color: '#7a1b14',
        legend: false,
      },
    ],
    kind: 'number',
    hero: false,
    axisUnit: 'kVA',
    title: opt.title,
    readout: 'tooltip',
    view: 'day',
    periods: ['hour'],
    period: 'hour',
    bands: opt.band ? [opt.band] : [],
    tools: ['table', 'download'],
    height: opt.height ?? 300,
    icons: false,
  };
}
