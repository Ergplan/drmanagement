'use client';
import { Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import type { StreetNode } from './types';

/**
 * Energy made visible: animated lines from the main meter through the LT panel to each load (grid blue), from the
 * roof solar down to the LT panel (amber) and to the heat pumps (green). Width and speed follow kW.
 */
export function Flows({
  nodes,
  at,
  kw,
  curtailed,
  maxLevelY,
  motion,
}: {
  nodes: StreetNode[];
  at: (n: StreetNode) => [number, number, number];
  kw: (n: StreetNode) => number;
  curtailed: Set<string>;
  maxLevelY: number;
  motion: boolean;
}) {
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const meter = byId.get('ht-meter');
  const lt = byId.get('lt-main');
  const solar = byId.get('solar');
  if (!meter || !lt) return null;
  const tray = (a: [number, number, number], b: [number, number, number]): [number, number, number][] => [
    [a[0], a[1] + 3.4, a[2]],
    [a[0], a[1] + 3.4, 13],
    [b[0], a[1] + 3.4, 13],
    [b[0], b[1] + 3.4, 13],
    [b[0], b[1] + 3.4, b[2]],
  ];
  const lines: Array<{ key: string; pts: [number, number, number][]; color: string; kw: number }> = [];
  lines.push({ key: 'incomer', pts: tray(at(meter), at(lt)), color: '#2a78d6', kw: Math.max(50, kw(meter)) });
  for (const n of nodes) {
    if (!n.assetId || n.id === 'solar') continue;
    const p = at(n);
    if (p[1] > maxLevelY + 0.1) continue;
    const color = curtailed.has(n.assetId)
      ? '#e0901c'
      : n.id === 'heatpumps' || n.id === 'hw-tanks'
        ? '#1f9a50'
        : '#2a78d6';
    lines.push({ key: n.id, pts: tray(at(lt), p), color, kw: kw(n) });
  }
  if (solar && at(solar)[1] <= maxLevelY + 0.1)
    lines.push({ key: 'solar', pts: tray(at(solar), at(lt)), color: '#eda100', kw: kw(solar) });
  return (
    <group>
      {lines.map((l) => (
        <Flow key={l.key} pts={l.pts} color={l.color} kw={l.kw} motion={motion} />
      ))}
    </group>
  );
}

function Flow({
  pts,
  color,
  kw,
  motion,
}: {
  pts: [number, number, number][];
  color: string;
  kw: number;
  motion: boolean;
}) {
  const ref = useRef<{ material: { dashOffset: number } } | null>(null);
  const width = 1 + Math.min(6, kw / 25);
  useFrame((_, dt) => {
    if (motion && ref.current) ref.current.material.dashOffset -= dt * (0.6 + Math.min(4, kw / 60));
  });
  return (
    <Line
      ref={ref as never}
      points={pts}
      color={color}
      lineWidth={width}
      dashed
      dashSize={0.8}
      gapSize={0.5}
      transparent
      opacity={kw > 0.5 ? 0.85 : 0.25}
    />
  );
}
