import { ICON_MAFIA, ICON_DOCTOR, ICON_SHERIFF, ICON_VILLAGER, ICON_SKULL, ICON_EYE } from './PixelIcons.js';
import * as THREE from 'three';
import { drawBrandLogoCanvas, getBrandBg } from '../characters/LogoTextures.js';

export class HUD {
  constructor(charManager) {
    this.charManager = charManager;
    this.timerCanvas = document.getElementById('timer-canvas');
    this.timerCtx = this.timerCanvas.getContext('2d');
    this.timerInterval = null;
    this.speechBubbles = new Map();
    this.thinkingBubbles = new Map();
  }

  addChat(name, text) {
    // Write to hidden log (accessible via chat popup)
    const log = document.getElementById('chat-log');
    const msg = document.createElement('div');
    msg.className = 'chat-msg';
    msg.innerHTML = `<span class="chat-name">${escHtml(name)}</span><span class="chat-text">${escHtml(text)}</span>`;
    log.appendChild(msg);
    log.scrollTop = log.scrollHeight;
    while (log.children.length > 50) log.removeChild(log.firstChild);
    // Sync to popup if it's open
    if (typeof _syncChatPopup === 'function') _syncChatPopup();

    // Route key events to the live activity feed
    const type = name === 'SYSTEM' ? 'system' : name.includes('VOTE') ? 'vote' : 'speaking';
    const preview = text.length > 70 ? text.slice(0, 68) + '…' : text;
    if (name !== 'SYSTEM' || text.includes('☠') || text.includes('★') || text.includes('☀️') || text.includes('⚖') || text.includes('▲') || text.includes('◆') || text.includes('✚') || text.includes('WINS') || text.includes('voted') || text.includes('killed') || text.includes('saved') || text.includes('Night')) {
      this.addActivity(`${name === 'SYSTEM' ? '' : name + ': '}${preview}`, type);
    }
  }

  addActivity(text, type = 'speaking') {
    // Activity feed removed — was cluttering the screen
  }

