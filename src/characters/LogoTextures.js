// LogoTextures.js
// Draws a branded fallback face immediately (sync), then swaps to the real PNG
// from the official LobeHub unpkg CDN async. Faces are NEVER blank.
//
// CDN: https://unpkg.com/@lobehub/icons-static-png@latest/{dark|light}/{slug}.png
// Slug list confirmed from https://github.com/lobehub/lobe-icons (March 2026)

import * as THREE from 'three';

// Official unpkg CDN — always serves the latest icon version, much more reliable
// than raw.githubusercontent.com which has rate limits and cache issues.
const CDN_DARK  = 'https://unpkg.com/@lobehub/icons-static-png@latest/dark/';
const CDN_LIGHT = 'https://unpkg.com/@lobehub/icons-static-png@latest/light/';

// key → { slug, light, bg, fg, label }
//   slug  : filename (without .png) in the lobehub static-png package
//   light : if true, load from /light/ CDN (colored icons on white bg look better)
//   bg    : background fill color for the full cube face
//   fg    : text color for fallback initial
//   label : short display label for fallback
const BRAND = {
  // ── OpenAI ────────────────────────────────────────────────────────────────
  chatgpt:  { slug: 'openai',         light: false, bg: '#10a37f', fg: '#ffffff', label: 'GPT'    },
  openai_o: { slug: 'openai',         light: false, bg: '#1a2d6b', fg: '#a0c4ff', label: 'o-AI'   },

  // ── Anthropic / Claude ────────────────────────────────────────────────────
  // 'claude' is now its own icon slug (separate from 'anthropic') — confirmed in lobehub icon list
  claude:   { slug: 'claude',         light: false, bg: '#cc5c35', fg: '#ffffff', label: 'Claude' },

  // ── Google Gemini ─────────────────────────────────────────────────────────
  gemini:   { slug: 'gemini-color',   light: true,  bg: '#ffffff', fg: '#4285F4', label: 'Gemini' },
  gemini2:  { slug: 'gemini-color',   light: true,  bg: '#f0fff4', fg: '#34a853', label: 'Flash'  },

  // ── xAI / Grok ───────────────────────────────────────────────────────────
  grok:     { slug: 'grok',           light: false, bg: '#000000', fg: '#ffffff', label: 'Grok'   },

  // ── DeepSeek ─────────────────────────────────────────────────────────────
  deepseek: { slug: 'deepseek-color', light: true,  bg: '#1a2d6b', fg: '#4d9fff', label: 'DS'     },

  // ── Moonshot / Kimi ───────────────────────────────────────────────────────
  kimi:     { slug: 'kimi-color',     light: true,  bg: '#0d0d2b', fg: '#c8d8ff', label: 'Kimi'   },

  // ── Zhipu / ChatGLM ───────────────────────────────────────────────────────
  glm:      { slug: 'chatglm-color',  light: true,  bg: '#3b5bf5', fg: '#ffffff', label: 'GLM'    },

  // ── MiniMax ───────────────────────────────────────────────────────────────
  minimax:  { slug: 'minimax-color',  light: true,  bg: '#4a1080', fg: '#d0a0ff', label: 'MM'     },

  // ── Mistral ───────────────────────────────────────────────────────────────
  mistral:  { slug: 'mistral-color',  light: true,  bg: '#ff6b00', fg: '#ffffff', label: 'MST'    },

  // ── Meta / Llama ─────────────────────────────────────────────────────────
  llama:    { slug: 'meta-color',     light: true,  bg: '#0064e0', fg: '#ffffff', label: 'Llama'  },

  // ── Qwen (Alibaba) ───────────────────────────────────────────────────────
  qwen:     { slug: 'qwen-color',     light: true,  bg: '#612b96', fg: '#e0b0ff', label: 'Qwen'   },

  // ── NVIDIA ────────────────────────────────────────────────────────────────
  nvidia:   { slug: 'nvidia-color',   light: true,  bg: '#1a3300', fg: '#76b900', label: 'NVDA'   },

  // ── Human player (no logo — draw initials only) ───────────────────────────
  human:    { slug: null,             light: false, bg: '#8b6914', fg: '#ffffff', label: '?'       },
};

// Texture cache — keyed by `brandKey:size` to avoid duplicate canvas/fetches
const cache = new Map();

