import * as THREE from 'three';
import { gsap } from 'gsap';

const MIN_DAY_DISTANCE = 0.01;

/**
 * LanternSystem — Minecraft / Sildur's-shader style lantern lighting.
 *
 * What changed vs the old system:
 *  - REMOVED: giant billboard Sprite globes that floated in air and looked wrong.
 *  - ADDED:   flat PlaneGeometry ground discs (rotated -90° on X) that project
 *             amber warmth onto the ground beneath each lantern, exactly like
 *             Minecraft block-light illumination with Sildur's shaders.
 *  - ADDED:   tiny "source corona" — a small, tightly-constrained billboard
 *             right at the lantern position (~2-4 units) so the lantern appears
 *             to glow, without the bloated air-globe effect.
 *  - KEPT:    PointLight per lantern (illuminates actual Three.js geometry).
 *  - KEPT:    organic sine-wave flicker on intensity + ground disc opacity.
 */
export class LanternSystem {
  constructor(scene) {
    this.scene   = scene;
    this._entries = [];
    this._isNight = false;
    this._modeNight = false;
    this._nightAlpha = 0;

    this._tickCount = 0;
    this._tickerCallback = (time) => this._update(time);
    gsap.ticker.add(this._tickerCallback);
  }

  /* ─────────────────────────────────────────────────────── public API ── */

  registerLantern(cx, cy, cz, options = {}) {
    const {
      color            = 0xffaa44,
      intensity        = 6.0,
      distance         = 22,
      decay            = 2.0,
      castShadow       = false,
      flickerStrength  = 0.045,
      distanceFlicker  = 0.10,
      flickerStartAlpha = 0.55,

      // Ground pool — the Minecraft "pool of warmth beneath the lantern"
      poolSize         = 20,        // world-units diameter of the disc
      poolOpacity      = 0.70,      // max opacity of ground disc at full night

      // Tiny source corona at the lantern itself (NOT a big globe)
      coronaSize       = 3.5,       // very small — just a gleam at the source
      coronaOpacity    = 0.80,
    } = options;

    /* ── PointLight ── */
    const light = new THREE.PointLight(color, 0, MIN_DAY_DISTANCE, decay);
    light.position.set(cx, cy, cz);
    light.castShadow = !!castShadow;
    light.visible = false;
    this.scene.add(light);

    /* ── Ground disc — projected pool of light beneath the lantern ── */
    const groundY = this._findGroundY(cy);
    const disc = this._makeGroundDisc(color, poolSize);
    disc.position.set(cx, groundY, cz);
    disc.visible = false;
    this.scene.add(disc);

    /* ── Tiny source corona — replaces the old giant globe sprite ── */
    const corona = this._makeCorona(color, coronaSize);
    corona.position.set(cx, cy, cz);
    corona.visible = false;
    this.scene.add(corona);

    const entry = {
      light,
      disc,
      corona,
      nightIntensity:     intensity,
      nightDistance:      distance,
      nightPoolOpacity:   poolOpacity,
      nightCoronaOpacity: coronaOpacity,
      flickerStrength,
      distanceFlicker,
      flickerStartAlpha,
      phase1:  Math.random() * Math.PI * 2,
      phase2:  Math.random() * Math.PI * 2,
      freq1:   3.2 + Math.random() * 1.3,
      freq2:   6.4 + Math.random() * 1.8,
    };

    this._entries.push(entry);
    this._applyEntry(entry, this._effectiveAlpha(), 0);
    return light;
  }

  setNightAlpha(alpha) {
    this._nightAlpha = THREE.MathUtils.clamp(alpha, 0, 1);
    this._applyAll();
  }

  setNightMode(isNight) {
    this._modeNight = !!isNight;
    this._applyAll();
  }

  dispose() {
    gsap.ticker.remove(this._tickerCallback);
    for (const e of this._entries) {
      this.scene.remove(e.light);
      this.scene.remove(e.disc);
      this.scene.remove(e.corona);
      e.disc.material.map?.dispose();
      e.disc.material.dispose();
      e.corona.material.map?.dispose();
      e.corona.material.dispose();
    }
    this._entries = [];
  }

  /* ─────────────────────────────────────────────────── internal helpers ── */

  _effectiveAlpha() {
    return this._modeNight ? this._nightAlpha : 0;
  }

  _applyAll() {
    const alpha = this._effectiveAlpha();
    this._isNight = this._modeNight && alpha > 0.5;
    for (const e of this._entries) this._applyEntry(e, alpha, 0);
  }

