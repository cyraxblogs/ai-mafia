import * as THREE from 'three';
import { gsap } from 'gsap';

// ─────────────────────────────────────────────────────────────────────────────
// CinematicCamera — film-director shot system
// Implements: establishing shots, close-ups, over-the-shoulder, reaction shots,
//             cinematic cuts, blended transitions, night-location cinematics.
//
// Character geometry reference (feet y=3):
//   feet      → y ≈ 3.0
//   waist     → y ≈ 4.2
//   chest     → y ≈ 4.8
//   neck/chin → y ≈ 5.4
//   eyes      → y ≈ 5.7
//   head top  → y ≈ 6.1
// ─────────────────────────────────────────────────────────────────────────────

// ── Camera framing constants ──────────────────────────────────────────────
// Character geometry (SEAT_Y=3.8): feet y≈2.95, torso y≈4.75, head y≈5.65, tag y≈6.5
//
// KEY DESIGN: camera sits INSIDE the circle at the centre-side,
// pointing OUTWARD at the speaker's FACE (not their back).
// Characters face outward (away from centre), so camera from inside = face shot.
//
// Restored wider day-speaker framing keeps the full character and nameplate readable:
//   - Full body always in frame (head-to-toe)
//   - Max 3 players visible at once for ALL player counts 4-25
//
// Character geometry (SEAT_Y=5.1): feet≈4.25, torso≈6.05, head≈6.95, tag≈7.8
const BODY_MID_Y     = 5.8;  // mid-torso LookAt — used by the wider overview shots
const FACE_Y         = 6.95; // head centre
const LOOK_Y         = 5.52; // lift look target slightly so the speaker badge stays clear of the top edge
const CAM_Y          = 7.00; // lower camera a touch for a flatter, more readable portrait angle
const CAM_TO_SPEAKER_MAX = 5.42; // widen day speaker shots so the full body + name remain comfortably framed
const CAM_TO_SPEAKER_MIN = 5.08; // keep crowded tables readable without snapping to a tighter crop
const DAY_SPEAKER_FAR = 320;
const DAY_OVERVIEW_FAR = 350;

// Shot type constants — used in _shot() calls throughout
const SHOT = {
  ESTABLISHING : 'establishing',
  WIDE         : 'wide',
  MEDIUM       : 'medium',
  CLOSE        : 'close',
  EXTREME_CLOSE: 'extreme_close',
  OVER_SHOULDER: 'over_shoulder',
  REACTION     : 'reaction',
  DUTCH_ANGLE  : 'dutch',
  LOW_ANGLE    : 'low',
  HIGH_ANGLE   : 'high',
  TRACKING     : 'tracking',
};

export class CinematicCamera {
  constructor(camera, scene) {
    this.camera      = camera;
    this.scene       = scene;
    this._tween      = null;
    this._radius     = 7;
    this._total      = 6;
    this.lobbyRadius = 55;
    this.lobbyHeight = 28;

    // Active shot sequence state
    this._shotSeq      = null;   // current gsap timeline
    this._shotCallback = null;

    // Location info for night building shots
    // All camera positions are OUTSIDE the character cluster, pointing INWARD.
    // Key rule: camera Z must be SOUTH of the characters (higher Z = south in this world)
    // so we look northward at faces, not at backs or walls.
    this._buildingViews = {
      mafia: {
        // Mafia Bunker: table at (-3, 48), characters circle it at radius ~4.5
        // Camera from south (high Z), looking north at the circle
        establishing : { cam: new THREE.Vector3(-3, 12, 62),  look: new THREE.Vector3(-3, 4, 48) },
        wide         : { cam: new THREE.Vector3(-3,  9, 60),  look: new THREE.Vector3(-3, 4, 48) },
        table        : { cam: new THREE.Vector3(-3,  7, 56),  look: new THREE.Vector3(-3, 3, 48) },
        characterWide: { cam: new THREE.Vector3(-3,  8, 58),  look: new THREE.Vector3(-3, 4, 48) },
        characterClose:{ cam: new THREE.Vector3(-3,  6, 54),  look: new THREE.Vector3(-3, 4.5, 48) },
        profile      : { cam: new THREE.Vector3(10,  6, 53),  look: new THREE.Vector3(-3, 4, 48) },
      },
      sheriff: {
        // FIX: CENTRES in engine.js changed to [25,-41] so chars now face EAST (+X).
        // All cameras placed on east wall (x=43-47), pointing west at character faces.
        // Characters cluster: x=34-40, z=-38 to -44 (inside office: z=-36 to z=-45).
        // Cameras centered on median Z=-41 so no char is edge-of-frame.
        establishing : { cam: new THREE.Vector3(47, 12, -41), look: new THREE.Vector3(35, 5.5, -41) },
        wide         : { cam: new THREE.Vector3(47,  9, -41), look: new THREE.Vector3(35, 5.5, -41) },
        desk         : { cam: new THREE.Vector3(46,  8, -41), look: new THREE.Vector3(35, 5.5, -41) },
        characterWide: { cam: new THREE.Vector3(46,  8, -41), look: new THREE.Vector3(35, 5.5, -41) },
        characterClose:{ cam: new THREE.Vector3(43,  7, -41), look: new THREE.Vector3(35, 5.5, -41) },
        characterMed : { cam: new THREE.Vector3(44,  7.5, -41), look: new THREE.Vector3(35, 5.5, -41) },
        profile      : { cam: new THREE.Vector3(45,  7, -44), look: new THREE.Vector3(35, 5.5, -40) },
        lowAngle     : { cam: new THREE.Vector3(43,  4.5, -41), look: new THREE.Vector3(35, 7.0, -41) },
      },
      doctor: {
        // Hospital: cx=-36, cz=-36. Floor x:-47 to -25, z:-45 to -27.
        // Doctor CENTRES=(-36,-28). Chars at (-36,-36). Direction=(0,+8)=+Z but
        // rotation.y = atan2(-dx,-dz) = atan2(0,-8) = PI → chars face -Z (NORTH).
        // Camera must be NORTH of chars (lower Z, toward -45 wall) looking south (+Z) to see face.
        // Safe zone: z=-41 to -43 (inside north half, away from wall at -45).
        establishing : { cam: new THREE.Vector3(-36, 10, -43), look: new THREE.Vector3(-36, 5.5, -36) },
        wide         : { cam: new THREE.Vector3(-36,  8, -42), look: new THREE.Vector3(-36, 5.5, -36) },
        table        : { cam: new THREE.Vector3(-36,  7, -41), look: new THREE.Vector3(-36, 5,   -36) },
        ward         : { cam: new THREE.Vector3(-36,  8, -42), look: new THREE.Vector3(-36, 5.5, -36) },
        characterWide: { cam: new THREE.Vector3(-36,  8, -42), look: new THREE.Vector3(-36, 5.5, -36) },
        characterClose:{ cam: new THREE.Vector3(-36,  7, -41), look: new THREE.Vector3(-36, 5.8, -36) },
        characterMed : { cam: new THREE.Vector3(-36,  7.5, -41.5), look: new THREE.Vector3(-36, 5.5, -36) },
        profile      : { cam: new THREE.Vector3(-29,  7, -42), look: new THREE.Vector3(-36, 5.5, -36) },
        lowAngle     : { cam: new THREE.Vector3(-36,  5.0, -41), look: new THREE.Vector3(-36, 7.0, -36) },
      },
      villager: {
        establishing : { cam: new THREE.Vector3(0, 15, 25), look: new THREE.Vector3(0, 3, 0) },
        wide         : { cam: new THREE.Vector3(0, 10, 20), look: new THREE.Vector3(0, 3, 0) },
        characterWide: { cam: new THREE.Vector3(8,  6, 12), look: new THREE.Vector3(0, 4, 0) },
        characterClose:{ cam: new THREE.Vector3(5,  5, 8),  look: new THREE.Vector3(0, 5, 0) },
      },
    };
    
    // NEW: Role camera presets for clean character shots
    this._roleCameraPresets = {
      // Distance multipliers for framing characters
      framing: {
        fullBody: { distance: 5.0, height: 2.0 },    // Shows head to toe
        medium:   { distance: 3.5, height: 1.5 },    // Shows waist up
        close:    { distance: 2.2, height: 1.0 },    // Shows chest up
        extreme:  { distance: 1.3, height: 0.8 },    // Face only
      },
      // Angle presets for dramatic shots
      angles: {
        eyeLevel: 0,           // Neutral
        lowAngle: -0.3,        // Looking up (powerful)
        highAngle: 0.3,        // Looking down (vulnerable)
        dutch: 0.15,           // Tilted (tense)
      },
    };
  }

