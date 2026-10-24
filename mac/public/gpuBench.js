// VS Tolls — 3D Game Scene Benchmark (Terrain, Water, Instanced Nature, Dynamic Lighting)
let benchScene, benchCamera, benchRenderer;
let benchAnimId = null;
let benchRunning = false;
let benchStartTime = 0;
let benchFrameTimes = [];
let onBenchCompleteCallback = null;

function run3dGpuBenchmark(canvasElement, durationSeconds = 15, onComplete) {
  if (benchAnimId) cancelAnimationFrame(benchAnimId);
  benchRunning = true;
  benchFrameTimes = [];
  onBenchCompleteCallback = onComplete;

  const container = canvasElement.parentElement;
  const w = container.clientWidth || 800;
  const h = container.clientHeight || 500;

  benchScene = new THREE.Scene();
  benchScene.background = new THREE.Color(0x0a1118);
  benchScene.fog = new THREE.FogExp2(0x0a1118, 0.015);

  benchCamera = new THREE.PerspectiveCamera(65, w / h, 0.1, 500);
  benchRenderer = new THREE.WebGLRenderer({
    canvas: canvasElement,
    antialias: true,
    powerPreference: 'high-performance'
  });
  benchRenderer.setSize(w, h, false);
  benchRenderer.setPixelRatio(window.devicePixelRatio || 1);
  benchRenderer.shadowMap.enabled = true;

  // Ambient & Directional Sun Light
  const ambientLight = new THREE.AmbientLight(0x334155, 1.2);
  benchScene.add(ambientLight);

  const sunLight = new THREE.DirectionalLight(0xfff1d0, 2.5);
  sunLight.position.set(40, 80, 50);
  sunLight.castShadow = true;
  benchScene.add(sunLight);

  // Terrain
  const terrainGeo = new THREE.PlaneGeometry(240, 240, 96, 96);
  terrainGeo.rotateX(-Math.PI / 2);
  const pos = terrainGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = Math.sin(x * 0.05) * 6.0 + Math.cos(z * 0.05) * 6.0 + Math.sin(x * 0.15 + z * 0.15) * 2.5;
    pos.setY(i, Math.max(-2, y));
  }
  terrainGeo.computeVertexNormals();
  const terrainMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.85,
    metalness: 0.1
  });
  const terrain = new THREE.Mesh(terrainGeo, terrainMat);
  terrain.receiveShadow = true;
  benchScene.add(terrain);

  // Water Surface
  const waterGeo = new THREE.PlaneGeometry(240, 240);
  waterGeo.rotateX(-Math.PI / 2);
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x0284c7,
    roughness: 0.1,
    metalness: 0.9,
    transparent: true,
    opacity: 0.8
  });
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.position.y = 0.5;
  benchScene.add(water);

  // Instanced Trees / Crystals (3,500 instances)
  const treeCount = 3500;
  const treeGeo = new THREE.ConeGeometry(0.8, 3.2, 5);
  const treeMat = new THREE.MeshStandardMaterial({ color: 0x059669, roughness: 0.7 });
  const instancedTrees = new THREE.InstancedMesh(treeGeo, treeMat, treeCount);
  const dummy = new THREE.Object3D();

  for (let i = 0; i < treeCount; i++) {
    const tx = (Math.random() - 0.5) * 200;
    const tz = (Math.random() - 0.5) * 200;
    const ty = Math.sin(tx * 0.05) * 6.0 + Math.cos(tz * 0.05) * 6.0 + 1.6;
    if (ty > 2) {
      dummy.position.set(tx, ty, tz);
      const scale = 0.6 + Math.random() * 0.8;
      dummy.scale.set(scale, scale, scale);
      dummy.rotation.y = Math.random() * Math.PI * 2;
      dummy.updateMatrix();
      instancedTrees.setMatrixAt(i, dummy.matrix);
    }
  }
  instancedTrees.instanceMatrix.needsUpdate = true;
  benchScene.add(instancedTrees);

  benchStartTime = performance.now();
  let lastFrameTime = performance.now();

  function animate(now) {
    if (!benchRunning) return;

    benchAnimId = requestAnimationFrame(animate);

    const frameDelta = now - lastFrameTime;
    lastFrameTime = now;
    benchFrameTimes.push(frameDelta);

    const elapsed = (now - benchStartTime) / 1000;

    // Cinematic camera fly-through
    const angle = elapsed * 0.35;
    const radius = 60 + Math.sin(elapsed * 0.5) * 15;
    benchCamera.position.x = Math.sin(angle) * radius;
    benchCamera.position.z = Math.cos(angle) * radius;
    benchCamera.position.y = 18 + Math.cos(elapsed * 0.4) * 8;
    benchCamera.lookAt(0, 4, 0);

    benchRenderer.render(benchScene, benchCamera);

    // Update overlay readout
    const currentFps = Math.round(1000 / Math.max(1, frameDelta));
    const fpsElem = document.getElementById('gpuBenchLiveFps');
    if (fpsElem) fpsElem.innerText = `${currentFps} FPS`;

    const progressElem = document.getElementById('gpuBenchProgressBar');
    if (progressElem) {
      const pct = Math.min(100, Math.round((elapsed / durationSeconds) * 100));
      progressElem.style.width = `${pct}%`;
    }

    if (elapsed >= durationSeconds) {
      stop3dGpuBenchmark();
    }
  }

  benchAnimId = requestAnimationFrame(animate);
}

function stop3dGpuBenchmark() {
  benchRunning = false;
  if (benchAnimId) {
    cancelAnimationFrame(benchAnimId);
    benchAnimId = null;
  }

  if (benchFrameTimes.length > 0) {
    const fpsList = benchFrameTimes.map(dt => 1000 / dt).filter(fps => fps > 5 && fps < 500);
    fpsList.sort((a, b) => a - b);
    const avgFps = Math.round(fpsList.reduce((acc, v) => acc + v, 0) / fpsList.length);
    const low1Idx = Math.floor(fpsList.length * 0.01);
    const low1PctFps = Math.round(fpsList[low1Idx] || avgFps * 0.7);
    const score = avgFps * 10;

    if (onBenchCompleteCallback) {
      onBenchCompleteCallback({
        avgFps,
        low1PctFps,
        score,
        totalFrames: benchFrameTimes.length
      });
    }
  }
}

window.run3dGpuBenchmark = run3dGpuBenchmark;
window.stop3dGpuBenchmark = stop3dGpuBenchmark;
