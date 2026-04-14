import * as THREE from 'three';
import { gsap } from 'gsap';

/**
 * WindowGlowSystem — warm glowing windows for every villager house.
 *
 * Per house it creates:
 *  • Emissive quad meshes sitting just outside each window face —
 *    give the "warm light bleeding through glass" look from the ref images
 *  • One PointLight per house that sits just outside the front window —
 *    casts warm amber onto the porch and surrounding ground/fence blocks
 *
 * All geometry and lights are invisible during day and fade in at night.
 */
export class WindowGlowSystem {
  constructor(scene) {
    this.scene = scene;
    this._entries = [];   // { mesh, mat, light, nightOpacity, nightIntensity, nightDistance }
    this._isNight = false;
    this._alpha = 0;

    // Shared gradient texture — warm amber window glow
    this._windowTex = this._makeWindowTex(0xffcc77);
    this._windowTexWarm = this._makeWindowTex(0xffaa44);
  }

  _makeWindowTex(hex) {
    const c = new THREE.Color(hex);
    const r = Math.round(c.r * 255);
    const g = Math.round(c.g * 255);
    const b = Math.round(c.b * 255);

    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const ctx = cv.getContext('2d');

    // Outer soft haze
    const outer = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
    outer.addColorStop(0.0, `rgba(${r},${g},${b},0.0)`);
    outer.addColorStop(0.35, `rgba(${r},${g},${b},0.18)`);
    outer.addColorStop(0.65, `rgba(${r},${g},${b},0.38)`);
    outer.addColorStop(0.85, `rgba(${r},${g},${b},0.55)`);
    outer.addColorStop(1.0, `rgba(${r},${g},${b},0.0)`);
    ctx.fillStyle = outer;
    ctx.fillRect(0, 0, 64, 64);

    // Bright warm pane center
    const inner = ctx.createRadialGradient(32, 32, 0, 32, 32, 20);
    inner.addColorStop(0.0, `rgba(255,245,210,0.92)`);
    inner.addColorStop(0.45, `rgba(${r},${g},${b},0.72)`);
    inner.addColorStop(1.0, `rgba(${r},${g},${b},0.0)`);
    ctx.fillStyle = inner;
    ctx.fillRect(0, 0, 64, 64);

    return new THREE.CanvasTexture(cv);
  }

  /**
   * Register one house.
   * hx/hz = house centre. Facing south (front porch at +z).
   * Windows: front face at hz+4, north face at hz-4, side faces at hx±4
   */
  registerHouse(hx, hz) {
    const y = 3; // ground level, windows at y+2 and y+3
    const windowY = y + 2.5; // midpoint of the 2-block window

    const addWindowGlow = (wx, wy, wz, normalX, normalZ, tex, opacity = 0.72, size = 1.8) => {
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0,
        side: THREE.DoubleSide,
      });
      const geo = new THREE.PlaneGeometry(size, size * 1.4);
      const mesh = new THREE.Mesh(geo, mat);

