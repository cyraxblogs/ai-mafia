import { ICON_MAFIA, ICON_DOCTOR, ICON_SHERIFF, ICON_VILLAGER, ICON_GUN, ICON_EYE, ICON_SUN, ICON_MOON, ICON_SKULL, ICON_CHAT, ICON_SCALES, ICON_THINKING, ICON_SHIELD, ICON_KILLSHOT, ICON_INVESTIGATE, ICON_WARNING, ICON_CLIPBOARD, icon } from '../src/ui/PixelIcons.js';
import * as THREE from 'three';
import { gsap } from 'gsap';
import { MODELS, STATIC_MODELS, MODEL_META, buildModelEntry } from './models.js';
import {
  buildSystemPrompt, buildUserMessage, buildVotePrompt,
  buildNightMafiaPrompt, buildNightSheriffPrompt, buildNightDoctorPrompt,
  buildMafiaDiscussPrompt
} from './prompts.js';
import { setGameActive } from '../src/state.js';
import { DeathHandler } from '../src/utils/DeathHandler.js';
import { drawBrandLogoCanvas } from '../src/characters/LogoTextures.js';
import { computeSeats } from '../src/characters/CharacterManager.js';


// ═══════════════════════════════════════════════════════════════════════════
// DEBUG CONSOLE — intercept all console.log/warn/error and store for in-game panel
// Press F12 to toggle the console panel (backtick kept as fallback)
const _debugLogs = [];
const _origLog   = console.log.bind(console);
const _origWarn  = console.warn.bind(console);
const _origErr   = console.error.bind(console);
let _renderScheduled = false;
function _safeStr(a) {
  if (typeof a !== 'object' || a === null) return String(a);
  try { return JSON.stringify(a); } catch { return '[Object]'; }
}
function _pushLog(level, args) {
  const text = args.map(_safeStr).join(' ');
  _debugLogs.push({ level, text, t: Date.now() });
  if (_debugLogs.length > 300) _debugLogs.shift();
  // Only re-render if panel is visible AND not already scheduled (throttle to 1/frame)
  const panel = document.getElementById('_debug_panel');
  if (panel && panel.style.display !== 'none' && !_renderScheduled) {
    _renderScheduled = true;
    requestAnimationFrame(() => { _renderScheduled = false; _renderDebugPanel(); });
  }
}
console.log   = (...a) => { try { _origLog(...a);  _pushLog('log',  a); } catch {} };
console.warn  = (...a) => { try { _origWarn(...a); _pushLog('warn', a); } catch {} };
console.error = (...a) => { try { _origErr(...a);  _pushLog('err',  a); } catch {} };
window.addEventListener('keydown', e => {
  if (e.key === 'F12' || e.key === 'F13') {
    const p = document.getElementById('_debug_panel');
    if (!p) return;
    p.style.display = p.style.display === 'none' ? 'flex' : 'none';
    if (p.style.display !== 'none') _renderDebugPanel();
  }
});
function _renderDebugPanel() {
  const body = document.getElementById('_debug_body');
  if (!body) return;
  // Filter out noisy THREE.js material parameter warnings
  const filtered = _debugLogs.filter(l => !l.text.includes('THREE.Material: parameter'));
  body.innerHTML = filtered.slice(-80).reverse().map(l => {
    const col = l.level==='err'?'#ff6b6b':l.level==='warn'?'#ffd93d':'#c9d1d9';
    const t   = new Date(l.t).toISOString().slice(11,23);
    return `<div style="font-size:11px;line-height:1.4;color:${col};border-bottom:1px solid rgba(255,255,255,0.05);padding:2px 0">` +
           `<span style="opacity:0.4;margin-right:6px">${t}</span>${l.text}</div>`;
  }).join('');
}
// ═══════════════════════════════════════════════════════════════════════════
// SpectatorHUD — Turing Games style spectator overlay
// Manages: player sidebar, event feed, vote tracker, lower-third, kill overlay
// ═══════════════════════════════════════════════════════════════════════════
class SpectatorHUD {
  constructor() {
    this._sidebar     = document.getElementById('spec-sidebar');
    this._announcer   = document.getElementById('spec-announcer');
    this._annPhase    = document.getElementById('spec-announcer-phase');
    this._annEvent    = document.getElementById('spec-announcer-event');
    this._killOverlay = document.getElementById('spec-kill-overlay');
    this._killName    = document.getElementById('spec-kill-name');
    this._killRole    = document.getElementById('spec-kill-role');
    this._lowerThird  = document.getElementById('spec-lower-third');
    this._lowerSpkr   = document.getElementById('spec-lower-speaker');
    this._lowerText   = document.getElementById('spec-lower-text');
    this._voteTracker = document.getElementById('spec-vote-tracker');
    this._eventFeed   = document.getElementById('spec-event-feed');
    this._active      = false;
    this._minimalNightUi = false;
    this._lowerTimeout = null;
    this._annTimeout   = null;
  }

  activate(players) {
    this._active = true;
    // sidebar hidden — roles shown in right player-list instead
    if (this._eventFeed && !this._minimalNightUi) this._eventFeed.classList.add('visible');
  }

  deactivate() {
    this._active = false;
    this._minimalNightUi = false;
    document.body?.classList.remove('spec-night-minimal');
    [this._sidebar, this._announcer, this._lowerThird, this._voteTracker, this._eventFeed]
      .forEach(el => el?.classList.remove('visible'));
  }

  // ── Player Sidebar ────────────────────────────────────────────────────────
  updateSidebar(players) {
    if (!this._sidebar || !this._active) return;
    this._sidebar.innerHTML = '';
    players.forEach(p => {
      const card = document.createElement('div');
      card.className = `spec-player-card ${p.alive ? 'alive' : 'dead'}`;
      card.id = `spec-card-${p.id}`;

      // Role color
      const roleColors = {
        mafia: '#ef4444', sheriff: '#fcd34d', doctor: '#60a5fa', villager: '#6ee7b7'
      };
      const roleColor = roleColors[p.role] || '#9ca3af';
      const roleIcon = { mafia:ICON_MAFIA(13), sheriff:ICON_SHERIFF(13), doctor:ICON_DOCTOR(13), villager:ICON_VILLAGER(13) }[p.role] || '?';

      card.innerHTML = `
        <div class="spec-player-avatar" style="background:${p.logoColor||roleColor}22;border:2px solid ${p.logoColor||roleColor}44">
          <canvas width="32" height="32" id="spec-av-${p.id}" style="border-radius:4px"></canvas>
        </div>
        <div class="spec-player-info">
          <div class="spec-player-name">${p.name}</div>
          <div class="spec-player-role" style="color:${roleColor}">${roleIcon} ${p.role}</div>
        </div>
        <div class="spec-player-status">${p.alive ? '●' : '✖'}</div>
      `;
      this._sidebar.appendChild(card);

      // Draw avatar canvas
      setTimeout(() => {
        const canvas = document.getElementById(`spec-av-${p.id}`);
        if (canvas && typeof _drawVtbFace === 'function') _drawVtbFace(canvas, p);
      }, 100);
    });
  }

  setSpeaking(playerId, speaking) {
    if (!this._active) return;
    document.querySelectorAll('.spec-player-card').forEach(c => c.classList.remove('speaking'));
    if (speaking && playerId) {
      document.getElementById(`spec-card-${playerId}`)?.classList.add('speaking');
    }
  }

  setDead(playerId) {
    const card = document.getElementById(`spec-card-${playerId}`);
    if (card) {
      card.classList.remove('alive');
      card.classList.add('dead');
      const status = card.querySelector('.spec-player-status');
      if (status) status.textContent = '[x]';
    }
  }

  // ── Lower Third (speaker bar) ─────────────────────────────────────────────
  showSpeaking(playerName, text, durationMs) {
    if (!this._lowerThird || !this._active) return;
    if (this._lowerTimeout) clearTimeout(this._lowerTimeout);
    this._lowerSpkr.textContent = playerName;
    this._lowerText.textContent = text || '';
    this._lowerThird.classList.add('visible');
    this._lowerTimeout = setTimeout(() => {
      this._lowerThird.classList.remove('visible');
    }, durationMs || 5000);
  }

  updateLowerText(text) {
    if (this._lowerText && this._active) this._lowerText.textContent = text;
  }

  hideLowerThird() {
    this._lowerThird?.classList.remove('visible');
    if (this._lowerTimeout) { clearTimeout(this._lowerTimeout); this._lowerTimeout = null; }
  }

  setMinimalNightUi(enabled) {
    this._minimalNightUi = !!enabled;
    document.body?.classList.toggle('spec-night-minimal', this._minimalNightUi);
    if (enabled) {
      this._announcer?.classList.remove('visible');
      this.hideVoteTracker();
      this.hideMafiaChat();
      this.setWatching(null);
      this.hideNightIcons();
      if (this._eventFeed) this._eventFeed.classList.remove('visible');
      const thoughtPanel = document.getElementById('thought-panel');
      if (thoughtPanel) thoughtPanel.classList.remove('visible');
      const nightBadge = document.getElementById('night-location-badge');
      if (nightBadge) nightBadge.classList.remove('visible');
      const cotBar = document.getElementById('spec-cot-bar');
      if (cotBar) cotBar.style.display = 'none';
      const shotLabel = document.getElementById('spec-shot-label');
      if (shotLabel) shotLabel.textContent = '';
      // KEEP the lower-third subtitle visible — it's one of our 2 night UI boxes
      if (this._lowerThird) this._lowerThird.classList.add('visible');
      return;
    }
    if (this._active && this._eventFeed) this._eventFeed.classList.add('visible');
  }

  // ── Top Announcer ─────────────────────────────────────────────────────────
  announce(phase, event, durationMs = 3500) {
    if (this._minimalNightUi) return;
    if (!this._announcer || !this._active) return;
    if (this._annTimeout) clearTimeout(this._annTimeout);
    this._annPhase.textContent  = phase || '';
    this._annEvent.textContent  = event || '';
    this._announcer.classList.add('visible');
    this._annTimeout = setTimeout(() => {
      this._announcer.classList.remove('visible');
    }, durationMs);
  }

  // ── Kill/Elimination Dramatic Overlay ─────────────────────────────────────
  showKill(playerName, role) {
    if (!this._killOverlay || !this._active) return;
    const roleLabels = { mafia:'[MAFIA] WAS MAFIA', sheriff:'[SHERIFF] WAS THE SHERIFF',
                         doctor:'[DOCTOR] WAS THE DOCTOR', villager:'[INNOCENT] WAS INNOCENT' };
    this._killName.textContent = playerName;
    this._killRole.textContent = roleLabels[role] || role?.toUpperCase() || '';
    this._killOverlay.classList.add('active');
    setTimeout(() => this._killOverlay.classList.remove('active'), 2600);
  }

  // ── Vote Tracker ──────────────────────────────────────────────────────────
  showVoteTracker(alive) {
    if (this._minimalNightUi) return;
    if (!this._voteTracker || !this._active) return;
    this._voteTracker.classList.add('visible');
    this._voteAlive = alive;
    this._voteTally = {};
    this._renderVoteTally();
  }

  updateVote(voterId, targetId, alive) {
    if (!this._active) return;
    this._voteTally = this._voteTally || {};
    // Remove previous vote from this voter
    for (const k of Object.keys(this._voteTally)) {
      if (this._voteTally[k]?.voters) {
        this._voteTally[k].voters = this._voteTally[k].voters.filter(v => v !== voterId);
      }
    }
    if (!targetId || targetId === 'skip') return this._renderVoteTally();
    if (!this._voteTally[targetId]) this._voteTally[targetId] = { count: 0, voters: [] };
    this._voteTally[targetId].voters.push(voterId);
    this._voteTally[targetId].count = this._voteTally[targetId].voters.length;
    this._renderVoteTally();

    // Also add event
    const voter  = alive?.find(p => p.id === voterId);
    const target = alive?.find(p => p.id === targetId);
    if (voter && target) this.addEvent(`${voter.name} → ${target.name}`, 'vote');
  }

  hideVoteTracker() {
    this._voteTracker?.classList.remove('visible');
    this._voteTally = {};
  }

  _renderVoteTally() {
    if (!this._voteTracker) return;
    // Keep header, remove old rows
    const header = this._voteTracker.querySelector('#spec-vote-header');
    this._voteTracker.innerHTML = '';
    if (header) this._voteTracker.appendChild(header);
    else {
      const h = document.createElement('div');
      h.id = 'spec-vote-header'; h.textContent = 'VOTE TALLY';
      this._voteTracker.appendChild(h);
    }

    const entries = Object.entries(this._voteTally || {})
      .filter(([,v]) => v.count > 0)
      .sort((a,b) => b[1].count - a[1].count);
    const maxVotes = entries[0]?.[1].count || 1;

    for (const [id, data] of entries) {
      const alive = this._voteAlive || [];
      const p = alive.find(x => x.id === id);
      const row = document.createElement('div');
      row.className = 'spec-vote-row';
      row.style.position = 'relative'; row.style.overflow = 'hidden';
      const pct = Math.round((data.count / maxVotes) * 100);
      row.innerHTML = `
        <div class="spec-vote-bar" style="width:${pct}%"></div>
        <span class="spec-vote-name" style="position:relative">${p?.name || id}</span>
        <span class="spec-vote-count" style="position:relative">${data.count}</span>
      `;
      this._voteTracker.appendChild(row);
    }
  }

  // ── Night Phase Icons Row ──────────────────────────────────────────────
  // Shows a row of role icons at top of screen; highlights the currently active role
  showNightIcons(roles) {
    if (this._minimalNightUi) return;
    const el = document.getElementById('spec-night-icons');
    if (!el) return;
    this._nightIconRoles = roles; // [{role:'mafia',names:'X & Y'}, ...]
    el.innerHTML = '';
    for (const r of roles) {
      const icon = document.createElement('div');
      const svgIcon = {
        mafia:   ICON_MAFIA(16),
        doctor:  ICON_DOCTOR(16),
        sheriff: ICON_SHERIFF(16),
      }[r.role] || '?';
      const label = { mafia: 'MAFIA', doctor: 'DOCTOR', sheriff: 'SHERIFF' }[r.role] || r.role.toUpperCase();
      icon.className = `spec-night-icon ${r.role}-icon`;
      icon.id = `spec-night-icon-${r.role}`;
      icon.innerHTML = `<span class="ni-emoji" style="font-size:0;line-height:0">${svgIcon}</span>${label}`;
      el.appendChild(icon);
    }
    el.classList.add('visible');
  }

  setNightIconActive(role) {
    if (this._minimalNightUi) return;
    document.querySelectorAll('.spec-night-icon').forEach(el => {
      el.classList.remove('active');
    });
    const active = document.getElementById(`spec-night-icon-${role}`);
    if (active) active.classList.add('active');
  }

  setNightIconDone(role) {
    if (this._minimalNightUi) return;
    const icon = document.getElementById(`spec-night-icon-${role}`);
    if (icon) {
      icon.classList.remove('active');
      icon.classList.add('done');
    }
  }

  hideNightIcons() {
    const el = document.getElementById('spec-night-icons');
    if (el) el.classList.remove('visible');
  }

  // ── Event Feed ───────────────────────────────────────────────────────────
  addEvent(text, type = 'default') {
    if (this._minimalNightUi) return;
    if (!this._eventFeed || !this._active) return;
    const item = document.createElement('div');
    item.className = `spec-event-item ${type}`;
    item.textContent = text;
    this._eventFeed.prepend(item);
    while (this._eventFeed.children.length > 6) {
      this._eventFeed.removeChild(this._eventFeed.lastChild);
    }
    setTimeout(() => item.style.opacity = '0.4', 8000);
  }

  // ── Night icon countdown timers ──────────────────────────────────────────
  // Starts a visual countdown on the active night icon
  startNightIconTimer(role, durationMs) {
    if (this._minimalNightUi) return;
    const icon = document.getElementById(`spec-night-icon-${role}`);
    if (!icon) return;
    // Add timer bar if not present
    let timerEl = icon.querySelector('.ni-timer');
    if (!timerEl) {
      timerEl = document.createElement('div');
      timerEl.className = 'ni-timer';
      timerEl.innerHTML = '<div class="ni-timer-bar"></div>';
      icon.appendChild(timerEl);
    }
    const bar = timerEl.querySelector('.ni-timer-bar');
    if (!bar) return;
    bar.style.transition = 'none';
    bar.style.width = '100%';
    // Force reflow then animate
    bar.offsetWidth;
    bar.style.transition = `width ${durationMs}ms linear`;
    bar.style.width = '0%';
  }

  // ── Vignette effect ───────────────────────────────────────────────────────
  // type: 'kill' (red vignette) or 'night' (dark blue) or null (clear)
  setVignette(type, durationMs = 3000) {
    const el = document.getElementById('spec-vignette');
    if (!el) return;
    el.className = type || '';
    if (type && durationMs) {
      setTimeout(() => {
        el.className = '';
      }, durationMs);
    }
  }

  // ── Mafia secret chat panel ───────────────────────────────────────────────
  showMafiaChat() {
    if (this._minimalNightUi) return;
    const el = document.getElementById('spec-mafia-chat');
    if (el) el.classList.add('visible');
  }
  hideMafiaChat() {
    const el = document.getElementById('spec-mafia-chat');
    if (el) el.classList.remove('visible');
    const body = document.getElementById('spec-mafia-chat-body');
    if (body) body.innerHTML = '';
  }
  addMafiaChatMsg(speakerName, text) {
    if (this._minimalNightUi) return;
    const body = document.getElementById('spec-mafia-chat-body');
    if (!body || !this._active) return;
    const msg = document.createElement('div');
    msg.className = 'spec-mafia-msg';
    msg.innerHTML = `<span class="smm-name">${speakerName}</span>${text}`;
    body.appendChild(msg);
    body.scrollTop = body.scrollHeight;
    // Keep max 12 messages
    while (body.children.length > 12) body.removeChild(body.firstChild);
  }

  // ── "Now watching" location badge ────────────────────────────────────────
  setWatching(label, color) {
    const el    = document.getElementById('spec-watching');
    const dot   = document.getElementById('spec-watching-dot');
    const lbl   = document.getElementById('spec-watching-label');
    if (!el) return;
    if (this._minimalNightUi) {
      el.classList.remove('visible');
      return;
    }
    if (label) {
      if (lbl) lbl.textContent = label.toUpperCase();
      if (dot && color) dot.style.background = color;
      el.classList.add('visible');
    } else {
      el.classList.remove('visible');
    }
  }
}


// ── Client-side model timeout helpers (mirrors server.js logic) ──────────────
// These must stay in sync with LARGE_MODEL_SLUGS / THINKING_MODEL_SLUGS in server.js
const _CLIENT_LARGE_SLUGS    = ['235b','397b','480b','kimi-k2-thinking'];
const _CLIENT_THINKING_SLUGS = ['kimi-k2','deepseek-r1','deepseek-r2','qwq','qvq','fast-reasoning','qwen3','glm-5','glm-4','gemini-3.1-pro','minimax'];
const DAY_VOTE_LIMIT_MS      = 45000;
function _isLargeModel(model)    { const s = model.toLowerCase(); return _CLIENT_LARGE_SLUGS.some(k => s.includes(k)); }
function _isThinkingModel(model) { const s = model.toLowerCase(); return _CLIENT_THINKING_SLUGS.some(k => s.includes(k)); }

