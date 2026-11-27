'use client';
import { AdaptiveDpr, PerformanceMonitor } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { Suspense, useMemo } from 'react';
import type * as THREE from 'three';
import { Building } from './Building';
import { GlideCamera, Walker } from './Controls';
import { Flows } from './Flows';
import { geometry, ROUTE } from './layout';
import { Chevron, NodeStop } from './Nodes';
import type { LiveState, Mode, StreetData } from './types';

export interface SceneProps {
  d: StreetData;
  mode: Mode;
  selected: string;
  onSelect: (id: string) => void;
  maxLevel: number;
  night: boolean;
  lite: boolean;
  motion: boolean;
  live: LiveState;
  keys: React.RefObject<Set<string>>;
  yaw: React.RefObject<number>;
  onWalk: (p: THREE.Vector3) => void;
  onDecline: () => void;
  onFrame?: (ms: number) => void;
}

export default function Scene(p: SceneProps) {
  const g = useMemo(() => geometry(p.d), [p.d]);
  const sel = p.d.nodes.find((n) => n.id === p.selected) ?? p.d.nodes[0]!;
  const visible = p.d.nodes.filter((n) => (g.level.get(n.floorId) ?? 0) <= p.maxLevel);
  const next = useMemo(() => {
    const i = ROUTE.indexOf(sel.id);
    const id = ROUTE[(i + 1) % ROUTE.length];
    return p.d.nodes.find((n) => n.id === id) ?? null;
  }, [sel.id, p.d.nodes]);
  const kw = (n: (typeof p.d.nodes)[number]) => {
    const pt = n.points.find((x) => x.unit === 'kW' && /kw$/.test(x.id)) ?? n.points.find((x) => x.unit === 'kVA');
    return pt ? (p.live.v(pt.id) ?? 0) : 0;
  };
  const selAt = g.at(sel);
  const overview: [number, number, number] = [g.W / 2, p.maxLevel * g.H * 0.5, g.D / 2];
  return (
    <Canvas
      shadows={!p.lite}
      dpr={p.lite ? 1 : [1, 1.75]}
      camera={{ position: [selAt[0] - 10, selAt[1] + 6, selAt[2] - 12], fov: 55, near: 0.2, far: 600 }}
      gl={{ antialias: !p.lite, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => gl.setClearColor(p.night ? '#0f1a16' : '#e9f0f2')}
      frameloop="always"
    >
      <color attach="background" args={[p.night ? '#0f1a16' : '#e9f0f2']} />
      <fog attach="fog" args={[p.night ? '#0f1a16' : '#e9f0f2', 80, 260]} />
      <PerformanceMonitor onDecline={p.onDecline} />
      <AdaptiveDpr />
      <hemisphereLight
        args={[p.night ? '#3a4a66' : '#ffffff', p.night ? '#10160f' : '#c8d6c4', p.night ? 0.35 : 1.1]}
      />
      <directionalLight
        position={[60, 90, -40]}
        intensity={p.night ? 0.15 : 1.6}
        castShadow={!p.lite}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-70}
        shadow-camera-right={70}
        shadow-camera-top={70}
        shadow-camera-bottom={-70}
      />
      {p.night ? (
        <pointLight position={[selAt[0], selAt[1] + 3.5, selAt[2]]} intensity={40} distance={18} color="#ffe7b0" />
      ) : null}
      <Suspense fallback={null}>
        <Building
          d={p.d}
          maxLevel={p.maxLevel}
          showRooms={!p.lite}
          labelLevel={p.mode === 'dollhouse' ? null : (g.level.get(sel.floorId) ?? null)}
          night={p.night}
        />
        {visible.map((n) => (
          <NodeStop
            key={n.id}
            n={n}
            at={g.at(n)}
            selected={n.id === sel.id}
            curtailed={!!n.assetId && p.live.curtailed.has(n.assetId)}
            onSelect={p.onSelect}
            motion={p.motion}
            label={
              p.mode === 'dollhouse'
                ? (g.level.get(n.floorId) ?? 0) === p.maxLevel
                : (g.level.get(n.floorId) ?? 0) === (g.level.get(sel.floorId) ?? 0)
            }
          />
        ))}
        {!p.lite ? (
          <Flows
            nodes={p.d.nodes}
            at={g.at}
            kw={kw}
            curtailed={p.live.curtailed}
            maxLevelY={p.maxLevel * g.H}
            motion={p.motion}
          />
        ) : null}
        {p.mode === 'tour' && next ? <Chevron from={selAt} to={g.at(next)} onGo={() => p.onSelect(next.id)} /> : null}
        {p.mode === 'walk' ? (
          <Physics gravity={[0, -9.81, 0]}>
            <Walker
              start={selAt}
              keys={p.keys}
              yaw={p.yaw}
              onMove={p.onWalk}
              floorYs={[...new Set(p.d.floors.map((f) => f.level * g.H))]}
              W={g.W}
              D={g.D}
            />
          </Physics>
        ) : (
          <GlideCamera
            target={selAt}
            yawDeg={sel.look}
            mode={p.mode === 'dollhouse' ? 'dollhouse' : 'tour'}
            motion={p.motion}
            overview={overview}
          />
        )}
        {p.onFrame ? <FrameProbe on={p.onFrame} /> : null}
      </Suspense>
    </Canvas>
  );
}

/** Reports frame times for the benchmark (?bench=1). */
function FrameProbe({ on }: { on: (ms: number) => void }) {
  useFrame((_, dt) => on(dt * 1000));
  return null;
}
