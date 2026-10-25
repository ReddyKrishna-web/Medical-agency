import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Mesh } from 'three';

export function FloatingPackage({ position = [0, 0, 0], color = '#22d3ee' }: { position?: [number, number, number], color?: string }) {
  const meshRef = useRef<Mesh>(null);
  
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.x = Math.sin(state.clock.elapsedTime + position[0]) * 0.3;
      meshRef.current.rotation.y = Math.sin(state.clock.elapsedTime + position[1]) * 0.3;
      meshRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 0.8) * 0.5;
    }
  });

  return (
    <mesh ref={meshRef} position={position}>
      <boxGeometry args={[0.3, 0.3, 0.3]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.3} metalness={0.8} roughness={0.2} />
    </mesh>
  );
}

export function Warehouse() {
  const groupRef = useRef<any>(null);
  
  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.2) * 0.1;
    }
  });

  return (
    <group ref={groupRef} position={[2, -1, -2]}>
      <mesh position={[0, 1, 0]}>
        <boxGeometry args={[2, 2, 1.5]} />
        <meshStandardMaterial color="#1e293b" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[0, 2.2, 0]}>
        <boxGeometry args={[2.2, 0.3, 1.7]} />
        <meshStandardMaterial color="#2f6ff2" emissive="#2f6ff2" emissiveIntensity={0.5} metalness={0.9} roughness={0.1} />
      </mesh>
      <mesh position={[-0.5, 0.5, 0.76]}>
        <planeGeometry args={[0.4, 0.8]} />
        <meshStandardMaterial color="#14b8a6" emissive="#14b8a6" emissiveIntensity={0.8} transparent opacity={0.6} />
      </mesh>
      <mesh position={[0.5, 0.5, 0.76]}>
        <planeGeometry args={[0.4, 0.8]} />
        <meshStandardMaterial color="#14b8a6" emissive="#14b8a6" emissiveIntensity={0.8} transparent opacity={0.6} />
      </mesh>
    </group>
  );
}

export function DeliveryVan({ position = [-3, -0.5, 1] }: { position?: [number, number, number] }) {
  const groupRef = useRef<any>(null);
  
  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.position.x = position[0] + Math.sin(state.clock.elapsedTime * 0.3) * 0.5;
      groupRef.current.position.z = position[2] + Math.cos(state.clock.elapsedTime * 0.3) * 0.3;
    }
  });

  return (
    <group ref={groupRef} position={position}>
      <mesh>
        <boxGeometry args={[0.8, 0.4, 0.5]} />
        <meshStandardMaterial color="#48a4ff" metalness={0.8} roughness={0.2} />
      </mesh>
      <mesh position={[0.3, -0.25, 0.2]}>
        <cylinderGeometry args={[0.08, 0.08, 0.1, 16]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>
      <mesh position={[0.3, -0.25, -0.2]}>
        <cylinderGeometry args={[0.08, 0.08, 0.1, 16]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>
      <mesh position={[-0.2, -0.25, 0.2]}>
        <cylinderGeometry args={[0.08, 0.08, 0.1, 16]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>
      <mesh position={[-0.2, -0.25, -0.2]}>
        <cylinderGeometry args={[0.08, 0.08, 0.1, 16]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>
    </group>
  );
}

export function ParticleField() {
  const pointsRef = useRef<any>(null);
  const count = 200;
  
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 10;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 5;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 10;
  }
  
  useFrame((state) => {
    if (pointsRef.current) {
      pointsRef.current.rotation.y = state.clock.elapsedTime * 0.05;
    }
  });
  
  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial size={0.02} color="#5de6cf" transparent opacity={0.6} sizeAttenuation />
    </points>
  );
}
