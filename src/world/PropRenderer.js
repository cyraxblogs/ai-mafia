/**
 * PropRenderer — places actual 3D objects (cylinders, spheres, cones, toruses)
 * into the scene as instanced meshes. Props are NOT stored in the voxel grid.
 * Village.js calls addProp(type, x, y, z) for each decorative element.
 *
 * This replaces the broken "different block types that are still cubes" approach.
 */
import * as THREE from 'three';

// ── Geometry factories ────────────────────────────────────────────────────────
// Each returns a geometry centred at origin, sized to fit in roughly 1 unit.
// Geometries are created ONCE and cached — re-using the same BufferGeometry
// across all InstancedMesh calls that share the same shape saves GPU memory
// and eliminates redundant uploadData() calls on every village rebuild.

const _geoCache = new Map();
function cachedGeo(key, factory) {
  if (!_geoCache.has(key)) _geoCache.set(key, factory());
  return _geoCache.get(key);
}

const GEO = {

  // ── LAMP POST: iron pole + glass cage + glowing orb ───────────────────────
  lamp_pole:   () => cachedGeo('lamp_pole',   () => new THREE.CylinderGeometry(0.06, 0.06, 3.5, 6)),
  lamp_cage:   () => cachedGeo('lamp_cage',   () => new THREE.BoxGeometry(0.38, 0.42, 0.38)),
  lamp_glow:   () => cachedGeo('lamp_glow',   () => new THREE.SphereGeometry(0.16, 8, 6)),
  lamp_cap:    () => cachedGeo('lamp_cap',    () => new THREE.CylinderGeometry(0.22, 0.18, 0.1, 6)),

  // ── BARREL: squat cylinder with top/bottom rings ──────────────────────────
  barrel_body: () => cachedGeo('barrel_body', () => new THREE.CylinderGeometry(0.33, 0.33, 0.65, 10)),
  barrel_ring: () => cachedGeo('barrel_ring', () => new THREE.TorusGeometry(0.34, 0.03, 6, 10)),

  // ── FENCE POST: thin octagonal pillar ────────────────────────────────────
  fence_post:  () => cachedGeo('fence_post',  () => new THREE.CylinderGeometry(0.08, 0.08, 1.0, 6)),
  fence_rail:  () => cachedGeo('fence_rail',  () => new THREE.CylinderGeometry(0.04, 0.04, 1.0, 5)),

  // ── FLOWER: cone petals + sphere centre ───────────────────────────────────
  flower_stem: () => cachedGeo('flower_stem', () => new THREE.CylinderGeometry(0.025, 0.025, 0.45, 5)),
  flower_head: () => cachedGeo('flower_head', () => new THREE.SphereGeometry(0.14, 8, 6)),

  // ── HAY BALE: rounded box ─────────────────────────────────────────────────
  hay_body:    () => cachedGeo('hay_body',    () => new THREE.CylinderGeometry(0.4, 0.4, 0.7, 8)),

  // ── WELL BUCKET: tapered cup ──────────────────────────────────────────────
  bucket:      () => cachedGeo('bucket',      () => new THREE.CylinderGeometry(0.1, 0.08, 0.18, 7)),

  // ── GRAVESTONE: flat slab + cross ─────────────────────────────────────────
  grave_slab:  () => cachedGeo('grave_slab',  () => new THREE.BoxGeometry(0.55, 0.9, 0.12)),
  grave_cross: () => cachedGeo('grave_cross', () => new THREE.BoxGeometry(0.55, 0.18, 0.12)),
  grave_base:  () => cachedGeo('grave_base',  () => new THREE.BoxGeometry(0.7,  0.15, 0.22)),

  // ── TREE TRUNK: tapered cylinder ──────────────────────────────────────────
  trunk:       () => cachedGeo('trunk',       () => new THREE.CylinderGeometry(0.28, 0.38, 1.0, 7)),

  // ── LEAF SPHERE: layered spheres for canopy ───────────────────────────────
  leaves_big:  () => cachedGeo('leaves_big',  () => new THREE.SphereGeometry(2.2, 8, 6)),
  leaves_mid:  () => cachedGeo('leaves_mid',  () => new THREE.SphereGeometry(1.6, 8, 6)),
  leaves_top:  () => cachedGeo('leaves_top',  () => new THREE.SphereGeometry(1.1, 7, 5)),

  // ── BENCH: slab seat + thin legs ──────────────────────────────────────────
  bench_seat:  () => cachedGeo('bench_seat',  () => new THREE.BoxGeometry(1.1, 0.1, 0.42)),
  bench_leg:   () => cachedGeo('bench_leg',   () => new THREE.BoxGeometry(0.08, 0.38, 0.36)),
  bench_back:  () => cachedGeo('bench_back',  () => new THREE.BoxGeometry(1.1, 0.36, 0.07)),

  // ── FOUNTAIN: basin ring + pillar + water disc ────────────────────────────
  fountain_basin:  () => cachedGeo('fountain_basin',  () => new THREE.TorusGeometry(2.0, 0.28, 8, 18)),
  fountain_pillar: () => cachedGeo('fountain_pillar', () => new THREE.CylinderGeometry(0.2, 0.26, 2.2, 8)),
  fountain_water:  () => cachedGeo('fountain_water',  () => new THREE.CylinderGeometry(1.72, 1.72, 0.07, 18)),

  // ── MARKET STALL ROOF: sloped flat box ────────────────────────────────────
  stall_roof:  () => cachedGeo('stall_roof',  () => new THREE.BoxGeometry(3.2, 0.12, 2.4)),
};

