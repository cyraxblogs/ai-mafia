import * as THREE from 'three';
import { Character } from './Character.js';

// ── Circle geometry helper ────────────────────────────────────────────────────
// For N players, compute evenly-spaced positions around a circle whose radius
// grows to guarantee ~2.2 units of arc-spacing between adjacent characters.
// Player 0 (human) always sits at the "south" pole (closest to camera default).

const MIN_RADIUS   = 5.8; // minimum radius — prevents neighboring blocky models from crowding in close shots
const CHAR_SPACING = 3.9; // arc spacing between characters — keeps adjacent bodies from clipping at typical player counts
const SEAT_Y       = 5.1; // feet clear of voxel floor (voxel y=3 → top face y=4.0, need y >= 4.85)

export function computeSeats(playerCount, options = {}) {
  const {
    centerX = 0,
    centerZ = 0,
    radius: radiusOverride = null,
    startAngle = -Math.PI / 2,
  } = options;
  if (playerCount <= 0) return { seats: [], radius: radiusOverride ?? MIN_RADIUS };

  const radius = radiusOverride ?? Math.max(MIN_RADIUS, (playerCount * CHAR_SPACING) / (2 * Math.PI));

  const seats = [];
  for (let i = 0; i < playerCount; i++) {
    // angle for this seat around the circle
    const angle = startAngle + (i / playerCount) * Math.PI * 2;
    const x = centerX + radius * Math.cos(angle);
    const z = centerZ + radius * Math.sin(angle);

    // Three.js BoxGeometry: face index 4 = +Z face = "front" with the logo.
    // We need local +Z to point toward (0,0,0).
    // Direction toward center from (x,0,z) = (-cos(angle), 0, -sin(angle)).
    // After rotation.y = ry, local +Z = (sin(ry), 0, cos(ry)).
    // So sin(ry) = -cos(angle), cos(ry) = -sin(angle)
    // → ry = -(angle + π/2)
    const facingY = -(angle + Math.PI / 2);

    seats.push({
      position: new THREE.Vector3(x, SEAT_Y, z),
      rotation: facingY,
      radius,
      angle,
      index: i,
    });
  }
  return { seats, radius };
}

// ── CharacterManager ─────────────────────────────────────────────────────────
export class CharacterManager {
  constructor(scene) {
    this.scene = scene;
    this.characters = new Map();
    this.speechBubbles = new Map();
    this.thinkingBubbles = new Map();
    this.currentRadius = MIN_RADIUS;
    // Pre-allocated for updateSpeechBubbles — avoids GC every frame
    this._frustum  = new THREE.Frustum();
    this._projMat  = new THREE.Matrix4();
    // Scratch vector — reused by getWorldPosition() and updateSpeechBubbles()
    // instead of allocating new THREE.Vector3() and pos.clone() every frame.
    this._scratchPos = new THREE.Vector3();
  }

  spawnAll(players, _seats) {
    // Ignore pre-built village seats - compute exact positions for THIS player count
    const { seats, radius } = computeSeats(players.length);
    this.currentRadius = radius;
    this.computedSeats = { seats, radius }; // stored for night recall

    players.forEach((player, i) => {
      const seat = seats[i];
      const char = new Character(player, this.scene);
      char.group.position.copy(seat.position);
      char.group.rotation.y = seat.rotation;
      char.setBaseY(seat.position.y);
      this.characters.set(player.id, char);
    });

    return { seats, radius };
  }

  despawnAll() {
    for (const [, char] of this.characters) char.dispose();
    this.characters.clear();
    document.querySelectorAll('.speech-bubble-3d, .thinking-bubble').forEach(el => el.remove());
    this.speechBubbles.clear();
    this.thinkingBubbles.clear();
  }

  getCharacter(id) { return this.characters.get(id); }

  setSpeaking(id, on) {
    const char = this.getCharacter(id);
    if (!char) return;
    char.setState(on ? 'speaking' : 'idle');
    char.highlightSpeaking(on);
  }

  setThinking(id, on) {
    const char = this.getCharacter(id);
    if (!char) return;
    char.setState(on ? 'thinking' : 'idle');
  }

  playVoteAnimation(id) {
    this.getCharacter(id)?.playVoteAnimation();
  }

  playDeathAnimation(id, callback) {
    const char = this.getCharacter(id);
    if (!char) { callback?.(); return; }
    char.playDeathAnimation(callback);
  }

  getWorldPosition(id) {
    const char = this.getCharacter(id);
    if (!char) return null;
    // Reuse _scratchPos — callers must not hold onto this reference across frames
    char.group.getWorldPosition(this._scratchPos);
    return this._scratchPos;
  }

  getCurrentRadius() { return this.currentRadius; }

  update(delta, elapsed) {
    for (const [, char] of this.characters) {
      // Entity LOD: skip animation update for characters flagged as far away.
      // Their mesh stays visible but animations freeze — same as Minecraft EntityCulling.
      // The flag is set by main.js every 60 frames based on camera distance.
      if (char._lodSkip) continue;
      char.update(delta, elapsed);
    }
  }

