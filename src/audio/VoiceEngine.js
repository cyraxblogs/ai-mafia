// ─────────────────────────────────────────────────────────────────────────────
// VoiceEngine.js  — unique TTS voice per AI model, using Web Speech API
//
// Strategy:
//  Every model has an explicit hand-crafted profile:
//    • gender  — 'm' | 'f' | 'n'  (biases which voice object is picked)
//    • pitch   — 0.5 … 1.8  (lower = deeper, higher = lighter)
//    • rate    — always 1.0 (changing rate distorts playback speed)
//
//  This guarantees every model sounds distinct even on browsers that only
//  ship 4–5 voices, because each profile is a unique (voice, gender, pitch)
//  combination rather than just a random slot from the pool.
//
//  Voice-object selection:
//    1. Filter all English voices into male / female / neutral buckets.
//    2. Pick the best-quality voice in the model's preferred gender bucket.
//       If that bucket is empty, fall back to the neutral/opposite bucket.
//    3. Different gender assignments + pitch/rate deltas ensure that even
//       if two models land on the same SpeechSynthesisVoice object they
//       still sound clearly different.
//
//  Human player: never spoken aloud.
//  Public API: speak(player, text, onComplete), stop(), setEnabled(bool).
// ─────────────────────────────────────────────────────────────────────────────

// ── Voice quality scoring — best voices floated to the top ───────────────────
function _voiceScore(v) {
  const n = v.name;
  if (/natural/i.test(n))                       return 100; // Microsoft Neural
  if (/online/i.test(n) && /google/i.test(n))  return  90; // Google cloud
  if (/google/i.test(n))                        return  70; // Google local
  if (/microsoft/i.test(n))                     return  60; // Microsoft non-neural
  if (!v.localService)                          return  50; // any remote
  return 20;                                                 // local / basic
}

// ── Gender detection heuristic from voice name ────────────────────────────────
function _genderOf(v) {
  const n = v.name.toLowerCase();
  if (/\b(david|james|mark|guy|daniel|thomas|fred|paul|eric|ryan|john|male|man)\b/.test(n)) return 'm';
  if (/\b(zira|susan|linda|karen|alice|kate|sarah|samantha|lisa|victoria|female|woman)\b/.test(n)) return 'f';
  if (/google.*us.*english/.test(n)) return 'f';
  if (/google.*uk.*english.*male/.test(n)) return 'm';
  return 'n';
}

// ─────────────────────────────────────────────────────────────────────────────
// PER-MODEL VOICE PROFILES
// Each entry: { gender, pitch }
//   gender: 'm' | 'f' | 'n'  — biases which voice object is selected
//   pitch:  0.5 – 1.8         — lower = deeper, higher = lighter
//
// NOTE: rate is intentionally fixed at 1.0 for all models.
// Varying rate distorts voice playback speed which sounds unnatural.
// Pitch + gender bucket selection is sufficient to make every model distinct.
//
// Design intent:
//   OpenAI GPT family   → authoritative male; deeper as model size grows
//   Anthropic Claude    → refined female; opus deepest, haiku brightest
//   Google Gemini       → bright female; pro lowest, flash-lite highest
//   xAI Grok            → gravelly low male
//   DeepSeek            → mysterious mid-low male; R1 slightly deeper
//   Kimi / MoonshotAI   → lighter female; thinking model more contemplative
//   Qwen                → varies by size; neutral mid-range
//   MiniMax             → warm; M2.7 deepest, M2.5 highest
//   GLM / Zhipu         → crisp neutral
// ─────────────────────────────────────────────────────────────────────────────
const MODEL_VOICE_PROFILES = {

  // ── OpenAI GPT-5.4 family ─────────────────────────────────────────────────
  'openai/gpt-5.4-2026-03-05':            { gender: 'm', pitch: 0.80 },
  'openai/gpt-5.4-mini-2026-03-17':       { gender: 'm', pitch: 0.92 },
  'openai/gpt-5.4-nano-2026-03-17':       { gender: 'm', pitch: 1.08 },

  // ── Anthropic Claude family ───────────────────────────────────────────────
  'anthropic/claude-opus-4-7':            { gender: 'f', pitch: 0.82 },  // deepest/most deliberate opus
  'anthropic/claude-opus-4-6':            { gender: 'f', pitch: 0.86 },
  'anthropic/claude-sonnet-4-6':          { gender: 'f', pitch: 0.96 },
  'anthropic/claude-sonnet-4-5':          { gender: 'f', pitch: 1.04 },
  'anthropic/claude-haiku-4-5':           { gender: 'f', pitch: 1.18 },

  // ── Google Gemini family ──────────────────────────────────────────────────
  'google/gemini-3.1-pro-preview':        { gender: 'f', pitch: 1.02 },
  'google/gemini-3-flash-preview':        { gender: 'f', pitch: 1.14 },
  'google/gemini-3.1-flash-lite-preview': { gender: 'f', pitch: 1.28 },

  // ── xAI Grok ─────────────────────────────────────────────────────────────
  'x-ai/grok-4.1-fast-reasoning':         { gender: 'm', pitch: 0.72 },
  'x-ai/grok-4-1-fast-non-reasoning':     { gender: 'm', pitch: 0.82 },

  // ── DeepSeek ─────────────────────────────────────────────────────────────
  'deepseek/deepseek-v3.2':               { gender: 'm', pitch: 0.88 },
  'deepseek/deepseek-v3.1':               { gender: 'm', pitch: 0.95 },
  'deepseek/deepseek-r1-0528':            { gender: 'm', pitch: 0.84 },

  // ── Moonshot / Kimi ───────────────────────────────────────────────────────
  'moonshotai/kimi-k2-thinking':          { gender: 'f', pitch: 1.10 },
  'moonshotai/kimi-k2.5':                 { gender: 'f', pitch: 1.03 },
  'moonshotai/kimi-k2-0905':              { gender: 'f', pitch: 0.97 },

  // ── Qwen ─────────────────────────────────────────────────────────────────
  'qwen/qwen3.5-397b-a17b':              { gender: 'm', pitch: 0.76 },
  'qwen/qwen3-vl-235b-a22b-instruct':    { gender: 'n', pitch: 0.88 },
  'qwen/qwen3-coder-480b-a35b-instruct': { gender: 'n', pitch: 1.02 },

  // ── MiniMax ───────────────────────────────────────────────────────────────
  'minimax/minimax-m2.7':                 { gender: 'm', pitch: 0.70 },
  'minimax/minimax-m2':                   { gender: 'm', pitch: 0.84 },
  'minimax/minimax-m2.5':                 { gender: 'f', pitch: 1.10 },

  // ── GLM / Zhipu ───────────────────────────────────────────────────────────
  'zai-org/glm-5.1':                      { gender: 'n', pitch: 0.94 },  // flagship — slightly deeper than glm-5
  'zai-org/glm-5':                        { gender: 'n', pitch: 1.00 },
  'zai-org/glm-5-turbo':                  { gender: 'n', pitch: 1.06 },
  'zai-org/glm-4.7':                      { gender: 'n', pitch: 0.91 },
};