// ── Materials ─────────────────────────────────────────────────────────────────
const M = {
  iron:      new THREE.MeshLambertMaterial({ color: 0x8899aa }),
  iron_dark: new THREE.MeshLambertMaterial({ color: 0x556677 }),
  glass:     new THREE.MeshLambertMaterial({ color: 0xaaccee, transparent: true, opacity: 0.55, depthWrite: false }),
  glow:      new THREE.MeshLambertMaterial({ color: 0xffee88, emissive: new THREE.Color(0xffee88).multiplyScalar(0.6) }),
  glow_teal: new THREE.MeshLambertMaterial({ color: 0x44ddcc, emissive: new THREE.Color(0x44ddcc).multiplyScalar(0.6), transparent: true, opacity: 0.88 }),
  wood:      new THREE.MeshLambertMaterial({ color: 0x7a4f1a }),
  wood_dark: new THREE.MeshLambertMaterial({ color: 0x3b2200 }),
  planks:    new THREE.MeshLambertMaterial({ color: 0xc8a45a }),
  oak_log:   new THREE.MeshLambertMaterial({ color: 0x7a4f1a }),
  leaves:    new THREE.MeshLambertMaterial({ color: 0x2d6e28 }),
  leaves2:   new THREE.MeshLambertMaterial({ color: 0x3a8030 }),
  stone:     new THREE.MeshLambertMaterial({ color: 0x888880 }),
  cobble:    new THREE.MeshLambertMaterial({ color: 0x707070 }),
  stone_b:   new THREE.MeshLambertMaterial({ color: 0x888070 }),
  grey:      new THREE.MeshLambertMaterial({ color: 0x999990 }),
  water:     new THREE.MeshLambertMaterial({ color: 0x2255aa, transparent: true, opacity: 0.7, depthWrite: false }),
  flower_r:  new THREE.MeshLambertMaterial({ color: 0xee2244 }),
  flower_y:  new THREE.MeshLambertMaterial({ color: 0xeecc22 }),
  flower_p:  new THREE.MeshLambertMaterial({ color: 0xaa44dd }),
  stem:      new THREE.MeshLambertMaterial({ color: 0x4a8030 }),
  hay:       new THREE.MeshLambertMaterial({ color: 0xd4a832 }),
  hay_band:  new THREE.MeshLambertMaterial({ color: 0xa07820 }),
  red_wool:  new THREE.MeshLambertMaterial({ color: 0xcc2222 }),
  dirt:      new THREE.MeshLambertMaterial({ color: 0x8B6347 }),
  awning_r:  new THREE.MeshLambertMaterial({ color: 0xcc2222 }),
  awning_b:  new THREE.MeshLambertMaterial({ color: 0x2244cc }),
  awning_y:  new THREE.MeshLambertMaterial({ color: 0xddbb22 }),
  awning_t:  new THREE.MeshLambertMaterial({ color: 0xc87040 }),

  // ── Environment scatter ─────────────────────────────────────────────────
  rock:        new THREE.MeshLambertMaterial({ color: 0x888880 }),
  rock_shadow: new THREE.MeshLambertMaterial({ color: 0x555550 }),
  grass_bright:new THREE.MeshLambertMaterial({ color: 0x4a9a1e }),
  grass_mid:   new THREE.MeshLambertMaterial({ color: 0x3d8018 }),

  // ── PBR-upgraded metals for interior props ──────────────────────────────
  // MeshStandardMaterial: metalness/roughness pipeline, reflects lantern light
  steel: new THREE.MeshStandardMaterial({
    color: 0x8899aa, metalness: 0.9, roughness: 0.2,
  }),
  dark_metal: new THREE.MeshStandardMaterial({
    color: 0x334455, metalness: 0.85, roughness: 0.3,
  }),
  // Wood grain — canvas texture generated once on first use
  wood_pbr: (() => {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = '#7a4f1a';
    x.fillRect(0, 0, 128, 128);
    // Horizontal wood grain lines
    for (let i = 0; i < 28; i++) {
      const y0 = Math.floor(Math.random() * 128);
      x.strokeStyle = `rgba(0,0,0,${0.06 + Math.random() * 0.10})`;
      x.lineWidth   = 0.8 + Math.random() * 1.2;
      x.beginPath(); x.moveTo(0, y0);
      x.bezierCurveTo(32, y0 + (Math.random()-0.5)*6,
                       96, y0 + (Math.random()-0.5)*6, 128, y0);
      x.stroke();
    }
    // Knot rings
    for (let k = 0; k < 3; k++) {
      const kx = 20 + Math.random() * 88, ky = 20 + Math.random() * 88;
      x.strokeStyle = 'rgba(40,20,0,0.12)';
      x.beginPath(); x.ellipse(kx, ky, 10, 7, 0, 0, Math.PI * 2); x.stroke();
      x.beginPath(); x.ellipse(kx, ky, 5,  3, 0, 0, Math.PI * 2); x.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75, metalness: 0 });
  })(),
};

