import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';

const BLOCK_TYPES = {
  AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, WOOD: 4,
  LEAVES: 5, COBBLE: 6, PLANKS: 7, GRAVEL: 8, SAND: 9, GLASS: 10, LAMP: 11,
  WHITE: 12, RED_WOOL: 13, DARK: 14, NETHER: 15, WOOL: 16, IRON: 17,
  WOOD_DARK: 18, BLUE_GLASS: 19, RED_LAMP: 20, BRICK: 21, CARPET: 22, OAK_LOG: 23,
  LANTERN: 24, STONE_BRICK: 25, MOSSY: 26, TERRACOTTA: 27, CYAN_GLASS: 28, GOLD_BLOCK: 29,
  FLOWER: 30, DEAD_BUSH: 31, SOUL_LANTERN: 32, FENCE: 33, HAY: 34,
  BARREL: 35, BOOKSHELF: 36, OBSIDIAN: 37, BLUE_WOOL: 38, YELLOW_WOOL: 39,
  CLAY: 40, PURPLE_GLASS: 41, IRON_BAR: 42, SNOW: 43, SANDSTONE: 44,
};

const BLOCK_COLORS = {
  1: 0x3d6b22, 2: 0x7a5230, 3: 0x6e6e66, 4: 0x9e6d3a, 5: 0x2d6e28,
  6: 0x5a5a58, 7: 0xb87040, 8: 0x7d7060, 9: 0xE8D890, 10: 0xaaccff,
  11: 0xffcc44, 12: 0xdde8ec, 13: 0xcc1111, 14: 0x2a2a2a, 15: 0x1a0808,
  16: 0xe8e8e0, 17: 0x909090, 18: 0x1e1208, 19: 0x4499ee, 20: 0xcc2200,
  21: 0xb87040, 22: 0xaac8cc, 23: 0x2e1a00, 24: 0xffcc44, 25: 0x2a2420,
  26: 0x1a2a10, 27: 0xc87040, 28: 0x44bbcc, 29: 0x8a5c00,
  30: 0xee2244, 31: 0x5a4020, 32: 0x22ddcc, 33: 0x4a3010, 34: 0xd4a832,
  35: 0x6b4422, 36: 0x8B6030, 37: 0x1a0a2e, 38: 0x2244cc, 39: 0xeedd22,
  40: 0xaab8c8, 41: 0x8833aa, 42: 0xaaaaaa, 43: 0xf0f4f8, 44: 0xd4c080,
};

const TRANSPARENT_TYPES = new Set([10, 11, 19, 20, 24, 29, 30, 31, 32, 41, 42]);

const WORLD_SIZE   = 128;
const WORLD_HEIGHT = 20;
const OFFSET_XZ    = 64;

// Chunk system — 16x16 block columns, 8x8 = 64 chunks total
// Each chunk frustum-culls independently (Minecraft/Sodium technique)
const CHUNK_SIZE = 16;
const NUM_CHUNKS = WORLD_SIZE / CHUNK_SIZE; // 8

const FACE_COLOR_OVERRIDES = {
  1:  { 2: 0x5dc418 },
  23: { 2: 0x180d00, 3: 0x180d00 },
  34: { 2: 0xe8c83a, 3: 0x9a7020 },
  36: { 2: 0x7a4a18, 3: 0x7a4a18 },
};

const BAKED_GROUP_CLAMPS = {
  warm: [0.14, 0.10, 0.06],
  cool: [0.08, 0.14, 0.14],
  red:  [0.10, 0.035, 0.02],
};

export class VoxelWorld {
  constructor(scene) {
    this.scene   = scene;
    this.noise2D = createNoise2D();
    this.data    = new Uint8Array(WORLD_SIZE * WORLD_HEIGHT * WORLD_SIZE);
    this._builtMeshes = [];
    this._chunks      = []; // [{ meshes: Mesh[], box: Box3 }]
    this.matEmit          = null;
    this._emissivePropMats = [];
    this._isNight          = false;
    this._lanternNightAlpha = 0;
    this._bakedColorMeshes = [];

    // Baked-light registry (Minecraft technique: static lights baked into vertex colors)
    // Register lights here BEFORE calling buildMesh(). Each lamp post, lantern, and
    // building light gets an entry. The mesh builder samples them per-block and adds
    // a warm tint to vertex colors, completely replacing those PointLights.
    this._manualBakedLights = [];
    this._bakedLights = [];

    // Frustum helpers (pre-allocated, no per-frame GC)
    this._frustum          = new THREE.Frustum();
    this._projScreenMatrix = new THREE.Matrix4();
  }