  // ── Speech bubbles ──────────────────────────────────────────────────────────
  showSpeechBubble(id, text, durationMs) {
    this._removeSpeechBubble(id);
    const el = document.createElement('div');
    el.className = 'speech-bubble-3d';
    _applySpeechBubbleSizing(el, text);
    el.textContent = text.length > 180 ? text.slice(0, 180) + '…' : text;
    document.body.appendChild(el);
    const timeout = setTimeout(() => this._removeSpeechBubble(id), durationMs);
    this.speechBubbles.set(id, { el, timeout });
  }

  updateLiveSpeechBubble(id, text) {
    const b = this.speechBubbles.get(id);
    const t = text.length > 180 ? text.slice(0, 180) + '…' : text;
    if (b) {
      b.el.textContent = t;
      _applySpeechBubbleSizing(b.el, t);
    }
    else this.showSpeechBubble(id, t, 90000);
  }

  showThinkingBubble(id) {
    this._removeThinkingBubble(id);
    const el = document.createElement('div');
    el.className = 'thinking-bubble';
    el.innerHTML = `thinking <div class="thinking-dots"><span></span><span></span><span></span></div>`;
    document.body.appendChild(el);
    this.thinkingBubbles.set(id, el);
  }

  hideThinkingBubble(id) { this._removeThinkingBubble(id); }

  updateSpeechBubbles(camera) {
    const W = window.innerWidth, H = window.innerHeight;
    this._projMat.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this._frustum.setFromProjectionMatrix(this._projMat);

    // Single projection scratch vector — reused per bubble, no GC allocation
    const proj = this._scratchPos; // alias for readability inside closure

    const project = (id, el) => {
      const char = this.getCharacter(id);
      if (!char) { el.style.display = 'none'; return; }
      // Write world position directly into scratch — no clone() needed
      char.group.getWorldPosition(proj);
      if (!this._frustum.containsPoint(proj)) { el.style.display = 'none'; return; }

      // Project the point above the character's head (mutate scratch in place)
      proj.y += 2.45;
      const nx = proj.x, ny = proj.y, nz = proj.z;

      // Manual project into NDC — avoids Vector3.project() which calls clone()
      const e = camera.projectionMatrix.elements;
      const mw = camera.matrixWorldInverse;
      // Transform to view space
      const vx = mw.elements[0]*nx + mw.elements[4]*ny + mw.elements[8]*nz  + mw.elements[12];
      const vy = mw.elements[1]*nx + mw.elements[5]*ny + mw.elements[9]*nz  + mw.elements[13];
      const vz = mw.elements[2]*nx + mw.elements[6]*ny + mw.elements[10]*nz + mw.elements[14];
      const vw = mw.elements[3]*nx + mw.elements[7]*ny + mw.elements[11]*nz + mw.elements[15];
      const w  = e[3]*vx + e[7]*vy + e[11]*vz + e[15]*vw;
      if (w <= 0) { el.style.display = 'none'; return; }
      const pz = (e[2]*vx + e[6]*vy + e[10]*vz + e[14]*vw) / w;
      if (pz > 1) { el.style.display = 'none'; return; }
      const px = (e[0]*vx + e[4]*vy + e[8]*vz  + e[12]*vw) / w;
      const py = (e[1]*vx + e[5]*vy + e[9]*vz  + e[13]*vw) / w;

      const sx = (px * 0.5 + 0.5) * W;
      const sy = (-py * 0.5 + 0.5) * H;

      const bw = el.offsetWidth  || 260;
      const bh = el.offsetHeight || 60;

      const margin = 8;
      let left = Math.max(margin, Math.min(W - bw - margin, sx - bw * 0.5));
      let top  = Math.max(margin, Math.min(H - bh - margin, sy - bh - 4));

      el.style.display   = '';
      el.style.transform = `translate(${left}px, ${top}px)`;
    };

    for (const [id, { el }] of this.speechBubbles) project(id, el);
    for (const [id, el] of this.thinkingBubbles)   project(id, el);
  }

  clearAllSpeechBubbles() {
    for (const [id] of [...this.speechBubbles]) this._removeSpeechBubble(id);
    for (const [id] of [...this.thinkingBubbles]) this._removeThinkingBubble(id);
  }

  _removeSpeechBubble(id) {
    const b = this.speechBubbles.get(id);
    if (b) { clearTimeout(b.timeout); b.el.remove(); this.speechBubbles.delete(id); }
  }

  _removeThinkingBubble(id) {
    const el = this.thinkingBubbles.get(id);
    if (el) { el.remove(); this.thinkingBubbles.delete(id); }
  }
}

function _applySpeechBubbleSizing(el, text) {
  if (!el) return;
  el.classList.remove('speech-bubble-long', 'speech-bubble-xlong');
  const len = (text || '').length;
  if (len > 170) el.classList.add('speech-bubble-xlong');
  else if (len > 110) el.classList.add('speech-bubble-long');
}