export class PropRenderer {
  constructor(scene) {
    this.scene  = scene;
    this._props = []; // { type, positions:[[x,y,z],...] }
    this._meshes = [];
  }

  // Call this to register a prop position — Village.js uses this
  add(type, x, y, z) {
    let bucket = this._props.find(p => p.type === type);
    if (!bucket) { bucket = { type, positions: [] }; this._props.push(bucket); }
    bucket.positions.push([x, y, z]);
  }

  // Render a single prop immediately into the scene — use this for dynamic props
  // added AFTER build() has already been called (e.g. gravestones added mid-game).
  addImmediate(type, x, y, z) {
    const fn = BUILDERS[type];
    if (!fn) return;
    fn([[x, y, z]], this.scene, this._meshes);
  }

  clear() {
    for (const m of this._meshes) {
      this.scene.remove(m);
      m.geometry.dispose();
    }
    this._meshes = [];
    this._props  = [];
  }

  _bucketPositions(positions, cellSize = 32) {
    if (positions.length <= 8) return [positions];

    const buckets = new Map();
    for (const pos of positions) {
      const [x, , z] = pos;
      const bx = Math.floor((x + 64) / cellSize);
      const bz = Math.floor((z + 64) / cellSize);
      const key = `${bx},${bz}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(pos);
    }
    return [...buckets.values()];
  }

  // Build all instanced meshes from accumulated prop data
  build() {
    for (const { type, positions } of this._props) {
      const fn = BUILDERS[type];
      if (!fn) continue;
      // Split world-wide instanced props into coarse spatial buckets so Three's
      // frustum culling can drop whole regions for speaker cameras instead of
      // drawing every prop batch across the map on every angle.
      const buckets = this._bucketPositions(positions);
      for (const bucket of buckets) fn(bucket, this.scene, this._meshes);
    }
  }

  // Helper used by builders
  _inst(geo, mat, positions, getMatrix, scene, out) {
    const count = positions.length;
    if (!count) return;
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.castShadow    = mat !== M.glass && mat !== M.water && mat !== M.glow && mat !== M.glow_teal;
    mesh.receiveShadow = mat !== M.glass && mat !== M.water;
    mesh.matrixAutoUpdate = false;
    for (let i = 0; i < count; i++) {
      const m4 = getMatrix(positions[i], i);
      mesh.setMatrixAt(i, m4);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    scene.add(mesh);
    out.push(mesh);
    return mesh;
  }
}

// ── Helper: build a matrix4 from position + optional scale/rotation ──────────
const _tmp = new THREE.Object3D();
function mat4(x, y, z, sx=1, sy=1, sz=1, rx=0, ry=0, rz=0) {
  _tmp.position.set(x, y, z);
  _tmp.scale.set(sx, sy, sz);
  _tmp.rotation.set(rx, ry, rz);
  _tmp.updateMatrix();
  return _tmp.matrix.clone();
}
function mat4p([x,y,z], offX=0, offY=0, offZ=0, sx=1, sy=1, sz=1, rx=0) {
  return mat4(x+offX, y+offY, z+offZ, sx, sy, sz, rx);
}

// ── Instanced builder helpers ─────────────────────────────────────────────────
function instanced(geo, mat, positions, ox, oy, oz, scene, out, sx=1, sy=1, sz=1, rx=0) {
  const n = positions.length; if (!n) return;
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.castShadow    = mat.transparent ? false : true;
  mesh.receiveShadow = mat.transparent ? false : true;
  mesh.matrixAutoUpdate = false;
  for (let i=0; i<n; i++) {
    const [px,py,pz] = positions[i];
    _tmp.position.set(px+ox, py+oy, pz+oz);
    _tmp.scale.set(sx, sy, sz);
    _tmp.rotation.set(rx, 0, 0);
    _tmp.updateMatrix();
    mesh.setMatrixAt(i, _tmp.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  scene.add(mesh); out.push(mesh);
}

// ── PROP BUILDERS — one per prop type ────────────────────────────────────────
const BUILDERS = {

  // ── LAMP POST ──────────────────────────────────────────────────────────────
  lamp: (positions, scene, out) => {
    instanced(GEO.lamp_pole(),  M.iron,      positions, 0, 2.25, 0, scene, out);
    instanced(GEO.lamp_cage(),  M.iron_dark, positions, 0, 4.35, 0, scene, out);
    instanced(GEO.lamp_glow(),  M.glow,      positions, 0, 4.35, 0, scene, out);
    instanced(GEO.lamp_cap(),   M.iron,      positions, 0, 4.65, 0, scene, out);
    // Pole base disk
    instanced(new THREE.CylinderGeometry(0.16, 0.2, 0.18, 7), M.iron, positions, 0, 0.55, 0, scene, out);
  },

  // ── SOUL LANTERN POST (graveyard) ─────────────────────────────────────────
  soul_lamp: (positions, scene, out) => {
    instanced(GEO.lamp_pole(),  M.iron_dark,  positions, 0, 2.25, 0, scene, out);
    instanced(GEO.lamp_cage(),  M.iron_dark,  positions, 0, 4.35, 0, scene, out);
    instanced(GEO.lamp_glow(),  M.glow_teal,  positions, 0, 4.35, 0, scene, out);
    instanced(GEO.lamp_cap(),   M.iron_dark,  positions, 0, 4.65, 0, scene, out);
  },

  // ── BARREL ────────────────────────────────────────────────────────────────
  barrel: (positions, scene, out) => {
    instanced(GEO.barrel_body(), M.wood_dark, positions, 0, 0.5, 0, scene, out);
    // Top ring
    instanced(GEO.barrel_ring(), M.iron, positions, 0, 0.76, 0, scene, out, 1, 1, 1, Math.PI/2);
    // Middle ring
    instanced(GEO.barrel_ring(), M.iron, positions, 0, 0.5,  0, scene, out, 1, 1, 1, Math.PI/2);
    // Bottom ring
    instanced(GEO.barrel_ring(), M.iron, positions, 0, 0.24, 0, scene, out, 1, 1, 1, Math.PI/2);
    // Top disc
    instanced(new THREE.CylinderGeometry(0.31, 0.31, 0.04, 10), M.wood, positions, 0, 0.84, 0, scene, out);
  },

  // ── FENCE (single post) ───────────────────────────────────────────────────
  fence_post: (positions, scene, out) => {
    instanced(GEO.fence_post(), M.wood_dark, positions, 0, 0.5, 0, scene, out);
  },

  // ── FENCE RAIL (horizontal — rotated 90° around Y) ───────────────────────
  fence_rail_x: (positions, scene, out) => {
    const n = positions.length; if(!n) return;
    const geo = GEO.fence_rail();
    const mesh = new THREE.InstancedMesh(geo, M.wood_dark, n);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
    for (let i=0; i<n; i++) {
      const [px,py,pz] = positions[i];
      _tmp.position.set(px, py, pz);
      _tmp.scale.set(1,1,1);
      _tmp.rotation.set(0, 0, Math.PI/2); // lie flat along X
      _tmp.updateMatrix();
      mesh.setMatrixAt(i, _tmp.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
    scene.add(mesh); out.push(mesh);
  },

  // ── FLOWER (red poppy: stem + sphere head) ─────────────────────────────────
  flower: (positions, scene, out) => {
    instanced(GEO.flower_stem(), M.stem,     positions, 0, 0.22, 0, scene, out);
    instanced(GEO.flower_head(), M.flower_r, positions, 0, 0.58, 0, scene, out);
  },
  flower_yellow: (positions, scene, out) => {
    instanced(GEO.flower_stem(), M.stem,     positions, 0, 0.22, 0, scene, out);
    instanced(GEO.flower_head(), M.flower_y, positions, 0, 0.58, 0, scene, out);
  },
  flower_purple: (positions, scene, out) => {
    instanced(GEO.flower_stem(), M.stem,     positions, 0, 0.22, 0, scene, out);
    instanced(GEO.flower_head(), M.flower_p, positions, 0, 0.58, 0, scene, out);
  },

  // ── HAY BALE ──────────────────────────────────────────────────────────────
  hay: (positions, scene, out) => {
    instanced(GEO.hay_body(),    M.hay,      positions, 0, 0.45, 0, scene, out, 1, 1, 1, Math.PI/2);
    // Two binding bands
    instanced(GEO.barrel_ring(), M.hay_band, positions, 0, 0.45, 0, scene, out, 1.05, 1, 1.05, Math.PI/2);
    instanced(GEO.barrel_ring(), M.hay_band, positions, 0.25, 0.45, 0, scene, out, 1.05, 1, 1.05, Math.PI/2);
  },

  // ── BENCH (road-side) ─────────────────────────────────────────────────────
  bench: (positions, scene, out) => {
    instanced(GEO.bench_seat(), M.planks,   positions,  0,    0.42, 0,    scene, out);
    instanced(GEO.bench_leg(),  M.wood_dark,positions, -0.44, 0.19, 0,    scene, out);
    instanced(GEO.bench_leg(),  M.wood_dark,positions,  0.44, 0.19, 0,    scene, out);
    instanced(GEO.bench_back(), M.planks,   positions,  0,    0.7,  -0.18, scene, out);
  },

  // ── GRAVESTONE ───────────────────────────────────────────────────────────
  gravestone: (positions, scene, out) => {
    instanced(GEO.grave_base(),  M.cobble,  positions, 0, 0.07, 0,    scene, out);
    instanced(GEO.grave_slab(),  M.stone_b, positions, 0, 0.65, 0.05, scene, out);
    instanced(GEO.grave_cross(), M.grey,    positions, 0, 0.92, 0.04, scene, out);
  },

  // ── FOUNTAIN ─────────────────────────────────────────────────────────────
  fountain: (positions, scene, out) => {
    instanced(GEO.fountain_basin(),  M.stone,   positions, 0, 0.3,  0, scene, out);
    instanced(GEO.fountain_pillar(), M.stone_b, positions, 0, 1.6,  0, scene, out);
    instanced(GEO.fountain_water(),  M.water,   positions, 0, 0.38, 0, scene, out);
    // Small orb on top of pillar
    instanced(new THREE.SphereGeometry(0.22, 8, 6), M.glow, positions, 0, 2.82, 0, scene, out);
  },

  // ── TREE (round canopy) ──────────────────────────────────────────────────
  tree: (positions, scene, out) => {
    // Multi-segment trunk (stacked tapered cylinders)
    for (let seg=0; seg<7; seg++) {
      const r1 = 0.38 - seg*0.03, r2 = 0.35 - seg*0.03;
      instanced(new THREE.CylinderGeometry(r2, r1, 1.1, 7), M.oak_log, positions, 0, seg+0.55, 0, scene, out);
    }
    // Layered spherical canopy
    instanced(GEO.leaves_big(),  M.leaves,  positions, 0, 8.5, 0, scene, out);
    instanced(GEO.leaves_mid(),  M.leaves2, positions, 0, 9.8, 0, scene, out);
    instanced(GEO.leaves_top(),  M.leaves,  positions, 0,11.0, 0, scene, out);
    // Side bulges for fullness
    instanced(new THREE.SphereGeometry(1.4, 7, 5), M.leaves2, positions,  1.5, 8.2, 0,   scene, out);
    instanced(new THREE.SphereGeometry(1.4, 7, 5), M.leaves,  positions, -1.5, 8.2, 0,   scene, out);
    instanced(new THREE.SphereGeometry(1.4, 7, 5), M.leaves2, positions,  0,   8.2, 1.5, scene, out);
    instanced(new THREE.SphereGeometry(1.4, 7, 5), M.leaves,  positions,  0,   8.2,-1.5, scene, out);
  },

  // ── SMALL ROCK — angular voxel-style ground clutter ──────────────────────
  // Two offset boxes give a chunky "cracked stone" silhouette
  rock: (positions, scene, out) => {
    instanced(new THREE.BoxGeometry(0.52, 0.34, 0.44), M.rock,        positions,  0.00, 0.17,  0.00, scene, out);
    instanced(new THREE.BoxGeometry(0.30, 0.26, 0.28), M.rock_shadow, positions,  0.24, 0.22,  0.18, scene, out);
    instanced(new THREE.BoxGeometry(0.18, 0.14, 0.18), M.rock,        positions, -0.28, 0.07,  0.22, scene, out);
  },

  // ── GRASS TUFT — 2-block-high X-cross blades ─────────────────────────────
  // Primary cross + offset secondary tuft for organic cluster feel
  grass_tuft: (positions, scene, out) => {
    instanced(new THREE.BoxGeometry(0.04, 0.68, 0.52), M.grass_bright, positions,  0.00, 0.34,  0.00, scene, out);
    instanced(new THREE.BoxGeometry(0.52, 0.68, 0.04), M.grass_bright, positions,  0.00, 0.34,  0.00, scene, out);
    instanced(new THREE.BoxGeometry(0.04, 0.55, 0.42), M.grass_mid,    positions,  0.26, 0.28,  0.18, scene, out);
    instanced(new THREE.BoxGeometry(0.42, 0.55, 0.04), M.grass_mid,    positions,  0.18, 0.28,  0.24, scene, out);
  },
};

export { BUILDERS };
