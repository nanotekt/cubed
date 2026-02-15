import { useMemo } from 'react';
import * as THREE from 'three';
import type { PipeInfo } from '../layoutEngine';

interface PipeProps {
  pipe: PipeInfo;
  highlighted: boolean;
  onHover: (id: string | null) => void;
}

export function Pipe({ pipe, highlighted, onHover }: PipeProps) {
  const geometry = useMemo(() => {
    const from = new THREE.Vector3(...pipe.from);
    const to = new THREE.Vector3(...pipe.to);
    const mid = from.clone().lerp(to, 0.5);
    // Add slight curve upward for visual clarity
    mid.y += 0.3;

    const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
    return new THREE.TubeGeometry(curve, 16, highlighted ? 0.07 : 0.04, 8, false);
  }, [pipe.from, pipe.to, highlighted]);

  const color = highlighted ? '#ffffff' : pipe.color;

  return (
    <mesh
      geometry={geometry}
      renderOrder={2}
      onPointerOver={(e) => { e.stopPropagation(); onHover(pipe.id); }}
      onPointerOut={() => onHover(null)}
    >
      <meshStandardMaterial
        color={color}
        transparent
        opacity={highlighted ? 1 : 0.7}
        depthWrite={false}
        emissive={color}
        emissiveIntensity={highlighted ? 0.8 : 0.3}
      />
    </mesh>
  );
}