  buildPlayerList(players, humanPlayer, spectateMode, investigationHistory) {
    const container = document.getElementById('player-list-items');
    if (!container) return;
    container.innerHTML = '';

    // LobeHub unpkg CDN — same source used by LogoTextures.js for 3D character faces.
    // GitHub raw CDN was used before but had wrong path for some slugs (e.g. zhipu-color).
    const CDN_DARK  = 'https://unpkg.com/@lobehub/icons-static-png@latest/dark/';
    const CDN_LIGHT = 'https://unpkg.com/@lobehub/icons-static-png@latest/light/';

    // key → [cdn, slug]  — must match the @lobehub/icons-static-png package filenames exactly
    const LOGO = {
      chatgpt:   [CDN_DARK,  'openai'],
      openai_o:  [CDN_DARK,  'openai'],
      claude:    [CDN_DARK,  'claude'],
      gemini:    [CDN_LIGHT, 'gemini-color'],
      gemini2:   [CDN_LIGHT, 'gemini-color'],
      grok:      [CDN_DARK,  'grok'],
      deepseek:  [CDN_LIGHT, 'deepseek-color'],
      kimi:      [CDN_LIGHT, 'kimi-color'],
      mistral:   [CDN_LIGHT, 'mistral-color'],
      llama:     [CDN_LIGHT, 'meta-color'],
      qwen:      [CDN_LIGHT, 'qwen-color'],
      nvidia:    [CDN_LIGHT, 'nvidia-color'],
      glm:       [CDN_LIGHT, 'chatglm-color'],   // LobeHub slug is chatglm-color, NOT zhipu-color
      minimax:   [CDN_LIGHT, 'minimax-color'],
    };
    const roleColors = { mafia:'#ef4444', sheriff:'#fcd34d', doctor:'#60a5fa', villager:'#6ee7b7' };
    // SVG pixel-art icons for each role — no emojis
    const roleIcons  = {
      mafia:   ICON_MAFIA(15),
      sheriff: ICON_SHERIFF(15),
      doctor:  ICON_DOCTOR(15),
      villager:ICON_VILLAGER(15),
    };

    players.forEach(p => {
      const item = document.createElement('div');
      item.className = 'player-item' + (p.alive ? '' : ' dead');
      item.id = `pli_${p.id}`;

      const rc = roleColors[p.role] || '#9ca3af';
      const ri = roleIcons[p.role]  || '?';

      // Name colour
      let nameColor = spectateMode ? rc : '#e5e7eb';
      if (!spectateMode && humanPlayer) {
        if (humanPlayer.role === 'mafia' && p.role === 'mafia' && p.id !== humanPlayer.id)
          nameColor = '#ef4444';
        if (humanPlayer.role === 'sheriff' && investigationHistory?.[p.id] === 'mafia')
          nameColor = '#ef4444';
        if (humanPlayer.role === 'sheriff' && investigationHistory?.[p.id] === 'town')
          nameColor = '#4ade80';
      }

      // Role badge — spectator always sees all roles
      const badge = spectateMode
        ? `<div class="pli-role-badge" style="background:${rc}22;color:${rc};display:flex;align-items:center;gap:3px">${ri} ${p.role.toUpperCase()}</div>`
        : '';

      const logoInner = `<canvas class="pli-logo-canvas" id="pli_logo_${p.id}" width="40" height="40"></canvas>`;

      const statusHtml = p.alive
        ? `<svg class="pli-ecg" viewBox="0 0 50 16" width="50" height="16" xmlns="http://www.w3.org/2000/svg">
            <polyline class="pli-ecg-line" points="0,8 8,8 10,5 12,8 16,8 17,10 18,1 20,15 22,8 40,8 50,8 58,8 60,5 62,8 66,8 67,10 68,1 70,15 72,8 90,8 100,8"/>
           </svg>`
        : `<span class="pli-status-dead">${ICON_SKULL(14)}</span>`;

      item.innerHTML = `
        <div class="pli-logo-wrap" style="background:${getBrandBg(p.logoKey || p.key || 'human')}">${logoInner}</div>
        <div class="pli-info">
          <div class="pli-name" style="color:${nameColor}">${escHtml(p.name)}</div>
          ${badge}
        </div>
        ${statusHtml}`;
      container.appendChild(item);
      const logoCanvas = item.querySelector('.pli-logo-canvas');
      if (logoCanvas) drawBrandLogoCanvas(logoCanvas, p.logoKey || p.key || 'human', p.initial || '?');
    });
  }
  refreshPlayerList(state) {
    if (!state) return;
    const human = state.players.find(p => p.isHuman);
    const spectating = !human?.alive || window._gameInstance?._spectateMode;
    this.buildPlayerList(state.players, human, spectating, state.investigationHistory || {});
  }

  markPlayerDead(playerId) {
    const item = document.getElementById(`pli_${playerId}`);
    if (!item) return;
    item.classList.add('dead');
    const dot = item.querySelector('.pli-status-dot, .pli-ecg');
    if (dot) {
      const dead = document.createElement('span');
      dead.className = 'pli-status-dead';
      dead.innerHTML = ICON_SKULL(14);
      dot.replaceWith(dead);
    }
  }

