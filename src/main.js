import * as THREE from 'three';
import { gsap } from 'gsap';
import { VoxelWorld } from './world/VoxelWorld.js';
import { Village } from './world/Village.js';
import { Skybox } from './world/Skybox.js';
import { CharacterManager } from './characters/CharacterManager.js';
import { CinematicCamera } from './camera/CinematicCamera.js';
import { SoundEngine } from './audio/SoundEngine.js';
import { VoiceEngine } from './audio/VoiceEngine.js';
import { GameEngine } from '../game/engine.js';
import { HUD } from './ui/HUD.js';
import { ChatLog } from './ui/ChatLog.js';
import { ActionPanel } from './ui/ActionPanel.js';
import { Tutorial } from './ui/Tutorial.js';
import { ConnectionOverlay } from './ui/ConnectionOverlay.js';
import { CreditOverlay } from './ui/CreditOverlay.js';
import { FireflyParticles } from './lobby/FireflyParticles.js';
import { isGameActive, setGameActive } from './state.js';
import { PerformanceOptimizer, PerformanceMonitor } from './utils/PerformanceOptimizer.js';

// ─── Boot ─────────────────────────────────────────────────────────────────────
let renderer, scene, camera, clock;
let voxelWorld, village, skybox, charManager, cinCamera, soundEngine, gameEngine, hud, tutorial;
let chatLog, actionPanel, connectionOverlay, creditOverlay;
let fireflyParticles = null;
let perfOptimizer, perfMonitor;
const loadingBar = document.getElementById('loading-bar');
const loadingScreen = document.getElementById('loading-screen');
const loadingPct = document.getElementById('loading-pct');
const loadingStep = document.getElementById('loading-step');

const LOAD_STEPS = [
  { id: 'lstep-renderer', threshold: 0,  label: 'Setting up renderer & scene...' },
  { id: 'lstep-world',    threshold: 30, label: 'Building voxel world data...' },
  { id: 'lstep-village',  threshold: 40, label: 'Constructing village, town hall & paths...' },
  { id: 'lstep-sky',      threshold: 65, label: 'Painting sky, fog & lighting...' },
  { id: 'lstep-chars',    threshold: 75, label: 'Preparing character system...' },
  { id: 'lstep-ui',       threshold: 85, label: 'Loading UI & tutorial...' },
  { id: 'lstep-done',     threshold: 98, label: 'Entering the village...' },
];

function setLoadingProgress(pct) {
  pct = Math.min(100, Math.max(0, Math.round(pct)));
  if (loadingBar) loadingBar.style.width = `${pct}%`;
  if (loadingPct) loadingPct.textContent = `${pct}%`;

  // Update checklist - mark done/active based on thresholds
  for (let i = 0; i < LOAD_STEPS.length; i++) {
    const step = LOAD_STEPS[i];
    const el = document.getElementById(step.id);
    if (!el) continue;
    const next = LOAD_STEPS[i + 1];
    const isDone = next ? pct >= next.threshold : pct >= 100;
    const isActive = !isDone && pct >= step.threshold;
    el.className = 'load-step-item' + (isDone ? ' done' : isActive ? ' active' : '');
    el.querySelector('.load-step-icon').textContent = isDone ? '✓' : isActive ? '▶' : '·';
    if (isActive && loadingStep) loadingStep.textContent = step.label;
  }
}