  // Register a static light source for vertex-color baking.
  // Call from Village._buildLampPosts() and _addLights() BEFORE buildMesh().
  addBakedLight(wx, wy, wz, hexColor, intensity, radius, options = {}) {
    const c = new THREE.Color(hexColor);
    this._manualBakedLights.push({
      x: wx, y: wy, z: wz,
      r: c.r, g: c.g, b: c.b,
      intensity, radius,
      mode: options.mode || 'additive',
      combineGroup: options.combineGroup || null,
      dayScale: options.dayScale ?? 1.0,
      nightScale: options.nightScale ?? 1.0,
    });
  }

  _getEffectiveLanternAlpha(alpha = this._lanternNightAlpha) {
    return this._isNight ? THREE.MathUtils.clamp(alpha, 0, 1) : 0;
  }

  // Legacy sampler kept only for reference; the grouped sampler below is active.
  _sampleBakedLightLegacy(wx, wy, wz) {
    let lr = 0, lg = 0, lb = 0;
    let mr = 0, mg = 0, mb = 0;
    for (const L of this._bakedLights) {
      if (L.mode === 'minecraft') {
        // Approximate Minecraft block light: taxicab-distance falloff plus
        // max-combine behavior so overlapping lanterns stay local instead of
        // accumulating into a map-wide orange wash.
        const dist = Math.abs(wx - L.x) + Math.abs(wy - L.y) + Math.abs(wz - L.z);
        if (dist >= L.radius) continue;
        const strength = (1.0 - dist / L.radius) * L.intensity;
        mr = Math.max(mr, L.r * strength);
        mg = Math.max(mg, L.g * strength);
        mb = Math.max(mb, L.b * strength);
        continue;
      }

      const dx = wx - L.x;
      const dy = (wy - L.y) * 0.55; // compress vertical — light fans out more than it rises
      const dz = wz - L.z;
      const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
      if (dist >= L.radius) continue;
      const t = 1.0 - dist / L.radius;
      const strength = t * t * L.intensity; // quadratic falloff = PointLight decay:2
      lr += L.r * strength;
      lg += L.g * strength;
      lb += L.b * strength;
    }
    return [lr + mr, lg + mg, lb + mb];
  }

  setNightModeLegacy(isNight) {
    this._isNight = isNight;
    if (this.matEmit) {
      this.matEmit.emissiveIntensity = isNight ? 1.4 : 0.04;
    }
    for (const mat of this._emissivePropMats) {
      mat.emissiveIntensity = isNight ? 2.2 : 0.02;
    }
  }

  _sampleBakedLight(wx, wy, wz) {
    let staticR = 0, staticG = 0, staticB = 0;
    let lanternR = 0, lanternG = 0, lanternB = 0;
    let warmStaticR = 0, warmStaticG = 0, warmStaticB = 0;
    let warmLanternR = 0, warmLanternG = 0, warmLanternB = 0;
    let coolStaticR = 0, coolStaticG = 0, coolStaticB = 0;
    let coolLanternR = 0, coolLanternG = 0, coolLanternB = 0;
    let redStaticR = 0, redStaticG = 0, redStaticB = 0;
    let redLanternR = 0, redLanternG = 0, redLanternB = 0;

    for (const L of this._bakedLights) {
      const staticScale = Math.max(0, Math.min(L.dayScale ?? 1.0, L.nightScale ?? 1.0));
      const lanternScale = Math.max(0, (L.nightScale ?? 1.0) - staticScale);

      if (L.mode === 'minecraft') {
        const dist = Math.abs(wx - L.x) + Math.abs(wy - L.y) + Math.abs(wz - L.z);
        if (dist >= L.radius) continue;
        const strength = (1.0 - dist / L.radius) * L.intensity;
        const sr = L.r * strength * staticScale;
        const sg = L.g * strength * staticScale;
        const sb = L.b * strength * staticScale;
        const lr = L.r * strength * lanternScale;
        const lg = L.g * strength * lanternScale;
        const lb = L.b * strength * lanternScale;

        switch (L.combineGroup) {
          case 'cool':
            coolStaticR = Math.max(coolStaticR, sr);
            coolStaticG = Math.max(coolStaticG, sg);
            coolStaticB = Math.max(coolStaticB, sb);
            coolLanternR = Math.max(coolLanternR, lr);
            coolLanternG = Math.max(coolLanternG, lg);
            coolLanternB = Math.max(coolLanternB, lb);
            break;
          case 'red':
            redStaticR = Math.max(redStaticR, sr);
            redStaticG = Math.max(redStaticG, sg);
            redStaticB = Math.max(redStaticB, sb);
            redLanternR = Math.max(redLanternR, lr);
            redLanternG = Math.max(redLanternG, lg);
            redLanternB = Math.max(redLanternB, lb);
            break;
          default:
            warmStaticR = Math.max(warmStaticR, sr);
            warmStaticG = Math.max(warmStaticG, sg);
            warmStaticB = Math.max(warmStaticB, sb);
            warmLanternR = Math.max(warmLanternR, lr);
            warmLanternG = Math.max(warmLanternG, lg);
            warmLanternB = Math.max(warmLanternB, lb);
            break;
        }
        continue;
      }

      const dx = wx - L.x;
      const dy = (wy - L.y) * 0.55;
      const dz = wz - L.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist >= L.radius) continue;
      const t = 1.0 - dist / L.radius;
      const strength = t * t * L.intensity;
      staticR += L.r * strength * staticScale;
      staticG += L.g * strength * staticScale;
      staticB += L.b * strength * staticScale;
      lanternR += L.r * strength * lanternScale;
      lanternG += L.g * strength * lanternScale;
      lanternB += L.b * strength * lanternScale;
    }