export class VoiceEngine {
  constructor() {
    this._enabled          = true;
    this._voicePool        = { m: [], f: [], n: [] };
    this._voiceCache       = new Map();
    this._ready            = false;
    this._readyQueue       = [];
    this._currentUtterance = null;
    // Tracks the onComplete callback of the currently playing speech so that
    // stop() can fire it when TTS is cancelled mid-turn (e.g. mute button).
    // Without this, the turn's safetyCap had to expire (up to 30s) before the
    // next speaker could start — and rapid mute/unmute left safetyCap orphaned,
    // causing advanceTurn() to fire twice and two models to speak simultaneously.
    this._pendingOnComplete = null;

    this._init();
  }

  _init() {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      console.warn('[VoiceEngine] speechSynthesis not available — TTS disabled');
      return;
    }

    const load = () => {
      const all     = window.speechSynthesis.getVoices();
      const english = all.filter(v => /^en/i.test(v.lang));
      if (!english.length) return;

      const sorted = english.slice().sort((a, b) => _voiceScore(b) - _voiceScore(a));
      this._voicePool = { m: [], f: [], n: [] };
      for (const v of sorted) {
        const g = _genderOf(v);
        this._voicePool[g].push(v);
        if (g !== 'n') this._voicePool.n.push(v);
      }

      this._voiceCache.clear();
      this._ready = true;

      const fm = this._voicePool.m.length, ff = this._voicePool.f.length;
      console.log(`[VoiceEngine] ${sorted.length} English voices (${fm} male, ${ff} female). Custom profiles for ${Object.keys(MODEL_VOICE_PROFILES).length} models.`);
      this._readyQueue.forEach(fn => fn());
      this._readyQueue = [];
    };

