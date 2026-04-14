// ═══════════════════════════════════════════════════════════════════════════
// CameraPlacement — Camera waypoints for each role room
// Provides clean shots showing full player body + environment
// Includes raycast-based spawn height adjustment
// ═══════════════════════════════════════════════════════════════════════════

import * as THREE from 'three';

export class CameraPlacement {
  constructor(scene, camera, renderer) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    
    // Raycaster for spawn height adjustment
    this.raycaster = new THREE.Raycaster();
    this.downVector = new THREE.Vector3(0, -1, 0);
    
    // Floor mesh reference (set by Village or other world builder)
    this.floorMeshes = [];
    
    // ═══════════════════════════════════════════════════════════════════════
    // CAMERA WAYPOINTS — Position and lookAt targets for each role
    // ═══════════════════════════════════════════════════════════════════════
    this.waypoints = {
      // ── HOSPITAL (Doctor) ─────────────────────────────────────────────────
      doctor: {
        // Main spawn camera — shows full character + room
        spawn: {
          position: new THREE.Vector3(-32, 6, -28),
          target: new THREE.Vector3(-36, 4, -28),
          fov: 50,
        },
        // Wide shot showing the whole ward
        wide: {
          position: new THREE.Vector3(-28, 8, -22),
          target: new THREE.Vector3(-36, 3, -28),
          fov: 60,
        },
        // Close-up on character
        close: {
          position: new THREE.Vector3(-34, 5, -26),
          target: new THREE.Vector3(-36, 4.5, -28),
          fov: 45,
        },
        // Profile shot
        profile: {
          position: new THREE.Vector3(-40, 5, -28),
          target: new THREE.Vector3(-36, 4, -28),
          fov: 50,
        },
        // OR table focus
        orTable: {
          position: new THREE.Vector3(-36, 6, -24),
          target: new THREE.Vector3(-36, 3, -28),
          fov: 55,
        },
      },
      
      // ── BUNKER (Mafia) ────────────────────────────────────────────────────
      mafia: {
        // Main spawn camera
        spawn: {
          position: new THREE.Vector3(4, 5, 52),
          target: new THREE.Vector3(0, 4, 48),
          fov: 50,
        },
        // Wide shot of war room
        wide: {
          position: new THREE.Vector3(10, 7, 55),
          target: new THREE.Vector3(-3, 3, 48),
          fov: 60,
        },
        // Close-up on character
        close: {
          position: new THREE.Vector3(2, 4.5, 50),
          target: new THREE.Vector3(0, 4, 48),
          fov: 45,
        },
        // Profile shot
        profile: {
          position: new THREE.Vector3(-4, 5, 48),
          target: new THREE.Vector3(0, 4, 48),
          fov: 50,
        },
        // Planning table focus
        table: {
          position: new THREE.Vector3(-6, 4, 50),
          target: new THREE.Vector3(-3, 3, 48),
          fov: 55,
        },
      },
      
      // ── SHERIFF OFFICE ────────────────────────────────────────────────────
      sheriff: {
        // Main spawn camera - positioned INSIDE the building to see full sheriff body
        // Sheriff spawns at z=-38 to -44 in office area, camera inside at z=-32
        spawn: {
          position: new THREE.Vector3(44, 7, -32),
          target: new THREE.Vector3(36, 4.5, -40),
          fov: 55,
        },
        // Wide shot of office - inside building showing full interior
        wide: {
          position: new THREE.Vector3(42, 8, -30),
          target: new THREE.Vector3(36, 4.5, -40),
          fov: 65,
        },
        // Close-up on character - inside building, shows full body
        close: {
          position: new THREE.Vector3(40, 6, -34),
          target: new THREE.Vector3(36, 4.5, -40),
          fov: 50,
        },
        // Profile shot - inside building
        profile: {
          position: new THREE.Vector3(36, 7, -32),
          target: new THREE.Vector3(36, 4.5, -40),
          fov: 55,
        },
        // Desk focus - inside building
        desk: {
          position: new THREE.Vector3(40, 6, -32),
          target: new THREE.Vector3(36, 4, -40),
          fov: 60,
        },
      },
      
      // ── VILLAGER (Amphitheater) ───────────────────────────────────────────
      villager: {
        spawn: {
          position: new THREE.Vector3(8, 6, 8),
          target: new THREE.Vector3(0, 4, 0),
          fov: 55,
        },
        wide: {
          position: new THREE.Vector3(0, 12, 20),
          target: new THREE.Vector3(0, 3, 0),
          fov: 65,
        },
        close: {
          position: new THREE.Vector3(5, 5.5, 5),
          target: new THREE.Vector3(0, 5, 0),
          fov: 50,
        },
      },
      
      // ── GRAVEYARD ─────────────────────────────────────────────────────────
      graveyard: {
        wide: {
          position: new THREE.Vector3(30, 15, 30),
          target: new THREE.Vector3(36, 3, 36),
          fov: 60,
        },
        close: {
          position: new THREE.Vector3(38, 6, 38),
          target: new THREE.Vector3(36, 3, 36),
          fov: 50,
        },
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SPAWN HEIGHT ADJUSTMENT — Raycast to floor
  // ═══════════════════════════════════════════════════════════════════════════

  // Register floor meshes for raycasting
  registerFloorMeshes(meshes) {
    this.floorMeshes = Array.isArray(meshes) ? meshes : [meshes];
  }

  // Adjust spawn position based on floor height
  // Returns adjusted position (y coordinate updated)
  adjustSpawnHeight(spawnPos, offsetAboveGround = 1.0) {
    if (this.floorMeshes.length === 0) {
      console.warn('[CameraPlacement] No floor meshes registered for raycast');
      return spawnPos.clone();
    }
    
    // Raycast from high above spawn position
    const rayOrigin = new THREE.Vector3(spawnPos.x, spawnPos.y + 50, spawnPos.z);
    this.raycaster.set(rayOrigin, this.downVector);
    
    const hits = this.raycaster.intersectObjects(this.floorMeshes, false);
    
    if (hits.length > 0) {
      const groundY = hits[0].point.y;
      const adjustedPos = spawnPos.clone();
      adjustedPos.y = groundY + offsetAboveGround;
      
      console.log(`[CameraPlacement] Spawn adjusted: ${spawnPos.y.toFixed(2)} -> ${adjustedPos.y.toFixed(2)} (ground: ${groundY.toFixed(2)})`);
      return adjustedPos;
    }
    
    // No hit — return original position
    console.warn('[CameraPlacement] Raycast missed floor, using default height');
    return spawnPos.clone();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CAMERA POSITIONING
  // ═══════════════════════════════════════════════════════════════════════════

  // Get waypoint for a role
  getWaypoint(role, viewType = 'spawn') {
    const roleWaypoints = this.waypoints[role.toLowerCase()];
    if (!roleWaypoints) {
      console.warn(`[CameraPlacement] No waypoints found for role: ${role}`);
      return null;
    }
    
    const waypoint = roleWaypoints[viewType];
    if (!waypoint) {
      console.warn(`[CameraPlacement] No ${viewType} waypoint for role: ${role}`);
      return roleWaypoints.spawn || roleWaypoints.wide || null;
    }
    
    return waypoint;
  }

  // Set camera to a specific waypoint
  // Usage: setCameraToWaypoint('doctor', 'spawn')
  setCameraToWaypoint(role, viewType = 'spawn', instant = false) {
    const waypoint = this.getWaypoint(role, viewType);
    if (!waypoint) return false;
    
    if (instant) {
      this.camera.position.copy(waypoint.position);
      this.camera.fov = waypoint.fov || 50;
      this.camera.updateProjectionMatrix();
      this.camera.lookAt(waypoint.target);
    } else {
      // Smooth transition (requires GSAP)
      if (typeof gsap !== 'undefined') {
        gsap.to(this.camera.position, {
          x: waypoint.position.x,
          y: waypoint.position.y,
          z: waypoint.position.z,
          duration: 1.0,
          ease: 'power2.inOut',
          onUpdate: () => this.camera.lookAt(waypoint.target),
        });
        
        gsap.to(this.camera, {
          fov: waypoint.fov || 50,
          duration: 1.0,
          onUpdate: () => this.camera.updateProjectionMatrix(),
        });
      } else {
        // Fallback to instant
        this.camera.position.copy(waypoint.position);
        this.camera.fov = waypoint.fov || 50;
        this.camera.updateProjectionMatrix();
        this.camera.lookAt(waypoint.target);
      }
    }
    
    return true;
  }

  // Position camera to look at a specific character
  // Useful for dynamic shots during gameplay
  focusOnCharacter(characterPosition, role, shotType = 'fullBody') {
    const framing = {
      fullBody: { distance: 5.0, height: 2.0, fov: 55 },
      medium:   { distance: 3.5, height: 1.5, fov: 50 },
      close:    { distance: 2.2, height: 1.0, fov: 45 },
      extreme:  { distance: 1.3, height: 0.8, fov: 40 },
    };
    
    const frame = framing[shotType] || framing.fullBody;
    
    // Get role spawn position to determine camera angle
    const waypoint = this.getWaypoint(role, 'spawn');
    if (!waypoint) return false;
    
    // Calculate camera position: offset from character towards spawn camera
    const direction = new THREE.Vector3()
      .subVectors(waypoint.position, waypoint.target)
      .normalize();
    
    const camPos = characterPosition.clone()
      .add(direction.multiplyScalar(frame.distance));
    camPos.y = characterPosition.y + frame.height;
    
    const lookTarget = characterPosition.clone();
    lookTarget.y += frame.height * 0.5;
    
    // Apply
    if (typeof gsap !== 'undefined') {
      gsap.to(this.camera.position, {
        x: camPos.x, y: camPos.y, z: camPos.z,
        duration: 0.8,
        ease: 'power2.inOut',
        onUpdate: () => this.camera.lookAt(lookTarget),
      });
    } else {
      this.camera.position.copy(camPos);
      this.camera.lookAt(lookTarget);
    }
    
    return true;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITY METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  // Get all available view types for a role
  getViewTypes(role) {
    const roleWaypoints = this.waypoints[role.toLowerCase()];
    return roleWaypoints ? Object.keys(roleWaypoints) : [];
  }

  // Add a custom waypoint
  addWaypoint(role, viewType, position, target, fov = 50) {
    if (!this.waypoints[role.toLowerCase()]) {
      this.waypoints[role.toLowerCase()] = {};
    }
    
    this.waypoints[role.toLowerCase()][viewType] = {
      position: position.clone(),
      target: target.clone(),
      fov,
    };
  }

  // Debug: visualize waypoints as spheres
  visualizeWaypoints() {
    const geometry = new THREE.SphereGeometry(0.2, 8, 8);
    const material = new THREE.MeshBasicMaterial({ color: 0x00FF00 });
    
    for (const [role, views] of Object.entries(this.waypoints)) {
      for (const [viewType, waypoint] of Object.entries(views)) {
        const sphere = new THREE.Mesh(geometry, material);
        sphere.position.copy(waypoint.position);
        sphere.name = `waypoint_${role}_${viewType}`;
        this.scene.add(sphere);
        
        // Add line to target
        const lineGeo = new THREE.BufferGeometry().setFromPoints([
          waypoint.position,
          waypoint.target,
        ]);
        const lineMat = new THREE.LineBasicMaterial({ color: 0x00FF00 });
        const line = new THREE.Line(lineGeo, lineMat);
        this.scene.add(line);
      }
    }
  }
}

export default CameraPlacement;
