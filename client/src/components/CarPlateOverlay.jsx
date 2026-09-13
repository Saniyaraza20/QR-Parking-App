import { useEffect, useRef } from 'react';
import * as THREE from 'three';

function makePlateTexture(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f5d90a'; // classic plate yellow
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);
  ctx.fillStyle = '#111';
  ctx.font = 'bold 88px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text.toUpperCase(), canvas.width / 2, canvas.height / 2 + 6);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

// A simple procedural low-poly car - no external model files to fetch, just
// primitives. The point is showing the plate text back to the driver for
// confirmation, not photorealism.
function buildCar(plateTexture) {
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xd62828, metalness: 0.3, roughness: 0.5 });
  const cabinMat = new THREE.MeshStandardMaterial({ color: 0x9d1c1c, metalness: 0.3, roughness: 0.5 });
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.6, roughness: 0.3 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 1.05), bodyMat);
  body.position.set(0, 0.45, 0);
  group.add(body);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.45, 0.9), cabinMat);
  cabin.position.set(-0.15, 0.82, 0);
  group.add(cabin);

  const bumperFront = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.28, 1.05), trimMat);
  bumperFront.position.set(1.13, 0.32, 0);
  group.add(bumperFront);

  const wheelGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.22, 20);
  const wheelPositions = [
    [0.75, 0.26, 0.55],
    [0.75, 0.26, -0.55],
    [-0.75, 0.26, 0.55],
    [-0.75, 0.26, -0.55],
  ];
  for (const [x, y, z] of wheelPositions) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, y, z);
    group.add(wheel);
  }

  // License plate mounted on the front bumper, facing +X (toward the camera's default view)
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.85, 0.3),
    new THREE.MeshBasicMaterial({ map: plateTexture })
  );
  plate.position.set(1.2, 0.32, 0);
  plate.rotation.y = Math.PI / 2;
  group.add(plate);

  return group;
}

export default function CarPlateOverlay({ vehicleNumber, onContinue, onBack }) {
  const mountRef = useRef(null);
  const small = typeof window !== 'undefined' && window.innerWidth < 380;
  const canvasWidth = small ? 260 : 320;
  const canvasHeight = small ? 195 : 240;

  useEffect(() => {
    const width = canvasWidth;
    const height = canvasHeight;
    const mount = mountRef.current;

    const scene = new THREE.Scene();
    scene.background = null;

    const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 100);
    camera.position.set(3.2, 1.8, 3.2);
    camera.lookAt(0, 0.3, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(4, 6, 4);
    scene.add(dirLight);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(2.6, 32),
      new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    scene.add(ground);

    const plateTexture = makePlateTexture(vehicleNumber || '');
    const car = buildCar(plateTexture);
    scene.add(car);

    let frameId;
    const start = performance.now();
    function animate(now) {
      const t = (now - start) / 1000;
      // Gentle back-and-forth turn, keeping the plate mostly visible rather
      // than spinning it out of view.
      car.rotation.y = Math.sin(t * 0.6) * 0.5;
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    }
    frameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frameId);
      renderer.dispose();
      plateTexture.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, [vehicleNumber]);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16,
    }}>
      <div className="card" style={{ maxWidth: 'min(360px, calc(100vw - 32px))', textAlign: 'center' }}>
        <h2 style={{ marginTop: 0 }}>Vehicle confirmed</h2>
        <div ref={mountRef} style={{ width: canvasWidth, height: canvasHeight, margin: '0 auto' }} />
        <p style={{ fontSize: 22, fontWeight: 700, letterSpacing: 1, marginTop: 4 }}>
          {(vehicleNumber || '').toUpperCase()}
        </p>
        <div className="wizard-nav">
          {onBack && <button className="secondary" onClick={onBack}>Back</button>}
          <button className="primary" onClick={onContinue}>Continue</button>
        </div>
      </div>
    </div>
  );
}