  showTimer(speakerName, totalTime) {
    const overlay = document.getElementById('timer-overlay');
    overlay.classList.add('visible');
    document.getElementById('timer-speaker-name').textContent = speakerName;

    let remaining = totalTime;
    this._drawTimerRing(remaining, totalTime);

    clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      remaining--;
      this._drawTimerRing(remaining, totalTime);
      if (remaining <= 0) clearInterval(this.timerInterval);
    }, 1000);
  }

  updateTimer(remaining, total) {
    this._drawTimerRing(remaining, total);
  }

  hideTimer() {
    document.getElementById('timer-overlay').classList.remove('visible');
    clearInterval(this.timerInterval);
  }

  _drawTimerRing(remaining, total) {
    const ctx = this.timerCtx;
    const W = 120; const H = 120; const cx = 60; const cy = 60;
    ctx.clearRect(0, 0, W, H);

    const progress = remaining / total;
    const urgent = remaining <= 5;

    // Background circle
    ctx.beginPath();
    ctx.arc(cx, cy, 48, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 6;
    ctx.stroke();

    // Progress arc
    const startAngle = -Math.PI / 2;
    const endAngle = startAngle + progress * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 48, startAngle, endAngle);
    ctx.strokeStyle = urgent ? '#ff4422' : '#c9a84c';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Number
    ctx.fillStyle = urgent ? '#ff6644' : '#f0d080';
    ctx.font = `bold 28px Cinzel, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(Math.max(0, remaining), cx, cy);
  }

  showSpeechBubble(playerId, text, durationMs) {
    this._removeEl(this.speechBubbles, playerId);

    const el = document.createElement('div');
    el.className = 'speech-bubble-3d';
    el.textContent = text.length > 250 ? text.substring(0, 248) + '…' : text;
    _applySpeechBubbleSizing(el, el.textContent);
    el.id = `sb_${playerId}`;
    document.body.appendChild(el);

    const timeout = setTimeout(() => this._removeEl(this.speechBubbles, playerId), durationMs);
    this.speechBubbles.set(playerId, { el, timeout });
  }

  updateLiveSpeechBubble(playerId, text) {
    const existing = this.speechBubbles.get(playerId);
    if (existing) {
      existing.el.textContent = text.length > 250 ? text.substring(0, 248) + '…' : text;
      _applySpeechBubbleSizing(existing.el, existing.el.textContent);
    } else {
      this.showSpeechBubble(playerId, text, 60000); // long duration, will be replaced
    }
  }

  showThinkingBubble(playerId) {
    this._removeThinkingBubble(playerId);
    const el = document.createElement('div');
    el.className = 'thinking-bubble';
    el.id = `tb_${playerId}`;
    el.innerHTML = `thinking <div class="thinking-dots"><span></span><span></span><span></span></div>`;
    document.body.appendChild(el);
    this.thinkingBubbles.set(playerId, el);
  }

  hideThinkingBubble(playerId) {
    this._removeThinkingBubble(playerId);
  }

  _removeThinkingBubble(playerId) {
    const el = this.thinkingBubbles.get(playerId);
    if (el && el.parentNode) el.parentNode.removeChild(el);
    this.thinkingBubbles.delete(playerId);
  }

  clearAllSpeechBubbles() {
    for (const [id] of [...this.speechBubbles]) this._removeEl(this.speechBubbles, id);
    for (const [id] of [...this.thinkingBubbles]) {
      const el = this.thinkingBubbles.get(id);
      if (el) { el.remove(); this.thinkingBubbles.delete(id); }
    }
  }

  _removeEl(map, id) {
    const existing = map.get(id);
    if (existing) {
      clearTimeout(existing.timeout);
      if (existing.el && existing.el.parentNode) existing.el.parentNode.removeChild(existing.el);
      map.delete(id);
    }
  }

  updateSpeechBubbles(camera, renderer) {
    const charMgr = this.charManager;
    const W = window.innerWidth, H = window.innerHeight;

    const _project = (id, el, yOffset) => {
      const pos = charMgr.getWorldPosition(id);
      if (!pos) { el.style.display = 'none'; return; }
      pos.y += yOffset;
      const p = pos.clone().project(camera);
      if (p.z > 1) { el.style.display = 'none'; return; }

      const sx = (p.x * 0.5 + 0.5) * W;
      const sy = (-p.y * 0.5 + 0.5) * H;

      // Cache element dimensions to avoid triggering layout reflow every frame.
      // offsetWidth/offsetHeight force synchronous layout — very expensive at 60fps.
      // We read them once (on first display or size-change) and cache on the element.
      if (!el._cachedW || el._cachedW === 0) {
        el._cachedW = el.offsetWidth  || 260;
        el._cachedH = el.offsetHeight || 60;
      }
      const bw = el._cachedW;
      const bh = el._cachedH;

      // Bubble bottom sits at sy (tail touches character), top = sy - bh
      let left = sx - bw * 0.5;
      let top  = sy - bh - 4;

      // Clamp so the whole bubble stays on screen
      const margin = 8;
      left = Math.max(margin, Math.min(W - bw - margin, left));
      top  = Math.max(margin, Math.min(H - bh - margin, top));

      el.style.display   = '';
      el.style.transform = `translate(${left}px, ${top}px)`;
    };

    for (const [id, { el }] of this.speechBubbles) _project(id, el, 2.45);
    for (const [id, el] of this.thinkingBubbles)   _project(id, el, 2.45);
  }
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _applySpeechBubbleSizing(el, text) {
  if (!el) return;
  el.classList.remove('speech-bubble-long', 'speech-bubble-xlong');
  const len = (text || '').length;
  if (len > 170) el.classList.add('speech-bubble-xlong');
  else if (len > 110) el.classList.add('speech-bubble-long');
}
