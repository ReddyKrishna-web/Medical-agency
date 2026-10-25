import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment } from '@react-three/drei';
import { Suspense } from 'react';
import { Warehouse, FloatingPackage, DeliveryVan, ParticleField } from './Scene3D';

export default function Hero3DScene() {
  return (
    <div className="absolute inset-0 w-full h-full">
      <Canvas dpr={[1, 1.5]} gl={{ antialias: true, alpha: true }}>
        <Suspense fallback={null}>
          <PerspectiveCamera makeDefault position={[5, 3, 5]} fov={50} />
          <ambientLight intensity={0.3} />
          <directionalLight position={[10, 10, 5]} intensity={1} color="#ffffff" />
          <pointLight position={[-5, 3, -2]} intensity={2} color="#2f6ff2" />
          <pointLight position={[3, 2, 3]} intensity={2} color="#14b8a6" />
          
          <Warehouse />
          <FloatingPackage position={[-1, 0, -1]} color="#14b8a6" />
          <FloatingPackage position={[0, 1, -0.5]} color="#2f6ff2" />
          <FloatingPackage position={[1, 0.5, -1.5]} color="#48a4ff" />
          <DeliveryVan position={[-3, -0.5, 1]} />
          
          <ParticleField />
          
          <OrbitControls 
            enableZoom={false} 
            enablePan={false} 
            autoRotate 
            autoRotateSpeed={0.2}
            maxPolarAngle={Math.PI / 2.2}
            minPolarAngle={Math.PI / 6}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
