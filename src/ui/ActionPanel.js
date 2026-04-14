import { ICON_INVESTIGATE, ICON_GUN, ICON_WARNING, ICON_SHIELD, ICON_MOON } from './PixelIcons.js';
/**
 * ActionPanel - manages the speak input, vote panel, and night action panels
 * Provides a cleaner interface than direct DOM manipulation
 */

export class ActionPanel {
  constructor() {
    this.speakPanel = document.getElementById('speak-input-panel');
    this.speakInput = document.getElementById('speak-input');
    this.votePanel = document.getElementById('vote-panel');
    this.nightPanel = document.getElementById('night-panel');
    this.voteTargets = document.getElementById('vote-targets');
    this.voteTally = document.getElementById('vote-tally');
    this.nightContent = document.getElementById('night-panel-content');
    this.nightSub = document.getElementById('night-panel-sub');

    this._onSpeakSubmit = null;
    this._onSpeakPass = null;
    this._onVoteSelect = null;
    this._onNightAction = null;
  }

  // ── SPEAKING ────────────────────────────────────────────────────────────────

  showSpeakInput(label, callbacks) {
    this._onSpeakSubmit = callbacks.onSubmit;
    this._onSpeakPass = callbacks.onPass;

    const labelEl = document.getElementById('speak-input-label');
    if (labelEl) labelEl.textContent = label || 'YOUR TURN - SPEAK YOUR MIND';
    this.speakInput.value = '';
    this.speakInput.focus();
    this.speakPanel.classList.add('visible');
  }

  hideSpeakInput() {
    this.speakPanel.classList.remove('visible');
    this._onSpeakSubmit = null;
    this._onSpeakPass = null;
  }

  getSpeakText() {
    return this.speakInput.value.trim();
  }

  // ── VOTING ──────────────────────────────────────────────────────────────────

  /**
   * Show vote panel
   * @param {Array} targets - [{id, name, logoColor, initial}]
   * @param {function} onVote - called with target id
   */
  showVotePanel(targets, onVote) {
    this.voteTargets.innerHTML = '';
    this.voteTally.textContent = '';
    this._onVoteSelect = onVote;
    let voted = false;

    targets.forEach(t => {
      const btn = document.createElement('div');
      btn.className = 'vote-target-btn';
      const initial = (t.initial || t.name[0] || '?').toUpperCase();
      btn.innerHTML = `
        <div class="vtb-face" style="background:${t.logoColor || '#888'}">${initial}</div>
        <div class="vtb-name">${escHtml(t.name)}</div>
      `;
      btn.addEventListener('click', () => {
        if (voted) return;
        voted = true;
        btn.style.borderColor = '#ff2200';
        btn.style.background = 'rgba(200,30,0,0.15)';
        this.voteTally.textContent = `You voted to eliminate ${t.name}`;
        if (onVote) onVote(t.id);
      });
      this.voteTargets.appendChild(btn);
    });

    this.votePanel.classList.add('visible');
  }

  updateVoteTally(text) {
    this.voteTally.textContent = text;
  }

  hideVotePanel() {
    this.votePanel.classList.remove('visible');
    this._onVoteSelect = null;
  }

  // ── NIGHT ACTIONS ───────────────────────────────────────────────────────────

  /**
   * Show Mafia kill target selection
   * @param {Array} targets - [{id, name, logoColor, initial}]
   * @param {function} onSelect
   */
  showMafiaPanel(targets, onSelect) {
    this.nightSub.textContent = 'You are Mafia. Choose your victim for tonight.';
    this.nightContent.innerHTML = '';

    const grid = document.createElement('div');
    grid.className = 'night-targets';

    targets.forEach(t => {
      const btn = document.createElement('div');
      btn.className = 'vote-target-btn';
      const initial = (t.initial || t.name[0] || '?').toUpperCase();
      btn.innerHTML = `
        <div class="vtb-face" style="background:${t.logoColor || '#888'}">${initial}</div>
        <div class="vtb-name">${escHtml(t.name)}</div>
      `;
      btn.addEventListener('click', () => {
        this.nightPanel.classList.remove('visible');
        if (onSelect) onSelect(t.id);
      });
      grid.appendChild(btn);
    });

    this.nightContent.appendChild(grid);
    this.nightPanel.classList.add('visible');
  }