      // Orient outward from wall
      if (normalZ !== 0) {
        mesh.position.set(wx, wy, wz + normalZ * 0.12);
      } else {
        mesh.position.set(wx + normalX * 0.12, wy, wz);
        mesh.rotation.y = Math.PI / 2;
      }
      mesh.visible = false;
      this.scene.add(mesh);
      this._entries.push({ mesh, mat, nightOpacity: opacity, light: null, nightIntensity: 0, nightDistance: 0 });
    };

    // Front south windows (2 windows flanking door at dx = ±3)
    addWindowGlow(hx - 3, windowY, hz + 4, 0, 1, this._windowTex, 0.78);
    addWindowGlow(hx + 3, windowY, hz + 4, 0, 1, this._windowTex, 0.78);

    // North face windows (3 smaller)
    addWindowGlow(hx - 2, windowY, hz - 4, 0, -1, this._windowTexWarm, 0.55, 1.5);
    addWindowGlow(hx,     windowY, hz - 4, 0, -1, this._windowTexWarm, 0.55, 1.5);
    addWindowGlow(hx + 2, windowY, hz - 4, 0, -1, this._windowTexWarm, 0.55, 1.5);

    // East/west side windows
    addWindowGlow(hx + 4, windowY, hz - 2, 1, 0, this._windowTexWarm, 0.52, 1.5);
    addWindowGlow(hx + 4, windowY, hz + 2, 1, 0, this._windowTexWarm, 0.52, 1.5);
    addWindowGlow(hx - 4, windowY, hz - 2, -1, 0, this._windowTexWarm, 0.52, 1.5);
    addWindowGlow(hx - 4, windowY, hz + 2, -1, 0, this._windowTexWarm, 0.52, 1.5);

    // One warm PointLight per house — sits just outside front porch, illuminates ground+fence
    const light = new THREE.PointLight(0xffaa44, 0, 0.01, 2);
    light.position.set(hx, y + 3, hz + 5.5);
    light.castShadow = false;
    light.visible = false;
    this.scene.add(light);
    this._entries.push({
      mesh: null, mat: null, nightOpacity: 0,
      light,
      nightIntensity: 5.8,
      nightDistance: 14,
    });

    // Chimney warm glow — small point at chimney top (hx+3, y+14, hz-3)
    const chimneyLight = new THREE.PointLight(0xff8822, 0, 0.01, 2);
    chimneyLight.position.set(hx + 3, y + 14.5, hz - 3);
    chimneyLight.castShadow = false;
    chimneyLight.visible = false;
    this.scene.add(chimneyLight);
    this._entries.push({
      mesh: null, mat: null, nightOpacity: 0,
      light: chimneyLight,
      nightIntensity: 2.2,
      nightDistance: 8,
      chimney: true,   // flag so we can flicker it
      phase: Math.random() * Math.PI * 2,
      freq: 2.8 + Math.random() * 1.4,
    });
  }

  setNight(isNight) {
    this._isNight = isNight;
    this._applyAll(this._alpha);
  }

  setAlpha(alpha) {
    this._alpha = THREE.MathUtils.clamp(alpha, 0, 1);
    if (this._isNight) this._applyAll(this._alpha);
  }

  _applyAll(alpha) {
    for (const e of this._entries) {
      if (e.mat && e.mesh) {
        e.mesh.visible = alpha > 0.01;
        e.mat.opacity = e.nightOpacity * alpha;
      }
      if (e.light) {
        e.light.visible = alpha > 0.01;
        e.light.intensity = e.nightIntensity * alpha;
        e.light.distance = THREE.MathUtils.lerp(0.01, e.nightDistance, alpha);
      }
    }
  }

  clearNight() {
    this._isNight = false;
    this._alpha = 0;
    for (const e of this._entries) {
      if (e.mesh) e.mesh.visible = false;
      if (e.mat) e.mat.opacity = 0;
      if (e.light) { e.light.visible = false; e.light.intensity = 0; }
    }
  }

  // Call from render loop for chimney flicker
  update(time) {
    if (!this._isNight || this._alpha < 0.1) return;
    for (const e of this._entries) {
      if (e.chimney && e.light && e.light.visible) {
        const wave = Math.sin(time * e.freq + e.phase) * 0.6
                   + Math.sin(time * e.freq * 2.1 + e.phase) * 0.3
                   + Math.sin(time * e.freq * 0.5 + e.phase) * 0.1;
        e.light.intensity = e.nightIntensity * this._alpha * (1 + wave * 0.18);
      }
    }
  }

  dispose() {
    for (const e of this._entries) {
      if (e.mesh) this.scene.remove(e.mesh);
      if (e.light) this.scene.remove(e.light);
      if (e.mat) { e.mat.map?.dispose(); e.mat.dispose(); }
    }
    this._entries = [];
    this._windowTex?.dispose();
    this._windowTexWarm?.dispose();
  }
}