  _applyEntry(e, alpha, wave) {
    const iScale = 1 + wave * e.flickerStrength;
    const dScale = 1 + wave * e.distanceFlicker;
    const oScale = 1 + wave * e.flickerStrength * 0.5;

    const visible = alpha > 0.001;
    e.light.visible  = visible;
    e.disc.visible   = visible;
    e.corona.visible = visible;

    if (!visible) return;

    e.light.intensity = e.nightIntensity * iScale * alpha;
    e.light.distance  = THREE.MathUtils.lerp(MIN_DAY_DISTANCE, e.nightDistance * dScale, alpha);

    e.disc.material.opacity   = THREE.MathUtils.clamp(e.nightPoolOpacity  * oScale * alpha, 0, 1);
    e.corona.material.opacity = THREE.MathUtils.clamp(e.nightCoronaOpacity * alpha,         0, 1);
  }

  _update(time) {
    const alpha = this._effectiveAlpha();
    if (alpha <= 0.001) return;

    this._tickCount++;
    if (this._tickCount % 3 !== 0) return;

    for (const e of this._entries) {
      if (alpha < e.flickerStartAlpha || e.flickerStrength <= 0) {
        this._applyEntry(e, alpha, 0);
        continue;
      }
      const wave =
        Math.sin(time * e.freq1 + e.phase1) * 0.65 +
        Math.sin(time * e.freq2 + e.phase2) * 0.35;
      this._applyEntry(e, alpha, wave);
    }
  }

  /**
   * Estimate ground Y so the disc sits flat on the terrain.
   *  cy >= 8  → surface world (grass top layer y ≈ 3.08)
   *  cy >= 4  → low-ceiling interior
   *  cy <  4  → underground bunker
   */
  _findGroundY(cy) {
    if (cy >= 8) return 3.08;
    if (cy >= 4) return Math.max(1.08, cy - 3.5);
    return 1.08;
  }

  /* ──────────────────────────────── texture / geometry factories ── */

  /**
   * Ground disc — flat circle of amber warmth projected onto the floor.
   * Mimics Minecraft block-light bleed: bright centre, soft penumbra edge.
   */
  _makeGroundDisc(hexColor, size) {
    const tex = this._makeDiscTex(hexColor);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    mesh.rotation.x = -Math.PI / 2;   // lie flat on the ground
    mesh.renderOrder = 1;
    return mesh;
  }

  /**
   * Tiny billboard corona — just 3-4 units wide, right at the lantern source.
   * Gives the lantern block a hot gleam without the floating-globe artifact.
   */
  _makeCorona(hexColor, size) {
    const tex  = this._makeCoronaTex(hexColor);
    const mat  = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(size, size, 1);
    return sprite;
  }

  /* ──────────────────────── canvas texture generators ── */

  _makeDiscTex(hexColor) {
    const c   = new THREE.Color(hexColor);
    const r   = Math.round(c.r * 255);
    const g   = Math.round(c.g * 255);
    const b   = Math.round(c.b * 255);
    const cv  = document.createElement('canvas');
    cv.width  = cv.height = 256;
    const ctx = cv.getContext('2d');

    // Minecraft block-light style: sharp warm centre, large soft falloff
    const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0.00, `rgba(255,${Math.min(255,g+60)},${b},0.90)`);
    grad.addColorStop(0.12, `rgba(${r},${g},${b},0.72)`);
    grad.addColorStop(0.30, `rgba(${r},${g},${b},0.42)`);
    grad.addColorStop(0.55, `rgba(${r},${g},${b},0.18)`);
    grad.addColorStop(0.78, `rgba(${r},${g},${b},0.06)`);
    grad.addColorStop(1.00, `rgba(${r},${g},${b},0.00)`);

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(cv);
  }

  _makeCoronaTex(hexColor) {
    const c   = new THREE.Color(hexColor);
    const r   = Math.round(c.r * 255);
    const g   = Math.round(c.g * 255);
    const b   = Math.round(c.b * 255);
    const cv  = document.createElement('canvas');
    cv.width  = cv.height = 64;   // small canvas — tight source glow only
    const ctx = cv.getContext('2d');

    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0.00, 'rgba(255,255,235,1.00)');
    grad.addColorStop(0.20, `rgba(255,${Math.min(255,g+80)},${b},0.85)`);
    grad.addColorStop(0.45, `rgba(${r},${g},${b},0.40)`);
    grad.addColorStop(0.75, `rgba(${r},${g},${b},0.10)`);
    grad.addColorStop(1.00, `rgba(${r},${g},${b},0.00)`);

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(cv);
  }
}
