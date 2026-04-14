// ═══════════════════════════════════════════════════════════════════════════
// RoomInteriors — Themed props and furniture for role rooms
// Hospital: patient beds, heart monitors, IV stands, medical cabinets
// Bunker: safe, wooden crates, gun rack, table/chairs
// Sheriff: desk, chair, computer, filing cabinet, jail cells, evidence board
// ═══════════════════════════════════════════════════════════════════════════

import * as THREE from 'three';

export class RoomInteriors {
  constructor(scene, textureLoader) {
    this.scene = scene;
    this.textureLoader = textureLoader;
    this.props = new Map(); // Store props by room
    this.instancedProps = new Map(); // For repeated props
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEXTURE GENERATION — Procedural textures for props
  // ═══════════════════════════════════════════════════════════════════════════

  // Generate a wood texture
  createWoodTexture(color = '#8B5A2B') {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    
    // Base color
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 128, 128);
    
    // Wood grain
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 20; i++) {
      ctx.beginPath();
      ctx.moveTo(0, Math.random() * 128);
      ctx.bezierCurveTo(
        40, Math.random() * 128,
        80, Math.random() * 128,
        128, Math.random() * 128
      );
      ctx.stroke();
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    return texture;
  }

  // Generate a metal texture
  createMetalTexture(color = '#666666') {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 128, 128);
    
    // Brushed metal effect
    for (let i = 0; i < 128; i += 2) {
      ctx.fillStyle = `rgba(255,255,255,${0.05 + Math.random() * 0.05})`;
      ctx.fillRect(0, i, 128, 1);
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    return texture;
  }

  // Generate a fabric/bedspread texture
  createFabricTexture(color = '#E8E8E8') {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 256, 256);
    
    // Fabric weave pattern
    ctx.fillStyle = 'rgba(0,0,0,0.03)';
    for (let x = 0; x < 256; x += 4) {
      ctx.fillRect(x, 0, 1, 256);
    }
    for (let y = 0; y < 256; y += 4) {
      ctx.fillRect(0, y, 256, 1);
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    return texture;
  }

  // Generate screen glow texture
  createScreenTexture(color = '#00FF00') {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    
    // Gradient glow
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, color);
    gradient.addColorStop(0.5, color + '88');
    gradient.addColorStop(1, 'transparent');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    return texture;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HOSPITAL PROPS — Sildurs-shader-inspired: PBR materials, smooth geometry,
  // emissive glow sources, subtle ambient occlusion via layered meshes.
  // Each piece is distinctly shaped — NOT just recoloured boxes.
  // ═══════════════════════════════════════════════════════════════════════════

  // Procedural tile texture — clean hospital linoleum floor
  createTileTexture(baseColor = '#f4f6f8', groutColor = '#c8cdd2', tileSize = 32) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = groutColor;
    ctx.fillRect(0, 0, 256, 256);
    const step = 256 / tileSize * 8;
    ctx.fillStyle = baseColor;
    for (let tx = 0; tx < 256; tx += step) {
      for (let tz = 0; tz < 256; tz += step) {
        ctx.fillRect(tx + 1, tz + 1, step - 2, step - 2);
        // Subtle specular highlight on each tile
        const g = ctx.createLinearGradient(tx, tz, tx + step, tz + step);
        g.addColorStop(0, 'rgba(255,255,255,0.08)');
        g.addColorStop(0.5, 'rgba(255,255,255,0.0)');
        ctx.fillStyle = g;
        ctx.fillRect(tx + 1, tz + 1, step - 2, step - 2);
        ctx.fillStyle = baseColor;
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 3);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    return tex;
  }

  // Smooth linen texture — for bed sheets
  createLinenTexture(color = '#f8f8f8') {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 256, 256);
    // Fine weave
    for (let i = 0; i < 256; i += 3) {
      ctx.fillStyle = `rgba(0,0,0,${0.02 + Math.random() * 0.02})`;
      ctx.fillRect(i, 0, 1, 256);
      ctx.fillRect(0, i, 256, 1);
    }
    // Slight wrinkle noise
    for (let n = 0; n < 60; n++) {
      const x = Math.random() * 256, y = Math.random() * 256;
      ctx.fillStyle = `rgba(0,0,0,${0.015 + Math.random()*0.02})`;
      ctx.fillRect(x, y, Math.random() * 20 + 5, 1);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    return tex;
  }

