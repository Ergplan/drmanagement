'use client';
import { Html } from '@react-three/drei';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { StreetData } from './types';

/**
 * Procedural building from reference/building.yaml: slabs per floor, a blue glass curtain wall at the street front
 * with mullions, grey side cladding, the corner tower and the louvred canopy, room zones from each floor's uses.
 * Schematic, not as-built (to be confirmed on the site survey).
 */
export function Building({
  d,
  maxLevel,
  showRooms,
  labelLevel,
  night,
}: {
  d: StreetData;
  maxLevel: number;
  showRooms: boolean;
  labelLevel: number | null;
  night: boolean;
}) {
  const H = d.building?.floor_height_m ?? 4.2;
  const W = d.building?.footprint.width_x ?? 64;
  const D = d.building?.footprint.depth_z ?? 26;
  const inside = d.floors.filter((f) => f.level >= -1 && f.level <= 6 && f.id !== 'HT' && f.id !== 'P');
  return (
    <group>
      {/* site ground and forecourt */}
      <mesh rotation-x={-Math.PI / 2} position={[W / 2, -0.02, D / 2 - 10]} receiveShadow>
        <planeGeometry args={[W + 70, D + 70]} />
        <meshStandardMaterial color={night ? '#1d2a24' : '#dfe6dc'} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[W / 2, -0.01, -9]}>
        <planeGeometry args={[W + 10, 16]} />
        <meshStandardMaterial color={night ? '#2a3530' : '#c9d0cb'} />
      </mesh>
      {/* boundary stone wall */}
      <mesh position={[W / 2, 0.6, -17.5]}>
        <boxGeometry args={[W + 20, 1.2, 0.5]} />
        <meshStandardMaterial color="#b9b2a3" />
      </mesh>
      {/* HT yard pad (west side, outside) */}
      <mesh rotation-x={-Math.PI / 2} position={[-6, 0, 10]}>
        <planeGeometry args={[9, 20]} />
        <meshStandardMaterial color={night ? '#2b2f2c' : '#bfc4bf'} />
      </mesh>
      {inside
        .filter((f) => f.level <= maxLevel)
        .map((f) => (
          <Floor
            key={f.id}
            level={f.level}
            H={H}
            W={W}
            D={D}
            uses={f.uses}
            rooms={showRooms}
            label={labelLevel === f.level}
            night={night}
            isRoof={f.id === 'R'}
          />
        ))}
      {maxLevel >= 0 ? <Facade W={W} H={H} floors={Math.min(6, maxLevel + 1)} night={night} /> : null}
      {maxLevel >= 0 ? (
        <group position={[W / 2, H - 0.2, -2.6]}>
          {/* grey louvred canopy "Globe Healthcare" with the pink flower mark */}
          <mesh castShadow>
            <boxGeometry args={[22, 0.5, 5]} />
            <meshStandardMaterial color="#8d949a" metalness={0.3} roughness={0.5} />
          </mesh>
          <mesh position={[-6, 0.9, -2.4]}>
            <circleGeometry args={[0.7, 5]} />
            <meshStandardMaterial color="#e2557f" side={THREE.DoubleSide} />
          </mesh>
          <Html position={[1, 0.9, -2.6]} center transform scale={0.9} occlude={false} zIndexRange={[0, 0]}>
            <div
              style={{
                font: '600 14px Manrope, system-ui',
                color: '#fff',
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
              }}
            >
              Globe Healthcare
            </div>
          </Html>
        </group>
      ) : null}
      {/* grey corner tower at the east end */}
      {maxLevel >= 0 ? (
        <mesh position={[W + 2.5, (Math.min(6, maxLevel + 1) * H) / 2 + 1, 4]} castShadow>
          <boxGeometry args={[5, Math.min(6, maxLevel + 1) * H + 2, 8]} />
          <meshStandardMaterial color="#9aa0a4" roughness={0.8} />
        </mesh>
      ) : null}
    </group>
  );
}

