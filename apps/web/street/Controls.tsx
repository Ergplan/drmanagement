'use client';
import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { CapsuleCollider, CuboidCollider, type RapierRigidBody, RigidBody } from '@react-three/rapier';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

type OrbitImpl = { target: THREE.Vector3; update: () => unknown };

/**
 * Tour and dollhouse cameras: orbit controls whose target glides to the selected stop (Street-View style; drag to
 * look around). With reduced motion the camera cuts instead of gliding.
 */
export function GlideCamera({
  target,
  yawDeg,
  mode,
  motion,
  overview,
}: {
  target: [number, number, number];
  yawDeg: number;
  mode: 'tour' | 'dollhouse';
  motion: boolean;
  overview: [number, number, number];
}) {
  const ctl = useRef<OrbitImpl>(null);
  const { camera } = useThree();
  const want = useRef({ t: new THREE.Vector3(), p: new THREE.Vector3(), flying: true });
  useEffect(() => {
    const yaw = (yawDeg * Math.PI) / 180;
    if (mode === 'tour') {
      want.current.t.set(target[0], target[1] + 1.4, target[2]);
      want.current.p.set(target[0] - Math.sin(yaw) * 11, target[1] + 5, target[2] - Math.cos(yaw) * 11);
    } else {
      want.current.t.set(overview[0], overview[1], overview[2]);
      want.current.p.set(overview[0] - 46, overview[1] + 44, overview[2] - 52);
    }
    want.current.flying = true;
  }, [target, yawDeg, mode, overview]);
  useFrame((_, dt) => {
    const c = ctl.current;
    if (!c || !want.current.flying) return;
    const k = motion ? 1 - Math.exp(-dt * 3.2) : 1;
    c.target.lerp(want.current.t, k);
    camera.position.lerp(want.current.p, k);
    c.update();
    if (camera.position.distanceTo(want.current.p) < 0.05 && c.target.distanceTo(want.current.t) < 0.05)
      want.current.flying = false;
  });
  return (
    <OrbitControls
      ref={ctl as never}
      makeDefault
      enablePan={mode === 'dollhouse'}
      minDistance={mode === 'tour' ? 3 : 12}
      maxDistance={mode === 'tour' ? 18 : 140}
      maxPolarAngle={mode === 'tour' ? Math.PI * 0.52 : Math.PI * 0.48}
      onStart={() => {
        want.current.flying = false;
      }}
    />
  );
}

/** Walk mode: third-person capsule with Rapier collisions. WASD/arrows or the on-screen pad; drag to turn. */
export function Walker({
  start,
  keys,
  yaw,
  onMove,
  floorYs,
  W,
  D,
}: {
  start: [number, number, number];
  keys: React.RefObject<Set<string>>;
  yaw: React.RefObject<number>;
  onMove: (p: THREE.Vector3) => void;
  floorYs: number[];
  W: number;
  D: number;
}) {
  const body = useRef<RapierRigidBody>(null);
  const { camera } = useThree();
  const avatar = useRef<THREE.Group>(null);
  const last = useRef(0);
  useEffect(() => {
    body.current?.setTranslation({ x: start[0], y: start[1] + 1.2, z: start[2] - 4 }, true);
    body.current?.setLinvel({ x: 0, y: 0, z: 0 }, true);
  }, [start]);
  useFrame((_, dt) => {
    const b = body.current;
    if (!b) return;
    const k = keys.current;
    if (k.has('ArrowLeft') || k.has('q')) yaw.current += dt * 1.8;
    if (k.has('ArrowRight') || k.has('e')) yaw.current -= dt * 1.8;
    const f = (k.has('w') || k.has('ArrowUp') ? 1 : 0) - (k.has('s') || k.has('ArrowDown') ? 1 : 0);
    const s = (k.has('d') ? 1 : 0) - (k.has('a') ? 1 : 0);
    const y0 = yaw.current;
    const speed = 4.2;
    const vx = (Math.sin(y0) * f - Math.cos(y0) * s) * speed;
    const vz = (Math.cos(y0) * f + Math.sin(y0) * s) * speed;
    const v = b.linvel();
    b.setLinvel({ x: vx, y: v.y, z: vz }, true);
    const p = b.translation();
    const pos = new THREE.Vector3(p.x, p.y, p.z);
    if (avatar.current) {
      avatar.current.position.copy(pos);
      avatar.current.rotation.y = y0;
    }
    const cam = new THREE.Vector3(p.x - Math.sin(y0) * 5.5, p.y + 2.6, p.z - Math.cos(y0) * 5.5);
    camera.position.lerp(cam, 1 - Math.exp(-dt * 6));
    camera.lookAt(p.x + Math.sin(y0) * 2, p.y + 1, p.z + Math.cos(y0) * 2);
    last.current += dt;
    if (last.current > 0.25) {
      last.current = 0;
      onMove(pos);
    }
  });
  return (
    <>
      <RigidBody
        ref={body}
        colliders={false}
        enabledRotations={[false, false, false]}
        position={[start[0], start[1] + 1.2, start[2] - 4]}
        linearDamping={0.5}
      >
        <CapsuleCollider args={[0.55, 0.35]} />
      </RigidBody>
      <group ref={avatar}>
        <mesh position={[0, 0, 0]}>
          <capsuleGeometry args={[0.35, 1.1, 6, 12]} />
          <meshStandardMaterial color="#1f7a3c" />
        </mesh>
        <mesh position={[0, 0.35, 0.3]}>
          <boxGeometry args={[0.3, 0.12, 0.1]} />
          <meshStandardMaterial color="#e8f5ec" />
        </mesh>
      </group>
      {/* floors, outside ground, and walls around each indoor level (the ground floor opens to the forecourt and HT yard) */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[80, 0.2, 60]} position={[W / 2, -0.2, D / 2 - 10]} />
        {floorYs.map((y) =>
          y === 0 ? null : (
            <group key={y}>
              <CuboidCollider args={[W / 2, 0.15, D / 2]} position={[W / 2, y - 0.15, D / 2]} />
              <CuboidCollider args={[W / 2, 2.2, 0.1]} position={[W / 2, y + 2, -0.1]} />
              <CuboidCollider args={[W / 2, 2.2, 0.1]} position={[W / 2, y + 2, D + 0.1]} />
              <CuboidCollider args={[0.1, 2.2, D / 2]} position={[-0.1, y + 2, D / 2]} />
              <CuboidCollider args={[0.1, 2.2, D / 2]} position={[W + 0.1, y + 2, D / 2]} />
            </group>
          ),
        )}
      </RigidBody>
    </>
  );
}