export function createLogoTexture(key, size = 256) {
  const cacheKey = `${key}:${size}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const brand = BRAND[key] || {
    slug: null, light: false,
    bg: '#444444', fg: '#ffffff',
    label: key.slice(0, 3).toUpperCase(),
  };

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Draw sync fallback immediately — brand color + letter — so the face is
  // never blank while the PNG is loading.
  _drawFallback(ctx, size, brand);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  cache.set(cacheKey, tex);

  // Async: swap to the real brand PNG from unpkg CDN
  if (brand.slug) {
    const primary   = (brand.light ? CDN_LIGHT : CDN_DARK) + brand.slug + '.png';
    const secondary = (brand.light ? CDN_DARK  : CDN_LIGHT) + brand.slug + '.png';

    _loadPNG(primary, secondary, (img) => {
      if (!img) return; // keep fallback — both CDN variants failed
      ctx.clearRect(0, 0, size, size);

      // Full-square background — no rounded corners so the logo covers every
      // pixel of the cube face all the way to the edges.
      ctx.fillStyle = brand.bg;
      ctx.fillRect(0, 0, size, size);

      // Draw the PNG with very small padding (4%) so the logo nearly fills
      // the entire face — fixes the "leaves gaps at corners" issue.
      const pad = size * 0.04;
      ctx.drawImage(img, pad, pad, size - pad * 2, size - pad * 2);

      tex.needsUpdate = true;
    });
  }

  return tex;
}

// Load a PNG from primary URL, fall back to secondary if it 404s or errors.
function _loadPNG(primary, secondary, callback) {
  const tryLoad = (url, onFail) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload  = () => callback(img);
    img.onerror = onFail;
    img.src = url;
  };

  tryLoad(primary, () => {
    if (secondary) {
      tryLoad(secondary, () => callback(null));
    } else {
      callback(null);
    }
  });
}

// Sync fallback: full-square brand-colored face with a big initial letter.
// No rounded corners — the fill covers the entire canvas so no block-color
// bleeds through at the cube-face corners.
function _drawFallback(ctx, s, brand) {
  ctx.fillStyle = brand.bg;
  ctx.fillRect(0, 0, s, s);

  // Large initial letter
  ctx.fillStyle    = brand.fg;
  ctx.font         = `bold ${Math.round(s * 0.52)}px Arial, sans-serif`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(brand.label.slice(0, 1), s / 2, s * 0.46);

  // Smaller label line below
  ctx.font         = `bold ${Math.round(s * 0.14)}px Arial, sans-serif`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(brand.label, s / 2, s * 0.91);
}

// Human player: gradient gold face with their name initial
export function createHumanInitialTexture(initial, size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Full-square gold gradient — no rounded corners
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#8B6914');
  grad.addColorStop(1, '#c9a84c');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Big centred initial
  ctx.fillStyle    = '#ffffff';
  ctx.font         = `bold ${Math.round(size * 0.52)}px serif`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText((initial || '?').toUpperCase().slice(0, 1), size / 2, size / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

export function getBrandBg(key) {
  return (BRAND[key] || BRAND.human).bg;
}

export function getBrandLogoAsset(key) {
  const brand = BRAND[key] || {
    slug: null,
    light: false,
    bg: '#444444',
    fg: '#ffffff',
    label: key ? key.slice(0, 3).toUpperCase() : '?',
  };
  return {
    ...brand,
    primaryUrl: brand.slug ? ((brand.light ? CDN_LIGHT : CDN_DARK) + brand.slug + '.png') : null,
    secondaryUrl: brand.slug ? ((brand.light ? CDN_DARK : CDN_LIGHT) + brand.slug + '.png') : null,
  };
}

export function drawBrandLogoCanvas(canvas, key, labelOverride = null) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const width = canvas.width || 48;
  const height = canvas.height || 48;
  const size = Math.min(width, height);
  const brand = getBrandLogoAsset(key);
  const fallbackLabel = (labelOverride || brand.label || '?').toString();

  const drawFallback = () => {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = brand.bg;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = brand.fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${Math.round(size * 0.46)}px Arial, sans-serif`;
    ctx.fillText(fallbackLabel.slice(0, 1), width / 2, height * 0.46);
  };

  drawFallback();
  if (!brand.primaryUrl) return;

  _loadPNG(brand.primaryUrl, brand.secondaryUrl, (img) => {
    if (!img) return;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = brand.bg;
    ctx.fillRect(0, 0, width, height);
    const pad = size * 0.12;
    ctx.drawImage(img, pad, pad, width - pad * 2, height - pad * 2);
  });
}
