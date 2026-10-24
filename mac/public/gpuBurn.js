// VS Tolls — GPU Burn (FurMark-style 3D Torus Shell Benchmark)
let burnScene, burnCamera, burnRenderer, burnMesh;
let burnAnimationId = null;
let burnFrames = 0;
let burnFps = 0;
let burnStartTime = 0;
let burnLastTime = 0;

function initGpuBurn(canvasElement, resolution = '1080p', msaa = 4, intensity = 'Alta') {
  if (burnAnimationId) cancelAnimationFrame(burnAnimationId);

  const container = canvasElement.parentElement;
  let w = container.clientWidth || 800;
  let h = container.clientHeight || 500;

  if (resolution === '720p') { w = 1280; h = 720; }
  else if (resolution === '1080p') { w = 1920; h = 1080; }
  else if (resolution === '1440p') { w = 2560; h = 1440; }

  burnScene = new THREE.Scene();
  burnCamera = new THREE.PerspectiveCamera(60, w / h, 0.1, 100);
  burnCamera.position.set(0, 0, 4.2);

  burnRenderer = new THREE.WebGLRenderer({
    canvas: canvasElement,
    antialias: msaa > 1,
    powerPreference: 'high-performance'
  });
  burnRenderer.setSize(w, h, false);
  burnRenderer.setPixelRatio(window.devicePixelRatio || 1);

  // Intensity layers count
  let shellCount = 36;
  let fmaLoops = 25;
  if (intensity === 'Extrema') { shellCount = 64; fmaLoops = 60; }
  else if (intensity === 'Normal') { shellCount = 24; fmaLoops = 10; }

  const group = new THREE.Group();

  // Custom fur shader material with massive FMA instructions
  const furVertexShader = `
    uniform float uTime;
    uniform float uLayer;
    varying vec2 vUv;
    varying vec3 vNormal;
    void main() {
      vUv = uv;
      vNormal = normal;
      vec3 displaced = position + normal * (uLayer * 0.018);
      // Wind oscillation
      displaced.x += sin(uTime * 4.0 + position.y * 3.0) * (uLayer * 0.003);
      displaced.y += cos(uTime * 3.5 + position.x * 3.0) * (uLayer * 0.003);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
    }
  `;

  const furFragmentShader = `
    uniform float uLayer;
    uniform float uTime;
    uniform int uFmaLoops;
    varying vec2 vUv;
    varying vec3 vNormal;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    void main() {
      vec2 hairCoord = vUv * 75.0;
      float n = hash(floor(hairCoord));
      if (uLayer > 0.0 && n < (uLayer * 0.026)) discard;

      // Heavy FMA loop to heat GPU execution units
      float accum = 0.5;
      for (int i = 0; i < 40; i++) {
        if (i >= uFmaLoops) break;
        accum = fract(sin(accum * 1.5 + float(i) * 0.1) * 43758.5453 + uTime * 0.01);
      }

      // Torus fur coloring
      vec3 baseColor = mix(vec3(0.95, 0.45, 0.1), vec3(1.0, 0.85, 0.2), uLayer / 40.0);
      vec3 lightDir = normalize(vec3(1.0, 1.5, 2.0));
      float diff = max(dot(vNormal, lightDir), 0.2);
      vec3 color = baseColor * diff + vec3(accum * 0.05);

      gl_FragColor = vec4(color, 1.0 - (uLayer * 0.015));
    }
  `;

  for (let i = 0; i < shellCount; i++) {
    const geom = new THREE.TorusGeometry(1.4, 0.55, 32, 64);
    const mat = new THREE.ShaderMaterial({
      vertexShader: furVertexShader,
      fragmentShader: furFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uLayer: { value: i },
        uFmaLoops: { value: fmaLoops }
      },
      transparent: i > 0,
      depthWrite: i === 0,
      blending: THREE.NormalBlending
    });
    const shell = new THREE.Mesh(geom, mat);
    group.add(shell);
  }

  burnScene.add(group);
  burnMesh = group;

  burnFrames = 0;
  burnStartTime = performance.now();
  burnLastTime = performance.now();

  function animate(now) {
    burnAnimationId = requestAnimationFrame(animate);

    const delta = (now - burnLastTime) / 1000;
    burnLastTime = now;
    burnFrames++;

    burnMesh.rotation.x += 0.012;
    burnMesh.rotation.y += 0.018;

    const timeVal = (now - burnStartTime) / 1000;
    burnMesh.children.forEach(child => {
      if (child.material && child.material.uniforms) {
        child.material.uniforms.uTime.value = timeVal;
      }
    });

    burnRenderer.render(burnScene, burnCamera);

    // Calculate instantaneous FPS
    if (burnFrames % 15 === 0) {
      const elapsed = (now - burnStartTime) / 1000;
      burnFps = Math.round(burnFrames / elapsed);
      const fpsElem = document.getElementById('gpuBurnFpsVal');
      if (fpsElem) fpsElem.innerText = `${burnFps} FPS`;
    }
  }

  burnAnimationId = requestAnimationFrame(animate);
}

function stopGpuBurn() {
  if (burnAnimationId) {
    cancelAnimationFrame(burnAnimationId);
    burnAnimationId = null;
  }
}

window.initGpuBurn = initGpuBurn;
window.stopGpuBurn = stopGpuBurn;