function Floor({
  level,
  H,
  W,
  D,
  uses,
  rooms,
  label,
  night,
  isRoof,
}: {
  level: number;
  H: number;
  W: number;
  D: number;
  uses: string[];
  rooms: boolean;
  label: boolean;
  night: boolean;
  isRoof: boolean;
}) {
  const y = level * H;
  const slab = night ? '#3a4640' : level < 0 ? '#d4d8d2' : '#eef1ec';
  const zones = useMemo(() => {
    if (isRoof || !rooms) return [];
    const front = uses.slice(0, Math.ceil(uses.length / 2));
    const back = uses.slice(Math.ceil(uses.length / 2));
    const row = (list: string[], z0: number, z1: number) =>
      list.map((u, i) => ({ u, x0: (i * W) / list.length, x1: ((i + 1) * W) / list.length, z0, z1 }));
    return [...row(front, 0.4, D * 0.42), ...row(back, D * 0.58, D - 0.4)];
  }, [uses, W, D, rooms, isRoof]);
  return (
    <group>
      <mesh position={[W / 2, y - 0.15, D / 2]} receiveShadow>
        <boxGeometry args={[W, 0.3, D]} />
        <meshStandardMaterial color={slab} roughness={0.9} />
      </mesh>
      {/* corridor stripe */}
      {!isRoof ? (
        <mesh rotation-x={-Math.PI / 2} position={[W / 2, y + 0.01, D / 2]}>
          <planeGeometry args={[W, D * 0.16]} />
          <meshStandardMaterial color={night ? '#4a5750' : '#f7f8f4'} />
        </mesh>
      ) : null}
      {zones.map((z) => (
        <group key={`${z.u}-${z.x0}`}>
          <mesh position={[(z.x0 + z.x1) / 2, y + 1.3, z.z0 < D / 2 ? z.z1 : z.z0]}>
            <boxGeometry args={[z.x1 - z.x0 - 0.3, 2.6, 0.12]} />
            <meshStandardMaterial color="#ffffff" transparent opacity={0.35} />
          </mesh>
          <mesh position={[z.x1 - 0.06, y + 1.3, (z.z0 + z.z1) / 2]}>
            <boxGeometry args={[0.12, 2.6, z.z1 - z.z0]} />
            <meshStandardMaterial color="#ffffff" transparent opacity={0.3} />
          </mesh>
          {label ? (
            <Html position={[(z.x0 + z.x1) / 2, y + 2.9, (z.z0 + z.z1) / 2]} center zIndexRange={[1, 0]}>
              <div className="st-room">{z.u}</div>
            </Html>
          ) : null}
        </group>
      ))}
      {/* translucent side and back walls */}
      {level >= 0 && !isRoof ? (
        <>
          <mesh position={[W / 2, y + H / 2, D]}>
            <boxGeometry args={[W, H, 0.2]} />
            <meshStandardMaterial color="#a7afb3" transparent opacity={0.22} />
          </mesh>
          <mesh position={[0, y + H / 2, D / 2]}>
            <boxGeometry args={[0.2, H, D]} />
            <meshStandardMaterial color="#a7afb3" transparent opacity={0.22} />
          </mesh>
          <mesh position={[W, y + H / 2, D / 2]}>
            <boxGeometry args={[0.2, H, D]} />
            <meshStandardMaterial color="#a7afb3" transparent opacity={0.22} />
          </mesh>
        </>
      ) : null}
      {level < 0 ? (
        <mesh position={[W / 2, y + H / 2, D / 2]}>
          <boxGeometry args={[W, H, D]} />
          <meshStandardMaterial color="#c8cdc8" transparent opacity={0.08} side={THREE.BackSide} />
        </mesh>
      ) : null}
    </group>
  );
}

/** Blue glass curtain wall with instanced mullions on the street front (z = 0). */
function Facade({ W, H, floors, night }: { W: number; H: number; floors: number; night: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const cols = Math.floor(W / 2);
  const count = cols + 1 + floors + 1;
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    let i = 0;
    for (let c = 0; c <= cols; c++) {
      m.makeScale(0.12, floors * H, 0.18);
      m.setPosition((c * W) / cols, (floors * H) / 2, -0.05);
      ref.current?.setMatrixAt(i++, m);
    }
    for (let f = 0; f <= floors; f++) {
      m.makeScale(W, 0.18, 0.22);
      m.setPosition(W / 2, f * H, -0.05);
      ref.current?.setMatrixAt(i++, m);
    }
    if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
  }, [W, H, floors, cols]);
  return (
    <group>
      <mesh position={[W / 2, (floors * H) / 2, 0]}>
        <boxGeometry args={[W, floors * H, 0.08]} />
        <meshStandardMaterial
          color={night ? '#2a5a9a' : '#5b9bd8'}
          transparent
          opacity={0.28}
          metalness={0.6}
          roughness={0.1}
          emissive={night ? '#f5d48a' : '#000000'}
          emissiveIntensity={night ? 0.08 : 0}
        />
      </mesh>
      <instancedMesh ref={ref} args={[undefined, undefined, count]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#6f7a82" metalness={0.5} roughness={0.4} />
      </instancedMesh>
    </group>
  );
}
