import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

export interface EdgeConfig {
  site: string;
  drivers: Record<string, { type: string; seed?: number; scenario?: string; [k: string]: unknown }>;
  points: { default: string; overrides: Record<string, string> };
}

export function loadConfig(
  path = process.env.EDGE_CONFIG ?? new URL('../edge.config.yaml', import.meta.url).pathname,
): EdgeConfig {
  return parse(readFileSync(path, 'utf8')) as EdgeConfig;
}

export function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') throw new Error(`missing env ${name}`);
  return v;
}
