'use client';
import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';

/** Recognisable low-poly equipment, built in code (rule 15: procedural geometry, no copied assets). */
type P = { color?: string };
const M = ({ color = '#c9ced1', metal = 0.3 }: { color?: string; metal?: number }) => (
  <meshStandardMaterial color={color} metalness={metal} roughness={0.55} />
);

const Box = ({
  s,
  p,
  c,
  r,
}: {
  s: [number, number, number];
  p: [number, number, number];
  c?: string;
  r?: [number, number, number];
}) => (
  <mesh position={p} rotation={r} castShadow>
    <boxGeometry args={s} />
    <M color={c} />
  </mesh>
);
const Cyl = ({
  rt,
  h,
  p,
  c,
  r,
  seg = 20,
}: {
  rt: number;
  h: number;
  p: [number, number, number];
  c?: string;
  r?: [number, number, number];
  seg?: number;
}) => (
  <mesh position={p} rotation={r} castShadow>
    <cylinderGeometry args={[rt, rt, h, seg]} />
    <M color={c} />
  </mesh>
);

function Spinner({ p, r = 0.8, speed = 4 }: { p: [number, number, number]; r?: number; speed?: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * speed;
  });
  return (
    <mesh ref={ref} position={p}>
      <boxGeometry args={[r * 2, 0.05, 0.25]} />
      <M color="#3b4248" />
    </mesh>
  );
}

const Cabinet = ({ x = 0, z = 0, c = '#d9dde0' }: { x?: number; z?: number; c?: string }) => (
  <group position={[x, 0, z]}>
    <Box s={[1, 2.1, 0.6]} p={[0, 1.05, 0]} c={c} />
    <Box s={[0.7, 0.4, 0.02]} p={[0, 1.5, 0.31]} c="#2a3238" />
  </group>
);
const Bed = ({ x = 0, z = 0 }: { x?: number; z?: number }) => (
  <group position={[x, 0, z]}>
    <Box s={[0.95, 0.5, 2.05]} p={[0, 0.5, 0]} c="#f4f6f7" />
    <Box s={[0.95, 0.15, 0.5]} p={[0, 0.82, -0.75]} c="#bcd7ee" />
    <Box s={[0.05, 1.6, 0.05]} p={[0.6, 0.8, -0.9]} c="#8a949a" />
    <Box s={[0.35, 0.25, 0.08]} p={[0.6, 1.5, -0.9]} c="#26323a" />
  </group>
);

function SolarArray({ rows = 6, cols = 14 }: { rows?: number; cols?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.35, 0, 0));
    let i = 0;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        m.compose(
          new THREE.Vector3(c * 1.15 - (cols * 1.15) / 2, 0.6, r * 2.4 - rows * 1.2),
          q,
          new THREE.Vector3(1.05, 0.04, 1.9),
        );
        ref.current?.setMatrixAt(i++, m);
      }
    if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
  }, [rows, cols]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, rows * cols]} castShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#1f3b66" metalness={0.6} roughness={0.25} />
    </instancedMesh>
  );
}

