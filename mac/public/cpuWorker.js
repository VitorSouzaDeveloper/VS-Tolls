// VS Tolls — CPU Cinebench-style Path Tracer Web Worker
self.onmessage = function (e) {
  const { width, height, samplesPerPixel, startTileY, endTileY, tileSize, workerId } = e.data;

  const sphereCount = 6;
  const sx = [0, -1.8, 1.8, 0, -0.9, 0.9];
  const sy = [-1000, 0.8, 0.8, 0.4, 0.4, 0.4];
  const sz = [0, 3.2, 3.2, 2.0, 2.2, 2.2];
  const sr = [1000, 0.8, 0.8, 0.4, 0.4, 0.4];
  const sMat = ['diffuse', 'metal', 'glass', 'light', 'diffuse', 'metal'];

  const buffer = new Uint8ClampedArray(width * (endTileY - startTileY) * 4);

  let rayCount = 0;
  const startTime = performance.now();

  for (let y = startTileY; y < endTileY; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0;

      for (let s = 0; s < samplesPerPixel; s++) {
        rayCount++;
        const u = (x + Math.random()) / width;
        const v = (y + Math.random()) / height;

        const rox = 0;
        const roy = 1.0;
        const roz = -2.0;

        const rdx = (u - 0.5) * 1.6;
        const rdy = (0.5 - v) * 0.9;
        const rdz = 1.0;
        const invLen = 1.0 / Math.sqrt(rdx * rdx + rdy * rdy + rdz * rdz);
        const ndx = rdx * invLen;
        const ndy = rdy * invLen;
        const ndz = rdz * invLen;

        let nearestT = 1e9;
        let hitSphere = -1;

        for (let sp = 0; sp < sphereCount; sp++) {
          const ocx = rox - sx[sp];
          const ocy = roy - sy[sp];
          const ocz = roz - sz[sp];
          const bVal = ocx * ndx + ocy * ndy + ocz * ndz;
          const cVal = (ocx * ocx + ocy * ocy + ocz * ocz) - sr[sp] * sr[sp];
          const discr = bVal * bVal - cVal;
          if (discr > 0) {
            const t = -bVal - Math.sqrt(discr);
            if (t > 0.001 && t < nearestT) {
              nearestT = t;
              hitSphere = sp;
            }
          }
        }

        if (hitSphere >= 0) {
          if (hitSphere === 3) {
            // Light source
            r += 1.8; g += 1.6; b += 1.4;
          } else {
            // Simple diffuse/ambient shading
            const hitX = rox + ndx * nearestT;
            const hitY = roy + ndy * nearestT;
            const hitZ = roz + ndz * nearestT;
            const nx = (hitX - sx[hitSphere]) / sr[hitSphere];
            const ny = (hitY - sy[hitSphere]) / sr[hitSphere];
            const nz = (hitZ - sz[hitSphere]) / sr[hitSphere];
            const diff = Math.max(0.15, ny * 0.8 + 0.3);

            if (hitSphere === 0) {
              // Checkerboard ground
              const check = (Math.floor(hitX * 2) + Math.floor(hitZ * 2)) & 1;
              const col = check ? 0.75 : 0.35;
              r += col * diff; g += col * diff; b += col * diff;
            } else if (hitSphere === 1) {
              r += 0.85 * diff; g += 0.35 * diff; b += 0.2 * diff;
            } else {
              r += 0.3 * diff; g += 0.65 * diff; b += 0.9 * diff;
            }
          }
        } else {
          // Horizon gradient
          const t = 0.5 * (ndy + 1.0);
          r += (1.0 - t) * 0.1 + t * 0.35;
          g += (1.0 - t) * 0.12 + t * 0.5;
          b += (1.0 - t) * 0.18 + t * 0.75;
        }
      }

      const invSamples = 1.0 / samplesPerPixel;
      const idx = ((y - startTileY) * width + x) * 4;
      buffer[idx] = Math.min(255, Math.floor(Math.sqrt(r * invSamples) * 255));
      buffer[idx + 1] = Math.min(255, Math.floor(Math.sqrt(g * invSamples) * 255));
      buffer[idx + 2] = Math.min(255, Math.floor(Math.sqrt(b * invSamples) * 255));
      buffer[idx + 3] = 255;
    }
  }

  const durationMs = performance.now() - startTime;
  self.postMessage({
    workerId,
    startTileY,
    endTileY,
    width,
    rayCount,
    durationMs,
    buffer
  }, [buffer.buffer]);
};
