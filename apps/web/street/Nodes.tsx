'use client';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type * as THREE from 'three';
import { Equipment } from './Equipment';
import { CLASS_COLOR } from './layout';
import type { StreetNode } from './types';

/** A stop: its equipment, a floating pin in its DR class colour, and a label. Curtailed loads pulse amber. */
export function NodeStop({
  n,
  at,
  selected,
  curtailed,
  onSelect,
  motion,
  label,
}: {
  n: StreetNode;
  at: [number, number, number];
  selected: boolean;
  curtailed: boolean;
  onSelect: (id: string) => void;
  motion: boolean;
  label: boolean;
}) {
  const pin = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!motion) return;
    const t = clock.getElapsedTime();
    if (pin.current) pin.current.position.y = 4.1 + Math.sin(t * 2 + at[0]) * 0.12;
    if (ring.current) {
      const s = curtailed ? 1 + 0.25 * Math.sin(t * 5) : 1;
      ring.current.scale.set(s, s, s);
    }
  });
  const color = curtailed ? '#e0901c' : (CLASS_COLOR[n.drClass] ?? '#2a78d6');
  return (
    <group position={at}>
      <group rotation-y={(-n.look * Math.PI) / 180}>
        <Equipment id={n.id} />
      </group>
      <mesh ref={ring} rotation-x={-Math.PI / 2} position={[0, 0.03, 0]}>
        <ringGeometry args={[2.6, 2.9, 40]} />
        <meshBasicMaterial color={color} transparent opacity={selected ? 0.9 : 0.45} />
      </mesh>
      <group
        ref={pin}
        position={[0, 4.1, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(n.id);
        }}
      >
        <mesh>
          <sphereGeometry args={[selected ? 0.42 : 0.32, 20, 16]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
        </mesh>
        {n.drClass === 'protected' || n.drClass === 'critical' ? (
          <mesh position={[0, -0.55, 0]}>
            <octahedronGeometry args={[0.22]} />
            <meshStandardMaterial color={color} />
          </mesh>
        ) : null}
        {label || selected ? (
          <Html center position={[0, 0.85, 0]} zIndexRange={[5, 0]}>
            <button
              type="button"
              className={`st-label${selected ? ' on' : ''}`}
              onClick={() => onSelect(n.id)}
              style={{ borderColor: color }}
            >
              {n.title}
            </button>
          </Html>
        ) : null}
      </group>
    </group>
  );
}

/** Floor chevrons that point from the current stop to the next one on the route; click to glide there. */
export function Chevron({
  from,
  to,
  onGo,
}: {
  from: [number, number, number];
  to: [number, number, number];
  onGo: () => void;
}) {
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const len = Math.hypot(dx, dz) || 1;
  const yaw = Math.atan2(dx, dz);
  const p: [number, number, number] = [from[0] + (dx / len) * 3.6, from[1] + 0.06, from[2] + (dz / len) * 3.6];
  return (
    <group position={p} rotation-y={yaw}>
      {[0, 0.9].map((o) => (
        <mesh
          key={o}
          position={[0, 0, o]}
          rotation-x={-Math.PI / 2}
          onClick={(e) => {
            e.stopPropagation();
            onGo();
          }}
        >
          <circleGeometry args={[0.6, 3]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.9} />
        </mesh>
      ))}
    </group>
  );
}
