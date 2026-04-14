import * as THREE from 'three';
import { gsap } from 'gsap';

export class Skybox {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.isDay = true;
    this._buildSky();
    this._buildStars();
    this._buildMoon();
    this._buildMoonHalo();
    this._buildNebula();
  }

  _buildSky() {
    const skyCanvas = document.createElement('canvas');
    skyCanvas.width  = 1;
    skyCanvas.height = 128;
    const skyCtx = skyCanvas.getContext('2d');
    // Minecraft-style day sky: rich saturated blue at zenith fading to a lighter
    // horizon blue — mimics Java Edition's sky shader colour ramp.
    const skyGrad = skyCtx.createLinearGradient(0, 0, 0, 128);
    skyGrad.addColorStop(0.00, '#1A6FE8');   // deep zenith blue
    skyGrad.addColorStop(0.30, '#2E8FF5');   // mid-upper sky
    skyGrad.addColorStop(0.60, '#5AABFF');   // mid sky
    skyGrad.addColorStop(0.82, '#78BEFF');   // lower sky
    skyGrad.addColorStop(1.00, '#99CCFF');   // horizon (matches Minecraft exactly)
    skyCtx.fillStyle = skyGrad;
    skyCtx.fillRect(0, 0, 1, 128);

    this._skyDayTex = new THREE.CanvasTexture(skyCanvas);
    this._skyDayTex.wrapS = THREE.RepeatWrapping;
    this._skyDayTex.repeat.set(1, 1);

    // FIX: radius 300 keeps sky verts within camera.far=350 when tracking camera.
    // Previous radius=490 placed ALL vertices ~440+ units from the camera —
    // beyond the far plane — so WebGL clipped the entire sky sphere. The "sky
    // colour" was only visible because it matched the fog colour, never as texture.
    this.skyGeo = new THREE.SphereGeometry(300, 32, 16);
    this.skyMat = new THREE.MeshBasicMaterial({
      side: THREE.BackSide,
      map:  this._skyDayTex,
      color: 0xffffff,
      // FIX: fog:false — FogExp2(density=0.009) at r=300 → near-zero transmittance.
      // Day fog colour was near-black (r:0.039), so the sky appeared black with no
      // blue gradient visible. Night fog was dark-blue — that was the only "sky colour"
      // at night. Both now show the correct material colour/texture.
      fog: false,
    });
    this.skyMesh = new THREE.Mesh(this.skyGeo, this.skyMat);
    this.skyMesh.matrixAutoUpdate = false;
    this.skyMesh.updateMatrix();
    this.skyMesh.userData.neverCull = true;
    this.scene.add(this.skyMesh);

    this.horizonGeo = new THREE.PlaneGeometry(1000, 50);
    this.horizonMat = new THREE.MeshBasicMaterial({
      color: 0xff6622,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false, // FIX
    });
    this.horizonMesh = new THREE.Mesh(this.horizonGeo, this.horizonMat);
    this.horizonMesh.rotation.x = -Math.PI / 2;
    this.horizonMesh.position.y = 0;
    this.horizonMesh.matrixAutoUpdate = false;
    this.horizonMesh.updateMatrix();
    this.horizonMesh.userData.neverCull = true;
    this.scene.add(this.horizonMesh);

    this._buildSun();
  }

  _buildSun() {
    const SIZE = 256;
    const cx = SIZE / 2, cy = SIZE / 2;
    const R  = SIZE * 0.30;

    const c   = document.createElement('canvas');
    c.width   = SIZE;
    c.height  = SIZE;
    const ctx = c.getContext('2d');

    const corona = ctx.createRadialGradient(cx, cy, R * 0.55, cx, cy, R * 1.55);
    corona.addColorStop(0.00, 'rgba(255,240,150,0.28)');
    corona.addColorStop(0.50, 'rgba(255,220,80,0.10)');
    corona.addColorStop(1.00, 'rgba(255,200,60,0.00)');
    ctx.fillStyle = corona;
    ctx.fillRect(0, 0, SIZE, SIZE);

    const halo = ctx.createRadialGradient(cx, cy, R * 0.45, cx, cy, R * 1.10);
    halo.addColorStop(0.00, 'rgba(255,255,220,0.55)');
    halo.addColorStop(0.60, 'rgba(255,230,100,0.18)');
    halo.addColorStop(1.00, 'rgba(255,200,60,0.00)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, SIZE, SIZE);

    const PIXEL = Math.round(SIZE / 20);
    const imageData = ctx.getImageData(0, 0, SIZE, SIZE);
    const data      = imageData.data;

    for (let py = 0; py < SIZE; py++) {
      for (let px = 0; px < SIZE; px++) {
        const dx = px - cx, dy = py - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > R) continue;

        const gx = Math.floor(px / PIXEL);
        const gy = Math.floor(py / PIXEL);
        const normDist = dist / R;

        let r, g, b, a;
        if (normDist < 0.25) {
          r = 255; g = 255; b = 220; a = 255;
        } else if (normDist < 0.60) {
          r = 255; g = 220; b = 50;  a = 255;
        } else if (normDist < 0.82) {
          r = 255; g = 190; b = 30;  a = 255;
        } else {
          r = 240; g = 160; b = 20;  a = 255;
        }

        if (normDist > 0.65 && (gx + gy) % 2 === 0) {
          r = Math.round(r * 0.85);
          g = Math.round(g * 0.85);
          b = Math.round(b * 0.80);
        }

        const idx = (py * SIZE + px) * 4;
        data[idx]     = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = a;
      }
    }
    ctx.putImageData(imageData, 0, 0);

    const sunTex = new THREE.CanvasTexture(c);
    this.sun = new THREE.Sprite(new THREE.SpriteMaterial({
      map:         sunTex,
      transparent: true,
      depthWrite:  false,
      blending:    THREE.AdditiveBlending,
      opacity:     1.0,
      fog:         false, // FIX
    }));

    this.sun.scale.set(80, 80, 1);
    this.sun.position.set(120, 280, -300);
    this.sun.userData.neverCull = true;
    this.scene.add(this.sun);
  }

  _buildStars() {
    // FIX: radii reduced from 460–490 to 240–275 so stars stay within
    // camera.far=350 once the star meshes track the camera position.
    const makeStarLayer = (count, size, opacity, rMin, rMax) => {
      const geo = new THREE.BufferGeometry();
      const positions = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);
      const palette = [
        [1.0, 1.0, 1.0],
        [1.0, 0.97, 0.88],
        [0.88, 0.92, 1.0],
        [1.0, 0.95, 0.75],
        [0.92, 0.88, 1.0],
      ];
      for (let i = 0; i < count; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(Math.random() * 2 - 1);
        const r = rMin + Math.random() * (rMax - rMin);
        positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = Math.abs(r * Math.cos(phi));
        positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
        const col = palette[Math.floor(Math.random() * palette.length)];
        colors[i * 3]     = col[0];
        colors[i * 3 + 1] = col[1];
        colors[i * 3 + 2] = col[2];
      }
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const mat = new THREE.PointsMaterial({
        size,
        transparent: true,
        opacity: 0,
        vertexColors: true,
        sizeAttenuation: false,
        depthWrite: false,
        fog: false, // FIX: stars must not be fogged
      });
      const pts = new THREE.Points(geo, mat);
      pts.matrixAutoUpdate = false;
      pts.updateMatrix();
      pts.userData.neverCull = true;
      pts.userData.baseOpacity = opacity;
      this.scene.add(pts);
      return pts;
    };

    this.starsA = makeStarLayer(600,  2.2, 0.95, 245, 270);
    this.starsB = makeStarLayer(2200, 1.1, 0.65, 255, 275);
    this.starsC = makeStarLayer(1200, 0.8, 0.35, 260, 278);

    this._twinkleFrame = 0;
    this.stars = this.starsA;
  }

  _buildMoon() {
    const geo = new THREE.SphereGeometry(8, 12, 12);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xf0eddd,
      transparent: true,
      opacity: 0,
      fog: false, // FIX
    });
    this.moon = new THREE.Mesh(geo, mat);
    this.moon.position.set(-150, 200, -300);
    this.moon.userData.neverCull = true;
    this.scene.add(this.moon);
  }

  _buildMoonHalo() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(128, 128, 8, 128, 128, 128);
    grad.addColorStop(0.0,  'rgba(240,235,210,0.55)');
    grad.addColorStop(0.12, 'rgba(210,220,255,0.32)');
    grad.addColorStop(0.35, 'rgba(130,150,220,0.14)');
    grad.addColorStop(0.65, 'rgba(60,80,160,0.06)');
    grad.addColorStop(1.0,  'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);

    const tex = new THREE.CanvasTexture(canvas);
    this.moonHalo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0,
      fog: false, // FIX
    }));
    this.moonHalo.scale.set(90, 90, 1);
    this.moonHalo.position.copy(this.moon.position);
    this.moonHalo.userData.neverCull = true;
    this.scene.add(this.moonHalo);
  }

  _buildNebula() {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 256;
    const ctx = canvas.getContext('2d');

    const blobs = [
      { x: 120, y: 100, r: 110, c: 'rgba(60,70,160,0.18)' },
      { x: 280, y: 80,  r: 90,  c: 'rgba(80,40,130,0.14)' },
      { x: 400, y: 130, r: 80,  c: 'rgba(40,80,150,0.12)' },
      { x: 200, y: 150, r: 70,  c: 'rgba(100,60,140,0.10)' },
    ];
    for (const b of blobs) {
      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
      g.addColorStop(0, b.c);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 512, 256);
    }

    const tex = new THREE.CanvasTexture(canvas);
    // FIX: reduced from 460 to 250 (within far=350 when tracking camera)
    const geo = new THREE.SphereGeometry(250, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.55);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0,
      fog: false, // FIX
    });
    this.nebula = new THREE.Mesh(geo, mat);
    this.nebula.rotation.y = 0.8;
    this.nebula.userData.neverCull = true;
    this.scene.add(this.nebula);
  }

  setDay() {
    this.isDay = true;
    // FIX: restore gradient texture for daytime
    this.skyMat.map = this._skyDayTex;
    this.skyMat.needsUpdate = true;
    gsap.to(this.skyMat.color, { r: 1, g: 1, b: 1, duration: 3, ease: 'power2.inOut' });
    gsap.to(this.horizonMat, { opacity: 0.4, duration: 1, yoyo: true, repeat: 1 });
    gsap.to(this.starsA.material, { opacity: 0, duration: 2 });
    gsap.to(this.starsB.material, { opacity: 0, duration: 2 });
    gsap.to(this.starsC.material, { opacity: 0, duration: 1.5 });
    gsap.to(this.moon.material, { opacity: 0, duration: 2 });
    gsap.to(this.moonHalo.material, { opacity: 0, duration: 2 });
    gsap.to(this.nebula.material, { opacity: 0, duration: 2 });
    if (this.sun) gsap.to(this.sun.material, { opacity: 1, duration: 2.5, ease: 'power2.inOut' });
    gsap.to(this.scene.fog, { density: 0.010, duration: 3 });
    if (this.scene.fog) {
      // Minecraft-like light-blue horizon fog for day
      gsap.to(this.scene.fog.color, { r: 0.47, g: 0.65, b: 0.90, duration: 3 });
    }
  }

  setNight() {
    this.isDay = false;
    if (this.sun) gsap.to(this.sun.material, { opacity: 0, duration: 1.5, ease: 'power2.inOut' });

    // FIX: null the gradient map immediately so night sky is a clean dark
    // field. Texture × dark tint looks muddy; flat colour looks correct.
    this.skyMat.map = null;
    this.skyMat.needsUpdate = true;

    gsap.to(this.skyMat.color, { r: 0.055, g: 0.065, b: 0.175, duration: 3.5, ease: 'power2.inOut' });
    gsap.to(this.horizonMat, { opacity: 0, duration: 1 });

    gsap.to(this.starsC.material, { opacity: this.starsC.userData.baseOpacity, duration: 2.5, delay: 0.2 });
    gsap.to(this.starsB.material, { opacity: this.starsB.userData.baseOpacity, duration: 3, delay: 0.5 });
    gsap.to(this.starsA.material, { opacity: this.starsA.userData.baseOpacity, duration: 3.5, delay: 0.8 });

    gsap.to(this.moon.material, { opacity: 1, duration: 3, delay: 0.5 });
    gsap.to(this.moonHalo.material, { opacity: 0.85, duration: 4, delay: 0.6 });
    gsap.to(this.nebula.material, { opacity: 0.7, duration: 5, delay: 1 });

    gsap.to(this.scene.fog, { density: 0.008, duration: 3.5 });
    if (this.scene.fog) {
      gsap.to(this.scene.fog.color, { r: 0.04, g: 0.046, b: 0.088, duration: 3.5 });
    }
  }

  // FIX: camera parameter added so sky objects track the camera every frame.
  // This is the standard skybox technique in THREE.js — keep the sky sphere
  // centred on the camera so its vertices are always within camera.far.
  // Previously sky objects were at fixed world origin; their vertices were
  // 430–550 units from the camera (beyond far=350) and were clipped by WebGL.
  update(elapsed, camera) {
    if (camera) {
      this.skyMesh.position.copy(camera.position);
      this.skyMesh.updateMatrix();

      this.starsA.position.copy(camera.position);
      this.starsA.updateMatrix();
      this.starsB.position.copy(camera.position);
      this.starsB.updateMatrix();
      this.starsC.position.copy(camera.position);
      this.starsC.updateMatrix();

      this.nebula.position.copy(camera.position);
      this.nebula.updateMatrix();
    }

    if (this.isDay) {
      if (this.sun) {
        const t = elapsed * 0.04;
        this.sun.position.x =  120 + Math.sin(t) * 20;
        this.sun.position.y =  280 + Math.cos(t * 0.7) * 8;
      }
    }

    if (!this.isDay) {
      this._twinkleFrame = (this._twinkleFrame || 0) + 1;

      if (this._twinkleFrame % 7 === 0) {
        const t = elapsed;
        this.starsA.material.opacity = Math.max(0,
          this.starsA.userData.baseOpacity * (0.80 + Math.sin(t * 0.9) * 0.12 + Math.sin(t * 2.3) * 0.08));
      }
      if (this._twinkleFrame % 13 === 0) {
        const t = elapsed;
        this.starsB.material.opacity = Math.max(0,
          this.starsB.userData.baseOpacity * (0.88 + Math.sin(t * 0.6 + 1.2) * 0.08));
      }

      const moonY = 200 + Math.sin(elapsed * 0.1) * 3;
      this.moon.position.y = moonY;
      this.moonHalo.position.y = moonY;

      if (this._twinkleFrame % 5 === 0) {
        this.moonHalo.material.opacity = 0.78 + Math.sin(elapsed * 0.22) * 0.07;
      }

      if (this._twinkleFrame % 30 === 0) {
        this.nebula.rotation.y += 0.00008;
      }
    }
  }
}