  /**
   * Show Sheriff night action panel
   * @param {Array} targets
   * @param {boolean} canKillShot
   * @param {function} onInvestigate - called with target id
   * @param {function} onKillShot - called with target id
   */
  showSheriffPanel(targets, canKillShot, onInvestigate, onKillShot) {
    this.nightSub.textContent = 'You are the Sheriff. Choose your night action.';
    this.nightContent.innerHTML = '';

    let selectedAction = 'investigate';

    // Action buttons
    const actionRow = document.createElement('div');
    actionRow.className = 'night-action-row';

    const invBtn = document.createElement('div');
    invBtn.className = 'night-action-btn selected';
    invBtn.id = 'na-investigate';
    invBtn.innerHTML = `${ICON_INVESTIGATE(15)} INVESTIGATE<br><small style="color:var(--text-muted)">Learn a player's alignment</small>`;
    invBtn.addEventListener('click', () => {
      selectedAction = 'investigate';
      actionRow.querySelectorAll('.night-action-btn').forEach(b => b.classList.remove('selected'));
      invBtn.classList.add('selected');
    });
    actionRow.appendChild(invBtn);

    if (canKillShot) {
      const shotBtn = document.createElement('div');
      shotBtn.className = 'night-action-btn';
      shotBtn.id = 'na-killshot';
      shotBtn.innerHTML = `${ICON_GUN(15)} KILL SHOT<br><small style="color:var(--text-muted)">Eliminate if Mafia</small><div class="night-warning">${ICON_WARNING(12)} If innocent, you die too!</div>`;
      shotBtn.addEventListener('click', () => {
        selectedAction = 'killshot';
        actionRow.querySelectorAll('.night-action-btn').forEach(b => b.classList.remove('selected'));
        shotBtn.classList.add('selected');
      });
      actionRow.appendChild(shotBtn);
    }

    this.nightContent.appendChild(actionRow);

    // Target grid
    const grid = document.createElement('div');
    grid.className = 'night-targets';

    targets.forEach(t => {
      const btn = document.createElement('div');
      btn.className = 'vote-target-btn';
      const initial = (t.initial || t.name[0] || '?').toUpperCase();
      btn.innerHTML = `
        <div class="vtb-face" style="background:${t.logoColor || '#888'}">${initial}</div>
        <div class="vtb-name">${escHtml(t.name)}</div>
      `;
      btn.addEventListener('click', () => {
        this.nightPanel.classList.remove('visible');
        if (selectedAction === 'investigate') {
          if (onInvestigate) onInvestigate(t.id);
        } else {
          if (onKillShot) onKillShot(t.id);
        }
      });
      grid.appendChild(btn);
    });

    this.nightContent.appendChild(grid);
    this.nightPanel.classList.add('visible');
  }

  /**
   * Show villager sleep screen
   * @param {function} onComplete - called after sleep duration
   * @param {number} durationMs
   */
  showVillagerSleep(onComplete, durationMs = 3000) {
    this.nightSub.textContent = 'The village sleeps... evil stirs in the shadows.';
    this.nightContent.innerHTML = `
      <div style="text-align:center; padding:2rem">
        <div style="margin-bottom:1rem;display:flex;align-items:center;justify-content:center;gap:8px;opacity:0.8">${ICON_MOON(32)}</div>
        <div style="color:var(--text-muted); font-family:'Crimson Pro',serif; font-size:1rem">
          Close your eyes and pray for dawn...
        </div>
      </div>
    `;
    this.nightPanel.classList.add('visible');
    setTimeout(() => {
      this.nightPanel.classList.remove('visible');
      if (onComplete) onComplete();
    }, durationMs);
  }

  hideNightPanel() {
    this.nightPanel.classList.remove('visible');
  }

  /**
   * Show investigation result
   * @param {string} targetName
   * @param {boolean} isMafia
   * @param {function} onDismiss
   */
  showInvestigationResult(targetName, isMafia, onDismiss) {
    const overlay = document.getElementById('investigation-result');
    const icon = document.getElementById('inv-result-icon');
    const text = document.getElementById('inv-result-text');

    icon.innerHTML = isMafia ? '<svg width="10" height="10" viewBox="0 0 6 6"><circle cx="3" cy="3" r="3" fill="#ef4444"/></svg>' : '<svg width="10" height="10" viewBox="0 0 6 6"><circle cx="3" cy="3" r="3" fill="#4ade80"/></svg>';
    text.textContent = isMafia
      ? `${targetName} is MAFIA! Use this knowledge wisely.`
      : `${targetName} is TOWN - they are innocent.`;

    overlay.classList.add('visible');

    const btn = overlay.querySelector('button');
    const handler = () => {
      overlay.classList.remove('visible');
      btn.removeEventListener('click', handler);
      if (onDismiss) onDismiss();
    };
    btn.addEventListener('click', handler);
  }
}

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
