import * as THREE from 'three';
import { gsap } from 'gsap';
import { BLOCK_TYPES } from './VoxelWorld.js';
import { PropRenderer } from './PropRenderer.js';
import { RoomInteriors } from './RoomInteriors.js';
import { LanternSystem } from './LanternSystem.js';
import { WindowGlowSystem } from './WindowGlowSystem.js';

// ─────────────────────────────────────────────────────────────────────────────
//  Village builder — clean Minecraft-style world
//  All buildings sit on a flat y=3 grass floor.
//  Coordinate system: X east, Z south, Y up.
//  Amphitheater centred at (0,0), buildings radiate outward.
// ─────────────────────────────────────────────────────────────────────────────
export class Village {
  constructor(scene, voxelWorld) {
    this.scene = scene;
    this.vw    = voxelWorld;
    this.props = new PropRenderer(scene);  // 3D prop renderer (cylinders/spheres)
    this.tableSeats        = [];
    this.gravestones       = [];
    this.graveyardBase     = { x: 36, z: 36 };
    this.graveyardNextSlot = 0;
    this._sunLight         = null;
    this._ambLight         = null;
    this._buildingZones    = []; // for tree collision detection
    
    // Room interiors with themed props
    this.roomInteriors = new RoomInteriors(scene);
    // Lantern flicker system — populated in _addLights()
    this.lanterns = null;
    // Lamp-post ground lights — no shadows, toggled by day/night
    this._lampPostLights = [];
    this._glowDiscs = [];
    // Dynamic room lights that should only contribute at night.
    this._interiorPointLights = [];
    this._lanternState = { alpha: 0, isNight: false };
    this._lanternTween = null;
    this.windowGlow = null;
  }

  _yield() { return new Promise(r => setTimeout(r, 0)); }
  _s(x, y, z, t) { this.vw.setVoxel(Math.floor(x), Math.floor(y), Math.floor(z), t); }

