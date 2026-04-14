// ═══════════════════════════════════════════════════════════════════════════
// InteriorEnhancements — Atmospheric lighting, fog, and furniture for role rooms
// Adds immersive details to Doctor's hospital, Sheriff's office, and Mafia hideout
// ═══════════════════════════════════════════════════════════════════════════

import * as THREE from 'three';

export class InteriorEnhancements {
  constructor(scene) {
    this.scene = scene;
    this.atmospheres = new Map(); // Store atmosphere effects by role
    this.interiorLights = [];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DOCTOR'S HOSPITAL — Clinical atmosphere with blue-white lighting
  // ═══════════════════════════════════════════════════════════════════════════
  setupHospitalAtmosphere() {
    const cx = -36, cz = -36, y = 3;
    
    // Remove any existing atmosphere
    this.clearRoleAtmosphere('doctor');
    
    const atmosphere = {
      fog: new THREE.FogExp2(0xe8f4ff, 0.015), // Light blue fog
      lights: [],
      particles: null,
    };
    
    // Add soft blue ambient light for clinical feel
    const ambientLight = new THREE.AmbientLight(0xcce8ff, 0.4);
    this.scene.add(ambientLight);
    atmosphere.lights.push(ambientLight);
    
    // Add point lights for specific areas
    // OR table spotlight
    const orSpot = new THREE.PointLight(0xffffff, 1.5, 12);
    orSpot.position.set(cx, y + 8, cz - 28);
    this.scene.add(orSpot);
    atmosphere.lights.push(orSpot);
    
    // Ward bed lights (soft cool-white — clinical, not glaring)
    for (const [bx, bz] of [[cx-9, cz+1], [cx-3, cz+1], [cx+3, cz+1]]) {
      const bedLight = new THREE.PointLight(0xbbd8ff, 0.8, 7);
      bedLight.position.set(bx, y + 6, bz);
      this.scene.add(bedLight);
      atmosphere.lights.push(bedLight);
    }
    
    // Reception area warm light
    const receptionLight = new THREE.PointLight(0xfff5e0, 0.9, 10);
    receptionLight.position.set(cx, y + 7, cz - 5);
    this.scene.add(receptionLight);
    atmosphere.lights.push(receptionLight);
    
    this.atmospheres.set('doctor', atmosphere);
    return atmosphere;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SHERIFF'S OFFICE — Warm amber lighting with dramatic shadows
  // ═══════════════════════════════════════════════════════════════════════════
  setupSheriffAtmosphere() {
    const cx = 36, cz = -36, y = 3;
    
    this.clearRoleAtmosphere('sheriff');
    
    const atmosphere = {
      fog: new THREE.FogExp2(0xfff0cc, 0.012), // Warm amber fog
      lights: [],
      particles: null,
    };
    
    // Warm ambient light
    const ambientLight = new THREE.AmbientLight(0xffeebb, 0.35);
    this.scene.add(ambientLight);
    atmosphere.lights.push(ambientLight);
    
    // Desk lamp (warm spotlight)
    const deskSpot = new THREE.SpotLight(0xffcc66, 3, 20, Math.PI / 4, 0.5, 1);
    deskSpot.position.set(cx - 2, y + 7, cz - 5);
    deskSpot.target.position.set(cx - 2, y + 2, cz - 5);
    this.scene.add(deskSpot);
    this.scene.add(deskSpot.target);
    atmosphere.lights.push(deskSpot);
    
    // Wanted board backlight
    const boardLight = new THREE.PointLight(0xffaa44, 1.8, 10);
    boardLight.position.set(cx, y + 6, cz - 8);
    this.scene.add(boardLight);
    atmosphere.lights.push(boardLight);
    
    // Jail cell dim light (red warning)
    const jailLight = new THREE.PointLight(0xff6644, 1.0, 8);
    jailLight.position.set(cx, y + 5, cz + 5);
    this.scene.add(jailLight);
    atmosphere.lights.push(jailLight);
    
    this.atmospheres.set('sheriff', atmosphere);
    return atmosphere;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAFIA HIDEOUT — Dark, ominous red lighting with dramatic shadows
  // ═══════════════════════════════════════════════════════════════════════════
  setupMafiaAtmosphere() {
    const cx = 0, cz = 48, y0 = 0;
    
    this.clearRoleAtmosphere('mafia');
    
    const atmosphere = {
      fog: new THREE.FogExp2(0x1a0a0a, 0.025), // Dark red-black fog
      lights: [],
      particles: null,
    };
    
    // Very dim ambient (almost black)
    const ambientLight = new THREE.AmbientLight(0x331111, 0.2);
    this.scene.add(ambientLight);
    atmosphere.lights.push(ambientLight);
    
    // Planning table red glow
    const tableLight = new THREE.PointLight(0xff2200, 2.0, 12);
    tableLight.position.set(cx - 3, y0 + 5, cz);
    this.scene.add(tableLight);
    atmosphere.lights.push(tableLight);
    
    // Map wall spotlight (dim red)
    const mapSpot = new THREE.SpotLight(0xcc1100, 2.5, 18, Math.PI / 3, 0.3, 1);
    mapSpot.position.set(cx - 8, y0 + 6, cz);
    mapSpot.target.position.set(cx - 12, y0 + 3, cz);
    this.scene.add(mapSpot);
    this.scene.add(mapSpot.target);
    atmosphere.lights.push(mapSpot);
    
    // Weapon rack glint (subtle)
    const weaponLight = new THREE.PointLight(0xffaa00, 0.8, 6);
    weaponLight.position.set(cx - 8, y0 + 4, cz - 8);
    this.scene.add(weaponLight);
    atmosphere.lights.push(weaponLight);
    
    // Sleeping quarters dim light
    const quartersLight = new THREE.PointLight(0x442211, 0.6, 10);
    quartersLight.position.set(cx + 8, y0 + 4, cz);
    this.scene.add(quartersLight);
    atmosphere.lights.push(quartersLight);
    
    this.atmospheres.set('mafia', atmosphere);
    return atmosphere;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GRAVEYARD — Eerie teal/blue lighting with fog
  // ═══════════════════════════════════════════════════════════════════════════
  setupGraveyardAtmosphere() {
    const gx = 36, gz = 36, y = 3;
    
    this.clearRoleAtmosphere('graveyard');
    
    const atmosphere = {
      fog: new THREE.FogExp2(0x0a1a1a, 0.02), // Dark teal fog
      lights: [],
      particles: null,
    };
    
    // Dim blue ambient
    const ambientLight = new THREE.AmbientLight(0x112233, 0.3);
    this.scene.add(ambientLight);
    atmosphere.lights.push(ambientLight);
    
    // Soul lantern glows (teal)
    for (const [lx, lz] of [[gx-6, gz-6], [gx+6, gz-6], [gx-6, gz+6], [gx+6, gz+6]]) {
      const lanternLight = new THREE.PointLight(0x22ddcc, 1.5, 10);
      lanternLight.position.set(lx, y + 3, lz);
      this.scene.add(lanternLight);
      atmosphere.lights.push(lanternLight);
    }
    
    // Central memorial light
    const memorialLight = new THREE.PointLight(0x44aaff, 1.0, 12);
    memorialLight.position.set(gx, y + 5, gz + 7);
    this.scene.add(memorialLight);
    atmosphere.lights.push(memorialLight);
    
    this.atmospheres.set('graveyard', atmosphere);
    return atmosphere;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ATMOSPHERE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  // Clear atmosphere for a specific role
  clearRoleAtmosphere(role) {
    const atmosphere = this.atmospheres.get(role);
    if (!atmosphere) return;
    
    // Remove all lights
    if (atmosphere.lights) {
      atmosphere.lights.forEach(light => {
        this.scene.remove(light);
        if (light.dispose) light.dispose();
      });
    }
    
    // Remove fog
    if (atmosphere.fog) {
      // Reset to default fog (handled by main.js)
    }
    
    this.atmospheres.delete(role);
  }

  // Clear all atmospheres
  clearAllAtmospheres() {
    for (const role of this.atmospheres.keys()) {
      this.clearRoleAtmosphere(role);
    }
  }

  // Apply atmosphere based on current location/phase
  applyAtmosphereForPhase(phase, role = null) {
    this.clearAllAtmospheres();
    
    switch (phase) {
      case 'NIGHT':
        if (role) {
          // Apply role-specific atmosphere
          switch (role) {
            case 'mafia': return this.setupMafiaAtmosphere();
            case 'sheriff': return this.setupSheriffAtmosphere();
            case 'doctor': return this.setupHospitalAtmosphere();
          }
        }
        break;
      case 'DAY':
        // Day uses default lighting (no special atmosphere)
        break;
      case 'ELIMINATING':
        // Show graveyard atmosphere during eliminations
        return this.setupGraveyardAtmosphere();
    }
    
    return null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FURNITURE ENHANCEMENTS — Add props and details to rooms
  // ═══════════════════════════════════════════════════════════════════════════

  // Create a particle system for atmosphere (dust, mist, etc.)
  createAtmosphereParticles(position, color, count = 50, size = 0.05) {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    
    for (let i = 0; i < count; i++) {
      positions[i * 3] = position.x + (Math.random() - 0.5) * 10;
      positions[i * 3 + 1] = position.y + Math.random() * 5;
      positions[i * 3 + 2] = position.z + (Math.random() - 0.5) * 10;
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    const material = new THREE.PointsMaterial({
      color: color,
      size: size,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
    });
    
    const particles = new THREE.Points(geometry, material);
    this.scene.add(particles);
    
    return particles;
  }

  // Dispose of all resources
  dispose() {
    this.clearAllAtmospheres();
  }
}

export default InteriorEnhancements;