async function init() {
  setLoadingProgress(10);

  // Renderer
  const canvas = document.getElementById('three-canvas');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;  // Reduced from 1.0 — ACES was overboosting warm/yellow tones
  // Disable per-frame draw-call sorting — the scene is opaque-dominant and
  // sprites/transparent objects are pushed to the back of the render list
  // at construction time, so WebGL's natural order is already correct.
  // Sorting costs O(N log N) CPU per frame with N draw calls.
  renderer.sortObjects = false;

  // Initialize performance optimizer (three-mesh-bvh, Draco, KTX2, shadow throttle)
  perfOptimizer = new PerformanceOptimizer(renderer);

  // Enable live FPS overlay — toggle with Ctrl+Shift+P during gameplay
  perfMonitor = new PerformanceMonitor();
  perfMonitor.enable(renderer);

  // Scene
  scene = new THREE.Scene();
  // Lighter fog — reduces overdraw from objects outside view but keeps atmosphere
  scene.fog = new THREE.FogExp2(0x78BEFF, 0.009); // base fog matches Minecraft horizon blue; night → indigo via Skybox.setNight()
  
  // ═══════════════════════════════════════════════════════════════════════════
  // TEXTURES & LIGHTING NOTES — Enable for enhanced visuals:
  // 
  // 1. ROLE-SPECIFIC FOG (atmospheric depth):
  //    See InteriorEnhancements.js for hospital/sheriff/mafia fog presets
  //
  // 2. HEMISPHERE LIGHT (soft ambient):
  //    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
  //    scene.add(hemiLight);
  //
  // 3. KTX2 TEXTURES (GPU-compressed):
  //    Use perfOptimizer.loadCompressedTexture(url) for .ktx2 files
  //    See PerformanceOptimizer.js for setup
  //
  // 4. SOFT SHADOWS:
  //    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  //    light.shadow.mapSize.set(2048, 2048);
  // ═══════════════════════════════════════════════════════════════════════════

  // Camera — near=0.5 (was 0.1) and far=350 (was 500) tightens the depth buffer
  // which reduces Z-fighting and gives WebGL more precision per pixel
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.5, 350);
  camera.position.set(0, 30, 50);
  camera.lookAt(0, 0, 0);

  clock = new THREE.Clock();
  setLoadingProgress(20);

  // Systems
  soundEngine = new SoundEngine();
  window._soundEngine = soundEngine;
  setLoadingProgress(30);

  voxelWorld = new VoxelWorld(scene);
  setLoadingProgress(40);

  village = new Village(scene, voxelWorld);
  // Pass a progress callback so the bar moves while village is building
  await village.build((pct) => setLoadingProgress(40 + pct * 0.25));
  setLoadingProgress(65);

  skybox = new Skybox(scene, renderer);
  setLoadingProgress(70);

  charManager = new CharacterManager(scene);
  setLoadingProgress(78);

  cinCamera = new CinematicCamera(camera, scene);
  setLoadingProgress(83);

  // UI systems
  hud = new HUD(charManager);
  chatLog = new ChatLog();
  actionPanel = new ActionPanel();
  tutorial = new Tutorial();
  window._tutorial = tutorial;
  connectionOverlay = new ConnectionOverlay();
  creditOverlay = new CreditOverlay(() => {
    if (gameEngine) gameEngine.exitToLobby();
  });
  setLoadingProgress(90);

  // Lobby 3D preview
  cinCamera.setLobbyView();
  setLoadingProgress(95);

  // Fireflies (lobby particles)
  fireflyParticles = new FireflyParticles();
  setLoadingProgress(100);

  // Scroll animations for lobby
  setupScrollAnimations();

  // ── Tutorial trigger ─────────────────────────────────────────────────────
  // Directly call tutorial.showIfFirstTime() after the loading screen fades.
  // This replaces the old window._showTutorialAfterLoad / IIFE indirection
  // which was the root cause of the tutorial never appearing:
  //   1. The IIFE checked localStorage('mafia_startup_tutorial_seen_v1').
  //      Any previous skip — or any previous model's "fix" that set this key —
  //      caused openTutorialAfterLoad() to return early, silently.
  //   2. The transitionend → requestAnimationFrame chain could silently drop
  //      when the tab was backgrounded during load.
  //   3. Two tutorial implementations (IIFE + Tutorial.js class) both write to
  //      #tutorial-overlay and conflicted.
  //
  // Now: ONE code path. tutorial.showIfFirstTime() checks all known localStorage
  // keys, and if none are set it calls tutorial.show(). The IIFE in index.html
  // still exists but window._showTutorialAfterLoad is now a no-op stub so it
  // can't interfere.
  // ── Click-to-enter: first gesture unlocks AudioContext + starts tutorial ──
  // Chrome's autoplay policy blocks Web Audio until a user gesture fires.
  // We intercept here — when loading hits 100% we show "CLICK ANYWHERE TO
  // CONTINUE" on the loading screen. That click IS the first gesture, so the
  // AudioContext is created in running state (no resume() needed) and all
  // tutorial sounds work from step 1 onwards.
  const finishLoading = () => {
    if (!loadingScreen || loadingScreen.dataset.closed === '1') return;
    loadingScreen.dataset.closed = '1';
    loadingScreen.style.display = 'none';

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        tutorial.showIfFirstTime(null);
      });
    });
  };

  const fadeAndStart = () => {
    if (!loadingScreen || loadingScreen.dataset.fading === '1') return;
    loadingScreen.dataset.fading = '1';

    // First gesture — create AudioContext right here so it starts "running"
    soundEngine._onFirstGesture?.();

    if (loadingScreen) {
      const onLoadingFadeEnd = (evt) => {
        if (evt.target !== loadingScreen) return;
        if (evt.propertyName !== 'opacity') return;
        loadingScreen.removeEventListener('transitionend', onLoadingFadeEnd);
        finishLoading();
      };
      loadingScreen.addEventListener('transitionend', onLoadingFadeEnd);
      loadingScreen.style.opacity = '0';
      setTimeout(finishLoading, 1100);
    } else {
      finishLoading();
    }
  };

  // Show the click-to-enter prompt instead of auto-fading
  const cteEl = document.getElementById('click-to-enter');
  if (cteEl) {
    cteEl.classList.add('show');
    // Any click/key anywhere on the loading screen triggers the transition
    loadingScreen.addEventListener('pointerdown', fadeAndStart, { once: true });
    loadingScreen.addEventListener('keydown',     fadeAndStart, { once: true });
    loadingScreen.style.cursor = 'pointer';
  } else {
    // Fallback if element missing — original auto-fade behaviour
    if (loadingScreen) {
      const onLoadingFadeEnd = (evt) => {
        if (evt.target !== loadingScreen) return;
        if (evt.propertyName !== 'opacity') return;
        loadingScreen.removeEventListener('transitionend', onLoadingFadeEnd);
        finishLoading();
      };
      loadingScreen.addEventListener('transitionend', onLoadingFadeEnd);
      loadingScreen.style.opacity = '0';
      setTimeout(finishLoading, 1100);
    } else {
      finishLoading();
    }
  }
  soundEngine.playAmbient();

  // Voice engine — unique TTS voice per AI model (Web Speech API, free)
  const voiceEngine = VoiceEngine.isSupported() ? new VoiceEngine() : null;

  // Game engine - pass all UI systems
  gameEngine = new GameEngine({
    scene, camera, renderer, charManager, cinCamera, soundEngine, voiceEngine,
    village, skybox, hud, chatLog, actionPanel, tutorial,
    connectionOverlay, creditOverlay,
  });
  window._gameInstance = gameEngine;

  // Make gsap and THREE globally accessible
  window.gsap = gsap;
  window.THREE = THREE;
  window._perfOptimizer = perfOptimizer; // expose for character system shadow dirty marking

  // ── Post-build performance pass ──────────────────────────────────────────
  // Run AFTER the entire scene is constructed so we freeze everything at once.
  // Characters haven't spawned yet so their UUIDs aren't in the scene — safe to
  // freeze all current objects (voxel world, village props, skybox geometry).
  perfOptimizer.freezeStaticObjects(scene, new Set());

  // Pre-upload all shaders to GPU — eliminates first-frame hitches
  perfOptimizer.precompileShaders(scene, camera);
  
  // Setup frustum culling for better performance
  perfOptimizer.setupFrustumCulling(scene, camera);
  
  // Optimize shadows for better performance
  perfOptimizer.optimizeShadows(scene, 'high');

  // Mark skybox objects as neverCull — they are always in view by design and
  // their pivot points (origin / far-sky positions) would trigger false culls.
  perfOptimizer.markNeverCull(
    skybox.skyMesh, skybox.horizonMesh, skybox.stars, skybox.moon, skybox.sun
  );

  // Strip unused UV attributes from all InstancedMesh geometries — PropRenderer
  // geometries (cylinder, sphere, torus, box) ship with UV arrays that Lambert
  // materials never sample. Removes dead GPU bandwidth on every draw call.
  perfOptimizer.stripPropUVs(scene);
  // ─────────────────────────────────────────────────────────────────────────

  // Resize
  window.addEventListener('resize', onResize);

  // Animate — use renderer.setAnimationLoop instead of bare requestAnimationFrame.
  // Equivalent on non-XR; more correct if XR is ever re-enabled.
  renderer.setAnimationLoop(animate);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
}