// ─── Strip internal reasoning / thinking leaks from AI speech responses ────────
// Some non-thinking models output their strategy chain-of-thought inline.
// This function extracts only the actual spoken game-statement, discarding:
//   • <think>…</think> blocks (reasoning models that forgot to strip tags)
//   • "**My response:**" / "My response:" header patterns
//   • Numbered strategy lists ("1. Stay neutral…", "2. NOT defend…")
//   • Lines starting with meta-words like "Strategy:", "Plan:", "Internal:"
//   • Refusal preambles from overly-cautious models ("I need to pause…")
// If the result is empty or very short, falls back to the last non-empty sentence.
function _cleanSpeechResponse(raw) {
  if (!raw) return '';
  let text = raw.trim();

  // 1. Strip <think>…</think> blocks entirely
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // 2. Strip "**My response:**" / "My response:" style dividers and everything above
  const myRespMatch = text.match(/\*{0,2}my response[:\*]{0,3}\s*/i);
  if (myRespMatch) {
    const idx = text.toLowerCase().lastIndexOf(myRespMatch[0].toLowerCase());
    const after = text.slice(idx + myRespMatch[0].length).trim();
    if (after.length > 5) text = after;
  }

  // 3. Strip lines that are clearly internal reasoning / strategy notes
  const REASONING_PATTERNS = [
    /^(i need to pause|i need to be careful|i'm claude|as claude|i cannot roleplay|i can't roleplay)/i,
    /^(strategy|plan|approach|thinking|internal|analysis|step \d|my goal|objective):/i,
    /^\d+\.\s+(stay |not |don't |avoid |protect |reinforce |look like)/i,
    /^(the game (setup|asks|wants)|this (setup|scenario|context) asks)/i,
    /^(even in (a )?fictional|in (a )?fictional|for (a )?fictional)/i,
    /^(i (should|will|must|need to) (stay|not|avoid|keep|protect|seem|appear))/i,
    /^\*\*(stay|not |don't |avoid|reinforce|look)/i,
  ];
  const lines = text.split('\n').filter(l => l.trim());
  const cleanLines = lines.filter(l => !REASONING_PATTERNS.some(p => p.test(l.trim())));

  // 4. If cleaning removed everything, fall back to last quoted string or last sentence
  const result = cleanLines.join(' ').replace(/\s+/g, ' ').trim();
  if (result.length < 4) {
    // Try to find a quoted speech fragment
    const quoted = raw.match(/"([^"]{4,})"/);
    if (quoted) return quoted[1].trim();
    // Last non-empty line as fallback
    const lastLine = lines.filter(l => l.trim().length > 3).pop();
    return lastLine ? lastLine.trim() : raw.trim();
  }

  // 5. If still very long (model dumped an essay), take only the first 2 sentences
  if (result.length > 200) {
    const sentences = result.match(/[^.!?]+[.!?]+/g) || [result];
    return sentences.slice(0, 2).join(' ').trim();
  }

  return result;
}
// Returns ms — add 5s buffer over server's timeout so server can cleanly close before client aborts
function _clientFetchTimeout(model, base = 35000) {
  if (_isLargeModel(model))    return 95000;   // server=90s + 5s buffer
  if (_isThinkingModel(model)) return 65000;   // server=60s + 5s buffer
  return base;
}
// Soft timeout (setTimeout inside speak/night) — slightly less than fetch so server response wins
function _clientSoftTimeout(model, base = 35000) {
  if (_isLargeModel(model))    return 88000;
  if (_isThinkingModel(model)) return 58000;
  return base;
}

export class GameEngine {
  constructor({ scene, camera, renderer, charManager, cinCamera, soundEngine, voiceEngine, village, skybox, hud, chatLog, actionPanel, tutorial, connectionOverlay, creditOverlay }) {
    this.scene = scene; this.camera = camera; this.renderer = renderer;
    this.charManager = charManager; this.cinCamera = cinCamera;
    this.soundEngine = soundEngine; this.voiceEngine = voiceEngine || null;
    this.village = village;
    this.skybox = skybox; this.hud = hud; this.chatLog = chatLog;
    this.actionPanel = actionPanel; this.tutorial = tutorial;
    this.connectionOverlay = connectionOverlay; this.creditOverlay = creditOverlay;
    this.config = null; this.state = null;
    this.timerInterval = null; this.muted = false; this.tokenCount = 0;
    this._spectateMode = false;
    this._cotHideTimer = null; // tracks the 9s cot-bar hide timeout so new streams can cancel it
    this.specHUD = new SpectatorHUD();
    
    // Initialize unified death handler for all death types
    this.deathHandler = new DeathHandler(
      scene, village, charManager, cinCamera, soundEngine, hud, this.specHUD
    );
  }

  // -- Subtitle helpers
  _isHumanSpeakPanelVisible() {
    return document.getElementById('speak-input-panel')?.classList.contains('visible');
  }
  _showSubtitle(speaker, text, roleColor, durationMs) {
    const bar    = document.getElementById('subtitle-bar');
    const nameEl = document.getElementById('subtitle-speaker');
    const txtEl  = document.getElementById('subtitle-text');
    if (!bar) return;
    if (this._isHumanSpeakPanelVisible()) {
      this._hideSubtitle();
      return;
    }
    nameEl.textContent = speaker.toUpperCase();
    nameEl.style.color = roleColor || '#f0d080';
    txtEl.textContent  = text;
    
    // Apply phase-based positioning classes
    bar.classList.remove('voting-phase', 'night-phase');
    const currentPhase = this.state?.phase?.toUpperCase() || 'DAY';
    if (currentPhase === 'NIGHT') {
      bar.classList.add('night-phase');
    } else if (this.state?.votingActive || this._isVotingPhase) {
      bar.classList.add('voting-phase');
    }
    
    bar.classList.add('visible');
    if (this._subTimer) clearTimeout(this._subTimer);
    // Auto-hide after display time
    const ms = durationMs || Math.max(3000, Math.min(8000, text.length * 60));
    this._subTimer = setTimeout(() => bar.classList.remove('visible'), ms);
  }
  _hideSubtitle() {
    const b = document.getElementById('subtitle-bar');
    const nameEl = document.getElementById('subtitle-speaker');
    const txtEl = document.getElementById('subtitle-text');
    if (b) b.classList.remove('visible');
    if (nameEl) nameEl.textContent = '';
    if (txtEl) txtEl.textContent = '';
    if (this._subTimer) { clearTimeout(this._subTimer); this._subTimer = null; }
  }
  _autoHideSubtitle(ms) {
    if (this._subTimer) clearTimeout(this._subTimer);
    const b = document.getElementById('subtitle-bar');
    this._subTimer = setTimeout(() => this._hideSubtitle(), ms);
  }
  _getPublicSpeechText(raw) {
    return _cleanSpeechResponse(raw || '');
  }
  _resolveNightStreamSurfaceTexts(answerText, options = {}) {
    const cleanedAnswer = this._getPublicSpeechText(answerText);
    return {
      cleanedAnswer,
      publicAnswer: options.showPublicAnswer === false ? '' : cleanedAnswer,
      cotAnswer: options.showCotAnswer === false ? '' : cleanedAnswer,
    };
  }
  _escapeHtml(text) {
    return String(text ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  _hideLegacySpectatorCotBar() {
    const cotBar = document.getElementById('spec-cot-bar');
    const cotText = document.getElementById('spec-cot-bar-text');
    if (cotBar) cotBar.style.display = 'none';
    if (cotText) cotText.textContent = '';
  }
  _renderSpectatorCotEntry(entry, {
    role = 'villager',
    label = '',
    thinkText = '',
    answerText = '',
    isAction = false,
    isLive = false,
  } = {}) {
    if (!entry) return;
    const safeRole = role || 'villager';
    const roleColor = this._roleColor(safeRole);
    const roleIcon = { mafia:'▲', sheriff:'◆', doctor:'✚', villager:'⌂' }[safeRole] || '•';
    const safeLabel = this._escapeHtml(label || 'UNKNOWN');
    const titleLabel = safeLabel.startsWith(roleIcon) ? safeLabel : `${roleIcon} ${safeLabel}`;
    const safeThink = this._escapeHtml(thinkText || '');
    const safeAnswer = this._escapeHtml(answerText || '');
    const badge = isLive ? 'STREAMING' : (isAction ? 'ACTION' : (safeAnswer ? 'FINAL ANSWER' : 'CHAIN OF THOUGHT'));
    const showThink = Boolean(safeThink || isLive || !safeAnswer);
    const thinkMarkup = showThink
      ? `<div style="font-family:'Crimson Pro',serif;font-size:0.9rem;line-height:1.5;color:#aeb7c5;font-style:italic;white-space:pre-wrap;word-break:break-word">
          ${safeThink || '<span style="opacity:0.55">thinking…</span>'}${isLive ? '<span style="opacity:0.45;animation:blink 1s infinite"> ▌</span>' : ''}
        </div>`
      : '';

    entry.dataset.role = safeRole;
    entry.style.marginBottom = '0.75rem';
    entry.style.padding = '0.7rem 0.8rem';
    entry.style.borderRadius = '10px';
    entry.style.background = isLive ? 'rgba(16,18,28,0.92)' : 'rgba(8,10,18,0.86)';
    entry.style.border = `1px solid ${roleColor}33`;
    entry.style.boxShadow = isLive ? `0 0 0 1px ${roleColor}22 inset` : 'none';

    entry.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:0.6rem;margin-bottom:0.45rem">
        <div style="font-family:'Cinzel',serif;font-size:0.72rem;letter-spacing:0.08em;color:${roleColor};text-transform:uppercase">
          ${titleLabel}
        </div>
        <div style="font-family:'Cinzel',serif;font-size:0.56rem;letter-spacing:0.12em;color:rgba(255,255,255,0.45);text-transform:uppercase">
          ${badge}
        </div>
      </div>
      ${thinkMarkup}
      ${safeAnswer ? `
        <div style="margin-top:0.55rem;padding-top:0.5rem;border-top:1px solid rgba(255,255,255,0.08);font-family:'Crimson Pro',serif;font-size:0.92rem;line-height:1.5;color:#f3f4f6;white-space:pre-wrap;word-break:break-word">
          <div style="font-family:'Cinzel',serif;font-size:0.56rem;letter-spacing:0.12em;color:${roleColor};text-transform:uppercase;margin-bottom:0.22rem">Final Answer</div>
          ${safeAnswer}
        </div>` : ''}
    `;
  }
  _appendSpectatorCotEntry(role, label, text, options = {}) {
    if (!this._spectateMode || !this.specHUD?._active) return;
    const feed = document.getElementById('spec-thought-feed');
    if (!feed) return;
    this._hideLegacySpectatorCotBar();
    const entry = document.createElement('div');
    feed.appendChild(entry);
    this._renderSpectatorCotEntry(entry, {
      role,
      label,
      thinkText: options.answerText ? '' : text,
      answerText: options.answerText || '',
      isAction: !!options.isAction,
      isLive: false,
    });
    this._filterCotFeed(this._specCurrentGroup || role);
  }
  _upsertSpectatorCotLiveEntry(player, thinkText, answerText, isThinking) {
    if (!player || !this._spectateMode || !this.specHUD?._active) return;
    const feed = document.getElementById('spec-thought-feed');
    if (!feed) return;
    this._hideLegacySpectatorCotBar();
    let entry = feed.querySelector(`[data-player-id="${player.id}"]`);
    if (!entry) {
      entry = document.createElement('div');
      entry.dataset.playerId = `${player.id}`;
      entry.dataset.liveEntry = 'true';
      feed.appendChild(entry);
    }
    this._renderSpectatorCotEntry(entry, {
      role: player.role,
      label: player.name,
      thinkText,
      answerText,
      isLive: isThinking,
    });
    if (!isThinking) entry.dataset.liveEntry = 'false';

    // Throttle _filterCotFeed during streaming — it querySelectorAll([data-role])
    // across the whole feed on every token, causing layout thrash at high token rates.
    // Only filter at most once per 200ms during live thinking; always filter on final answer.
    const now = Date.now();
    if (!isThinking || !this._lastCotFilterTs || (now - this._lastCotFilterTs) > 200) {
      this._lastCotFilterTs = now;
      this._filterCotFeed(this._specCurrentGroup || player.role);
    }

    // Auto-scroll to bottom so the latest thought is always visible
    // without requiring manual scroll (only if user hasn't scrolled up manually)
    const container = document.getElementById('spec-cot-container');
    if (container) {
      const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 18;
      if (atBottom || isThinking) {
        requestAnimationFrame(() => { container.scrollTop = container.scrollHeight; });
      }
    }
  }
  _showThoughtPanel(player, thinking, answer) {
    if (this._spectateMode && this.specHUD?._active && player) {
      this._upsertSpectatorCotLiveEntry(
        player,
        thinking || '',
        this._getPublicSpeechText(answer),
        Boolean(thinking),
      );
      return;
    }
    const panel = document.getElementById('thought-panel');
    if (!panel) return;
    const roleColors = {mafia:'#ef4444',sheriff:'#fcd34d',doctor:'#60a5fa',villager:'#86efac'};
    const roleIcons  = {mafia:ICON_MAFIA(22),sheriff:ICON_SHERIFF(22),doctor:ICON_DOCTOR(22),villager:ICON_VILLAGER(22)};
    const icon = document.getElementById('thought-panel-icon');
    const nameEl = document.getElementById('thought-panel-name');
    const roleEl = document.getElementById('thought-panel-role');
    const thinkEl  = document.getElementById('thought-thinking');
    const answerEl = document.getElementById('thought-answer');
    if (icon) icon.innerHTML = roleIcons[player.role] || ICON_THINKING(22);
    if (nameEl) nameEl.textContent = player.name;
    if (roleEl) { roleEl.textContent = (player.role||'').toUpperCase(); roleEl.style.color = roleColors[player.role]||'#9ca3af'; }
    if (thinkEl) thinkEl.textContent = thinking ? thinking : '';
    // Keep this panel reasoning-only; final answer belongs in bubble/subtitle surfaces.
    if (answerEl) answerEl.textContent = '';
    panel.classList.add('visible');
  }
  _hideThoughtPanel() {
    const p = document.getElementById('thought-panel');
    if (p) p.classList.remove('visible');
    const thinkEl = document.getElementById('thought-thinking');
    const answerEl = document.getElementById('thought-answer');
    if (thinkEl) thinkEl.textContent = '';
    if (answerEl) answerEl.textContent = '';
    this._hideLegacySpectatorCotBar();
  }
  _clearSpectatorNightUi() {
    this.specHUD.hideLowerThird();
    this.specHUD.hideNightIcons();
    this.specHUD.setWatching(null);
    this.specHUD.hideMafiaChat();
    this.specHUD.setVignette(null);
    this._hideThoughtPanel();
    // Remove the body-mounted CoT container (built by _buildSpecSwitcher on body
    // to avoid the transform containing-block bug on #spectator-night-switcher).
    const cotContainer = document.getElementById('spec-cot-container');
    if (cotContainer) cotContainer.remove();
    const switcher = document.getElementById('spectator-night-switcher');
    if (switcher) {
      switcher.style.display = 'none';
      switcher.innerHTML = '';
    }
    const shotLabel = document.getElementById('spec-shot-label');
    if (shotLabel) shotLabel.textContent = '';
    this._hideLegacySpectatorCotBar();
  }
  _roleColor(role) {
    return {mafia:'#ef4444',sheriff:'#fcd34d',doctor:'#60a5fa',villager:'#86efac'}[role]||'#f0d080';
  }

  _setAiRuntimeError(player, code, source = 'runtime') {
    if (!player) return;
    if (!code) {
      delete player._lastAiRuntimeError;
      return;
    }
    player._lastAiRuntimeError = {
      code: this._normalizeAiErrorCode(code, player.model),
      source,
      ts: Date.now(),
    };
  }

  _consumeAiRuntimeError(player) {
    if (!player || !player._lastAiRuntimeError) return null;
    const err = player._lastAiRuntimeError;
    delete player._lastAiRuntimeError;
    return err;
  }

  _normalizeAiErrorCode(raw, model = '') {
    if (!raw) return '';
    const text = String(raw).trim();
    if (!text) return '';
    if (text.startsWith('MODEL_NOT_FOUND:')) return text;
    if (text.startsWith('TIMEOUT:')) return text;
    if (text.startsWith('API_ERROR_')) return text;
    if (text === 'INSUFFICIENT_CREDITS' || text === 'INVALID_API_KEY' || text === 'JSON_PARSE_ERROR') return text;
    if (text === 'AbortError' || text === 'TimeoutError') return `TIMEOUT:${model || 'model'}`;
    if (/failed to fetch|network/i.test(text)) return 'API_ERROR_NETWORK';
    return `API_ERROR:${text}`;
  }

  _formatAiRuntimeError(code, model = '') {
    if (!code) return 'runtime failure';
    if (code.startsWith('MODEL_NOT_FOUND:')) return `model not found (${model || code.slice('MODEL_NOT_FOUND:'.length)})`;
    if (code.startsWith('TIMEOUT:')) return `timeout (${model || code.slice('TIMEOUT:'.length)})`;
    if (code === 'INSUFFICIENT_CREDITS') return 'insufficient credits';
    if (code === 'INVALID_API_KEY') return 'invalid API key';
    if (code === 'JSON_PARSE_ERROR') return 'provider parse error';
    if (code === 'API_ERROR_NETWORK') return 'network error';
    if (code.startsWith('API_ERROR_')) return code.replace('API_ERROR_', 'api error ');
    if (code.startsWith('API_ERROR:')) return `api error ${code.slice('API_ERROR:'.length)}`;
    return code;
  }

  _runtimeFailurePlaceholder(player, code) {
    if (code?.startsWith('MODEL_NOT_FOUND:')) return '[model unavailable] I cannot respond this turn.';
    if (code?.startsWith('TIMEOUT:')) return '[timeout] I could not finish in time.';
    if (code === 'INSUFFICIENT_CREDITS') return '[credits unavailable] I cannot respond.';
    if (code === 'INVALID_API_KEY') return '[auth failed] I cannot respond.';
    return '[connection issue] I cannot respond this turn.';
  }

  _surfaceAiRuntimeFailure(player, err, {
    contextLabel = 'AI turn',
    showCot = true,
    showBubble = true,
    showSubtitle = true,
    placeholderText = '',
    bubbleMs = 3800,
  } = {}) {
    if (!player) return;
    const errObj = typeof err === 'string' ? { code: err } : (err || {});
    const code = this._normalizeAiErrorCode(errObj.code || err, player.model);
    const pretty = this._formatAiRuntimeError(code, player.model);
    const systemLine = `[MODEL ERROR] ${player.name} (${player.model || 'unknown model'}) ${contextLabel}: ${pretty}.`;

    this.hud.addChat('SYSTEM', systemLine);
    if (this._spectateMode && this.specHUD?._active && showCot) {
      this._cotAddEntry(player.role || 'mafia', `! ${player.name}`, `${contextLabel}: ${pretty}`, true);
      this.specHUD.addEvent?.(`${player.name}: ${pretty}`, 'warning');
    }

    if (showBubble) {
      const placeholder = placeholderText || this._runtimeFailurePlaceholder(player, code);
      this.charManager.showSpeechBubble(player.id, placeholder, bubbleMs);
      if (showSubtitle && this._spectateMode) {
        this.specHUD.showSpeaking(player.name, placeholder, bubbleMs);
      }
    }

    return code;
  }

  launch(config) {
    this.config = config;
    // Fetch live model list from Commonstack before starting the game.
    // This ensures we only use models that actually exist on the user's account.
    this._initModels(config.apiKey, config.tier).then(() => {
      // BUG FIX (was): tutorial.show() from Tutorial.js conflicted with the HTML IIFE tutorial
      // that writes to the same #tutorial-overlay. The Tutorial class is now used only
      // for the in-game "showTutorial()" help button, not for the launch flow.
      // BUG FIX (was): no .catch() — if _initModels threw, game silently never started.
      this._beginGame(config);
    }).catch(err => {
      // _initModels failure falls back to static model list (already populated at import time)
      console.warn('[launch] _initModels error, using static fallback:', err?.message || err);
      this._beginGame(config);
    });
  }

  async _initModels(apiKey, tier) {
    try {
      const res  = await fetch('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      });
      const data = await res.json();
      // Permanently blocked models — never allowed regardless of live API response
      // Permanently blocked — Commonstack LISTS these in /v1/models but returns 404 on actual calls.
      // Confirmed broken March 2026 via terminal logs ("model not found" 404s).
      // The fallback was silently swapping them all to gpt-4o-mini behind the scenes.
      // CONFIRMED 404s from server terminal logs March 2026
      // Commonstack lists these in /v1/models but returns {code:404,msg:Not Found}
      // BLOCKED_MODELS: Commonstack lists these in GET /v1/models but returns
      // {code:404,msg:"Not Found"} when you actually call them.
      // The fix for most of these is to use the correct slug in STATIC_MODELS —
      // but we also block the broken slugs here so the live-list filter never
      // accidentally routes to them even if Commonstack keeps listing them.
      // Block any slug that is NOT in our verified ground-truth list.
      // This prevents Commonstack listing a stale/broken model from sneaking in.
      const BLOCKED_MODELS = [
        // ── Permanently banned ────────────────────────────────────────────
        'openai/gpt-oss-120b',

        // ── Wrong provider prefixes (will 404) ───────────────────────────
        'xai/grok-4', 'xai/grok-3', 'xai/grok-3-mini',   // prefix must be x-ai/ not xai/
        'zhipu/glm-5',                                      // prefix must be zai-org/ not zhipu/

        // ── Old/stale slugs replaced by correct ones ─────────────────────
        'anthropic/claude-sonnet-4-20250514',   // reverted: actual slug is claude-sonnet-4-6
        'anthropic/claude-opus-4-5',            // not in Commonstack list
        'anthropic/claude-3-7-sonnet-20250219', // retired
        'google/gemini-2.0-flash',              // deprecated March 6 2026
        'google/gemini-2.5-flash',              // not in current list
        'google/gemini-2.5-pro',                // not in current list
        'google/gemini-2.5-flash-preview-04-17',
        'google/gemini-2.5-pro-preview-05-06',
        'google/gemini-3-flash-preview-04-17',
        'google/gemini-3.1-pro-preview-05-06',  // slug is now gemini-3.1-pro-preview (no date)
        'google/gemini-3-pro-preview',           // removed — use 3.1-pro-preview instead
        'openai/gpt-5.4-mini-2026-03-05',       // date was wrong — correct date is 03-17
        'openai/gpt-5.4-pro-2026-03-05',        // removed from the game
        'openai/o3', 'openai/o3-mini', 'openai/o4-mini',  // not in current list
        'openai/o3-2025-04-16', 'openai/o3-mini-2025-01-31', 'openai/o4-mini-2025-04-16',
        'openai/gpt-5.2', 'openai/gpt-4.1', 'openai/gpt-4.1-mini',
        'openai/gpt-4o', 'openai/gpt-4o-mini',
        'deepseek/deepseek-r2',                 // not in current list
        'moonshotai/kimi-k2-0905-preview',      // old alias
        'mistralai/Mistral-Large-Instruct-2411',
        'mistralai/Mistral-Small-3.2-24B-Instruct-2506',
        'mistralai/Mistral-7B-Instruct-v0.3',
        'qwen/Qwen3-235B-A22B', 'qwen/Qwen3-32B', 'qwen/Qwen2.5-72B-Instruct',
        'meta-llama/Llama-4-Maverick-17B-128E-Instruct',
        'meta-llama/Llama-4-Scout-17B-16E-Instruct',
        'meta-llama/Llama-3.3-70B-Instruct',
        'nvidia/llama-3.1-nemotron-ultra-253b-v1',
        'nvidia/Llama-3_1-Nemotron-Ultra-253B-v1',
        'nvidia/Llama-3_3-Nemotron-Super-49B-v1',
      ];
      const liveIds = (data.models || []).filter(id => !BLOCKED_MODELS.includes(id));

      if (liveIds.length === 0) {
        console.warn('[models] Live fetch returned empty list — using static fallback');
        return;
      }

      console.log(`[models] Live list: ${liveIds.length} models`);

      // For each tier, filter to only models present in the live list,
      // then build full model entries. Fall back to static list if filter yields nothing.
      for (const t of ['budget', 'mid', 'premium']) {
        const staticPool = STATIC_MODELS[t];
        const filtered   = staticPool.filter(id => liveIds.includes(id));

        if (filtered.length >= 4) {
          MODELS[t] = filtered.map(buildModelEntry);
        } else {
          // Static pool had too few matches — build from the full live list
          // using any model we have metadata for, sorted by tier preference
          const tierOrder = { budget: 0, mid: 1, premium: 2 };
          const metaIds = liveIds.filter(id => MODEL_META[id]);
          MODELS[t] = metaIds.map(buildModelEntry);
          if (MODELS[t].length === 0) {
            // Absolute last resort: accept every live model with generic metadata
            MODELS[t] = liveIds.map(buildModelEntry);
          }
        }
      }
    } catch (e) {
      console.warn('[models] Live fetch failed — using static fallback:', e.message);
    }
  }

  _beginGame(config) {
    document.getElementById('lobby').style.cssText = 'transition:opacity 0.8s;opacity:0;';
    setTimeout(() => { document.getElementById('lobby').style.display = 'none'; }, 800);
    document.getElementById('game-ui').classList.add('active');
    setGameActive(true);
    this.soundEngine.stopAmbient();
    this.soundEngine.play('enterVillage');

    const players = this._setupPlayers(config);
    this.state = {
      players, day: 1, phase: 'DAY', speakerIndex: 0,
      alive: players.map(p => p.id), votes: {},
      sheriffShotUsed: {}, investigationHistory: {},
      doctorProtectedId: null,
      chatLog: [], gameLog: [], // gameLog = structured event history for AI context
      apiKey: config.apiKey, speakTime: config.speakTime,
      waitingForHuman: false, pendingSkip: false,
    };

    // If starting as spectator, enter spectate mode immediately
    if (config.startAsSpectator) {
      this._spectateMode = true;
      const roleBadge = document.getElementById('role-badge');
      if (roleBadge) roleBadge.textContent = 'SPECTATING';
      const banner = document.getElementById('spectate-banner');
      if (banner) {
        banner.style.display = 'flex';
        banner.style.transition = 'opacity 1.5s ease';
        setTimeout(() => { banner.style.opacity = '0'; }, 3000);
        setTimeout(() => { banner.style.display = 'none'; }, 4500);
      }
      this._startFreeRoam();
      setTimeout(() => {
        if (this.state) {
          this.specHUD.activate(this.state.players);
          this.specHUD.announce('SPECTATOR MODE', 'WATCH THE GAME UNFOLD', 3500);
          this.specHUD.setWatching('AMPHITHEATER', '#c9a84c');
        }
      }, 2000);
      // Show roles on all nameplates — spectator sees everything
      players.forEach(p => { const c = this.charManager.getCharacter(p.id); if (c?.showRole) c.showRole(true); });
      this.hud.addChat('SYSTEM', 'SPECTATOR MODE - watching all roles. WASD to roam, R to toggle cinematic/free.');
    }

    const { seats, radius } = this.charManager.spawnAll(players, []);
    this.cinCamera.setCircle(radius, players.length);
    // Hide role labels by default — only shown in spectator mode
    players.forEach(p => {
      const c = this.charManager.getCharacter(p.id);
      if (c && c.showRole) c.showRole(false);
    });
    const _human = players.find(p => p.isHuman);
    this.hud.buildPlayerList(players, _human, this._spectateMode, this.state?.investigationHistory || {});

    // Activate the lower-third subtitle for BOTH player mode and spectator mode.
    // In player mode we don't show the sidebar/vote-tracker/announcer panels,
    // but we do want the single unified lower-third speaker bar.
    if (!this._spectateMode) {
      this.specHUD._active = true; // allow showSpeaking() calls from player mode
    }

    this._startCamNudge();

    this.cinCamera.playDayStartTransition(() => {
      this.soundEngine.play('dayBreak');
      this.skybox.setDay();
      this._startDayPhase();
    });
  }

  _setupPlayers(config) {
    const { playerCount, playerName, tier, mafiaCount: configMafia,
            customHeadTexture, startAsSpectator } = config;
    // Use the live-filtered MODELS pool so only verified-working models are assigned.
    // MODELS[] is populated by _initModels() before _setupPlayers() is ever called.
    // We combine all tiers and deduplicate so every model gets a fair shot regardless
    // of which tier the user selected in the lobby.
    const seen = new Set();
    const allModels = ['budget', 'mid', 'premium'].flatMap(t => MODELS[t] || [])
      .filter(m => { if (seen.has(m.modelId)) return false; seen.add(m.modelId); return true; });
    const shuffledMods = [...allModels].sort(() => Math.random() - 0.5);

    // In spectator mode ALL slots are AI — no human player at all
    const numAI  = startAsSpectator ? playerCount : playerCount - 1;
    const numAll = playerCount;

    if (numAI > shuffledMods.length) {
      console.warn(`Only ${shuffledMods.length} unique models for ${numAI} AI slots — some will repeat`);
      // Repeat the pool until we have enough
      while (shuffledMods.length < numAI) shuffledMods.push(...shuffledMods);
    }
    const aiModels = shuffledMods.slice(0, numAI);

    // Build role array: 1 sheriff, 1 doctor, configMafia mafia, rest villagers
    const mc = Math.max(1, Math.min(configMafia || Math.floor(numAll / 4), numAll - 3));
    const roles = ['sheriff', 'doctor'];
    for (let i = 0; i < mc; i++) roles.push('mafia');
    while (roles.length < numAll) roles.push('villager');
    const shuffledRoles = roles.sort(() => Math.random() - 0.5);

    const players = [];

    if (!startAsSpectator) {
      // PLAY mode: human is slot 0
      players.push({
        id: 'human', name: playerName, isHuman: true, model: null,
        role: shuffledRoles[0], alive: true, seatIndex: 0,
        logoColor: '#c9a84c', initial: (playerName[0] || 'H').toUpperCase(),
        logoKey: 'human', customTexture: customHeadTexture || null,
      });
      // Show human their role badge
      const hr = shuffledRoles[0];
      document.getElementById('role-badge').textContent =
        hr === 'mafia' ? '▲ MAFIA' : hr === 'sheriff' ? '◆ SHERIFF' :
        hr === 'doctor' ? '✚ DOCTOR' : '⌂ VILLAGER';
    }

    // AI players fill remaining slots
    for (let i = 0; i < numAI; i++) {
      const m       = aiModels[i];
      const roleIdx = startAsSpectator ? i : i + 1;
      players.push({
        id: `ai_${i + 1}`, name: m.displayName, isHuman: false,
        model: m.modelId, modelKey: m.key, role: shuffledRoles[roleIdx],
        alive: true, seatIndex: startAsSpectator ? i : i + 1,
        logoColor: m.color, logoKey: m.key,
        initial: (m.displayName[0] || 'A').toUpperCase(),
      });
    }

    return players;
  }

  // ─── DAY PHASE ─────────────────────────────────────────────────────────────

  _startDayPhase() {
    this.state.phase = 'DAY';
    this.voiceEngine?.stop(); // silence any lingering night speech
    this.state.speakerIndex = 0;
    this.state.votes = {};
    this.state.doctorProtectedId = null;
    this.state._speakingRound = 1;
    this.state._speakingRoundMax = 2;
    // Cancel any leftover night timer from a previous elimination (shouldn't exist, but safety)
    if (this._nightTimer) { clearTimeout(this._nightTimer); this._nightTimer = null; }
    document.getElementById('phase-badge').textContent = `DAY ${this.state.day}`;
    // Subtitle sits lower during day — no night panel to avoid
    document.getElementById('spec-lower-third')?.classList.add('day-mode');
    this.specHUD?.setMinimalNightUi(false);
    if (this._spectateMode) {
      this.specHUD.announce(`DAY ${this.state.day}`, 'DISCUSSION BEGINS', 3000);
      this.specHUD.setWatching('AMPHITHEATER', '#c9a84c');
      this.specHUD.hideVoteTracker();
      this._clearSpectatorNightUi();
    }

    // Clear night location background
    const _bg = document.getElementById('night-location-bg');
    if (_bg) _bg.className = '';
    const _badge = document.getElementById('night-location-badge');
    if (_badge) _badge.className = '';
    // Ensure day lighting (safe to call even if already set)
    this.skybox.setDay();
    this.village.setDayLighting();

    // Hide all night UI
    const switcher = document.getElementById('spectator-night-switcher');
    if (switcher) switcher.style.display = 'none';
    const nightPanel = document.getElementById('night-panel');
    if (nightPanel) nightPanel.classList.remove('visible');

    // Reset night state
    this._specManualSwitch = false;
    this._shotCounter = 0;

    // Recall all characters back to amphitheater seats
    this._recallCharactersFromNight();

    this._nextSpeaker();
  }

  _nextSpeaker() {
    // Guard: if phase moved to VOTE/NIGHT/GAMEOVER, discard stale speaker callbacks
    if (!this.state || (this.state.phase !== 'DAY')) return;
    // Stop any ongoing TTS so the previous speaker doesn't bleed into the next turn
    this.voiceEngine?.stop();
    const alivePlayers = this.state.players.filter(p => p.alive);

    // End of one full round
    if (this.state.speakerIndex >= alivePlayers.length) {
      this.state._speakingRound++;
      if (this.state._speakingRound > this.state._speakingRoundMax) {
        // All rounds done - move to vote
        setTimeout(() => this._startVotePhase(), 1000);
        return;
      }
      // Reset for another round
      this.state.speakerIndex = 0;
      const badge = document.getElementById('phase-badge');
      if (badge) badge.textContent = `DAY ${this.state.day} · Round ${this.state._speakingRound}`;
    }

    const speaker = alivePlayers[this.state.speakerIndex];
    this.state.speakerIndex++;

    this._dayShotCounter = ((this._dayShotCounter || 0) + 1) % 5;
    this._resetCamNudge();
    this.cinCamera.focusOnSeat(speaker.seatIndex, this.state.players.length, this._dayShotCounter);
    // Set nudge target AFTER tween finishes (0.8s) so base pos is the settled position
    const _sp = this.cinCamera._seatPos(speaker.seatIndex);
    setTimeout(() => {
      if (_sp) this._setNudgeTarget(_sp.x, 5.8, _sp.z);
    }, 820);
    // Clear ALL previous speech bubbles so only current speaker is shown
    this.charManager.clearAllSpeechBubbles();
    this.hud.clearAllSpeechBubbles();
    this.charManager.setSpeaking(speaker.id, true);
    if (this._spectateMode) {
      this.specHUD.setSpeaking(speaker.id, true);
    }
    this.hud.showTimer(speaker.name, this.state.speakTime);
    this.soundEngine.play('speaking');

    if (speaker.isHuman && !this._spectateMode) this._humanSpeakTurn(speaker);
    else this._aiSpeakTurn(speaker);
  }

  _humanSpeakTurn(player) {
    this.state.waitingForHuman = true;
    // Hide any previous subtitle so it doesn't block the input panel
    this._hideSubtitle();
    this.specHUD.hideLowerThird();
    this.hud.clearAllSpeechBubbles();
    const panel = document.getElementById('speak-input-panel');
    panel.classList.add('visible');

    let remaining = this.state.speakTime;
    this.timerInterval = setInterval(() => {
      if (!this.state.waitingForHuman) return;
      remaining--;
      this.hud.updateTimer(remaining, this.state.speakTime);
      if (remaining <= 0) {
        clearInterval(this.timerInterval);
        this._finishHumanTurn(player, '...(time\'s up)');
      }
    }, 1000);
  }

  humanSpeech(text) {
    if (!this.state?.waitingForHuman) return;
    if (!text?.trim()) return;
    clearInterval(this.timerInterval);
    this.state.waitingForHuman = false;
    const player = this.state.players.find(p => p.isHuman);
    this._finishHumanTurn(player, text);
  }

  humanPass() {
    if (!this.state?.waitingForHuman) return;
    clearInterval(this.timerInterval);
    this.state.waitingForHuman = false;
    const player = this.state.players.find(p => p.isHuman);
    this._finishHumanTurn(player, '[passes]');
  }

  _finishHumanTurn(player, text) {
    document.getElementById('speak-input-panel').classList.remove('visible');
    this.hud.addChat(player.name, text);
    this.hud.showSpeechBubble(player.id, text, 4000);
    this.state.chatLog.push({ name: player.name, text, role: player.role, day: this.state.day, phase: this.state.phase });
    this.charManager.setSpeaking(player.id, false);
    this.hud.hideTimer();
    setTimeout(() => this._nextSpeaker(), 1000);
  }

  async _aiSpeakTurn(player) {
    this.charManager.setThinking(player.id, true);
    this.hud.showThinkingBubble(player.id);

    const speakSeconds = this.state.speakTime || 20;
    const systemPrompt = buildSystemPrompt(player, this.state)
      + `\n\nSPEAKING TIME: You have ${speakSeconds} seconds to speak. Keep your response to 1-3 short sentences maximum. Be direct and impactful — every word counts.`;
    const userMessage = buildUserMessage(this.state);
    let responseText = '';
    let done = false;
    let esRef = null;
    let runtimeError = '';
    this._setAiRuntimeError(player, null);

    const self = this;

    let _finalized = false;
    function finalize() {
      if (_finalized) return; // prevent double-call from race between timeout and SSE done
      _finalized = true;
      if (!responseText || responseText.trim().length === 0) {
        responseText = '';
      }
      // Strip internal reasoning / thinking leaks before displaying
      responseText = _cleanSpeechResponse(responseText);
      if (runtimeError) {
        self._setAiRuntimeError(player, runtimeError, 'day-speech');
        self._surfaceAiRuntimeFailure(player, { code: runtimeError }, {
          contextLabel: 'day speech',
          showCot: false,
          showBubble: false,
          showSubtitle: false,
        });
      } else {
        self._setAiRuntimeError(player, null);
      }
      if (!responseText && runtimeError) {
        responseText = self._runtimeFailurePlaceholder(player, runtimeError);
      }
      self.charManager.setThinking(player.id, false);
      self.charManager.setSpeaking(player.id, true);
      self.hud.hideThinkingBubble(player.id);
      if (responseText) {
        self.hud.showSpeechBubble(player.id, responseText, self.state.speakTime * 1000);
        self.hud.addChat(player.name, responseText);
        // Unified lower-third subtitle for both player mode and spectator mode
        self.specHUD.showSpeaking(player.name, responseText, self.state.speakTime * 1000);
        self.state.chatLog.push({ name: player.name, text: responseText, role: player.role, day: self.state.day, phase: self.state.phase });
        self.soundEngine.play('messageIn');
        // Spectator-only extras (sidebar speaking indicator)
        if (self._spectateMode) {
          self.specHUD.setSpeaking(player.id, true);
        }
        // TTS — speak in this model's unique voice (non-human only).
        // We wire onComplete so the turn does NOT advance until TTS finishes,
        // fixing the bug where _nextSpeaker() fired mid-sentence.
        if (!player.isHuman && self.voiceEngine) {
          let ttsCompleted = false;
          let displayTimerFired = false;

          // Hard cap: never hold the turn longer than speakTime regardless of TTS
          const maxWaitMs = (self.state.speakTime ?? 30) * 1000;

          const advanceTurn = () => {
            // Only advance once, whichever fires second (display timer OR tts end)
            if (!ttsCompleted || !displayTimerFired) return;
            self.charManager.setSpeaking(player.id, false);
            self.hud.hideTimer();
            if (self.state?.phase === 'DAY') self._nextSpeaker();
          };

          const displayTime = Math.min(
            self.state.speakTime,
            Math.max(3, Math.ceil(responseText.length / 25))
          );

          // Display timer — minimum time the bubble stays visible
          setTimeout(() => {
            displayTimerFired = true;
            advanceTurn();
          }, displayTime * 1000);

          // Hard safety cap — if TTS never fires onComplete, advance anyway
          const safetyCap = setTimeout(() => {
            ttsCompleted = true;
            advanceTurn();
          }, maxWaitMs);

          self.voiceEngine.speak(player, responseText, () => {
            clearTimeout(safetyCap);
            ttsCompleted = true;
            advanceTurn();
          });
        } else {
          // No TTS — use original display-time timer
          const displayTime = Math.min(
            self.state.speakTime,
            Math.max(3, Math.ceil(responseText.length / 25))
          );
          setTimeout(() => {
            self.charManager.setSpeaking(player.id, false);
            self.hud.hideTimer();
            if (self.state?.phase === 'DAY') self._nextSpeaker();
          }, displayTime * 1000);
        }
      } else {
        // No response text — advance quickly
        self.state.chatLog.push({ name: player.name, text: '', role: player.role, day: self.state.day, phase: self.state.phase });
        setTimeout(() => {
          self.charManager.setSpeaking(player.id, false);
          self.hud.hideTimer();
          if (self.state?.phase === 'DAY') self._nextSpeaker();
        }, 1500);
      }
    } // end finalize()

    // Hard timeout — use partial text if any, otherwise skip (no fallback to different model)
    const timeoutHandle = setTimeout(() => {
      if (!done) {
        done = true;
        if (esRef) { try { esRef.close(); } catch {} }
        runtimeError = runtimeError || `TIMEOUT:${player.model}`;
        // Use partial response if available, otherwise skip — never swap to a fallback model
        finalize();
      }
    }, _clientSoftTimeout(player.model));

    // Use fetch+ReadableStream instead of EventSource to support POST
    // (EventSource only supports GET, which hits URL length limits with long prompts)
    const speakBody = JSON.stringify({
      apiKey: this.state.apiKey,
      model: player.model,
      systemPrompt,
      userMessage,
    });

    try {
      const fetchRes = await fetch('/api/ai-speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: speakBody,
        signal: AbortSignal.timeout(_clientFetchTimeout(player.model, 65000)),
      });
      if (!fetchRes.ok || !fetchRes.body) {
        console.warn(`[speak] fetch failed for ${player.model} — skipping (no fallback model)`);
        runtimeError = `API_ERROR_${fetchRes.status || 'FETCH'}`;
        clearTimeout(timeoutHandle);
        finalize();
        return;
      }
      const reader  = fetchRes.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      const processStream = async () => {
        while (true) {
          const { done: rdDone, value } = await reader.read();
          if (rdDone) { clearTimeout(timeoutHandle); if (!done) { done=true; finalize(); } break; }
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop();
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const raw = line.slice(6).trim();
            if (!raw || done) continue;
            let data; try { data = JSON.parse(raw); } catch { continue; }
            if (data.error === 'INSUFFICIENT_CREDITS') {
              clearTimeout(timeoutHandle); done = true; reader.cancel();
              this._showCreditError(); return;
            }
            if (data.error) {
              clearTimeout(timeoutHandle); done = true; reader.cancel();
              // Any model error — skip, never route to a fallback model
              console.warn(`[speak] ${data.error} for ${player.model} — skipping`);
               runtimeError = data.error;
              finalize(); return;
            }
            if (data.done) { clearTimeout(timeoutHandle); done = true; reader.cancel(); finalize(); return; }
            if (data.token) { responseText += data.token; self.hud.updateLiveSpeechBubble(player.id, _cleanSpeechResponse(responseText)); self.specHUD.updateLowerText(_cleanSpeechResponse(responseText)); }
          }
        }
      };
      processStream().catch(() => {
        clearTimeout(timeoutHandle);
        runtimeError = runtimeError || 'API_ERROR_STREAM';
        if (!done) { done = true; finalize(); }
      });
      const es = null; esRef = null; // no EventSource needed
      esRef = es;
      // Stream handled above via fetch+ReadableStream
    } catch {
      clearTimeout(timeoutHandle);
      console.warn(`[speak] network error for ${player.model} — skipping (no fallback model)`);
      runtimeError = 'API_ERROR_NETWORK';
      finalize();
    }
  }

  // ─── VOTE PHASE ─────────────────────────────────────────────────────────────

  _startVotePhase() {
    this.state.phase = 'VOTE';
    this.voiceEngine?.stop(); // cut any lingering day speech
    this.state.votes = {};
    document.getElementById('phase-badge').textContent = 'VOTE';
    const vAlive = this.state.players.filter(p => p.alive);
    if (this._spectateMode || this.specHUD?._active) {
      this.specHUD.showVoteTracker(vAlive);
    }
    if (this._spectateMode) {
      this.specHUD.announce('VOTE', 'WHO WILL BE ELIMINATED?', 3000);
    }
    this.soundEngine.play('vote');
    this.cinCamera.pullBackToTable();

    const votePanel = document.getElementById('vote-panel');
    const targets = document.getElementById('vote-targets');
    const tally = document.getElementById('vote-tally');
    targets.innerHTML = ''; tally.textContent = '';
    votePanel.classList.add('visible');

    const alive = this.state.players.filter(p => p.alive);
    const human = this.state.players.find(p => p.isHuman);
    const humanId = human?.id || 'human';
    let humanVoted = false;

    // If spectating, skip human vote UI
    if (this._spectateMode) {
      this._collectAiVotes(alive, tally, votePanel);
      return;
    }

    const humanPlayer = this.state.players.find(p => p.isHuman);
    const isHumanMafia = humanPlayer?.role === 'mafia';
    alive.filter(p => p.id !== humanId).forEach(p => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'vote-target-btn';
      // If human is mafia, label their mafia teammates so they don't accidentally vote them out
      const isTeammate = isHumanMafia && p.role === 'mafia';
      const label = isTeammate ? `${p.name} <span style="color:#ef4444;font-size:0.7rem">[ALLY]</span>` : p.name;
      btn.innerHTML = `<canvas class="vtb-face-canvas" width="48" height="48"></canvas><div class="vtb-name">${label}</div>`;
      if (isTeammate) btn.style.opacity = '0.5';
      _drawVtbFace(btn.querySelector('.vtb-face-canvas'), p);
      btn.addEventListener('click', () => {
        if (humanVoted) return;
        humanVoted = true;
        targets.querySelectorAll('.vote-target-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        this.state.votes[humanId] = p.id;
        this.charManager.playVoteAnimation(humanId);
        this.soundEngine.play('vote');
        tally.textContent = `You voted to eliminate ${p.name}`;
        this.specHUD.updateVote(humanId, p.id, alive);
        this._collectAiVotes(alive, tally, votePanel);
      });
      targets.appendChild(btn);
    });

    // Pass button for voting
    const passBtn = document.createElement('button');
    passBtn.type = 'button';
    passBtn.className = 'speak-btn secondary'; passBtn.textContent = 'Abstain';
    passBtn.style.cssText = 'margin-top:0.5rem;width:100%';
    passBtn.onclick = () => {
      if (humanVoted) return;
      humanVoted = true;
      this.state.votes[humanId] = 'skip';
      tally.textContent = 'You abstained.';
      this.specHUD.updateVote(humanId, 'skip', alive);
      this._collectAiVotes(alive, tally, votePanel);
    };
    targets.appendChild(passBtn);

    // Auto-abstain after 20s
    setTimeout(() => {
      if (!humanVoted) {
        humanVoted = true;
        this.state.votes[humanId] = 'skip';
        this.specHUD.updateVote(humanId, 'skip', alive);
        this._collectAiVotes(alive, tally, votePanel);
      }
    }, 20000);
  }

  async _collectAiVotes(alive, tallyEl, votePanel) {
    const aiPlayers = alive.filter(p => !p.isHuman);
    const voteJobs = aiPlayers.map(async (player) => {
      const prompt = buildVotePrompt(player, this.state);
      try {
        const voteContent = await this._aiDecide(
          player,
          prompt.system,
          prompt.user,
          1,
          { timeoutMs: DAY_VOTE_LIMIT_MS }
        );
        const target = voteContent === null ? 'skip' : this._parseVoteTarget(voteContent, alive, player.id);
        this.state.votes[player.id] = target;
        if (target !== 'skip') {
          this.charManager.playVoteAnimation(player.id);
          this.soundEngine.play('vote');
          this.hud.addChat(player.name, '[casts their vote]');
        }
        tallyEl.innerHTML = this._getTallyDisplay(alive);
        if (this._spectateMode || this.specHUD?._active) {
          this.specHUD.updateVote(player.id, target, alive);
        }
      } catch {
        this.state.votes[player.id] = 'skip';
        tallyEl.innerHTML = this._getTallyDisplay(alive);
        if (this._spectateMode || this.specHUD?._active) {
          this.specHUD.updateVote(player.id, 'skip', alive);
        }
      }
    });

    await Promise.allSettled(voteJobs);
    // All votes in - close immediately
    await this._sleep(800);
    votePanel.classList.remove('visible');
    this._resolveVote(alive);
  }

  _getTallyDisplay(alive) {
    const tally = {};
    Object.values(this.state.votes).forEach(t => { if (t && t !== 'skip') tally[t] = (tally[t] || 0) + 1; });
    if (Object.keys(tally).length === 0) return 'Votes coming in...';
    return Object.entries(tally)
      .sort((a, b) => b[1] - a[1])
      .map(([id, count]) => {
        const p = alive.find(x => x.id === id);
        return `<span style="margin-right:12px">${p?.name || id}: ${'█'.repeat(count)} ${count}</span>`;
      }).join('');
  }

  _resolveVote(alive) {
    console.log('[VOTE] _resolveVote called, votes:', JSON.stringify(this.state.votes).slice(0,100));
    const tally = {};
    Object.values(this.state.votes).forEach(t => { if (t && t !== 'skip') tally[t] = (tally[t]||0) + 1; });

    if (Object.keys(tally).length === 0) {
      this.hud.addChat('SYSTEM', '[TIE] No votes cast — nobody is eliminated today.');
      this.state.gameLog.push(`Day ${this.state.day}: No one was eliminated in the vote.`);
      this._startNightPhase(); return;
    }

    // Detect tie — if 2+ players share the highest vote count, nobody is eliminated
    const maxV = Math.max(...Object.values(tally));
    const leaders = Object.keys(tally).filter(id => tally[id] === maxV);
    if (leaders.length > 1) {
      const names = leaders.map(id => this.state.players.find(p => p.id === id)?.name || id).join(' & ');
      this.hud.addChat('SYSTEM', `— Tie between ${names} — no elimination today!`);
      this.state.gameLog.push(`Day ${this.state.day}: Vote was a tie between ${names}. No one was eliminated.`);
      this._startNightPhase(); return;
    }

    const eliminated = leaders[0];
    const player = this.state.players.find(p => p.id === eliminated);
    if (!player) { this._startNightPhase(); return; }
    this.hud.addChat('SYSTEM', `${player.name} has been voted out! They were a ${player.role.toUpperCase()}.`);
    this.state.gameLog.push(`Day ${this.state.day}: ${player.name} was voted out by the village. Their role was ${player.role.toUpperCase()}.`);
    this.state.phase = 'ELIMINATING'; // prevent stale _nextSpeaker calls
    if (this._spectateMode) {
      this.specHUD.addEvent(`✖ ${player.name} eliminated (${player.role})`, 'kill');
      this.specHUD.announce('ELIMINATED', `✖ ${player.name}`, 2000);
      this.specHUD.showKill(player.name, player.role);
      this.specHUD.setVignette('kill', 2500);
    }

    // _eliminatePlayer is PURELY VISUAL here — null callback, no night dependency.
    // Death animation (~2.2s) → addGravestone → panToGraveyard (~4.1s) all play
    // for the player to see, but night is driven ONLY by the timer below.
    this._eliminatePlayer(player, null);

    // ── Single authoritative night timer ─────────────────────────────────────
    // Completely decoupled from GSAP, panToGraveyard, and all callback chains.
    // Timeline: death anim safety (2.2s) + pan tweens (2.9s) + pan hold (1.2s)
    //           + 0.7s buffer = 7s total. Night starts exactly here, every time.
    // _startNightPhase's own phase guard prevents any double-execution.
    if (this._nightTimer) clearTimeout(this._nightTimer);
    console.log('[VOTE] night timer set — 7000ms');
    this._nightTimer = setTimeout(() => {
      this._nightTimer = null;
      console.log('[VOTE] night timer fired, phase=' + this.state?.phase);
      if (this.state && this.state.phase === 'ELIMINATING') {
        this._startNightPhase();
      }
    }, 7000);
  }

  // ─── ELIMINATION ─────────────────────────────────────────────────────────────

  // ─── ELIMINATION ─────────────────────────────────────────────────────────────
  // UNIFIED DEATH HANDLER — Uses DeathHandler for ALL death types
  // This ensures consistent graveyard sequence regardless of death cause:
  //   - Mafia kill (night)
  //   - Sheriff kill (night)
  //   - Village lynch (day vote)
  // callback: optional, fires after death anim + graveyard pan complete.
  //           For day-vote eliminations this is always null — night is driven by
  //           the standalone timer in _resolveVote, not by this callback.
  //           For dawn-kill eliminations (_processAnnouncements) callback = resolve
  //           and skipGraveyardPan = true so the Promise resolves quickly.
  _eliminatePlayer(player, callback, skipGraveyardPan = false) {
    // Determine death type based on current phase/context
    let deathType = 'unknown';
    if (this.state.phase === 'VOTE' || this.state.phase === 'ELIMINATING') {
      deathType = 'lynch';
    } else if (this.state.phase === 'NIGHT') {
      // Could be mafia or sheriff kill - default to mafia for now
      deathType = 'mafia';
    }
    
    // Use unified death handler for consistent graveyard sequence
    const gravePos = this.deathHandler.playerDied(player, deathType, {
      skipGraveyardPan,
      callback,
    });
    
    // Update game state
    player.alive = false;
    this.state.alive = this.state.alive.filter(id => id !== player.id);
    this.hud.refreshPlayerList(this.state);
    
    console.log('[ELIM] eliminating', player.name, 'type='+deathType, 'spectate='+this._spectateMode);

    // Handle human player entering spectate mode
    if (player.isHuman && !this._spectateMode) {
      this._enterSpectateMode();
    }
    
    // Check win condition
    if (this._checkWinCondition()) return;
    
    // Legacy animation sequence (kept for compatibility)
    this.charManager.playDeathAnimation(player.id, () => {
      if (skipGraveyardPan) { 
        if (callback) callback(); 
        return; 
      }

      // Pan directly to the new gravestone so name+logo sprite is visible
      const newestGrave = this.village.gravestones[this.village.gravestones.length - 1];
      this.cinCamera.panToGraveyard(() => {
        console.log('[ELIM] graveyard pan complete');
        if (callback) callback();
      }, newestGrave);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONVENIENCE METHODS — Call these from specific death callbacks
  // These ensure consistent death handling across all death types
  // ═══════════════════════════════════════════════════════════════════════════

  // Called when mafia kills a player at night
  _onMafiaKill(player, targetPlayer) {
    return this.deathHandler.onMafiaKill(player, targetPlayer);
  }

  // Called when sheriff shoots a player
  _onSheriffKill(player, targetPlayer) {
    return this.deathHandler.onSheriffKill(player, targetPlayer);
  }

  // Called when village lynches a player
  _onLynch(targetPlayer, voteCount) {
    return this.deathHandler.onLynch(targetPlayer, voteCount);
  }

  _enterSpectateMode() {
    this._spectateMode = true;

    // Hide the speak input if it was open (human is dead, no longer their turn)
    const speakPanel = document.getElementById('speak-input-panel');
    if (speakPanel) speakPanel.classList.remove('visible');
    // Cancel any pending human turn timer
    if (this.state) {
      this.state.waitingForHuman = false;
      clearInterval(this.timerInterval);
    }

    // Show spectate banner
    const banner = document.getElementById('spectate-banner');
    if (banner) {
      banner.style.display = 'flex';
      banner.style.opacity = '1';
      banner.style.transition = 'opacity 1.5s ease';
      setTimeout(() => { banner.style.opacity = '0'; }, 3000);
      setTimeout(() => { banner.style.display = 'none'; }, 4500);
    }

    // Activate the full Turing-Games-style spectator HUD
    if (this.state) {
      this.specHUD.activate(this.state.players);
      this.specHUD.announce('YOU HAVE BEEN ELIMINATED', 'SPECTATING', 4000);
      this.specHUD.setWatching('AMPHITHEATER', '#c9a84c');
    }

    // Update role badge
    const roleBadge = document.getElementById('role-badge');
    if (roleBadge) roleBadge.textContent = 'SPECTATING';
    // Refresh player list to show all roles
    if (this.state) this.hud.refreshPlayerList(this.state);

    // Enable free-roam keyboard controls
    this._startFreeRoam();

    // Reveal all roles to spectator in chat
    if (this.state) {
      const roleLines = this.state.players
        .map(p => `${p.name} - ${p.role.toUpperCase()}${p.alive ? '' : ' †'}`)
        .join(' | ');
      this.hud.addChat('ROLES REVEALED', roleLines);
      // Show roles on character nameplates
      this.state.players.forEach(p => { const c = this.charManager.getCharacter(p.id); if (c?.showRole) c.showRole(true); });
    }

    this.hud.addChat('SYSTEM', 'You have been eliminated. The game continues — WASD to roam, R to toggle cinematic/free cam');
    // Update the spectator button to remove the warning and just toggle HUD overlay
    const specBtn = document.getElementById('spectator-toggle-btn');
    if (specBtn) {
      specBtn.title = 'Toggle HUD overlay';
      specBtn.style.opacity = '0.55';
      // Repoint onclick to just toggle the sidebar visibility
      specBtn.onclick = () => {
        const sidebar = document.getElementById('spec-sidebar');
        if (sidebar) sidebar.classList.toggle('visible');
      };
    }
    // Game continues - do NOT stop any timers or game state
  }

  // ── Camera angle nudge (W/A/S/D) ─────────────────────────────────────────
  // Works every frame — directly moves camera each tick keys are held.
  // W = up, S = down, A = orbit left, D = orbit right.
  // Auto-resets when the next speaker's camera fires.
  // ── Spherical-coordinate camera nudge ──────────────────────────────────────
  // Uses theta (horizontal orbit) + phi (vertical tilt) around the speaker.
  // W = tilt up (decrease phi), S = tilt down, A = orbit left, D = orbit right.
  // Storing angles means the position recalculates correctly every frame.
  // Auto-resets to default when next speaker fires.
  _startCamNudge() {
    this._camNudgeKeys  = {};
    this._nudgeTheta    = 0;
    this._nudgePhi      = 0;
    this._nudgeTarget   = new THREE.Vector3(0, 5.8, 0);
    this._nudgeArm      = new THREE.Vector3(); // reused every frame — no GC

    this._camNudgeKeyDown = (e) => {
      if (document.activeElement?.tagName === 'TEXTAREA') return;
      if (document.activeElement?.tagName === 'INPUT') return;
      this._camNudgeKeys[e.key] = true;
    };
    this._camNudgeKeyUp = (e) => { delete this._camNudgeKeys[e.key]; };

    document.addEventListener('keydown', this._camNudgeKeyDown);
    document.addEventListener('keyup',   this._camNudgeKeyUp);

    const D_THETA    = 0.025;          // rad/frame horizontal
    const D_PHI      = 0.022;          // rad/frame vertical
    const MAX_THETA  = Math.PI * 0.45; // ±81° horizontal limit
    const MIN_PHI    = -0.6;           // rad below default (~34°)
    const MAX_PHI    =  0.7;           // rad above default (~40°)

    this._camNudgeUpdate = () => {
      if (this._freeRoamActive) return;
      const k = this._camNudgeKeys;
      if (!k['w'] && !k['W'] && !k['s'] && !k['S'] &&
          !k['a'] && !k['A'] && !k['d'] && !k['D']) return;

      // Accumulate angle offsets
      if (k['w'] || k['W']) this._nudgePhi   = Math.max(MIN_PHI, this._nudgePhi - D_PHI);
      if (k['s'] || k['S']) this._nudgePhi   = Math.min(MAX_PHI, this._nudgePhi + D_PHI);
      if (k['a'] || k['A']) this._nudgeTheta = Math.max(-MAX_THETA, this._nudgeTheta - D_THETA);
      if (k['d'] || k['D']) this._nudgeTheta = Math.min( MAX_THETA, this._nudgeTheta + D_THETA);

      this._applyNudgeToCamera();
    };
  }

  // Recompute camera position from base position + spherical offsets
  _applyNudgeToCamera() {
    if (!this._nudgeBasePos || !this._nudgeTarget) return;
    const cam    = this.cinCamera.camera;
    const target = this._nudgeTarget;
    const base   = this._nudgeBasePos;

    // Reuse pre-allocated arm vector
    const arm = this._nudgeArm.subVectors(base, target);

    // Apply theta (yaw) around Y axis
    const cosT = Math.cos(this._nudgeTheta), sinT = Math.sin(this._nudgeTheta);
    const rotX = arm.x * cosT - arm.z * sinT;
    const rotZ = arm.x * sinT + arm.z * cosT;
    arm.x = rotX; arm.z = rotZ;

    // Apply phi (pitch) — rotate arm up/down around the horizontal tangent
    const hLen = Math.sqrt(arm.x * arm.x + arm.z * arm.z);
    const cosP = Math.cos(this._nudgePhi), sinP = Math.sin(this._nudgePhi);
    const newHLen = hLen * cosP - arm.y * sinP;
    const newY    = hLen * sinP + arm.y * cosP;
    if (hLen > 0.001) { arm.x *= newHLen / hLen; arm.z *= newHLen / hLen; }
    arm.y = newY;

    // Position camera
    cam.position.copy(target).add(arm);
    cam.lookAt(target.x, target.y, target.z);
  }

  // Called each time GSAP finishes positioning camera for a new speaker
  _setNudgeTarget(x, y, z) {
    this._nudgeTarget  = new THREE.Vector3(x, y, z);
    this._nudgeBasePos = this.cinCamera.camera.position.clone();
    this._nudgeTheta   = 0;
    this._nudgePhi     = 0;
  }

  _resetCamNudge() {
    if (this._camNudgeKeys) this._camNudgeKeys = {};
    this._nudgeTheta = 0;
    this._nudgePhi   = 0;
  }

  _stopCamNudge() {
    if (this._camNudgeKeyDown) document.removeEventListener('keydown', this._camNudgeKeyDown);
    if (this._camNudgeKeyUp)   document.removeEventListener('keyup',   this._camNudgeKeyUp);
    this._camNudgeUpdate = null;
    this._camNudgeKeys   = {};
  }

  _startFreeRoam() {
    if (this._freeRoamActive) return;
    this._freeRoamActive = false; // starts in cinematic mode
    this._freeRoamKeys = {};

    const BORDER = 44; // world boundary
    const SPEED = 0.15;
    // Pre-allocate reusable vectors — avoid GC churn every frame
    const _fwdVec  = new THREE.Vector3();
    const _rightVec = new THREE.Vector3();
    const _upAxis   = new THREE.Vector3(0, 1, 0);

    this._freeRoamKeyDown = (e) => {
      this._freeRoamKeys[e.key] = true;
      // R = toggle between free-roam and cinematic follow
      if (e.key === 'r' || e.key === 'R') {
        this._freeRoamActive = !this._freeRoamActive;
        this.hud.addChat('SYSTEM', this._freeRoamActive
          ? 'Free roam mode — WASD to move'
          : 'Cinematic mode — following the action');
      }
    };
    this._freeRoamKeyUp = (e) => { this._freeRoamKeys[e.key] = false; };

    document.addEventListener('keydown', this._freeRoamKeyDown);
    document.addEventListener('keyup', this._freeRoamKeyUp);

    // Free roam update - runs in the main animate loop via update()
    this._freeRoamUpdate = () => {
      if (!this._freeRoamActive) return;
      const k = this._freeRoamKeys;
      const cam = this.cinCamera.camera;

      // Reuse pre-allocated vectors
      cam.getWorldDirection(_fwdVec);
      _fwdVec.y = 0; _fwdVec.normalize();
      _rightVec.crossVectors(_fwdVec, _upAxis);

      if (k['w'] || k['W'] || k['ArrowUp'])    cam.position.addScaledVector(_fwdVec, SPEED);
      if (k['s'] || k['S'] || k['ArrowDown'])   cam.position.addScaledVector(_fwdVec, -SPEED);
      if (k['a'] || k['A'] || k['ArrowLeft'])   cam.position.addScaledVector(_rightVec, -SPEED);
      if (k['d'] || k['D'] || k['ArrowRight'])  cam.position.addScaledVector(_rightVec, SPEED);

      // Enforce world border
      cam.position.x = Math.max(-BORDER, Math.min(BORDER, cam.position.x));
      cam.position.z = Math.max(-BORDER, Math.min(BORDER, cam.position.z));
      cam.position.y = Math.max(2, Math.min(50, cam.position.y));
    };
  }

  _stopFreeRoam() {
    if (this._freeRoamKeyDown) document.removeEventListener('keydown', this._freeRoamKeyDown);
    if (this._freeRoamKeyUp)   document.removeEventListener('keyup', this._freeRoamKeyUp);
    this._freeRoamActive = false;
    this._freeRoamKeys = {};
  }

  // ─── NIGHT PHASE ─────────────────────────────────────────────────────────────

  _startNightPhase() {
    // Phase guard — only ELIMINATING can transition to night.
    // NIGHT/GAMEOVER mean either it already started or game ended.
    if (!this.state) return;
    if (this.state.phase === 'NIGHT' || this.state.phase === 'GAMEOVER') {
      console.log('[NIGHT] blocked — phase is already ' + this.state.phase);
      return;
    }
    console.log('[NIGHT] _startNightPhase called, day=' + this.state.day + ', phase=' + this.state.phase);
    if (this._checkWinCondition()) { console.log('[NIGHT] win condition met, aborting'); return; }
    this.state.phase = 'NIGHT'; // set first — prevents any re-entry
    this.voiceEngine?.stop();   // silence any leftover day/vote speech
    
    // CRITICAL FIX: Reset all night action state to prevent stale data
    this.state._mafiaKillTarget  = null;
    this.state._sheriffNightKill = null;
    this.state.doctorProtectedId = null;
    this.state._nightActionsCompleted = false; // Flag to prevent double-processing
    this.state._nightProcessingPath = null; // Track which path is processing night actions
    
    console.log('[NIGHT] State reset — killTarget: null, sheriffKill: null, protected: null');
    // Subtitle goes back up at night to clear night panel UI
    document.getElementById('spec-lower-third')?.classList.remove('day-mode');

    document.getElementById('phase-badge').textContent = `NIGHT ${this.state.day}`;
    if (this._spectateMode) {
      this.specHUD.setMinimalNightUi(true);
      this.specHUD.setVignette('night', 4000); // dark blue vignette at night start
    }
    this.soundEngine.play('nightFall');
    this.skybox.setNight();
    this.village.setNightLighting();

    const human = this.state.players.find(p => p.isHuman);
    const alive  = this.state.players.filter(p => p.alive);

    // Cinematic overhead sweep (1.2s), then disperse characters
    this.cinCamera.setNightView();

    setTimeout(() => {
      this._disperseCharactersForNight(alive);

      if (this._spectateMode || !human?.alive) {
        this._showSpectatorNightUI(alive, () => this._processNightOutcome(alive));
        return;
      }

      if      (human.role === 'mafia')   this._humanMafiaNightAction(alive);
      else if (human.role === 'sheriff') this._humanSheriffNightAction(alive);
      else if (human.role === 'doctor')  this._humanDoctorNightAction(alive);
      else                               this._humanVillagerNightWait(alive);
    }, 1200);
  }

  // Move everyone away from the amphitheater to their night locations
  // Distribute characters to their night buildings.
  // Each building has a grid of spawn slots so even large mafia groups don't stack.
  _disperseCharactersForNight(alive) {
    // FIXED: NIGHT_Y_SURFACE=4.1 for y=3 floors (hospital/sheriff). Character stands ON floor, not IN walls.
    // Floor is at y=3, character center is ~1.1 above floor = y=4.1
    const NIGHT_Y_SURFACE = 4.1; // hospital + sheriff: voxel floor y=3, char stands at 4.1
    const MAFIA_Y         = 2.1; // mafia bunker: voxel floor y=0, char needs 2.1

    const GRIDS = {
      // ── SHERIFF: office - clean area with good visibility
      // REVAMPED: New positions for updated sheriff station interior
      // Sheriff station: cx=36, cz=-36, office is south half (z=-36 to -45)
      // Positions are within open floor area, facing the desk/evidence board
      sheriff: [
        [34,NIGHT_Y_SURFACE,-40],[36,NIGHT_Y_SURFACE,-40],[38,NIGHT_Y_SURFACE,-40],
        [34,NIGHT_Y_SURFACE,-42],[36,NIGHT_Y_SURFACE,-42],[38,NIGHT_Y_SURFACE,-42],
        [32,NIGHT_Y_SURFACE,-44],[36,NIGHT_Y_SURFACE,-44],[40,NIGHT_Y_SURFACE,-44],
        [34,NIGHT_Y_SURFACE,-38],[38,NIGHT_Y_SURFACE,-38],
      ],
      // ── DOCTOR: hospital ward - open centre aisle, clear of wall props and beds
      // REVAMPED: Better positions for updated hospital interior
      // Hospital: cx=-36, cz=-36. Interior clear aisle runs along cx, cz-4 to cz+2
      doctor: [
        [-36,NIGHT_Y_SURFACE,-34],[-34,NIGHT_Y_SURFACE,-34],[-38,NIGHT_Y_SURFACE,-34],
        [-36,NIGHT_Y_SURFACE,-32],[-34,NIGHT_Y_SURFACE,-32],[-38,NIGHT_Y_SURFACE,-32],
        [-32,NIGHT_Y_SURFACE,-34],[-40,NIGHT_Y_SURFACE,-34],
        [-36,NIGHT_Y_SURFACE,-36],[-34,NIGHT_Y_SURFACE,-36],
      ],
    };
    const CENTRES = {
      // FIX: Sheriff chars were facing south (+Z) because centre was north wall [36,-45].
      // All cameras are east (x≈44), so a south-facing char shows only its right-side profile.
      // New centre [25,-41] is WEST of the character cluster (x=34-40) at median Z.
      // Formula: atan2(-(centre.x-char.x), -(centre.z-char.z)) = atan2(11,0) = PI/2 → facing +X (east) ✓
      sheriff: [25, -41], // face EAST — east-wall cameras now see front faces
      doctor:  [-36, -28], // face south toward camera (already correct)
    };

    // ── TELEPORT CAMERA POSITIONS for spectator mode ──
    // These define where the camera is positioned during night phase
    this._nightCameraPositions = {
      // Sheriff: camera positioned to show full character body with office background
      // Positioned near the evidence board, showing the desk and jail area
      // Sheriff: camera east (x=47) looking west — chars face east ✓
      sheriff: { position: [47, 8, -41], lookAt: [35, 5, -41] },
      // Doctor: camera positioned in the hospital ward aisle
      // Shows character with hospital beds and medical equipment in background
      doctor: { position: [-42, 7, -28], lookAt: [-36, 4, -34] },
      // Mafia: camera south of table (z=60) looking north — all chars now face south ✓
      mafia: { position: [-3, 8, 60], lookAt: [-3, 3, 48] },
    };

    // ── MAFIA: compute circular formation around planning table ──────────
    const mafiaPlayers = this.state.players.filter(p => p.role === 'mafia' && p.alive);
    const mafiaCircle = this._computeMafiaCirclePositions(mafiaPlayers);

    const slotIdx = { sheriff:0, doctor:0 };
    let mafiaIdx = 0;

    for (const player of this.state.players) {
      const char = this.charManager.getCharacter(player.id);
      if (!char) continue;

      if (player.role === 'mafia' && player.alive) {
        const slot = mafiaCircle[mafiaIdx % mafiaCircle.length];
        mafiaIdx++;
        char.group.position.set(slot.position.x, MAFIA_Y, slot.position.z);
        char.group.rotation.y = slot.rotation;
        char.group.visible = true;
      } else {
        const grid = GRIDS[player.role];
        if (grid) {
          const slot = grid[slotIdx[player.role] % grid.length];
          slotIdx[player.role]++;
          char.group.position.set(
            slot[0] + (Math.random() - 0.5) * 0.6,
            slot[1],
            slot[2] + (Math.random() - 0.5) * 0.6
          );
          const c = CENTRES[player.role];
          const dx = c[0] - char.group.position.x;
          const dz = c[1] - char.group.position.z;
          char.group.rotation.y = Math.atan2(-dx, -dz);
          char.group.visible = true;
        } else {
          char.group.visible = false; // villagers disappear at night
        }
      }
    }
  }

  // Compute debate-style face-to-face formation for mafia around planning table.
  // Instead of a circle (amphitheater style), mafia split into two opposing sides:
  //   FRONT side  (z ≈ 44–45): faces NORTH (+Z) toward back group
  //   BACK  side  (z ≈ 51–52): faces SOUTH (-Z) toward front group
  // This creates a proper conference-table debate feel.
  // Returns an array of { position: Vector3, rotation: number } matching
  // the computeSeats() shape so the rest of the engine works unchanged.
  _computeMafiaCirclePositions(mafiaPlayers) {
    const n = mafiaPlayers.length;
    if (n === 0) return [];

    // Mafia bunker table center
    const CX = -3, CZ = 48;
    const MAFIA_Y = 2.1;

    // ── Helper to build a seat record ────────────────────────────────────
    const seat = (x, z, ry) => ({
      position: new THREE.Vector3(x, MAFIA_Y, z),
      rotation:  ry,
      index: 0, // filled below
    });

    // FIX: All mafia chars now face SOUTH (rotation=0 = +Z direction) toward the
    // main spectator cameras which are placed south of the table (z=54-62 looking north).
    // The old FACE_SOUTH=PI made back-row chars face north (away from camera), showing
    // only their dark backs in every wide/table/thinking shot.
    // The "debate at a table" read is preserved by position; both rows are now visible.
    const FACE_NORTH = 0;   // both rows face +Z (south) — toward the spectator cameras
    const FACE_SOUTH = 0;   // same as FACE_NORTH — back row also faces south camera

    let slots = [];

    if (n === 1) {
      // Solo mafia: stand at front-centre, face camera (south)
      slots = [ seat(CX, CZ + 3.5, FACE_SOUTH) ];

    } else if (n === 2) {
      // Two mafia directly across the table from each other
      slots = [
        seat(CX,       CZ - 3.5, FACE_NORTH),  // front, faces back player
        seat(CX,       CZ + 3.5, FACE_SOUTH),  // back,  faces front player
      ];

    } else if (n === 3) {
      // Triangle: one at front-centre, two at back spread
      slots = [
        seat(CX,       CZ - 3.5, FACE_NORTH),  // front-centre
        seat(CX - 2.2, CZ + 3.5, FACE_SOUTH),  // back-left
        seat(CX + 2.2, CZ + 3.5, FACE_SOUTH),  // back-right
      ];

    } else if (n === 4) {
      // Classic two-vs-two across the table, slightly staggered
      slots = [
        seat(CX - 2.0, CZ - 3.5, FACE_NORTH),  // front-left
        seat(CX + 2.0, CZ - 3.5, FACE_NORTH),  // front-right
        seat(CX - 2.0, CZ + 3.5, FACE_SOUTH),  // back-left
        seat(CX + 2.0, CZ + 3.5, FACE_SOUTH),  // back-right
      ];

    } else {
      // 5+ mafia: fill both sides, distributing evenly.
      // Front gets ceil(n/2), back gets floor(n/2).
      const frontCount = Math.ceil(n / 2);
      const backCount  = n - frontCount;
      const frontSpacing = Math.min(2.4, 8 / Math.max(1, frontCount - 1));
      const backSpacing  = Math.min(2.4, 8 / Math.max(1, backCount  - 1));

      for (let i = 0; i < frontCount; i++) {
        const xOff = frontCount === 1 ? 0 : -((frontCount - 1) * frontSpacing / 2) + i * frontSpacing;
        slots.push(seat(CX + xOff, CZ - 3.5, FACE_NORTH));
      }
      for (let i = 0; i < backCount; i++) {
        const xOff = backCount === 1 ? 0 : -((backCount - 1) * backSpacing / 2) + i * backSpacing;
        slots.push(seat(CX + xOff, CZ + 3.5, FACE_SOUTH));
      }
    }

    // Store for use by debate cameras, and stamp index
    this._mafiaDebatePositions = slots.map((s, i) => ({ ...s, index: i }));
    return this._mafiaDebatePositions;
  }

  // Return which "row" a mafia character is in for debate camera logic.
  // 'front' → z < CZ (player is on front side, facing north)
  // 'back'  → z >= CZ (player is on back side, facing south)
  _mafiaDebateRow(playerId) {
    const char = this.charManager.getCharacter(playerId);
    if (!char) return 'front';
    return char.group.position.z < 48 ? 'front' : 'back';
  }

  // Restore characters to their circle seats after night
  _recallCharactersFromNight() {
    if (!this.charManager.computedSeats) return;
    const { seats } = this.charManager.computedSeats;

    this.state.players.forEach((player, idx) => {
      const char = this.charManager.getCharacter(player.id);
      if (!char) return;

      if (player.alive) {
        const seat = seats[idx];
        if (seat) {
          char.group.position.copy(seat.position);
          char.group.rotation.y = seat.rotation;
        }
        char.group.visible = true;
      } else {
        // Dead players stay invisible
        char.group.visible = false;
      }
    });

    // Camera: if in spectate cinematic mode, pan back to amphitheater overview
    if (this._spectateMode && !this._freeRoamActive) {
      this.cinCamera.pullBackToTable();
    }
  }

  // ── SPECTATOR NIGHT SYSTEM ────────────────────────────────────────────────
  // Full cinematic approach: each location gets a proper film-director sequence.
  // Establishing shot → interior wide → character close-ups timed to dialogue.
  // Spectator can switch locations mid-night via the switcher UI.

  _showSpectatorNightUI(alive, callback) {
    this._specCurrentGroup = null; // will be set after cinematic entrance
    this._specManualSwitch  = false; // reset each night
    this._specAlive         = alive;
    this._specCallback      = callback;
    this.specHUD?.setMinimalNightUi(true);

    const mafia   = alive.filter(p => p.role === 'mafia');
    const sheriff = alive.find(p => p.role === 'sheriff');
    const doctor  = alive.find(p => p.role === 'doctor');

    const switcher = document.getElementById('spectator-night-switcher');
    if (switcher) {
      switcher.style.display = 'block';
      this._buildSpecSwitcher(switcher, mafia, sheriff, doctor);
    }
    this._hideLegacySpectatorCotBar();

    // Ensure subtitle bar (lower-third) is visible and shows "watching..." hint
    const lt = document.getElementById('spec-lower-third');
    const ls = document.getElementById('spec-lower-speaker');
    const ltxt = document.getElementById('spec-lower-text');
    if (lt) { lt.classList.add('visible'); lt.style.setProperty('--spec-role-color', 'rgba(201,168,76,0.6)'); }
    if (ls) ls.innerHTML = `<span style="color:#c9a84c">◎</span> WATCHING`;
    if (ltxt) ltxt.textContent = 'The night begins… AI agents are deciding their moves.';

    // Choose first location to cinematically enter
    const firstRole = mafia.length ? 'mafia' : sheriff ? 'sheriff' : 'doctor';
    this._spectateLocation(firstRole, true /* withCinematic */);

    // Run all night actions in parallel — with cinematic hooks as each AI decides
    this._runNightActionsWithSpectator(alive, callback);
  }

  _buildSpecSwitcher(el, mafia, sheriff, doctor) {
    // Remove any stale body-mounted CoT container from a previous night
    const stale = document.getElementById('spec-cot-container');
    if (stale) stale.remove();

    // Keep the switcher element empty — we mount the CoT container directly on
    // document.body so it is never a descendant of an element that has a CSS
    // `transform` applied.  Any ancestor with transform:anything creates a new
    // containing block for position:fixed children, trapping them relative to
    // that ancestor instead of the viewport.  Moving to body avoids this entirely.
    el.innerHTML = '';

    const cotContainer = document.createElement('div');
    cotContainer.id = 'spec-cot-container';
    cotContainer.style.overflowY = 'auto';
    cotContainer.innerHTML = `
      <div id="night-cot-header-label">
        <span class="cot-dot"></span>
        AI
      </div>
      <div id="spec-thought-feed" style="font-family:'Crimson Pro',serif;font-size:0.82rem;color:#d1d5db;line-height:1.58"></div>
    `;
    document.body.appendChild(cotContainer);
  }

  _spectateLocation(role, withCinematic = false, manualClick = false) {
    // Update the night icons row + now-watching badge
    if (this._spectateMode) {
      this.specHUD?.setNightIconActive(role);
      const roleLabels = { mafia:'MAFIA BUNKER', doctor:'HOSPITAL', sheriff:'SHERIFF STATION' };
      const roleColors = { mafia:'#ef4444', doctor:'#60a5fa', sheriff:'#fcd34d' };
      this.specHUD?.setWatching(roleLabels[role] || role, roleColors[role]);
      this.specHUD?.startNightIconTimer(role, 30000); // 30s countdown per role phase
      // Show mafia secret chat only when watching mafia
      if (role === 'mafia') this.specHUD?.showMafiaChat();
      else this.specHUD?.hideMafiaChat();
    }
    const prev = this._specCurrentGroup;
    this._specCurrentGroup = role;
    this._lastCinematicCut = 0; // reset throttle so new room always gets an immediate shot
    if (manualClick) this._specManualSwitch = true;

    // Update button states — active button glows, others dim
    ['mafia','sheriff','doctor'].forEach(r => {
      const b = document.getElementById(`spec-btn-${r}`);
      if (!b) return;
      if (r === role) {
        b.style.opacity   = '1';
        b.style.transform = 'scale(1.08)';
        b.style.boxShadow = r==='mafia' ? '0 0 14px #ef4444' : r==='sheriff' ? '0 0 14px #fcd34d' : '0 0 14px #60a5fa';
        b.style.filter    = 'brightness(1.2)';
      } else {
        b.style.opacity   = '0.38';
        b.style.transform = 'scale(1)';
        b.style.boxShadow = 'none';
        b.style.filter    = 'brightness(0.8)';
      }
    });

    const locationName = role==='mafia' ? '▲ Mafia Bunker' : role==='sheriff' ? '◆ Sheriff Station' : '✚ Hospital';
    this._setShotLabel(locationName);

    // ── Night location background overlay ──────────────────────────────────
    const bg = document.getElementById('night-location-bg');
    const badge = document.getElementById('night-location-badge');
    if (bg) {
      bg.className = 'visible ' + role;
    }
    if (badge && !this.specHUD?._minimalNightUi) {
      const icons  = { mafia:'▲', sheriff:'◆', doctor:'✚' };
      const labels = { mafia:'MAFIA BUNKER', sheriff:'SHERIFF STATION', doctor:'HOSPITAL' };
      const colors = { mafia:'#ef4444', sheriff:'#fcd34d', doctor:'#60a5fa' };
      badge.className = 'visible ' + role;
      badge.innerHTML = `<span>${icons[role]||'•'}</span><span>${labels[role]||role.toUpperCase()}</span>`;
      badge.style.color = colors[role] || '#fff';
    } else if (badge) {
      badge.className = '';
    }

    // Filter CoT feed to show only relevant entries for this location
    this._filterCotFeed(role);

    if (withCinematic) {
      this.cinCamera.playBuildingEntrance(role, () => this._setShotLabel('Interior Wide'));
    } else {
      const view = this.cinCamera.getBuildingViewPos(role, 'wide');
      if (view) {
        this.cinCamera.blendTo(view.cam, view.look, 0.9, 'power2.inOut',
          () => this._setShotLabel('Interior Wide'));
      }
    }
  }

  // Show/hide CoT entries based on which location the spectator is watching
  _filterCotFeed(role) {
    const feed = document.getElementById('spec-thought-feed');
    if (!feed) return;
    feed.querySelectorAll('[data-role]').forEach(el => {
      el.style.display = el.dataset.role === role ? '' : 'none';
    });
    // Scroll to bottom of visible entries
    const container = document.getElementById('spec-cot-container');
    if (container) container.scrollTop = container.scrollHeight;
  }

  _setShotLabel(text) {
    const el = document.getElementById('spec-shot-label');
    if (el) el.textContent = `SHOT: ${text}`;
  }

  // _spectatorThought: push CoT entry to the spectator-only feed.
  // isThinking=true → shown as italic grey "internal thought" (chain-of-thought)
  // isThinking=false → shown as bold white "final answer/decision"
  // Entries tagged with data-role so feed can be filtered by location.
  _spectatorThought(player, text, isThinking = false, onSpeakEnd = null) {
    if (!text) return;
    const roleColor = { mafia:'#ef4444', sheriff:'#fcd34d', doctor:'#60a5fa', villager:'#6ee7b7' }[player.role] || '#9ca3af';
    const roleIcon  = { mafia:'▲', sheriff:'◆', doctor:'✚', villager:'⌂' }[player.role] || '?';
    const publicText = this._getPublicSpeechText(text);

    // Thinking text goes to CoT/status surfaces only.
    if (isThinking) {
      if (this._spectateMode && this.specHUD._active) {
        this._appendSpectatorCotEntry(player.role || 'mafia', `${roleIcon} ${player.name}`, text, { isAction: false });
        this.specHUD.hideLowerThird();
      }
    } else {
      // Final/public text only: subtitle + overhead bubble.
      if (publicText) {
        const bubbleText = publicText.length > 250 ? publicText.slice(0, 248) + '…' : publicText;
        this.charManager.showSpeechBubble(player.id, bubbleText, 5000);
        if (this._spectateMode && this.specHUD._active) {
          this.specHUD.showSpeaking(player.name, publicText, 6000);
        }
        // TTS — speak night declarations in this model's unique voice.
        // onSpeakEnd is threaded in so _nightSpeakAndWait can gate on completion.
        if (!player.isHuman) this.voiceEngine?.speak(player, publicText, onSpeakEnd || undefined);
        else if (onSpeakEnd) onSpeakEnd(); // human player: fire callback immediately
      } else if (onSpeakEnd) {
        onSpeakEnd(); // no speakable text: unblock caller immediately
      }
      if (this._spectateMode && this.specHUD._active && publicText) {
        this._appendSpectatorCotEntry(player.role || 'mafia', `${roleIcon} ${player.name}`, '', {
          answerText: publicText,
        });
      }
    }

    if (this._spectateMode && this.specHUD._active) {
      const lt = document.getElementById('spec-lower-third');
      const ls = document.getElementById('spec-lower-speaker');
      if (lt) lt.style.setProperty('--spec-role-color', roleColor);
      if (ls && !isThinking && publicText) ls.innerHTML = `<span style="color:${roleColor}">${roleIcon}</span> ${player.name}`;
    }

    // Cinematic snap
    if (this._specCurrentGroup === player.role) {
      this._cinematicSnapToPlayer(player, isThinking);
    }
  }

  // _nightSpeakAndWait: same two-gate pattern as daytime speech.
  // Fires _spectatorThought (which handles visuals + TTS) then awaits whichever
  // completes last: the minimum display timer OR the TTS onComplete callback.
  // A safety cap (minMs + 10 s) prevents a hung TTS from stalling the game.
  async _nightSpeakAndWait(player, text, minMs = 2500) {
    if (!player.isHuman && this.voiceEngine) {
      let ttsCompleted  = false;
      let timerFired    = false;
      await new Promise(resolve => {
        const advance = () => { if (ttsCompleted && timerFired) resolve(); };

        // Minimum display time so text is readable even for fast TTS voices
        const minTimer = setTimeout(() => { timerFired = true; advance(); }, minMs);

        // Hard safety cap — unblocks even if voiceEngine never fires onComplete
        const safetyCap = setTimeout(() => {
          clearTimeout(minTimer);
          ttsCompleted = true;
          timerFired   = true;
          resolve();
        }, minMs + 10000);

        this._spectatorThought(player, text, false, () => {
          clearTimeout(safetyCap);
          ttsCompleted = true;
          advance();
        });
      });
    } else {
      // No TTS available — just show and wait the minimum display time
      this._spectatorThought(player, text, false);
      await this._sleep(minMs);
    }
  }

  // Full cinematic shot-sequence on a player — varies by context
  _cinematicSnapToPlayer(player, isThinking = false, forceCut = false) {
    // Throttle: don't cut more than once every 5 seconds during night
    const now = Date.now();
    if (!forceCut && this._lastCinematicCut && (now - this._lastCinematicCut) < 5000) return;
    this._lastCinematicCut = now;

    const char = this.charManager.getCharacter(player.id);
    if (!char) return;
    const pos   = new THREE.Vector3();
    char.group.getWorldPosition(pos);
    const facing = char.group.rotation.y;

    if (isThinking) {
      // Thinking: gentle wide-room blend so we see the whole group
      this._setShotLabel(`Thinking — ${player.name}`);
      if (player.role === 'mafia') {
        const tableView = this.cinCamera.getBuildingViewPos('mafia', 'table');
        if (tableView) this.cinCamera.blendTo(tableView.cam, tableView.look, 1.5, 'power2.inOut');
      } else {
        const roomView = this.cinCamera.getBuildingViewPos(player.role, 'characterWide');
        if (roomView) this.cinCamera.blendTo(roomView.cam, roomView.look, 1.5, 'power2.inOut');
      }
      return;
    }

    // ── MAFIA BUNKER: full debate-style camera cuts ──────────────────────
    if (player.role === 'mafia') {
      this._mafiaDebateShot(player, pos, facing);
      return;
    }

    // ── SHERIFF / DOCTOR: cycle through character-aware shots ─────────────
    const shotIdx = (this._shotCounter || 0) % 4;
    this._shotCounter = (this._shotCounter || 0) + 1;

    // Alternate between room-wide, character-medium, character-close, profile
    const nightShotKeys   = ['characterMed', 'characterClose', 'characterWide', 'profile'];
    const nightShotLabels = [
      'Medium — ' + player.name,
      'Close-Up — ' + player.name,
      'Wide — ' + player.name,
      'Profile — ' + player.name,
    ];
    this._setShotLabel(nightShotLabels[shotIdx]);
    const roomView = this.cinCamera.getBuildingViewPos(player.role, nightShotKeys[shotIdx]);
    if (roomView) {
      this.cinCamera.blendTo(roomView.cam, roomView.look, 0.9, 'power2.inOut');
    } else {
      this.cinCamera.safeCharacterShot(pos, facing, player.role);
    }
  }

  // ── Mafia debate camera — cinematic cross-cuts during bunker discussion ────
  // Rotates through 5 shot types that reference both the speaker's and
  // opponents' actual world positions so framing is always correct regardless
  // of which debate row they're in.
  _mafiaDebateShot(player, speakerPos, speakerFacing) {
    const shotIdx = (this._shotCounter || 0) % 5;
    this._shotCounter = (this._shotCounter || 0) + 1;

    // Find an opponent on the opposite side for OTS / reaction shots
    const allMafia = (this.state?.players || []).filter(p => p.role === 'mafia' && p.alive && p.id !== player.id);
    const row = this._mafiaDebateRow(player.id);
    const oppositeRow = row === 'front' ? 'back' : 'front';
    const opponent = allMafia.find(p => this._mafiaDebateRow(p.id) === oppositeRow) || allMafia[0];

    switch (shotIdx) {
      case 0: {
        // CLOSE-UP: camera in front of speaker along their facing direction
        const fwdX = Math.sin(speakerFacing);
        const fwdZ = Math.cos(speakerFacing);
        this.cinCamera.blendTo(
          new THREE.Vector3(speakerPos.x + fwdX * 7.0, speakerPos.y + 2.0, speakerPos.z + fwdZ * 7.0),
          new THREE.Vector3(speakerPos.x, speakerPos.y + 1.4, speakerPos.z),
          0.65, 'power2.out'
        );
        this._setShotLabel(`Close-Up — ${player.name}`);
        break;
      }
      case 1: {
        // 3/4 MEDIUM: slight side angle for depth
        const fwdX = Math.sin(speakerFacing), fwdZ = Math.cos(speakerFacing);
        const sideX = Math.cos(speakerFacing), sideZ = -Math.sin(speakerFacing);
        this.cinCamera.blendTo(
          new THREE.Vector3(speakerPos.x + fwdX * 6.5 + sideX * 1.8, speakerPos.y + 2.4, speakerPos.z + fwdZ * 6.5 + sideZ * 1.8),
          new THREE.Vector3(speakerPos.x, speakerPos.y + 1.5, speakerPos.z),
          0.70, 'power2.inOut'
        );
        this._setShotLabel(`Medium — ${player.name}`);
        break;
      }
      case 2: {
        // OVER-THE-SHOULDER: behind opponent, speaker visible across the table
        if (opponent) {
          const oppChar = this.charManager.getCharacter(opponent.id);
          if (oppChar) {
            const oppPos = new THREE.Vector3();
            oppChar.group.getWorldPosition(oppPos);
            const of = oppChar.group.rotation.y;
            const bX = -Math.sin(of), bZ = -Math.cos(of);   // behind opponent
            const sX =  Math.cos(of), sZ = -Math.sin(of);   // side offset
            this.cinCamera.blendTo(
              new THREE.Vector3(oppPos.x + bX * 2.8 + sX * 0.9, oppPos.y + 1.7, oppPos.z + bZ * 2.8 + sZ * 0.9),
              new THREE.Vector3(speakerPos.x, speakerPos.y + 1.4, speakerPos.z),
              0.55, 'power3.out'
            );
            this._setShotLabel(`OTS: ${opponent.name} → ${player.name}`);
            break;
          }
        }
        // Fallback → table wide
        const tw = this.cinCamera.getBuildingViewPos('mafia', 'table');
        if (tw) this.cinCamera.blendTo(tw.cam, tw.look, 0.8, 'power2.inOut');
        this._setShotLabel('Table Wide');
        break;
      }
      case 3: {
        // REACTION SHOT: face of a listening opponent
        const listener = opponent || allMafia[0];
        if (listener) {
          const lChar = this.charManager.getCharacter(listener.id);
          if (lChar) {
            const lPos = new THREE.Vector3();
            lChar.group.getWorldPosition(lPos);
            const lf = lChar.group.rotation.y;
            this.cinCamera.blendTo(
              new THREE.Vector3(lPos.x + Math.sin(lf) * 5.5, lPos.y + 1.8, lPos.z + Math.cos(lf) * 5.5),
              new THREE.Vector3(lPos.x, lPos.y + 1.35, lPos.z),
              0.45, 'power3.out'
            );
            this._setShotLabel(`Listening — ${listener.name}`);
            break;
          }
        }
        // Fallback → speaker medium
        const fwdX = Math.sin(speakerFacing), fwdZ = Math.cos(speakerFacing);
        this.cinCamera.blendTo(
          new THREE.Vector3(speakerPos.x + fwdX * 6.5, speakerPos.y + 2.2, speakerPos.z + fwdZ * 6.5),
          new THREE.Vector3(speakerPos.x, speakerPos.y + 1.4, speakerPos.z),
          0.6, 'power2.out'
        );
        this._setShotLabel(`Wide — ${player.name}`);
        break;
      }
      case 4: {
        // LOW-ANGLE POWER SHOT: camera down low, looking up at speaker
        const fwdX = Math.sin(speakerFacing), fwdZ = Math.cos(speakerFacing);
        this.cinCamera.blendTo(
          new THREE.Vector3(speakerPos.x + fwdX * 6.0, speakerPos.y + 0.5, speakerPos.z + fwdZ * 6.0),
          new THREE.Vector3(speakerPos.x, speakerPos.y + 2.1, speakerPos.z),
          0.70, 'power2.inOut'
        );
        this._setShotLabel(`Low Angle — ${player.name}`);
        break;
      }
    }
  }

  // Return which debate row a mafia character occupies.
  // 'front' = z < 48 (facing north toward back group)
  // 'back'  = z >= 48 (facing south toward front group)
  _mafiaDebateRow(playerId) {
    const char = this.charManager.getCharacter(playerId);
    if (!char) return 'front';
    return char.group.position.z < 48 ? 'front' : 'back';
  }

  // ── Streaming CoT for spectator ───────────────────────────────────────────
  // Streams AI response live. spectator sees thinking tokens (grey italic) appear
  // in real-time, then the final answer highlighted in bold white separately.
  // Returns the final answer string — uses POST to avoid URL length limits.
  async _streamNightThought(player, systemPrompt, userPrompt, options = {}) {
    let answerText = '';
    let thinkText  = '';
    this._setAiRuntimeError(player, null);
    this._cotUpdateFeed(player, '', '', true, options);

    return new Promise((resolve) => {
      let finished = false;
      const finish = (value, errCode = '') => {
        if (finished) return;
        finished = true;
        clearTimeout(timeoutHandle);
        const { cleanedAnswer } = this._resolveNightStreamSurfaceTexts(answerText, options);
        this._cotFinalise(player, cleanedAnswer, thinkText, options);
        if (errCode) this._setAiRuntimeError(player, errCode, 'night-stream');
        else this._setAiRuntimeError(player, null);
        resolve(cleanedAnswer || null);
      };

      const timeoutHandle = setTimeout(() => {
        finish(answerText || null, `TIMEOUT:${player.model}`);
      }, _clientSoftTimeout(player.model, 58000));

      (async () => {
        try {
          const resp = await fetch('/api/ai-speak', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              apiKey: this.state.apiKey,
              model: player.model,
              systemPrompt,
              userMessage: userPrompt,
              showThinking: true,
            }),
            signal: AbortSignal.timeout(_clientFetchTimeout(player.model, 65000)),
          });

          if (!resp.ok || !resp.body) {
            finish(answerText || null, `API_ERROR_${resp.status || 'FETCH'}`);
            return;
          }

          const reader = resp.body.getReader();
          const decoder = new TextDecoder();
          let buf = '';

          while (true) {
            const { done: rdDone, value } = await reader.read();
            if (rdDone) {
              finish(answerText || null, answerText.trim() ? '' : 'EMPTY_RESPONSE');
              return;
            }
            buf += decoder.decode(value, { stream: true });
            const lines = buf.split('\n');
            buf = lines.pop();

            for (const line of lines) {
              if (!line.startsWith('data: ') || finished) continue;
              let data;
              try { data = JSON.parse(line.slice(6)); } catch { continue; }

              if (data.error) {
                try { await reader.cancel(); } catch {}
                finish(answerText || null, data.error);
                return;
              }
              if (data.done) {
                try { await reader.cancel(); } catch {}
                finish(answerText || null, answerText.trim() ? '' : 'EMPTY_RESPONSE');
                return;
              }
              if (data.thinking) {
                thinkText += data.thinking;
                this._cotUpdateFeed(player, thinkText, answerText, true, options);
              }
              if (data.token) {
                answerText += data.token;
                this._cotUpdateFeed(player, thinkText, answerText, false, options);
              }
            }
          }
        } catch (e) {
          const code = (e?.name === 'AbortError' || e?.name === 'TimeoutError')
            ? `TIMEOUT:${player.model}`
            : this._normalizeAiErrorCode(e?.message || 'API_ERROR_NETWORK', player.model);
          finish(answerText || null, code);
        }
      })();
    });
  }

  // Update the CoT panel live while tokens arrive
  // thinkText = chain-of-thought (grey italic), answerText = final answer (bold white)
  _cotUpdateFeed(player, thinkText, answerText, isThinking, options = {}) {
    const roleColor = { mafia:'#ef4444', sheriff:'#fcd34d', doctor:'#60a5fa' }[player.role] || '#9ca3af';
    const roleIcon  = { mafia:'▲', sheriff:'◆', doctor:'✚' }[player.role] || '?';
    const { publicAnswer, cotAnswer } = this._resolveNightStreamSurfaceTexts(answerText, options);

    if (!this._spectateMode || !this.specHUD._active) return;

    if (this._cotHideTimer) { clearTimeout(this._cotHideTimer); this._cotHideTimer = null; }
    this._hideLegacySpectatorCotBar();

    const lt = document.getElementById('spec-lower-third');
    const ls = document.getElementById('spec-lower-speaker');

    if (publicAnswer) {
      // Role-contextual streaming label
      const streamLabel = {
        mafia:   `▲ ${player.name}  ·  DECIDING`,
        sheriff: `◆ ${player.name}  ·  THINKING`,
        doctor:  `✚ ${player.name}  ·  CONSIDERING`,
      }[player.role] || `${roleIcon} ${player.name}`;

      if (lt) { lt.style.setProperty('--spec-role-color', roleColor); lt.classList.add('visible'); }
      if (ls) ls.innerHTML = `<span style="color:${roleColor}">${streamLabel}</span>`;
      this.specHUD.showSpeaking(player.name, publicAnswer, 60000);
      this.specHUD.updateLowerText(publicAnswer);
    } else if (isThinking) {
      // Even while only thinking (no answer yet), keep subtitle visible with thinking label
      const thinkLabel = {
        mafia:   `▲ ${player.name}  ·  PLOTTING…`,
        sheriff: `◆ ${player.name}  ·  ANALYSING…`,
        doctor:  `✚ ${player.name}  ·  DELIBERATING…`,
      }[player.role] || `${roleIcon} ${player.name} · THINKING…`;

      if (lt) { lt.style.setProperty('--spec-role-color', roleColor); lt.classList.add('visible'); }
      if (ls) ls.innerHTML = `<span style="color:${roleColor}">${thinkLabel}</span>`;
      const ltxt = document.getElementById('spec-lower-text');
      if (ltxt && (!ltxt.textContent || ltxt.textContent === '…' || ltxt.textContent.startsWith('The night begins'))) {
        ltxt.textContent = '…';
      }
    } else {
      // No content yet — keep the box visible with a placeholder
      if (lt) lt.classList.add('visible');
    }

    const thinkDisplay = thinkText.length > 420 ? '…' + thinkText.slice(-418) : thinkText;
    this._upsertSpectatorCotLiveEntry(player, thinkDisplay, cotAnswer, isThinking);

    if (publicAnswer) {
      const short = publicAnswer.length > 120 ? publicAnswer.slice(0, 118) + '…' : publicAnswer;
      this.charManager.updateLiveSpeechBubble(player.id, short);
    }
  }

  // Mark the live entry as finalised — update both bottom bars
  _cotFinalise(player, answerText, thinkText, options = {}) {
    const roleColor = { mafia:'#ef4444', sheriff:'#fcd34d', doctor:'#60a5fa' }[player.role] || '#9ca3af';
    const roleIcon  = { mafia:'▲', sheriff:'◆', doctor:'✚' }[player.role] || '?';

    if (!this._spectateMode) return;

    const { publicAnswer: finalAnswer, cotAnswer } = this._resolveNightStreamSurfaceTexts(answerText, options);
    const finalThink  = thinkText && thinkText.length > 260 ? '…' + thinkText.slice(-258) : (thinkText || '');

    if (finalAnswer) this.charManager.showSpeechBubble(player.id, finalAnswer, 8000);

    const lt = document.getElementById('spec-lower-third');
    const ls = document.getElementById('spec-lower-speaker');
    if (finalAnswer) {
      // Role-contextual action label in subtitle speaker bar
      const roleActionLabel = {
        mafia:   `▲ ${player.name}  ·  FINAL DECISION`,
        sheriff: `◆ ${player.name}  ·  INVESTIGATING`,
        doctor:  `✚ ${player.name}  ·  PROTECTING`,
      }[player.role] || `${roleIcon} ${player.name}`;

      if (lt) {
        lt.style.setProperty('--spec-role-color', roleColor);
        lt.classList.add('visible');
      }
      if (ls) ls.innerHTML = `<span style="color:${roleColor}">${roleActionLabel}</span>`;
      this.specHUD.showSpeaking(player.name, finalAnswer, 9000);
      this.specHUD.updateLowerText(finalAnswer);
    } else {
      // Keep visible but show "waiting" hint so the box doesn't disappear
      const ltxt = document.getElementById('spec-lower-text');
      if (ltxt && (!ltxt.textContent || ltxt.textContent === '')) {
        ltxt.textContent = '…';
      }
    }
    this._hideLegacySpectatorCotBar();
    this._upsertSpectatorCotLiveEntry(player, finalThink, cotAnswer, false);
  }

  // Add a static status entry to the dedicated spectator CoT panel.
  _cotAddEntry(iconOrRole, label, text, isAction = false) {
    if (!this._spectateMode) return;
    this._appendSpectatorCotEntry(iconOrRole, label, text, { isAction });
  }

  // Full cinematic night runner with per-location entrance and dialogue shots
  async _runNightActionsWithSpectator(alive, callback) {
    const aiMafia   = alive.filter(p => !p.isHuman && p.role === 'mafia');
    const aiSheriff = alive.find(p => !p.isHuman && p.role === 'sheriff');
    const aiDoctor  = alive.find(p => !p.isHuman && p.role === 'doctor');

    // ══ MAFIA BUNKER ═══════════════════════════════════════════════════════
    if (aiMafia.length > 0) {
      const targets    = alive.filter(p => p.role !== 'mafia');
      const mafiaDiscussionLog = [];
      const formatMafiaDiscussionLog = () => mafiaDiscussionLog.map((line, idx) => `${idx + 1}. ${line}`).join('\n');

      // Wait for cinematic entrance if currently entering mafia location
      await this._sleep(this._specCurrentGroup === 'mafia' ? 2000 : 500);

      this.hud.addChat('SYSTEM', '▲ The Mafia convenes in their underground bunker...');

      for (let mi = 0; mi < aiMafia.length; mi++) {
        const mafioso = aiMafia[mi];
        if (this._specCurrentGroup === 'mafia') this._cinematicSnapToPlayer(mafioso, true, true);
        this.charManager.setThinking(mafioso.id, true);

        // LIVE STREAMING CoT — spectator watches tokens appear as AI reasons
        const partnerNames = aiMafia.filter(p => p.id !== mafioso.id).map(p => p.name).join(', ');
        const prompt   = buildMafiaDiscussPrompt(mafioso, this.state, targets, partnerNames);
        const promptUser = prompt.user
          + (mafiaDiscussionLog.length
              ? `\n\nMafia discussion so far:\n${formatMafiaDiscussionLog()}`
              : '\n\nYou are opening the bunker discussion. Set the lead clearly for the team.')
          + '\n\nSpeak like you are in one coordinated bunker meeting. In 1-2 short sentences, either support the current lead, challenge it, or refine it. End by naming the exact one target you want the mafia to agree on tonight.';
        // Only append step-by-step instruction for real thinking models (they emit <think> tags).
        // Non-thinking models (Haiku, GLM, etc.) will format "**My reasoning:**" in plain text
        // if asked to reason aloud — that text bleeds into the game speech bubble.
        const cotSys   = _isThinkingModel(mafioso.model)
          ? prompt.system + ' Think through your reasoning step-by-step before giving your answer. Keep the bunker discussion collaborative and concrete.'
          : prompt.system + ' Keep the bunker discussion collaborative and concrete.';
        const response = await this._streamNightThought(mafioso, cotSys, promptUser);
        const runtimeErr = this._consumeAiRuntimeError(mafioso);

        this.charManager.setThinking(mafioso.id, false);
        const spoken = (response || '').trim();
        if (runtimeErr) {
          this._surfaceAiRuntimeFailure(mafioso, runtimeErr, {
            contextLabel: 'night discussion',
            showBubble: !spoken,
            showSubtitle: !spoken,
            placeholderText: '[signal lost] Passing this turn.',
          });
        }

        if (spoken) {
          this.charManager.setSpeaking(mafioso.id, true);
          if (this._specCurrentGroup === 'mafia') this._cinematicSnapToPlayer(mafioso, false, true);
          mafiaDiscussionLog.push(`${mafioso.name}: ${spoken.length > 160 ? spoken.slice(0, 157) + '…' : spoken}`);
          // Two-gate: hold until both min display timer and TTS finish (same as daytime)
          await this._nightSpeakAndWait(mafioso, spoken, 1500);
        } else {
          this._cotAddEntry('mafia', '▲ ' + mafioso.name, 'no usable response; moving to next speaker.', true);
          await this._sleep(900);
        }

        const nextMafioso = aiMafia[mi + 1];
        if (nextMafioso) {
          if (this._specCurrentGroup === 'mafia') {
            const tableView = this.cinCamera.getBuildingViewPos('mafia', 'table');
            if (tableView) {
              this.cinCamera.blendTo(tableView.cam, tableView.look, 0.55, 'power2.inOut');
              this._setShotLabel('Table — Consensus');
            }
            await this._sleep(700);
            this._cinematicSnapToPlayer(nextMafioso, true, true);
            this._setShotLabel('Up Next — ' + nextMafioso.name);
            await this._sleep(650);
          } else {
            await this._sleep(350);
          }
        }

        this.charManager.setSpeaking(mafioso.id, false);
        await this._sleep(350);
      }

      // Kill decision — retry until valid target (Fix 5: no artificial gap between mafia→sheriff→doctor)
      const attacker  = aiMafia[0];
      const killPrompt = buildNightMafiaPrompt(attacker, this.state, targets);
      const killPromptUser = killPrompt.user
        + (mafiaDiscussionLog.length
            ? `\n\nBunker discussion recap:\n${formatMafiaDiscussionLog()}\n\nChoose the final target that best matches the bunker discussion.`
            : '\n\nChoose the final target for the bunker.')
        + '\nRespond with only the exact player name.';

      if (this._specCurrentGroup === 'mafia') {
        const tableView = this.cinCamera.getBuildingViewPos('mafia', 'table');
        if (tableView) {
          this.cinCamera.blendTo(tableView.cam, tableView.look, 0.65, 'power2.inOut');
          this._setShotLabel('Table — Final Consensus');
        }
        await this._sleep(750);
      }

      this._spectatorThought(attacker, 'final decision — weighing the options...', true);
      await this._sleep(400);

      // Retry up to 4× — some models misformat names on first attempt
      let killContent = null;
      let lastKillErr = null;
      for (let _ka = 0; _ka < 4; _ka++) {
        this._spectatorThought(attacker, _ka > 0 ? `retry ${_ka} — naming target...` : 'choosing tonight\'s target...', true);
        killContent = await this._aiDecide(attacker, killPrompt.system, killPromptUser);
        const decideErr = this._consumeAiRuntimeError(attacker);
        if (decideErr) {
          lastKillErr = decideErr;
          this._surfaceAiRuntimeFailure(attacker, decideErr, {
            contextLabel: 'mafia target selection',
            showBubble: false,
            showSubtitle: false,
          });
        }
        if (killContent && this._parseTarget(killContent, targets, attacker.id)) break;
        await this._sleep(300);
      }

      if (killContent) {
        const parsedTarget = this._parseTarget(killContent, targets, attacker.id);
        console.log(`[MAFIA KILL] Ringleader ${attacker.name} chose target ID: ${parsedTarget}`);
        console.log(`[MAFIA KILL] AI response: "${killContent.substring(0, 100)}..."`);
        
        // CRITICAL FIX: Only set kill target if not already set by another path
        if (!this.state._mafiaKillTarget) {
          this.state._mafiaKillTarget = parsedTarget;
          console.log(`[MAFIA KILL] Target set to: ${parsedTarget}`);
        } else {
          console.log(`[MAFIA KILL] Target already set to ${this.state._mafiaKillTarget} — keeping existing`);
        }
        
        const victim = alive.find(p => p.id === this.state._mafiaKillTarget);
        if (victim) {
          const char = this.charManager.getCharacter(attacker.id);
          const pos  = new THREE.Vector3();
          if (char) { char.group.getWorldPosition(pos); }
          // Extreme close-up for the kill declaration
          if (this._specCurrentGroup === 'mafia' && char) {
            this.cinCamera.cutToCharacter(pos, 'extreme_close', char.group.rotation.y);
            this._setShotLabel(`Extreme Close-Up — ${attacker.name}`);
          }
          const declText = `▲ Final call: ${victim.name}. Tonight.`;
          this.hud.addChat('SYSTEM', `▲ The Mafia has chosen their target.`);
          await this._nightSpeakAndWait(attacker, declText, 2500);
        }
      } else {
        const fallbackTarget = [...targets].sort((a, b) => (a.seatIndex ?? 999) - (b.seatIndex ?? 999))[0];
        this.state._mafiaKillTarget = fallbackTarget?.id;
        const fallbackName = fallbackTarget?.name || 'none';
        this.hud.addChat('SYSTEM', `[MODEL ERROR] Mafia produced no valid target. Deterministic fallback applied: ${fallbackName}.`);
        this._cotAddEntry('mafia', '▲ FAILSAFE', `No valid model output. Fallback target: ${fallbackName}.`, true);
        if (lastKillErr) {
          this._surfaceAiRuntimeFailure(attacker, lastKillErr, {
            contextLabel: 'mafia target selection',
            showBubble: false,
            showSubtitle: false,
          });
        }
      }

      // Pan back to bunker wide before leaving
      if (this._specCurrentGroup === 'mafia') {
        this.cinCamera.playRoomPan('mafia', 'table', 'wide', 1.4);
        await this._sleep(1500);
      }
    }

    // ══ SHERIFF STATION ════════════════════════════════════════════════════
    // Immediately after mafia finishes — no arbitrary sleep gap
    if (aiSheriff) {
      // Auto-cut to sheriff only if spectator hasn't manually switched away from auto-flow
      if (!this._specManualSwitch && this._specCurrentGroup !== 'sheriff') {
        this._spectateLocation('sheriff', true);
        await this._sleep(2000);
      }

      this.hud.addChat('SYSTEM', '◆ The Sheriff works through the night...');
      if (this._specCurrentGroup === 'sheriff') {
        const deskView = this.cinCamera.getBuildingViewPos('sheriff', 'desk');
        if (deskView) this.cinCamera.blendTo(deskView.cam, deskView.look, 1.2);
        this._setShotLabel('Desk — Investigating');
      }
      this.charManager.setThinking(aiSheriff.id, true);

      const shPrompt = buildNightSheriffPrompt(aiSheriff, this.state);
      const shCotSys = _isThinkingModel(aiSheriff.model)
        ? shPrompt.system + ' Think step-by-step about who is most suspicious before naming who to investigate.'
        : shPrompt.system;
      const content  = await this._streamNightThought(aiSheriff, shCotSys, shPrompt.user, {
        showPublicAnswer: false,  // keep out of speech bubbles / subtitle
        showCotAnswer: true,      // show the investigation decision in spectator CoT feed
      });
      const sheriffErr = this._consumeAiRuntimeError(aiSheriff);
      if (sheriffErr) {
        this._surfaceAiRuntimeFailure(aiSheriff, sheriffErr, {
          contextLabel: 'sheriff investigation',
          showBubble: !content,
          showSubtitle: !content,
          placeholderText: '[signal unstable] Investigation incomplete.',
        });
      }

      this.charManager.setThinking(aiSheriff.id, false);
      const _shTargets = alive.filter(p => p.id !== aiSheriff.id);
      // Fallback: if sheriff returns nothing / unparseable, pick a random uninvestigated player
      let _shContent = content;
      if (!_shContent || !this._parseTarget(_shContent, _shTargets, aiSheriff.id)) {
        const uninv = _shTargets.filter(p => !this.state.investigationHistory?.[p.id]);
        const fallback = uninv.length ? uninv[0].name : _shTargets[0]?.name;
        _shContent = fallback || '';
        console.log('[SHERIFF] empty/bad response — fallback pick:', fallback);
      }
      if (_shContent) {
        const targetId = this._parseTarget(_shContent, _shTargets, aiSheriff.id);
        const target   = this.state.players.find(p => p.id === targetId);
        if (target) {
          this.state.investigationHistory[target.id] = target.role === 'mafia' ? 'mafia' : 'town';
          this.hud.refreshPlayerList(this.state);

          if (target.role === 'mafia') {
            // Confirmed Mafia — sheriff executes immediately
            this.state._sheriffNightKill = target.id;
            const reportText = `Investigated ${target.name}: Mafia confirmed. Executing now.`;
            if (this._specCurrentGroup === 'sheriff') this._cinematicSnapToPlayer(aiSheriff, false, true);
            this.hud.addChat('SYSTEM', `◆ Sheriff confirmed ${target.name} is MAFIA — kill shot fired!`);
            await this._nightSpeakAndWait(aiSheriff, reportText, 2500);
          } else {
            // Town player — investigate only, no kill
            const reportText = `Investigated ${target.name}: innocent. Keep watching.`;
            if (this._specCurrentGroup === 'sheriff') this._cinematicSnapToPlayer(aiSheriff, false, true);
            this.hud.addChat('SYSTEM', '[INVESTIGATE] ' + reportText);
            await this._nightSpeakAndWait(aiSheriff, reportText, 2500);
          }
        }
      }

      if (this._specCurrentGroup === 'sheriff') {
        this.cinCamera.playRoomPan('sheriff', 'desk', 'wide', 1.2);
        await this._sleep(1200);
      }
    }

    // ══ HOSPITAL ═══════════════════════════════════════════════════════════
    if (aiDoctor) {
      if (!this._specManualSwitch && this._specCurrentGroup !== 'doctor') {
        this._spectateLocation('doctor', true);
        await this._sleep(3200);
      }

      this.hud.addChat('SYSTEM', '✚ The Doctor considers who needs protection tonight...');
      if (this._specCurrentGroup === 'doctor') {
        const wardView = this.cinCamera.getBuildingViewPos('doctor', 'ward');
        if (wardView) this.cinCamera.blendTo(wardView.cam, wardView.look, 1.2);
        this._setShotLabel('Ward — Deciding');
      }
      this.charManager.setThinking(aiDoctor.id, true);

      // Ward shot while thinking
      if (this._specCurrentGroup === 'doctor') {
        const wardView = this.cinCamera.getBuildingViewPos('doctor', 'ward');
        if (wardView) this.cinCamera.blendTo(wardView.cam, wardView.look, 1.2);
        this._setShotLabel('Ward — Thinking');
        await this._sleep(1500);
      }

      const docPrompt = buildNightDoctorPrompt(aiDoctor, this.state);
      const docCotSys = _isThinkingModel(aiDoctor.model)
        ? docPrompt.system + ' Think through who the Mafia is most likely targeting tonight and why, before naming who to protect.'
        : docPrompt.system;
      const docContent = await this._streamNightThought(aiDoctor, docCotSys, docPrompt.user, {
        showPublicAnswer: false,  // keep out of speech bubbles / subtitle
        showCotAnswer: true,      // show the protection decision in spectator CoT feed
      });
      const doctorErr = this._consumeAiRuntimeError(aiDoctor);
      if (doctorErr) {
        this._surfaceAiRuntimeFailure(aiDoctor, doctorErr, {
          contextLabel: 'doctor protection',
          showBubble: !docContent,
          showSubtitle: !docContent,
          placeholderText: '[signal unstable] I could not lock protection.',
        });
      }

      this.charManager.setThinking(aiDoctor.id, false);
      if (docContent) {
        const targetId = this._parseTarget(docContent, alive, aiDoctor.id);
        const target   = this.state.players.find(p => p.id === targetId);
        if (target) {
          this.state.doctorProtectedId = target.id;
          const protText = '✚ Protecting ' + target.name + ' tonight.';
          if (this._specCurrentGroup === 'doctor') this._cinematicSnapToPlayer(aiDoctor, false, true);
          this.hud.addChat('SYSTEM', protText);
          await this._nightSpeakAndWait(aiDoctor, protText, 2500);
        }
      }

      if (this._specCurrentGroup === 'doctor') {
        this.cinCamera.playRoomPan('doctor', 'table', 'wide', 1.2);
        await this._sleep(1200);
      }
    }

    // ══ Night over — cinematic pull-back to village ════════════════════════
    this._hideThoughtPanel();
    this.hud.addChat('SYSTEM', '★ The night draws to a close...');
    // Exit current building cinematically
    if (this._specCurrentGroup) {
      this.cinCamera.playLocationExit(this._specCurrentGroup);
      await this._sleep(1000);
    }

    callback();
  }

  _showSpectateNight(callback) {
    this._showSpectatorNightUI(this.state.players.filter(p => p.alive), callback);
  }

  // Villager night wait — proper context-aware message + 30s countdown then dawn
  _humanVillagerNightWait(alive) {
    const panel   = document.getElementById('night-panel');
    const titleEl = document.getElementById('night-panel-title');
    const subEl   = document.getElementById('night-panel-sub');
    const content = document.getElementById('night-panel-content');

    const sheriffAlive = alive.some(p => p.role === 'sheriff');
    const doctorAlive  = alive.some(p => p.role === 'doctor');

    let bodyMsg;
    if (sheriffAlive && doctorAlive) {
      bodyMsg = 'The Mafia are planning their next move...\n\nThe Sheriff and the Doctor are working through the night to protect the village.';
    } else if (sheriffAlive && !doctorAlive) {
      bodyMsg = 'The Mafia are planning their next move...\n\nThe Sheriff is on duty — doing their best to protect what remains of the village.';
    } else if (!sheriffAlive && doctorAlive) {
      bodyMsg = 'The Mafia are planning their next move...\n\nThe Doctor is working to minimise the damage the Mafia can cause tonight.';
    } else {
      bodyMsg = 'The Mafia are planning their next move against the village.\n\nStay strong — dawn is coming.';
    }

    this._showNightPanel('NIGHT FALLS', 'The village sleeps...', false);

    let remaining = 45;
    let done = false;

    content.innerHTML = `
      <div style="text-align:center;padding:0.6rem 0 0.5rem">
        <div style="font-size:1rem;font-family:'Crimson Pro',serif;color:#d1d5db;line-height:1.75;white-space:pre-line;margin-bottom:1.4rem">${bodyMsg}</div>
        <div id="villager-night-timer" style="font-family:'Cinzel',serif;font-size:2.6rem;color:#fcd34d;letter-spacing:0.12em;font-weight:700">45</div>
        <div style="font-size:0.68rem;color:#6b7280;font-family:'Cinzel',serif;letter-spacing:0.14em;margin-top:0.35rem;text-transform:uppercase">Seconds until dawn</div>
      </div>
    `;

    const timerEl = content.querySelector('#villager-night-timer');

    const iv = setInterval(() => {
      remaining--;
      if (timerEl) timerEl.textContent = String(remaining);
      if (remaining <= 0 && !done) {
        done = true;
        clearInterval(iv);
        // Clear cinematic safety kill so it doesn't double-fire
        if (this.cinCamera._villagerNightSafetyKill) {
          clearTimeout(this.cinCamera._villagerNightSafetyKill);
          this.cinCamera._villagerNightSafetyKill = null;
        }
        this._hideNightPanel();
        this._processAllNightActions(alive, false);
      }
    }, 1000);

    // Launch 45s village cinematic — purely visual, timer above is authoritative
    if (this.cinCamera.playVillageNightCinematic) {
      this.cinCamera.playVillageNightCinematic(() => {
        // Cinematic complete — camera already parked at amphitheater
        // Day transition handled by _processAnnouncements
      });
    }
  }

  // Sequential night chain for human players: after each role acts, move to the next.
  // Called by human mafia/sheriff resolvers. role = which role to run NOW.
  async _humanNightChain(alive, role) {
    const human = this.state.players.find(p => p.isHuman);

    if (role === 'sheriff') {
      const humanSheriff = human?.role === 'sheriff' && human?.alive;
      const humanDoctor  = human?.role === 'doctor'  && human?.alive;

      if (humanSheriff) {
        // Human is sheriff — UI handles it; calls _humanNightChain(alive,'doctor') when done
        this._humanSheriffNightAction(alive);
        return;
      }

      if (!humanDoctor) {
        // Both sheriff AND doctor are AI — run them in parallel, then resolve
        const aiSheriff = alive.find(p => !p.isHuman && p.role === 'sheriff');
        const aiDoctor  = alive.find(p => !p.isHuman && p.role === 'doctor');
        await Promise.all([
          this._runAiSheriffSilent(aiSheriff, alive),
          this._runAiDoctorSilent(aiDoctor, alive),
        ]);
        this._processNightOutcome(alive);
        return;
      }

      // Doctor is human — AI sheriff runs first, then hand off to human doctor UI
      const aiSheriff = alive.find(p => !p.isHuman && p.role === 'sheriff');
      await this._runAiSheriffSilent(aiSheriff, alive);
      this._humanNightChain(alive, 'doctor');
      return;
    }

    if (role === 'doctor') {
      const humanDoctor = human?.role === 'doctor' && human?.alive;

      if (humanDoctor) {
        // Human is doctor — show their UI, which calls _processNightOutcome when done
        this._humanDoctorNightAction(alive);
        return;
      }

      // AI doctor only
      const aiDoctor = alive.find(p => !p.isHuman && p.role === 'doctor');
      await this._runAiDoctorSilent(aiDoctor, alive);
      this._processNightOutcome(alive);
    }
  }

  // Helpers — isolated AI role actions with retries=1 (simple name responses don't need 3 attempts)
  async _runAiSheriffSilent(aiSheriff, alive) {
    if (!aiSheriff) return;
    try {
      const prompt   = buildNightSheriffPrompt(aiSheriff, this.state);
      const content  = await this._aiDecide(aiSheriff, prompt.system, prompt.user, 1);
      if (content) {
        const targetId = this._parseTarget(content, alive.filter(p => p.id !== aiSheriff.id), aiSheriff.id);
        const target   = this.state.players.find(p => p.id === targetId);
        if (target) {
          this.state.investigationHistory[target.id] = target.role === 'mafia' ? 'mafia' : 'town';
          if (target.role === 'mafia') this.state._sheriffNightKill = target.id;
        }
      }
    } catch {}
  }

  async _runAiDoctorSilent(aiDoctor, alive) {
    if (!aiDoctor) return;
    try {
      const prompt     = buildNightDoctorPrompt(aiDoctor, this.state);
      const docContent = await this._aiDecide(aiDoctor, prompt.system, prompt.user, 1);
      if (docContent) {
        const targetId = this._parseTarget(docContent, alive, aiDoctor.id);
        const target   = this.state.players.find(p => p.id === targetId);
        if (target) this.state.doctorProtectedId = target.id;
      }
    } catch {}
  }

  // Keep old name as alias so any legacy spectator path still works
  _showVillageSleep(callback) { this._humanVillagerNightWait(this.state.players.filter(p => p.alive)); }

  // ─── HUMAN MAFIA NIGHT ────────────────────────────────────────────────────

  _humanMafiaNightAction(alive) {
    const bv = this.cinCamera.getBuildingViewPos('mafia', 'table');
    if (bv) this.cinCamera.blendTo(bv.cam, bv.look, 1.6);

    const aiMafia  = alive.filter(p => !p.isHuman && p.role === 'mafia');
    const nonMafia = alive.filter(p => p.role !== 'mafia');
    const content  = document.getElementById('night-panel-content');

    this._showNightPanel('▲ MAFIA BUNKER', 'Vote to choose your target', true);

    const mafiaVotes = {};
    let humanVote    = null;
    let resolved     = false;

    const resolveKill = () => {
      if (resolved) return;
      resolved = true;
      this._hideNightPanel();

      const tally = {};
      Object.values(mafiaVotes).forEach(tid => { if (tid) tally[tid] = (tally[tid]||0) + 1; });
      if (humanVote) tally[humanVote] = (tally[humanVote]||0) + 1;

      let best = null;
      if (Object.keys(tally).length > 0) {
        const maxV    = Math.max(...Object.values(tally));
        const leaders = Object.keys(tally).filter(id => tally[id] === maxV);
        if (leaders.length === 1) best = leaders[0];
        else if (humanVote && leaders.includes(humanVote)) best = humanVote;
        else best = null; // true tie — no kill
      }
      if (!best && Object.keys(tally).length === 0) {
        best = humanVote || nonMafia[Math.floor(Math.random()*nonMafia.length)]?.id;
      }
      this.state._mafiaKillTarget = best;
      // Chain sequentially to sheriff, then doctor, then resolve
      this._humanNightChain(alive, 'sheriff');
    };

    content.innerHTML = `
      <div style="display:flex;gap:0.5rem;align-items:flex-start;margin-bottom:0.9rem">
        <div style="flex:1;font-family:'Crimson Pro',serif;font-size:0.85rem;color:#fca5a5;line-height:1.6" id="mafia-chat-feed"></div>
      </div>
      <div style="font-family:'Cinzel',serif;font-size:0.68rem;color:#9ca3af;margin-bottom:0.5rem;letter-spacing:0.08em">CHOOSE YOUR TARGET — vote locks in immediately</div>
      <div id="mafia-target-grid" class="night-targets"></div>
    `;

    const chatFeed = content.querySelector('#mafia-chat-feed');
    const grid     = content.querySelector('#mafia-target-grid');

    nonMafia.forEach(p => {
      const btn = document.createElement('div');
      btn.className = 'vote-target-btn';
      btn.id = `mafia-vote-${p.id}`;
      btn.innerHTML = `<canvas class="vtb-face-canvas" width="48" height="48"></canvas><div class="vtb-name">${p.name}</div>`;
      _drawVtbFace(btn.querySelector('.vtb-face-canvas'), p);
      btn.onclick = () => {
        grid.querySelectorAll('.vote-target-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        humanVote = p.id;
        // Resolve immediately once human has voted — don't wait
        resolveKill();
      };
      grid.appendChild(btn);
    });

    const nightPanel = document.getElementById('night-panel');
    if (nightPanel) { nightPanel.classList.remove('minimized'); }

    // Run AI mafia discussion async; when all AI have voted, resolve if human hasn't yet
    this._runMafiaDiscussionAndVote(aiMafia, alive, chatFeed, mafiaVotes).then(() => {
      if (!resolved) resolveKill();
    });
  }

  async _runMafiaDiscussionAndVote(aiMafia, alive, chatFeed, mafiaVotes) {
    const targets      = alive.filter(p => p.role !== 'mafia');
    const aiMafiaNames = aiMafia.map(p => p.name).join(', ');
    const discussionLog = [];

    // Single discussion pass — each member speaks and implicitly names their target.
    // We parse the vote from the discussion text directly, eliminating a full extra round of API calls.
    for (const mafioso of aiMafia) {
      try {
        const prompt  = buildMafiaDiscussPrompt(mafioso, this.state, targets, aiMafiaNames);
        const context = discussionLog.length
          ? `\n\nMafia discussion so far:\n${discussionLog.map((l, i) => `${i + 1}. ${l}`).join('\n')}`
          : '\n\nYou open the discussion. Name the exact target you want to hit tonight.';
        const userMsg = prompt.user + context + '\n\nEnd your message by naming your exact target choice.';
        // retries=1 — night decisions are simple name responses; no need to burn 3 attempts
        const res = await this._aiDecide(mafioso, prompt.system, userMsg, 1);
        if (res) {
          discussionLog.push(`${mafioso.name}: ${res}`);
          // Parse target directly from discussion — avoids a second API call per member
          const targetId = this._parseTarget(res, targets, mafioso.id);
          mafiaVotes[mafioso.id] = targetId;
          if (chatFeed) {
            const row = document.createElement('div');
            row.style.cssText = 'margin-bottom:0.35rem;border-bottom:1px solid rgba(139,0,0,0.2);padding-bottom:0.35rem;';
            const targetName = targetId ? targets.find(p => p.id === targetId)?.name : null;
            row.innerHTML = `<span style="color:#ef4444;font-weight:700">${mafioso.name}:</span> ${res}`
              + (targetName ? ` <span style="color:#fca5a5;font-size:0.78rem"> → ${targetName}</span>` : '');
            chatFeed.appendChild(row);
            chatFeed.scrollTop = chatFeed.scrollHeight;
          }
        }
      } catch {}
      await this._sleep(300); // reduced from 600ms — just enough for UI to breathe
    }

    // Fallback: if discussion parsing yielded no valid votes, fire ONE lightweight kill-decision call
    const hasVotes = Object.values(mafiaVotes).some(v => v);
    if (!hasVotes && aiMafia.length > 0) {
      try {
        const attacker   = aiMafia[0];
        const killPrompt = buildNightMafiaPrompt(attacker, this.state, targets);
        const killUser   = killPrompt.user
          + (discussionLog.length
              ? `\n\nBunker discussion:\n${discussionLog.join('\n')}\n\nChoose final target — respond with ONLY the player name.`
              : '\n\nRespond with ONLY the player name.');
        const res = await this._aiDecide(attacker, killPrompt.system, killUser, 1);
        if (res) {
          const targetId = this._parseTarget(res, targets, attacker.id);
          if (targetId) mafiaVotes[attacker.id] = targetId;
        }
      } catch {}
    }
  }

  // ─── HUMAN SHERIFF NIGHT ──────────────────────────────────────────────────

  // ─── HUMAN SHERIFF NIGHT ──────────────────────────────────────────────────
  _humanSheriffNightAction(alive) {
    const bv = this.cinCamera.getBuildingViewPos('sheriff', 'desk');
    if (bv) this.cinCamera.blendTo(bv.cam, bv.look, 1.6);

    const content = document.getElementById('night-panel-content');
    this._showNightPanel('◆ SHERIFF STATION', 'Investigate a suspect', true);

    let decided = false;
    const finish = (targetPlayer) => {
      if (decided) return;
      decided = true;
      this._hideNightPanel();
      if (targetPlayer) {
        this._sheriffInvestigate(targetPlayer, () => this._humanNightChain(alive, 'doctor'));
      } else {
        this._humanNightChain(alive, 'doctor');
      }
    };

    const inv = this.state.investigationHistory || {};
    const invLines = Object.entries(inv).map(([id, result]) => {
      const p = this.state.players.find(x => x.id === id);
      if (!p) return '';
      const col = result === 'mafia' ? '#f87171' : '#4ade80';
      return `<span style="color:${col}">${result==='mafia'?'[MAFIA]':'[TOWN]'} ${p.name}</span>`;
    }).filter(Boolean);
    const invSummary = invLines.length
      ? invLines.join(' &nbsp;·&nbsp; ')
      : '<span style="color:#6b7280;font-style:italic">No prior investigations on file.</span>';

    content.innerHTML = `
      <div style="background:rgba(0,0,0,0.25);border-left:3px solid #fcd34d;border-radius:0 6px 6px 0;padding:0.6rem 0.75rem;margin-bottom:1rem">
        <div style="font-family:'Cinzel',serif;font-size:0.6rem;color:#fcd34d;letter-spacing:0.15em;text-transform:uppercase;margin-bottom:0.35rem">${ICON_CLIPBOARD(12)} Case Files</div>
        <div style="font-family:'Crimson Pro',serif;font-size:0.82rem;color:#d1d5db;line-height:1.65">${invSummary}</div>
      </div>
      <div style="font-family:'Crimson Pro',serif;font-size:0.8rem;color:#9ca3af;margin-bottom:0.65rem">
        Pick a suspect to investigate. If they are Mafia they are eliminated instantly.
      </div>
      <div style="font-family:'Cinzel',serif;font-size:0.62rem;color:#9ca3af;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:0.45rem">Suspects</div>
      <div class="night-targets" id="sheriff-target-grid"></div>
    `;

    const grid = content.querySelector('#sheriff-target-grid');
    alive.filter(p => !p.isHuman).forEach(p => {
      const prevResult = inv[p.id];
      const btn = document.createElement('div');
      btn.className = 'vote-target-btn';
      btn.innerHTML = `
        <canvas class="vtb-face-canvas" width="48" height="48"></canvas>
        <div class="vtb-name">${p.name}</div>
        ${prevResult ? `<div style="font-size:0.58rem;color:${prevResult==='mafia'?'#f87171':'#4ade80'};margin-top:2px">${prevResult==='mafia'?'⛔ Flagged':'✅ Cleared'}</div>` : ''}
      `;
      _drawVtbFace(btn.querySelector('.vtb-face-canvas'), p);
      btn.onclick = () => finish(p);
      grid.appendChild(btn);
    });
  }

  _sheriffInvestigate(target, callback) {
    this.soundEngine.play('sheriffResult');
    const isMafia = target.role === 'mafia';
    const overlay = document.getElementById('investigation-result');
    const invResEl = document.getElementById('inv-result-icon'); if(invResEl) invResEl.innerHTML = isMafia ? `${ICON_MAFIA(32)}<br><span style='color:#ef4444;font-family:Cinzel,serif;font-size:0.8rem'>MAFIA</span>` : `${ICON_SHERIFF(32)}<br><span style='color:#4ade80;font-family:Cinzel,serif;font-size:0.8rem'>TOWN</span>`;
    document.getElementById('inv-result-text').textContent = isMafia
      ? `${target.name} is MAFIA! Use this wisely.`
      : `${target.name} is TOWN - innocent.`;
    overlay.classList.add('visible');
    this.state.investigationHistory[target.id] = isMafia ? 'mafia' : 'town';
    this.cinCamera.playShortInvestigationPOV(target.seatIndex, this.state.players.length);
    overlay.querySelector('button').onclick = () => { overlay.classList.remove('visible'); if (callback) callback(); };
  }

  // Sheriff can only arrest (kill) during day phase — not at night.
  // This method is kept for the day-phase spectator path but is never called from night actions.
  _sheriffKillShot(target, alive, callback) {
    this.soundEngine.play('sheriffShot');
    this.state.sheriffShotUsed['human'] = true;
    this.state._sheriffNightKill = target.id;
    if (callback) callback();
  }

  // ─── HUMAN DOCTOR NIGHT ───────────────────────────────────────────────────

  // ─── HUMAN DOCTOR NIGHT ───────────────────────────────────────────────────
  _humanDoctorNightAction(alive) {
    const bv = this.cinCamera.getBuildingViewPos('doctor', 'ward');
    if (bv) this.cinCamera.blendTo(bv.cam, bv.look, 1.6);

    const content = document.getElementById('night-panel-content');
    this._showNightPanel('✚ HOSPITAL', 'Admit a patient to protective care', true);

    let decided = false;
    const finish = (targetPlayer) => {
      if (decided) return;
      decided = true;
      this._hideNightPanel();
      if (targetPlayer) {
        this.state.doctorProtectedId = targetPlayer.id;
        this.hud.addChat('SYSTEM', `✚ You admitted ${targetPlayer.name} to protective care tonight.`);
      }
      this._processNightOutcome(alive);
    };

    content.innerHTML = `
      <div style="background:rgba(0,0,0,0.22);border-left:3px solid #60a5fa;border-radius:0 6px 6px 0;padding:0.6rem 0.75rem;margin-bottom:1rem">
        <div style="font-family:'Cinzel',serif;font-size:0.6rem;color:#60a5fa;letter-spacing:0.15em;text-transform:uppercase;margin-bottom:0.35rem">ADMISSIONS DESK</div>
        <div style="font-family:'Crimson Pro',serif;font-size:0.84rem;color:#d1d5db;line-height:1.65">
          One patient can be admitted to the protected ward tonight.<br>
          <span style="color:#9ca3af;font-size:0.78rem">The Mafia cannot touch anyone under your care.</span>
        </div>
      </div>
      <div style="font-family:'Cinzel',serif;font-size:0.62rem;color:#9ca3af;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:0.45rem">Admit a patient</div>
      <div class="night-targets" id="doctor-target-grid"></div>
    `;

    const grid = content.querySelector('#doctor-target-grid');
    alive.forEach(p => {
      const btn = document.createElement('div');
      btn.className = 'vote-target-btn';
      btn.innerHTML = `
        <canvas class="vtb-face-canvas" width="48" height="48"></canvas>
        <div class="vtb-name">${p.name}${p.isHuman ? ' ★' : ''}</div>
      `;
      _drawVtbFace(btn.querySelector('.vtb-face-canvas'), p);
      btn.onclick = () => finish(p);
      grid.appendChild(btn);
    });
  }

  // ─── ALL NIGHT ACTIONS (AI roles + resolution) ───────────────────────────

  async _processAllNightActions(alive, humanAlreadyActed = false) {
    // When spectating, the full spectator runner handles all AI actions with visuals
    // This path is only for when human is a live player (villager)

    // Run AI sheriff and doctor in parallel — they are fully independent
    const aiSheriff = alive.find(p => !p.isHuman && p.role === 'sheriff');
    const aiDoctor  = alive.find(p => !p.isHuman && p.role === 'doctor' && !humanAlreadyActed);

    await Promise.all([
      // Sheriff
      (async () => {
        if (!aiSheriff) return;
        try {
          const prompt  = buildNightSheriffPrompt(aiSheriff, this.state);
          const content = await this._aiDecide(aiSheriff, prompt.system, prompt.user, 1);
          if (content) {
            const targetId = this._parseTarget(content, alive.filter(p => p.id !== aiSheriff.id), aiSheriff.id);
            const target   = this.state.players.find(p => p.id === targetId);
            if (target) {
              this.state.investigationHistory[target.id] = target.role === 'mafia' ? 'mafia' : 'town';
              if (target.role === 'mafia') this.state._sheriffNightKill = target.id;
            }
          }
        } catch {}
      })(),
      // Doctor
      (async () => {
        if (!aiDoctor) return;
        try {
          const prompt     = buildNightDoctorPrompt(aiDoctor, this.state);
          const docContent = await this._aiDecide(aiDoctor, prompt.system, prompt.user, 1);
          if (docContent) {
            const targetId = this._parseTarget(docContent, alive, aiDoctor.id);
            const target   = this.state.players.find(p => p.id === targetId);
            if (target) this.state.doctorProtectedId = target.id;
          }
        } catch {}
      })(),
    ]);

    const aiMafia = alive.filter(p => !p.isHuman && p.role === 'mafia');
    if (!this.state._mafiaKillTarget && aiMafia.length > 0) {
      console.log(`[MAFIA VOTING] Starting voting with ${aiMafia.length} mafia members`);
      const targets = alive.filter(p => p.role !== 'mafia');
      const mafiaNames = aiMafia.map(p => p.name).join(', ');

      // ── MAFIA VOTING SYSTEM ───────────────────────────────────────────────
      // Single discussion pass — parse vote target from each member's response
      // to avoid a separate vote round (cuts API calls in half).
      const votes = new Map(); // targetId -> vote count
      const discussLog = [];

      for (const mafioso of aiMafia) {
        try {
          const prompt  = buildMafiaDiscussPrompt(mafioso, this.state, targets, mafiaNames);
          const context = discussLog.length
            ? `\n\nMafia discussion so far:\n${discussLog.map((l, i) => `${i + 1}. ${l}`).join('\n')}`
            : '\n\nYou open the discussion. Name the exact target you want to hit tonight.';
          const userMsg = prompt.user + context + '\n\nEnd your message by naming your exact target choice.';
          const content = await this._aiDecide(mafioso, prompt.system, userMsg, 1);
          if (content) {
            discussLog.push(`${mafioso.name}: ${content}`);
            const targetId = this._parseTarget(content, targets, mafioso.id);
            if (targetId && targetId !== 'skip') {
              votes.set(targetId, (votes.get(targetId) || 0) + 1);
            }
          }
        } catch {}
      }

      // Fallback: if no targets parsed from discussion, one kill-decision call from lead mafia
      if (votes.size === 0 && aiMafia.length > 0) {
        try {
          const attacker   = aiMafia[0];
          const killPrompt = buildNightMafiaPrompt(attacker, this.state, targets);
          const killUser   = killPrompt.user
            + (discussLog.length ? `\n\nBunker discussion:\n${discussLog.join('\n')}\n\nChoose final target — respond with ONLY the player name.` : '\n\nRespond with ONLY the player name.');
          const content = await this._aiDecide(attacker, killPrompt.system, killUser, 1);
          if (content) {
            const targetId = this._parseTarget(content, targets, attacker.id);
            if (targetId) votes.set(targetId, 1);
          }
        } catch {}
      }

      // Determine kill target based on majority vote
      // - If one target has majority (>50% of mafia), they die
      // - If tie (2+ targets with equal highest votes), no one dies
      // - If no votes, no one dies
      if (votes.size > 0) {
        const voteEntries = Array.from(votes.entries());
        voteEntries.sort((a, b) => b[1] - a[1]); // Sort by vote count descending

        const highestVotes = voteEntries[0][1];
        const tiedTargets = voteEntries.filter(e => e[1] === highestVotes);

        // Only kill if there's a clear majority (not a tie) and majority > 50%
        const majorityThreshold = Math.ceil(aiMafia.length / 2);

        if (tiedTargets.length === 1 && highestVotes >= majorityThreshold) {
          // Clear majority - kill the target
          this.state._mafiaKillTarget = tiedTargets[0][0];
          console.log(`[MAFIA VOTING] Clear majority — kill target set to: ${this.state._mafiaKillTarget} (${highestVotes}/${aiMafia.length} votes)`);
        } else if (tiedTargets.length > 1) {
          console.log(`[MAFIA VOTING] Tie between ${tiedTargets.length} targets — no kill`);
        } else {
          console.log(`[MAFIA VOTING] No clear majority (${highestVotes}/${majorityThreshold} needed) — no kill`);
        }
        // If tie or no clear majority, no one dies (mafia couldn't agree)
      } else {
        console.log(`[MAFIA VOTING] No votes cast — no kill`);
      }
    } else if (this.state._mafiaKillTarget) {
      console.log(`[MAFIA VOTING] Kill target already set by another path: ${this.state._mafiaKillTarget}`);
    }

    this._processNightOutcome(alive);
  }

  _processNightOutcome(alive) {
    // CRITICAL FIX: Prevent double-processing of night outcomes
    if (this.state._nightActionsCompleted) {
      console.log('[NIGHT OUTCOME] Already processed — skipping duplicate call');
      return;
    }
    this.state._nightActionsCompleted = true;
    
    const killTarget     = this.state._mafiaKillTarget;
    const sheriffKillId  = this.state._sheriffNightKill; // set by sheriff kill shot
    
    console.log(`[NIGHT OUTCOME] Processing — mafiaKillTarget: ${killTarget || 'none'}, sheriffKill: ${sheriffKillId || 'none'}, doctorProtected: ${this.state.doctorProtectedId || 'none'}`);
    
    this.state._mafiaKillTarget  = null;
    this.state._sheriffNightKill = null;

    const announcements = [];

    // ── Sheriff kill shot result ──────────────────────────────────────────
    // Sheriff can ONLY kill confirmed Mafia — targeting a Town player does nothing.
    if (sheriffKillId) {
      const sheriffVictim = this.state.players.find(p => p.id === sheriffKillId);
      if (sheriffVictim && sheriffVictim.alive && sheriffVictim.role === 'mafia') {
        announcements.push({ type: 'sheriff_success', player: sheriffVictim });
      }
      // If target is Town: shot is silently wasted — no misfire, no kill, no announcement.
    }

    // ── Mafia kill vs doctor save ─────────────────────────────────────────
    if (killTarget) {
      const target = this.state.players.find(p => p.id === killTarget);
      if (target && target.alive) {
        if (this.state.doctorProtectedId === target.id) {
          announcements.push({ type: 'doctor_save', player: target });
        } else {
          announcements.push({ type: 'mafia_kill', player: target });
        }
      }
    }

    if (announcements.length === 0) {
      announcements.push({ type: 'peaceful_night' });
    }

    // Process each announcement in sequence, then return to day
    this._processAnnouncements(announcements, alive);
  }

  async _processAnnouncements(announcements, alive) {
    // Show dawn announcement banner briefly
    const showDawnMsg = (msg, color = '#f0d080') => {
      this.hud.addChat('SYSTEM', msg);
      // Update phase badge to show dawn breaking
      document.getElementById('phase-badge').textContent = '★ DAWN BREAKS';
    };

    for (const ann of announcements) {
      switch (ann.type) {
        case 'sheriff_success':
          this.soundEngine.play('sheriffShot');
          showDawnMsg(`◆ The Sheriff struck true in the night! ${ann.player.name} (MAFIA) has been killed!`);
          this.state.gameLog.push(`Night ${this.state.day}: The Sheriff shot ${ann.player.name} who was confirmed MAFIA. They were eliminated.`);
          await this._sleep(1500);
          await new Promise(resolve => this._eliminatePlayer(ann.player, resolve, true));
          await this._sleep(1000);
          break;

        case 'doctor_save':
          this.soundEngine.play('sheriffRevealGood');
          showDawnMsg(`✚ The Doctor saved ${ann.player.name}! Mafia's target survived the night!`);
          this.state.gameLog.push(`Night ${this.state.day}: The Mafia targeted ${ann.player.name} but the Doctor saved them. ${ann.player.name} survived.`);
          await this._sleep(2000);
          break;

        case 'mafia_kill':
          this.soundEngine.play('nightKill');
          showDawnMsg(`★ Dawn breaks - ${ann.player.name} was found dead in the night!`);
          this.state.gameLog.push(`Night ${this.state.day}: ${ann.player.name} was eliminated by the Mafia. Their role was ${ann.player.role.toUpperCase()}.`);
          if (this._spectateMode) { this.specHUD.showKill(ann.player.name, ann.player.role); this.specHUD.addEvent(`▲ ${ann.player.name} killed at night`, 'kill'); this.specHUD.setVignette('kill', 3000); }
          await this._sleep(1500);
          await new Promise(resolve => this._eliminatePlayer(ann.player, resolve, true));
          await this._sleep(1000);
          break;

        case 'peaceful_night':
          showDawnMsg(`A peaceful night - the village survived unharmed.`);
          this.state.gameLog.push(`Night ${this.state.day}: The night passed peacefully. No one was eliminated.`);
          await this._sleep(2000);
          break;
      }

      if (this._checkWinCondition()) return;
    }

    // All night deaths resolved - transition to DAY
    this.state.day++;
    await this._sleep(800);

    // Lighting transition: night → day
    this.skybox.setDay();
    this.village.setDayLighting();

    document.getElementById('phase-badge').textContent = `DAY ${this.state.day}`;
    this.hud.addChat('SYSTEM', `━━━ DAY ${this.state.day} BEGINS - Cast your accusations ━━━`);

    // Camera sweep back to amphitheater
    this.cinCamera.playDayStartTransition(() => {
      this._startDayPhase();
    });
  }

  // ─── WIN / GAME OVER ─────────────────────────────────────────────────────

  _checkWinCondition() {
    const alive = this.state.players.filter(p => p.alive);
    const aliveMafia = alive.filter(p => p.role === 'mafia').length;
    const aliveTown = alive.filter(p => p.role !== 'mafia').length;
    console.log(`[WIN] check: alive=${alive.length} mafia=${aliveMafia} town=${aliveTown}`);
    if (aliveMafia === 0) { this._gameOver('town'); return true; }
    if (aliveMafia >= aliveTown) { this._gameOver('mafia'); return true; }
    return false;
  }

  _gameOver(winner) {
    this.state.phase = 'GAMEOVER';
    this.soundEngine.play(winner === 'town' ? 'gameOverTown' : 'gameOverMafia');
    this.cinCamera.playGameOverSweep();
    const overlay = document.getElementById('game-over-overlay');
    const title = document.getElementById('game-over-title');
    const sub = document.getElementById('game-over-sub');
    title.textContent = winner === 'town' ? 'TOWN WINS!' : 'MAFIA WINS!';
    if (this._spectateMode) { const wMsg = winner==='town'?'TOWN WINS!':'MAFIA WINS!'; this.specHUD.announce('GAME OVER', wMsg, 6000); setTimeout(()=>this.specHUD.deactivate(),7000); }
    title.className = winner;
    sub.textContent = winner === 'town' ? 'The village rooted out the evil!' : 'The Mafia seized the village. Darkness reigns.';
    setTimeout(() => overlay.classList.add('visible'), 2000);
  }

  // ─── HELPERS ─────────────────────────────────────────────────────────────

  exitToLobby() {
    this._stopFreeRoam();
    this._stopCamNudge();
    this.charManager.despawnAll();
    this.specHUD?.deactivate();
    // Reset lobby to mode selection screen
    const modeCard = document.getElementById('mode-select-card');
    const playCard  = document.getElementById('play-form-card');
    const specCard  = document.getElementById('spectate-form-card');
    if (modeCard) modeCard.style.display = 'block';
    if (playCard)  playCard.style.display  = 'none';
    if (specCard)  specCard.style.display  = 'none';
    // Re-enable launch buttons
    const sb = document.getElementById('start-btn');
    const wb = document.getElementById('spectate-btn');
    if (sb) { sb.disabled = false; sb.classList.remove('loading'); }
    if (wb) { wb.disabled = false; wb.classList.remove('loading'); }
    // Reset spectator toggle button
    const specBtn = document.getElementById('spectator-toggle-btn');
    if (specBtn) {
      specBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 8 8" fill="none"><ellipse cx="4" cy="4" rx="3" ry="2" stroke="currentColor" stroke-width="1"/><circle cx="4" cy="4" r="1.2" fill="currentColor"/></svg>';
      specBtn.title = 'Watch as spectator (WARNING: cannot return)';
      specBtn.style.opacity = '';
      specBtn.setAttribute('onclick', 'confirmIngameSpectate()');
    }
    ['game-ui', 'game-over-overlay', 'credit-overlay', 'night-panel', 'vote-panel', 'speak-input-panel', 'spectate-banner']
      .forEach(id => { const el = document.getElementById(id); if (el) { el.classList.remove('active', 'visible'); if (id === 'spectate-banner') el.style.display = 'none'; } });
    const lobby = document.getElementById('lobby');
    lobby.style.display = 'flex'; lobby.style.opacity = '0';
    setTimeout(() => { lobby.style.opacity = '1'; lobby.style.transition = 'opacity 0.6s ease'; }, 50);
    setGameActive(false); this.skybox.setDay(); this.cinCamera.setLobbyView();
    this.soundEngine.playAmbient(); this.voiceEngine?.stop(); this.state = null; this._spectateMode = false;
    document.getElementById('start-btn').disabled = false;
    document.getElementById('start-btn').classList.remove('loading');
  }

  _showCreditError() {
    this.state.phase = 'PAUSED';
    document.getElementById('credit-overlay').classList.add('visible');
  }

  showTutorial() { this.tutorial.show(null); }
  // Called when already dead/spectating — just toggles the HUD overlay visibility
  // (no role changes — once spectator always spectator)
  toggleSpectatorView() {
    if (!this._spectateMode) return; // only callable when already spectating
    // Toggle the spec HUD overlay panels visibility
    const sidebar = document.getElementById('spec-sidebar');
    if (sidebar) sidebar.classList.toggle('visible');
  }

  // Called from the in-game warning modal after player confirms.
  // Eliminates the human player from the game and enters permanent spectator mode.
  forceSpectateFromGame() {
    if (!this.state) return;
    const human = this.state.players.find(p => p.isHuman);
    if (!human) return;

    // Mark player as dead
    human.alive = false;
    this.state.alive = this.state.alive.filter(id => id !== 'human');
    this.specHUD?.setDead('human');

    // Announce to other players in chat log
    this.hud.addChat('SYSTEM', `${human.name} has left the game and entered spectator mode.`);
    this.hud.addChat('SYSTEM', `Their role was ${human.role.toUpperCase()}.`);

    // Cancel any pending human action
    this.state.waitingForHuman = false;
    clearInterval(this.timerInterval);
    const speakPanel = document.getElementById('speak-input-panel');
    if (speakPanel) speakPanel.classList.remove('visible');
    this._hideNightPanel();

    // Enter spectate mode
    this._enterSpectateMode();

    // Check if game can still continue (might trigger win)
    this._checkWinCondition();
  }

  toggleMute() {
    this.muted = !this.muted;
    this.soundEngine.setMuted(this.muted);
    this.voiceEngine?.setEnabled(!this.muted); // TTS follows the same mute toggle
    const mb=document.getElementById('mute-btn'); if(mb){ mb.innerHTML=this.muted ? '<svg width="14" height="14" viewBox="0 0 8 8" fill="none"><rect x="1" y="3" width="2" height="2" fill="currentColor"/><polygon points="3,2 6,0 6,8 3,6" fill="currentColor"/><rect x="6" y="3" width="1" height="1" fill="currentColor"/></svg>' : '<svg width="14" height="14" viewBox="0 0 8 8" fill="none"><rect x="1" y="3" width="2" height="2" fill="currentColor"/><polygon points="3,2 6,0 6,8 3,6" fill="currentColor"/><rect x="7" y="2" width="1" height="1" fill="currentColor"/><rect x="7" y="5" width="1" height="1" fill="currentColor"/></svg>'; }
  }
  update(_delta) {
    if (this._freeRoamUpdate) this._freeRoamUpdate();
    if (this._camNudgeUpdate) this._camNudgeUpdate();
  }

  _showNightPanel(title, sub, minimized = true) {
    const panel = document.getElementById('night-panel');
    const titleEl = document.getElementById('night-panel-title');
    const subEl   = document.getElementById('night-panel-sub');
    if (titleEl) titleEl.textContent = title;
    if (subEl)   subEl.textContent   = sub;
    if (minimized) {
      panel.classList.add('minimized');
      const btn = document.getElementById('night-panel-toggle');
      if (btn) btn.textContent = '⬆';
    } else {
      panel.classList.remove('minimized');
      const btn = document.getElementById('night-panel-toggle');
      if (btn) btn.textContent = '⬇';
    }
    panel.classList.add('visible');
  }

  _hideNightPanel() {
    const panel = document.getElementById('night-panel');
    panel.classList.remove('visible');
    panel.classList.remove('minimized');
    const btn = document.getElementById('night-panel-toggle');
    if (btn) btn.textContent = '⬇';
  }

  _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  _parseTarget(text, pool, excludeId) {
    const lower = text.toLowerCase();
    for (const p of pool) { if (p.id !== excludeId && lower.includes(p.name.toLowerCase())) return p.id; }
    const others = pool.filter(p => p.id !== excludeId);
    return others[Math.floor(Math.random() * others.length)]?.id || 'skip';
  }

  _parseVoteTarget(text, pool, excludeId) {
    const lower = (text || '').toLowerCase().trim();
    if (!lower || /\b(abstain|skip|pass|no vote)\b/.test(lower)) return 'skip';
    for (const p of pool) {
      if (p.id !== excludeId && lower.includes(p.name.toLowerCase())) return p.id;
    }
    return 'skip';
  }

  // Retry wrapper for ai-decide calls - tries up to 3 times on transient failures.
  // MODEL_NOT_FOUND / auth errors bail immediately (no point retrying a dead model).
  async _aiDecide(player, systemPrompt, userMessage, retries = 3, options = {}) {
    const timeoutMs = options.timeoutMs || _clientFetchTimeout(player.model, 35000);
    const retryDelayMs = options.retryDelayMs ?? 1000;
    const timeoutRetryDelayMs = options.timeoutRetryDelayMs ?? 500;
    let lastError = '';
    this._setAiRuntimeError(player, null);

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const res = await fetch('/api/ai-decide', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            apiKey: this.state.apiKey,
            model: player.model,
            systemPrompt,
            userMessage,
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
        const data = await res.json();
        // Hard stops — don't retry these
        if (data.error === 'INSUFFICIENT_CREDITS') {
          this._setAiRuntimeError(player, data.error, 'decide');
          this._showCreditError();
          return null;
        }
        if (data.error === 'INVALID_API_KEY') {
          this._setAiRuntimeError(player, data.error, 'decide');
          return null;
        }
        if (data.error && data.error.startsWith('MODEL_NOT_FOUND')) {
          console.warn(`[decide] ${player.model} not found — skipping retries`);
          this._setAiRuntimeError(player, data.error, 'decide');
          return null; // model is dead, retrying wastes time
        }
        if (data.error) {
          lastError = this._normalizeAiErrorCode(data.error, player.model);
          if (attempt < retries - 1) await this._sleep(retryDelayMs);
          continue;
        }
        if (data.content && data.content.trim().length > 0) {
          this._setAiRuntimeError(player, null);
          return data.content;
        }
        lastError = 'EMPTY_RESPONSE';
        // Empty response - retry after short delay (transient issue)
        if (attempt < retries - 1) await this._sleep(retryDelayMs);
      } catch (e) {
        if (e.name === 'AbortError' || e.name === 'TimeoutError') {
          lastError = `TIMEOUT:${player.model}`;
          if (attempt < retries - 1) await this._sleep(timeoutRetryDelayMs);
        } else {
          lastError = this._normalizeAiErrorCode(e?.message || 'API_ERROR_NETWORK', player.model);
          if (attempt < retries - 1) await this._sleep(retryDelayMs);
        }
      }
    }
    this._setAiRuntimeError(player, lastError || 'EMPTY_RESPONSE', 'decide');
    return null; // all retries exhausted
  }
}

// Draw a real brand logo canvas for vote buttons (HTML canvas, not THREE)
function _drawVtbFace(canvas, player) {
  drawBrandLogoCanvas(canvas, player.logoKey || 'human', player.isHuman ? (player.initial || '?') : null);
}


function enc(str) { return encodeURIComponent(str || ''); }
