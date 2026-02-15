import type { ReactNode } from 'react';
import { Text } from '@react-three/drei';
import type { SceneNode } from '../layoutEngine';

interface ConstructorCubeProps {
  node: SceneNode;
  selected: boolean;
  onHover: (id: string | null) => void;
  onClick: (id: string) => void;
  onDoubleClick: (id: string) => void;
  children?: ReactNode;
}

export function ConstructorCube({ node, selected, onHover, onClick, onDoubleClick, children }: ConstructorCubeProps) {
  return (
    <group position={node.position}>
      {/* Rotated 45° on Y to give a diamond shape, distinguishing from regular application cubes */}
      <group rotation={[0, Math.PI / 4, 0]}>
        <mesh
          onPointerOver={() => onHover(node.id)}
          onPointerOut={() => onHover(null)}
          onClick={() => onClick(node.id)}
          onDoubleClick={() => onDoubleClick(node.id)}
        >
          <boxGeometry args={node.size} />
          <meshStandardMaterial
            color={node.color}
            roughness={0.3}
            metalness={0.4}
          />
        </mesh>
        {selected && (
          <mesh>
            <boxGeometry args={node.size.map(s => s + 0.05) as [number, number, number]} />
            <meshBasicMaterial color="#ffff00" wireframe />
          </mesh>
        )}
      </group>
      {/* Label (not rotated, stays readable) */}
      <Text
        position={[0, node.size[1] / 2 + 0.15, 0]}
        fontSize={0.18}
        color="#ffaaee"
        anchorX="center"
        anchorY="bottom"
        outlineWidth={0.015}
        outlineColor="#000000"
      >
        {node.label}
      </Text>
      {/* Port nubs */}
      {node.ports.map(port => {
        const localPos: [number, number, number] = [
          port.worldPos[0] - node.position[0],
          port.worldPos[1] - node.position[1],
          port.worldPos[2] - node.position[2],
        ];
        return (
          <group key={port.id} position={localPos}>
            <mesh>
              <boxGeometry args={[0.12, 0.12, 0.12]} />
              <meshStandardMaterial color="#cc88aa" />
            </mesh>
            <Text
              position={[port.side === 'right' ? 0.18 : -0.18, 0, 0]}
              fontSize={0.09}
              color="#ddbbcc"
              anchorX={port.side === 'right' ? 'left' : 'right'}
              anchorY="middle"
            >
              {port.name}
            </Text>
          </group>
        );
      })}
      {/* Render children with inverse offset so their absolute positions remain correct */}
      <group position={[-node.position[0], -node.position[1], -node.position[2]]}>
        {children}
      </group>
    </group>
  );
}
