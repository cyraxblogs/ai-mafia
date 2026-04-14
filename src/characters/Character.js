import * as THREE from 'three';
import { gsap } from 'gsap';
import { createLogoTexture, createHumanInitialTexture } from './LogoTextures.js';

export class Character {
  constructor(playerData, scene) {
    this.data = playerData;
    this.scene = scene;
    this.group = new THREE.Group();
    this.parts = {};
    this.state = 'idle'; // idle | speaking | thinking | dead | voting
    this.animTime = Math.random() * Math.PI * 2;
    this.speechBubbleEl = null;
    this.thinkingBubbleEl = null;
    this.isGrayscale = false;

    // Pre-allocated emissive colors — reused with .set() to avoid GC pressure
    // from new THREE.Color() on every highlightSpeaking() call (called during AI speech).
    this._emissiveOn  = new THREE.Color(0x223311);
    this._emissiveOff = new THREE.Color(0x000000);

    this._build();
    scene.add(this.group);

    // Characters animate every frame — must NOT be frozen by the static-matrix pass.
    // Explicitly keep matrixAutoUpdate=true for this group and all child meshes.
    this.group.matrixAutoUpdate = true;
    Object.values(this.parts).forEach(p => { if (p) p.matrixAutoUpdate = true; });

    // Mark shadows dirty so the new character casts a shadow immediately
    if (window._perfOptimizer) window._perfOptimizer.markShadowsDirty();
  }