  // Smooth painted-metal texture for equipment (Sildurs-style: subtle specular banding)
  createEquipmentTexture(color = '#d0d4d8') {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 128, 128);
    // Vertical specular streak (like a moulded plastic/metal casing)
    const streak = ctx.createLinearGradient(0, 0, 128, 0);
    streak.addColorStop(0,    'rgba(255,255,255,0)');
    streak.addColorStop(0.35, 'rgba(255,255,255,0.12)');
    streak.addColorStop(0.5,  'rgba(255,255,255,0.22)');
    streak.addColorStop(0.65, 'rgba(255,255,255,0.12)');
    streak.addColorStop(1,    'rgba(255,255,255,0)');
    ctx.fillStyle = streak;
    ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.LinearFilter;
    return tex;
  }

  // Green OLED heartbeat line canvas texture for ECG screen
  _createECGTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#050f05';
    ctx.fillRect(0, 0, 128, 64);
    // Draw ECG waveform
    ctx.strokeStyle = '#00ff66';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = '#00ff66';
    ctx.shadowBlur = 4;
    ctx.beginPath();
    const pts = [
      [0,32],[12,32],[16,22],[20,42],[24,16],[28,50],[32,32],
      [44,32],[48,26],[52,26],[56,32],[68,32],[72,22],[76,42],
      [80,16],[84,50],[88,32],[100,32],[104,26],[108,26],[112,32],[128,32],
    ];
    pts.forEach(([x,y], i) => i===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y));
    ctx.stroke();
    return new THREE.CanvasTexture(canvas);
  }

  // Sildurs-style hospital bed — smooth rails, proper mattress layers, pillow
  createHospitalBed(x, y, z, rotation = 0) {
    const group = new THREE.Group();

    // ── Shared materials ───────────────────────────────────────────────────
    const railMat = new THREE.MeshStandardMaterial({
      color: 0xc8cdd2, metalness: 0.75, roughness: 0.25,
      map: this.createEquipmentTexture('#c8cdd2'),
    });
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0xe8eaec, metalness: 0.6, roughness: 0.3,
      map: this.createEquipmentTexture('#e8eaec'),
    });
    const mattressMat = new THREE.MeshStandardMaterial({
      color: 0xf5f5f5, roughness: 0.85, metalness: 0.0,
      map: this.createLinenTexture('#f5f5f5'),
    });
    const sheetMat = new THREE.MeshStandardMaterial({
      color: 0xe8f0ff, roughness: 0.9, metalness: 0.0,
      map: this.createLinenTexture('#dce8ff'),
    });
    const pillowMat = new THREE.MeshStandardMaterial({
      color: 0xfafafa, roughness: 0.92, metalness: 0.0,
      map: this.createLinenTexture('#fafafa'),
    });

    // ── Bed platform / base frame ─────────────────────────────────────────
    const baseGeo = new THREE.BoxGeometry(2.0, 0.12, 4.2);
    const base = new THREE.Mesh(baseGeo, frameMat);
    base.position.y = 0.56;
    base.castShadow = true; base.receiveShadow = true;
    group.add(base);

    // Under-frame storage shelf (visual depth)
    const shelfGeo = new THREE.BoxGeometry(1.6, 0.06, 3.6);
    const shelf = new THREE.Mesh(shelfGeo, frameMat);
    shelf.position.y = 0.22;
    shelf.castShadow = true;
    group.add(shelf);

    // ── Legs — tapered cylinder look ──────────────────────────────────────
    const legGeo = new THREE.CylinderGeometry(0.055, 0.04, 0.5, 8);
    [[-0.85, 0.25, -1.8],[0.85, 0.25, -1.8],[-0.85, 0.25, 1.8],[0.85, 0.25, 1.8]].forEach(p => {
      const leg = new THREE.Mesh(legGeo, railMat);
      leg.position.set(...p); leg.castShadow = true; group.add(leg);
      // Wheel cap
      const wheelGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.05, 8);
      const wheel = new THREE.Mesh(wheelGeo, new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 }));
      wheel.position.set(p[0], 0.025, p[2]); group.add(wheel);
    });

    // ── Mattress — slightly raised, rounded-ish via scale ─────────────────
    const mattGeo = new THREE.BoxGeometry(1.82, 0.22, 4.0);
    const matt = new THREE.Mesh(mattGeo, mattressMat);
    matt.position.y = 0.73; matt.castShadow = true; matt.receiveShadow = true;
    group.add(matt);

    // ── Folded sheet on lower 2/3 of bed ─────────────────────────────────
    const sheetGeo = new THREE.BoxGeometry(1.78, 0.055, 2.6);
    const sheet = new THREE.Mesh(sheetGeo, sheetMat);
    sheet.position.set(0, 0.868, 0.7); sheet.receiveShadow = true;
    group.add(sheet);
    // Sheet fold line (thin dark strip)
    const foldGeo = new THREE.BoxGeometry(1.78, 0.008, 0.06);
    const foldMat = new THREE.MeshStandardMaterial({ color: 0xb0bcd4, roughness: 1 });
    const fold = new THREE.Mesh(foldGeo, foldMat);
    fold.position.set(0, 0.88, -0.63); group.add(fold);

    // ── Pillow — softly shaped with slight droop ──────────────────────────
    const pillowGeo = new THREE.BoxGeometry(1.5, 0.14, 0.7);
    const pillow = new THREE.Mesh(pillowGeo, pillowMat);
    pillow.position.set(0, 0.83, -1.55);
    pillow.castShadow = true; group.add(pillow);
    // Pillow edge indent (visual detail)
    const indentGeo = new THREE.BoxGeometry(1.42, 0.01, 0.62);
    const indentMat = new THREE.MeshStandardMaterial({ color: 0xe0e0e0, roughness: 1 });
    const indent = new THREE.Mesh(indentGeo, indentMat);
    indent.position.set(0, 0.9, -1.55); group.add(indent);

    // ── Side rails (guard rails) ──────────────────────────────────────────
    const sideRailGeo = new THREE.BoxGeometry(0.03, 0.22, 3.2);
    [-0.95, 0.95].forEach(xOff => {
      const sr = new THREE.Mesh(sideRailGeo, railMat);
      sr.position.set(xOff, 0.95, 0); sr.castShadow = true; group.add(sr);
    });
    // Rail vertical posts
    const postGeo = new THREE.BoxGeometry(0.03, 0.22, 0.03);
    [[-1.45,-0.95],[-0.3,-0.95],[0.95,-0.95],[-1.45,0.95],[-0.3,0.95],[0.95,0.95]].forEach(([pz,px]) => {
      const post = new THREE.Mesh(postGeo, railMat);
      post.position.set(px, 0.95, pz); group.add(post);
    });

    // ── Headboard — distinct arched panel look ────────────────────────────
    const hbGeo = new THREE.BoxGeometry(2.0, 0.9, 0.08);
    const headboard = new THREE.Mesh(hbGeo, frameMat);
    headboard.position.set(0, 1.05, -2.05);
    headboard.castShadow = true; group.add(headboard);
    // Headboard detail strip
    const hbDetailGeo = new THREE.BoxGeometry(1.7, 0.04, 0.02);
    const hbDetail = new THREE.Mesh(hbDetailGeo, railMat);
    hbDetail.position.set(0, 1.38, -2.0); group.add(hbDetail);

    // ── Footboard ────────────────────────────────────────────────────────
    const fbGeo = new THREE.BoxGeometry(2.0, 0.45, 0.06);
    const footboard = new THREE.Mesh(fbGeo, frameMat);
    footboard.position.set(0, 0.83, 2.05); footboard.castShadow = true; group.add(footboard);

    // ── Over-bed table — sliding tray on rail ─────────────────────────────
    const trayGeo = new THREE.BoxGeometry(0.7, 0.03, 0.55);
    const trayMat = new THREE.MeshStandardMaterial({ color: 0xdde8ee, roughness: 0.4, metalness: 0.3 });
    const tray = new THREE.Mesh(trayGeo, trayMat);
    tray.position.set(1.2, 1.12, -0.4); group.add(tray);
    const trayPostGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.55, 6);
    const trayPost = new THREE.Mesh(trayPostGeo, railMat);
    trayPost.position.set(1.2, 0.84, -0.4); group.add(trayPost);

    group.position.set(x, y, z);
    group.rotation.y = rotation;
    return group;
  }

  // Sildurs-style IV Stand — slender chrome pole, articulated arm, glass bag
  createIVStand(x, y, z) {
    const group = new THREE.Group();

    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xd4d8de, metalness: 0.92, roughness: 0.12 });
    const darkMat   = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7 });

    // Five-star wheeled base
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const armGeo = new THREE.CylinderGeometry(0.016, 0.012, 0.38, 6);
      const arm = new THREE.Mesh(armGeo, chromeMat);
      arm.rotation.z = Math.PI / 2;
      arm.position.set(Math.cos(angle) * 0.19, 0.03, Math.sin(angle) * 0.19);
      arm.rotation.set(0, angle, Math.PI/2);
      group.add(arm);
      // Wheel
      const wGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.02, 8);
      const w = new THREE.Mesh(wGeo, darkMat);
      w.position.set(Math.cos(angle)*0.36, 0.02, Math.sin(angle)*0.36);
      group.add(w);
    }
    // Hub
    const hubGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.06, 8);
    group.add(new THREE.Mesh(hubGeo, chromeMat));

    // Main pole
    const poleGeo = new THREE.CylinderGeometry(0.018, 0.018, 2.2, 10);
    const pole = new THREE.Mesh(poleGeo, chromeMat);
    pole.position.y = 1.13; group.add(pole);

    // Hook cross-bar at top
    const barGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.35, 6);
    const bar = new THREE.Mesh(barGeo, chromeMat);
    bar.rotation.z = Math.PI / 2;
    bar.position.y = 2.3; group.add(bar);

    // Two hooks
    [-0.14, 0.14].forEach(bx => {
      const hookCurveGeo = new THREE.TorusGeometry(0.04, 0.008, 6, 10, Math.PI);
      const hook = new THREE.Mesh(hookCurveGeo, chromeMat);
      hook.position.set(bx, 2.38, 0); hook.rotation.x = Math.PI;
      group.add(hook);
    });

    // IV Bag — proper flat pouch shape
    const bagGeo = new THREE.BoxGeometry(0.22, 0.32, 0.06);
    const bagMat = new THREE.MeshStandardMaterial({
      color: 0xddf0ff, transparent: true, opacity: 0.72,
      roughness: 0.1, metalness: 0.0,
    });
    const bag = new THREE.Mesh(bagGeo, bagMat);
    bag.position.set(-0.14, 2.1, 0); group.add(bag);
    // Bag port bottom
    const portGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.08, 6);
    const port = new THREE.Mesh(portGeo, new THREE.MeshStandardMaterial({ color: 0x88aacc }));
    port.position.set(-0.14, 1.9, 0); group.add(port);

    // Drip line — thin translucent tube
    const tubeGeo = new THREE.CylinderGeometry(0.007, 0.007, 1.05, 5);
    const tubeMat = new THREE.MeshStandardMaterial({ color: 0xaaccff, transparent: true, opacity: 0.55, roughness: 0.1 });
    const tube = new THREE.Mesh(tubeGeo, tubeMat);
    tube.position.set(-0.14, 1.37, 0); group.add(tube);

    // Drip chamber — small cylinder
    const chamberGeo = new THREE.CylinderGeometry(0.028, 0.022, 0.11, 8);
    const chamberMat = new THREE.MeshStandardMaterial({ color: 0xccddee, transparent: true, opacity: 0.8 });
    const chamber = new THREE.Mesh(chamberGeo, chamberMat);
    chamber.position.set(-0.14, 1.77, 0); group.add(chamber);

    group.position.set(x, y, z);
    return group;
  }

  // Sildurs-style ECG / Heart Monitor — modern bedside unit, OLED screen with glow
  createHeartMonitor(x, y, z, rotation = 0) {
    const group = new THREE.Group();

    const casingMat = new THREE.MeshStandardMaterial({
      color: 0xe8edf0, roughness: 0.35, metalness: 0.15,
      map: this.createEquipmentTexture('#e8edf0'),
    });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x1a1c1e, roughness: 0.5 });
    const accentMat = new THREE.MeshStandardMaterial({ color: 0x2468b0, roughness: 0.4, metalness: 0.3 });

    // Wheeled cart base
    const cartBaseGeo = new THREE.BoxGeometry(0.44, 0.06, 0.36);
    const cartBase = new THREE.Mesh(cartBaseGeo, darkMat);
    cartBase.position.y = 0.03; group.add(cartBase);

    // Cart post
    const cartPostGeo = new THREE.BoxGeometry(0.06, 1.1, 0.06);
    const cartPost = new THREE.Mesh(cartPostGeo, casingMat);
    cartPost.position.y = 0.58; group.add(cartPost);

    // Main monitor body — wedge shape (front tilted)
    const monBodyGeo = new THREE.BoxGeometry(0.52, 0.38, 0.26);
    const monBody = new THREE.Mesh(monBodyGeo, casingMat);
    monBody.position.set(0, 1.3, 0);
    monBody.rotation.x = -0.08; // slight tilt
    monBody.castShadow = true; group.add(monBody);

    // Screen bezel (recessed)
    const bezelGeo = new THREE.BoxGeometry(0.44, 0.3, 0.02);
    const bezel = new THREE.Mesh(bezelGeo, darkMat);
    bezel.position.set(0, 1.3, 0.135); group.add(bezel);

    // OLED screen with custom ECG texture
    const screenGeo = new THREE.PlaneGeometry(0.40, 0.26);
    const screenMat = new THREE.MeshBasicMaterial({
      map: this._createECGTexture(),
    });
    const screen = new THREE.Mesh(screenGeo, screenMat);
    screen.position.set(0, 1.3, 0.148); group.add(screen);

    // Green emissive glow from screen
    const screenGlow = new THREE.PointLight(0x00ff44, 0.6, 2.5);
    screenGlow.position.set(0, 1.3, 0.3); group.add(screenGlow);

    // Status LED strip along bottom of monitor
    const ledGeo = new THREE.BoxGeometry(0.35, 0.018, 0.018);
    const ledMat = new THREE.MeshBasicMaterial({ color: 0x00ff88 });
    const led = new THREE.Mesh(ledGeo, ledMat); led.position.set(0, 1.14, 0.14); group.add(led);

    // Control buttons row
    const btnGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.018, 8);
    const btnColors = [0x2468b0, 0x1a8a3a, 0xcc3311, 0xbbbb00];
    btnColors.forEach((c, i) => {
      const btn = new THREE.Mesh(btnGeo, new THREE.MeshStandardMaterial({ color: c, roughness: 0.4 }));
      btn.rotation.x = Math.PI/2;
      btn.position.set(-0.16 + i * 0.11, 1.16, 0.142);
      group.add(btn);
    });

    // Side accent stripe
    const stripeGeo = new THREE.BoxGeometry(0.012, 0.35, 0.25);
    const stripe = new THREE.Mesh(stripeGeo, accentMat);
    stripe.position.set(-0.268, 1.3, 0); group.add(stripe);

    // Cable bundle (3 thin cylinders)
    [0, 0.016, -0.016].forEach(ox => {
      const cableGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.6, 5);
      const cable = new THREE.Mesh(cableGeo, new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.9 }));
      cable.position.set(ox, 0.97, 0.05); group.add(cable);
    });

    group.position.set(x, y, z);
    group.rotation.y = rotation;
    return group;
  }

  // Sildurs-style medical supply cabinet — glass-door, stainless finish
  createMedicalCabinet(x, y, z, rotation = 0) {
    const group = new THREE.Group();

    const stainlessMat = new THREE.MeshStandardMaterial({
      color: 0xdde2e8, metalness: 0.7, roughness: 0.22,
      map: this.createEquipmentTexture('#dde2e8'),
    });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xd8eeff, transparent: true, opacity: 0.35,
      roughness: 0.05, metalness: 0.1,
    });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xaab5bd, metalness: 0.8, roughness: 0.2 });
    const redMat   = new THREE.MeshBasicMaterial({ color: 0xcc1122 });
    const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

    // Cabinet body (stainless sides, top, bottom)
    const bodyGeo = new THREE.BoxGeometry(1.1, 1.85, 0.42);
    const body = new THREE.Mesh(bodyGeo, stainlessMat);
    body.position.y = 0.925; body.castShadow = true; body.receiveShadow = true; group.add(body);

    // ── Two glass doors with frame ──────────────────────────────────────
    const doorFrameGeo = new THREE.BoxGeometry(0.5, 1.7, 0.028);
    const doorGlassGeo = new THREE.BoxGeometry(0.44, 1.6, 0.012);

    [-0.275, 0.275].forEach((dx, i) => {
      const doorFrame = new THREE.Mesh(doorFrameGeo, frameMat);
      doorFrame.position.set(dx, 0.925, 0.225); group.add(doorFrame);
      const glass = new THREE.Mesh(doorGlassGeo, glassMat);
      glass.position.set(dx, 0.925, 0.232); group.add(glass);
      // Handle bar
      const handleGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.22, 8);
      const handle = new THREE.Mesh(handleGeo, frameMat);
      handle.rotation.x = Math.PI/2;
      handle.position.set(dx + (i===0 ? 0.18 : -0.18), 0.88, 0.248);
      group.add(handle);
    });

    // ── Interior shelves visible through glass ──────────────────────────
    [0.3, 0.7, 1.1, 1.5].forEach(sy => {
      const shelfGeo = new THREE.BoxGeometry(0.98, 0.018, 0.34);
      const shelf = new THREE.Mesh(shelfGeo, new THREE.MeshStandardMaterial({ color: 0xeef2f5, roughness: 0.5 }));
      shelf.position.set(0, sy, 0); group.add(shelf);
    });

    // ── Medicine bottles on shelves (small cylinder clusters) ──────────
    const bottleColors = [0xff4444, 0x44aaff, 0xffcc00, 0x44dd88];
    for (let row = 0; row < 3; row++) {
      for (let col = -3; col <= 3; col++) {
        const bGeo = new THREE.CylinderGeometry(0.028, 0.028, 0.1 + Math.random()*0.05, 6);
        const bMat = new THREE.MeshStandardMaterial({
          color: bottleColors[Math.floor(Math.random()*bottleColors.length)],
          transparent: true, opacity: 0.7 + Math.random()*0.3, roughness: 0.2,
        });
        const bottle = new THREE.Mesh(bGeo, bMat);
        bottle.position.set(col * 0.13, 0.4 + row * 0.4, 0.06);
        group.add(bottle);
      }
    }

    // ── Red cross plaque on the side ──────────────────────────────────
    const plaqueGeo = new THREE.BoxGeometry(0.22, 0.22, 0.015);
    const plaque = new THREE.Mesh(plaqueGeo, whiteMat);
    plaque.position.set(-0.56, 1.4, 0); group.add(plaque);
    const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.055, 0.016), redMat);
    crossH.position.set(-0.56, 1.4, 0.008); group.add(crossH);
    const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.16, 0.016), redMat);
    crossV.position.set(-0.56, 1.4, 0.008); group.add(crossV);

    // ── Ambient fill light inside cabinet ────────────────────────────
    const cabinetLight = new THREE.PointLight(0xd8eeff, 0.35, 2.0);
    cabinetLight.position.set(0, 1.6, 0.1); group.add(cabinetLight);

    group.position.set(x, y, z);
    group.rotation.y = rotation;
    return group;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BUNKER PROPS (Mafia)
  // ═══════════════════════════════════════════════════════════════════════════

  createSafe(x, y, z, rotation = 0) {
    const group = new THREE.Group();
    
    // Safe body
    const bodyGeo = new THREE.BoxGeometry(1.2, 1.5, 1);
    const bodyMat = new THREE.MeshStandardMaterial({ 
      color: 0x333333,
      map: this.createMetalTexture('#333333'),
      roughness: 0.4,
      metalness: 0.8
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.75;
    body.castShadow = true;
    group.add(body);
    
    // Door frame
    const doorFrameGeo = new THREE.BoxGeometry(1, 1.2, 0.1);
    const doorFrame = new THREE.Mesh(doorFrameGeo, bodyMat);
    doorFrame.position.set(0, 0.8, 0.51);
    group.add(doorFrame);
    
    // Dial
    const dialGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.05);
    const dialMat = new THREE.MeshStandardMaterial({ color: 0x888888 });
    const dial = new THREE.Mesh(dialGeo, dialMat);
    dial.position.set(0, 1, 0.58);
    dial.rotation.x = Math.PI / 2;
    group.add(dial);
    
    // Handle
    const handleGeo = new THREE.BoxGeometry(0.3, 0.05, 0.05);
    const handle = new THREE.Mesh(handleGeo, dialMat);
    handle.position.set(0, 0.7, 0.58);
    group.add(handle);
    
    group.position.set(x, y, z);
    group.rotation.y = rotation;
    return group;
  }

  createWoodenCrate(x, y, z, rotation = 0, scale = 1) {
    const group = new THREE.Group();
    
    // Crate body
    const bodyGeo = new THREE.BoxGeometry(1 * scale, 0.8 * scale, 1 * scale);
    const bodyMat = new THREE.MeshStandardMaterial({ 
      color: 0x8B5A2B,
      map: this.createWoodTexture('#8B5A2B'),
      roughness: 0.8
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.4 * scale;
    body.castShadow = true;
    group.add(body);
    
    // Frame edges
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x5C3A1E });
    const frameThickness = 0.08 * scale;
    
    // Top/bottom frames
    const hFrameGeo = new THREE.BoxGeometry(1.05 * scale, frameThickness, frameThickness);
    for (let z of [-0.5 * scale, 0.5 * scale]) {
      const top = new THREE.Mesh(hFrameGeo, frameMat);
      top.position.set(0, 0.8 * scale, z);
      group.add(top);
      const bottom = new THREE.Mesh(hFrameGeo, frameMat);
      bottom.position.set(0, 0, z);
      group.add(bottom);
    }
    
    // Vertical frames
    const vFrameGeo = new THREE.BoxGeometry(frameThickness, 0.8 * scale, frameThickness);
    for (let x of [-0.5 * scale, 0.5 * scale]) {
      for (let z of [-0.5 * scale, 0.5 * scale]) {
        const frame = new THREE.Mesh(vFrameGeo, frameMat);
        frame.position.set(x, 0.4 * scale, z);
        group.add(frame);
      }
    }
    
    group.position.set(x, y, z);
    group.rotation.y = rotation;
    return group;
  }

  createGunRack(x, y, z, rotation = 0) {
    const group = new THREE.Group();
    
    // Backboard
    const boardGeo = new THREE.BoxGeometry(2, 1.2, 0.1);
    const boardMat = new THREE.MeshStandardMaterial({ 
      color: 0x4A3728,
      map: this.createWoodTexture('#4A3728')
    });
    const board = new THREE.Mesh(boardGeo, boardMat);
    board.position.y = 1.2;
    board.castShadow = true;
    group.add(board);
    
    // Rifles (simplified as boxes)
    const rifleGeo = new THREE.BoxGeometry(0.08, 1, 0.08);
    const rifleMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    
    for (let i = 0; i < 5; i++) {
      const rifle = new THREE.Mesh(rifleGeo, rifleMat);
      rifle.position.set(-0.8 + i * 0.4, 1.3, 0.1);
      rifle.rotation.z = (Math.random() - 0.5) * 0.1;
      rifle.castShadow = true;
      group.add(rifle);
      
      // Barrel
      const barrelGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.6);
      const barrel = new THREE.Mesh(barrelGeo, rifleMat);
      barrel.position.set(-0.8 + i * 0.4, 1.8, 0.1);
      group.add(barrel);
    }
    
    group.position.set(x, y, z);
    group.rotation.y = rotation;
    return group;
  }

  createTableAndChairs(x, y, z, rotation = 0) {
    const group = new THREE.Group();
    
    // Table
    const tableTopGeo = new THREE.BoxGeometry(2, 0.1, 1.2);
    const tableMat = new THREE.MeshStandardMaterial({ 
      color: 0x6B4423,
      map: this.createWoodTexture('#6B4423')
    });
    const tableTop = new THREE.Mesh(tableTopGeo, tableMat);
    tableTop.position.y = 0.8;
    tableTop.castShadow = true;
    group.add(tableTop);
    
    // Table legs
    const legGeo = new THREE.BoxGeometry(0.1, 0.8, 0.1);
    const legPositions = [[-0.9, 0.4, -0.5], [0.9, 0.4, -0.5], [-0.9, 0.4, 0.5], [0.9, 0.4, 0.5]];
    legPositions.forEach(pos => {
      const leg = new THREE.Mesh(legGeo, tableMat);
      leg.position.set(...pos);
      leg.castShadow = true;
      group.add(leg);
    });
    
    // Chairs
    const chairPositions = [[-1.3, 0, 0], [1.3, 0, 0], [0, 0, -0.9], [0, 0, 0.9]];
    chairPositions.forEach((pos, i) => {
      const chair = this.createChair(pos[0], pos[1], pos[2], i < 2 ? Math.PI / 2 : 0);
      group.add(chair);
    });
    
    group.position.set(x, y, z);
    group.rotation.y = rotation;
    return group;
  }

  createChair(x, y, z, rotation = 0) {
    const group = new THREE.Group();
    
    const chairMat = new THREE.MeshStandardMaterial({ 
      color: 0x5C3A1E,
      map: this.createWoodTexture('#5C3A1E')
    });
    
    // Seat
    const seatGeo = new THREE.BoxGeometry(0.5, 0.08, 0.5);
    const seat = new THREE.Mesh(seatGeo, chairMat);
    seat.position.y = 0.45;
    seat.castShadow = true;
    group.add(seat);
    
    // Legs
    const legGeo = new THREE.BoxGeometry(0.06, 0.45, 0.06);
    const legPositions = [[-0.2, 0.225, -0.2], [0.2, 0.225, -0.2], [-0.2, 0.225, 0.2], [0.2, 0.225, 0.2]];
    legPositions.forEach(pos => {
      const leg = new THREE.Mesh(legGeo, chairMat);
      leg.position.set(...pos);
      leg.castShadow = true;
      group.add(leg);
    });
    
    // Backrest
    const backGeo = new THREE.BoxGeometry(0.5, 0.5, 0.06);
    const back = new THREE.Mesh(backGeo, chairMat);
    back.position.set(0, 0.7, -0.22);
    back.castShadow = true;
    group.add(back);
    
    group.position.set(x, y, z);
    group.rotation.y = rotation;
    return group;
  }

  createHangingLightbulb(x, y, z) {
    const group = new THREE.Group();
    
    // Cord
    const cordGeo = new THREE.CylinderGeometry(0.01, 0.01, 1);
    const cordMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const cord = new THREE.Mesh(cordGeo, cordMat);
    cord.position.y = 0.5;
    group.add(cord);
    
    // Socket
    const socketGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.1);
    const socketMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const socket = new THREE.Mesh(socketGeo, socketMat);
    socket.position.y = 0;
    group.add(socket);
    
    // Bulb
    const bulbGeo = new THREE.SphereGeometry(0.12);
    const bulbMat = new THREE.MeshStandardMaterial({ 
      color: 0xFFFFCC,
      emissive: 0xFFFFCC,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.9
    });
    const bulb = new THREE.Mesh(bulbGeo, bulbMat);
    bulb.position.y = -0.15;
    group.add(bulb);
    
    // Light
    const light = new THREE.PointLight(0xFFCC66, 1.5, 8);
    light.position.y = -0.2;
    light.castShadow = true;
    light.shadow.bias = -0.001;
    group.add(light);
    
    group.position.set(x, y, z);
    return group;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SHERIFF STATION PROPS — Minecraft/Roblox aesthetic with Sildurs shaders
  // ═══════════════════════════════════════════════════════════════════════════

  // Create procedural rusted iron texture for jail bars
  createRustedIronTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    
    // Base dark iron color
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(0, 0, 128, 128);
    
    // Rust patches
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * 128;
      const y = Math.random() * 128;
      const r = 5 + Math.random() * 15;
      const rustColor = `rgba(${100 + Math.random() * 60}, ${50 + Math.random() * 30}, ${20 + Math.random() * 20}, ${0.3 + Math.random() * 0.4})`;
      ctx.fillStyle = rustColor;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Scratches and wear
    ctx.strokeStyle = 'rgba(100, 100, 100, 0.3)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 30; i++) {
      ctx.beginPath();
      ctx.moveTo(Math.random() * 128, Math.random() * 128);
      ctx.lineTo(Math.random() * 128, Math.random() * 128);
      ctx.stroke();
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.LinearFilter;
    return texture;
  }

  // Create leather texture for sheriff's chair
  createLeatherTexture(color = '#4A3728') {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    
    // Base leather color
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 256, 256);
    
    // Leather grain pattern
    for (let i = 0; i < 500; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      const w = 2 + Math.random() * 8;
      const h = 1 + Math.random() * 3;
      const shade = Math.random() > 0.5 ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.08)';
      ctx.fillStyle = shade;
      ctx.fillRect(x, y, w, h);
    }
    
    // Creases
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 10; i++) {
      ctx.beginPath();
      ctx.moveTo(Math.random() * 256, Math.random() * 256);
      ctx.bezierCurveTo(
        Math.random() * 256, Math.random() * 256,
        Math.random() * 256, Math.random() * 256,
        Math.random() * 256, Math.random() * 256
      );
      ctx.stroke();
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.LinearFilter;
    return texture;
  }

  // Create cork board texture for evidence board
  createCorkTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    
    // Base cork color
    ctx.fillStyle = '#c4a574';
    ctx.fillRect(0, 0, 256, 256);
    
    // Cork grain
    for (let i = 0; i < 1000; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      const shade = Math.random() > 0.5 ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.1)';
      ctx.fillStyle = shade;
      ctx.fillRect(x, y, 2, 2);
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.LinearFilter;
    return texture;
  }

  // Sildurs-style Jail Cell Bars — proper vertical iron bars with rust texture
  createJailCellBars(x, y, z, width = 4, height = 3, barCount = 8, rotation = 0) {
    const group = new THREE.Group();
    
    const rustedMat = new THREE.MeshStandardMaterial({
      color: 0x4a4a4a,
      map: this.createRustedIronTexture(),
      metalness: 0.7,
      roughness: 0.8,
    });
    
    const barGeo = new THREE.CylinderGeometry(0.04, 0.04, height, 8);
    
    // Vertical bars
    for (let i = 0; i < barCount; i++) {
      const bar = new THREE.Mesh(barGeo, rustedMat);
      const xPos = -width/2 + (i / (barCount - 1)) * width;
      bar.position.set(xPos, height/2, 0);
      bar.castShadow = true;
      group.add(bar);
    }
    
    // Horizontal support bars (top and bottom)
    const hBarGeo = new THREE.BoxGeometry(width + 0.2, 0.08, 0.08);
    const topBar = new THREE.Mesh(hBarGeo, rustedMat);
    topBar.position.set(0, height - 0.1, 0);
    group.add(topBar);
    
    const bottomBar = new THREE.Mesh(hBarGeo, rustedMat);
    bottomBar.position.set(0, 0.1, 0);
    group.add(bottomBar);
    
    // Lock mechanism
    const lockGeo = new THREE.BoxGeometry(0.25, 0.35, 0.15);
    const lockMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.9, roughness: 0.3 });
    const lock = new THREE.Mesh(lockGeo, lockMat);
    lock.position.set(width/2 - 0.3, height/2, 0.08);
    group.add(lock);
    
    group.position.set(x, y, z);
    group.rotation.y = rotation;
    return group;
  }

  // Sildurs-style Sheriff Desk — detailed wooden desk with props
  createSheriffDesk(x, y, z, rotation = 0) {
    const group = new THREE.Group();
    
    const woodMat = new THREE.MeshStandardMaterial({
      color: 0x6B4423,
      map: this.createWoodTexture('#6B4423'),
      roughness: 0.6,
    });
    
    const darkWoodMat = new THREE.MeshStandardMaterial({
      color: 0x4A3728,
      map: this.createWoodTexture('#4A3728'),
      roughness: 0.7,
    });
    
    // Desktop — large executive desk
    const topGeo = new THREE.BoxGeometry(2.4, 0.12, 1.4);
    const top = new THREE.Mesh(topGeo, woodMat);
    top.position.y = 0.8;
    top.castShadow = true;
    top.receiveShadow = true;
    group.add(top);
    
    // Desk body/pedestals
    const leftPedestalGeo = new THREE.BoxGeometry(0.5, 0.75, 1.1);
    const leftPedestal = new THREE.Mesh(leftPedestalGeo, darkWoodMat);
    leftPedestal.position.set(-0.7, 0.375, 0);
    leftPedestal.castShadow = true;
    group.add(leftPedestal);
    
    const rightPedestalGeo = new THREE.BoxGeometry(0.5, 0.75, 1.1);
    const rightPedestal = new THREE.Mesh(rightPedestalGeo, darkWoodMat);
    rightPedestal.position.set(0.7, 0.375, 0);
    rightPedestal.castShadow = true;
    group.add(rightPedestal);
    
    // Drawer fronts with handles
    const drawerGeo = new THREE.BoxGeometry(0.4, 0.18, 0.02);
    const handleGeo = new THREE.SphereGeometry(0.03);
    const handleMat = new THREE.MeshStandardMaterial({ color: 0xFFD700, metalness: 0.8 });
    
    // Left pedestal drawers
    for (let i = 0; i < 3; i++) {
      const drawer = new THREE.Mesh(drawerGeo, woodMat);
      drawer.position.set(-0.7, 0.6 - i * 0.22, 0.56);
      group.add(drawer);
      const handle = new THREE.Mesh(handleGeo, handleMat);
      handle.position.set(-0.7, 0.6 - i * 0.22, 0.58);
      group.add(handle);
    }
    
    // Right pedestal drawers
    for (let i = 0; i < 3; i++) {
      const drawer = new THREE.Mesh(drawerGeo, woodMat);
      drawer.position.set(0.7, 0.6 - i * 0.22, 0.56);
      group.add(drawer);
      const handle = new THREE.Mesh(handleGeo, handleMat);
      handle.position.set(0.7, 0.6 - i * 0.22, 0.58);
      group.add(handle);
    }
    
    // Center drawer
    const centerDrawer = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.15, 0.02), woodMat);
    centerDrawer.position.set(0, 0.65, 0.56);
    group.add(centerDrawer);
    const centerHandle = new THREE.Mesh(handleGeo, handleMat);
    centerHandle.position.set(0, 0.65, 0.58);
    group.add(centerHandle);
    
    // Computer monitor on desk
    const monitorBaseGeo = new THREE.BoxGeometry(0.2, 0.05, 0.18);
    const monitorMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const monitorBase = new THREE.Mesh(monitorBaseGeo, monitorMat);
    monitorBase.position.set(-0.5, 0.86, -0.2);
    group.add(monitorBase);
    
    const monitorStandGeo = new THREE.BoxGeometry(0.04, 0.25, 0.04);
    const monitorStand = new THREE.Mesh(monitorStandGeo, monitorMat);
    monitorStand.position.set(-0.5, 0.98, -0.2);
    group.add(monitorStand);
    
    const monitorFrameGeo = new THREE.BoxGeometry(0.5, 0.35, 0.04);
    const monitorFrame = new THREE.Mesh(monitorFrameGeo, monitorMat);
    monitorFrame.position.set(-0.5, 1.2, -0.2);
    group.add(monitorFrame);
    
    // Screen with glow
    const screenGeo = new THREE.PlaneGeometry(0.45, 0.3);
    const screenMat = new THREE.MeshBasicMaterial({ color: 0x4488ff });
    const screen = new THREE.Mesh(screenGeo, screenMat);
    screen.position.set(-0.5, 1.2, -0.17);
    group.add(screen);
    
    // Screen glow light
    const screenLight = new THREE.PointLight(0x4488ff, 0.5, 3);
    screenLight.position.set(-0.5, 1.2, -0.1);
    group.add(screenLight);
    
    // Coffee mug
    const mugGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.12, 8);
    const mugMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const mug = new THREE.Mesh(mugGeo, mugMat);
    mug.position.set(0.6, 0.86, 0.3);
    group.add(mug);
    
    // Mug handle
    const mugHandleGeo = new THREE.TorusGeometry(0.04, 0.01, 4, 8, Math.PI);
    const mugHandle = new THREE.Mesh(mugHandleGeo, mugMat);
    mugHandle.position.set(0.66, 0.86, 0.3);
    mugHandle.rotation.z = Math.PI / 2;
    group.add(mugHandle);
    
    // Stack of papers
    const papersGeo = new THREE.BoxGeometry(0.3, 0.02, 0.4);
    const papersMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f5 });
    const papers = new THREE.Mesh(papersGeo, papersMat);
    papers.position.set(0.3, 0.87, 0.4);
    papers.rotation.y = 0.2;
    group.add(papers);
    
    // Pen
    const penGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.15, 6);
    const penMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const pen = new THREE.Mesh(penGeo, penMat);
    pen.position.set(0.5, 0.88, 0.5);
    pen.rotation.z = Math.PI / 2;
    pen.rotation.y = 0.3;
    group.add(pen);
    
    // Desk lamp
    const lampBaseGeo = new THREE.CylinderGeometry(0.08, 0.1, 0.04, 8);
    const lampMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.5 });
    const lampBase = new THREE.Mesh(lampBaseGeo, lampMat);
    lampBase.position.set(0.8, 0.86, -0.4);
    group.add(lampBase);
    
    const lampArmGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.4, 6);
    const lampArm = new THREE.Mesh(lampArmGeo, lampMat);
    lampArm.position.set(0.8, 1.05, -0.4);
    lampArm.rotation.x = 0.3;
    group.add(lampArm);
    
    const lampHeadGeo = new THREE.ConeGeometry(0.08, 0.15, 8, 1, true);
    const lampHead = new THREE.Mesh(lampHeadGeo, lampMat);
    lampHead.position.set(0.8, 1.2, -0.35);
    lampHead.rotation.x = 0.5;
    group.add(lampHead);
    
    // Lamp light
    const lampLight = new THREE.PointLight(0xFFCC66, 1, 5);
    lampLight.position.set(0.8, 1.15, -0.3);
    group.add(lampLight);
    
    group.position.set(x, y, z);
    group.rotation.y = rotation;
    return group;
  }

  // Sildurs-style Sheriff Chair — leather executive chair
  createSheriffChair(x, y, z, rotation = 0) {
    const group = new THREE.Group();
    
    const leatherMat = new THREE.MeshStandardMaterial({
      color: 0x4A3728,
      map: this.createLeatherTexture('#4A3728'),
      roughness: 0.7,
    });
    
    const metalMat = new THREE.MeshStandardMaterial({
      color: 0x333333,
      metalness: 0.8,
      roughness: 0.3,
    });
    
    // Seat cushion
    const seatGeo = new THREE.BoxGeometry(0.6, 0.12, 0.6);
    const seat = new THREE.Mesh(seatGeo, leatherMat);
    seat.position.y = 0.5;
    seat.castShadow = true;
    group.add(seat);
    
    // Backrest
    const backGeo = new THREE.BoxGeometry(0.6, 0.7, 0.1);
    const back = new THREE.Mesh(backGeo, leatherMat);
    back.position.set(0, 0.9, -0.28);
    back.castShadow = true;
    group.add(back);
    
    // Armrests
    const armGeo = new THREE.BoxGeometry(0.08, 0.04, 0.5);
    const leftArm = new THREE.Mesh(armGeo, leatherMat);
    leftArm.position.set(-0.34, 0.7, 0);
    group.add(leftArm);
    
    const rightArm = new THREE.Mesh(armGeo, leatherMat);
    rightArm.position.set(0.34, 0.7, 0);
    group.add(rightArm);
    
    // Arm supports
    const armSupportGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.2, 6);
    const leftSupport = new THREE.Mesh(armSupportGeo, metalMat);
    leftSupport.position.set(-0.34, 0.6, 0);
    group.add(leftSupport);
    
    const rightSupport = new THREE.Mesh(armSupportGeo, metalMat);
    rightSupport.position.set(0.34, 0.6, 0);
    group.add(rightSupport);
    
    // Base pedestal
    const pedestalGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.4, 8);
    const pedestal = new THREE.Mesh(pedestalGeo, metalMat);
    pedestal.position.y = 0.25;
    group.add(pedestal);
    
    // Five-star base
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.25), metalMat);
      arm.position.set(Math.cos(angle) * 0.15, 0.05, Math.sin(angle) * 0.15);
      arm.rotation.y = angle;
      group.add(arm);
      
      // Wheel
      const wheelGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.03, 8);
      const wheel = new THREE.Mesh(wheelGeo, metalMat);
      wheel.position.set(Math.cos(angle) * 0.28, 0.02, Math.sin(angle) * 0.28);
      group.add(wheel);
    }
    
    group.position.set(x, y, z);
    group.rotation.y = rotation;
    return group;
  }

  // Sildurs-style Evidence Board — cork board with photos and string
  createEvidenceBoard(x, y, z, rotation = 0) {
    const group = new THREE.Group();
    
    const corkMat = new THREE.MeshStandardMaterial({
      color: 0xc4a574,
      map: this.createCorkTexture(),
      roughness: 0.9,
    });
    
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x5C3A1E,
      map: this.createWoodTexture('#5C3A1E'),
      roughness: 0.7,
    });
    
    // Board frame
    const frameGeo = new THREE.BoxGeometry(2.2, 1.6, 0.08);
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.castShadow = true;
    group.add(frame);
    
    // Cork surface
    const corkGeo = new THREE.BoxGeometry(2.0, 1.4, 0.02);
    const cork = new THREE.Mesh(corkGeo, corkMat);
    cork.position.z = 0.05;
    group.add(cork);
    
    // Photos (small colored rectangles)
    const photoColors = [0xffffff, 0xdddddd, 0xbbbbbb];
    const photoPositions = [
      [-0.6, 0.3], [-0.2, 0.4], [0.3, 0.35], [0.6, 0.2],
      [-0.7, -0.2], [-0.3, -0.3], [0.2, -0.25], [0.7, -0.35],
    ];
    
    photoPositions.forEach(([px, py]) => {
      const photoGeo = new THREE.PlaneGeometry(0.25, 0.2);
      const photoMat = new THREE.MeshBasicMaterial({ color: photoColors[Math.floor(Math.random() * photoColors.length)] });
      const photo = new THREE.Mesh(photoGeo, photoMat);
      photo.position.set(px, py, 0.07);
      photo.rotation.z = (Math.random() - 0.5) * 0.2;
      group.add(photo);
      
      // Push pin
      const pinGeo = new THREE.SphereGeometry(0.015, 6, 6);
      const pinMat = new THREE.MeshStandardMaterial({ color: Math.random() > 0.5 ? 0xff0000 : 0x0000ff });
      const pin = new THREE.Mesh(pinGeo, pinMat);
      pin.position.set(px, py + 0.08, 0.08);
      group.add(pin);
    });
    
    // Investigation string (red yarn connecting photos)
    const stringMat = new THREE.MeshBasicMaterial({ color: 0xcc0000 });
    const stringGeo = new THREE.CylinderGeometry(0.003, 0.003, 1.2, 4);
    const string1 = new THREE.Mesh(stringGeo, stringMat);
    string1.position.set(-0.1, 0.1, 0.07);
    string1.rotation.z = 0.5;
    group.add(string1);
    
    const string2 = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 1.0, 4), stringMat);
    string2.position.set(0.2, -0.05, 0.07);
    string2.rotation.z = -0.3;
    group.add(string2);
    
    group.position.set(x, y, z);
    group.rotation.y = rotation;
    return group;
  }

  // Sildurs-style Weapon Rack — proper rifle rack for sheriff station
  createWeaponRack(x, y, z, rotation = 0) {
    const group = new THREE.Group();
    
    const woodMat = new THREE.MeshStandardMaterial({
      color: 0x5C3A1E,
      map: this.createWoodTexture('#5C3A1E'),
      roughness: 0.7,
    });
    
    const metalMat = new THREE.MeshStandardMaterial({
      color: 0x222222,
      metalness: 0.8,
      roughness: 0.3,
    });
    
    // Backboard
    const boardGeo = new THREE.BoxGeometry(2, 1.2, 0.06);
    const board = new THREE.Mesh(boardGeo, woodMat);
    board.position.y = 1.2;
    board.castShadow = true;
    group.add(board);
    
    // Rifle hooks/holders
    for (let i = 0; i < 4; i++) {
      const hookGeo = new THREE.BoxGeometry(0.08, 0.04, 0.12);
      const hook = new THREE.Mesh(hookGeo, metalMat);
      hook.position.set(-0.6 + i * 0.4, 1.6, 0.08);
      group.add(hook);
      
      const bottomHook = new THREE.Mesh(hookGeo, metalMat);
      bottomHook.position.set(-0.6 + i * 0.4, 0.8, 0.08);
      group.add(bottomHook);
      
      // Rifle
      const rifleStockGeo = new THREE.BoxGeometry(0.06, 0.7, 0.08);
      const rifleStock = new THREE.Mesh(rifleStockGeo, woodMat);
      rifleStock.position.set(-0.6 + i * 0.4, 1.2, 0.12);
      rifleStock.rotation.z = (Math.random() - 0.5) * 0.05;
      group.add(rifleStock);
      
      // Barrel
      const barrelGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6);
      const barrel = new THREE.Mesh(barrelGeo, metalMat);
      barrel.position.set(-0.6 + i * 0.4, 1.7, 0.12);
      group.add(barrel);
    }
    
    group.position.set(x, y, z);
    group.rotation.y = rotation;
    return group;
  }

  // Sildurs-style Filing Cabinet — detailed metal cabinet with drawers
  createSheriffFilingCabinet(x, y, z, rotation = 0) {
    const group = new THREE.Group();
    
    const cabinetMat = new THREE.MeshStandardMaterial({
      color: 0x4a5568,
      map: this.createMetalTexture('#4a5568'),
      metalness: 0.7,
      roughness: 0.4,
    });
    
    const handleMat = new THREE.MeshStandardMaterial({
      color: 0x222222,
      metalness: 0.9,
      roughness: 0.2,
    });
    
    // Cabinet body
    const bodyGeo = new THREE.BoxGeometry(0.6, 1.6, 0.55);
    const body = new THREE.Mesh(bodyGeo, cabinetMat);
    body.position.y = 0.8;
    body.castShadow = true;
    group.add(body);
    
    // Drawers
    for (let i = 0; i < 4; i++) {
      // Drawer front
      const drawerGeo = new THREE.BoxGeometry(0.52, 0.32, 0.02);
      const drawer = new THREE.Mesh(drawerGeo, cabinetMat);
      drawer.position.set(0, 1.35 - i * 0.38, 0.28);
      group.add(drawer);
      
      // Label holder
      const labelGeo = new THREE.PlaneGeometry(0.2, 0.08);
      const labelMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const label = new THREE.Mesh(labelGeo, labelMat);
      label.position.set(0, 1.35 - i * 0.38, 0.29);
      group.add(label);
      
      // Handle
      const handleGeo = new THREE.BoxGeometry(0.15, 0.03, 0.04);
      const handle = new THREE.Mesh(handleGeo, handleMat);
      handle.position.set(0, 1.28 - i * 0.38, 0.3);
      group.add(handle);
    }
    
    group.position.set(x, y, z);
    group.rotation.y = rotation;
    return group;
  }

  // Sildurs-style Wanted Posters — wall-mounted wanted board
  createWantedBoard(x, y, z, rotation = 0) {
    const group = new THREE.Group();
    
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x5C3A1E,
      map: this.createWoodTexture('#5C3A1E'),
      roughness: 0.7,
    });
    
    // Frame
    const frameGeo = new THREE.BoxGeometry(1.8, 1.2, 0.04);
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.castShadow = true;
    group.add(frame);
    
    // Poster backgrounds
    const posterPositions = [[-0.5, 0.2], [0.5, 0.2], [0, -0.3]];
    posterPositions.forEach(([px, py]) => {
      // Paper
      const paperGeo = new THREE.PlaneGeometry(0.5, 0.6);
      const paperMat = new THREE.MeshStandardMaterial({ color: 0xf5f5dc });
      const paper = new THREE.Mesh(paperGeo, paperMat);
      paper.position.set(px, py, 0.03);
      paper.rotation.z = (Math.random() - 0.5) * 0.1;
      group.add(paper);
      
      // "WANTED" text area (red strip)
      const wantedStripGeo = new THREE.PlaneGeometry(0.45, 0.1);
      const wantedStripMat = new THREE.MeshBasicMaterial({ color: 0x8b0000 });
      const wantedStrip = new THREE.Mesh(wantedStripGeo, wantedStripMat);
      wantedStrip.position.set(px, py + 0.2, 0.04);
      group.add(wantedStrip);
      
      // Silhouette area (dark rectangle)
      const silhouetteGeo = new THREE.PlaneGeometry(0.3, 0.25);
      const silhouetteMat = new THREE.MeshBasicMaterial({ color: 0x333333 });
      const silhouette = new THREE.Mesh(silhouetteGeo, silhouetteMat);
      silhouette.position.set(px, py - 0.05, 0.04);
      group.add(silhouette);
    });
    
    group.position.set(x, y, z);
    group.rotation.y = rotation;
    return group;
  }

  // Sildurs-style Sheriff Badge — wall-mounted badge decoration
  createSheriffBadge(x, y, z, rotation = 0) {
    const group = new THREE.Group();
    
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xFFD700,
      metalness: 1.0,
      roughness: 0.2,
    });
    
    // Star shape (simplified as a flattened cone with 5 segments)
    const starGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.04, 10);
    const star = new THREE.Mesh(starGeo, goldMat);
    star.castShadow = true;
    group.add(star);
    
    // Center circle
    const centerGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.05, 16);
    const center = new THREE.Mesh(centerGeo, goldMat);
    center.position.y = 0.01;
    group.add(center);
    
    // Glow light
    const badgeLight = new THREE.PointLight(0xFFD700, 0.8, 3);
    badgeLight.position.y = 0.2;
    group.add(badgeLight);
    
    group.position.set(x, y, z);
    group.rotation.y = rotation;
    return group;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ROOM SETUP METHODS — Populate entire rooms
  // ═══════════════════════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════════════════════
  // HOSPITAL INTERIOR REVAMP — Sildurs-shader-inspired realistic clinical space
  //
  // Design goals:
  //   • Smooth PBR materials with per-material roughness/metalness, NOT reused
  //   • Distinct prop geometry — each piece looks like its real-world counterpart
  //   • Layered lighting: fluorescent panels, monitor glows, under-bed warmth
  //   • Clean tile floors, clinical white walls with blue accent stripe
  //   • Proper hospital ward layout: nursing station + clear centre aisle + side treatment bay
  // ═══════════════════════════════════════════════════════════════════════════
  setupHospitalRoom() {
    const cx = -36, cz = -36, y = 3;
    const props = [];

    // ── FLOOR OVERLAY — large tile plane (sits just above voxel floor) ──
    const floorGeo = new THREE.PlaneGeometry(22, 18);
    const floorMat = new THREE.MeshStandardMaterial({
      map: this.createTileTexture('#f4f6f8', '#c2c8ce'),
      roughness: 0.28, metalness: 0.06,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.set(cx, y + 0.02, cz + 0.5);
    floorMesh.receiveShadow = true;
    this.scene.add(floorMesh);
    props.push(floorMesh);

    // ── BLUE ACCENT STRIPE on walls (near floor, clinical look) ──────────
    // These are thin plane decals on north & south interior walls
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0x3a7ec8, roughness: 0.5 });
    [[cx, y + 0.55, cz - 8.85, 22, 0.22, 0],   // south wall
     [cx, y + 0.55, cz + 8.85, 22, 0.22, 0],   // north wall
    ].forEach(([px,py,pz,w,h,ry]) => {
      const sg = new THREE.PlaneGeometry(w, h);
      const sm = new THREE.Mesh(sg, stripeMat);
      sm.position.set(px, py, pz);
      sm.rotation.y = ry === 0 ? 0 : Math.PI;
      this.scene.add(sm); props.push(sm);
    });

    // ── NURSING STATION — reception desk in south zone ─────────────────
    // L-shaped counter with smooth MeshStandard surfaces
    const counterMat = new THREE.MeshStandardMaterial({
      color: 0xd8dfe8, roughness: 0.35, metalness: 0.18,
      map: this.createEquipmentTexture('#d8dfe8'),
    });
    const counterTopMat = new THREE.MeshStandardMaterial({ color: 0x4a6880, roughness: 0.25, metalness: 0.45 });
    // Long counter
    const cGeo = new THREE.BoxGeometry(5.8, 1.02, 0.85);
    const counter = new THREE.Mesh(cGeo, counterMat);
    counter.position.set(cx - 3, y + 0.51, cz - 6);
    counter.castShadow = true; counter.receiveShadow = true;
    this.scene.add(counter); props.push(counter);
    const ctopGeo = new THREE.BoxGeometry(5.8, 0.06, 0.92);
    const ctop = new THREE.Mesh(ctopGeo, counterTopMat);
    ctop.position.set(cx - 3, y + 1.03, cz - 6);
    this.scene.add(ctop); props.push(ctop);
    // Short wing
    const cwGeo = new THREE.BoxGeometry(0.85, 1.02, 2.4);
    const cw = new THREE.Mesh(cwGeo, counterMat);
    cw.position.set(cx - 5.85, y + 0.51, cz - 4.8);
    cw.castShadow = true; this.scene.add(cw); props.push(cw);
    const cwTopGeo = new THREE.BoxGeometry(0.92, 0.06, 2.4);
    const cwTop = new THREE.Mesh(cwTopGeo, counterTopMat);
    cwTop.position.set(cx - 5.85, y + 1.03, cz - 4.8);
    this.scene.add(cwTop); props.push(cwTop);

    // Nursing station monitor (2x)
    props.push(this.createHeartMonitor(cx - 2, y + 1.04, cz - 6.1, Math.PI));
    props.push(this.createHeartMonitor(cx - 4.5, y + 1.04, cz - 6.1, Math.PI));

    // ── WAITING CHAIRS — modern padded, not stone brick ─────────────────
    const chairMat = new THREE.MeshStandardMaterial({ color: 0x4a6a9a, roughness: 0.65 });
    const chairLegMat = new THREE.MeshStandardMaterial({ color: 0x888e96, metalness: 0.8, roughness: 0.22 });
    for (let i = 0; i < 5; i++) {
      // Seat
      const sGeo = new THREE.BoxGeometry(0.52, 0.1, 0.5);
      const seat = new THREE.Mesh(sGeo, chairMat);
      // Back
      const bkGeo = new THREE.BoxGeometry(0.52, 0.46, 0.07);
      const back = new THREE.Mesh(bkGeo, chairMat);
      back.position.set(0, 0.28, -0.22);
      // Legs
      const lGeo = new THREE.BoxGeometry(0.04, 0.42, 0.04);
      const positions = [[-0.22, -0.21, 0.18],[0.22,-0.21,0.18],[-0.22,-0.21,-0.2],[0.22,-0.21,-0.2]];

      const chairGroup = new THREE.Group();
      chairGroup.add(seat);
      chairGroup.add(back);
      positions.forEach(p => {
        const leg = new THREE.Mesh(lGeo, chairLegMat);
        leg.position.set(...p); chairGroup.add(leg);
      });
      chairGroup.position.set(cx + 5 + i * 0.7, y + 0.51, cz - 7.5);
      this.scene.add(chairGroup); props.push(chairGroup);
    }

    // ── PATIENT BEDS — 6 beds in ward zone ───────────────────────────────
    // Row 1: 3 beds along west wall
    props.push(this.createHospitalBed(cx - 9, y, cz + 1, 0));
    props.push(this.createHospitalBed(cx - 9, y, cz + 5, 0));
    // Row 2: 3 beds along east wall
    props.push(this.createHospitalBed(cx + 8, y, cz + 1, Math.PI));
    props.push(this.createHospitalBed(cx + 8, y, cz + 5, Math.PI));

    // ── IV STANDS ─────────────────────────────────────────────────────────
    props.push(this.createIVStand(cx - 7.3, y, cz + 1.6));
    props.push(this.createIVStand(cx - 7.3, y, cz + 5.6));
    props.push(this.createIVStand(cx + 6.3, y, cz + 1.6));
    props.push(this.createIVStand(cx + 6.3, y, cz + 5.6));

    // ── HEART MONITORS ────────────────────────────────────────────────────
    props.push(this.createHeartMonitor(cx - 10.2, y, cz + 1, Math.PI / 2));
    props.push(this.createHeartMonitor(cx - 10.2, y, cz + 5, Math.PI / 2));
    props.push(this.createHeartMonitor(cx + 9.2,  y, cz + 1, -Math.PI / 2));
    props.push(this.createHeartMonitor(cx + 9.2,  y, cz + 5, -Math.PI / 2));

    // ── SUPPLY CABINETS on north wall ─────────────────────────────────────
    props.push(this.createMedicalCabinet(cx - 9,  y, cz + 8.4, Math.PI));
    props.push(this.createMedicalCabinet(cx - 7.5,y, cz + 8.4, Math.PI));
    props.push(this.createMedicalCabinet(cx + 7.5,y, cz + 8.4, Math.PI));
    props.push(this.createMedicalCabinet(cx + 9,  y, cz + 8.4, Math.PI));

    // ── OPERATING TABLE — centre of north ward ───────────────────────────
    const orGrp = new THREE.Group();
    const orMat = new THREE.MeshStandardMaterial({ color: 0xdce8ee, metalness: 0.55, roughness: 0.28 });
    const orTopMat = new THREE.MeshStandardMaterial({ color: 0xd0dce6, metalness: 0.4, roughness: 0.18,
      map: this.createLinenTexture('#d0dce6') });
    const orBody = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.25, 2.0), orMat);
    orBody.position.y = 0.88; orBody.castShadow = true; orGrp.add(orBody);
    const orSurface = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.065, 1.92), orTopMat);
    orSurface.position.y = 1.01; orGrp.add(orSurface);
    // Articulated support post
    const orPost = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.88, 8), orMat);
    orPost.position.y = 0.44; orGrp.add(orPost);
    // Base plate
    const orBase = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.05, 1.3), orMat);
    orBase.position.y = 0.025; orGrp.add(orBase);
    // Leg arm supports
    [[-0.5, 0],[0.5, 0]].forEach(([lz]) => {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.04), orMat);
      arm.position.set(0, 0.88, lz); orGrp.add(arm);
    });
    orGrp.position.set(cx + 5.1, y, cz + 5.5);
    this.scene.add(orGrp); props.push(orGrp);

    // Overhead surgical light rig
    const surgRig = new THREE.Group();
    // Boom arm
    const boomGeo = new THREE.CylinderGeometry(0.022, 0.022, 1.4, 8);
    const boomMat = new THREE.MeshStandardMaterial({ color: 0xc0c8d0, metalness: 0.8, roughness: 0.18 });
    const boom = new THREE.Mesh(boomGeo, boomMat);
    boom.rotation.z = Math.PI/2; boom.position.set(-0.7, 0, 0); surgRig.add(boom);
    // Lamp head — flat disc with emissive underside
    const lampHead = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.09, 16), boomMat);
    lampHead.castShadow = true; surgRig.add(lampHead);
    // Emissive lens (underside)
    const lensMat = new THREE.MeshBasicMaterial({ color: 0xfff8e8 });
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.33, 16), lensMat);
    lens.rotation.x = Math.PI / 2; lens.position.y = -0.06; surgRig.add(lens);
    const lampLight = new THREE.SpotLight(0xfff8e0, 8.5, 10.0, Math.PI/4.5, 0.28, 1.05);
    lampLight.castShadow = true;
    surgRig.add(lampLight);
    surgRig.position.set(cx + 5.1, y + 9.8, cz + 5.5);
    this.scene.add(surgRig); props.push(surgRig);

    const cartGrp = new THREE.Group();
    const cartFrameMat = new THREE.MeshStandardMaterial({ color: 0xcfd7df, metalness: 0.55, roughness: 0.26 });
    const cartTrayMat = new THREE.MeshStandardMaterial({ color: 0x4f6f8a, metalness: 0.18, roughness: 0.34 });
    const cartTop = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.6), cartTrayMat);
    cartTop.position.y = 0.92; cartGrp.add(cartTop);
    const cartShelf = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.06, 0.54), cartFrameMat);
    cartShelf.position.y = 0.42; cartGrp.add(cartShelf);
    [[-0.34, -0.24], [0.34, -0.24], [-0.34, 0.24], [0.34, 0.24]].forEach(([px, pz]) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.82, 8), cartFrameMat);
      leg.position.set(px, 0.48, pz); cartGrp.add(leg);
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 10), cartFrameMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(px, 0.06, pz); cartGrp.add(wheel);
    });
    cartGrp.position.set(cx + 1.9, y, cz + 6.3);
    this.scene.add(cartGrp); props.push(cartGrp);

    // ── FLUORESCENT CEILING PANELS — subtle cool-white clinical strips ───
    // Emissive quads for visual representation; dim PointLights for gentle fill.
    // Real hospitals use diffuse overhead lighting — bright but NOT glaring.
    const panelMat = new THREE.MeshBasicMaterial({ color: 0xddeeff });
    const panelPositions = [
      [cx - 7, y + 9.85, cz - 6], [cx, y + 9.85, cz - 6], [cx + 7, y + 9.85, cz - 6], // reception row
      [cx - 7, y + 9.85, cz + 3], [cx, y + 9.85, cz + 3], [cx + 7, y + 9.85, cz + 3], // ward row 1
      [cx - 7, y + 9.85, cz + 7], [cx + 7, y + 9.85, cz + 7],                           // ward row 2
    ];
    panelPositions.forEach(([px, py, pz]) => {
      const panGeo = new THREE.BoxGeometry(3.4, 0.04, 0.55);
      const panel = new THREE.Mesh(panGeo, panelMat);
      panel.position.set(px, py, pz);
      this.scene.add(panel); props.push(panel);
      // Gentle fill — dim enough that players and props are clearly visible
      const panLight = new THREE.PointLight(0xddeeff, 1.6, 11);
      panLight.position.set(px, py - 0.3, pz);
      this.scene.add(panLight); props.push(panLight);
    });

    // Broad room ambient fills — cool blue-white, low enough NOT to wash out scene
    const receptionFill = new THREE.PointLight(0xe8f4ff, 1.5, 18);
    receptionFill.position.set(cx - 2, y + 5.5, cz - 5.5);
    this.scene.add(receptionFill); props.push(receptionFill);
    const wardFill = new THREE.PointLight(0xe0f0ff, 1.6, 20);
    wardFill.position.set(cx, y + 5.8, cz + 4.5);
    this.scene.add(wardFill); props.push(wardFill);
    const entryCleanFill = new THREE.PointLight(0xeef8ff, 1.2, 13);
    entryCleanFill.position.set(cx, y + 4.8, cz - 9.5);
    this.scene.add(entryCleanFill); props.push(entryCleanFill);

    // ── HAND SANITIZER DISPENSERS ─────────────────────────────────────────
    [cx - 10.8, cx + 10.8].forEach(bx => {
      [[cz - 4],[cz + 2],[cz + 6]].forEach(([bz]) => {
        const dispGrp = new THREE.Group();
        const dispBody = new THREE.Mesh(
          new THREE.BoxGeometry(0.12, 0.28, 0.09),
          new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.3 })
        );
        dispBody.position.y = 0.14; dispGrp.add(dispBody);
        const nozzle = new THREE.Mesh(
          new THREE.CylinderGeometry(0.018, 0.018, 0.08, 6),
          new THREE.MeshStandardMaterial({ color: 0x4488aa })
        );
        nozzle.position.set(0, 0.32, 0.04); dispGrp.add(nozzle);
        dispGrp.position.set(bx, y + 1.2, bz);
        this.scene.add(dispGrp); props.push(dispGrp);
      });
    });

    // ── PRIVACY CURTAIN RAILS (visual only) ──────────────────────────────
    const curtainMat = new THREE.MeshStandardMaterial({
      color: 0x8ab0d0, transparent: true, opacity: 0.55, roughness: 0.9,
      side: THREE.DoubleSide,
    });
    const railMat = new THREE.MeshStandardMaterial({ color: 0xb8bdc2, metalness: 0.7, roughness: 0.3 });
    // Curtain for each bed bay
    [[cx - 7.4, cz + 0.2, 0], [cx - 7.4, cz + 4.2, 0],
     [cx + 7.4, cz + 0.2, Math.PI], [cx + 7.4, cz + 4.2, Math.PI]].forEach(([px,pz,ry]) => {
      const railGeo = new THREE.CylinderGeometry(0.015, 0.015, 2.2, 6);
      const rail = new THREE.Mesh(railGeo, railMat);
      rail.rotation.z = Math.PI/2; rail.position.set(px, y + 2.95, pz);
      this.scene.add(rail); props.push(rail);
      const curtGeo = new THREE.PlaneGeometry(2.1, 2.4);
      const curt = new THREE.Mesh(curtGeo, curtainMat);
      curt.position.set(px, y + 1.75, pz);
      curt.rotation.y = ry; this.scene.add(curt); props.push(curt);
    });

    // ── WASTE BIN near each bed cluster ───────────────────────────────────
    const binMat = new THREE.MeshStandardMaterial({ color: 0xdd2222, roughness: 0.55 });
    const lidMat = new THREE.MeshStandardMaterial({ color: 0xcc1111, roughness: 0.4 });
    [[cx - 8.5, cz + 3.4],[cx + 7.5, cz + 3.4],[cx + 2.8, cz + 7.1]].forEach(([bx, bz]) => {
      const binGrp = new THREE.Group();
      const binGeo = new THREE.CylinderGeometry(0.135, 0.11, 0.38, 8);
      binGrp.add(new THREE.Mesh(binGeo, binMat));
      const lidGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.04, 8);
      const lid = new THREE.Mesh(lidGeo, lidMat);
      lid.position.y = 0.21; binGrp.add(lid);
      // Biohazard label plane
      const lblMat = new THREE.MeshBasicMaterial({ color: 0xffcc00, side: THREE.DoubleSide });
      const lblGeo = new THREE.PlaneGeometry(0.09, 0.09);
      const lbl = new THREE.Mesh(lblGeo, lblMat);
      lbl.position.set(0, 0.05, 0.14); binGrp.add(lbl);
      binGrp.position.set(bx, y, bz);
      this.scene.add(binGrp); props.push(binGrp);
    });

    // ── WINDOW SILLS with small plants (humanising detail) ─────────────
    const potMat = new THREE.MeshStandardMaterial({ color: 0xaa7744, roughness: 0.8 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2a8a3a, roughness: 0.9 });
    [[cx - 5, cz - 8.8],[cx + 5, cz - 8.8]].forEach(([px, pz]) => {
      const potGrp = new THREE.Group();
      potGrp.add(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.14, 8), potMat));
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 5), leafMat);
      leaf.scale.y = 1.3; leaf.position.y = 0.16; potGrp.add(leaf);
      potGrp.position.set(px, y + 0.5, pz);
      this.scene.add(potGrp); props.push(potGrp);
    });

    props.forEach(p => { if (p && p.parent !== this.scene && p.isObject3D) this.scene.add(p); });
    this.props.set('hospital', props);
    return props;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAFIA BUNKER INTERIOR — Luxury criminal hideout with realistic details
  // Design: Executive office meets secret lair — leather, dark wood, gold accents
  // Props: Ornate desk, leather furniture, weapon displays, vault, bar, poker table
  // ═══════════════════════════════════════════════════════════════════════════
  setupBunkerRoom() {
    const cx = 0, cz = 48, y = 0;
    const props = [];
    
    // ── FLOORING — Dark polished wood with Persian rug area ───────────────────
    const floorGeo = new THREE.PlaneGeometry(24, 20);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x1e1208,       // much darker base — less ambient catch
      map: this.createWoodTexture('#1e1208'),
      roughness: 0.97,       // fully matte — no specular reflection of ambient/hemi lights
      metalness: 0.0,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.set(cx, y + 0.02, cz);
    floorMesh.receiveShadow = true;
    this.scene.add(floorMesh);
    props.push(floorMesh);
    
    // ── PERSIAN RUG — Central area luxury carpet ─────────────────────────────
    props.push(this.createPersianRug(cx, y, cz, 8, 6));
    
    // ── EXECUTIVE DESK — Ornate dark wood with gold trim ─────────────────────
    props.push(this.createExecutiveDesk(cx - 6, y, cz - 2, Math.PI / 2));
    
    // ── LEATHER EXECUTIVE CHAIR — Behind the desk ────────────────────────────
    props.push(this.createLeatherExecutiveChair(cx - 6, y, cz + 1.5, -Math.PI / 2));
    
    // ── LEATHER SOFA — Meeting area ──────────────────────────────────────────
    props.push(this.createLeatherSofa(cx + 2, y, cz - 6, 0));
    props.push(this.createLeatherArmchair(cx + 5, y, cz - 4, -Math.PI / 4));
    props.push(this.createLeatherArmchair(cx + 5, y, cz - 8, Math.PI / 4));
    
    // ── COFFEE TABLE — Between sofa and chairs ───────────────────────────────
    props.push(this.createGlassCoffeeTable(cx + 3.5, y, cz - 6));
    
    // ── VAULT DOOR — Secure storage (west wall) ──────────────────────────────
    props.push(this.createVaultDoor(cx - 11.5, y + 2, cz + 4, Math.PI / 2));
    
    // ── WEAPON DISPLAY WALL — Realistic rifles mounted ───────────────────────
    props.push(this.createWeaponDisplayWall(cx - 11.5, y + 2, cz - 4, Math.PI / 2));
    
    // ── BAR AREA — Corner bar with bottles ───────────────────────────────────
    props.push(this.createBarCounter(cx + 8, y, cz + 6, -Math.PI / 4));
    props.push(this.createBarStool(cx + 6.5, y, cz + 5.5, -Math.PI / 4));
    props.push(this.createBarStool(cx + 7.5, y, cz + 4.5, -Math.PI / 4));
    
    // ── POKER TABLE — Felt-top with chairs ───────────────────────────────────
    props.push(this.createPokerTable(cx + 6, y, cz - 2, 0));
    props.push(this.createPokerChair(cx + 6, y, cz - 4, 0));
    props.push(this.createPokerChair(cx + 8, y, cz - 2, Math.PI / 2));
    props.push(this.createPokerChair(cx + 6, y, cz, Math.PI));
    props.push(this.createPokerChair(cx + 4, y, cz - 2, -Math.PI / 2));
    
    // ── MONEY & GOLD — Stacks of cash and gold bars ──────────────────────────
    props.push(this.createMoneyStack(cx - 3, y + 0.05, cz + 5, 0));
    props.push(this.createMoneyStack(cx - 2.5, y + 0.05, cz + 5.3, 0.2));
    props.push(this.createGoldBars(cx - 2, y + 0.05, cz + 4.5, 0));
    
    // ── CHANDELIER — Central lighting ────────────────────────────────────────
    props.push(this.createChandelier(cx, y + 6, cz));
    
    // ── WALL SCONCES — Ambient lighting ──────────────────────────────────────
    props.push(this.createWallSconce(cx - 11.5, y + 3, cz, Math.PI / 2));
    props.push(this.createWallSconce(cx + 11.5, y + 3, cz, -Math.PI / 2));
    props.push(this.createWallSconce(cx, y + 3, cz - 9.5, 0));
    
    // ── MAFIA POSTER — Wall decoration ───────────────────────────────────────
    props.push(this.createMafiaPoster(cx, y + 2.5, cz - 9.8, 0));
    
    // ── ATMOSPHERIC LIGHTING ─────────────────────────────────────────────────
    // Mafia bunker: deeply atmospheric — dim warm amber key, red danger accent,
    // very low ambient so shadows are deep and dramatic (crime boss aesthetic).
    //
    // Research: Real mafia hideouts / luxury crime dens use incandescent tungsten
    // (warm 2700K), often with coloured accent light. Think velvet curtains,
    // gold fittings, dim warm table lamps, a single overhead key source.

    // Central chandelier — warm amber, moderate range, not overpowering
    const chandelierLight = new THREE.PointLight(0xffaa33, 0.35, 12);
    chandelierLight.position.set(cx, y + 5, cz);
    chandelierLight.castShadow = true;
    this.scene.add(chandelierLight);
    props.push(chandelierLight);

    // Red accent near vault — danger / power symbol
    const vaultLight = new THREE.PointLight(0xcc2200, 0.22, 6);
    vaultLight.position.set(cx - 9, y + 3, cz + 4);
    this.scene.add(vaultLight);
    props.push(vaultLight);

    // Desk banker's lamp warm pool — intimate work-light
    const deskLampLight = new THREE.PointLight(0xffcc44, 0.30, 6);
    deskLampLight.position.set(cx - 4.5, y + 2.5, cz - 2);
    this.scene.add(deskLampLight);
    props.push(deskLampLight);

    // Bar area — warm amber behind the bottles
    const barLight = new THREE.PointLight(0xff8822, 0.18, 7);
    barLight.position.set(cx + 9, y + 3, cz + 6);
    this.scene.add(barLight);
    props.push(barLight);

    // Sconce ambient fill — very subtle, just enough to see wall details
    const sconceFill = new THREE.PointLight(0xff9944, 0.12, 10);
    sconceFill.position.set(cx, y + 3.5, cz);
    this.scene.add(sconceFill);
    props.push(sconceFill);
    
    props.forEach(p => { if (p && p.parent !== this.scene && p.isObject3D) this.scene.add(p); });
    this.props.set('bunker', props);
    return props;
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // MAFIA BUNKER PROP CREATION FUNCTIONS — Realistic luxury criminal hideout
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Persian rug with ornate pattern
  createPersianRug(x, y, z, width, depth) {
    const group = new THREE.Group();
    
    // Rug texture
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    
    // Deep red base
    ctx.fillStyle = '#4a1525';
    ctx.fillRect(0, 0, 512, 512);
    
    // Ornate border
    ctx.strokeStyle = '#c9a84c';
    ctx.lineWidth = 8;
    ctx.strokeRect(20, 20, 472, 472);
    ctx.strokeStyle = '#1a3a5c';
    ctx.lineWidth = 4;
    ctx.strokeRect(35, 35, 442, 442);
    
    // Central medallion
    ctx.beginPath();
    ctx.arc(256, 256, 80, 0, Math.PI * 2);
    ctx.fillStyle = '#1a3a5c';
    ctx.fill();
    ctx.strokeStyle = '#c9a84c';
    ctx.lineWidth = 3;
    ctx.stroke();
    
    // Corner patterns
    for (const [cx, cy] of [[80, 80], [432, 80], [80, 432], [432, 432]]) {
      ctx.beginPath();
      ctx.arc(cx, cy, 40, 0, Math.PI * 2);
      ctx.fillStyle = '#2d1a4a';
      ctx.fill();
      ctx.strokeStyle = '#c9a84c';
      ctx.stroke();
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.LinearFilter;
    
    const rugGeo = new THREE.PlaneGeometry(width, depth);
    const rugMat = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.9,
      metalness: 0,
    });
    const rug = new THREE.Mesh(rugGeo, rugMat);
    rug.rotation.x = -Math.PI / 2;
    rug.position.y = 0.03;
    rug.receiveShadow = true;
    group.add(rug);
    
    // Fringe
    const fringeGeo = new THREE.PlaneGeometry(width, 0.15);
    const fringeMat = new THREE.MeshStandardMaterial({ color: 0xddccaa, roughness: 1 });
    const fringe1 = new THREE.Mesh(fringeGeo, fringeMat);
    fringe1.rotation.x = -Math.PI / 2;
    fringe1.position.set(0, 0.02, depth / 2 + 0.075);
    group.add(fringe1);
    const fringe2 = fringe1.clone();
    fringe2.position.set(0, 0.02, -depth / 2 - 0.075);
    group.add(fringe2);
    
    group.position.set(x, y, z);
    return group;
  }
  
  // Executive desk with ornate carved legs
  createExecutiveDesk(x, y, z, rotation = 0) {
    const group = new THREE.Group();
    
    const woodMat = new THREE.MeshStandardMaterial({
      color: 0x2a1810,
      map: this.createWoodTexture('#2a1810'),
      roughness: 0.3,
      metalness: 0.1,
    });
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xc9a84c,
      metalness: 0.9,
      roughness: 0.2,
    });
    
    // Desktop — large rectangular surface
    const topGeo = new THREE.BoxGeometry(4.5, 0.12, 2.2);
    const top = new THREE.Mesh(topGeo, woodMat);
    top.position.y = 1.5;
    top.castShadow = true;
    group.add(top);
    
    // Gold trim on desktop edge
    const trimGeo = new THREE.BoxGeometry(4.52, 0.04, 2.22);
    const trim = new THREE.Mesh(trimGeo, goldMat);
    trim.position.y = 1.44;
    group.add(trim);
    
    // Ornate carved legs — curved design
    const legPositions = [[-2, -0.9], [2, -0.9], [-2, 0.9], [2, 0.9]];
    for (const [lx, lz] of legPositions) {
      // Main leg column
      const legGeo = new THREE.CylinderGeometry(0.12, 0.08, 1.5, 8);
      const leg = new THREE.Mesh(legGeo, woodMat);
      leg.position.set(lx, 0.75, lz);
      leg.castShadow = true;
      group.add(leg);
      
      // Decorative gold band
      const bandGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.08, 8);
      const band = new THREE.Mesh(bandGeo, goldMat);
      band.position.set(lx, 1.1, lz);
      group.add(band);
      
      // Ornate foot
      const footGeo = new THREE.CylinderGeometry(0.15, 0.12, 0.1, 8);
      const foot = new THREE.Mesh(footGeo, goldMat);
      foot.position.set(lx, 0.05, lz);
      group.add(foot);
    }
    
    // Desk drawers front panel
    const drawerGeo = new THREE.BoxGeometry(4.3, 0.6, 0.08);
    const drawer = new THREE.Mesh(drawerGeo, woodMat);
    drawer.position.set(0, 1.15, 1.08);
    group.add(drawer);
    
    // Gold drawer handles
    for (const dx of [-1.2, 0, 1.2]) {
      const handleGeo = new THREE.SphereGeometry(0.06, 8, 8);
      const handle = new THREE.Mesh(handleGeo, goldMat);
      handle.position.set(dx, 1.15, 1.14);
      group.add(handle);
    }
    
    // Desk items — lamp, papers, cigar ashtray
    // Banker's lamp
    const lampBaseGeo = new THREE.CylinderGeometry(0.15, 0.2, 0.08, 8);
    const lampBase = new THREE.Mesh(lampBaseGeo, goldMat);
    lampBase.position.set(-1.5, 1.58, -0.5);
    group.add(lampBase);
    const lampStemGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.4, 6);
    const lampStem = new THREE.Mesh(lampStemGeo, goldMat);
    lampStem.position.set(-1.5, 1.8, -0.5);
    group.add(lampStem);
    const lampShadeGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.25, 16, 1, false, 0, Math.PI);
    const lampShadeMat = new THREE.MeshStandardMaterial({
      color: 0x1a3a5c,
      emissive: 0x1a3a5c,
      emissiveIntensity: 0.3,
    });
    const lampShade = new THREE.Mesh(lampShadeGeo, lampShadeMat);
    lampShade.position.set(-1.5, 1.95, -0.5);
    lampShade.rotation.z = Math.PI;
    group.add(lampShade);
    
    // Stack of papers
    const paperGeo = new THREE.BoxGeometry(0.6, 0.02, 0.8);
    const paperMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f0, roughness: 0.9 });
    const papers = new THREE.Mesh(paperGeo, paperMat);
    papers.position.set(0.5, 1.57, 0.3);
    papers.rotation.y = 0.1;
    group.add(papers);
    
    // Cigar ashtray
    const ashtrayGeo = new THREE.CylinderGeometry(0.12, 0.1, 0.04, 12);
    const ashtrayMat = new THREE.MeshStandardMaterial({
      color: 0x888888,
      metalness: 0.8,
      roughness: 0.3,
    });
    const ashtray = new THREE.Mesh(ashtrayGeo, ashtrayMat);
    ashtray.position.set(1.8, 1.56, 0.6);
    group.add(ashtray);
    
    // Cigar
    const cigarGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.18, 6);
    const cigarMat = new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 0.8 });
    const cigar = new THREE.Mesh(cigarGeo, cigarMat);
    cigar.position.set(1.8, 1.6, 0.6);
    cigar.rotation.z = Math.PI / 2;
    cigar.rotation.y = 0.3;
    group.add(cigar);
    
    group.position.set(x, y, z);
    group.rotation.y = rotation;
    return group;
  }
  
  // Leather executive chair with tufted back
  createLeatherExecutiveChair(x, y, z, rotation = 0) {
    const group = new THREE.Group();
    
    const leatherMat = new THREE.MeshStandardMaterial({
      color: 0x4a1810,
      roughness: 0.5,
      metalness: 0.1,
    });
    const darkLeatherMat = new THREE.MeshStandardMaterial({
      color: 0x2a1008,
      roughness: 0.55,
      metalness: 0.1,
    });
    const metalMat = new THREE.MeshStandardMaterial({
      color: 0x444444,
      metalness: 0.8,
      roughness: 0.3,
    });
    
    // Seat cushion — rounded box
    const seatGeo = new THREE.BoxGeometry(1.4, 0.25, 1.3);
    const seat = new THREE.Mesh(seatGeo, leatherMat);
    seat.position.y = 1.0;
    seat.castShadow = true;
    group.add(seat);
    
    // Tufted seat detail
    for (let tx = -0.5; tx <= 0.5; tx += 0.5) {
      for (let tz = -0.4; tz <= 0.4; tz += 0.4) {
        const buttonGeo = new THREE.SphereGeometry(0.025, 6, 6);
        const button = new THREE.Mesh(buttonGeo, darkLeatherMat);
        button.position.set(tx, 1.13, tz);
        group.add(button);
      }
    }
    
    // Backrest — tall and curved
    const backGeo = new THREE.BoxGeometry(1.3, 1.8, 0.25);
    const back = new THREE.Mesh(backGeo, leatherMat);
    back.position.set(0, 1.9, -0.55);
    back.rotation.x = -0.1;
    back.castShadow = true;
    group.add(back);
    
    // Tufted backrest
    for (let tx = -0.45; tx <= 0.45; tx += 0.45) {
      for (let ty = 1.4; ty <= 2.4; ty += 0.5) {
        const buttonGeo = new THREE.SphereGeometry(0.03, 6, 6);
        const button = new THREE.Mesh(buttonGeo, darkLeatherMat);
        button.position.set(tx, ty, -0.42);
        button.rotation.x = -0.1;
        group.add(button);
      }
    }
    
    // Armrests
    for (const ax of [-0.75, 0.75]) {
      const armGeo = new THREE.BoxGeometry(0.15, 0.1, 1.0);
      const arm = new THREE.Mesh(armGeo, leatherMat);
      arm.position.set(ax, 1.5, 0);
      group.add(arm);
      
      // Arm support
      const supportGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.5, 6);
      const support = new THREE.Mesh(supportGeo, metalMat);
      support.position.set(ax, 1.25, 0.3);
      group.add(support);
    }
    
    // Central pillar
    const pillarGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.8, 8);
    const pillar = new THREE.Mesh(pillarGeo, metalMat);
    pillar.position.y = 0.4;
    group.add(pillar);
    
    // Five-star base
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const legGeo = new THREE.BoxGeometry(0.08, 0.06, 0.6);
      const leg = new THREE.Mesh(legGeo, metalMat);
      leg.position.set(Math.sin(angle) * 0.3, 0.03, Math.cos(angle) * 0.3);
      leg.rotation.y = angle;
      group.add(leg);
      
      // Wheel caster
      const wheelGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.04, 8);
      const wheel = new THREE.Mesh(wheelGeo, metalMat);
      wheel.position.set(Math.sin(angle) * 0.55, 0.02, Math.cos(angle) * 0.55);
      wheel.rotation.x = Math.PI / 2;
      group.add(wheel);
    }
    
    group.position.set(x, y, z);
    group.rotation.y = rotation;
    return group;
  }
  
  // Leather sofa — three-seater
  createLeatherSofa(x, y, z, rotation = 0) {
    const group = new THREE.Group();
    
    const leatherMat = new THREE.MeshStandardMaterial({
      color: 0x4a1810,
      roughness: 0.5,
      metalness: 0.1,
    });
    const darkLeatherMat = new THREE.MeshStandardMaterial({
      color: 0x2a1008,
      roughness: 0.55,
      metalness: 0.1,
    });
    
    // Main seat
    const seatGeo = new THREE.BoxGeometry(3.6, 0.35, 1.2);
    const seat = new THREE.Mesh(seatGeo, leatherMat);
    seat.position.y = 0.6;
    seat.castShadow = true;
    group.add(seat);
    
    // Three seat cushions
    for (let sx = -1.1; sx <= 1.1; sx += 1.1) {
      const cushionGeo = new THREE.BoxGeometry(1.05, 0.1, 1.05);
      const cushion = new THREE.Mesh(cushionGeo, darkLeatherMat);
      cushion.position.set(sx, 0.83, 0);
      group.add(cushion);
    }
    
    // Backrest
    const backGeo = new THREE.BoxGeometry(3.6, 1.2, 0.25);
    const back = new THREE.Mesh(backGeo, leatherMat);
    back.position.set(0, 1.2, -0.55);
    back.castShadow = true;
    group.add(back);
    
    // Armrests
    for (const ax of [-1.9, 1.9]) {
      const armGeo = new THREE.BoxGeometry(0.3, 0.7, 1.2);
      const arm = new THREE.Mesh(armGeo, leatherMat);
      arm.position.set(ax, 0.8, 0);
      arm.castShadow = true;
      group.add(arm);
    }
    
    // Wooden legs
    const legGeo = new THREE.CylinderGeometry(0.06, 0.04, 0.25, 6);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x3d2817, roughness: 0.6 });
    for (const [lx, lz] of [[-1.6, -0.4], [1.6, -0.4], [-1.6, 0.4], [1.6, 0.4]]) {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(lx, 0.125, lz);
      group.add(leg);
    }
    
    group.position.set(x, y, z);
    group.rotation.y = rotation;
    return group;
  }
  
  // Leather armchair — single seater
  createLeatherArmchair(x, y, z, rotation = 0) {
    const group = new THREE.Group();
    
    const leatherMat = new THREE.MeshStandardMaterial({
      color: 0x4a1810,
      roughness: 0.5,
      metalness: 0.1,
    });
    
    // Seat
    const seatGeo = new THREE.BoxGeometry(1.3, 0.35, 1.2);
    const seat = new THREE.Mesh(seatGeo, leatherMat);
    seat.position.y = 0.6;
    seat.castShadow = true;
    group.add(seat);
    
    // Backrest
    const backGeo = new THREE.BoxGeometry(1.3, 1.2, 0.25);
    const back = new THREE.Mesh(backGeo, leatherMat);
    back.position.set(0, 1.2, -0.55);
    back.castShadow = true;
    group.add(back);
    
    // Armrests
    for (const ax of [-0.65, 0.65]) {
      const armGeo = new THREE.BoxGeometry(0.25, 0.6, 1.2);
      const arm = new THREE.Mesh(armGeo, leatherMat);
      arm.position.set(ax, 0.75, 0);
      group.add(arm);
    }
    
    // Legs
    const legGeo = new THREE.CylinderGeometry(0.05, 0.04, 0.25, 6);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x3d2817, roughness: 0.6 });
    for (const [lx, lz] of [[-0.5, -0.4], [0.5, -0.4], [-0.5, 0.4], [0.5, 0.4]]) {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(lx, 0.125, lz);
      group.add(leg);
    }
    
    group.position.set(x, y, z);
    group.rotation.y = rotation;
    return group;
  }
  
  // Glass coffee table
  createGlassCoffeeTable(x, y, z) {
    const group = new THREE.Group();
    
    // Glass top
    const glassGeo = new THREE.BoxGeometry(2.0, 0.06, 1.2);
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0,
      roughness: 0.05,
      transmission: 0.9,
      transparent: true,
      opacity: 0.3,
    });
    const glass = new THREE.Mesh(glassGeo, glassMat);
    glass.position.y = 0.6;
    glass.castShadow = true;
    group.add(glass);
    
    // Metal frame
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x222222,
      metalness: 0.9,
      roughness: 0.2,
    });
    
    // Frame edges
    const edgeGeo = new THREE.BoxGeometry(2.02, 0.04, 0.04);
    const edge1 = new THREE.Mesh(edgeGeo, frameMat);
    edge1.position.set(0, 0.6, 0.58);
    group.add(edge1);
    const edge2 = edge1.clone();
    edge2.position.set(0, 0.6, -0.58);
    group.add(edge2);
    
    // Legs
    const legGeo = new THREE.CylinderGeometry(0.04, 0.03, 0.6, 8);
    for (const [lx, lz] of [[-0.9, -0.5], [0.9, -0.5], [-0.9, 0.5], [0.9, 0.5]]) {
      const leg = new THREE.Mesh(legGeo, frameMat);
      leg.position.set(lx, 0.3, lz);
      group.add(leg);
    }
    
    group.position.set(x, y, z);
    return group;
  }
  
  // Vault door — round secure door
  createVaultDoor(x, y, z, rotation = 0) {
    const group = new THREE.Group();
    
    const metalMat = new THREE.MeshStandardMaterial({
      color: 0x444444,
      metalness: 0.9,
      roughness: 0.3,
    });
    const darkMetalMat = new THREE.MeshStandardMaterial({
      color: 0x222222,
      metalness: 0.8,
      roughness: 0.4,
    });
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xc9a84c,
      metalness: 0.95,
      roughness: 0.15,
    });
    
    // Door frame
    const frameGeo = new THREE.CylinderGeometry(1.6, 1.6, 0.3, 32);
    const frame = new THREE.Mesh(frameGeo, darkMetalMat);
    frame.rotation.x = Math.PI / 2;
    frame.position.z = -0.15;
    frame.castShadow = true;
    group.add(frame);
    
    // Main door — circular
    const doorGeo = new THREE.CylinderGeometry(1.4, 1.4, 0.15, 32);
    const door = new THREE.Mesh(doorGeo, metalMat);
    door.rotation.x = Math.PI / 2;
    door.castShadow = true;
    group.add(door);
    
    // Concentric rings detail
    for (const radius of [1.0, 0.6, 0.3]) {
      const ringGeo = new THREE.TorusGeometry(radius, 0.04, 8, 32);
      const ring = new THREE.Mesh(ringGeo, darkMetalMat);
      ring.position.z = 0.08;
      group.add(ring);
    }
    
    // Central locking wheel
    const wheelHubGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.1, 16);
    const wheelHub = new THREE.Mesh(wheelHubGeo, goldMat);
    wheelHub.rotation.x = Math.PI / 2;
    wheelHub.position.z = 0.12;
    group.add(wheelHub);
    
    // Wheel spokes
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      const spokeGeo = new THREE.BoxGeometry(0.06, 0.5, 0.04);
      const spoke = new THREE.Mesh(spokeGeo, goldMat);
      spoke.position.set(Math.sin(angle) * 0.35, Math.cos(angle) * 0.35, 0.14);
      spoke.rotation.z = -angle;
      group.add(spoke);
    }
    
    // Bolts around edge
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const boltGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.08, 8);
      const bolt = new THREE.Mesh(boltGeo, goldMat);
      bolt.rotation.x = Math.PI / 2;
      bolt.position.set(Math.sin(angle) * 1.25, Math.cos(angle) * 1.25, 0.1);
      group.add(bolt);
    }
    
    group.position.set(x, y, z);
    group.rotation.y = rotation;
    return group;
  }
  
  // Weapon display wall — realistic rifles mounted
  createWeaponDisplayWall(x, y, z, rotation = 0) {
    const group = new THREE.Group();
    
    const woodMat = new THREE.MeshStandardMaterial({
      color: 0x4a3728,
      map: this.createWoodTexture('#4a3728'),
      roughness: 0.6,
    });
    const metalMat = new THREE.MeshStandardMaterial({
      color: 0x222222,
      metalness: 0.8,
      roughness: 0.3,
    });
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xc9a84c,
      metalness: 0.9,
      roughness: 0.2,
    });
    
    // Backing board
    const boardGeo = new THREE.BoxGeometry(0.1, 3, 4);
    const board = new THREE.Mesh(boardGeo, woodMat);
    board.castShadow = true;
    group.add(board);
    
    // Mounting brackets
    for (const my of [-1, 0, 1]) {
      const bracketGeo = new THREE.BoxGeometry(0.15, 0.08, 3.8);
      const bracket = new THREE.Mesh(bracketGeo, metalMat);
      bracket.position.set(0.08, my * 1.2, 0);
      group.add(bracket);
    }
    
    // Rifles mounted horizontally
    for (let i = 0; i < 3; i++) {
      const ry = 0.8 - i * 0.9;
      
      // Rifle stock
      const stockGeo = new THREE.BoxGeometry(0.12, 0.15, 1.2);
      const stock = new THREE.Mesh(stockGeo, woodMat);
      stock.position.set(0.15, ry, 0);
      group.add(stock);
      
      // Rifle barrel
      const barrelGeo = new THREE.CylinderGeometry(0.03, 0.03, 1.0, 8);
      const barrel = new THREE.Mesh(barrelGeo, metalMat);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0.15, ry + 0.05, 1.0);
      group.add(barrel);
      
      // Scope
      const scopeGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.4, 8);
      const scope = new THREE.Mesh(scopeGeo, metalMat);
      scope.rotation.x = Math.PI / 2;
      scope.position.set(0.18, ry + 0.12, 0.3);
      group.add(scope);
      
      // Gold accent on stock
      const accentGeo = new THREE.BoxGeometry(0.13, 0.05, 0.3);
      const accent = new THREE.Mesh(accentGeo, goldMat);
      accent.position.set(0.15, ry + 0.08, -0.3);
      group.add(accent);
    }
    
    group.position.set(x, y, z);
    group.rotation.y = rotation;
    return group;
  }
  
  // Bar counter with bottles
  createBarCounter(x, y, z, rotation = 0) {
    const group = new THREE.Group();
    
    const woodMat = new THREE.MeshStandardMaterial({
      color: 0x3d2817,
      map: this.createWoodTexture('#3d2817'),
      roughness: 0.4,
    });
    const marbleMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      roughness: 0.2,
      metalness: 0.1,
    });
    
    // Counter base
    const baseGeo = new THREE.BoxGeometry(3, 1.2, 1);
    const base = new THREE.Mesh(baseGeo, woodMat);
    base.position.y = 0.6;
    base.castShadow = true;
    group.add(base);
    
    // Marble countertop
    const topGeo = new THREE.BoxGeometry(3.2, 0.08, 1.2);
    const top = new THREE.Mesh(topGeo, marbleMat);
    top.position.y = 1.24;
    top.castShadow = true;
    group.add(top);
    
    // Back shelf
    const shelfGeo = new THREE.BoxGeometry(3, 0.08, 0.4);
    const shelf = new THREE.Mesh(shelfGeo, woodMat);
    shelf.position.set(0, 2, -0.3);
    group.add(shelf);
    
    // Bottle colors
    const bottleColors = [
      0x4a1810, // whiskey
      0x1a4a1a, // gin
      0x4a1a4a, // liqueur
      0x1a1a4a, // vodka
      0x8b4513, // rum
    ];
    
    // Bottles on shelf
    for (let i = 0; i < 8; i++) {
      const bx = -1.2 + i * 0.35;
      const color = bottleColors[i % bottleColors.length];
      const height = 0.3 + Math.random() * 0.15;
      
      // Bottle body
      const bottleGeo = new THREE.CylinderGeometry(0.06, 0.06, height, 8);
      const bottleMat = new THREE.MeshPhysicalMaterial({
        color: color,
        metalness: 0,
        roughness: 0.1,
        transmission: 0.6,
        transparent: true,
        opacity: 0.8,
      });
      const bottle = new THREE.Mesh(bottleGeo, bottleMat);
      bottle.position.set(bx, 2 + height / 2, -0.3);
      group.add(bottle);
      
      // Bottle neck
      const neckGeo = new THREE.CylinderGeometry(0.025, 0.04, 0.1, 8);
      const neck = new THREE.Mesh(neckGeo, bottleMat);
      neck.position.set(bx, 2 + height + 0.05, -0.3);
      group.add(neck);
      
      // Cap
      const capGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.04, 8);
      const capMat = new THREE.MeshStandardMaterial({ color: 0xc9a84c, metalness: 0.9, roughness: 0.2 });
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.set(bx, 2 + height + 0.12, -0.3);
      group.add(cap);
    }
    
    group.position.set(x, y, z);
    group.rotation.y = rotation;
    return group;
  }
  
  // Bar stool
  createBarStool(x, y, z, rotation = 0) {
    const group = new THREE.Group();
    
    const leatherMat = new THREE.MeshStandardMaterial({
      color: 0x4a1810,
      roughness: 0.5,
    });
    const metalMat = new THREE.MeshStandardMaterial({
      color: 0x444444,
      metalness: 0.8,
      roughness: 0.3,
    });
    
    // Seat
    const seatGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.08, 16);
    const seat = new THREE.Mesh(seatGeo, leatherMat);
    seat.position.y = 1.2;
    seat.castShadow = true;
    group.add(seat);
    
    // Central pillar
    const pillarGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.2, 8);
    const pillar = new THREE.Mesh(pillarGeo, metalMat);
    pillar.position.y = 0.6;
    group.add(pillar);
    
    // Footrest ring
    const ringGeo = new THREE.TorusGeometry(0.25, 0.025, 6, 16);
    const ring = new THREE.Mesh(ringGeo, metalMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.4;
    group.add(ring);
    
    // Base
    const baseGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.04, 16);
    const base = new THREE.Mesh(baseGeo, metalMat);
    base.position.y = 0.02;
    group.add(base);
    
    group.position.set(x, y, z);
    group.rotation.y = rotation;
    return group;
  }
  
  // Poker table — felt top with rail
  createPokerTable(x, y, z, rotation = 0) {
    const group = new THREE.Group();
    
    const woodMat = new THREE.MeshStandardMaterial({
      color: 0x3d2817,
      map: this.createWoodTexture('#3d2817'),
      roughness: 0.5,
    });
    const feltMat = new THREE.MeshStandardMaterial({
      color: 0x1a4a2a,
      roughness: 0.95,
    });
    const railMat = new THREE.MeshStandardMaterial({
      color: 0x2a1810,
      roughness: 0.6,
    });
    
    // Table base
    const baseGeo = new THREE.CylinderGeometry(0.4, 0.5, 1.0, 8);
    const base = new THREE.Mesh(baseGeo, woodMat);
    base.position.y = 0.5;
    base.castShadow = true;
    group.add(base);
    
    // Table top — octagonal
    const topGeo = new THREE.CylinderGeometry(1.8, 1.8, 0.1, 8);
    const top = new THREE.Mesh(topGeo, woodMat);
    top.position.y = 1.05;
    top.castShadow = true;
    group.add(top);
    
    // Felt surface
    const feltGeo = new THREE.CylinderGeometry(1.6, 1.6, 0.02, 8);
    const felt = new THREE.Mesh(feltGeo, feltMat);
    felt.position.y = 1.12;
    group.add(felt);
    
    // Padded rail
    const railGeo = new THREE.TorusGeometry(1.7, 0.12, 8, 8);
    const rail = new THREE.Mesh(railGeo, railMat);
    rail.rotation.x = Math.PI / 2;
    rail.position.y = 1.12;
    group.add(rail);
    
    // Cup holders
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + Math.PI / 8;
      const holderGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.04, 8);
      const holderMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.8 });
      const holder = new THREE.Mesh(holderGeo, holderMat);
      holder.position.set(Math.sin(angle) * 1.5, 1.14, Math.cos(angle) * 1.5);
      group.add(holder);
    }
    
    group.position.set(x, y, z);
    group.rotation.y = rotation;
    return group;
  }
  
  // Poker chair
  createPokerChair(x, y, z, rotation = 0) {
    const group = new THREE.Group();
    
    const leatherMat = new THREE.MeshStandardMaterial({
      color: 0x4a1810,
      roughness: 0.5,
    });
    const velvetMat = new THREE.MeshStandardMaterial({
      color: 0x2a1a4a,
      roughness: 0.8,
    });
    
    // Seat
    const seatGeo = new THREE.BoxGeometry(0.8, 0.15, 0.8);
    const seat = new THREE.Mesh(seatGeo, leatherMat);
    seat.position.y = 0.8;
    seat.castShadow = true;
    group.add(seat);
    
    // Backrest
    const backGeo = new THREE.BoxGeometry(0.8, 1.0, 0.12);
    const back = new THREE.Mesh(backGeo, velvetMat);
    back.position.set(0, 1.3, -0.38);
    back.castShadow = true;
    group.add(back);
    
    // Legs
    const legGeo = new THREE.CylinderGeometry(0.04, 0.03, 0.8, 6);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x3d2817, roughness: 0.6 });
    for (const [lx, lz] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(lx, 0.4, lz);
      group.add(leg);
    }
    
    group.position.set(x, y, z);
    group.rotation.y = rotation;
    return group;
  }
  
  // Stack of money
  createMoneyStack(x, y, z, rotation = 0) {
    const group = new THREE.Group();
    
    const bandMat = new THREE.MeshStandardMaterial({ color: 0x4a9a4a, roughness: 0.8 });
    
    // Multiple bill stacks
    for (let i = 0; i < 5; i++) {
      const stackGeo = new THREE.BoxGeometry(0.25, 0.04 + i * 0.01, 0.15);
      const stackMat = new THREE.MeshStandardMaterial({
        color: 0x85bb65,
        roughness: 0.7,
      });
      const stack = new THREE.Mesh(stackGeo, stackMat);
      stack.position.set((Math.random() - 0.5) * 0.1, i * 0.045, (Math.random() - 0.5) * 0.1);
      stack.rotation.y = Math.random() * 0.3;
      group.add(stack);
      
      // Money band
      const bandGeo = new THREE.BoxGeometry(0.05, 0.042 + i * 0.01, 0.16);
      const band = new THREE.Mesh(bandGeo, bandMat);
      band.position.copy(stack.position);
      band.rotation.copy(stack.rotation);
      group.add(band);
    }
    
    group.position.set(x, y, z);
    group.rotation.y = rotation;
    return group;
  }
  
  // Gold bars
  createGoldBars(x, y, z, rotation = 0) {
    const group = new THREE.Group();
    
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      metalness: 1.0,
      roughness: 0.15,
    });
    
    // Pyramid stack of gold bars
    const positions = [
      [0, 0, 0], [0.22, 0, 0], [0.11, 0, 0.18],
      [0.11, 0.08, 0.09],
    ];
    
    for (const [px, py, pz] of positions) {
      const barGeo = new THREE.BoxGeometry(0.2, 0.08, 0.4);
      const bar = new THREE.Mesh(barGeo, goldMat);
      bar.position.set(px, py + 0.04, pz);
      bar.castShadow = true;
      group.add(bar);
      
      // Stamp on bar
      const stampGeo = new THREE.BoxGeometry(0.12, 0.002, 0.2);
      const stampMat = new THREE.MeshStandardMaterial({ color: 0xb8860b });
      const stamp = new THREE.Mesh(stampGeo, stampMat);
      stamp.position.set(px, py + 0.082, pz);
      group.add(stamp);
    }
    
    group.position.set(x, y, z);
    group.rotation.y = rotation;
    return group;
  }
  
  // Chandelier — ornate ceiling light
  createChandelier(x, y, z) {
    const group = new THREE.Group();
    
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xc9a84c,
      metalness: 0.95,
      roughness: 0.15,
    });
    const crystalMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0,
      roughness: 0,
      transmission: 0.95,
      transparent: true,
      opacity: 0.3,
    });
    
    // Central rod
    const rodGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.8, 8);
    const rod = new THREE.Mesh(rodGeo, goldMat);
    rod.position.y = 0.4;
    group.add(rod);
    
    // Ceiling mount
    const mountGeo = new THREE.CylinderGeometry(0.2, 0.15, 0.1, 8);
    const mount = new THREE.Mesh(mountGeo, goldMat);
    mount.position.y = 0.85;
    group.add(mount);
    
    // Central hub
    const hubGeo = new THREE.SphereGeometry(0.25, 16, 16);
    const hub = new THREE.Mesh(hubGeo, goldMat);
    hub.position.y = 0.1;
    group.add(hub);
    
    // Arms extending outward
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      
      // Curved arm
      const armGeo = new THREE.TorusGeometry(0.4, 0.03, 6, 12, Math.PI / 3);
      const arm = new THREE.Mesh(armGeo, goldMat);
      arm.position.set(Math.sin(angle) * 0.2, 0.1, Math.cos(angle) * 0.2);
      arm.rotation.y = angle;
      arm.rotation.x = Math.PI / 2;
      group.add(arm);
      
      // Candle holder at end
      const holderGeo = new THREE.CylinderGeometry(0.04, 0.06, 0.15, 8);
      const holder = new THREE.Mesh(holderGeo, goldMat);
      holder.position.set(
        Math.sin(angle) * 0.6,
        -0.15,
        Math.cos(angle) * 0.6
      );
      group.add(holder);
      
      // Flame (glowing)
      const flameGeo = new THREE.SphereGeometry(0.04, 8, 8);
      const flameMat = new THREE.MeshBasicMaterial({
        color: 0xffaa44,
      });
      const flame = new THREE.Mesh(flameGeo, flameMat);
      flame.position.set(
        Math.sin(angle) * 0.6,
        -0.05,
        Math.cos(angle) * 0.6
      );
      group.add(flame);
      
      // Crystal pendant
      const crystalGeo = new THREE.ConeGeometry(0.06, 0.2, 6);
      const crystal = new THREE.Mesh(crystalGeo, crystalMat);
      crystal.position.set(
        Math.sin(angle) * 0.6,
        -0.35,
        Math.cos(angle) * 0.6
      );
      group.add(crystal);
    }
    
    // Bottom crystal cluster
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const crystalGeo = new THREE.ConeGeometry(0.04, 0.15, 5);
      const crystal = new THREE.Mesh(crystalGeo, crystalMat);
      crystal.position.set(
        Math.sin(angle) * 0.15,
        -0.15,
        Math.cos(angle) * 0.15
      );
      crystal.rotation.x = Math.PI;
      group.add(crystal);
    }
    
    group.position.set(x, y, z);
    return group;
  }
  
  // Wall sconce — elegant wall light
  createWallSconce(x, y, z, rotation = 0) {
    const group = new THREE.Group();
    
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xc9a84c,
      metalness: 0.95,
      roughness: 0.2,
    });
    
    // Wall mount
    const mountGeo = new THREE.BoxGeometry(0.15, 0.4, 0.1);
    const mount = new THREE.Mesh(mountGeo, goldMat);
    mount.position.z = -0.15;
    group.add(mount);
    
    // Arm
    const armGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.3, 8);
    const arm = new THREE.Mesh(armGeo, goldMat);
    arm.rotation.x = Math.PI / 2;
    arm.position.set(0, 0, 0);
    group.add(arm);
    
    // Candle holder
    const holderGeo = new THREE.CylinderGeometry(0.08, 0.1, 0.2, 8);
    const holder = new THREE.Mesh(holderGeo, goldMat);
    holder.position.set(0, -0.15, 0.15);
    group.add(holder);
    
    // Flame
    const flameGeo = new THREE.SphereGeometry(0.04, 8, 8);
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xffaa44 });
    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.set(0, -0.05, 0.15);
    group.add(flame);
    
    // Light glow
    const glowGeo = new THREE.SphereGeometry(0.15, 8, 8);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xffaa44,
      transparent: true,
      opacity: 0.2,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.set(0, -0.05, 0.15);
    group.add(glow);
    
    group.position.set(x, y, z);
    group.rotation.y = rotation;
    return group;
  }
  
  // Mafia poster — wall decoration
  createMafiaPoster(x, y, z, rotation = 0) {
    const group = new THREE.Group();
    
    // Poster canvas
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 384;
    const ctx = canvas.getContext('2d');
    
    // Dark background
    ctx.fillStyle = '#1a0a0a';
    ctx.fillRect(0, 0, 256, 384);
    
    // Gold border
    ctx.strokeStyle = '#c9a84c';
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, 236, 364);
    
    // Inner border
    ctx.strokeStyle = '#8b0000';
    ctx.lineWidth = 2;
    ctx.strokeRect(20, 20, 216, 344);
    
    // Skull silhouette (simplified)
    ctx.fillStyle = '#c9a84c';
    ctx.beginPath();
    ctx.arc(128, 120, 50, 0, Math.PI * 2);
    ctx.fill();
    
    // Crossed guns
    ctx.strokeStyle = '#8b0000';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(80, 200);
    ctx.lineTo(176, 280);
    ctx.moveTo(176, 200);
    ctx.lineTo(80, 280);
    ctx.stroke();
    
    // Text
    ctx.fillStyle = '#c9a84c';
    ctx.font = 'bold 24px serif';
    ctx.textAlign = 'center';
    ctx.fillText('OMERTÀ', 128, 320);
    ctx.font = 'italic 14px serif';
    ctx.fillText('Silence is Survival', 128, 350);
    
    const texture = new THREE.CanvasTexture(canvas);
    
    const posterGeo = new THREE.PlaneGeometry(1.2, 1.8);
    const posterMat = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.8,
    });
    const poster = new THREE.Mesh(posterGeo, posterMat);
    group.add(poster);
    
    // Frame
    const frameGeo = new THREE.BoxGeometry(1.25, 1.85, 0.05);
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x3d2817,
      roughness: 0.6,
    });
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.position.z = -0.03;
    group.add(frame);
    
    group.position.set(x, y, z);
    group.rotation.y = rotation;
    return group;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SHERIFF STATION INTERIOR REVAMP — Minecraft/Roblox aesthetic with Sildurs shaders
  //
  // Design goals:
  //   • Proper jail cell bars with rusted iron texture (not just blocks)
  //   • Detailed sheriff desk with computer, papers, coffee mug
  //   • Evidence board with photos and investigation string
  //   • Weapon rack with rifles
  //   • Filing cabinets with labels
  //   • Sheriff's leather chair
  //   • Wanted posters on walls
  //   • Sheriff badge decoration
  //   • Proper lighting with warm desk lamp
  // ═══════════════════════════════════════════════════════════════════════════
  setupSheriffOffice() {
    const cx = 36, cz = -36, y = 3;
    const props = [];

    // ── FLOOR OVERLAY — wood plank floor for office area ──
    const floorGeo = new THREE.PlaneGeometry(20, 16);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x8b6914,
      map: this.createWoodTexture('#8b6914'),
      roughness: 0.6,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.set(cx, y + 0.02, cz);
    floorMesh.receiveShadow = true;
    this.scene.add(floorMesh);
    props.push(floorMesh);

    // ── JAIL CELL BARS — proper iron bars with rust texture ──
    // Cell 1 (west side)
    props.push(this.createJailCellBars(cx - 8, y, cz + 4, 3.5, 2.8, 7, 0));
    // Cell 2 (east side)
    props.push(this.createJailCellBars(cx + 8, y, cz + 4, 3.5, 2.8, 7, 0));
    // Cell divider bars
    props.push(this.createJailCellBars(cx, y, cz + 4, 2, 2.8, 5, Math.PI / 2));

    // ── SHERIFF DESK — detailed executive desk with props ──
    props.push(this.createSheriffDesk(cx - 2, y, cz - 5, Math.PI / 2));

    // ── SHERIFF CHAIR — leather executive chair ──
    props.push(this.createSheriffChair(cx - 2, y, cz - 2.5, -Math.PI / 2));

    // ── VISITOR CHAIRS — simple wooden chairs ──
    props.push(this.createChair(cx - 2, y, cz - 8, Math.PI / 2));
    props.push(this.createChair(cx, y, cz - 7, Math.PI / 2));

    // ── EVIDENCE BOARD — cork board with photos and string ──
    props.push(this.createEvidenceBoard(cx - 8, y + 1.5, cz - 9.8, 0));

    // ── WEAPON RACK — proper rifle rack ──
    props.push(this.createWeaponRack(cx + 8, y, cz - 8, 0));

    // ── FILING CABINETS — detailed metal cabinets ──
    props.push(this.createSheriffFilingCabinet(cx + 9, y, cz - 5, 0));
    props.push(this.createSheriffFilingCabinet(cx + 9, y, cz - 3, 0));

    // ── WANTED BOARD — wall-mounted wanted posters ──
    props.push(this.createWantedBoard(cx, y + 1.5, cz - 9.8, 0));

    // ── SHERIFF BADGE — wall decoration ──
    props.push(this.createSheriffBadge(cx + 9.8, y + 2, cz - 9.8, -Math.PI / 2));

    // ── JAIL COT — simple bed in cell ──
    const cotMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.9 });
    const cotFrameMat = new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.6, roughness: 0.5 });
    
    // Cell 1 cot
    const cot1Group = new THREE.Group();
    const cot1Frame = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.15, 0.9), cotFrameMat);
    cot1Frame.position.y = 0.5;
    cot1Group.add(cot1Frame);
    const cot1Mattress = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.1, 0.8), cotMat);
    cot1Mattress.position.y = 0.65;
    cot1Group.add(cot1Mattress);
    cot1Group.position.set(cx - 8, y, cz + 6);
    this.scene.add(cot1Group);
    props.push(cot1Group);

    // Cell 2 cot
    const cot2Group = new THREE.Group();
    const cot2Frame = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.15, 0.9), cotFrameMat);
    cot2Frame.position.y = 0.5;
    cot2Group.add(cot2Frame);
    const cot2Mattress = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.1, 0.8), cotMat);
    cot2Mattress.position.y = 0.65;
    cot2Group.add(cot2Mattress);
    cot2Group.position.set(cx + 8, y, cz + 6);
    this.scene.add(cot2Group);
    props.push(cot2Group);

    // ── INTERROGATION TABLE — metal table in cell area ──
    const tableGroup = new THREE.Group();
    const tableTop = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.8), cotFrameMat);
    tableTop.position.y = 0.9;
    tableGroup.add(tableTop);
    // Table legs
    for (const [tx, tz] of [[-0.6, -0.3], [0.6, -0.3], [-0.6, 0.3], [0.6, 0.3]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 6), cotFrameMat);
      leg.position.set(tx, 0.45, tz);
      tableGroup.add(leg);
    }
    tableGroup.position.set(cx, y, cz + 6);
    this.scene.add(tableGroup);
    props.push(tableGroup);

    // ── LIGHTING ──
    // Sheriff station research: real police stations use warm incandescent
    // desk lamps combined with cooler overhead fluorescents. The cell block
    // gets a slightly colder, more institutional colour.

    // Desk lamp — the primary warm key light
    const deskLight = new THREE.PointLight(0xffcc66, 2.0, 11);
    deskLight.position.set(cx - 2, y + 1.5, cz - 5);
    this.scene.add(deskLight);
    props.push(deskLight);

    // Cell area — cooler institutional light, enough to see clearly
    const cellLight = new THREE.PointLight(0xc8ddf5, 1.6, 13);
    cellLight.position.set(cx, y + 3, cz + 5);
    this.scene.add(cellLight);
    props.push(cellLight);

    // Evidence board spotlight — warm amber, directional feel
    const evidenceLight = new THREE.SpotLight(0xffaa66, 1.4, 10, Math.PI / 4, 0.45);
    evidenceLight.position.set(cx - 6, y + 3, cz - 8);
    evidenceLight.target.position.set(cx - 8, y + 1.5, cz - 9.8);
    this.scene.add(evidenceLight);
    this.scene.add(evidenceLight.target);
    props.push(evidenceLight);

    // Overhead fill — muted warm-white, keeps room readable without blowing out
    const officeFill = new THREE.PointLight(0xfff0cc, 1.8, 17);
    officeFill.position.set(cx - 1, y + 5.8, cz - 3);
    this.scene.add(officeFill);
    props.push(officeFill);
    const frontDeskFill = new THREE.PointLight(0xfff5d6, 1.2, 11);
    frontDeskFill.position.set(cx - 4.5, y + 4.2, cz - 7.5);
    this.scene.add(frontDeskFill);
    props.push(frontDeskFill);

    props.forEach(p => { if (p && p.parent !== this.scene && p.isObject3D) this.scene.add(p); });
    this.props.set('sheriff', props);
    return props;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITY METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  clearRoom(roomName) {
    const props = this.props.get(roomName);
    if (props) {
      props.forEach(p => this.scene.remove(p));
      this.props.delete(roomName);
    }
  }

  clearAll() {
    for (const roomName of this.props.keys()) {
      this.clearRoom(roomName);
    }
  }

  dispose() {
    this.clearAll();
    // Dispose of any textures
  }
}

export default RoomInteriors;
