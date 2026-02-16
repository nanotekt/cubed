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
    const tubularSegments = 16;
    const geo = new THREE.TubeGeometry(curve, tubularSegments, highlighted ? 0.07 : 0.04, 8, false);

    // Apply vertex color gradient from fromColor to toColor
    if (!highlighted) {
      const fromCol = new THREE.Color(pipe.fromColor);
      const toCol = new THREE.Color(pipe.toColor);
      const positions = geo.attributes.position;
      const colors = new Float32Array(positions.count * 3);
      const tmpColor = new THREE.Color();

      const radialSegments = 8;
      const vertsPerRing = radialSegments + 1;

      for (let i = 0; i < positions.count; i++) {
        const ringIndex = Math.floor(i / vertsPerRing);
        const t = ringIndex / tubularSegments;
        tmpColor.copy(fromCol).lerp(toCol, t);
        colors[i * 3] = tmpColor.r;
        colors[i * 3 + 1] = tmpColor.g;
        colors[i * 3 + 2] = tmpColor.b;
      }

      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }

    return geo;
  }, [pipe.from, pipe.to, pipe.fromColor, pipe.toColor, highlighted]);

  return (
    <mesh
      geometry={geometry}
      renderOrder={2}
      onPointerOver={(e) => { e.stopPropagation(); onHover(pipe.id); }}
      onPointerOut={() => onHover(null)}
    >
      {highlighted ? (
        <meshStandardMaterial
          key="highlighted"
          color="#ffffff"
          transparent
          opacity={1}
          depthWrite={false}
          emissive="#ffffff"
          emissiveIntensity={0.8}
        />
      ) : (
        <meshStandardMaterial
          key="normal"
          vertexColors
          transparent
          opacity={0.7}
          depthWrite={false}
          emissive="#444444"
          emissiveIntensity={0.3}
        />
      )}
    </mesh>
  );
}