    load();
    if (!this._ready) {
      window.speechSynthesis.onvoiceschanged = () => { load(); };
    }
  }

  _voiceObjectFor(modelId) {
    if (this._voiceCache.has(modelId)) return this._voiceCache.get(modelId);

    const profile     = MODEL_VOICE_PROFILES[modelId];
    const gender      = profile?.gender ?? 'n';
    const bucketOrder = gender === 'm' ? ['m', 'n', 'f']
                      : gender === 'f' ? ['f', 'n', 'm']
                      :                  ['n', 'f', 'm'];

    let voice = null;
    for (const g of bucketOrder) {
      if (this._voicePool[g]?.length) {
        const bucket = this._voicePool[g];
        voice = bucket[_hashStr(modelId) % bucket.length];
        break;
      }
    }

    this._voiceCache.set(modelId, voice);
    return voice;
  }

  speak(player, text, onComplete) {
    if (!this._enabled)       { onComplete?.(); return; }
    if (!text?.trim())        { onComplete?.(); return; }
    if (player?.isHuman)      { onComplete?.(); return; }
    if (typeof window === 'undefined' || !window.speechSynthesis) { onComplete?.(); return; }

    // Cancel any in-progress speech WITHOUT firing its pending callback —
    // the new call is intentionally taking over, not completing the old one.
    this._cancelSilent();

    const doSpeak = () => {
      const modelId = player.model;
      const profile = MODEL_VOICE_PROFILES[modelId] ?? { pitch: 1.0 };
      const voice   = this._voiceObjectFor(modelId);
      const chunks  = _chunkText(text, 180);

      const speakChunk = (idx) => {
        if (idx >= chunks.length) {
          // All chunks done — fire callback and clear the pending reference
          const cb = this._pendingOnComplete;
          this._pendingOnComplete = null;
          cb?.();
          return;
        }
        const utt    = new SpeechSynthesisUtterance(chunks[idx]);
        if (voice) utt.voice = voice;
        utt.lang   = 'en-US';
        utt.pitch  = profile.pitch ?? 1.0;
        utt.rate   = 1.0;
        utt.volume = 1.0;
        utt.onend  = () => speakChunk(idx + 1);
        utt.onerror = (e) => {
          if (e.error !== 'interrupted') {
            // Unexpected error — fire callback so the turn can still advance
            console.warn('[VoiceEngine] utterance error:', e.error);
            const cb = this._pendingOnComplete;
            this._pendingOnComplete = null;
            cb?.();
          }
          // 'interrupted' is always handled by whoever called stop() / _cancelSilent()
        };
        this._currentUtterance = utt;
        window.speechSynthesis.speak(utt);
      };

      // Register the callback BEFORE starting chunks so stop() can find it
      this._pendingOnComplete = onComplete;
      speakChunk(0);
    };

    if (this._ready) doSpeak();
    else this._readyQueue.push(doSpeak);
  }

  // Cancel current speech and fire the pending onComplete so the game turn
  // advances cleanly. Used by setEnabled(false) (mute button).
  stop() {
    this._cancelSilent(true);
  }

  // Internal cancel — optionally fires the pending callback.
  // fireCallback=false : used at start of speak() to take over from previous
  // fireCallback=true  : used by stop() / setEnabled(false) so the turn unblocks
  _cancelSilent(fireCallback = false) {
    const cb = fireCallback ? this._pendingOnComplete : null;
    this._pendingOnComplete = null;
    this._currentUtterance  = null;
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    // Fire AFTER cancel() so any browser 'interrupted' onerror fires first
    // and is correctly ignored (pendingOnComplete is already null by then)
    if (cb) setTimeout(cb, 0);
  }

  setEnabled(enabled) {
    this._enabled = enabled;
    if (!enabled) {
      // Cancel audio only. Do NOT fire _pendingOnComplete — the turn's display
      // timer is still running and will advance the game at the right time.
      // The safetyCap in engine.js fires 2s after display window closes as backup.
      this._cancelSilent(false);
    }
  }

  getVoiceInfo(modelId) {
    const profile   = MODEL_VOICE_PROFILES[modelId];
    const voiceName = this._voiceObjectFor(modelId)?.name ?? '(default)';
    if (!profile) return `${voiceName} [no profile]`;
    return `${voiceName} | pitch:${profile.pitch} rate:1.0 (${profile.gender})`;
  }

  getVoiceName(modelId) { return this._voiceObjectFor(modelId)?.name ?? '(default)'; }

  static isSupported() {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }
}

// ── Deterministic string hash (djb2 xor) ─────────────────────────────────────
function _hashStr(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
    h >>>= 0;
  }
  return h;
}

// ── Split text at sentence/clause boundaries under maxLen chars ───────────────
function _chunkText(text, maxLen) {
  if (text.length <= maxLen) return [text];
  const chunks = [];
  const parts  = text.split(/(?<=[.!?,])\s+/g);
  let current  = '';
  for (const part of parts) {
    if ((current + ' ' + part).trim().length <= maxLen) {
      current = current ? current + ' ' + part : part;
    } else {
      if (current) chunks.push(current.trim());
      if (part.length > maxLen) {
        const words = part.split(' ');
        current = '';
        for (const w of words) {
          if ((current + ' ' + w).trim().length <= maxLen) {
            current = current ? current + ' ' + w : w;
          } else {
            if (current) chunks.push(current.trim());
            current = w;
          }
        }
      } else {
        current = part;
      }
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(Boolean);
}