let _frameCount = 0;
function animate() {
  // NOTE: requestAnimationFrame(animate) is NOT called here.
  // renderer.setAnimationLoop(animate) below manages the loop instead —
  // it hooks into the browser's rAF queue via the renderer so XR (if ever
  // enabled) and the normal path share one code path, and the renderer can
  // batch its own internal work before the user callback runs.
  let delta = clock.getDelta();
  // Cap delta at 50ms (20fps floor) — prevents spiral-of-death after tab switch
  if (delta > 0.05) delta = 0.05;
  const elapsed = clock.getElapsedTime();
  _frameCount++;

  skybox.update(elapsed, camera);
  charManager.update(delta, elapsed);
  village?.windowGlow?.update(elapsed);
  if (isGameActive && gameEngine) gameEngine.update(delta);

  // Chunk frustum culling — hides voxel chunks outside camera view entirely.
  // GPU never processes their triangles. Equivalent to Minecraft's chunk culling.
  voxelWorld.updateChunkVisibility(camera);

  // Lobby slow rotation
  if (!isGameActive) {
    cinCamera.updateLobbyOrbit(elapsed);
  }

  // Shadow throttle — only recompute shadow maps every 2 frames (sun is static)
  perfOptimizer.tickShadows();
  
  // Adaptive quality — reduce shadow quality AND pixel ratio when FPS drops
  // (Roblox-style dynamic resolution: fewer pixels = free performance boost)
  if (_frameCount % 60 === 0) {
    const fps = perfMonitor._fps || 60;
    if (fps < 30 && renderer.shadowMap.type !== THREE.BasicShadowMap) {
      renderer.shadowMap.type = THREE.BasicShadowMap;
      scene.traverse(obj => {
        if (obj.isDirectionalLight && obj.castShadow) {
          obj.shadow.mapSize.width = 512;
          obj.shadow.mapSize.height = 512;
        }
      });
      // Drop pixel ratio to 1.0 for a major fill-rate saving (Roblox dynamic res)
      renderer.setPixelRatio(1.0);
    } else if (fps > 50 && renderer.shadowMap.type === THREE.BasicShadowMap) {
      renderer.shadowMap.type = THREE.PCFShadowMap;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    }

    // Entity LOD — skip expensive character updates for far/off-screen characters.
    // Minecraft EntityCulling mod technique: trace frustum + distance, skip invisible.
    if (charManager && camera) {
      const camPos = camera.position;
      for (const [, char] of charManager.characters) {
        if (!char.mesh) continue;
        const dx = char.mesh.position.x - camPos.x;
        const dz = char.mesh.position.z - camPos.z;
        const distSq = dx * dx + dz * dz;
        // Beyond 120 units: freeze animation, still visible (LOD technique)
        char._lodSkip = distSq > 14400;
      }
    }
  }

  renderer.render(scene, camera);

  // Speech bubble DOM projection — throttle to every other frame to halve DOM cost
  if (_frameCount % 2 === 0) {
    hud.updateSpeechBubbles(camera, renderer);
    charManager.updateSpeechBubbles(camera);
  }
}

function setupScrollAnimations() {
  const stepCards = document.querySelectorAll('.step-card');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        // Stagger animation by DOM index
        const cards = Array.from(stepCards);
        const idx = cards.indexOf(entry.target);
        setTimeout(() => entry.target.classList.add('visible'), idx * 150);
      }
    });
  }, { threshold: 0.2 });
  stepCards.forEach(c => observer.observe(c));
}

// Exports for game engine
export { renderer, scene, camera, clock };
export { setGameActive } from './state.js';

// ── Boot sequence: tutorial shows AFTER loading completes
function boot() {
  runInit();
}

function runInit() {
  init().catch(err => {
    console.error('Failed to initialize AI Mafia:', err);
    const sub = document.getElementById('loading-screen')?.querySelector('.load-sub');
    if (sub) { sub.textContent = 'Error: ' + (err.message || String(err)); sub.style.color = '#ff4444'; }
    const bar = document.getElementById('loading-bar');
    if (bar) bar.style.background = '#ff2222';
  });
}

boot();