export function Equipment({ id }: { id: string } & P) {
  switch (id) {
    case 'ht-meter':
      return (
        <group>
          <Cabinet c="#e8e2c8" />
          <Cabinet x={1.2} c="#e8e2c8" />
          <Box s={[3.2, 0.1, 1.6]} p={[0.6, 2.4, 0]} c="#9aa0a4" />
        </group>
      );
    case 'transformers':
      return (
        <group>
          {[-1.6, 1.6].map((x) => (
            <group key={x} position={[x, 0, 0]}>
              <Box s={[1.8, 1.9, 1.3]} p={[0, 0.95, 0]} c="#7f8a7a" />
              {[-0.6, -0.2, 0.2, 0.6].map((f) => (
                <Box key={f} s={[0.06, 1.5, 1.6]} p={[f, 0.9, 0]} c="#6e786a" />
              ))}
              {[-0.5, 0, 0.5].map((b) => (
                <Cyl key={b} rt={0.08} h={0.6} p={[b, 2.2, 0]} c="#c8b46a" />
              ))}
            </group>
          ))}
        </group>
      );
    case 'lt-main':
    case 'feeders':
      return (
        <group>
          {[-2.2, -1.1, 0, 1.1, 2.2].map((x) => (
            <Cabinet key={x} x={x} c={id === 'lt-main' ? '#d6dbe0' : '#cfd6cc'} />
          ))}
        </group>
      );
    case 'chillers':
      return (
        <group>
          {[-1.6, 1.6].map((z) => (
            <group key={z} position={[0, 0, z]}>
              <Box s={[4.4, 0.3, 1.4]} p={[0, 0.15, 0]} c="#5f6a70" />
              <Cyl rt={0.5} h={3.8} p={[0, 0.8, 0]} r={[0, 0, Math.PI / 2]} c="#4f8ed0" />
              <Cyl rt={0.42} h={3.6} p={[0, 1.65, 0]} r={[0, 0, Math.PI / 2]} c="#7fb2e0" />
              <Box s={[0.8, 1, 0.8]} p={[1.9, 2.2, 0]} c="#d6dbe0" />
            </group>
          ))}
        </group>
      );
    case 'chw-pumps':
      return (
        <group>
          {[-2.1, -0.7, 0.7, 2.1].map((x) => (
            <group key={x} position={[x, 0, 0]}>
              <Box s={[0.9, 0.2, 0.5]} p={[0, 0.1, 0]} c="#5f6a70" />
              <Cyl rt={0.22} h={0.5} p={[-0.15, 0.45, 0]} r={[0, 0, Math.PI / 2]} c="#2e7bc7" />
              <Cyl rt={0.18} h={0.45} p={[0.25, 0.45, 0]} r={[0, 0, Math.PI / 2]} c="#3c4a56" />
              <Cyl rt={0.1} h={2.2} p={[-0.15, 1.6, 0]} c="#9fb5c8" />
            </group>
          ))}
        </group>
      );
    case 'ups':
      return (
        <group>
          {[-1.5, -0.5, 0.5, 1.5].map((x) => (
            <Cabinet key={x} x={x} c="#2f3a42" />
          ))}
          <Box s={[4, 1.2, 0.7]} p={[0, 0.6, 1.4]} c="#4d5960" />
        </group>
      );
    case 'dg':
      return (
        <group>
          <Box s={[4, 2, 1.6]} p={[0, 1, 0]} c="#e4b33a" />
          <Cyl rt={0.15} h={1.6} p={[1.6, 2.6, 0]} c="#555" />
          <Box s={[0.9, 2, 0.6]} p={[2.8, 1, 0]} c="#d9dde0" />
        </group>
      );
    case 'medgas':
      return (
        <group>
          {Array.from({ length: 8 }, (_, i) => `c${i}`).map((k, i) => (
            <Cyl
              key={k}
              rt={0.13}
              h={1.5}
              p={[(i % 4) * 0.35 - 0.5, 0.75, Math.floor(i / 4) * 0.35]}
              c={i % 2 ? '#e6e9eb' : '#2b2f33'}
            />
          ))}
          <Box s={[1.6, 1.2, 0.7]} p={[1.6, 0.6, 0]} c="#c9d2d8" />
        </group>
      );
    case 'stp-ro':
      return (
        <group>
          <Cyl rt={1} h={2.4} p={[-1.4, 1.2, 0]} c="#7fa7c2" />
          <Cyl rt={0.3} h={1.8} p={[0.4, 0.9, 0]} c="#e6e9eb" />
          <Cyl rt={0.3} h={1.8} p={[1.1, 0.9, 0]} c="#e6e9eb" />
        </group>
      );
    case 'laundry':
      return (
        <group>
          {[-2.4, -1.2, 0, 1.2, 2.4].map((x) => (
            <group key={x} position={[x, 0, 0]}>
              <Box s={[1, 1.3, 1]} p={[0, 0.65, 0]} c="#eef1f3" />
              <Cyl rt={0.3} h={0.05} p={[0, 0.75, 0.52]} r={[Math.PI / 2, 0, 0]} c="#2a3238" />
            </group>
          ))}
        </group>
      );
    case 'kitchen':
      return (
        <group>
          <Box s={[4, 0.9, 0.9]} p={[0, 0.45, 0]} c="#c9ced1" />
          <Box s={[4, 0.6, 0.9]} p={[0, 2.2, 0]} c="#9aa0a4" />
          {[-1.4, -0.4, 0.6, 1.6].map((x) => (
            <Cyl key={x} rt={0.2} h={0.3} p={[x, 1.05, 0]} c="#3a3f44" />
          ))}
        </group>
      );
    case 'emergency':
    case 'icu':
    case 'ward':
    case 'isolation':
      return (
        <group>
          {[-2.4, 0, 2.4].map((x) => (
            <Bed key={x} x={x} />
          ))}
          {id === 'isolation' ? <Box s={[1.2, 2.2, 0.1]} p={[0, 1.1, 1.7]} c="#b9a9e8" /> : null}
        </group>
      );
    case 'opd-ahu':
      return (
        <group>
          <Box s={[3.6, 1.8, 1.6]} p={[0, 0.9, 0]} c="#c3ccd2" />
          <Box s={[1, 0.6, 3]} p={[1.2, 2.6, -1]} c="#aab4ba" />
          <Box s={[3.6, 0.1, 1.6]} p={[0, 1.85, 0]} c="#8b969d" />
        </group>
      );
    case 'imaging':
      return (
        <group>
          <mesh position={[-1.6, 1.2, 0]} castShadow>
            <torusGeometry args={[0.85, 0.42, 16, 32]} />
            <M color="#eef1f3" />
          </mesh>
          <Box s={[0.6, 0.6, 2.2]} p={[-1.6, 0.6, 1]} c="#dfe4e7" />
          <mesh position={[1.6, 1.1, 0]} castShadow>
            <torusGeometry args={[0.7, 0.22, 12, 28]} />
            <M color="#d6dce0" />
          </mesh>
          <Box s={[0.5, 0.6, 2]} p={[1.6, 0.55, 0.9]} c="#dfe4e7" />
        </group>
      );
    case 'cathlab':
      return (
        <group>
          <mesh position={[0, 1.5, 0]} rotation={[0, 0, Math.PI / 2]}>
            <torusGeometry args={[1, 0.08, 8, 24, Math.PI * 1.2]} />
            <M color="#d6dce0" />
          </mesh>
          <Box s={[0.6, 0.9, 2.2]} p={[0, 0.45, 0]} c="#eef1f3" />
        </group>
      );
    case 'ot':
      return (
        <group>
          <Box s={[0.7, 0.9, 2]} p={[0, 0.45, 0]} c="#cfe3d9" />
          <Cyl rt={0.5} h={0.12} p={[0, 2.6, 0]} c="#f3f5f6" />
          <Cyl rt={0.03} h={1} p={[0, 3.1, 0]} c="#9aa0a4" />
        </group>
      );
    case 'admin-lighting':
      return (
        <group>
          {[-1.5, 0, 1.5].map((x) => (
            <group key={x}>
              <Box s={[1.2, 0.75, 0.7]} p={[x, 0.375, 0]} c="#c7a57a" />
              <Box s={[0.9, 0.04, 0.5]} p={[x, 3.3, 0]} c="#fff8d8" />
            </group>
          ))}
        </group>
      );
    case 'solar':
      return <SolarArray />;
    case 'heatpumps':
      return (
        <group>
          {[-1.2, 1.2].map((x) => (
            <group key={x} position={[x, 0, 0]}>
              <Box s={[1.8, 1.4, 1]} p={[0, 0.7, 0]} c="#e7ece9" />
              <Spinner p={[0, 1.45, 0]} r={0.55} />
            </group>
          ))}
        </group>
      );
    case 'hw-tanks':
      return (
        <group>
          <Cyl rt={1} h={3.2} p={[-1.2, 1.6, 0]} c="#d8dee2" />
          <Cyl rt={1} h={3.2} p={[1.2, 1.6, 0]} c="#d8dee2" />
        </group>
      );
    case 'cooling-towers':
      return (
        <group>
          {[-1.6, 1.6].map((x) => (
            <group key={x} position={[x, 0, 0]}>
              <Box s={[2.6, 2.4, 2.6]} p={[0, 1.2, 0]} c="#b9c3c9" />
              <Cyl rt={1} h={0.4} p={[0, 2.6, 0]} c="#9aa6ad" />
              <Spinner p={[0, 2.85, 0]} r={0.9} speed={3} />
            </group>
          ))}
        </group>
      );
    case 'ev':
      return (
        <group>
          {[-1.6, 1.6].map((x) => (
            <group key={x} position={[x, 0, 0]}>
              <Box s={[0.4, 1.5, 0.3]} p={[0, 0.75, 1.4]} c="#1f9a50" />
              <Box s={[1.8, 1.1, 4]} p={[0, 0.6, -1]} c={x < 0 ? '#ffffff' : '#90a4b8'} />
            </group>
          ))}
        </group>
      );
    default:
      return <Cabinet />;
  }
}