  setCircle(radius, totalPlayers) {
    this._radius = radius;
    this._total  = totalPlayers;
  }

  _kill() {
    if (this._tween)   { this._tween.kill();   this._tween   = null; }
    if (this._shotSeq) { this._shotSeq.kill(); this._shotSeq = null; }
  }

  _setFarClip(far) {
    if (Math.abs((this.camera.far || 0) - far) < 0.5) return;
    this.camera.far = far;
    this.camera.updateProjectionMatrix();
  }

  _seatAngle(idx)  { return (idx / this._total) * Math.PI * 2 - Math.PI / 2; }
  _seatPos(idx)    { const a = this._seatAngle(idx); return { x: this._radius * Math.cos(a), z: this._radius * Math.sin(a) }; }
  _seatWorld(idx)  { const {x,z} = this._seatPos(idx); return new THREE.Vector3(x, LOOK_Y, z); }

  // ── Lobby ─────────────────────────────────────────────────────────────────
  setLobbyView() {
    this._setFarClip(350);
    this.camera.position.set(0, this.lobbyHeight, this.lobbyRadius);
    this.camera.lookAt(0, 4, 0);
  }

  updateLobbyOrbit(elapsed) {
    const a = elapsed * 0.08;
    this.camera.position.x = Math.sin(a) * this.lobbyRadius;
    this.camera.position.z = Math.cos(a) * this.lobbyRadius;
    this.camera.position.y = this.lobbyHeight + Math.sin(elapsed * 0.2) * 2;
    this.camera.lookAt(0, 4, 0);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DAY PHASE CINEMATICS
  // ═══════════════════════════════════════════════════════════════════════════

  // Dramatic day-start: aerial → descent → settle on circle
  playDayStartTransition(onComplete) {
    this._kill();
    const cam = this.camera;
    const r   = this._radius;
    this._setFarClip(DAY_OVERVIEW_FAR);
    // Pullback overview: above centre, slight Z offset, sees full circle
    const ovY = r * 1.4 + 6;
    const ovZ = r * 0.5 + 4;
    const tl  = gsap.timeline({ onComplete });

    // Phase 1: Dramatic aerial drop from sky
    tl.to(cam.position, {
      x: 0, y: 70, z: 15,
      duration: 1.0, ease: 'power2.in',
      onUpdate: () => cam.lookAt(0, 0, 0),
    });
    // Phase 2: Swoop to overview height
    tl.to(cam.position, {
      x: 0, y: ovY + 10, z: ovZ + 8,
      duration: 1.8, ease: 'power3.out',
      onUpdate: () => cam.lookAt(0, BODY_MID_Y, 0),
    });
    // Phase 3: Settle into overview position (sees all players from centre-top)
    tl.to(cam.position, {
      x: 0, y: ovY, z: ovZ,
      duration: 0.9, ease: 'power1.out',
      onUpdate: () => cam.lookAt(0, BODY_MID_Y, 0),
    });
    this._tween = tl;
  }

  // Focus on a speaker — cycle through shot types for cinematic variety
  // shotVariant: 0=medium, 1=close, 2=over-shoulder, 3=low-angle, 4=medium (loops)
  // focusOnSeat: camera INSIDE the circle pointing at speaker's FACE.
  // Characters face outward (away from centre), so camera from centre-side = face shot.
  // Keep the wider legacy framing even on larger tables so nameplates remain
  // visible above the speaker during amphitheater dialogue.
  // shotVariant kept for API compat but ignored — same clean shot every time.
  focusOnSeat(seatIndex, totalSeats, _shotVariant = 0) {
    this._kill();
    if (totalSeats) this._total = totalSeats;

    const cam   = this.camera;
    this._setFarClip(DAY_SPEAKER_FAR);
    const angle = this._seatAngle(seatIndex);
    const {x: sx, z: sz} = this._seatPos(seatIndex);
    const r     = this._radius;

    // Unit vector FROM centre TOWARD speaker
    const ux = Math.cos(angle), uz = Math.sin(angle);

    // Derive a table-size-aware shot distance: on crowded tables, pull the
    // camera closer to the speaker so neighboring bodies fall outside frame.
    const seatAngleStep = (Math.PI * 2) / Math.max(3, this._total);
    const targetOffAxis = (58 * Math.PI) / 180;
    const desiredCamToSpeaker =
      r * (1 - Math.cos(seatAngleStep)) +
      (r * Math.sin(seatAngleStep)) / Math.tan(targetOffAxis);
    const camToSpeaker = Math.min(
      CAM_TO_SPEAKER_MAX,
      Math.max(CAM_TO_SPEAKER_MIN, desiredCamToSpeaker)
    );

    // Camera sits camToSpeaker units CLOSER to centre than the speaker.
    // r_cam = r - camToSpeaker, clamped ≥ 0.5 so camera is always inside.
    const r_cam = Math.max(0.5, r - camToSpeaker);
    const cx    = ux * r_cam;
    const cz    = uz * r_cam;

    this._tween = gsap.to(cam.position, {
      x: cx, y: CAM_Y, z: cz,
      duration: 0.75, ease: 'power2.inOut',
      // Look at speaker's torso — shows face + full body
      onUpdate: () => cam.lookAt(sx, LOOK_Y, sz),
    });
  }

  // Reaction shot — cut to a random NON-speaker looking at the speaker
  playReactionShot(speakerSeatIndex, reactionSeatIndex) {
    this._kill();
    const cam  = this.camera;
    this._setFarClip(DAY_SPEAKER_FAR);
    const {x: sx, z: sz} = this._seatPos(speakerSeatIndex);
    const {x: rx, z: rz} = this._seatPos(reactionSeatIndex);

    // Camera hovers just behind the reaction player's shoulder
    const cx = rx * 0.65, cz = rz * 0.65;
    this._tween = gsap.to(cam.position, {
      x: cx, y: FACE_Y, z: cz,
      duration: 0.45, ease: 'power3.out',
      onUpdate: () => cam.lookAt(sx, LOOK_Y, sz),
    });
  }

  // Pull back to full-circle overview
  pullBackToTable() {
    this._kill();
    this._setFarClip(DAY_OVERVIEW_FAR);
    // Pull camera to centre-top so all players are visible around the circle.
    // Height and Z scale with radius to always fit the full ring.
    const r     = this._radius;
    const viewZ = r * 0.5 + 4;        // slight Z offset for natural perspective
    const viewY = r * 1.4 + 6;        // enough height to see entire circle
    this._tween = gsap.to(this.camera.position, {
      x: 0, y: viewY, z: viewZ,
      duration: 1.2, ease: 'power2.inOut',
      onUpdate: () => this.camera.lookAt(0, BODY_MID_Y, 0),
    });
  }

  // Slow orbit around circle while talking (ambient shot)
  startOrbitShot(targetSeatIndex, orbitSpeed = 0.005) {
    this._kill();
    const {x: sx, z: sz} = this._seatPos(targetSeatIndex);
    let angle = Math.atan2(this.camera.position.z, this.camera.position.x);
    const r   = this._radius * 0.7;
    const cam = this.camera;

    // GSAP ticker for continuous orbit
    this._orbitTicker = gsap.ticker.add(() => {
      angle += orbitSpeed;
      cam.position.x = Math.cos(angle) * r;
      cam.position.z = Math.sin(angle) * r;
      cam.position.y = CAM_Y;
      cam.lookAt(sx, LOOK_Y, sz);
    });
  }

  stopOrbit() {
    if (this._orbitTicker) {
      gsap.ticker.remove(this._orbitTicker);
      this._orbitTicker = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NIGHT PHASE CINEMATICS — per the PDF deep dive
  //
  // Each building gets a proper cinematic sequence:
  //   1. Dramatic sweep/pull-back from amphitheater
  //   2. Establishing shot of the building exterior
  //   3. Cut into interior wide
  //   4. Speaker close-up cuts timed to dialogue
  //   5. Cutaway/reaction shots
  //   6. Return sweep
  // ═══════════════════════════════════════════════════════════════════════════

  // Called at night-start — dramatic pull-back to show village going dark
  playNightFallSweep(onComplete) {
    this._kill();
    const cam = this.camera;
    const tl  = gsap.timeline({ onComplete });

    // Rise high and wide — God's-eye view of the whole village
    tl.to(cam.position, {
      x: 15, y: 60, z: 20,
      duration: 2.2, ease: 'power2.inOut',
      onUpdate: () => cam.lookAt(0, 3, 0),
    });
    // Slow pan across darkened village
    tl.to(cam.position, {
      x: -10, y: 55, z: 10,
      duration: 2.0, ease: 'power1.inOut',
      onUpdate: () => cam.lookAt(0, 3, 0),
    });

    this._tween = tl;
  }

  // Cinematic transition INTO a building — establishing exterior → interior
  // role: 'mafia' | 'sheriff' | 'doctor'
  // onInteriorReady: called when camera is settled inside and ready for dialogue
  playBuildingEntrance(role, onInteriorReady) {
    this._kill();
    const views = this._buildingViews[role];
    if (!views) { if (onInteriorReady) onInteriorReady(); return; }

    // Single smooth cut to the wide interior — no 3-shot sequence that disorients
    const wide = views.wide || views.establishing;
    const cam  = this.camera;
    const tl   = gsap.timeline({ onComplete: onInteriorReady });

    tl.to(cam.position, {
      x: wide.cam.x, y: wide.cam.y, z: wide.cam.z,
      duration: 0.9, ease: 'power2.inOut',
      onUpdate: () => cam.lookAt(wide.look.x, wide.look.y, wide.look.z),
    });
    tl.to({}, { duration: 0.3 }); // brief hold

    this._shotSeq = tl;
  }

  // Safe character shot — falls back to a room-wide view offset from the character.
  // Used when we can't guarantee the close shot won't clip into a wall.
  // Pulls camera 10+ units in the character's forward direction (away from walls).
  safeCharacterShot(charPos, facing, role) {
    // Use the room's characterWide preset — always safe
    const roomView = this._buildingViews[role]?.characterWide;
    if (roomView) {
      this._kill();
      const look = roomView.look;
      this._tween = gsap.to(this.camera.position, {
        x: roomView.cam.x, y: roomView.cam.y, z: roomView.cam.z,
        duration: 1.0, ease: 'power2.inOut',
        onUpdate: () => this.camera.lookAt(look.x, look.y, look.z),
      });
      return;
    }
    // Absolute fallback: pull 12 units in character's forward dir, height +4
    this._kill();
    const fwdX = Math.sin(facing), fwdZ = Math.cos(facing);
    const camX = charPos.x + fwdX * 12;
    const camY = charPos.y + 4;
    const camZ = charPos.z + fwdZ * 12;
    const look = new THREE.Vector3(charPos.x, charPos.y + 1.6, charPos.z);
    this._tween = gsap.to(this.camera.position, {
      x: camX, y: camY, z: camZ,
      duration: 1.0, ease: 'power2.inOut',
      onUpdate: () => this.camera.lookAt(look.x, look.y, look.z),
    });
  }

  // Cinematic cut to a SPECIFIC character inside a building
  // charPos: THREE.Vector3 of the character's position
  // shotType: SHOT.CLOSE | SHOT.MEDIUM | SHOT.OVER_SHOULDER etc.
  cutToCharacter(charPos, shotType = SHOT.MEDIUM, facingAngle = 0, onComplete) {
    this._kill();
    const cam = this.camera;

    // Pull look target to face/chest
    const lookTarget = new THREE.Vector3(charPos.x, charPos.y + 1.6, charPos.z);

    let camOffset;
    switch (shotType) {
      case SHOT.CLOSE:
        // "Close" for interior rooms — still needs 6+ units to stay outside walls
        camOffset = new THREE.Vector3(
          charPos.x - Math.sin(facingAngle) * 6.0 + 0.4,
          charPos.y + 1.5,
          charPos.z - Math.cos(facingAngle) * 6.0
        );
        break;
      case SHOT.EXTREME_CLOSE:
        // Extreme close — 5 units (don't go tighter indoors)
        camOffset = new THREE.Vector3(
          charPos.x - Math.sin(facingAngle) * 5.0,
          charPos.y + 1.8,
          charPos.z - Math.cos(facingAngle) * 5.0
        );
        break;
      case SHOT.LOW_ANGLE:
        // Low angle — camera lower and further back
        camOffset = new THREE.Vector3(
          charPos.x - Math.sin(facingAngle) * 7.0,
          charPos.y + 0.4,
          charPos.z - Math.cos(facingAngle) * 7.0
        );
        break;
      case SHOT.HIGH_ANGLE:
        // High angle — elevated and further back
        camOffset = new THREE.Vector3(
          charPos.x - Math.sin(facingAngle) * 6.0,
          charPos.y + 4.5,
          charPos.z - Math.cos(facingAngle) * 6.0
        );
        break;
      case SHOT.OVER_SHOULDER:
        // Over-the-shoulder — camera behind & slightly to side, safe distance
        camOffset = new THREE.Vector3(
          charPos.x + Math.sin(facingAngle) * 5.0 + 1.2,
          charPos.y + 1.4,
          charPos.z + Math.cos(facingAngle) * 5.0
        );
        break;
      case SHOT.DUTCH_ANGLE:
      case 'dutch':
        camOffset = new THREE.Vector3(
          charPos.x - Math.sin(facingAngle) * 6.5 - 1.5,
          charPos.y + 2.5,
          charPos.z - Math.cos(facingAngle) * 6.5
        );
        break;
      case 'reaction':
        // Reaction — behind the listener, safe distance
        camOffset = new THREE.Vector3(
          charPos.x + Math.sin(facingAngle) * 5.0 + 0.8,
          charPos.y + 1.35,
          charPos.z + Math.cos(facingAngle) * 5.0
        );
        break;
      default: // MEDIUM — full body, camera in front of face, safe distance
        camOffset = new THREE.Vector3(
          charPos.x + Math.sin(facingAngle) * 8.0,
          charPos.y + 2.2,
          charPos.z + Math.cos(facingAngle) * 8.0
        );
    }

    const tl = gsap.timeline({ onComplete });
    tl.to(cam.position, {
      x: camOffset.x, y: camOffset.y, z: camOffset.z,
      duration: 0.65, ease: 'power2.out',
      onUpdate: () => cam.lookAt(lookTarget.x, lookTarget.y, lookTarget.z),
    });
    // Hold on character
    tl.to({}, { duration: 0.2 });

    this._shotSeq = tl;
    return tl;
  }

  // Snap cut (instant) to character — for dramatic moments
  snapToCharacter(charPos, shotType = SHOT.CLOSE, facingAngle = 0) {
    const lookTarget = new THREE.Vector3(charPos.x, charPos.y + 1.6, charPos.z);
    const dist = shotType === SHOT.EXTREME_CLOSE ? 1.4 : shotType === SHOT.CLOSE ? 2.2 : 3.5;
    this.camera.position.set(
      charPos.x - Math.sin(facingAngle) * dist,
      charPos.y + 1.5,
      charPos.z - Math.cos(facingAngle) * dist
    );
    this.camera.lookAt(lookTarget);
  }

  // Play a full cinematic sequence for a speaker inside a building
  // player: { id, name, role }, charPos: THREE.Vector3, dialogue: string, onComplete
  playDialogueCinematic(player, charPos, onComplete) {
    this._kill();
    const cam    = this.camera;
    const facing = 0; // default facing — engine can override
    const look   = new THREE.Vector3(charPos.x, charPos.y + 1.6, charPos.z);

    const tl = gsap.timeline({ onComplete });

    // Beat 1: Establishing medium (0.7s)
    const medCam = {
      x: charPos.x - Math.sin(facing) * 3.5,
      y: charPos.y + 1.4,
      z: charPos.z - Math.cos(facing) * 3.5,
    };
    tl.to(cam.position, {
      ...medCam, duration: 0.7, ease: 'power2.out',
      onUpdate: () => cam.lookAt(look.x, look.y, look.z),
    });
    tl.to({}, { duration: 1.0 }); // hold on medium

    // Beat 2: Push in to close-up (0.5s) — as they begin speaking
    const closeCam = {
      x: charPos.x - Math.sin(facing) * 2.1,
      y: charPos.y + 1.5,
      z: charPos.z - Math.cos(facing) * 2.1,
    };
    tl.to(cam.position, {
      ...closeCam, duration: 0.5, ease: 'power2.inOut',
      onUpdate: () => cam.lookAt(look.x, look.y + 0.1, look.z),
    });
    tl.to({}, { duration: 2.0 }); // hold on close

    // Beat 3: Slight drift (organic feel — slow subtle push)
    tl.to(cam.position, {
      x: closeCam.x + 0.15, y: closeCam.y + 0.1, z: closeCam.z,
      duration: 3.0, ease: 'none',
      onUpdate: () => cam.lookAt(look.x, look.y + 0.1, look.z),
    });

    this._shotSeq = tl;
  }

  // Full night-location sequence:
  // approach → establishing exterior → interior wide → dialogue cuts
  // charPositions: array of {player, pos, angle} for each character in the room
  async playNightLocationSequence(role, charPositions, onReady) {
    return new Promise((resolve) => {
      const cam   = this.camera;
      const views = this._buildingViews[role];
      if (!views) { if (onReady) onReady(); resolve(); return; }

      const wide = views.wide || views.establishing;
      const look = wide.look;
      const tl   = gsap.timeline({ onComplete: () => { if (onReady) onReady(); resolve(); } });

      // Single smooth move directly to interior wide — matches day-phase cinematic
      // feel. No jarring multi-shot exterior → exterior → interior sequence.
      tl.to(cam.position, {
        x: wide.cam.x, y: wide.cam.y, z: wide.cam.z,
        duration: 1.1, ease: 'power2.inOut',
        onUpdate: () => cam.lookAt(look.x, look.y, look.z),
      });
      tl.to({}, { duration: 0.5 }); // brief settle

      // Gentle push toward the first character (not a hard cut)
      if (charPositions && charPositions.length > 0) {
        const first = charPositions[0];
        const fLook = new THREE.Vector3(first.pos.x, first.pos.y + 1.4, first.pos.z);
        const ang   = first.angle || 0;
        tl.to(cam.position, {
          x: first.pos.x - Math.sin(ang) * 4.0,
          y: first.pos.y + 1.6,
          z: first.pos.z - Math.cos(ang) * 4.0,
          duration: 0.75, ease: 'power1.inOut',
          onUpdate: () => cam.lookAt(fLook.x, fLook.y, fLook.z),
        });
      }

      this._shotSeq = tl;
    });
  }

  // Spectator snaps to a character inside a building for a dialogue shot
  // Uses full shot-sequence: medium → push-in close → subtle drift
  // snapDialogueShot: face shot for night room characters.
  // Camera in FRONT of character (centre-side), looking at their face.
  // facing = character's rotation.y — we place camera at facing+PI (in front of face).
  snapDialogueShot(charPos, facing = 0, onComplete) {
    this._kill();
    const cam  = this.camera;
    const look = new THREE.Vector3(charPos.x, charPos.y + 1.0, charPos.z);

    // Front of character: move in the FORWARD direction of the character
    // Character faces along (sin(facing), 0, cos(facing)) direction
    // Camera in front = charPos + forward * distance
    const fwd_x = Math.sin(facing);
    const fwd_z = Math.cos(facing);

    const tl = gsap.timeline({ onComplete });
    tl.to(cam.position, {
      x: charPos.x + fwd_x * 9.0,
      y: charPos.y + 2.5,
      z: charPos.z + fwd_z * 9.0,
      duration: 0.7, ease: 'power2.out',
      onUpdate: () => cam.lookAt(look.x, look.y, look.z),
    });
    // Slow push in — stop well outside wall range
    tl.to(cam.position, {
      x: charPos.x + fwd_x * 7.0,
      y: charPos.y + 2.2,
      z: charPos.z + fwd_z * 7.0,
      duration: 2.0, ease: 'power1.inOut',
      onUpdate: () => cam.lookAt(look.x, look.y, look.z),
    });

    this._shotSeq = tl;
  }

  // Slow pan across a room (ambient/transition shot)
  playRoomPan(role, fromKey, toKey, duration = 2.5, onComplete) {
    this._kill();
    const cam   = this.camera;
    const views = this._buildingViews[role];
    if (!views) { if (onComplete) onComplete(); return; }

    const from  = views[fromKey] || views.wide;
    const to    = views[toKey]   || views.wide;

    const tl = gsap.timeline({ onComplete });
    tl.to(cam.position, {
      x: from.cam.x, y: from.cam.y, z: from.cam.z,
      duration: 0.01,
      onUpdate: () => cam.lookAt(from.look.x, from.look.y, from.look.z),
    });
    tl.to(cam.position, {
      x: to.cam.x, y: to.cam.y, z: to.cam.z,
      duration, ease: 'power1.inOut',
      onUpdate: () => {
        // Interpolate look-at target too for a real pan
        const p = tl.progress();
        const lx = from.look.x + (to.look.x - from.look.x) * p;
        const ly = from.look.y + (to.look.y - from.look.y) * p;
        const lz = from.look.z + (to.look.z - from.look.z) * p;
        cam.lookAt(lx, ly, lz);
      },
    });

    this._shotSeq = tl;
  }

  // Full cinematic fade-out of a location (camera pushes in and darkens — simulated by pulling back)
  playLocationExit(role, onComplete) {
    this._kill();
    const cam   = this.camera;
    const views = this._buildingViews[role];
    const look  = views?.establishing?.look || new THREE.Vector3(0, 2, 48);

    const tl = gsap.timeline({ onComplete });
    // Push WAY back out to exterior
    const exit = this._getBuildingApproach(role);
    tl.to(cam.position, {
      x: exit.x, y: exit.y + 5, z: exit.z,
      duration: 1.6, ease: 'power2.in',
      onUpdate: () => cam.lookAt(look.x, look.y, look.z),
    });

    this._shotSeq = tl;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SEQUENCE HELPERS — used by engine to string shots together
  // ═══════════════════════════════════════════════════════════════════════════

  // Smooth blend from current position to a new shot without a hard cut
  blendTo(targetPos, targetLook, duration = 1.0, ease = 'power2.inOut', onComplete) {
    this._kill();
    const cam  = this.camera;
    const look = new THREE.Vector3().copy(targetLook);

    this._tween = gsap.to(cam.position, {
      x: targetPos.x, y: targetPos.y, z: targetPos.z,
      duration, ease,
      onUpdate: () => cam.lookAt(look.x, look.y, look.z),
      onComplete,
    });
  }

  // Hard cut — instant position change (use sparingly for maximum impact)
  hardCut(targetPos, targetLook) {
    this._kill();
    this.camera.position.copy(targetPos);
    this.camera.lookAt(targetLook.x, targetLook.y, targetLook.z);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DAY PHASE — amphitheater shots
  // ═══════════════════════════════════════════════════════════════════════════

  // Sheriff investigation POV — quick snap-zoom to suspect
  playShortInvestigationPOV(seatIndex, totalSeats) {
    if (totalSeats) this._total = totalSeats;
    this._kill();
    const {x: sx, z: sz} = this._seatPos(seatIndex);
    const cam = this.camera;

    // Snap in tight then ease back
    const tl = gsap.timeline();
    tl.to(cam.position, {
      x: sx * 0.45, y: FACE_Y - 0.3, z: sz * 0.45,
      duration: 0.4, ease: 'power3.in',
      onUpdate: () => cam.lookAt(sx, FACE_Y, sz),
    });
    tl.to(cam.position, {
      x: sx * (1 - CAM_PULL), y: CAM_Y, z: sz * (1 - CAM_PULL),
      duration: 0.8, ease: 'power2.out',
      onUpdate: () => cam.lookAt(sx, LOOK_Y, sz),
    });
    this._tween = tl;
  }

  // Graveyard pan — dramatic elimination reveal
  // Camera shows FRONT of gravestone (south side, facing toward amphitheater)
  panToGraveyard(onComplete, graveInfo) {
    this._kill();
    // graveInfo can be the full object from addGravestone (with camPos/lookPos)
    // or legacy { x, y, z } — handle both
    const gx  = graveInfo?.x  ?? graveInfo?.position?.x ?? 36;
    const gy  = graveInfo?.y  ?? 3;
    const gz  = graveInfo?.z  ?? graveInfo?.position?.z ?? 36;

    // Use computed camera/look positions if available, else derive them
    const camPos  = graveInfo?.camPos  ?? new THREE.Vector3(gx, gy + 8, gz - 8);
    const lookPos = graveInfo?.lookPos ?? new THREE.Vector3(gx, gy + 4, gz + 0.3);

    const cam = this.camera;
    let fired = false;
    const fire = () => { if (!fired) { fired = true; if (onComplete) onComplete(); } };
    const safetyTimer = setTimeout(fire, 9000);

    const tl = gsap.timeline({
      onComplete: () => { clearTimeout(safetyTimer); setTimeout(fire, 1200); },
    });

    // Beat 1 — Aerial top-down: directly above, stone falls into frame
    tl.to(cam.position, {
      x: gx, y: gy + 24, z: gz + 1,
      duration: 1.0, ease: 'power2.inOut',
      onUpdate: () => cam.lookAt(gx, gy + 3, gz),
    });
    tl.to({}, { duration: 0.9 }); // hold — stone bounce-lands here

    // Beat 2 — Arc to front-view: camera swings to +Z side where face is
    // Face points +Z, so camera at gz+9 looking toward -Z sees the nameplate
    tl.to(cam.position, {
      x: camPos.x, y: camPos.y, z: camPos.z,
      duration: 1.2, ease: 'power2.inOut',
      onUpdate: () => cam.lookAt(lookPos.x, lookPos.y, lookPos.z),
    });
    tl.to({}, { duration: 2.8 }); // hold — read name + role + logo

    // Beat 3 — Push closer for name close-up
    tl.to(cam.position, {
      x: camPos.x, y: camPos.y - 1.5, z: camPos.z - 2.5,
      duration: 1.0, ease: 'power1.inOut',
      onUpdate: () => cam.lookAt(lookPos.x, lookPos.y, lookPos.z),
    });
    tl.to({}, { duration: 1.8 });

    // Beat 4 — Slight right drift for cinematic depth
    tl.to(cam.position, {
      x: camPos.x + 2.5, y: camPos.y - 1, z: camPos.z - 2,
      duration: 1.2, ease: 'power1.inOut',
      onUpdate: () => cam.lookAt(lookPos.x, lookPos.y, lookPos.z),
    });

    this._tween = tl;
  }

  // Game-over cinematic sweep — epic aerial pullback
  playGameOverSweep() {
    this._kill();
    const tl = gsap.timeline();
    tl.to(this.camera.position, {
      x: -15, y: 30, z: 10, duration: 1.5, ease: 'power2.in',
      onUpdate: () => this.camera.lookAt(0, 5, 0),
    });
    tl.to(this.camera.position, {
      x: -55, y: 55, z: -35, duration: 3.5, ease: 'power1.inOut',
      onUpdate: () => this.camera.lookAt(0, 5, 0),
    });
    tl.to(this.camera.position, {
      x: 55, y: 60, z: 55, duration: 4.0, ease: 'power1.inOut',
      onUpdate: () => this.camera.lookAt(0, 5, 0),
    });
    this._tween = tl;
  }

  // Night view — pull back for darkness reveal
  setNightView() {
    this._kill();
    this._tween = gsap.to(this.camera.position, {
      x: 0, y: 40, z: 35,
      duration: 2.5, ease: 'power2.inOut',
      onUpdate: () => this.camera.lookAt(0, 0, 0),
    });
  }

  // ── Villager Night Cinematic ──────────────────────────────────────────────
  // Sweeps the camera over the lit village streets. Exactly 45s total.
  // Final shot parks at amphitheater overview and STAYS until day starts.
  // Safety killswitch fires at 45s if GSAP runs long for any reason.
  playVillageNightCinematic(onComplete) {
    this._kill();
    const cam = this.camera;
    const TOTAL_MS = 45000;
    let completed = false;
    const finish = () => { if (!completed) { completed = true; if (onComplete) onComplete(); } };

    // Safety: force-stop at 45s, park at amphitheater, fire callback
    const safetyKill = setTimeout(() => {
      if (this._tween) { this._tween.kill(); this._tween = null; }
      cam.position.set(0, 32, 22);
      cam.lookAt(0, 4, 0);
      finish();
    }, TOTAL_MS);

    const tl = gsap.timeline({
      onComplete: () => { clearTimeout(safetyKill); finish(); },
    });

    // 1. Rise above amphitheater — establishing god's-eye (4s)
    tl.to(cam.position, {
      x: 0, y: 60, z: 8, duration: 4.0, ease: 'power2.inOut',
      onUpdate: () => cam.lookAt(0, 3, 0),
    });
    // 2. Swoop east along main road at low altitude (5.5s)
    tl.to(cam.position, {
      x: 38, y: 8, z: 5, duration: 5.5, ease: 'power1.inOut',
      onUpdate: () => cam.lookAt(cam.position.x + 10, 4, 0),
    });
    // 3. Arc up, sweep west across village rooftops (6.5s)
    tl.to(cam.position, {
      x: -40, y: 14, z: 3, duration: 6.5, ease: 'power1.inOut',
      onUpdate: () => cam.lookAt(cam.position.x - 6, 4, 0),
    });
    // 4. Glide toward graveyard — lanterns glowing blue (5s)
    tl.to(cam.position, {
      x: 30, y: 11, z: 42, duration: 5.0, ease: 'power1.inOut',
      onUpdate: () => cam.lookAt(36, 5, 36),
    });
    // 5. Pan across market square — warm amber glow (5s)
    tl.to(cam.position, {
      x: -22, y: 12, z: 38, duration: 5.0, ease: 'power1.inOut',
      onUpdate: () => cam.lookAt(-14, 4, 16),
    });
    // 6. Drift toward hospital silhouette in the north (4s)
    tl.to(cam.position, {
      x: -36, y: 16, z: -18, duration: 4.0, ease: 'power1.inOut',
      onUpdate: () => cam.lookAt(-36, 5, -36),
    });
    // 7. Pull back to full-village aerial (4s)
    tl.to(cam.position, {
      x: 10, y: 50, z: 20, duration: 4.0, ease: 'power2.inOut',
      onUpdate: () => cam.lookAt(0, 3, 0),
    });
    // 8. Final settle at amphitheater overview — STAYS here (5s ease-out, total=45s)
    tl.to(cam.position, {
      x: 0, y: 32, z: 22, duration: 5.0, ease: 'power2.out',
      onUpdate: () => cam.lookAt(0, 4, 0),
    });
    // Camera is now parked at amphitheater. No further movement until _startDayPhase.

    this._tween = tl;
    this._villagerNightSafetyKill = safetyKill; // expose so engine can clear on early day
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ROLE-SPECIFIC CINEMATIC CAMERAS — Clean shots showing player + environment
  // ═══════════════════════════════════════════════════════════════════════════

  // Focus on a character in their role room with proper framing
  // role: 'mafia' | 'sheriff' | 'doctor' | 'villager'
  // charPos: THREE.Vector3 of character position
  // facingAngle: character's rotation.y (where they're facing)
  // shotType: 'fullBody' | 'medium' | 'close' | 'extreme'
  // angleType: 'eyeLevel' | 'lowAngle' | 'highAngle'
  focusOnRoleCharacter(role, charPos, facingAngle = 0, shotType = 'fullBody', angleType = 'eyeLevel', duration = 1.2) {
    this._kill();
    const cam = this.camera;
    
    // Get framing settings
    const framing = this._roleCameraPresets.framing[shotType] || this._roleCameraPresets.framing.fullBody;
    const angle = this._roleCameraPresets.angles[angleType] || 0;
    
    // Calculate camera position: in front of character at proper distance
    // Character faces along (sin(facing), 0, cos(facing)) direction
    // Camera in front = charPos + forward * distance
    const forwardX = Math.sin(facingAngle);
    const forwardZ = Math.cos(facingAngle);
    
    // Position camera in front of character
    const camX = charPos.x + forwardX * framing.distance;
    const camY = charPos.y + framing.height + angle * framing.distance;
    const camZ = charPos.z + forwardZ * framing.distance;
    
    // Look at character's upper body/face
    const lookTarget = new THREE.Vector3(
      charPos.x,
      charPos.y + framing.height * 0.6,
      charPos.z
    );
    
    this._tween = gsap.to(cam.position, {
      x: camX, y: camY, z: camZ,
      duration,
      ease: 'power2.inOut',
      onUpdate: () => cam.lookAt(lookTarget.x, lookTarget.y, lookTarget.z),
    });
    
    return this._tween;
  }

  // Smooth transition to a role room view
  // Use this when switching between roles in spectator mode
  transitionToRoleView(role, viewKey = 'characterWide', duration = 1.5) {
    this._kill();
    const views = this._buildingViews[role];
    if (!views) return;
    
    const view = views[viewKey] || views.wide || views.establishing;
    if (!view) return;
    
    const cam = this.camera;
    
    this._tween = gsap.to(cam.position, {
      x: view.cam.x, y: view.cam.y, z: view.cam.z,
      duration,
      ease: 'power2.inOut',
      onUpdate: () => cam.lookAt(view.look.x, view.look.y, view.look.z),
    });
    
    return this._tween;
  }

  // Play a cinematic sequence for a role action (e.g., mafia voting, doctor healing)
  // sequence: array of { role, viewKey, duration, holdTime }
  playRoleActionSequence(sequence, onComplete) {
    this._kill();
    const cam = this.camera;
    const tl = gsap.timeline({ onComplete });
    
    for (const step of sequence) {
      const views = this._buildingViews[step.role];
      if (!views) continue;
      
      const view = views[step.viewKey] || views.wide;
      
      // Move to position
      tl.to(cam.position, {
        x: view.cam.x, y: view.cam.y, z: view.cam.z,
        duration: step.duration || 1.0,
        ease: 'power2.inOut',
        onUpdate: () => cam.lookAt(view.look.x, view.look.y, view.look.z),
      });
      
      // Hold if specified
      if (step.holdTime) {
        tl.to({}, { duration: step.holdTime });
      }
    }
    
    this._shotSeq = tl;
    return tl;
  }

  // Get recommended camera position for a role room
  // Returns { cam: Vector3, look: Vector3 } for the given role and shot type
  getRoleCameraPosition(role, shotType = 'characterWide') {
    const views = this._buildingViews[role];
    if (!views) return null;
    
    const view = views[shotType] || views.wide || views.establishing;
    if (!view) return null;
    
    return {
      cam: view.cam.clone(),
      look: view.look.clone(),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SPECTATOR "BASE-FRAME" CINEMATIC — viewPlayerInBase(targetPlayer)
  //
  // When spectating an alive player inside their role building, instead of
  // seeing a wall we want to see:
  //   • The full player body + furniture + wall decor in one frame
  //   • Camera placed in one of the 4 interior corners, 1 block below ceiling
  //   • FOV boosted to 85° so the small room feels larger & more cinematic
  //   • Camera looks directly at the player's world position
  //
  // Building dimensions (interior clear space, all at ground y=3):
  //   mafia  : cx=0,  cz=48, ceiling y0+8=8. Interior: x±12, z±10
  //   sheriff: cx=36, cz=-36, ceiling y+10=13. Interior: x±10, z±8
  //   doctor : cx=-36,cz=-36, ceiling y+10=13. Interior: x±10, z±8
  //
  // Corner selection: picks the corner diagonally opposite the player so
  // the player appears in the near-centre of frame with furniture behind them.
  // ═══════════════════════════════════════════════════════════════════════════
  viewPlayerInBase(targetPlayer, onComplete) {
    this._kill();

    if (!targetPlayer) return;

    // ── Per-role building config ─────────────────────────────────────────────
    const BUILDINGS = {
      mafia   : { cx:  0, cz: 48,  floorY: 0,  ceilY: 8,  halfX: 11, halfZ: 9  },
      sheriff : { cx: 36, cz: -36, floorY: 3,  ceilY: 13, halfX: 9,  halfZ: 7  },
      doctor  : { cx:-36, cz: -36, floorY: 3,  ceilY: 13, halfX: 9,  halfZ: 7  },
    };

    const role    = targetPlayer.role?.toLowerCase?.() || 'villager';
    const bldg    = BUILDINGS[role];

    // Fallback for villager / unknown roles — use an elevated amphitheater corner
    if (!bldg) {
      const fallbackCam  = new THREE.Vector3(12, 11, 12);
      const fallbackLook = new THREE.Vector3(
        targetPlayer.position?.x ?? 0,
        (targetPlayer.position?.y ?? 3) + 2.5,
        targetPlayer.position?.z ?? 0,
      );
      this._animateToCorner(fallbackCam, fallbackLook, 85, onComplete);
      return;
    }

    // ── Special case: Sheriff office occupies the NORTH half of the building ──
    // The building has an interior partition at z=-35. The office (where characters
    // spawn at night) is z=-36 to z=-45. The corner-picking logic below would
    // sometimes pick the south (jail) half at z≈-29.8 which is behind the partition.
    // Instead, always use the fixed east-wall characterWide preset which is verified
    // to be inside the office zone and see characters' front faces.
    if (role === 'sheriff') {
      const preset = this._buildingViews.sheriff.characterWide;
      const lookPos = new THREE.Vector3(
        targetPlayer.position?.x ?? 35,
        (targetPlayer.position?.y ?? 3) + 2.5,
        targetPlayer.position?.z ?? -40,
      );
      this._animateToCorner(preset.cam.clone(), lookPos, 85, onComplete);
      return;
    }

    // ── Centre of building ───────────────────────────────────────────────────
    const buildingCentre = new THREE.Vector3(bldg.cx, bldg.floorY, bldg.cz);

    // ── Camera height: ceilY is the ABSOLUTE ceiling Y coordinate ────────────
    // Previous formula `floorY + ceilY - 1.5` was wrong for sheriff/doctor
    // (both have floorY=3, ceilY=13 → 3+13-1.5=14.5, above the roof).
    // Correct formula: ceilY - 1.5 places camera 1.5 units below the ceiling.
    const camY = bldg.ceilY - 1.5;

    // ── Choose corner diagonally opposite the player position ────────────────
    // This puts the player roughly in the centre-near of frame.
    const px = targetPlayer.position?.x ?? bldg.cx;
    const pz = targetPlayer.position?.z ?? bldg.cz;
    const signX = px >= bldg.cx ? -1 : 1;   // opposite X side
    const signZ = pz >= bldg.cz ? -1 : 1;   // opposite Z side

    // Inset 0.8 blocks from the corner wall so we're definitely inside
    const cornerX = bldg.cx + signX * (bldg.halfX - 0.8);
    const cornerZ = bldg.cz + signZ * (bldg.halfZ - 0.8);

    const camPos  = new THREE.Vector3(cornerX, camY, cornerZ);
    const lookPos = new THREE.Vector3(
      targetPlayer.position?.x ?? bldg.cx,
      (targetPlayer.position?.y ?? bldg.floorY) + 2.5,  // aim at chest height
      targetPlayer.position?.z ?? bldg.cz,
    );

    this._animateToCorner(camPos, lookPos, 85, onComplete);
  }

  // ── Internal helper: smooth tween to corner position + FOV boost ──────────
  _animateToCorner(camPos, lookPos, targetFov, onComplete) {
    const cam     = this.camera;
    const origFov = cam.fov;

    const tl = gsap.timeline({ onComplete });

    // Phase 1: Fly to corner in 1.2 s
    tl.to(cam.position, {
      x: camPos.x, y: camPos.y, z: camPos.z,
      duration: 1.2,
      ease: 'power2.inOut',
      onUpdate: () => {
        cam.lookAt(lookPos);
        cam.updateProjectionMatrix();
      },
    });

    // Simultaneously boost FOV to 85° for the "wide indoor" cinematic feel
    tl.to(cam, {
      fov: targetFov,
      duration: 0.9,
      ease: 'power2.out',
      onUpdate: () => cam.updateProjectionMatrix(),
    }, '<');  // start at same time as position tween

    // Phase 2: Settle / lock for 0.3 s
    tl.to({}, { duration: 0.3, onUpdate: () => cam.lookAt(lookPos) });

    this._shotSeq = tl;

    // Restore original FOV when tween is destroyed / view changes externally
    tl.eventCallback('onKill', () => {
      gsap.to(cam, {
        fov: origFov,
        duration: 0.5,
        ease: 'power2.out',
        onUpdate: () => cam.updateProjectionMatrix(),
      });
    });
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  // Get a wide aerial approach position for each building
  _getBuildingApproach(role) {
    const approaches = {
      mafia   : { x:  0, y: 24, z: 20  }, // approach from north toward bunker at cz=48
      sheriff : { x: 20, y: 22, z: -30 }, // approach from SW toward sheriff station (36,-36)
      doctor  : { x:-20, y: 22, z: -30 }, // approach from SE toward hospital (-36,-36)
    };
    return approaches[role] || { x: 0, y: 28, z: 0 };
  }

  // Get interior reference position for each building key
  getBuildingViewPos(role, key = 'wide') {
    const v = this._buildingViews[role]?.[key];
    if (!v) return null;
    return { cam: v.cam.clone(), look: v.look.clone() };
  }
}

export { SHOT };