    const clampGroup = (cap, sr, sg, sb, lr, lg, lb) => {
      const csR = Math.min(cap[0], sr);
      const csG = Math.min(cap[1], sg);
      const csB = Math.min(cap[2], sb);
      return [
        csR,
        csG,
        csB,
        Math.min(Math.max(0, cap[0] - csR), lr),
        Math.min(Math.max(0, cap[1] - csG), lg),
        Math.min(Math.max(0, cap[2] - csB), lb),
      ];
    };

    const warm = clampGroup(
      BAKED_GROUP_CLAMPS.warm,
      warmStaticR, warmStaticG, warmStaticB,
      warmLanternR, warmLanternG, warmLanternB,
    );
    const cool = clampGroup(
      BAKED_GROUP_CLAMPS.cool,
      coolStaticR, coolStaticG, coolStaticB,
      coolLanternR, coolLanternG, coolLanternB,
    );
    const red = clampGroup(
      BAKED_GROUP_CLAMPS.red,
      redStaticR, redStaticG, redStaticB,
      redLanternR, redLanternG, redLanternB,
    );

    return [
      staticR + warm[0] + cool[0] + red[0],
      staticG + warm[1] + cool[1] + red[1],
      staticB + warm[2] + cool[2] + red[2],
      lanternR + warm[3] + cool[3] + red[3],
      lanternG + warm[4] + cool[4] + red[4],
      lanternB + warm[5] + cool[5] + red[5],
    ];
  }

  _applyLanternVisualAlpha(alpha) {
    const visualAlpha = this._getEffectiveLanternAlpha(alpha);
    if (this.matEmit) {
      this.matEmit.emissiveIntensity = THREE.MathUtils.lerp(0.0, 1.55, visualAlpha);
    }
    for (const mat of this._emissivePropMats) {
      mat.emissiveIntensity = THREE.MathUtils.lerp(0.0, 1.35, visualAlpha);
    }

    // ── Vertex-colour throttle ──────────────────────────────────────────────
    // Updating ALL baked-colour mesh vertex buffers every frame is the primary
    // cause of the stutter when transitioning day→night. The human eye cannot
    // perceive individual frames in a smooth 3.5 s tween, so we skip 3 out of
    // every 4 calls during animation. At the START and END (alpha 0 or 1) we
    // always run the full update so the final colours are pixel-perfect.
    const atEdge = (visualAlpha < 0.005 || visualAlpha > 0.995);
    this._vcThrottle = ((this._vcThrottle || 0) + 1) % 4;
    if (!atEdge && this._vcThrottle !== 0) return;

    for (const entry of this._bakedColorMeshes) {
      const { attr, base, staticLight, lanternLight } = entry;
      const colors = attr.array;
      for (let i = 0; i < colors.length; i++) {
        colors[i] = Math.min(1, base[i] + staticLight[i] + lanternLight[i] * visualAlpha);
      }
      attr.needsUpdate = true;
    }
  }

  setLanternNightAlpha(alpha) {
    this._lanternNightAlpha = THREE.MathUtils.clamp(alpha, 0, 1);
    this._applyLanternVisualAlpha(this._lanternNightAlpha);
  }

  setNightMode(isNight, options = {}) {
    this._isNight = !!isNight;
    if (options.syncLanternAlpha === false) {
      this._applyLanternVisualAlpha(this._lanternNightAlpha);
      return;
    }
    this.setLanternNightAlpha(isNight ? 1 : 0);
  }

  _idx(x, y, z) {
    const px = x + OFFSET_XZ, pz = z + OFFSET_XZ;
    if (px < 0 || px >= WORLD_SIZE || y < 0 || y >= WORLD_HEIGHT || pz < 0 || pz >= WORLD_SIZE) return -1;
    return px * WORLD_HEIGHT * WORLD_SIZE + y * WORLD_SIZE + pz;
  }

  setVoxel(x, y, z, type) { const i = this._idx(x, y, z); if (i >= 0) this.data[i] = type; }
  getVoxel(x, y, z)       { const i = this._idx(x, y, z); return i >= 0 ? this.data[i] : 0; }

  buildMesh() {
    // Dispose existing
    for (const m of this._builtMeshes) {
      this.scene.remove(m);
      m.geometry.dispose();
      (Array.isArray(m.material) ? m.material : [m.material]).forEach(mt => mt.dispose());
    }
    this._builtMeshes = [];
    this._chunks = [];
    this._emissivePropMats = [];
    this._bakedColorMeshes = [];
    this._bakedLights = this._manualBakedLights.map(light => ({ ...light }));

    const hasNearbyManualBakedLight = (x, y, z, combineGroup, maxXZ = 1.25, maxY = 3.5) => (
      this._manualBakedLights.some((light) => {
        if ((light.combineGroup || 'warm') !== combineGroup) return false;
        return (
          Math.abs(light.x - x) <= maxXZ &&
          Math.abs(light.z - z) <= maxXZ &&
          Math.abs(light.y - y) <= maxY
        );
      })
    );

    const PROP_TYPES     = new Set([30, 31, 32, 33, 34, 35, 36, 42, 43, 24]);
    const EMISSIVE_TYPES = new Set([11, 20, 24, 32]);

    const FACE_NORMALS = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
    const FACE_VERTS = [
      [[0.5,-0.5,-0.5],[0.5, 0.5,-0.5],[0.5, 0.5, 0.5],[0.5,-0.5, 0.5]],
      [[-0.5,-0.5, 0.5],[-0.5, 0.5, 0.5],[-0.5, 0.5,-0.5],[-0.5,-0.5,-0.5]],
      [[-0.5, 0.5, 0.5],[ 0.5, 0.5, 0.5],[ 0.5, 0.5,-0.5],[-0.5, 0.5,-0.5]],
      [[-0.5,-0.5,-0.5],[ 0.5,-0.5,-0.5],[ 0.5,-0.5, 0.5],[-0.5,-0.5, 0.5]],
      [[ 0.5,-0.5, 0.5],[ 0.5, 0.5, 0.5],[-0.5, 0.5, 0.5],[-0.5,-0.5, 0.5]],
      [[-0.5,-0.5,-0.5],[-0.5, 0.5,-0.5],[ 0.5, 0.5,-0.5],[ 0.5,-0.5,-0.5]],
    ];
    const QUAD_IDX  = [0,1,2, 0,2,3];
    // Flipped quad — used when AO anisotropy requires it (see Mikola Lysenko's AO article)
    const QUAD_IDX_FLIP = [0,1,3, 1,2,3];
    const NEIGHBOUR = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];

    // ── Vertex Ambient Occlusion (Minecraft "smooth lighting") ───────────────
    // For each face (6) × vertex (4): the 3 neighbor block offsets to sample.
    // [side1, side2, corner] — solid neighbours cast shadow on the vertex.
    // Derived from the face normal + the two tangent directions at each corner.
    // Reference: https://0fps.net/2013/07/03/ambient-occlusion-for-minecraft-like-worlds/
    const AO_NEIGHBORS = [
      // Face 0 (+X): verts (vy,vz) = (-,-), (+,-), (+,+), (-,+)
      [[[1,-1,0],[1,0,-1],[1,-1,-1]], [[1,+1,0],[1,0,-1],[1,+1,-1]], [[1,+1,0],[1,0,+1],[1,+1,+1]], [[1,-1,0],[1,0,+1],[1,-1,+1]]],
      // Face 1 (-X): verts (vy,vz) = (-,+), (+,+), (+,-), (-,-)
      [[[-1,-1,0],[-1,0,+1],[-1,-1,+1]], [[-1,+1,0],[-1,0,+1],[-1,+1,+1]], [[-1,+1,0],[-1,0,-1],[-1,+1,-1]], [[-1,-1,0],[-1,0,-1],[-1,-1,-1]]],
      // Face 2 (+Y): verts (vx,vz) = (-,+), (+,+), (+,-), (-,-)
      [[[-1,1,0],[0,1,+1],[-1,1,+1]], [[+1,1,0],[0,1,+1],[+1,1,+1]], [[+1,1,0],[0,1,-1],[+1,1,-1]], [[-1,1,0],[0,1,-1],[-1,1,-1]]],
      // Face 3 (-Y): verts (vx,vz) = (-,-), (+,-), (+,+), (-,+)
      [[[-1,-1,0],[0,-1,-1],[-1,-1,-1]], [[+1,-1,0],[0,-1,-1],[+1,-1,-1]], [[+1,-1,0],[0,-1,+1],[+1,-1,+1]], [[-1,-1,0],[0,-1,+1],[-1,-1,+1]]],
      // Face 4 (+Z): verts (vx,vy) = (+,-), (+,+), (-,+), (-,-)
      [[[+1,0,1],[0,-1,1],[+1,-1,1]], [[+1,0,1],[0,+1,1],[+1,+1,1]], [[-1,0,1],[0,+1,1],[-1,+1,1]], [[-1,0,1],[0,-1,1],[-1,-1,1]]],
      // Face 5 (-Z): verts (vx,vy) = (-,-), (-,+), (+,+), (+,-)
      [[[-1,0,-1],[0,-1,-1],[-1,-1,-1]], [[-1,0,-1],[0,+1,-1],[-1,+1,-1]], [[+1,0,-1],[0,+1,-1],[+1,+1,-1]], [[+1,0,-1],[0,-1,-1],[+1,-1,-1]]],
    ];
    // ao value 0-3 → brightness multiplier. 0 = fully cornered/dark, 3 = open/full bright.
    // Tuned for the game's palette: even ao=0 keeps some colour visible (not pitch black).
    const AO_CURVE = [0.50, 0.68, 0.84, 1.0];

    const colorCache = new Map();
    const getLinearColor = (hex) => {
      if (colorCache.has(hex)) return colorCache.get(hex);
      const c = new THREE.Color(hex);
      colorCache.set(hex, [c.r, c.g, c.b]);
      return [c.r, c.g, c.b];
    };

    // Shared materials — ONE instance per type for ALL 64 chunks.
    // Three.js compiles 1 shader per (material instance), so re-using = 3 shaders total,
    // same as the original single-mesh approach.
    const matOpaque = new THREE.MeshLambertMaterial({ vertexColors: true });
    const matTrans  = new THREE.MeshLambertMaterial({
      vertexColors: true, transparent: true, opacity: 0.45, depthWrite: false,
    });
    const matEmit = new THREE.MeshLambertMaterial({
      vertexColors: true,
      emissiveIntensity: THREE.MathUtils.lerp(0.0, 1.55, this._getEffectiveLanternAlpha()),
      emissive: new THREE.Color(1, 1, 1),
    });
    this.matEmit = matEmit;

    // Collect props globally (sparse — not worth chunking)
    const propsByType = new Map();
    const stride = WORLD_HEIGHT * WORLD_SIZE;
    for (let px = 0; px < WORLD_SIZE; px++) {
      for (let y = 0; y < WORLD_HEIGHT; y++) {
        const base = px * stride + y * WORLD_SIZE;
        for (let pz = 0; pz < WORLD_SIZE; pz++) {
          const type = this.data[base + pz];
          if (!type || !PROP_TYPES.has(type)) continue;
          if (!propsByType.has(type)) propsByType.set(type, []);
          propsByType.get(type).push(px - OFFSET_XZ, y, pz - OFFSET_XZ);
        }
      }
    }

    // ── AUTO-BAKE LANTERN LIGHTING ─────────────────────────────────────────────
    // Scan all LANTERN (24) and SOUL_LANTERN (32) voxels and register each as a
    // baked light source. This gives every placed lantern block a warm/teal radius
    // that tints nearby block faces — exactly the Minecraft lantern glow effect.
    // Done here (after addBakedLight calls from Village) so we can deduplicate.
    const LANTERN_ID    = 24;  // warm amber lantern
    const SOUL_LAN_ID  = 32;  // cool teal soul lantern
    const RED_LAMP_ID  = 20;  // red nether lamp
    for (let px = 0; px < WORLD_SIZE; px++) {
      for (let y = 0; y < WORLD_HEIGHT; y++) {
        const base = px * WORLD_HEIGHT * WORLD_SIZE + y * WORLD_SIZE;
        for (let pz = 0; pz < WORLD_SIZE; pz++) {
          const type = this.data[base + pz];
          const wx = px - OFFSET_XZ, wz = pz - OFFSET_XZ;
          if (type === LANTERN_ID) {
            this._bakedLights.push({
              x: wx + 0.5, y: y + 0.5, z: wz + 0.5,
              r: 1.0, g: 0.68, b: 0.26,
              intensity: 0.07, radius: 4,
              mode: 'minecraft',
              combineGroup: 'warm',
              dayScale: 0,
              nightScale: 1.0,
            });
            if (y >= 5 && !hasNearbyManualBakedLight(wx + 0.5, y + 0.5, wz + 0.5, 'warm')) {
              this._bakedLights.push({
                x: wx + 0.5, y: Math.max(2.75, y - 2.25), z: wz + 0.5,
                r: 1.0, g: 0.68, b: 0.26,
                intensity: 0.05, radius: 5,
                mode: 'minecraft',
                combineGroup: 'warm',
                dayScale: 0,
                nightScale: 0.9,
              });
            }
          } else if (type === SOUL_LAN_ID) {
            this._bakedLights.push({
              x: wx + 0.5, y: y + 0.5, z: wz + 0.5,
              r: 0.18, g: 0.82, b: 0.72,
              intensity: 0.08, radius: 4,
              mode: 'minecraft',
              combineGroup: 'cool',
              dayScale: 0,
              nightScale: 0.9,
            });
            if (y >= 5 && !hasNearbyManualBakedLight(wx + 0.5, y + 0.5, wz + 0.5, 'cool')) {
              this._bakedLights.push({
                x: wx + 0.5, y: Math.max(2.75, y - 2.25), z: wz + 0.5,
                r: 0.18, g: 0.82, b: 0.72,
                intensity: 0.055, radius: 5,
                mode: 'minecraft',
                combineGroup: 'cool',
                dayScale: 0,
                nightScale: 0.82,
              });
            }
          } else if (type === RED_LAMP_ID) {
            this._bakedLights.push({
              x: wx + 0.5, y: y + 0.5, z: wz + 0.5,
              r: 1.0, g: 0.18, b: 0.0,
              intensity: 0.06, radius: 3,
              mode: 'minecraft',
              combineGroup: 'red',
              dayScale: 0,
              nightScale: 0.85,
            });
          }
        }
      }
    }
    console.log(`[VoxelWorld] Auto-baked ${this._bakedLights.length} lights from lantern/lamp voxels`);

    // Per-chunk terrain geometry
    for (let cx = 0; cx < NUM_CHUNKS; cx++) {
      for (let cz = 0; cz < NUM_CHUNKS; cz++) {
        const pxStart = cx * CHUNK_SIZE;
        const pzStart = cz * CHUNK_SIZE;
        const pxEnd   = pxStart + CHUNK_SIZE;
        const pzEnd   = pzStart + CHUNK_SIZE;

        const groups = {
          opaque:      { pos: [], col: [], nor: [], idx: [], base: [], staticLight: [], lanternLight: [], vtxCount: 0, hasLanternLight: false },
          transparent: { pos: [], col: [], nor: [], idx: [], base: [], staticLight: [], lanternLight: [], vtxCount: 0, hasLanternLight: false },
          emissive:    { pos: [], col: [], nor: [], idx: [], base: [], staticLight: [], lanternLight: [], vtxCount: 0, hasLanternLight: false },
        };

        for (let px = pxStart; px < pxEnd; px++) {
          for (let y = 0; y < WORLD_HEIGHT; y++) {
            const base = px * stride + y * WORLD_SIZE;
            for (let pz = pzStart; pz < pzEnd; pz++) {
              const type = this.data[base + pz];
              if (!type || PROP_TYPES.has(type)) continue;

              const wx = px - OFFSET_XZ;
              const wz = pz - OFFSET_XZ;

              const isTrans    = TRANSPARENT_TYPES.has(type);
              const isEmissive = EMISSIVE_TYPES.has(type);
              const baseHex    = BLOCK_COLORS[type] ?? 0x888888;
              const faceOverride = FACE_COLOR_OVERRIDES[type] || null;
              const grp = isEmissive ? groups.emissive : isTrans ? groups.transparent : groups.opaque;

              for (let f = 0; f < 6; f++) {
                const [nx, ny, nz] = NEIGHBOUR[f];
                const nbType = this.getVoxel(wx + nx, y + ny, wz + nz);
                const nbIsSolid = nbType !== 0 && !TRANSPARENT_TYPES.has(nbType) && !PROP_TYPES.has(nbType);
                if (nbIsSolid) continue;

                const faceHex = (faceOverride && faceOverride[f] !== undefined) ? faceOverride[f] : baseHex;
                let [cr, cg, cb] = getLinearColor(faceHex);

                // Procedural texture effects (unchanged)
                if (type === 1 && f === 2) {
                  const n = this.noise2D(wx * 0.5 + 7.3, wz * 0.5 + 11.9) * 0.09;
                  cr = Math.min(1, Math.max(0, cr + n));
                  cg = Math.min(1, Math.max(0, cg + n * 1.2));
                  cb = Math.min(1, Math.max(0, cb + n * 0.5));
                }
                if ((type === 4 || type === 18 || type === 7) && f !== 2 && f !== 3) {
                  const g = Math.sin(wx * 0.28 + wz * 0.11) * 0.03 + Math.sin(wz * 0.35 + wx * 0.08) * 0.018;
                  cr = Math.min(1, Math.max(0, cr + g));
                  cg = Math.min(1, Math.max(0, cg + g * 0.88));
                  cb = Math.min(1, Math.max(0, cb + g * 0.65));
                }
                if (type === 17 && f === 2) {
                  cr = Math.min(1, cr * 1.18); cg = Math.min(1, cg * 1.18); cb = Math.min(1, cb * 1.22);
                }

                const [fn0, fn1, fn2] = FACE_NORMALS[f];
                const baseIdx = grp.vtxCount;
                const [blr, blg, blb, llr, llg, llb] = isEmissive
                  ? [0, 0, 0, 0, 0, 0]
                  : this._sampleBakedLight(
                      wx + 0.5 + fn0 * 0.42,
                      y + 0.5 + fn1 * 0.42,
                      wz + 0.5 + fn2 * 0.42,
                    );

                // ── Vertex Ambient Occlusion (Minecraft smooth-lighting technique) ───
                // For opaque faces only — emissive/transparent blocks skip AO so
                // lanterns and glass remain uniformly bright.
                const aoNbrs = AO_NEIGHBORS[f];
                const aoVals = [0, 0, 0, 0]; // ao level 0-3 per corner
                let needFlip = false;
                if (!isEmissive && !isTrans) {
                  for (let vi = 0; vi < 4; vi++) {
                    const [[s1x,s1y,s1z],[s2x,s2y,s2z],[ccx,ccy,ccz]] = aoNbrs[vi];
                    const s1 = (this.getVoxel(wx+s1x,y+s1y,wz+s1z) !== 0 && !TRANSPARENT_TYPES.has(this.getVoxel(wx+s1x,y+s1y,wz+s1z))) ? 1 : 0;
                    const s2 = (this.getVoxel(wx+s2x,y+s2y,wz+s2z) !== 0 && !TRANSPARENT_TYPES.has(this.getVoxel(wx+s2x,y+s2y,wz+s2z))) ? 1 : 0;
                    const cc = (this.getVoxel(wx+ccx,y+ccy,wz+ccz) !== 0 && !TRANSPARENT_TYPES.has(this.getVoxel(wx+ccx,y+ccy,wz+ccz))) ? 1 : 0;
                    aoVals[vi] = (s1 && s2) ? 0 : 3 - s1 - s2 - cc;
                  }
                  // AO anisotropy fix: choose the quad diagonal that minimises banding.
                  // If the two unused-diagonal sums differ, flip winding so the darker
                  // crease falls on the shorter diagonal — eliminates the "cross" artefact.
                  needFlip = (aoVals[0] + aoVals[2]) < (aoVals[1] + aoVals[3]);
                }

                for (let vi = 0; vi < 4; vi++) {
                  const [vx, vy, vz] = FACE_VERTS[f][vi];
                  const ao = AO_CURVE[isEmissive || isTrans ? 3 : aoVals[vi]];
                  const baseR = cr * ao;
                  const baseG = cg * ao;
                  const baseB = cb * ao;
                  grp.col.push(
                    Math.min(1.0, baseR + blr + llr * this._getEffectiveLanternAlpha()),
                    Math.min(1.0, baseG + blg + llg * this._getEffectiveLanternAlpha()),
                    Math.min(1.0, baseB + blb + llb * this._getEffectiveLanternAlpha()),
                  );
                  grp.base.push(baseR, baseG, baseB);
                  grp.staticLight.push(blr, blg, blb);
                  grp.lanternLight.push(llr, llg, llb);
                  grp.hasLanternLight ||= llr > 0 || llg > 0 || llb > 0;
                  grp.pos.push(wx + 0.5 + vx, y + 0.5 + vy, wz + 0.5 + vz);
                  grp.nor.push(fn0, fn1, fn2);
                }
                grp.vtxCount += 4;
                const qIdx = needFlip ? QUAD_IDX_FLIP : QUAD_IDX;
                for (const qi of qIdx) grp.idx.push(baseIdx + qi);
              }
            }
          }
        }

        const wxMin = pxStart - OFFSET_XZ;
        const wzMin = pzStart - OFFSET_XZ;
        const chunkMeshes = [];

        const buildGroupMesh = (grp, mat, castShadow, receiveShadow) => {
          if (grp.idx.length === 0) return;
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.Float32BufferAttribute(grp.pos, 3));
          const colorAttr = new THREE.Float32BufferAttribute(grp.col, 3);
          geo.setAttribute('color', colorAttr);
          geo.setAttribute('normal',   new THREE.Float32BufferAttribute(grp.nor, 3));
          geo.setIndex(grp.idx);
          geo.computeBoundingSphere();
          const mesh = new THREE.Mesh(geo, mat);
          mesh.castShadow    = castShadow;
          mesh.receiveShadow = receiveShadow;
          mesh.matrixAutoUpdate = false;
          if (grp.hasLanternLight) {
            this._bakedColorMeshes.push({
              attr: colorAttr,
              base: Float32Array.from(grp.base),
              staticLight: Float32Array.from(grp.staticLight),
              lanternLight: Float32Array.from(grp.lanternLight),
            });
          }
          this.scene.add(mesh);
          this._builtMeshes.push(mesh);
          chunkMeshes.push(mesh);
        };

        buildGroupMesh(groups.opaque,     matOpaque, true,  true);
        buildGroupMesh(groups.transparent, matTrans,  false, false);
        buildGroupMesh(groups.emissive,    matEmit,   false, false);

        const box = new THREE.Box3(
          new THREE.Vector3(wxMin,              0,           wzMin),
          new THREE.Vector3(wxMin + CHUNK_SIZE, WORLD_HEIGHT, wzMin + CHUNK_SIZE),
        );
        this._chunks.push({ meshes: chunkMeshes, box });
      }
    }

    // Props — global InstancedMesh (sparse, already efficient)
    const yShift = { 30:-0.15, 31:-0.25, 32:0.0, 33:0.0, 34:-0.175, 35:-0.125, 43:0.375, 24:-0.25 };
    const PROP_GEO = {
      30: new THREE.BoxGeometry(0.15, 0.7, 0.7),
      31: new THREE.BoxGeometry(0.12, 0.5, 0.6),
      32: new THREE.BoxGeometry(0.5, 0.55, 0.5),
      33: new THREE.BoxGeometry(0.18, 1.0, 0.18),
      34: new THREE.BoxGeometry(0.95, 0.65, 0.75),
      35: new THREE.BoxGeometry(0.7, 0.75, 0.7),
      36: new THREE.BoxGeometry(0.92, 0.92, 0.92),
      42: new THREE.BoxGeometry(0.1, 1.0, 0.1),
      43: new THREE.BoxGeometry(1, 0.25, 1),
      24: new THREE.BoxGeometry(0.45, 0.5, 0.45),
    };
    const dummy = new THREE.Object3D();

    for (const [type, flat] of propsByType) {
      const count   = flat.length / 3;
      const isTrans = TRANSPARENT_TYPES.has(type);
      const isEmit  = EMISSIVE_TYPES.has(type);
      const geo     = PROP_GEO[type] || new THREE.BoxGeometry(1, 1, 1);
      const mat     = new THREE.MeshLambertMaterial({
        color:      BLOCK_COLORS[type] ?? 0xffffff,
        transparent: isTrans,
        opacity:    (type === 10 || type === 19 || type === 28 || type === 41) ? 0.45 : (type === 32) ? 0.85 : 1.0,
        depthWrite: !isTrans,
        emissive:   isEmit ? new THREE.Color(BLOCK_COLORS[type] ?? 0).multiplyScalar(0.4) : new THREE.Color(0),
        emissiveIntensity: isEmit ? THREE.MathUtils.lerp(0.0, 1.35, this._getEffectiveLanternAlpha()) : 1.0,
      });
      if (isEmit) this._emissivePropMats.push(mat);
      const mesh = new THREE.InstancedMesh(geo, mat, count);
      mesh.castShadow    = !isTrans && !isEmit;
      mesh.receiveShadow = !isTrans;
      mesh.matrixAutoUpdate = false;
      const ys = yShift[type] ?? 0;
      for (let i = 0; i < count; i++) {
        dummy.position.set(flat[i*3]+0.5, flat[i*3+1]+0.5+ys, flat[i*3+2]+0.5);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      this.scene.add(mesh);
      this._builtMeshes.push(mesh);
      if (type === 30 || type === 31) {
        const geo2  = type === 30 ? new THREE.BoxGeometry(0.7,0.7,0.15) : new THREE.BoxGeometry(0.6,0.5,0.12);
        const mesh2 = new THREE.InstancedMesh(geo2, mat, count);
        mesh2.castShadow = mesh2.receiveShadow = false;
        mesh2.matrixAutoUpdate = false;
        for (let i = 0; i < count; i++) {
          dummy.position.set(flat[i*3]+0.5, flat[i*3+1]+0.5+ys, flat[i*3+2]+0.5);
          dummy.updateMatrix();
          mesh2.setMatrixAt(i, dummy.matrix);
        }
        mesh2.instanceMatrix.needsUpdate = true;
        this.scene.add(mesh2);
        this._builtMeshes.push(mesh2);
      }
    }

    const nonEmpty = this._chunks.filter(c => c.meshes.length > 0).length;
    console.log(`[VoxelWorld] ${NUM_CHUNKS*NUM_CHUNKS} chunks (${nonEmpty} non-empty) | ${this._bakedLights.length} baked lights | ${this._builtMeshes.length} total meshes`);
  }

  // Per-frame chunk frustum culling — call from animate().
  // Chunks fully outside the camera view have visible=false; GPU skips them entirely.
  updateChunkVisibility(camera) {
    this._projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this._frustum.setFromProjectionMatrix(this._projScreenMatrix);
    for (const chunk of this._chunks) {
      const vis = this._frustum.intersectsBox(chunk.box);
      for (const m of chunk.meshes) {
        if (m.visible !== vis) m.visible = vis;
      }
    }
  }

  getTerrainHeight(wx, wz) {
    const n = this.noise2D(wx * 0.06, wz * 0.06);
    return Math.floor(3 + n * 2);
  }
}

export { BLOCK_TYPES };