  async build(onProgress) {
    const tick = p => onProgress?.(p);
    this._buildGround();              tick(0.07); await this._yield();
    this._buildAmphitheater();        tick(0.15); await this._yield();
    this._buildPaths();               tick(0.22); await this._yield();
    this._buildHouses();              tick(0.30); await this._yield();
    this._buildWall();                tick(0.42); await this._yield();
    this._buildWell();
    this._buildLampPosts();           tick(0.48); await this._yield();
    this._buildVillageDetails();       tick(0.52); await this._yield();
    this._buildGraveyard();           tick(0.54); await this._yield();
    this._buildMarket();              tick(0.60); await this._yield();
    this._buildHospital();            tick(0.72); await this._yield();
    this._buildSheriffStation();      tick(0.84); await this._yield();
    this._buildMafiaRoom();           tick(0.94); await this._yield();
    this._buildTerrainBumps();        // Noise-based elevation after buildings registered
    this._scatterEnvironmentProps();  // Rocks, grass tufts, path-edge gravel
    this._fixLobbyArtifacts();        // exact lobby cleanup only
    this._fixAmphitheaterSouthFace(); // restore south wall + clear rogue cobble
    this._buildTrees();               tick(0.97); await this._yield();
    this._addLights();
    this.vw.buildMesh();              tick(1.00);
    this.props.build(); // render all 3D props
    this._applyLanternNightAlpha(0);
    
    // Setup themed room interiors (props, furniture, lighting)
    this._setupRoomInteriors();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ROOM INTERIORS — Themed props and furniture for each role room
  // ═══════════════════════════════════════════════════════════════════════════
  _setupRoomInteriors() {
    // Hospital room with beds, monitors, IV stands
    this.roomInteriors.setupHospitalRoom();
    
    // Mafia bunker with safe, crates, gun rack
    this.roomInteriors.setupBunkerRoom();
    
    // Sheriff office with desk, chair, computer, filing cabinet
    this.roomInteriors.setupSheriffOffice();
  }

  // ── helpers ──────────────────────────────────────────────────────────────
  // Fill a rectangular box (inclusive) with block type t
  _box(x1, y1, z1, x2, y2, z2, t) {
    for (let x = x1; x <= x2; x++)
      for (let y = y1; y <= y2; y++)
        for (let z = z1; z <= z2; z++)
          this._s(x, y, z, t);
  }
  // Hollow box — fill walls only, no interior
  _walls(x1, y1, z1, x2, y2, z2, t) {
    for (let x = x1; x <= x2; x++)
      for (let y = y1; y <= y2; y++)
        for (let z = z1; z <= z2; z++) {
          if (x===x1||x===x2||y===y1||y===y2||z===z1||z===z2)
            this._s(x, y, z, t);
        }
  }
  // Flat roof slab
  _roof(x1, z1, x2, z2, y, t) { this._box(x1, y, z1, x2, y, z2, t); }
  // Door — 2 high air gap in a wall face
  _door(x, z, y0, t = BLOCK_TYPES.AIR) {
    this._s(x, y0,   z, t); this._s(x, y0+1, z, t); this._s(x, y0+2, z, t);
  }
  // Window — single air block in a wall face
  _win(x, y, z) { this._s(x, y, z, BLOCK_TYPES.GLASS); }

  _fixLobbyArtifacts() {
    const B = BLOCK_TYPES;

    for (const bucket of this.props._props || []) {
      if (bucket.type !== 'rock' && bucket.type !== 'grass_tuft') continue;
      bucket.positions = bucket.positions.filter(([px, , pz]) =>
        !(
          ((px >= 46 && px <= 54) || (px >= -54 && px <= -46)) &&
          pz >= -2 && pz <= 8
        )
      );
    }

    for (const side of [-1, 1]) {
      for (let x = 46; x <= 54; x++) {
        for (let z = -2; z <= 8; z++) {
          this._s(side * x, 1, z, B.DIRT);
          this._s(side * x, 2, z, B.DIRT);
          this._s(side * x, 3, z, B.GRASS);
        }
      }
    }

    for (const side of [-1, 1]) {
      for (const [x, z, top] of [
        [24, 3, false],
        [24, 4, true],
        [23, 5, true],
        [23, 6, true],
        [22, 7, true],
        [21, 8, true],
        [20, 9, true],
        [19, 10, false],
        [18, 11, false],
      ]) {
        this._s(side * x, 3, z, B.STONE);
        if (top) this._s(side * x, 4, z, B.STONE);
      }
    }
  }

  // ── AMPHITHEATER SOUTH-FACE REPAIR ────────────────────────────────────────
  // Runs last (after _buildMafiaRoom and _scatterEnvironmentProps) to undo two
  // problems introduced by the mafia-bunker build passes:
  //
  //  A) FILL HOLES loop (fz=24-36, |fx|≤8) stomps y=3→GRASS and y=4-8→AIR
  //     over the entire strip — wiping the tier-3 stone blocks (y=3,4,5) on
  //     the south arc of the amphitheater at z=24-25.
  //
  //  B) _buildGround() fills r<28 with cobble/stone, but the FILL HOLES zone
  //     only covers |x|≤8.  At d=25-28, x>8 on the south side those cobble
  //     blocks are never replaced — leaving a scattering of rogue blocks where
  //     the terrain should be pure grass.
  //
  //  C) _scatterEnvironmentProps adds rocks/grass-tufts inside the south
  //     arc corridor that should be clear.
  _fixAmphitheaterSouthFace() {
    const B = BLOCK_TYPES;

    // ── Part A : Re-stamp the correct tier geometry for the south arc ─────
    // Mirror of _buildAmphitheater() but restricted to the rows that the
    // FILL HOLES pass damages (z = 24-26, |x| ≤ 8).
    for (let x = -8; x <= 8; x++) {
      for (let z = 24; z <= 26; z++) {
        const d = Math.sqrt(x * x + z * z);
        if (d <= 18) {
          // Arena floor — flat cobble (only relevant at z=24 near x=0)
          this._s(x, 3, z, B.COBBLE);
        } else if (d <= 20) {
          // Tier 1 — 1 block high
          this._s(x, 3, z, B.STONE);
          this._s(x, 4, z, B.AIR); // ensure nothing floating
        } else if (d <= 22) {
          // Tier 2 — 2 blocks high
          this._s(x, 3, z, B.STONE);
          this._s(x, 4, z, B.STONE);
          this._s(x, 5, z, B.AIR);
        } else if (d <= 25) {
          // Tier 3 — 3 blocks high (the rows that got wiped)
          this._s(x, 3, z, B.STONE);
          this._s(x, 4, z, B.STONE);
          this._s(x, 5, z, B.STONE);
        }
        // d > 25: outside amphitheater — leave as is (will be cleaned in B)
      }
    }

    // ── Part B : Unconditionally stamp grass on south-east/west shoulder ────
    // _buildGround sets cobble/stone for r<28. _buildAmphitheater only covers
    // d<=25. The band d=25-32 on the south side (z>0) holds leftover blocks
    // from ground-gen that were never overwritten. Stamp grass unconditionally
    // (no getVoxel type-check) so nothing is silently skipped.
    //
    // Exemptions:
    //   d<=25  - inside amphitheater (handled by Part A above)
    //   d>=32  - far outside, untouched
    //   SE diagonal gravel path to graveyard (x~=z, x>=4)
    //   Registered building footprints (_isSafeForTree)
    for (let x = -24; x <= 24; x++) {
      for (let z = 19; z <= 31; z++) {
        const d = Math.sqrt(x * x + z * z);
        if (d <= 25 || d >= 32) continue;
        if (x >= 4 && z >= 4 && Math.abs(x - z) <= 1) continue; // SE gravel path
        if (!this._isSafeForTree(x, z, 1)) continue;             // building zones
        this._s(x, 3, z, B.GRASS);
        this._s(x, 4, z, B.AIR);
        this._s(x, 5, z, B.AIR);
        this._s(x, 6, z, B.AIR);
      }
    }

    // ── Part C : Strip scatter props (rocks / grass tufts) from south arc ─
    // _scatterEnvironmentProps runs before this method.  Filter any props
    // that landed inside the r<32 south corridor (z>0 side only).
    for (const bucket of this.props._props || []) {
      if (bucket.type !== 'rock' && bucket.type !== 'grass_tuft') continue;
      bucket.positions = bucket.positions.filter(([px, , pz]) => {
        if (pz <= 0) return true;                      // north half — keep
        const d = Math.sqrt(px * px + pz * pz);
        return d >= 32 || d <= 18;                     // outside or inside arena
      });
    }
  }

  // ── GROUND ────────────────────────────────────────────────────────────────
  // ENHANCED: More surface variety with decorative patterns and visual interest
  _buildGround() {
    const B = BLOCK_TYPES;
    for (let x = -66; x <= 66; x++) {
      for (let z = -66; z <= 66; z++) {
        const r2 = x*x + z*z;
        if (r2 > 66*66) continue;
        const r  = Math.sqrt(r2);

        // Sub-surface
        this._s(x, 2, z, B.DIRT);
        this._s(x, 1, z, B.DIRT);

        // Surface variety based on zone
        if (r < 28) {
          // Inner plaza — clean cobble with occasional stone accents and pattern
          const isAccent = (x + z) % 12 === 0 || (x - z) % 12 === 0;
          const isPattern = (Math.abs(x) + Math.abs(z)) % 8 === 0;
          if (isPattern && !isAccent) {
            this._s(x, 3, z, B.STONE_BRICK);
          } else {
            this._s(x, 3, z, isAccent ? B.STONE : B.COBBLE);
          }
        } else if (r > 60) {
          // Outer ring near wall — gravel with mossy patches and stone mix
          const isMossy = Math.sin(x * 0.3) * Math.cos(z * 0.3) > 0.6;
          const isStone = (x + z) % 7 === 0;
          if (isStone) {
            this._s(x, 3, z, B.COBBLE);
          } else {
            this._s(x, 3, z, isMossy ? B.MOSSY : B.GRAVEL);
          }
        } else {
          // Main village — grass with varied texture and flower patch accents
          const isFlowerPatch = (x % 15 === 0 && z % 15 === 0) && (Math.abs(x) > 30 || Math.abs(z) > 30);
          const isGrassVar = (x * 3 + z * 7) % 11 === 0;
          if (isFlowerPatch) {
            this._s(x, 3, z, B.GRASS);
            // Flower patch will be added by scatter props
          } else if (isGrassVar) {
            // Slight grass variation using different block
            this._s(x, 3, z, B.GRASS);
          } else {
            this._s(x, 3, z, B.GRASS);
          }
        }
      }
    }
    // Add decorative cobble circles in grassy areas
    this._addDecorativeCircles();
    // Add pathway decorations
    this._addPathwayDecorations();
  }

  // ENHANCED: Decorative cobble circles for visual interest
  _addDecorativeCircles() {
    const B = BLOCK_TYPES;
    const circles = [
      {x: -50, z: 0, r: 4}, {x: 50, z: 0, r: 4},
      {x: 0, z: -50, r: 4}, {x: 0, z: 50, r: 4},
      {x: -35, z: 35, r: 3}, {x: 35, z: 35, r: 3},
      {x: -35, z: -35, r: 3}, {x: 35, z: -35, r: 3},
    ];
    for (const c of circles) {
      for (let dx = -c.r; dx <= c.r; dx++) {
        for (let dz = -c.r; dz <= c.r; dz++) {
          if (dx*dx + dz*dz <= c.r*c.r + 1) {
            const dist = Math.sqrt(dx*dx + dz*dz);
            const block = dist < c.r - 1 ? B.COBBLE : B.STONE; // inner cobble, outer stone ring
            this._s(c.x + dx, 3, c.z + dz, block);
          }
        }
      }
    }
  }

  // ENHANCED: Pathway decorations for visual variety
  _addPathwayDecorations() {
    const B = BLOCK_TYPES;
    // Add stepping stones along main paths
    const steppingStones = [
      // N-S path stones
      {x: 4, z: -45}, {x: -4, z: -35}, {x: 4, z: -25}, {x: -4, z: -15},
      {x: 4, z: 15}, {x: -4, z: 25}, {x: 4, z: 35}, {x: -4, z: 45},
      // E-W path stones
      {x: -45, z: 4}, {x: -35, z: -4}, {x: -25, z: 4}, {x: -15, z: -4},
      {x: 15, z: 4}, {x: 25, z: -4}, {x: 35, z: 4}, {x: 45, z: -4},
    ];
    for (const s of steppingStones) {
      this._s(s.x, 3, s.z, B.STONE);
    }
    
    // Add small flower beds near path intersections
    const flowerBeds = [
      {x: 8, z: 8, w: 2, h: 2},
      {x: -8, z: 8, w: 2, h: 2},
      {x: 8, z: -8, w: 2, h: 2},
      {x: -8, z: -8, w: 2, h: 2},
    ];
    for (const bed of flowerBeds) {
      for (let dx = 0; dx < bed.w; dx++) {
        for (let dz = 0; dz < bed.h; dz++) {
          this._s(bed.x + dx, 3, bed.z + dz, B.GRASS);
        }
      }
    }
  }

  // ── AMPHITHEATER ──────────────────────────────────────────────────────────
  // Circular cobblestone floor r=20, stone tiered seating r=20–26
  _buildAmphitheater() {
    const B = BLOCK_TYPES;
    const y = 3;

    // ── Clean circular tiers — floor flat so characters can walk/spawn freely
    for (let x = -26; x <= 26; x++) {
      for (let z = -26; z <= 26; z++) {
        const d = Math.sqrt(x*x + z*z);
        if (d <= 18)      { this._s(x, y, z, B.COBBLE); }         // main arena floor — flat
        else if (d <= 20) { this._s(x, y, z, B.STONE); }          // tier 1 ground row
        else if (d <= 22) { this._s(x, y, z, B.STONE);            // tier 2 — one step up
                             this._s(x, y+1, z, B.STONE); }
        else if (d <= 25) { this._s(x, y, z, B.STONE);            // tier 3 — two steps up
                             this._s(x, y+1, z, B.STONE);
                             this._s(x, y+2, z, B.STONE); }
      }
    }

    // ── 8 lamp props around arena edge (r=19) via PropRenderer ────────────
    for (let i = 0; i < 8; i++) {
      const a = (i/8)*Math.PI*2;
      const lx = Math.round(19*Math.cos(a)), lz = Math.round(19*Math.sin(a));
      this.props.add('lamp', lx, y, lz);
    }

    // ── Single central gold block as focal speaking point ─────────────────
    this._s(0, y+1, 0, B.GOLD_BLOCK);
  }

  // ── PATHS ─────────────────────────────────────────────────────────────────
  _buildPaths() {
    const B = BLOCK_TYPES; const y = 3;
    // N-S and E-W cross roads (3 blocks wide, planks)
    // Extend main roads to fill the larger map (radius 58)
    for (let n = -67; n <= 67; n++) {
      this._s(-1, y, n, B.PLANKS); this._s(0, y, n, B.PLANKS); this._s(1, y, n, B.PLANKS);
      this._s(n, y, -1, B.PLANKS); this._s(n, y, 0, B.PLANKS); this._s(n, y, 1, B.PLANKS);
    }
    // Gravel path NW diagonal to Hospital (cx=-38, cz=-38)
    for (let i = 0; i <= 30; i++) {
      const gx = -20-i, gz = -8-i;
      this._s(gx,   y, gz,   B.GRAVEL);
      this._s(gx-1, y, gz,   B.GRAVEL);
      this._s(gx,   y, gz-1, B.GRAVEL);
    }
    // Horizontal connector to hospital east door
    for (let x = -47; x <= -25; x++) { this._s(x, y, -35, B.GRAVEL); this._s(x, y, -36, B.GRAVEL); }

    // Gravel path NE diagonal to Sheriff (cx=38, cz=-38)
    for (let i = 0; i <= 30; i++) {
      const gx = 20+i, gz = -8-i;
      this._s(gx,   y, gz,   B.GRAVEL);
      this._s(gx+1, y, gz,   B.GRAVEL);
      this._s(gx,   y, gz-1, B.GRAVEL);
    }
    // Horizontal connector to sheriff west door
    for (let x = 25; x <= 47; x++) { this._s(x, y, -35, B.GRAVEL); this._s(x, y, -36, B.GRAVEL); }

    // Cobble path S to Mafia bunker hatch (z=30-32)
    for (let z = 18; z <= 34; z++) {
      this._s(-1, y, z, B.COBBLE); this._s(0, y, z, B.COBBLE); this._s(1, y, z, B.COBBLE);
    }

    // Gravel path SE to Graveyard (40, 40)
    for (let i = 0; i <= 36; i++) {
      const gx = 4+i, gz = 4+i;
      this._s(gx, y, gz, B.GRAVEL); this._s(gx+1, y, gz, B.GRAVEL);
    }
  }

  // ── VILLAGER HOUSES ───────────────────────────────────────────────────────
  // Minecraft-style cottages — proper 9×9 footprint with full interior
  // Each house: foundation, planks+dark-wood walls, terracotta roof, real door frame,
  // glass windows, and interior: bed + table + bookshelf + chest + lantern
  _buildHouses() {
    const B = BLOCK_TYPES;
    const defs = [
      {x:-34,z:16},{x:34,z:16},{x:-34,z:-8},{x:34,z:-8},
      {x:-20,z:44},{x:20,z:44},{x:-44,z:10},{x:44,z:10},
    ];

    for (const {x:hx, z:hz, i:hi=0} of defs.map((d,i)=>({...d,i}))) {
      this._registerBuildingZone(hx, hz, 6); // register footprint (radius 6)
      const y = 3;

      // ── FOUNDATION (cobble base border, planks interior floor) ──────────
      this._box(hx-4, y-1, hz-4, hx+4, y-1, hz+4, B.DIRT);
      this._box(hx-4, y,   hz-4, hx+4, y,   hz+4, B.COBBLE);
      this._box(hx-3, y,   hz-3, hx+3, y,   hz+3, B.PLANKS); // interior floor

      // ── OUTER WALLS — 5 high, planks + dark wood alternating ─────────────
      for (let dy=1; dy<=5; dy++) {
        const mat = dy===2||dy===4 ? B.WOOD_DARK : B.PLANKS;
        for (let dx=-4; dx<=4; dx++)
          for (let dz=-4; dz<=4; dz++)
            if (Math.abs(dx)===4 || Math.abs(dz)===4)
              this._s(hx+dx, y+dy, hz+dz, mat);
      }

      // ── OAK LOG CORNER POSTS (full height, structural look) ──────────────
      for (const [cx,cz] of [[-4,-4],[4,-4],[-4,4],[4,4]])
        for (let dy=1; dy<=5; dy++) this._s(hx+cx, y+dy, hz+cz, B.OAK_LOG);

      // ── GABLED TERRACOTTA ROOF ────────────────────────────────────────────
      for (let p=0; p<=4; p++) {
        for (let dz=-4; dz<=4; dz++) {
          this._s(hx-4+p, y+6+p, hz+dz, B.TERRACOTTA);
          this._s(hx+4-p, y+6+p, hz+dz, B.TERRACOTTA);
          if (hx-4+p <= hx) { // fill in the gable
            for (let fx=hx-4+p; fx<=hx+4-p; fx++)
              this._s(fx, y+6+p, hz+dz, B.TERRACOTTA);
          }
        }
        if (hx-4+p >= hx) break;
      }
      // Ridge cap
      for (let dz=-4; dz<=4; dz++) this._s(hx, y+10, hz+dz, B.OAK_LOG);

      // ── DOOR FRAME — south face (dark wood frame + air gap) ──────────────
      // Door frame pillars
      for (let dy=1; dy<=4; dy++) {
        this._s(hx-1, y+dy, hz+4, B.WOOD_DARK);
        this._s(hx+1, y+dy, hz+4, B.WOOD_DARK);
      }
      // Lintel above door
      this._s(hx, y+4, hz+4, B.WOOD_DARK);
      this._s(hx-1, y+4, hz+4, B.OAK_LOG);
      this._s(hx+1, y+4, hz+4, B.OAK_LOG);
      // Door gap (3 high)
      this._s(hx, y+1, hz+4, B.AIR);
      this._s(hx, y+2, hz+4, B.AIR);
      this._s(hx, y+3, hz+4, B.AIR);
      // Door step (cobble)
      this._s(hx, y, hz+5, B.COBBLE);
      this._s(hx-1, y, hz+5, B.COBBLE);
      this._s(hx+1, y, hz+5, B.COBBLE);

      // ── WINDOWS — glass with dark wood frame ──────────────────────────────
      // South face (flanking door)
      for (const dx of [-3, 3]) {
        this._s(hx+dx, y+2, hz+4, B.GLASS);
        this._s(hx+dx, y+3, hz+4, B.GLASS);
        this._s(hx+dx, y+1, hz+4, B.WOOD_DARK); // sill
        this._s(hx+dx, y+4, hz+4, B.WOOD_DARK); // lintel
      }
      // North face
      for (const dx of [-2, 0, 2]) {
        this._s(hx+dx, y+2, hz-4, B.GLASS);
        this._s(hx+dx, y+3, hz-4, B.GLASS);
      }
      // Side windows (east + west)
      for (const dz of [-2, 2]) {
        this._s(hx-4, y+2, hz+dz, B.GLASS);
        this._s(hx+4, y+2, hz+dz, B.GLASS);
      }

      // ── CHIMNEY (brick, NE corner, tall) ────────────────────────────────
      for (let dy=6; dy<=13; dy++) this._s(hx+3, y+dy, hz-3, B.BRICK);
      this._s(hx+3, y+14, hz-3, B.LANTERN); // chimney glow

      // ── FRONT PORCH (cobble step + oak posts + plank overhang) ───────────
      for (let dx=-2; dx<=2; dx++) {
        this._s(hx+dx, y, hz+5, B.COBBLE);  // porch floor
        this._s(hx+dx, y+1, hz+5, B.AIR);
      }
      this._s(hx-2, y+1, hz+5, B.OAK_LOG); // porch posts
      this._s(hx+2, y+1, hz+5, B.OAK_LOG);
      this._s(hx-2, y+2, hz+5, B.OAK_LOG);
      this._s(hx+2, y+2, hz+5, B.OAK_LOG);
      for (let dx=-2; dx<=2; dx++) this._s(hx+dx, y+3, hz+5, B.PLANKS); // overhang
      // Porch lanterns
      this._s(hx-2, y+3, hz+5, B.LANTERN);
      this._s(hx+2, y+3, hz+5, B.LANTERN);

      // ── FENCE YARD (4 fence posts + planks) ──────────────────────────────
      for (let dx=-6; dx<=6; dx++) {
        this._s(hx+dx, y+1, hz+7, B.FENCE);
      }
      this._s(hx-6, y+1, hz+6, B.FENCE); this._s(hx-6, y+1, hz+5, B.FENCE);
      this._s(hx+6, y+1, hz+6, B.FENCE); this._s(hx+6, y+1, hz+5, B.FENCE);
      // Gate gap
      this._s(hx-1, y+1, hz+7, B.AIR);
      this._s(hx,   y+1, hz+7, B.AIR);
      this._s(hx+1, y+1, hz+7, B.AIR);
      // Fence corner posts (OAK_LOG)
      this._s(hx-6, y+1, hz+7, B.OAK_LOG);
      this._s(hx+6, y+1, hz+7, B.OAK_LOG);
      // Yard is clean — barrel and porch lanterns are enough decoration
      // Barrel beside door
      this.props.add('barrel', hx+3, y, hz+4);

      // ── INTERIOR FURNITURE ────────────────────────────────────────────────
      // BED (NW corner) — wood frame, wool mattress, red pillow
      this._s(hx-3, y+1, hz-2, B.WOOD);
      this._s(hx-3, y+1, hz-1, B.WOOD);
      this._s(hx-3, y+2, hz-2, B.WOOL);
      this._s(hx-3, y+2, hz-1, B.WOOL);
      this._s(hx-3, y+3, hz-2, B.RED_WOOL); // pillow
      this._s(hx-3, y+3, hz-1, B.WHITE);    // blanket

      // TABLE (centre) — dark wood top, stone legs
      this._s(hx,   y+1, hz-1, B.STONE_BRICK);
      this._s(hx+1, y+1, hz-1, B.STONE_BRICK);
      this._s(hx,   y+2, hz-1, B.WOOD_DARK);
      this._s(hx+1, y+2, hz-1, B.WOOD_DARK);
      // Chair beside table (stone brick)
      this._s(hx+2, y+1, hz-1, B.STONE_BRICK);
      this._s(hx+2, y+2, hz-1, B.PLANKS);

      // BOOKSHELF (east wall)
      this._s(hx+3, y+1, hz-3, B.BOOKSHELF);
      this._s(hx+3, y+2, hz-3, B.BOOKSHELF);
      this._s(hx+3, y+3, hz-3, B.BOOKSHELF);

      // BARREL (SW corner) — 3D prop
      this.props.add('barrel', hx-3, y, hz+2);

      // FIREPLACE (north wall — opposite door)
      this._s(hx, y+1, hz-3, B.STONE_BRICK);
      this._s(hx, y+2, hz-3, B.STONE_BRICK);
      this._s(hx, y+3, hz-3, B.COBBLE);
      this._s(hx, y+4, hz-3, B.COBBLE);
      // Fire glow
      this._s(hx, y+2, hz-3, B.RED_LAMP);
      // Mantel lantern
      this._s(hx, y+5, hz-3, B.LANTERN);
      // Fireplace opening (above)
      this._s(hx-1, y+1, hz-3, B.BRICK);
      this._s(hx+1, y+1, hz-3, B.BRICK);

      // CEILING LAMP (centre)
      this._s(hx, y+5, hz, B.LANTERN);


    }
  }

  // ── TREES — proper round-canopy trees via PropRenderer ───────────────────
  // Register a building footprint so trees won't spawn inside it
  _registerBuildingZone(cx, cz, radius) {
    this._buildingZones.push({ x: cx, z: cz, radius });
  }

  // Returns true if (x,z) is far enough from all registered buildings
  _isSafeForTree(x, z, minClear = 9) {
    for (const zone of this._buildingZones) {
      const dx = x - zone.x, dz = z - zone.z;
      if (Math.sqrt(dx*dx + dz*dz) < zone.radius + minClear) return false;
    }
    return true;
  }

  _buildTrees() {
    const y = 3;
    const candidates = [
      [-52,6],[52,6],[6,-52],[-6,-52],[6,52],[-6,52],
      [-48,-8],[-44,-18],[-38,-12],[-50,22],[-50,-22],
      [-38,28],[-24,46],[-44,40],
      [48,-8],[44,-18],[38,-12],[50,22],[50,-22],
      [38,28],[24,46],[44,40],
      [-20,-44],[20,-44],[-18,-50],[18,-50],
    ];
    for (const [tx, tz] of candidates) {
      if (this._isSafeForTree(tx, tz)) {
        this.props.add('tree', tx, y, tz);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TERRAIN NOISE — slight 1-2 block elevations in outer grass zone
  // Called AFTER all buildings register their zones so we can safely avoid them.
  // Uses the VoxelWorld's simplex noise2D instance for coherent hills.
  // ═══════════════════════════════════════════════════════════════════════════
  _buildTerrainBumps() {
    const B = BLOCK_TYPES;
    const y = 3;

    for (let x = -64; x <= 64; x++) {
      for (let z = -64; z <= 64; z++) {
        const r = Math.sqrt(x * x + z * z);

        // Only the outer "village green" zone — inside r<34 is plaza/amphitheater,
        // outside r>60 is gravel/wall ring (already textured differently).
        if (r < 34 || r > 60) continue;

        // Keep main road corridors flat so paths read clearly
        if (Math.abs(x) <= 4 || Math.abs(z) <= 4) continue;

        // Respect all building footprints (houses, hospital, sheriff, mafia, etc.)
        if (!this._isSafeForTree(x, z, 10)) continue;

        // Only raise tiles that are currently plain grass
        if (this.vw.getVoxel(x, y, z) !== B.GRASS) continue;

        // Offset by large constants so this noise field differs from the tree-safe check
        const n = this.vw.noise2D(x * 0.085 + 77.3, z * 0.085 + 133.7);

        if (n > 0.28) {
          // 1-block hill: change y=3 to DIRT (side visible), add GRASS cap at y=4
          this._s(x, y,   z, B.DIRT);
          this._s(x, y+1, z, B.GRASS);
        }
        if (n > 0.62) {
          // 2-block hill: rare steeper bump
          this._s(x, y+2, z, B.GRASS);
          this._s(x, y+1, z, B.DIRT);
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ENVIRONMENT SCATTER — procedural rocks, grass tufts, path-edge gravel
  // Uses a fast deterministic hash (no Math.random) for reproducibility.
  // Props are spaced at 3-block grid intervals then jittered by hash.
  // ═══════════════════════════════════════════════════════════════════════════
  _scatterEnvironmentProps() {
    const B = BLOCK_TYPES;
    const y = 3;

    // Tiny deterministic hash: returns 0.0–1.0 for any (x,z,salt)
    const hash = (x, z, s) => {
      let h = (((x * 374761393) ^ (z * 668265263)) + s * 2654435761) | 0;
      h ^= h >>> 15; h = Math.imul(h, 0x85ebca77);
      h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae3d);
      return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
    };

    // Sample on a sparse 3-block grid
    for (let gx = -62; gx <= 62; gx += 3) {
      for (let gz = -62; gz <= 62; gz += 3) {
        // Sub-cell jitter so it doesn't look like a regular grid
        const jx = Math.round((hash(gx, gz, 7)  - 0.5) * 2);
        const jz = Math.round((hash(gx, gz, 13) - 0.5) * 2);
        const x = gx + jx, z = gz + jz;

        const r = Math.sqrt(x * x + z * z);

        // Only outer grass ring
        if (r < 30 || r > 62) continue;
        // Clear of main roads
        if (Math.abs(x) <= 5 || Math.abs(z) <= 5) continue;
        // Clear of buildings
        if (!this._isSafeForTree(x, z, 7)) continue;

        // Determine the surface y at this column (may be 3 or 4 after terrain bumps)
        const surfY = this.vw.getVoxel(x, y+1, z) === B.GRASS ? y + 1
                    : this.vw.getVoxel(x, y,   z) === B.GRASS ? y
                    : -1;
        if (surfY < 0) continue; // not a grass tile

        const rv = hash(x, z, 42);
        if      (rv < 0.14) this.props.add('rock',       x, surfY, z);
        else if (rv < 0.30) this.props.add('grass_tuft', x, surfY, z);
        // ~70% of grid cells stay empty — sparseness is key for readability
      }
    }

    // ── Path-edge gravel blending ──────────────────────────────────────────
    // Scatter individual GRAVEL blocks on grass tiles immediately adjacent to
    // the main plank roads. Gives a "worn shoulder" look without hard edges.
    for (let n = -65; n <= 65; n++) {
      // N-S road shoulders (x=±2)
      for (const sx of [-2, 2]) {
        if (this.vw.getVoxel(sx, y, n) === B.GRASS && hash(sx, n, 99) < 0.45)
          this._s(sx, y, n, B.GRAVEL);
      }
      // E-W road shoulders (z=±2)
      for (const sz of [-2, 2]) {
        if (this.vw.getVoxel(n, y, sz) === B.GRASS && hash(n, sz, 99) < 0.45)
          this._s(n, y, sz, B.GRAVEL);
      }
    }
  }

  // ── PERIMETER WALL ────────────────────────────────────────────────────────
  // FIXED: Uses a bounding-box ring-fill instead of per-degree Math.round().
  // The old approach (360 degree steps → Math.round) skipped integer coordinates
  // whenever two adjacent angles rounded to the same block, leaving visible gaps.
  // The new approach checks every integer in the bounding square and fills any
  // position within the ring band [R-0.55, R+0.55], giving a gapless circle.
  _buildWall() {
    const B = BLOCK_TYPES; const R = 68;
    const ringSet = new Set();

    // Pass 1: collect all integer positions that lie on the ring
    for (let wx = -R - 1; wx <= R + 1; wx++) {
      for (let wz = -R - 1; wz <= R + 1; wz++) {
        const dist = Math.sqrt(wx * wx + wz * wz);
        if (dist >= R - 0.55 && dist <= R + 0.55) {
          ringSet.add(`${wx},${wz}`);
        }
      }
    }

    // Pass 2: place wall blocks + crenellations
    // Pre-compute the 8 accent angles (every 45°) as unit vectors for distance check
    const accentDirs = Array.from({length: 8}, (_, i) => {
      const a = i * Math.PI / 4;
      return [Math.cos(a), Math.sin(a)];
    });

    for (const key of ringSet) {
      const [wx, wz] = key.split(',').map(Number);
      this._s(wx, 1, wz, B.MOSSY);

      // Accent columns: any ring block within 1.5 units of an 8-way axis
      const isAccent = accentDirs.some(([ax, az]) => {
        const dot = wx * ax + wz * az;
        const px  = dot * ax, pz = dot * az;      // projection onto axis
        const ex  = wx - px,  ez = wz - pz;       // perpendicular component
        return dot > 0 && Math.sqrt(ex*ex + ez*ez) < 1.5;
      });

      for (let y = 2; y <= 7; y++) {
        this._s(wx, y, wz, isAccent && y > 3 ? B.STONE_BRICK : B.COBBLE);
      }

      // Crenellations — use angle of block to decide merlon/gap pattern
      const angle = Math.atan2(wz, wx);                    // -π … π
      const degNorm = ((angle * 180 / Math.PI) + 360) % 360; // 0 … 360
      const slot = Math.round(degNorm) % 18;
      if (slot === 0) {
        this._s(wx, 8, wz, B.COBBLE);
        this._s(wx, 9, wz, B.LANTERN);
      } else if (slot === 9) {
        this._s(wx, 8, wz, B.STONE_BRICK);
      }
    }
    // 4 gate towers (N/S/E/W) - enhanced with more detail
    for (const [gx,gz] of [[0,-68],[0,68],[-68,0],[68,0]]) {
      // Tower base - larger and more imposing
      this._box(gx-3, 1, gz-3, gx+3, 1, gz+3, B.MOSSY); // foundation
      this._box(gx-3, 2, gz-3, gx+3, 10, gz+3, B.COBBLE); // main tower
      // Corner accents
      for (const [cx,cz] of [[gx-3,gz-3],[gx+3,gz-3],[gx-3,gz+3],[gx+3,gz+3]]) {
        for (let y = 2; y <= 11; y++) this._s(cx, y, cz, B.STONE_BRICK);
      }
      // Tower top with battlements
      for (let dx = -3; dx <= 3; dx++) {
        for (let dz = -3; dz <= 3; dz++) {
          if (Math.abs(dx) === 3 || Math.abs(dz) === 3) {
            this._s(gx+dx, 11, gz+dz, B.STONE_BRICK);
            if ((dx + dz) % 2 === 0) this._s(gx+dx, 12, gz+dz, B.COBBLE);
          }
        }
      }
      // Central tower beacon
      this._s(gx, 12, gz, B.LANTERN);
      this._s(gx, 13, gz, B.GOLD_BLOCK); // beacon top
      // Gate opening - arched
      for (let dy = 1; dy <= 6; dy++) {
        const width = dy <= 4 ? 2 : 1; // arch narrows at top
        for (let dx = -width; dx <= width; dx++) {
          this._s(gx+dx, dy, gz, B.AIR);
        }
      }
      // Gate frame - dark wood
      for (let dy = 1; dy <= 6; dy++) {
        this._s(gx-2, dy, gz, B.WOOD_DARK);
        this._s(gx+2, dy, gz, B.WOOD_DARK);
      }
      // Gate lintel
      for (let dx = -2; dx <= 2; dx++) this._s(gx+dx, 7, gz, B.WOOD_DARK);
    }
    // Corner towers at diagonal positions for visual interest
    for (const [gx,gz] of [[-48,-48],[48,-48],[-48,48],[48,48]]) {
      const dist = Math.round(Math.sqrt(gx*gx + gz*gz));
      if (dist > 60) continue; // only if within wall radius
      this._box(gx-1, 1, gz-1, gx+1, 1, gz+1, B.MOSSY);
      this._box(gx-1, 2, gz-1, gx+1, 8, gz+1, B.COBBLE);
      this._s(gx, 9, gz, B.LANTERN);
    }
  }

  // ── WELL ─────────────────────────────────────────────────────────────────
  _buildWell() {
    const B = BLOCK_TYPES; const y = 3;
    const wx = -14, wz = -30;

    // ── Well basin — 3×3 stone brick ring ─────────────────────────────────
    for (const [dx,dz] of [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]]) {
      this._s(wx+dx, y+1, wz+dz, B.STONE_BRICK);
      this._s(wx+dx, y+2, wz+dz, B.STONE_BRICK);
    }
    // Water inside (gravel = water surface)
    this._s(wx, y+1, wz, B.GRAVEL);
    // Cobble trim around base
    for (const [dx,dz] of [[-2,-2],[-1,-2],[0,-2],[1,-2],[2,-2],
                             [-2,-1],[-2,0],[-2,1],[-2,2],
                             [2,-1],[2,0],[2,1],[2,2],
                             [-1,2],[0,2],[1,2]])
      this._s(wx+dx, y, wz+dz, B.COBBLE);

    // ── Support posts (oak log pillars either side) ────────────────────────
    for (let dy=3; dy<=5; dy++) {
      this._s(wx-1, y+dy, wz, B.OAK_LOG);
      this._s(wx+1, y+dy, wz, B.OAK_LOG);
    }
    // ── Crossbeam and rope ────────────────────────────────────────────────
    this._s(wx, y+6, wz, B.OAK_LOG);    // top beam
    this._s(wx-1, y+6, wz, B.OAK_LOG);  // extends over posts
    this._s(wx+1, y+6, wz, B.OAK_LOG);
    // Fence post "rope" hanging down
    this._s(wx, y+5, wz, B.FENCE);
    this._s(wx, y+4, wz, B.FENCE);
    // Bucket at bottom of rope (lantern = glowing bucket)
    this._s(wx, y+3, wz, B.LANTERN);

    // ── Flower pots / barrels around well ────────────────────────────────
    for (const [fx,fz] of [[wx-3,wz],[wx+3,wz],[wx,wz-3],[wx,wz+3]]) {
      this.props.add('barrel', fx, y+1-1, fz);
    }
    // Flowers around well as real 3D props (alternating colors)
    for (const [fx,fz,t] of [[wx-2,wz-2,'flower'],[wx+2,wz-2,'flower_yellow'],
                              [wx-2,wz+2,'flower_purple'],[wx+2,wz+2,'flower']])
      this.props.add(t, fx, y, fz);
  }

  // ── LAMP POSTS ───────────────────────────────────────────────────────────
  _buildLampPosts() {
    const B = BLOCK_TYPES; const y = 3;
    const posts = [
      // Amphitheater corners
      [-8,-8],[8,-8],[-8,8],[8,8],
      // N-S road extended to ±64
      [3,-64],[-3,-64],[3,-52],[-3,-52],[3,-40],[-3,-40],[3,-28],[-3,-28],[3,-18],[-3,-18],
      [3,18],[-3,18],[3,28],[-3,28],[3,40],[-3,40],[3,52],[-3,52],[3,64],[-3,64],
      // E-W road extended to ±64
      [-64,3],[-64,-3],[-52,3],[-52,-3],[-40,3],[-40,-3],[-28,3],[-28,-3],[-18,3],[-18,-3],
      [18,3],[18,-3],[28,3],[28,-3],[40,3],[40,-3],[52,3],[52,-3],[64,3],[64,-3],
      // NW path to Hospital (cx=-36,cz=-36)
      [-24,-14],[-30,-20],[-36,-26],[-40,-30],[-44,-34],
      // NE path to Sheriff (cx=36,cz=-36)
      [24,-14],[30,-20],[36,-26],[40,-30],[44,-34],
      // S path to Mafia
      [3,24],[-3,24],[3,36],[-3,36],
      // Bunker hatch pocket accents
      [-6,30],[6,30],
      // SE path to Graveyard
      [14,14],[24,24],[32,32],
      // SW path to Market
      [-16,16],[-26,26],[-32,32],
    ];
    for (const [lx,lz] of posts) {
      // Iron post (3 segments)
      this._s(lx, y+1, lz, B.IRON);
      this._s(lx, y+2, lz, B.IRON);
      this._s(lx, y+3, lz, B.IRON);
      // Glass lantern cage top
      this._s(lx, y+4, lz, B.GLASS);
      // Glowing lantern core inside cage
      this._s(lx, y+4, lz, B.LANTERN);
      // Iron cap
      this._s(lx, y+5, lz, B.IRON);

      // No extra manual baked light here: the lantern voxel itself is auto-baked
      // in VoxelWorld so each post gets a single Minecraft-style local light pool.
    }
  }

  // ── VILLAGE DETAIL — benches, flower beds, barrels, hay, fences ───────────
  _buildVillageDetails() {
    const B = BLOCK_TYPES; const y = 3;

    // Road-side benches — proper 3D bench props
    for (const [bx,bz] of [
      [4,-20],[-4,-20],[4,-30],[-4,-30],[4,20],[-4,20],[4,30],[-4,30],
      [20,4],[20,-4],[30,4],[30,-4],[-20,4],[-20,-4],[-30,4],[-30,-4],
    ]) this.props.add('bench', bx, y, bz);

    // No road flowers — they just look like red cubes scattered randomly

    // Barrel beside each house — proper 3D prop
    for (const [hx,hz] of [[34,16],[34,-8],[20,44],[44,10],
                             [-34,16],[-34,-8],[-20,44],[-44,10]])
      this.props.add('barrel', hx+5, y, hz+5);
    // Hay bale near market path
    this.props.add('hay',    -30, y, 30);
    this.props.add('barrel',  32, y, 28);

    // Short fence lines between houses (yard dividers)
    for (let i=0; i<5; i++) {
      this._s(27+i, y+1, 12, B.FENCE); this._s(-27-i, y+1, 12, B.FENCE);
      this._s(27+i, y+1, -2, B.FENCE); this._s(-27-i, y+1, -2, B.FENCE);
    }

    // Notice boards removed — too cube-like

    // Removed random scatter blocks

    // barrels + hay handled above as props

    // ── STONE PATHS from each house door to the main road ─────────────────
    // These fill the empty bare grass areas seen in the screenshot
    // House positions: (±34,16), (±34,-8), (±20,44), (±44,10)
    // Each house door faces south (hz+5) so path goes from door toward road

    // NE house (34,16) → east road (road at x≈1, z=16 → x=34)
    for (let px=2; px<=33; px++) this._s(px, y, 16, B.GRAVEL);
    for (let px=2; px<=33; px++) this._s(px, y, 17, B.GRAVEL);
    // NW house (-34,16) → west road
    for (let px=-33; px<=-2; px++) this._s(px, y, 16, B.GRAVEL);
    for (let px=-33; px<=-2; px++) this._s(px, y, 17, B.GRAVEL);
    // NE house (34,-8) → east road
    for (let px=2; px<=33; px++) this._s(px, y, -8, B.GRAVEL);
    for (let px=2; px<=33; px++) this._s(px, y, -7, B.GRAVEL);
    // NW house (-34,-8) → west road
    for (let px=-33; px<=-2; px++) this._s(px, y, -8, B.GRAVEL);
    for (let px=-33; px<=-2; px++) this._s(px, y, -7, B.GRAVEL);
    // SE house (20,44) → south road (x=0,z=1 to z=44)
    for (let pz=2; pz<=43; pz++) this._s(20, y, pz, B.GRAVEL);
    for (let pz=2; pz<=43; pz++) this._s(21, y, pz, B.GRAVEL);
    // SW house (-20,44) → south road
    for (let pz=2; pz<=43; pz++) this._s(-20, y, pz, B.GRAVEL);
    for (let pz=2; pz<=43; pz++) this._s(-21, y, pz, B.GRAVEL);
    // Far east house (44,10) → road
    for (let px=2; px<=43; px++) this._s(px, y, 10, B.GRAVEL);
    for (let px=2; px<=43; px++) this._s(px, y, 11, B.GRAVEL);
    // Far west house (-44,10) → road
    for (let px=-43; px<=-2; px++) this._s(px, y, 10, B.GRAVEL);
    for (let px=-43; px<=-2; px++) this._s(px, y, 11, B.GRAVEL);

    // ── COBBLE PLAZAS in front of each house (5×5 in front of door) ───────
    for (const [hx,hz] of [[34,16],[34,-8],[20,44],[44,10],
                             [-34,16],[-34,-8],[-20,44],[-44,10]]) {
      for (let dx=-2; dx<=2; dx++)
        for (let dz=0; dz<=3; dz++)
          this._s(hx+dx, y, hz+5+dz, B.COBBLE);
      // Flower pots at plaza corners
      this.props.add('flower', hx-2, y+1-1, hz+8);
      this.props.add('flower', hx+2, y+1-1, hz+8);
    }

    // Courtyard fill removed — ground texture provides the fill
  }

  // ── GRAVEYARD ─────────────────────────────────────────────────────────────
  _buildGraveyard() {
    const {x:gx, z:gz} = this.graveyardBase; const B = BLOCK_TYPES; const y = 3;

    // Graveyard sized for up to 14 graves (max 15-player game).
    // Ground: 26×22 interior, fence at ±13 (X) and ±11 (Z)
    for (let fx = gx-13; fx <= gx+13; fx++)
      for (let fz = gz-11; fz <= gz+11; fz++)
        this._s(fx, y, fz, B.DIRT);
    // Mossy patches
    for (const [mx,mz] of [
      [gx-9,gz-8],[gx+9,gz-8],[gx-9,gz+8],[gx+9,gz+8],
      [gx-5,gz-4],[gx+5,gz+4],[gx,gz-7],[gx,gz+7],
      [gx-11,gz],[gx+11,gz],[gx,gz],[gx-3,gz+2],[gx+3,gz-2]
    ]) this._s(mx, y, mz, B.MOSSY);

    // ── IRON BAR PERIMETER FENCE ─────────────────────────────────────────
    for (let fx = gx-13; fx <= gx+13; fx++) {
      this._s(fx, y+1, gz-11, B.IRON_BAR); this._s(fx, y+2, gz-11, B.IRON_BAR);
      this._s(fx, y+1, gz+11, B.IRON_BAR); this._s(fx, y+2, gz+11, B.IRON_BAR);
    }
    for (let fz = gz-11; fz <= gz+11; fz++) {
      this._s(gx-13, y+1, fz, B.IRON_BAR); this._s(gx-13, y+2, fz, B.IRON_BAR);
      this._s(gx+13, y+1, fz, B.IRON_BAR); this._s(gx+13, y+2, fz, B.IRON_BAR);
    }
    // Corner pillars
    for (const [cx,cz] of [[gx-13,gz-11],[gx+13,gz-11],[gx-13,gz+11],[gx+13,gz+11]]) {
      for (let dy=1; dy<=3; dy++) this._s(cx, y+dy, cz, B.COBBLE);
      this._s(cx, y+4, cz, B.STONE_BRICK);
    }
    // Mid-fence pillars
    for (const [cx,cz] of [[gx,gz-11],[gx,gz+11],[gx-13,gz],[gx+13,gz]]) {
      for (let dy=1; dy<=3; dy++) this._s(cx, y+dy, cz, B.COBBLE);
    }

    // ── GATE — south entrance ─────────────────────────────────────────────
    for (let dy=1; dy<=4; dy++) {
      this._s(gx-3, y+dy, gz-11, B.OAK_LOG);
      this._s(gx+3, y+dy, gz-11, B.OAK_LOG);
    }
    this._s(gx-3, y+5, gz-11, B.STONE_BRICK);
    this._s(gx+3, y+5, gz-11, B.STONE_BRICK);
    for (let dx=-2; dx<=2; dx++) this._s(gx+dx, y+4, gz-11, B.STONE_BRICK);
    for (const dx of [-2,-1,0,1,2]) {
      this._s(gx+dx, y+1, gz-11, B.AIR);
      this._s(gx+dx, y+2, gz-11, B.AIR);
      this._s(gx+dx, y+3, gz-11, B.AIR);
    }
    this._s(gx-3, y+5, gz-10, B.SOUL_LANTERN);
    this._s(gx+3, y+5, gz-10, B.SOUL_LANTERN);
    for (let fz = gz-11; fz <= gz-5; fz++) this._s(gx, y, fz, B.COBBLE);

    // ── SOUL LANTERN POSTS ───────────────────────────────────────────────
    for (const [lx,lz] of [
      [gx-10,gz-8],[gx+10,gz-8],[gx-10,gz+8],[gx+10,gz+8],
      [gx-10,gz],[gx+10,gz],[gx,gz-8],[gx,gz+8]
    ]) this.props.add('soul_lamp', lx, y, lz);

    // ── DEAD TREES ───────────────────────────────────────────────────────
    for (const [tx,tz] of [[gx-11,gz-9],[gx+11,gz-9],[gx-11,gz+9]]) {
      for (let dy=1; dy<=5; dy++) this._s(tx, y+dy, tz, B.OAK_LOG);
      this._s(tx-1, y+4, tz, B.OAK_LOG);
      this._s(tx+1, y+3, tz, B.OAK_LOG);
      this._s(tx, y+5, tz-1, B.OAK_LOG);
    }

    // ── MEMORIAL OBELISK (north focal point) ─────────────────────────────
    for (let dy=1; dy<=7; dy++) this._s(gx, y+dy, gz+9, B.STONE_BRICK);
    this._s(gx, y+8, gz+9, B.COBBLE);
    this._s(gx-1, y+3, gz+9, B.IRON_BAR); this._s(gx+1, y+3, gz+9, B.IRON_BAR);
    this._s(gx-1, y+5, gz+9, B.IRON_BAR); this._s(gx+1, y+5, gz+9, B.IRON_BAR);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DYNAMIC GRAVESTONE with player identity — SEMI-CIRCLE LAYOUT with ANIMATION
  // Called mid-game when a player is eliminated (mafia kill, sheriff kill, vote out)
  // Uses semi-circle layout: graves arranged in an arc facing the amphitheater
  // ═══════════════════════════════════════════════════════════════════════════
  // ═══════════════════════════════════════════════════════════════════════════
  // DYNAMIC GRAVESTONE — GRID LAYOUT scaled for up to 14 graves (15-player game)
  // Grid: 4 columns × 4 rows, left-to-right then front-to-back (south→north)
  // Each slot is 5.5 units apart horizontally, 5 units apart vertically (Z)
  // Graves face south (+Z) so nameplate faces the amphitheater camera
  // Returns { gravePos, camPos, lookPos } for a perfect cinematic front-view
  // ═══════════════════════════════════════════════════════════════════════════
  addGravestone(name, player) {
    const { x: gx, z: gz } = this.graveyardBase;
    const y = 3;
    const B = BLOCK_TYPES;

    // Grid config — 4 cols × 4 rows = 16 slots (more than enough for any game)
    const COLS      = 4;
    const SPACING_X = 5.5;   // horizontal gap between graves
    const SPACING_Z = 5.0;   // depth gap between rows
    const GRID_W    = (COLS - 1) * SPACING_X; // total width of a row

    const slot = this.graveyardNextSlot++;
    const col  = slot % COLS;
    const row  = Math.floor(slot / COLS);

    // Centre the grid inside the graveyard (gz-9 to gz+9, interior clear zone)
    // Row 0 starts at gz-2 (south side, closest to gate), rows go north
    const sx = gx - GRID_W / 2 + col * SPACING_X;
    const sz = gz - 2 + row * SPACING_Z;   // south→north as deaths accumulate

    const roleColors = {
      mafia: '#ef4444', doctor: '#60a5fa',
      sheriff: '#fcd34d', villager: '#a3e635',
    };
    const roleColor = roleColors[player?.role?.toLowerCase()] || '#a3e635';
    const logoColor = player?.logoColor || roleColor;
    const initial   = player?.initial || (name[0] || '?').toUpperCase();

    // ── Animated group: drops from above ────────────────────────────────
    const graveGroup = new THREE.Group();
    graveGroup.position.set(sx, y + 18, sz); // start high
    graveGroup.rotation.y = 0;               // face south (+Z)
    this.scene.add(graveGroup);

    // Helper — add voxel block to group
    const colors = {
      [B.COBBLE]: 0x8a8a8a, [B.STONE]: 0x9e9e9e,
      [B.STONE_BRICK]: 0x7a7a7a, [B.IRON_BAR]: 0x4a4a4a,
      [B.SOUL_LANTERN]: 0x4ecdc4,
    };
    const addBlock = (dx, dy, dz, type) => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshLambertMaterial({ color: colors[type] || 0x888888 })
      );
      mesh.position.set(dx, dy, dz);
      graveGroup.add(mesh);
    };

    // Gravestone shape (local coords, origin = ground centre)
    addBlock(-1, 0.5, 0, B.COBBLE);   // plinth L
    addBlock( 0, 0.5, 0, B.COBBLE);   // plinth C
    addBlock( 1, 0.5, 0, B.COBBLE);   // plinth R
    addBlock( 0, 1.5, 0, B.STONE);    // body
    addBlock( 0, 2.5, 0, B.STONE_BRICK);  // chest
    addBlock(-1, 2.5, 0, B.IRON_BAR); addBlock(1, 2.5, 0, B.IRON_BAR); // cross arms
    addBlock(-1, 3.5, 0, B.STONE_BRICK); // shoulder L
    addBlock( 0, 3.5, 0, B.STONE_BRICK); // shoulder C
    addBlock( 1, 3.5, 0, B.STONE_BRICK); // shoulder R
    addBlock( 0, 4.5, 0, B.COBBLE);   // cap
    addBlock( 0, 0.5, -0.8, B.SOUL_LANTERN); // candle front

    // ── Player face circle embedded on stone front — shows actual AI logo ──
    const faceCanvas = document.createElement('canvas');
    faceCanvas.width = 128; faceCanvas.height = 128;
    const fCtx = faceCanvas.getContext('2d');

    // Helper: draw circular clip with background + optional image
    const _drawGraveCircle = (img) => {
      fCtx.clearRect(0, 0, 128, 128);
      // Dark stone backing
      fCtx.fillStyle = '#2a2a2a';
      fCtx.beginPath(); fCtx.arc(64, 64, 60, 0, Math.PI * 2); fCtx.fill();
      // Brand-coloured circle
      fCtx.beginPath(); fCtx.arc(64, 64, 52, 0, Math.PI * 2);
      fCtx.fillStyle = logoColor; fCtx.fill();
      fCtx.strokeStyle = '#111'; fCtx.lineWidth = 5; fCtx.stroke();
      if (img) {
        // Clip to circle then draw actual logo PNG
        fCtx.save();
        fCtx.beginPath(); fCtx.arc(64, 64, 50, 0, Math.PI * 2); fCtx.clip();
        fCtx.drawImage(img, 14, 14, 100, 100);
        fCtx.restore();
      } else {
        // Fallback: label text inside circle
        const label = player?.logoLabel || initial;
        fCtx.font = `bold ${label.length > 3 ? 28 : 36}px Arial,sans-serif`;
        fCtx.fillStyle = '#fff';
        fCtx.textAlign = 'center'; fCtx.textBaseline = 'middle';
        fCtx.fillText(label.slice(0, 4), 64, 62);
      }
      // Role-coloured ring
      fCtx.beginPath(); fCtx.arc(64, 64, 58, 0, Math.PI * 2);
      fCtx.strokeStyle = roleColor; fCtx.lineWidth = 4; fCtx.stroke();
    };

    // Draw fallback immediately so stone is never blank
    _drawGraveCircle(null);

    const faceTex = new THREE.CanvasTexture(faceCanvas);
    faceTex.magFilter = THREE.NearestFilter;
    const facePlane = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 1.2),
      new THREE.MeshBasicMaterial({ map: faceTex, transparent: true, side: THREE.DoubleSide })
    );
    facePlane.position.set(0, 3.0, 0.52); // front face of stone
    graveGroup.add(facePlane);

    // Async: load actual AI brand logo from LobeHub CDN and swap onto texture
    const logoKey = player?.logoKey || 'human';
    const CDN_DARK  = 'https://raw.githubusercontent.com/lobehub/lobe-icons/refs/heads/master/packages/static-png/dark/';
    const CDN_LIGHT = 'https://raw.githubusercontent.com/lobehub/lobe-icons/refs/heads/master/packages/static-png/light/';
    const slugMap = {
      chatgpt:'openai', openai_o:'openai', claude:'anthropic',
      gemini:'gemini-color', gemini2:'gemini-color', grok:'grok',
      deepseek:'deepseek-color', kimi:'kimi-color',
      glm:'zhipu-color',        // LobeHub primary; falls back to chatglm-color
      minimax:'minimax-color',
      mistral:'mistral-color', llama:'meta-color',
      qwen:'qwen-color', nvidia:'nvidia-color',
    };
    const glmSlugFallback = { glm: 'chatglm-color' };
    const useLight = ['gemini','gemini2','deepseek','kimi','glm','minimax','mistral','llama','qwen','nvidia'].includes(logoKey);
    const slug = slugMap[logoKey];
    if (slug) {
      const base = useLight ? CDN_LIGHT : CDN_DARK;
      const tryLoad = (url, fallbackUrl) => {
        const img = new Image(); img.crossOrigin = 'anonymous';
        img.onload = () => { _drawGraveCircle(img); faceTex.needsUpdate = true; };
        img.onerror = () => {
          if (fallbackUrl) { tryLoad(fallbackUrl, null); }
          // else keep the text fallback already drawn
        };
        img.src = url;
      };
      const primary   = base + slug + '.png';
      // For GLM: try chatglm-color as second fallback, then opposite light/dark
      const secondary = glmSlugFallback[logoKey]
        ? base + glmSlugFallback[logoKey] + '.png'
        : (useLight ? CDN_DARK : CDN_LIGHT) + slug + '.png';
      tryLoad(primary, secondary);
    }

    // ── Name + role floating banner above stone ──────────────────────────
    const nameCanvas = document.createElement('canvas');
    nameCanvas.width = 512; nameCanvas.height = 96;
    const nCtx = nameCanvas.getContext('2d');
    // Dark background
    nCtx.fillStyle = 'rgba(8,8,20,0.88)';
    nCtx.fillRect(0, 0, 512, 96);
    nCtx.strokeStyle = roleColor; nCtx.lineWidth = 3;
    nCtx.strokeRect(2, 2, 508, 92);
    // Name
    nCtx.font = 'bold 38px "Cinzel",serif';
    nCtx.fillStyle = '#f0e6c8';
    nCtx.textAlign = 'center'; nCtx.textBaseline = 'alphabetic';
    nCtx.fillText(name.slice(0, 18), 256, 56);
    // Role
    nCtx.font = 'bold 18px "Courier New",monospace';
    nCtx.fillStyle = roleColor;
    nCtx.fillText((player?.role || 'villager').toUpperCase(), 256, 82);
    const nameTex = new THREE.CanvasTexture(nameCanvas);
    nameTex.magFilter = THREE.NearestFilter;
    const namePlane = new THREE.Mesh(
      new THREE.PlaneGeometry(3.0, 0.56),
      new THREE.MeshBasicMaterial({ map: nameTex, transparent: true, side: THREE.DoubleSide })
    );
    namePlane.position.set(0, 5.6, 0.3); // floats above cap
    graveGroup.add(namePlane);

    // ── GSAP drop animation ──────────────────────────────────────────────
    if (typeof gsap !== 'undefined') {
      gsap.to(graveGroup.position, {
        y: y, duration: 0.75, ease: 'bounce.out', delay: 0.1,
      });
    } else {
      graveGroup.position.y = y;
    }

    // ── Camera target data ───────────────────────────────────────────────
    // Face plane is at local z=+0.52, group.rotation.y=0 → face points world +Z.
    // Camera must be on the +Z side (sz + offset) looking back toward -Z to see face.
    const gravePos  = new THREE.Vector3(sx, y + 3, sz);
    const camPos    = new THREE.Vector3(sx, y + 9, sz + 9);   // north of grave (+Z side), elevated
    const lookPos   = new THREE.Vector3(sx, y + 4, sz + 0.5); // at the nameplate face

    const graveInfo = {
      name, role: player?.role || 'villager',
      logoColor, x: sx, y, z: sz, slot, col, row,
      position: gravePos,
      camPos, lookPos,
      group: graveGroup,
    };
    this.gravestones.push(graveInfo);
    return graveInfo; // return full info so camera can use camPos/lookPos
  }

  // Helper to darken a hex color
  _darkenColor(hex, factor) {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.floor((num >> 16) * factor);
    const g = Math.floor(((num >> 8) & 0x00FF) * factor);
    const b = Math.floor((num & 0x0000FF) * factor);
    return `rgb(${r},${g},${b})`;
  }

  // ── MARKET SQUARE ─────────────────────────────────────────────────────────
  // Central fountain + 4 market stalls with coloured awnings
  _buildMarket() {
    const B = BLOCK_TYPES; const y = 3;
    const mx = -34, mz = 34;

    // ── STONE PLAZA FLOOR with sandstone trim ─────────────────────────────
    this._box(mx-11, y, mz-11, mx+11, y, mz+11, B.STONE);
    // Sandstone border
    for (let dx=-11; dx<=11; dx++) {
      this._s(mx+dx, y, mz-11, B.SANDSTONE); this._s(mx+dx, y, mz+11, B.SANDSTONE);
    }
    for (let dz=-11; dz<=11; dz++) {
      this._s(mx-11, y, mz+dz, B.SANDSTONE); this._s(mx+11, y, mz+dz, B.SANDSTONE);
    }
    // Cross-pattern inlay (planks = decorative crossing)
    for (let dx=-9; dx<=9; dx++) { this._s(mx+dx, y, mz, B.PLANKS); }
    for (let dz=-9; dz<=9; dz++) { this._s(mx, y, mz+dz, B.PLANKS); }

    // ── FOUNTAIN — 3D prop (torus basin + cylinder pillar + water disc) ─────
    this.props.add('fountain', mx, y, mz);
    // Flowers around fountain base


    // ── 4 MARKET STALLS — each with distinct goods + awning colour ────────
    const stallDefs = [
      { sx:mx-7, sz:mz-7, awn:B.RED_WOOL,    goods:[B.HAY,B.BARREL,B.HAY],    label:'Produce'  },
      { sx:mx+7, sz:mz-7, awn:B.BLUE_WOOL,   goods:[B.IRON,B.GOLD_BLOCK,B.IRON], label:'Blacksmith'},
      { sx:mx-7, sz:mz+7, awn:B.YELLOW_WOOL, goods:[B.WOOL,B.WOOL,B.BARREL],   label:'Textiles' },
      { sx:mx+7, sz:mz+7, awn:B.TERRACOTTA,  goods:[B.PLANKS,B.BARREL,B.PLANKS],label:'Carpenter'},
    ];

    for (const {sx, sz, awn, goods} of stallDefs) {
      // Counter (wood base, wool display surface)
      for (let dx=-2; dx<=2; dx++) {
        this._s(sx+dx, y+1, sz, B.PLANKS);
        this._s(sx+dx, y+2, sz, B.WOOL);
      }
      // Goods on counter — barrels and hay as real 3D props
      this.props.add('barrel',     sx-1, y, sz);
      this.props.add('hay',        sx+1, y, sz);

      // 4 corner posts (oak log pillars)
      for (const [px,pz] of [[-3,-2],[3,-2],[-3,2],[3,2]]) {
        this._s(sx+px, y+1, sz+pz, B.OAK_LOG);
        this._s(sx+px, y+2, sz+pz, B.OAK_LOG);
        this._s(sx+px, y+3, sz+pz, B.OAK_LOG);
        this._s(sx+px, y+4, sz+pz, B.OAK_LOG);
      }
      // Awning (2 layers for depth)
      this._box(sx-3, y+4, sz-2, sx+3, y+4, sz+2, awn);
      this._box(sx-2, y+5, sz-1, sx+2, y+5, sz+1, awn); // raised centre ridge
      // Hanging lantern under awning centre
      this._s(sx, y+3, sz, B.LANTERN);
      // Side barrels / crates
      this.props.add('barrel', sx-3, y, sz-3);
      this.props.add('barrel', sx+3, y, sz-3);
      this.props.add('hay',    sx-4, y, sz);
    }

    // ── EXTRA SCATTER — barrels, crates, hay ─────────────────────────────
    for (const [bx,bz] of [[mx-9,mz+2],[mx+9,mz-2],[mx-9,mz-2],[mx+9,mz+2]]) {
      this.props.add('barrel', bx, y+1-1, bz);
      this.props.add('hay', bx, y+2-1, bz);
    }

    // Market entrance benches — real 3D props
    this.props.add('bench', mx-5, y, mz-11);
    this.props.add('bench', mx+5, y, mz-11);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // HOSPITAL  cx=-36, cz=-36  White clinical building — PDF spec Section 2+3
  // Two zones: south=reception/lobby, north=ward with side beds + exam bay
  // Palette: WHITE walls, CYAN_GLASS windows, RED_WOOL cross, WOOL floors
  // Props: L-desk, IV stands, cauldron sink, waiting chairs, bright lanterns
  // ══════════════════════════════════════════════════════════════════════════
  _buildHospital() {
    const cx=-36, cz=-36, y=3; const B=BLOCK_TYPES;
    this._registerBuildingZone(cx, cz, 14);

    // ── FLOOR (white tile with carpet accent strip at divider) ────────────
    this._box(cx-11, y, cz-9, cx+11, y, cz+9, B.WHITE);
    // Reception floor — light carpet accent
    for (let x=cx-10; x<=cx+10; x++) this._s(x, y, cz-2, B.CARPET);

    // ── OUTER WALLS — white stone, 10 high ────────────────────────────────
    for (let x=cx-11; x<=cx+11; x++)
      for (let z=cz-9; z<=cz+9; z++)
        if (x===cx-11||x===cx+11||z===cz-9||z===cz+9)
          for (let dy=1; dy<=10; dy++) this._s(x, y+dy, z, B.WHITE);

    // ── BRICK TRIM at base and mid-height band ─────────────────────────────
    for (let x=cx-11; x<=cx+11; x++) {
      this._s(x, y,   cz-9,  B.BRICK); this._s(x, y,   cz+9,  B.BRICK);
      this._s(x, y+5, cz-9,  B.BRICK); this._s(x, y+5, cz+9,  B.BRICK);
    }
    for (let z=cz-9; z<=cz+9; z++) {
      this._s(cx-11, y,   z, B.BRICK); this._s(cx+11, y,   z, B.BRICK);
      this._s(cx-11, y+5, z, B.BRICK); this._s(cx+11, y+5, z, B.BRICK);
    }

    // ── FLAT ROOF + stepped parapet ────────────────────────────────────────
    this._box(cx-11, y+11, cz-9, cx+11, y+11, cz+9, B.WHITE);
    // Parapet — alternating battlements
    for (let x=cx-11; x<=cx+11; x+=2) {
      this._s(x, y+12, cz-9, B.WHITE); this._s(x, y+12, cz+9, B.WHITE);
    }
    for (let z=cz-9; z<=cz+9; z+=2) {
      this._s(cx-11, y+12, z, B.WHITE); this._s(cx+11, y+12, z, B.WHITE);
    }
    // Roof skylight strip (cyan glass) — central N-S line
    for (let z=cz-6; z<=cz+6; z++) this._s(cx, y+11, z, B.CYAN_GLASS);

    // ── CYAN GLASS WINDOWS — south facade (tall, paired) ─────────────────
    for (const dx of [-8, -5, 5, 8])
      for (let dy=2; dy<=8; dy++) this._s(cx+dx, y+dy, cz-9, B.CYAN_GLASS);
    // North facade windows
    for (const dx of [-8, -4, 0, 4, 8])
      for (let dy=3; dy<=7; dy++) this._s(cx+dx, y+dy, cz+9, B.CYAN_GLASS);
    // Side windows — east and west, 3 per side
    for (const dz of [-6, -1, 5])
      for (let dy=3; dy<=7; dy++) {
        this._s(cx-11, y+dy, cz+dz, B.CYAN_GLASS);
        this._s(cx+11, y+dy, cz+dz, B.CYAN_GLASS);
      }

    // ── RED CROSS on south face (large, centred) ──────────────────────────
    for (let dy=2; dy<=9; dy++) this._s(cx, y+dy, cz-9, B.RED_WOOL);
    for (let dx=-3; dx<=3; dx++) this._s(cx+dx, y+5, cz-9, B.RED_WOOL);
    // Restore windows that overlapped cross
    for (const dx of [-8,-5,5,8]) for (let dy=2; dy<=8; dy++) this._s(cx+dx, y+dy, cz-9, B.CYAN_GLASS);

    // ── MAIN ENTRANCE — south, 3 wide × 5 tall, with canopy ──────────────
    for (let dy=1; dy<=5; dy++)
      for (const dx of [-1,0,1]) this._s(cx+dx, y+dy, cz-9, B.AIR);
    // Stone steps
    for (const dx of [-3,-2,-1,0,1,2,3]) this._s(cx+dx, y, cz-10, B.WHITE);
    this._s(cx-2, y+1, cz-10, B.WHITE); this._s(cx+2, y+1, cz-10, B.WHITE);
    // Entrance pillars
    for (let dy=1; dy<=6; dy++) {
      this._s(cx-3, y+dy, cz-10, B.BRICK);
      this._s(cx+3, y+dy, cz-10, B.BRICK);
    }
    // Canopy (white slab overhang)
    for (let dx=-3; dx<=3; dx++) this._s(cx+dx, y+6, cz-10, B.WHITE);
    this._s(cx-4, y+6, cz-10, B.WHITE); this._s(cx+4, y+6, cz-10, B.WHITE);
    // Lanterns at canopy corners
    this._s(cx-3, y+5, cz-11, B.LANTERN); this._s(cx+3, y+5, cz-11, B.LANTERN);

    // ── INTERIOR DIVIDER WALL (reception / ward at cz-1) ─────────────────
    for (let x=cx-10; x<=cx+10; x++)
      for (let dy=1; dy<=6; dy++) this._s(x, y+dy, cz-1, B.WHITE);
    // Doorway through divider — 5 wide × 5 tall for a cleaner lobby-to-ward sightline
    for (let dy=1; dy<=5; dy++)
      for (const dx of [-2,-1,0,1,2]) this._s(cx+dx, y+dy, cz-1, B.AIR);
    // Lintel above door
    for (const dx of [-3,-2,-1,0,1,2,3]) this._s(cx+dx, y+6, cz-1, B.BRICK);

    // ── RECEPTION ZONE (south half: z = cz-9 to cz-1) ────────────────────

    // L-shaped reception desk — PDF: "reception desk, waiting chairs"
    // Desk counter (white base, wool top surface)
    for (let dx=-6; dx<=-1; dx++) {
      this._s(cx+dx, y+1, cz-5, B.WHITE); this._s(cx+dx, y+2, cz-5, B.WOOL);
    }
    for (let dz=-7; dz<=-5; dz++) {
      this._s(cx-6, y+1, cz+dz, B.WHITE); this._s(cx-6, y+2, cz+dz, B.WOOL);
    }
    // Desk sign/screen (iron block on top of corner)
    this._s(cx-6, y+3, cz-7, B.IRON);
    // Waiting chairs (stone brick seats) — two rows
    for (const [wx,wz] of [[cx+3,cz-7],[cx+5,cz-7],[cx+7,cz-7],[cx+9,cz-7],
                             [cx+3,cz-5],[cx+5,cz-5],[cx+7,cz-5],[cx+9,cz-5]]) {
      this._s(wx, y+1, wz, B.STONE_BRICK);
      this._s(wx, y+2, wz, B.CYAN_GLASS); // cyan seat cushion
    }
    // Cauldron sink (east wall of reception)
    this._s(cx+10, y+1, cz-7, B.STONE_BRICK);
    this._s(cx+10, y+2, cz-7, B.IRON); // sink basin
    this._s(cx+10, y+1, cz-5, B.STONE_BRICK);
    this._s(cx+10, y+2, cz-5, B.IRON);
    // Medicine cabinet (white block stack on east wall)
    for (let dy=1; dy<=4; dy++) {
      this._s(cx+10, y+dy, cz-3, B.WHITE);
      this._s(cx+9,  y+dy, cz-3, B.WHITE);
    }
    // Red cross on cabinet doors
    this._s(cx+10, y+2, cz-3, B.RED_WOOL);
    this._s(cx+9,  y+2, cz-3, B.RED_WOOL);

    // Reception ceiling lamps — bright LANTERN grid
    for (const [lx,lz] of [[cx-7,cz-7],[cx-3,cz-7],[cx+2,cz-7],[cx+7,cz-7],
                             [cx-7,cz-4],[cx+2,cz-4],[cx+7,cz-4]])
      this._s(lx, y+10, lz, B.LANTERN);

    // ── WARD ZONE (north half: z = cz-1 to cz+9) ─────────────────────────

    // 4 patient beds on the side walls — keep the centre aisle open for the doctor/night shots
    // Each bed: wood frame (2 long), white wool mattress, red pillow
    for (const [bx,bz] of [
      [cx-9, cz+1], [cx-9, cz+5],
      [cx+8, cz+1], [cx+8, cz+5],
    ]) {
      // Bed frame — 3 blocks long
      for (let dz=0; dz<=2; dz++) {
        this._s(bx, y+1, bz+dz, B.WOOD);
        this._s(bx, y+2, bz+dz, B.WOOL);
      }
      // Red wool pillow at head
      this._s(bx, y+3, bz, B.RED_WOOL);
      // White headboard post
      this._s(bx, y+3, bz+2, B.WHITE);
      // IV stand (iron block beside bed)
      this._s(bx+1, y+1, bz+1, B.STONE_BRICK);
      this._s(bx+1, y+2, bz+1, B.IRON);
      this._s(bx+1, y+3, bz+1, B.LANTERN); // IV drip light
    }

    // East-side exam bay — keeps the centre aisle readable
    // White table + overhead surgical lamp
    for (let dz=0; dz<=3; dz++) {
      this._s(cx+4, y+1, cz+4+dz, B.WHITE);
      this._s(cx+5, y+1, cz+4+dz, B.WHITE);
      this._s(cx+6, y+1, cz+4+dz, B.WHITE);
      this._s(cx+4, y+2, cz+4+dz, B.WOOL);
      this._s(cx+5, y+2, cz+4+dz, B.WOOL);
      this._s(cx+6, y+2, cz+4+dz, B.WOOL);
    }
    // ── Cyan "pillow" block at head of operating table ────────────────────
    // 1×1 CYAN_GLASS block raised on the mattress surface — distinct pop of colour
    this._s(cx+5, y+3, cz+4, B.CYAN_GLASS);

    // Surgical lamp above OR table
    this._s(cx+5, y+9, cz+5, B.LANTERN);
    this._s(cx+5, y+8, cz+5, B.IRON);
    // Red cross marker beside OR table
    this._s(cx+3, y+1, cz+6, B.RED_WOOL);

    // ── Medical Monitor — 1×1 DARK block on east wall w/ green emissive ──
    // The DARK block is the screen housing; the green glow is in RoomInteriors
    this._s(cx+11, y+4, cz+5, B.DARK);      // monitor housing on east wall
    this._s(cx+11, y+5, cz+5, B.DARK);      // taller screen (2 blocks high)
    // Green heartbeat "blip" — SOUL_LANTERN gives a cyan-green glow
    this._s(cx+11, y+4, cz+5, B.SOUL_LANTERN); // inner glow (overwrites DARK — use DARK as frame)
    // Frame around monitor (WHITE border)
    this._s(cx+11, y+3, cz+4, B.WHITE);
    this._s(cx+11, y+3, cz+6, B.WHITE);
    this._s(cx+11, y+6, cz+5, B.WHITE);

    // Storage shelves on north wall — iron + white blocks
    for (const dx of [-9,-6,-3,0,3,6,9])
      for (let dy=1; dy<=3; dy++) this._s(cx+dx, y+dy, cz+8, B.WHITE);
    // Red accent labels on shelves
    for (const dx of [-9,-3,3,9]) this._s(cx+dx, y+2, cz+8, B.RED_WOOL);

    // Ward ceiling lamps
    for (const [lx,lz] of [[cx-8,cz+2],[cx,cz+2],[cx+8,cz+2],
                             [cx-8,cz+6],[cx,cz+6],[cx+8,cz+6]])
      this._s(lx, y+10, lz, B.LANTERN);

    // ── FLAGPOLE + red cross flag ─────────────────────────────────────────
    for (let dy=12; dy<=22; dy++) this._s(cx+11, y+dy, cz-9, B.OAK_LOG);
    for (const [dx,dz] of [[0,0],[1,0],[2,0],[0,1],[1,1],[2,1]])
      this._s(cx+11-dx, y+18, cz-9+dz, B.WHITE);
    for (const [dx,dz] of [[0,0],[1,0]])
      this._s(cx+11-dx, y+18, cz-9+dz, B.RED_WOOL); // cross on flag
    this._s(cx+11-1, y+17, cz-9, B.RED_WOOL);
    this._s(cx+11-1, y+19, cz-9, B.RED_WOOL);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SHERIFF STATION  cx=36, cz=-36  Cobblestone fort — REVAMPED
  // Layout: south half = office (desk, filing, wanted board), north = jail cells
  // Palette: COBBLE walls, WOOD_DARK roof, IRON bars, bright LANTERN lights
  // Props: Detailed 3D props in RoomInteriors.js — jail bars, desk, evidence board, etc.
  // ══════════════════════════════════════════════════════════════════════════
  _buildSheriffStation() {
    const cx=36, cz=-36, y=3; const B=BLOCK_TYPES;
    this._registerBuildingZone(cx, cz, 14);

    // ── FLOOR — planks throughout, stone accent for jail area ──────
    this._box(cx-11, y, cz-9, cx+11, y, cz+9, B.PLANKS);
    // Stone tile in jail area (north half)
    this._box(cx-11, y, cz+1, cx+11, y, cz+9, B.STONE_BRICK);

    // ── COBBLESTONE OUTER WALLS — 10 high ─────────────────────────────────
    for (let x=cx-11; x<=cx+11; x++)
      for (let z=cz-9; z<=cz+9; z++)
        if (x===cx-11||x===cx+11||z===cz-9||z===cz+9)
          for (let dy=1; dy<=10; dy++) this._s(x, y+dy, z, B.COBBLE);

    // ── GABLED DARK-OAK ROOF ───────────────────────────────────────────────
    for (let p=0; p<=11; p++) {
      for (let z=cz-9; z<=cz+9; z++) {
        this._s(cx-11+p, y+10+p, z, B.WOOD_DARK);
        this._s(cx+11-p, y+10+p, z, B.WOOD_DARK);
        if (p > 0) { // fill interior of roof
          for (let fi=cx-11+p; fi<=cx+11-p; fi++)
            this._s(fi, y+10+p, z, B.WOOD_DARK);
        }
      }
      if (cx-11+p >= cx) break;
    }
    // Ridge beam
    for (let z=cz-9; z<=cz+9; z++) this._s(cx, y+21, z, B.OAK_LOG);

    // ── BARRED WINDOWS — south face (glass/iron alternating) ──────────────
    for (const dx of [-8,-5,-2,2,5,8])
      for (let dy=3; dy<=8; dy++) this._s(cx+dx, y+dy, cz-9, (dy%2===0)?B.GLASS:B.IRON);
    // North face — all iron bars (jail exterior)
    for (const dx of [-8,-5,-2,2,5,8])
      for (let dy=2; dy<=8; dy++) this._s(cx+dx, y+dy, cz+9, B.IRON);
    // Side windows — east and west
    for (const dz of [-6, -2, 3, 7])
      for (let dy=3; dy<=7; dy++) {
        this._s(cx-11, y+dy, cz+dz, B.GLASS);
        this._s(cx+11, y+dy, cz+dz, B.GLASS);
      }

    // ── MAIN ENTRANCE — west face, 3 wide × 5 tall ─────────────────────────
    for (let dy=1; dy<=5; dy++)
      for (const dz of [-1,0,1]) this._s(cx-11, y+dy, cz+dz, B.AIR);
    // Porch overhang
    this._box(cx-14, y+6, cz-3, cx-11, y+6, cz+3, B.COBBLE);
    for (let dy=1; dy<=5; dy++) {
      this._s(cx-14, y+dy, cz-3, B.COBBLE);
      this._s(cx-14, y+dy, cz+3, B.COBBLE);
    }
    // Porch lanterns
    this._s(cx-14, y+5, cz-2, B.LANTERN);
    this._s(cx-14, y+5, cz+2, B.LANTERN);
    // Sandbag barricades
    for (const dz of [-4,-3,3,4]) {
      this._s(cx-11, y+1, cz+dz, B.GRAVEL);
      this._s(cx-11, y+2, cz+dz, B.GRAVEL);
    }

    // ── INTERIOR PARTITION — office (south) / jail (north) at z=cz+1 ──────
    // Clear doorway for passage between zones
    for (let dy=1; dy<=4; dy++) {
      this._s(cx-1, y+dy, cz+1, B.AIR);
      this._s(cx,   y+dy, cz+1, B.AIR);
    }
    // Lintel above doorway
    for (const dx of [-2,-1,0,1,2]) this._s(cx+dx, y+5, cz+1, B.PLANKS);

    // ── INTERIOR IS CLEARED — Detailed props added in RoomInteriors.js ────
    // The interior furniture, jail bars, desk, etc. are all 3D props
    // created in setupSheriffOffice() for better visual quality

    // ── FLAGPOLE + flag ────────────────────────────────────────────────────
    for (let dy=11; dy<=23; dy++) this._s(cx+11, y+dy, cz-9, B.OAK_LOG);
    // Dark blue flag (planks = badge of authority + gold star)
    for (const [dx,dz] of [[-1,0],[-2,0],[-1,1],[-2,1],[-1,2],[-2,2]])
      this._s(cx+11+dx, y+20, cz-9+dz, B.PLANKS);
    this._s(cx+10, y+21, cz-9, B.GOLD_BLOCK); // gold star badge
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MAFIA UNDERGROUND BUNKER  cx=0, cz=48  Underground lair — PDF Section 2+3
  // Deepslate/nether-brick palette, cross-shaped glass ceiling, mood lighting
  // Zones: war room (west) + armory + sleeping quarters (east)
  // Props: planning table, map wall, weapon rack, armory bottles, bunk beds
  // Surface: hatch at z=30, staircase z=32-37, tunnel z=38-37(cz-11)
  // ══════════════════════════════════════════════════════════════════════════
  _buildMafiaRoom() {
    const cx=0, cz=48, y0=0; const B=BLOCK_TYPES;
    this._registerBuildingZone(cx, cz, 22); // extra large — underground room extends far

    // ── EXCAVATE AND OUTER SHELL ────────────────────────────────────────────
    for (let x=cx-13; x<=cx+13; x++)
      for (let z=cz-11; z<=cz+11; z++) {
        const isWall = x===cx-13||x===cx+13||z===cz-11||z===cz+11;
        for (let y=y0; y<=y0+8; y++) {
          if (y===y0)        this._s(x,y,z, B.STONE_BRICK);  // floor
          else if (y===y0+8) this._s(x,y,z, B.STONE_BRICK);  // ceiling
          else if (isWall)   this._s(x,y,z, B.NETHER);       // nether brick walls
          else               this._s(x,y,z, B.AIR);
        }
      }

    // ── FLOOR DESIGN — dark wood planks with mossy patches ─────────────────
    for (let x=cx-12; x<=cx+12; x++)
      for (let z=cz-10; z<=cz+10; z++) this._s(x,y0,z, B.WOOD_DARK);
    // Mossy stone patches for worn underground look
    for (const [mx,mz] of [
      [cx-9,cz-8],[cx+9,cz-8],[cx-9,cz+8],[cx+9,cz+8],
      [cx-5,cz],[cx+5,cz],[cx,cz-5],[cx,cz+5],
      [cx-11,cz-4],[cx+11,cz+4],[cx-11,cz+4],[cx+11,cz-4],
    ]) this._s(mx,y0,mz, B.MOSSY);

    // ── STONE BRICK CORNER PILLARS ─────────────────────────────────────────
    for (const [px,pz] of [[cx-12,cz-10],[cx+12,cz-10],[cx-12,cz+10],[cx+12,cz+10],
                             [cx-12,cz],[cx+12,cz],[cx,cz-10],[cx,cz+10]]) {
      for (let dy=1; dy<=7; dy++) this._s(px,y0+dy,pz, B.STONE_BRICK);
    }

    // ── NETHER BRICK ACCENT STRIPS along wall base and mid ─────────────────
    for (let x=cx-13; x<=cx+13; x++) {
      this._s(x,y0+1,cz-11,B.NETHER); this._s(x,y0+1,cz+11,B.NETHER);
      this._s(x,y0+4,cz-11,B.NETHER); this._s(x,y0+4,cz+11,B.NETHER);
    }
    for (let z=cz-11; z<=cz+11; z++) {
      this._s(cx-13,y0+1,z,B.NETHER); this._s(cx+13,y0+1,z,B.NETHER);
      this._s(cx-13,y0+4,z,B.NETHER); this._s(cx+13,y0+4,z,B.NETHER);
    }

    // ── CROSS-SHAPED GLASS CEILING — PDF: "cross-shaped panes, night sky view" ─
    for (let x=cx-6; x<=cx+6; x++) this._s(x,y0+8,cz, B.GLASS);
    for (let z=cz-6; z<=cz+6; z++) this._s(cx,y0+8,z, B.GLASS);
    // Central red lamp above glass cross
    this._s(cx,y0+8,cz, B.RED_LAMP);

    // ── RED LAMP LIGHT PILLARS at corners ──────────────────────────────────
    for (const [lx,lz] of [
      [cx-11,cz-9],[cx+11,cz-9],[cx-11,cz+9],[cx+11,cz+9],
      [cx-11,cz],  [cx+11,cz],  [cx,cz-9],   [cx,cz+9],
    ]) {
      this._s(lx,y0+2,lz, B.NETHER);
      this._s(lx,y0+3,lz, B.RED_LAMP);
      this._s(lx,y0+4,lz, B.NETHER);
      this._s(lx,y0+5,lz, B.STONE_BRICK);
    }

    // ── ROOM DIVIDER — war room vs sleeping quarters (archway at cx+3) ─────
    for (let z=cz-11; z<=cz+11; z++)
      for (let dy=1; dy<=8; dy++) this._s(cx+3,y0+dy,z, B.STONE_BRICK);
    // Tall archway opening — 3 wide × 5 tall
    for (let dy=1; dy<=5; dy++)
      for (const dz of [-1,0,1]) this._s(cx+3,y0+dy,cz+dz, B.AIR);
    this._s(cx+3,y0+6,cz, B.RED_LAMP); // lamp above arch

    // ══ WAR ROOM (west half, x: cx-12 to cx+3) ════════════════════════════

    // ── LARGE MAP WALL — PDF: "planning table (maps)", red target markers ──
    // Entire west wall plastered with a tactical map
    for (let z=cz-9; z<=cz+9; z++)
      for (let dy=2; dy<=7; dy++) this._s(cx-12,y0+dy,z, B.PLANKS);
    // Map grid overlay (dark wood accents = terrain lines)
    for (const dz of [cz-7,cz-4,cz-1,cz+2,cz+5,cz+8])
      for (let dy=3; dy<=6; dy++) this._s(cx-12,y0+dy,dz, B.WOOD_DARK);
    // Red wool target markers (hit points on the map)
    for (const [dz,dy] of [[cz-8,3],[cz-5,5],[cz-2,4],[cz+1,6],[cz+4,3],[cz+7,5]])
      this._s(cx-12,y0+dy,dz, B.RED_WOOL);
    // Glowing centre target (red lamp)
    this._s(cx-12,y0+4,cz, B.RED_LAMP);
    // Gold star = primary target marker
    this._s(cx-12,y0+5,cz-3, B.GOLD_BLOCK);
    this._s(cx-12,y0+5,cz+3, B.GOLD_BLOCK);

    // ── ROUND PLANNING TABLE — PDF: "war room (round table) at center" ─────
    // 5×3 dark wood table with stone base
    for (const [tx,tz] of [
      [cx-5,cz-2],[cx-4,cz-2],[cx-3,cz-2],[cx-2,cz-2],[cx-1,cz-2],
      [cx-5,cz-1],[cx-4,cz-1],[cx-3,cz-1],[cx-2,cz-1],[cx-1,cz-1],
      [cx-5,cz],  [cx-4,cz],  [cx-3,cz],  [cx-2,cz],  [cx-1,cz],
      [cx-5,cz+1],[cx-4,cz+1],[cx-3,cz+1],[cx-2,cz+1],[cx-1,cz+1],
      [cx-5,cz+2],[cx-4,cz+2],[cx-3,cz+2],[cx-2,cz+2],[cx-1,cz+2],
    ]) {
      this._s(tx,y0+1,tz, B.STONE_BRICK);
      this._s(tx,y0+2,tz, B.WOOD_DARK);
    }
    // Red X markers on table (mission targets)
    for (const [tx,tz] of [[cx-4,cz-1],[cx-2,cz+1],[cx-2,cz-1],[cx-4,cz+1],[cx-3,cz]])
      this._s(tx,y0+2,tz, B.RED_WOOL);
    // Gold block = prime target on table
    this._s(cx-3,y0+3,cz, B.GOLD_BLOCK);

    // Chairs around table (nether brick blocks as seats)
    for (const [sx,sz] of [
      [cx-6,cz-3],[cx-3,cz-3],[cx,cz-3],
      [cx-6,cz+3],[cx-3,cz+3],[cx,cz+3],
      [cx-6,cz],  [cx,cz],
    ]) {
      this._s(sx,y0+1,sz, B.STONE_BRICK);
      this._s(sx,y0+2,sz, B.NETHER);
    }

    // ── POKER TABLE (2×2 dark wood) — recreational corner of war room ────
    // 4 stool seats (single WOOD blocks) at cardinal positions around table
    const ptx = cx+1, ptz = cz+6;  // table anchor (NE of planning table)
    // Surface (2×2 WOOD_DARK top, STONE_BRICK legs)
    for (const [dx,dz] of [[0,0],[1,0],[0,1],[1,1]]) {
      this._s(ptx+dx, y0+1, ptz+dz, B.STONE_BRICK);
      this._s(ptx+dx, y0+2, ptz+dz, B.WOOD_DARK);
    }
    // 4 stools — one per cardinal direction (single WOOD block each)
    this._s(ptx-1, y0+1, ptz,   B.WOOD);  // west stool
    this._s(ptx+2, y0+1, ptz,   B.WOOD);  // east stool
    this._s(ptx,   y0+1, ptz-1, B.WOOD);  // north stool
    this._s(ptx,   y0+1, ptz+2, B.WOOD);  // south stool

    // ── INDUSTRIAL LAMP over poker table ─────────────────────────────────
    // Dark block "housing" hangs just below the ceiling; LANTERN = warm glow beneath
    this._s(ptx,   y0+7, ptz,   B.DARK);    // shade / housing (1 below ceiling)
    this._s(ptx,   y0+6, ptz,   B.LANTERN); // glowing amber element hanging below

    // ── WEAPON CRATES (2×1 dark grey) in war-room divider corners ────────
    // NE corner of war room (near partition wall at cx+3, north wall cz-10)
    this._s(cx+2, y0+1, cz-9, B.DARK);
    this._s(cx+2, y0+2, cz-9, B.DARK);
    this._s(cx+1, y0+1, cz-9, B.DARK);
    this._s(cx+1, y0+2, cz-9, B.DARK);
    // SE corner of war room (near south wall cz+9)
    this._s(cx+2, y0+1, cz+9, B.DARK);
    this._s(cx+2, y0+2, cz+9, B.DARK);
    this._s(cx+1, y0+1, cz+9, B.DARK);
    this._s(cx+1, y0+2, cz+9, B.DARK);

    // ── WEAPON RACK — PDF: "armory (weapon cache)" north wall ────────────
    for (let x=cx-11; x<=cx-5; x++) {
      this._s(x,y0+3,cz-10, B.IRON);
      this._s(x,y0+4,cz-10, B.DARK);
      this._s(x,y0+5,cz-10, B.IRON);
    }
    // Mounted weapons (gold blocks = elite weapons)
    for (const wx of [cx-10,cx-8,cx-6]) {
      this._s(wx,y0+4,cz-10, B.GOLD_BLOCK);
    }

    // ── ARMORY SHELF — PDF: "brewing-stand bottles" south wall war side ────
    for (const [bx,bz] of [[cx-11,cz+9],[cx-9,cz+9],[cx-7,cz+9],[cx-5,cz+9],[cx-3,cz+9]]) {
      // Crate (dark wood base)
      this._s(bx,y0+1,bz, B.WOOD_DARK);
      this._s(bx,y0+2,bz, B.PLANKS);
      // Bottle on top (lantern = glowing chemical)
      this._s(bx,y0+3,bz, B.LANTERN);
    }
    // Additional armory shelf mid-height (stone brick brackets)
    for (const [bx,bz] of [[cx-10,cz+9],[cx-8,cz+9],[cx-6,cz+9],[cx-4,cz+9]]) {
      this._s(bx,y0+4,bz, B.STONE_BRICK);
      this._s(bx,y0+5,bz, B.IRON); // weapons/gear
    }

    // ── WAR ROOM LAMPS — dim red atmosphere ─────────────────────────────────
    for (const [lx,lz] of [[cx-9,cz-7],[cx-5,cz-7],[cx-1,cz-7],
                             [cx-9,cz+7],[cx-5,cz+7],[cx-1,cz+7]])
      this._s(lx,y0+8,lz, B.RED_LAMP);

    // ══ SLEEPING QUARTERS (east half, x: cx+3 to cx+13) ══════════════════

    // ── BUNK BEDS × 6 — PDF: "sleeping quarters with beds (red wool)" ──────
    for (const [bx,bz] of [
      [cx+5,cz-10],[cx+8,cz-10],[cx+11,cz-10],
      [cx+5,cz+8], [cx+8,cz+8], [cx+11,cz+8],
    ]) {
      // Lower bunk — stone brick frame, red wool mattress
      this._s(bx,y0+1,bz,   B.STONE_BRICK); this._s(bx,y0+1,bz+1, B.STONE_BRICK);
      this._s(bx,y0+2,bz,   B.RED_WOOL);    this._s(bx,y0+2,bz+1, B.RED_WOOL);
      // Upper bunk — nether brick support posts
      this._s(bx,y0+3,bz,   B.NETHER);      this._s(bx,y0+3,bz+1, B.NETHER);
      this._s(bx,y0+4,bz,   B.STONE_BRICK); this._s(bx,y0+4,bz+1, B.STONE_BRICK);
      this._s(bx,y0+5,bz,   B.RED_WOOL);    this._s(bx,y0+5,bz+1, B.RED_WOOL);
      // Headboard / footboard post (dark wood)
      this._s(bx,y0+1,bz+2, B.WOOD_DARK);   this._s(bx,y0+5,bz+2, B.WOOD_DARK);
      // Personal lantern above each bunk
      this._s(bx,y0+6,bz,   B.LANTERN);
    }

    // ── STORAGE LOCKERS — PDF: "storage chests east wall" ──────────────────
    for (const [ex,ez] of [[cx+6,cz-1],[cx+8,cz-1],[cx+10,cz-1],[cx+12,cz-1],
                             [cx+6,cz+1],[cx+8,cz+1],[cx+10,cz+1],[cx+12,cz+1]]) {
      this._s(ex,y0+1,ez, B.WOOD_DARK);
      this._s(ex,y0+2,ez, B.OAK_LOG); // locked chest look
      this._s(ex,y0+3,ez, B.IRON);    // iron latch
    }

    // ── SMALL PLANNING TABLE (quarters side) — personal strategy corner ────
    for (const [px,pz] of [[cx+9,cz-4],[cx+10,cz-4],[cx+11,cz-4],
                             [cx+9,cz-3],[cx+10,cz-3],[cx+11,cz-3]]) {
      this._s(px,y0+1,pz, B.STONE_BRICK);
      this._s(px,y0+2,pz, B.WOOD_DARK);
    }
    this._s(cx+10,y0+2,cz-4, B.RED_WOOL); // map marker
    this._s(cx+10,y0+3,cz-4, B.IRON);     // personal screen

    // East wall lanterns
    for (const ez of [cz-9, cz-4, cz, cz+4, cz+9])
      this._s(cx+12,y0+4,ez, B.LANTERN);

    // ── SURFACE PATCH ABOVE BUNKER ACCESS ─────────────────────────────────
    // Keep the underground bunker structure, but remove the dark surface slab
    // so the strip between amphitheater and bunker reads as normal village grass.
    for (let dx = -4; dx <= 4; dx++) {
      for (let dz = -3; dz <= 3; dz++) {
        this._s(dx, 1, 30 + dz, B.DIRT);
        this._s(dx, 2, 30 + dz, B.DIRT);
        this._s(dx, 3, 30 + dz, B.GRASS);
      }
    }
    for (let dx = -4; dx <= 4; dx++) {
      for (let dz = 27; dz <= 33; dz++) {
        for (let dy = 4; dy <= 8; dy++) this._s(dx, dy, dz, B.AIR);
      }
    }

    // Staircase: z=32 → 37, descending y=3 → y=0
    for (let step=0; step<=5; step++) {
      const sz=32+step, sy=3-step; if (sy<0) break;
      for (const dx of [-1,0,1]) {
        this._s(dx,sy,sz,   B.STONE_BRICK);
        this._s(dx,sy+1,sz, B.AIR);
        this._s(dx,sy+2,sz, B.AIR);
        this._s(dx,sy+3,sz, B.AIR);
      }
      // Lantern every 2 steps
      if (step % 2 === 0) this._s(1,sy+1,sz, B.LANTERN);
    }

    // Tunnel z=38 → cz-11=37 (underground, nether lined)
    for (let z=38; z<=cz-11; z++) {
      for (const dx of [-1,0,1]) {
        for (let dy=1; dy<=5; dy++) this._s(dx,dy,z, B.AIR);
        this._s(dx,0,z, B.STONE_BRICK);
        this._s(dx,6,z, B.STONE_BRICK);
      }
      this._s(-2,2,z, B.NETHER); this._s(-2,4,z, B.NETHER);
      this._s( 2,2,z, B.NETHER); this._s( 2,4,z, B.NETHER);
      this._s(-2,3,z, B.STONE_BRICK); this._s(2,3,z, B.STONE_BRICK);
      if (z%3===0) this._s(0,5,z, B.LANTERN);
    }
    // Tunnel entrance gate (nether brick arch at bunker wall)
    for (const dx of [-2,-1,0,1,2])
      this._s(dx,y0+6,cz-11, dx===0?B.LANTERN:B.STONE_BRICK);
    
    // ── FILL HOLES NEAR BUNKER ───────────────────────────────────────────────
    // Ensure surface terrain is complete around bunker entrance
    // Fill any gaps with grass blocks
    for (let fx = -8; fx <= 8; fx++) {
      for (let fz = 24; fz <= 36; fz++) {
        // Check if this area needs ground fill (not part of hatch/staircase/tunnel)
        const isHatchArea = (fx >= -2 && fx <= 2 && fz >= 28 && fz <= 32);
        const isStairArea = (fx >= -1 && fx <= 1 && fz >= 32 && fz <= 37);
        const isTunnelArea = (fx >= -1 && fx <= 1 && fz >= 38 && fz <= 37);
        if (!isHatchArea && !isStairArea && !isTunnelArea) {
          // Fill ground layers
          this._s(fx, 1, fz, B.DIRT);
          this._s(fx, 2, fz, B.DIRT);
          this._s(fx, 3, fz, B.GRASS);
          // Clear any air blocks above ground
          for (let fy = 4; fy <= 8; fy++) {
            this._s(fx, fy, fz, B.AIR);
          }
        }
      }
    }
    // Additional fill for east/west sides of bunker
    for (let fx of [-14, -13, 13, 14]) {
      for (let fz = 36; fz <= 60; fz++) {
        this._s(fx, 1, fz, B.DIRT);
        this._s(fx, 2, fz, B.DIRT);
        this._s(fx, 3, fz, B.GRASS);
      }
    }
    // Fill north side of bunker
    for (let fx = -14; fx <= 14; fx++) {
      for (let fz = 34; fz <= 36; fz++) {
        this._s(fx, 1, fz, B.DIRT);
        this._s(fx, 2, fz, B.DIRT);
        this._s(fx, 3, fz, B.GRASS);
      }
    }
  }




  // ── LIGHTS ────────────────────────────────────────────────────────────────
  _addLights() {
    // ── Directional sun light (one shadow caster) ────────────────────────────
    this.sunLight = new THREE.DirectionalLight(0xfff5e0, 2.5);
    this.sunLight.position.set(60, 100, 60);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width  = 1024;
    this.sunLight.shadow.mapSize.height = 1024;
    this.sunLight.shadow.camera.near   = 1;
    this.sunLight.shadow.camera.far    = 200;  // was 250 — tighter = sharper shadows
    this.sunLight.shadow.camera.left   = -75;  // was -90 — tighter frustum = better texel density
    this.sunLight.shadow.camera.right  =  75;
    this.sunLight.shadow.camera.top    =  75;
    this.sunLight.shadow.camera.bottom = -75;
    this.sunLight.shadow.bias = -0.001;
    this.scene.add(this.sunLight);

    // Strong hemisphere — sky/ground gradient, zero GPU cost, eliminates dark spots
    const hemi = new THREE.HemisphereLight(0xb0ccff, 0x223311, 0.65); // reduced from 1.0 — was flooding underground bunker
    this.scene.add(hemi);
    this._hemiLight = hemi;   // store ref so night mode can dim it

    // Strong ambient — backup fill so nothing is ever pitch black
    this.ambientLight = new THREE.AmbientLight(0xaabbcc, 0.75); // reduced from 1.2 — global ambient was overbright underground
    this.scene.add(this.ambientLight);
    this._sunLight = this.sunLight;
    this._ambLight = this.ambientLight;

    // ── Tight baked lantern lift — local block readability without day wash ─
    const centerRingLamps = [[19,0],[-19,0],[0,19],[0,-19]];
    const { x: gx, z: gz } = this.graveyardBase;
    const graveyardEdgeLamps = [
      [gx - 10, gz - 8], [gx + 10, gz - 8], [gx - 10, gz + 8], [gx + 10, gz + 8],
      [gx - 10, gz],     [gx + 10, gz],     [gx, gz - 8],      [gx, gz + 8],
    ];

    for (const [lx, lz] of centerRingLamps) {
      this.vw.addBakedLight(lx, 7, lz, 0xffc06a, 0.06, 4, {
        mode: 'minecraft',
        combineGroup: 'warm',
        dayScale: 0,
        nightScale: 1.0,
      });
    }

    this.vw.addBakedLight(-36, 12, -36, 0xffd5a0, 0.08, 5, {
      mode: 'minecraft',
      combineGroup: 'warm',
      dayScale: 0,
      nightScale: 1.0,
    });
    this.vw.addBakedLight(36, 12, -36, 0xffbf72, 0.08, 5, {
      mode: 'minecraft',
      combineGroup: 'warm',
      dayScale: 0,
      nightScale: 1.0,
    });
    this.vw.addBakedLight(0, 5, 30, 0xffb05a, 0.08, 4, {
      mode: 'minecraft',
      combineGroup: 'warm',
      dayScale: 0,
      nightScale: 1.0,
    });

    for (const [lx, lz] of graveyardEdgeLamps) {
      this.vw.addBakedLight(lx, 7, lz, 0x33ddcc, 0.07, 4, {
        mode: 'minecraft',
        combineGroup: 'cool',
        dayScale: 0,
        nightScale: 0.9,
      });
    }

    for (const [hx, hz] of [
      [34, 16], [34, -8], [20, 44], [44, 10],
      [-34, 16], [-34, -8], [-20, 44], [-44, 10],
    ]) {
      this.vw.addBakedLight(hx, 7, hz + 4, 0xffbf72, 0.085, 4.5, {
        mode: 'minecraft',
        combineGroup: 'warm',
        dayScale: 0,
        nightScale: 1.0,
      });
      this.vw.addBakedLight(hx, 6, hz, 0xffd3a0, 0.05, 4, {
        mode: 'minecraft',
        combineGroup: 'warm',
        dayScale: 0,
        nightScale: 0.72,
      });
    }

    // ── PATH LAMP POST baked lights — Minecraft block-tinting for EVERY post ──
    // These are the amber lamp posts spread all over the village paths.
    // Without addBakedLight entries the vertex-color system never tints blocks
    // near them, so they look like they only glow themselves.
    // intensity/radius tuned to match vanilla Minecraft lantern (level 15, ~7 block reach).
    const pathZ = [-64,-52,-40,-28,-18,18,28,40,52,64];
    const pathX = [-64,-52,-40,-28,-18,18,28,40,52,64];
    // North-south path posts (x = ±3)
    for (const z of pathZ) {
      for (const px of [-3, 3]) {
        this.vw.addBakedLight(px, 7.5, z, 0xffaa33, 0.09, 6, {
          mode: 'minecraft', combineGroup: 'warm', dayScale: 0, nightScale: 1.0,
        });
      }
    }
    // East-west path posts (z = ±3)
    for (const x of pathX) {
      for (const pz of [-3, 3]) {
        this.vw.addBakedLight(x, 7.5, pz, 0xffaa33, 0.09, 6, {
          mode: 'minecraft', combineGroup: 'warm', dayScale: 0, nightScale: 1.0,
        });
      }
    }
    // Center plaza ring posts
    for (const [lx, lz] of [[19,0],[-19,0],[0,19],[0,-19]]) {
      this.vw.addBakedLight(lx, 7.5, lz, 0xffaa33, 0.10, 7, {
        mode: 'minecraft', combineGroup: 'warm', dayScale: 0, nightScale: 1.0,
      });
    }
    // Diagonal corner posts between roads and buildings
    for (const [lx, lz] of [
      [-8,-8],[8,-8],[-8,8],[8,8],
      [-24,-14],[-30,-20],[-36,-26],[-40,-30],[-44,-34],
      [24,-14],[30,-20],[36,-26],[40,-30],[44,-34],
      [3,24],[-3,24],[3,36],[-3,36],[-6,30],[6,30],
      [14,14],[24,24],[32,32],[-16,16],[-26,26],[-32,32],
    ]) {
      this.vw.addBakedLight(lx, 7.5, lz, 0xffaa33, 0.085, 5.5, {
        mode: 'minecraft', combineGroup: 'warm', dayScale: 0, nightScale: 1.0,
      });
    }

    // ── Minimal dynamic PointLights — 5 total, interiors only ─────────────
    // All outdoor static illumination is now handled by baked vertex colors.
    // These 5 lights serve areas where baking can't reach (interior caves,
    // occluded bunkers) and need to respond to day/night transitions.

    // Hospital interior — cool-white clinical (interior fill, subtle)
    this._addPL(-36, 11, -36, 0xe0f0ff, 2.2, 20);
    // Sheriff interior — warm amber, professional (interior fill, subtle)
    this._addPL(36, 11, -36, 0xfff5cc, 2.0, 20);
    // Mafia bunker underground — dim fill only, no flooding
    this._addPL(0, 2.5, 48, 0xff8833, 0.15, 5);
    // Graveyard soul lantern glow
    this._addPL(gx, 7, gz - 8, 0x22ddcc, 2.8, 14);

    // ── Exterior building wall-wash — subtle glow on facade at night ──────
    // Low intensity, very localised — just enough to show the building silhouette
    // and hint at the activity inside. NOT blinding from the outside.
    // Hospital exterior — cool blue-white facade
    this._addPL(-36, 7, -46, 0xc8e8ff, 1.2, 14);  // south face
    this._addPL(-46, 7, -36, 0xc8e8ff, 1.0, 12);  // west face
    // Sheriff exterior — warm amber-gold facade  
    this._addPL(36, 7, -46, 0xffcc77, 1.2, 14);   // south face
    this._addPL(46, 7, -36, 0xffcc77, 1.0, 12);   // east face
    // Mafia bunker exterior — minimal hint
    this._addPL(0, 3, 58, 0xff7722, 0.2, 8);      // south face above ground

    // ── House interior lights — warm amber hearth glow through windows ─────
    // Each house gets one interior PointLight at mid-height (y=6, inside room)
    // These make windows visibly glow amber from outside paths.
    for (const [hx, hz] of [
      [-34, 16], [34, 16], [-34, -8], [34, -8],
      [-20, 44], [20, 44], [-44, 10], [44, 10],
    ]) {
      // Main interior hearth — centred, high enough to spill through south windows
      this._addPL(hx, 6, hz, 0xffaa44, 4.8, 14);
      // Secondary — slightly forward so light bleeds through front face glass
      this._addPL(hx, 5, hz + 2, 0xffbb55, 3.2, 10);
    }

    // ── Lamp-post ground pools — no-shadow PointLights at lamp positions ─────
    // Gives the Minecraft "pool of amber light beneath each torch" effect.
    // castShadow = false keeps GPU cost near zero even with 25 extra lights.
    this._buildLampPostLights();

    // ═══════════════════════════════════════════════════════════════════════
    // LANTERN SYSTEM — one PointLight + Sprite per role building
    // Warm 0xffaa44 amber, castShadow = true, organic flicker via gsap.ticker
    // ═══════════════════════════════════════════════════════════════════════
    this.lanterns = new LanternSystem(this.scene);

    // ── Window glow system — warm amber light bleeding through house windows ─
    this.windowGlow = new WindowGlowSystem(this.scene);
    const houseDefs = [
      [-34,16],[34,16],[-34,-8],[34,-8],
      [-20,44],[20,44],[-44,10],[44,10],
    ];
    for (const [hx, hz] of houseDefs) {
      this.windowGlow.registerHouse(hx, hz);
    }

    // Hospital — cool clinical blue-white, crisp and clear
    this.lanterns.registerLantern(-36, 12, -36, {
      color: 0xe8f4ff, intensity: 7.5, distance: 26, castShadow: false,
      decay: 1.5, flickerStrength: 0.01, distanceFlicker: 0.02,
      poolSize: 22, poolOpacity: 0.60, coronaSize: 3.0, coronaOpacity: 0.75,
    });

    // Sheriff — confident warm amber authority
    this.lanterns.registerLantern(36, 12, -36, {
      color: 0xffb84a, intensity: 7.8, distance: 26, castShadow: false,
      decay: 1.0, flickerStrength: 0.028, distanceFlicker: 0.04,
      poolSize: 22, poolOpacity: 0.65, coronaSize: 3.0, coronaOpacity: 0.78,
    });

    // Mafia Bunker — dim atmospheric candle, not a floodlight
    this.lanterns.registerLantern(0, 4.2, 48, {
      color: 0xff6600, intensity: 0.9, distance: 7, castShadow: false,
      decay: 2.5, flickerStrength: 0.09, distanceFlicker: 0.12,
      poolSize: 6, poolOpacity: 0.30, coronaSize: 1.2, coronaOpacity: 0.40,
    });

    // Individual house porch lanterns — warm amber, visible from path
    for (const [hx, hz] of [
      [34,16],[34,-8],[20,44],[44,10],
      [-34,16],[-34,-8],[-20,44],[-44,10],
    ]) {
      this.lanterns.registerLantern(hx, 8, hz+5, {
        color: 0xffb055, intensity: 5.0, distance: 18, castShadow: false,
        decay: 2.0, flickerStrength: 0.038, distanceFlicker: 0.04,
        poolSize: 18, poolOpacity: 0.65, coronaSize: 2.8, coronaOpacity: 0.72,
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LAMP POST POOL LIGHTS — Minecraft-style illumination on EVERY lantern post
  //
  // Root cause of previous failure: night ambient was 0.9 intensity, so
  // PointLights at 3.5 were invisible against the baseline (90% lit world).
  //
  // Fix:
  //   1. Night ambient drops to 0.06, hemisphere to 0.12 (see setNightLighting)
  //   2. Every lamp post gets its own PointLight (intensity 8, distance 16, decay 2)
  //   3. Additive ground-glow disc sprites visually show the "pool of warmth"
  //      even on geometry that isn't directly in the light cone
  //
  // castShadow=false on all: no 6× shadow-map cost → ~zero GPU overhead.
  // ═══════════════════════════════════════════════════════════════════════════
  // ═══════════════════════════════════════════════════════════════════════════
  // LAMP POST POOL LIGHTS — PERF-OPTIMIZED (84 → 19 PointLights)
  //
  // PROBLEM: Original placed 1 PointLight per post (~84 total). Three.js forward
  // renderer loops over EVERY light for EVERY fragment. 84 lights × full scene
  // geometry = the primary cause of 7fps.
  //
  // SOLUTION: 19 "zone" PointLights with larger radius cover the same areas.
  // Glow disc sprites (MeshBasicMaterial — zero lighting cost) stay on every
  // post for the "pool of amber warmth" visual. Night atmosphere is identical.
  // ═══════════════════════════════════════════════════════════════════════════
  _buildLampPostLights() {
    const LAMP_Y = 7.5;
    const AMBER  = 0xffaa33;
    const TEAL   = 0x33ddcc;
    const DECAY  = 2;
    const centerRingLamps = [[19,0],[-19,0],[0,19],[0,-19]];
    const graveyardSoulLamps = [
      [this.graveyardBase.x - 10, this.graveyardBase.z - 8],
      [this.graveyardBase.x + 10, this.graveyardBase.z - 8],
      [this.graveyardBase.x - 10, this.graveyardBase.z + 8],
      [this.graveyardBase.x + 10, this.graveyardBase.z + 8],
      [this.graveyardBase.x - 10, this.graveyardBase.z],
      [this.graveyardBase.x + 10, this.graveyardBase.z],
      [this.graveyardBase.x,      this.graveyardBase.z - 8],
      [this.graveyardBase.x,      this.graveyardBase.z + 8],
    ];

    const makeGlowTex = (hex) => {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const ctx = c.getContext('2d');
      const r = (hex >> 16) & 255;
      const g = (hex >> 8) & 255;
      const b = hex & 255;
      const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      grad.addColorStop(0.0, `rgba(${r},${g},${b},0.62)`);
      grad.addColorStop(0.22, `rgba(${r},${g},${b},0.34)`);
      grad.addColorStop(0.56, `rgba(${r},${g},${b},0.18)`);
      grad.addColorStop(1.0, `rgba(${r},${g},${b},0.0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 128, 128);
      return new THREE.CanvasTexture(c);
    };

    const texAmber = makeGlowTex(AMBER);
    const texTeal = makeGlowTex(TEAL);
    this._lampPostLights = [];
    this._glowDiscs = [];

    const addZoneLight = (x, z, options = {}) => {
      const {
        color = AMBER,
        // Minecraft lanterns: level-15 linear falloff → 14-block reach.
        // decay=1 (linear) instead of 2 (quadratic) mimics taxicab attenuation.
        // intensity tuned so the "pool" at ground level looks like MC village at night.
        intensity = 5.2,
        dist = 26.0,             // ~14-block Minecraft reach + slight extra for glow sprites
        y = color === TEAL ? LAMP_Y : 6.0,
      } = options;
      const light = new THREE.PointLight(color, 0, 0.01, 1); // decay=1 → linear like Minecraft
      light.position.set(x, y, z);
      light.castShadow = false;
      light.visible = false;
      this.scene.add(light);
      this._lampPostLights.push({ light, nightIntensity: intensity, nightDistance: dist });
    };

    const addDisc = (x, z, options = {}) => {
      const {
        color = AMBER,
        // Larger discs = the characteristic Minecraft "pool of warmth" visible from drone view.
        // Overlapping adjacent pools give a connected amber-path feel just like MC villages.
        size = color === TEAL ? 17 : 28.0,
        nightOpacity = color === TEAL ? 0.65 : 0.88,
      } = options;
      const mat = new THREE.MeshBasicMaterial({
        map: color === TEAL ? texTeal : texAmber,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0,
      });
      const disc = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(x, 3.04, z);
      disc.renderOrder = 1;
      disc.visible = false;
      this.scene.add(disc);
      this._glowDiscs.push({ disc, mat, nightOpacity });
    };

    for (const [lx, lz] of centerRingLamps) {
      addZoneLight(lx, lz, { color: AMBER, intensity: 5.6, dist: 26.0, y: 6.2 });
    }
    addZoneLight(0, -40, { color: AMBER, intensity: 5.2, dist: 25.0 });
    addZoneLight(0, 40, { color: AMBER, intensity: 5.2, dist: 25.0 });
    addZoneLight(-40, 0, { color: AMBER, intensity: 5.0, dist: 24.5 });
    addZoneLight(40, 0, { color: AMBER, intensity: 5.0, dist: 24.5 });
    addZoneLight(0, -62, { color: AMBER, intensity: 4.2, dist: 22.0 });
    addZoneLight(0, 62, { color: AMBER, intensity: 4.2, dist: 22.0 });
    addZoneLight(-62, 0, { color: AMBER, intensity: 4.0, dist: 21.5 });
    addZoneLight(62, 0, { color: AMBER, intensity: 4.0, dist: 21.5 });
    addZoneLight(-36, -34, { color: AMBER, intensity: 4.8, dist: 24.0 });
    addZoneLight(36, -34, { color: AMBER, intensity: 4.8, dist: 24.0 });
    addZoneLight(-28, 28, { color: AMBER, intensity: 4.2, dist: 22.5 });
    addZoneLight(28, 28, { color: AMBER, intensity: 4.2, dist: 22.5 });
    addZoneLight(0, 24, { color: AMBER, intensity: 4.5, dist: 23.0 });
    addZoneLight(0, 30, { color: AMBER, intensity: 4.3, dist: 21.5 });
    addZoneLight(0, 36, { color: AMBER, intensity: 4.8, dist: 22.5 });
    addZoneLight(this.graveyardBase.x, this.graveyardBase.z - 8, { color: TEAL, intensity: 3.8, dist: 19.5 });
    addZoneLight(this.graveyardBase.x - 10, this.graveyardBase.z, { color: TEAL, intensity: 3.4, dist: 18.5 });
    addZoneLight(this.graveyardBase.x + 10, this.graveyardBase.z, { color: TEAL, intensity: 3.4, dist: 18.5 });
    addZoneLight(this.graveyardBase.x, this.graveyardBase.z + 8, { color: TEAL, intensity: 3.2, dist: 18.0 });

    // ── Previously uncovered paths — had glow discs but no PointLight nearby ──
    // Rule: any lamp post >14 units from the nearest existing zone light gets
    // its own light. Lower intensity (4.0) keeps total scene light budget in check.

    // NW hospital path mid-section: [-24,-14] is ~25u from [-36,-34] — out of range
    addZoneLight(-24, -14, { color: AMBER, intensity: 4.0, dist: 20.0 });
    addZoneLight(-30, -20, { color: AMBER, intensity: 4.0, dist: 20.0 });
    // [-36,-26], [-40,-30], [-44,-34] are covered by the existing [-36,-34] light

    // NE sheriff path mid-section: same gap on the east side
    addZoneLight(24, -14, { color: AMBER, intensity: 4.0, dist: 20.0 });
    addZoneLight(30, -20, { color: AMBER, intensity: 4.0, dist: 20.0 });
    // [36,-26], [40,-30], [44,-34] covered by [36,-34]

    // SE graveyard diagonal: [14,14],[24,24],[32,32] — zero zone lights previously
    addZoneLight(14, 14, { color: AMBER, intensity: 4.0, dist: 20.0 });
    addZoneLight(24, 24, { color: AMBER, intensity: 4.0, dist: 20.0 });
    addZoneLight(32, 32, { color: AMBER, intensity: 3.8, dist: 19.0 });

    // SW market diagonal: [-16,16],[-26,26],[-32,32] — zero zone lights previously
    addZoneLight(-16, 16, { color: AMBER, intensity: 4.0, dist: 20.0 });
    addZoneLight(-26, 26, { color: AMBER, intensity: 4.0, dist: 20.0 });
    addZoneLight(-32, 32, { color: AMBER, intensity: 3.8, dist: 19.0 });

    // Amphitheater corners: [-8,-8],[8,-8],[-8,8],[8,8] — centerRingLamps at ±19 too far
    addZoneLight(-8, -8, { color: AMBER, intensity: 4.2, dist: 18.0, y: 6.0 });
    addZoneLight( 8, -8, { color: AMBER, intensity: 4.2, dist: 18.0, y: 6.0 });
    addZoneLight(-8,  8, { color: AMBER, intensity: 4.2, dist: 18.0, y: 6.0 });
    addZoneLight( 8,  8, { color: AMBER, intensity: 4.2, dist: 18.0, y: 6.0 });

    // Main N-S road extremes: ±52 and ±64 posts — zone lights at ±40 and ±62 leave
    // the ±52 rank uncovered (they sit exactly between two zone lights at ~22u each)
    addZoneLight(0, -52, { color: AMBER, intensity: 3.8, dist: 19.0 });
    addZoneLight(0,  52, { color: AMBER, intensity: 3.8, dist: 19.0 });
    addZoneLight(-52, 0, { color: AMBER, intensity: 3.8, dist: 19.0 });
    addZoneLight( 52, 0, { color: AMBER, intensity: 3.8, dist: 19.0 });

    for (const z of [-64,-52,-40,-28,-18,18,28,40,52,64]) { addDisc(3, z); addDisc(-3, z); }
    for (const x of [-64,-52,-40,-28,-18,18,28,40,52,64]) { addDisc(x, 3); addDisc(x, -3); }
    for (const [ax, az] of [[-8,-8],[8,-8],[-8,8],[8,8]]) addDisc(ax, az);
    for (const [lx, lz] of centerRingLamps) addDisc(lx, lz, { size: 24, nightOpacity: 0.68 });
    for (const [lx, lz] of [[-24,-14],[-30,-20],[-36,-26],[-40,-30],[-44,-34]]) addDisc(lx, lz);
    for (const [lx, lz] of [[24,-14],[30,-20],[36,-26],[40,-30],[44,-34]]) addDisc(lx, lz);
    for (const [lx, lz] of [[3,24],[-3,24],[3,36],[-3,36],[-6,30],[6,30]]) addDisc(lx, lz);
    for (const [lx, lz] of [[14,14],[24,24],[32,32]]) addDisc(lx, lz);
    for (const [lx, lz] of [[-16,16],[-26,26],[-32,32]]) addDisc(lx, lz);
    for (const [lx, lz] of graveyardSoulLamps) addDisc(lx, lz, { color: TEAL, size: 16, nightOpacity: 0.50 });

    // ── Warm cones REMOVED completely ──────────────────────────────────────────
    // The CylinderGeometry cones caused the "floating orange cylinder in the air"
    // artifact. Block illumination is now handled by the vertex-color baked light
    // system (addBakedLight calls in _addLights) + flat ground disc sprites only.
    this._warmCones = []; // empty — kept so update loops don't crash
    console.log(`[Village] PERF: ${this._lampPostLights.length} zone lights + ${this._glowDiscs.length} glow discs (cones removed)`);
  }

  _addPL(x, y, z, color, intensity, distance) {
    const l = new THREE.PointLight(color, 0, 0.01, 2);
    l.position.set(x, y, z);
    l.visible = false;
    this.scene.add(l);
    this._interiorPointLights.push({
      light: l,
      nightIntensity: intensity,
      nightDistance: distance,
    });
    return l;
  }

  _applyLanternNightAlpha(alpha) {
    const t = THREE.MathUtils.clamp(alpha, 0, 1);
    this._lanternState.alpha = t;
    const visualAlpha = this._lanternState.isNight ? t : 0;

    this.vw.setLanternNightAlpha(visualAlpha);
    this.lanterns?.setNightMode(this._lanternState.isNight);
    this.lanterns?.setNightAlpha(visualAlpha);

    for (const entry of this._interiorPointLights) {
      entry.light.visible = visualAlpha > 0.001;
      entry.light.intensity = entry.nightIntensity * visualAlpha;
      entry.light.distance = THREE.MathUtils.lerp(0.01, entry.nightDistance, visualAlpha);
    }

    for (const entry of this._lampPostLights) {
      entry.light.visible = visualAlpha > 0.001;
      entry.light.intensity = entry.nightIntensity * visualAlpha;
      entry.light.distance = THREE.MathUtils.lerp(0.01, entry.nightDistance, visualAlpha);
    }

    for (const { disc, mat, nightOpacity } of (this._glowDiscs || [])) {
      if (disc) disc.visible = visualAlpha > 0.001;
      mat.opacity = nightOpacity * visualAlpha;
    }

    // Warm block-spill cones — fade in with night
    for (const { mesh, mat, nightOpacity } of (this._warmCones || [])) {
      if (mesh) mesh.visible = visualAlpha > 0.001;
      mat.opacity = nightOpacity * visualAlpha;
    }

    // Window glow — house windows + porch lights + chimney flickers
    this.windowGlow?.setAlpha(visualAlpha);
  }

  _animateLanternNightAlpha(targetAlpha, options = {}) {
    const { onComplete = null } = options;
    const target = THREE.MathUtils.clamp(targetAlpha, 0, 1);
    this._lanternTween?.kill();

    if (Math.abs(target - this._lanternState.alpha) < 0.001) {
      this._applyLanternNightAlpha(target);
      onComplete?.();
      return;
    }

    // Defer by one rAF so sky + ambient tweens can start first.
    // This prevents all GSAP tweens + vertex-colour updates from firing
    // in the same millisecond, which caused the stutter after graveyard.
    requestAnimationFrame(() => {
      this._lanternTween = gsap.to(this._lanternState, {
        alpha: target,
        duration: 3.2,           // slightly tighter — lag felt longer than it was
        ease: 'power2.inOut',
        onUpdate: () => this._applyLanternNightAlpha(this._lanternState.alpha),
        onComplete: () => {
          this._lanternTween = null;
          this._applyLanternNightAlpha(target);
          onComplete?.();
        },
      });
    });
  }

  setDayLighting() {
    const DUR = 3.5;
    // Smoothly animate back to day — prevents jarring snap
    if (this._sunLight) {
      gsap.to(this._sunLight.color,  { r: 1.0, g: 0.96, b: 0.88, duration: DUR, ease: 'power2.inOut' });
      gsap.to(this._sunLight,        { intensity: 2.2,              duration: DUR, ease: 'power2.inOut' });
    }
    if (this._ambLight) {
      gsap.to(this._ambLight.color,  { r: 0.6, g: 0.6, b: 0.733, duration: DUR, ease: 'power2.inOut' });
      gsap.to(this._ambLight,        { intensity: 0.75,             duration: DUR, ease: 'power2.inOut' }); // match reduced base
    }
    if (this._hemiLight) {
      this._hemiLight.color?.set?.(0xb0ccff);
      this._hemiLight.groundColor?.set?.(0x223311);
      gsap.to(this._hemiLight, { intensity: 0.65, duration: DUR, ease: 'power2.inOut' }); // match reduced base
    }

    const finishNightShutdown = () => {
      this._lanternState.isNight = false;
      this.vw.setNightMode(false, { syncLanternAlpha: false });
      this.lanterns?.setNightMode(false);
      this.windowGlow?.clearNight();
      this._applyLanternNightAlpha(0);
      this._clearNightFills?.();
    };

    // Keep night visuals in "fade mode" until alpha reaches zero. Flipping the
    // whole lantern stack off immediately forces a full baked-colour update and
    // dozens of light visibility changes in a single frame, which causes the
    // dawn hitch most noticeably in spectator mode.
    this.vw.setNightMode(true, { syncLanternAlpha: false });
    this.lanterns?.setNightMode(true);
    this.windowGlow?.setNight(true);
    this._animateLanternNightAlpha(0, { onComplete: finishNightShutdown });
  }

  setNightLighting() {
    const DUR = 4.0;
    // Smoothly animate scene lights — eliminates the jarring snap after graveyard sequence
    if (this._sunLight) {
      gsap.to(this._sunLight.color,  { r: 0.2, g: 0.267, b: 0.4, duration: DUR, ease: 'power2.inOut' });
      gsap.to(this._sunLight,        { intensity: 0.38,             duration: DUR, ease: 'power2.inOut' });
    }
    // Ambient: low enough for lamp pools to pop, high enough to see village silhouettes
    if (this._ambLight) {
      gsap.to(this._ambLight.color,  { r: 0.078, g: 0.094, b: 0.165, duration: DUR, ease: 'power2.inOut' });
      gsap.to(this._ambLight,        { intensity: 0.22,               duration: DUR, ease: 'power2.inOut' });
    }
    // Hemisphere: cool moonlit sky above, dark earth below
    if (this._hemiLight) {
      this._hemiLight.groundColor?.set?.(0x1e2214);
      this._hemiLight.color?.set?.(0x0d1428);
      gsap.to(this._hemiLight, { intensity: 0.28, duration: DUR, ease: 'power2.inOut' });
    }
    this._lanternState.isNight = true;
    this.vw.setNightMode(true, { syncLanternAlpha: false });
    this.lanterns?.setNightMode(true);
    this.windowGlow?.setNight(true);
    this._applyLanternNightAlpha(this._lanternState.alpha);
    this._animateLanternNightAlpha(1);

    // ── Extra atmospheric fill lights — fires up village "alive" feeling ──
    // These are very low intensity and wide — they give the impression of
    // light bouncing off walls and ground, like Sildurs' indirect lighting
    if (!this._nightFills) {
      this._nightFills = [];
      const fills = [
        // Keep only cool night fills; broad warm fills were washing the map orange.
        { pos: [36, 5, -36],  color: 0x6f97c8, i: 1.0, d: 31 },
        { pos: [0, 25, 0],    color: 0x86a4cf, i: 0.42, d: 82 },
      ];
      for (const f of fills) {
        const pl = new THREE.PointLight(f.color, f.i, f.d);
        pl.position.set(...f.pos);
        this.scene.add(pl);
        this._nightFills.push(pl);
      }
    } else {
      for (const pl of this._nightFills) pl.visible = true;
    }
  }

  _clearNightFills() {
    if (this._nightFills) {
      for (const pl of this._nightFills) pl.visible = false;
    }
  }
}