  _build() {
    const { logoColor, logoKey, initial, name, isHuman, customTexture } = this.data;

    // Materials
    const bodyColor = new THREE.Color(logoColor || '#888888');
    const bodyMat = new THREE.MeshLambertMaterial({ color: bodyColor });
    const darkMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(logoColor || '#888888').multiplyScalar(0.6) });

    // ── Head (6 materials - front face = logo/custom image) ─────────────────
    const headGeo = new THREE.BoxGeometry(1.1, 1.1, 1.1);
    let logoTex;
    if (isHuman) {
      // Use uploaded custom texture if available, otherwise draw initial letter
      logoTex = customTexture || createHumanInitialTexture(initial || 'H', 128);
    } else {
      logoTex = createLogoTexture(logoKey, 128);
    }

    // side, side, top, bottom, front(logo), back
    const headMats = [
      new THREE.MeshLambertMaterial({ color: bodyColor }),  // right
      new THREE.MeshLambertMaterial({ color: bodyColor }),  // left
      new THREE.MeshLambertMaterial({ color: bodyColor.clone().multiplyScalar(1.2) }), // top
      new THREE.MeshLambertMaterial({ color: bodyColor.clone().multiplyScalar(0.8) }), // bottom
      // MeshBasicMaterial for the logo face — not affected by scene lighting so
      // the logo always renders at full brightness regardless of day/night
      new THREE.MeshBasicMaterial({ map: logoTex }),        // front (LOGO) — unlit
      new THREE.MeshLambertMaterial({ color: bodyColor }),  // back
    ];
    this.parts.head = new THREE.Mesh(headGeo, headMats);
    this.parts.head.position.y = 1.85;
    this.parts.head.castShadow = true;

    // ── Torso ───────────────────────────────────────────────────────────────
    const torsoGeo = new THREE.BoxGeometry(1.1, 1.4, 0.6);
    this.parts.torso = new THREE.Mesh(torsoGeo, bodyMat);
    this.parts.torso.position.y = 0.95;
    this.parts.torso.castShadow = true;

    // ── Arms ────────────────────────────────────────────────────────────────
    const armGeo = new THREE.BoxGeometry(0.42, 1.25, 0.42);
    this.parts.leftArm = new THREE.Mesh(armGeo, darkMat);
    this.parts.leftArm.position.set(-0.78, 0.95, 0);
    this.parts.leftArm.castShadow = true;

    this.parts.rightArm = new THREE.Mesh(armGeo.clone(), darkMat);
    this.parts.rightArm.position.set(0.78, 0.95, 0);
    this.parts.rightArm.castShadow = true;

    // ── Legs ────────────────────────────────────────────────────────────────
    const legGeo = new THREE.BoxGeometry(0.45, 1.3, 0.45);
    this.parts.leftLeg = new THREE.Mesh(legGeo, darkMat);
    this.parts.leftLeg.position.set(-0.28, -0.3, 0);
    this.parts.leftLeg.castShadow = true;

    this.parts.rightLeg = new THREE.Mesh(legGeo.clone(), darkMat);
    this.parts.rightLeg.position.set(0.25, -0.25, 0);
    this.parts.rightLeg.castShadow = true;

    // Name tag (billboard)
    this._buildNameTag(name);

    // Assemble
    Object.values(this.parts).forEach(p => this.group.add(p));
  }

  _buildNameTag(name) {
    // Name + role on separate lines, like the reference video
    const role  = this.data.role || '';
    const canvas = document.createElement('canvas');
    canvas.width = 320; canvas.height = 56;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 320, 80);

    // Background pill
    ctx.fillStyle = 'rgba(0,0,0,0.82)';
    roundRect(ctx, 0, 0, 320, 80, 12);
    ctx.fill();

    // Name line
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name.substring(0, 18), 160, 30);

    // Role line NOT drawn initially — only shown when showRole(true) is called (spectator mode)

    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    this.nameSprite = new THREE.Sprite(mat);
    this.nameSprite.scale.set(3.0, 0.55, 1);
    this.nameSprite.position.y = 3.0;
    this._nameTag = { canvas, ctx, tex, name, role };
    this.group.add(this.nameSprite);
  }

  // Show or hide the role label on the name tag (spectator/reveal mode)
  showRole(visible) {
    if (!this._nameTag) return;
    const { canvas, ctx, tex, name, role } = this._nameTag;
    ctx.clearRect(0, 0, 320, 80);
    ctx.fillStyle = 'rgba(0,0,0,0.82)';
    roundRect(ctx, 0, 0, 320, 80, 12);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name.substring(0, 18), 160, visible ? 28 : 40);
    if (visible && role) {
      const roleColors = { mafia:'#ef4444', sheriff:'#fcd34d', doctor:'#60a5fa', villager:'#86efac' };
      const roleLabels = { mafia:'Mafia', sheriff:'Sheriff', doctor:'Doctor', villager:'Villager' };
      ctx.fillStyle = roleColors[role] || '#9ca3af';
      ctx.font = 'bold 18px Arial, sans-serif';
      ctx.fillText(roleLabels[role] || role, 160, 57);
    }
    tex.needsUpdate = true;
  }

  placeSeat(seat) {
    this.group.position.copy(seat.position);
    this.group.rotation.y = seat.rotation;
  }

  update(delta, elapsed) {
    // Skip update entirely for hidden or dead characters — no visual change needed
    if (!this.group.visible) return;
    this.animTime += delta;
    const t = this.animTime;

    if (this.state === 'dead') return;

    switch (this.state) {
      case 'idle':
        // Gentle bob
        this.group.position.y = this._baseY + Math.sin(t * 1.5) * 0.03;
        // Slight arm sway
        this.parts.leftArm.rotation.z = Math.sin(t * 0.8) * 0.05 + 0.1;
        this.parts.rightArm.rotation.z = -Math.sin(t * 0.8) * 0.05 - 0.1;
        this.parts.head.rotation.y = Math.sin(t * 0.4) * 0.05;
        break;

      case 'speaking':
        // Subtle vertical bob only — no group lean or head rotation.y.
        // The old rotation.x lean + head.rotation.y oscillation caused the
        // character to visually drift left/right from the camera angle.
        this.group.position.y = this._baseY + Math.sin(t * 2) * 0.04;
        this.group.rotation.x = 0;             // stay perfectly upright
        this.group.rotation.z = 0;             // no roll
        // Head: slight nod only (x-axis), no left/right turning
        this.parts.head.rotation.y = 0;
        this.parts.head.rotation.x = Math.sin(t * 1.4) * 0.06 - 0.02;
        // Arms: small gesture, symmetric amplitude so no net body shift
        this.parts.leftArm.rotation.z  =  Math.sin(t * 1.8) * 0.12 + 0.1;
        this.parts.rightArm.rotation.z = -Math.sin(t * 1.8 + 0.4) * 0.12 - 0.1;
        break;

      case 'thinking':
        this.parts.head.rotation.y = Math.sin(t * 1.2) * 0.25;
        this.parts.head.rotation.x = -0.1;
        this.group.position.y = this._baseY + Math.sin(t * 1) * 0.02;
        break;

      case 'voting':
        this.parts.rightArm.rotation.z = -1.5;
        this.parts.rightArm.position.y = 1.2;
        break;
    }
  }

  setState(state) {
    this.state = state;
    // Always reset group-level rotation so no residual lean carries into
    // the next state (the old code only reset on 'idle', leaving rotation.x
    // set if a character went speaking→voting or speaking→thinking).
    this.group.rotation.x = 0;
    this.group.rotation.z = 0;
    if (state !== 'voting') {
      this.parts.rightArm.rotation.z = -0.1;
      this.parts.rightArm.position.y = 0.95;
    }
  }

  playVoteAnimation(callback) {
    this.setState('voting');
    setTimeout(() => {
      this.setState('idle');
      if (callback) callback();
    }, 1000);
  }

  playDeathAnimation(callback) {
    this.state = 'dead';
    let cbFired = false;
    const fire = () => { if (!cbFired) { cbFired = true; if (callback) callback(); } };

    // Tip over sideways
    gsap.to(this.group.rotation, { z: Math.PI / 2, duration: 1.2, ease: 'power2.in' });
    gsap.to(this.group.position, {
      y: this._baseY - 0.4, duration: 1.5, ease: 'power2.in',
      onComplete: () => {
        this._applyGrayscale();
        this.group.position.y = -100;
        fire();
      }
    });
    // Safety: if GSAP tween gets killed or never completes, fire after 2.2s anyway
    setTimeout(() => {
      this._applyGrayscale();
      this.group.position.y = -100;
      fire();
    }, 2200);
  }

  teleportToGraveyard(position) {
    this.group.rotation.set(0, 0, 0);
    this.group.position.copy(position);
    if (window._perfOptimizer) window._perfOptimizer.markShadowsDirty();
    this._baseY = position.y;
    this.group.scale.setScalar(0.8);
    this.group.traverse(obj => {
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach(m => { m.opacity = 0.4; m.transparent = true; });
        } else {
          obj.material.opacity = 0.4;
          obj.material.transparent = true;
        }
      }
    });
  }

  _applyGrayscale() {
    this.isGrayscale = true;
    this.group.traverse(obj => {
      if (obj.isMesh && obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(mat => {
          if (mat.color) mat.color.set(0x808080);
          if (mat.map) {
            // Desaturate texture by tinting
          }
        });
      }
    });
  }

  setBaseY(y) {
    this._baseY = y;
    this.group.position.y = y;
  }
  highlightSpeaking(on) {
    // Use pre-allocated Color instances with .copy() — zero allocation path
    const target = on ? this._emissiveOn : this._emissiveOff;
    this.group.traverse(obj => {
      if (obj.isMesh && obj.material && !Array.isArray(obj.material)) {
        obj.material.emissive.copy(target);
      }
    });
  }

  dispose() {
    this.scene.remove(this.group);
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
