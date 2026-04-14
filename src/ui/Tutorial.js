// ─────────────────────────────────────────────────────────────────────────────
//  Pixel Animation Tutorial
//  4 panels: Mafia Kill → Doctor Shield → Sheriff Shoot → All Roles Ready
//  Runs after the loading screen on first visit.
// ─────────────────────────────────────────────────────────────────────────────
// v3 is the ONE key used by this version. Older keys are purged in the
// constructor so stale values from previous fix attempts never block the show.
export const TUTORIAL_STORAGE_KEY = 'mafia_tutorial_seen_v3';
const TUTORIAL_STARTUP_FIX_KEY = 'mafia_tutorial_startup_fix_v2';
const LEGACY_TUTORIAL_KEYS = [
  'mafia_tutorial_seen',
  'mafia_tutorial_seen_v2',
  'mafia_startup_tutorial_seen_v1',
];

export class Tutorial {
  constructor() {
    this.isLocalDev = Boolean(import.meta.env?.DEV) ||
      /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);
    this.storage = this._resolveSeenStorage();

    this._purgeLegacyKeys();
    this._applyStartupMigration();

    this.overlay = document.getElementById('tutorial-overlay');
    if (!this.overlay) {
      console.error('[Tutorial] #tutorial-overlay not found in DOM. Tutorial will not work.');
    }
    this.step       = 0;
    this.onComplete = null;
    this._rafs      = [];
    this._timers    = [];

    // ── Dev utilities ────────────────────────────────────────────────────────
    // In any environment, expose a console helper to force-reset the seen flag.
    // Usage:  _resetTutorial()   then reload the page.
    window._resetTutorial = () => {
      this._allStorages().forEach(s => {
        try { s.removeItem(TUTORIAL_STORAGE_KEY); } catch {}
      });
      console.info('[Tutorial] Reset! Reload the page (F5) to see the tutorial again.');
    };

    // URL shortcut for local dev:  http://localhost:5173/?tutorial=reset
    if (this.isLocalDev) {
      try {
        if (new URLSearchParams(window.location.search).get('tutorial') === 'reset') {
          window._resetTutorial();
        }
      } catch {}
    }
  }

  show(onComplete) {
    if (!this.overlay) {
      console.error('[Tutorial] show() called but overlay element is missing.');
      if (typeof onComplete === 'function') onComplete();
      return;
    }
    this.onComplete = onComplete;
    this.step = 0;
    this._inject();

    // Make overlay visible BEFORE _renderStep() so rAF tick callbacks run on a
    // visible, laid-out element. If the overlay is still display:none when
    // animations start the browser can't compute layout and characters never appear.
    window._tutorialShowing = true;
    this.overlay.style.display    = 'flex';
    this.overlay.style.opacity    = '1';
    this.overlay.style.pointerEvents = 'all';
    this.overlay.classList.add('visible', 'tut-on');
    void this.overlay.offsetHeight; // force layout flush before rAF loop starts

    // ── AudioContext note ─────────────────────────────────────────────────────
    // AudioContext is now created lazily on first user gesture (SoundEngine).
    // The first click on NEXT / SKIP inside this overlay IS that gesture, so
    // the context will be created synchronously and sounds play from step 2+.
    // Step 1 sounds won't play (no gesture yet) — that's expected and fine.

    try {
      this._renderStep();
    } catch (err) {
      console.error('[Tutorial] _renderStep() threw:', err);
    }
  }

  _resolveSeenStorage() {
    // In local dev, return a fake in-memory storage so the "seen" flag is
    // NEVER persisted anywhere — tutorial shows fresh on every page load.
    // This means you can test tutorial sounds on every npm run dev reload
    // without needing _resetTutorial() or ?tutorial=reset.
    if (this.isLocalDev) {
      const mem = {};
      return {
        getItem: k => mem[k] ?? null,
        setItem: (k, v) => { mem[k] = String(v); },
        removeItem: k => { delete mem[k]; },
      };
    }
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  }

  _allStorages() {
    const storages = [];
    try { if (window.localStorage) storages.push(window.localStorage); } catch {}
    try { if (window.sessionStorage) storages.push(window.sessionStorage); } catch {}
    return storages;
  }

  _purgeLegacyKeys() {
    this._allStorages().forEach((storage) => {
      LEGACY_TUTORIAL_KEYS.forEach((key) => {
        try { storage.removeItem(key); } catch {}
      });
    });
  }

  _applyStartupMigration() {
    try {
      if (this.isLocalDev) {
        // In local dev we use sessionStorage for the "seen" flag so old
        // persistent localStorage values can never suppress the tutorial.
        window.localStorage?.removeItem(TUTORIAL_STORAGE_KEY);
        return;
      }

      // One-time migration for older broken startup flows that wrote the
      // current key too early and suppressed the tutorial forever.
      if (window.localStorage?.getItem(TUTORIAL_STARTUP_FIX_KEY) !== '1') {
        window.localStorage?.removeItem(TUTORIAL_STORAGE_KEY);
        window.localStorage?.setItem(TUTORIAL_STARTUP_FIX_KEY, '1');
      }
    } catch {}
  }

  _hasSeenTutorial() {
    try {
      return this.storage?.getItem(TUTORIAL_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  }

  _markSeen() {
    try {
      this.storage?.setItem(TUTORIAL_STORAGE_KEY, '1');
    } catch {}
  }

  _play(soundName) {
    const engine = window._soundEngine || window._gameInstance?.soundEngine;
    if (!engine) return;
    // Use play() — it has no dedup so animation loop sounds never get blocked,
    // and it now queues sounds when context is suspended so they fire on resume.
    engine.play?.(soundName);
  }

  // ── CSS injection ─────────────────────────────────────────────────────────
  _inject() {
    if (document.getElementById('_tut_css')) return;
    const el = document.createElement('style');
    el.id = '_tut_css';
    el.textContent = `
      #tutorial-overlay { font-family:'Cinzel',serif; }

      .tut-skip {
        position:absolute; top:16px; right:20px; z-index:10;
        background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.15);
        color:rgba(255,255,255,0.5); font-family:'Cinzel',serif;
        font-size:.6rem; letter-spacing:.14em; padding:5px 13px;
        border-radius:4px; cursor:pointer; transition:all .2s;
      }
      .tut-skip:hover { background:rgba(255,255,255,0.13); color:#fff; }

      .tut-wrap {
        display:flex; width:min(920px,97vw); height:min(510px,92vh);
        background:#0c0c18; border:1px solid rgba(201,168,76,.22);
        border-radius:12px; overflow:hidden;
        box-shadow:0 0 90px rgba(0,0,0,.95),0 0 35px rgba(201,168,76,.05);
        animation:tut-in .32s ease;
      }
      @keyframes tut-in {
        from{transform:translateY(14px);opacity:0}
        to  {transform:translateY(0);opacity:1}
      }

      /* Stage — left 56% */
      .tut-stage {
        flex:0 0 56%; position:relative; overflow:hidden;
        background:#04040e;
        display:flex; align-items:flex-end; justify-content:center;
      }
      .tut-grid {
        position:absolute; inset:0; pointer-events:none;
        background:
          repeating-linear-gradient(0deg,  transparent,transparent 16px,rgba(255,255,255,.011) 16px,rgba(255,255,255,.011) 17px),
          repeating-linear-gradient(90deg, transparent,transparent 16px,rgba(255,255,255,.011) 16px,rgba(255,255,255,.011) 17px);
      }
      .tut-glow {
        position:absolute; bottom:0; left:0; right:0; height:45%;
        background:radial-gradient(ellipse 70% 60% at 50% 100%, rgba(20,8,3,.8) 0%,transparent 75%);
        pointer-events:none;
      }
      .tut-floor {
        position:absolute; bottom:0; left:0; right:0; height:30px;
        background:repeating-linear-gradient(90deg,#182818 0,#182818 16px,#132213 16px,#132213 32px);
      }
      .tut-floor::before {
        content:''; position:absolute; top:-5px; left:0; right:0; height:5px;
        background:#295529;
      }

      /* Info — right panel */
      .tut-info {
        flex:1; display:flex; flex-direction:column;
        padding:30px 26px 22px;
        background:linear-gradient(155deg,#0e0e1d 0%,#0c0c18 100%);
        border-left:1px solid rgba(201,168,76,.1);
      }
      .tut-num  { font-size:.58rem; letter-spacing:.22em; color:rgba(201,168,76,.45); margin-bottom:8px; }
      .tut-badge {
        display:inline-flex; align-items:center; gap:7px;
        padding:4px 11px; border-radius:4px; align-self:flex-start;
        font-size:.58rem; letter-spacing:.16em; font-weight:700; margin-bottom:14px;
      }
      .tut-title { font-size:clamp(1rem,2.4vw,1.4rem); color:#f0e6c8; line-height:1.25; margin-bottom:12px; letter-spacing:.05em; }
      .tut-body  { font-family:'Crimson Pro',serif; font-size:.97rem; line-height:1.72; color:rgba(240,230,200,.72); flex:1; }
      .tut-body strong { color:#f0e6c8; }

      .tut-nav { display:flex; align-items:center; gap:8px; margin-top:18px; }
      .tut-dots { display:flex; gap:5px; flex:1; }
      .tut-dot  { width:6px; height:6px; border-radius:50%; background:rgba(255,255,255,.14); transition:all .3s; }
      .tut-dot.on { background:#c9a84c; transform:scale(1.35); }
      .tut-nbtn {
        padding:8px 18px; border-radius:5px; cursor:pointer;
        font-family:'Cinzel',serif; font-size:.62rem; letter-spacing:.11em;
        border:1px solid rgba(201,168,76,.35); background:rgba(201,168,76,.07);
        color:#c9a84c; transition:all .2s;
      }
      .tut-nbtn:hover { background:rgba(201,168,76,.18); color:#f0d080; border-color:#c9a84c; }
      .tut-nbtn.pri   { background:rgba(201,168,76,.14); border-color:rgba(201,168,76,.6); }

      /* Pixel characters */
      .px { position:absolute; bottom:30px; image-rendering:pixelated; }
      .px-sword { position:absolute; image-rendering:pixelated; transform-origin:bottom left; }
      .px-blood { position:absolute; image-rendering:pixelated; opacity:0; transition:opacity .1s steps(1); }
      .px-blood.show { opacity:1; }

      /* Shield — starts hidden, slides up when attack lands */
      .px-shield-wrap {
        position:absolute; image-rendering:pixelated;
        opacity:0; transform:translateY(20px) scale(.6);
        transition: opacity .25s ease, transform .25s cubic-bezier(.22,1.5,.6,1);
        pointer-events:none;
      }
      .px-shield-wrap.show {
        opacity:1; transform:translateY(0) scale(1);
      }
      .px-shield-wrap.hide {
        opacity:0; transform:translateY(10px) scale(.85);
        transition: opacity .3s ease, transform .3s ease;
      }

      /* Doctor list panel */
      .px-doclist {
        position:absolute; right:8px; top:55px;
        background:rgba(3,12,38,.94); border:1px solid #60a5fa;
        border-radius:6px; padding:6px 10px;
        font-family:'Cinzel',serif; font-size:.52rem; letter-spacing:.09em; color:#60a5fa;
        opacity:0; transition:opacity .25s; pointer-events:none;
      }
      .px-doclist.show { opacity:1; }
      .px-doclist-ttl { color:rgba(96,165,250,.55); font-size:.46rem; margin-bottom:3px; }
      .px-doclist-row { color:#93c5fd; padding:2px 0; }
      .px-doclist-row.sel { color:#fff; font-weight:700; background:rgba(96,165,250,.14); border-radius:3px; padding:2px 5px; }

      /* Gun flash */
      .px-flash { position:absolute; image-rendering:pixelated; opacity:0; }
      .px-flash.bang { animation:px-bang .22s steps(2) forwards; }
      @keyframes px-bang { 0%{opacity:1;transform:scale(1)} 50%{opacity:1;transform:scale(1.4)} 100%{opacity:0;transform:scale(.5)} }

      /* Animations */
      @keyframes px-walk { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-3px)} }
      .walk { animation:px-walk .32s steps(2) infinite; }
      @keyframes px-swing {
        0%{transform:rotate(0) translateY(0)} 35%{transform:rotate(-55deg) translateY(-9px)}
        65%{transform:rotate(28deg) translateY(5px)} 100%{transform:rotate(0) translateY(0)}
      }
      @keyframes px-hit { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-5px)} 75%{transform:translateX(5px)} }
      @keyframes px-die { 0%{transform:rotate(0) translateY(0);opacity:1} 100%{transform:rotate(88deg) translateY(22px);opacity:.3} }
      @keyframes px-recoil { 0%,100%{transform:translateX(0)} 30%{transform:translateX(-7px)} }

      /* Floating label */
      .px-lbl {
        position:absolute; top:13px; left:50%; transform:translateX(-50%);
        font-family:'Cinzel',serif; font-size:.58rem; letter-spacing:.1em;
        color:#fff; text-shadow:0 0 10px #000,0 0 20px #000;
        padding:4px 10px; border-radius:4px; white-space:nowrap;
        opacity:0; transition:opacity .2s;
      }
      .px-lbl.show { opacity:1; }
    `;
    document.head.appendChild(el);
  }

  // ── SVG library ───────────────────────────────────────────────────────────
  _char(h,b,l,flip=false) {
    const g = flip ? 'transform="scale(-1,1) translate(-10,0)"' : '';
    return `<svg width="40" height="72" viewBox="0 0 10 18" xmlns="http://www.w3.org/2000/svg" style="image-rendering:pixelated"><g ${g}>
      <rect x="2" y="0" width="6" height="6" fill="${h}"/>
      <rect x="3" y="2" width="1" height="1" fill="#0a0a0a"/><rect x="6" y="2" width="1" height="1" fill="#0a0a0a"/>
      <rect x="2" y="6" width="6" height="6" fill="${b}"/>
      <rect x="0" y="6" width="2" height="5" fill="${b}"/><rect x="8" y="6" width="2" height="5" fill="${b}"/>
      <rect x="2" y="12" width="3" height="5" fill="${l}"/><rect x="5" y="12" width="3" height="5" fill="${l}"/>
    </g></svg>`;
  }
  _sword(c='#5de6f5') {
    return `<svg width="36" height="36" viewBox="0 0 9 9" xmlns="http://www.w3.org/2000/svg" style="image-rendering:pixelated">
      <rect x="1" y="7" width="1" height="1" fill="#8B6914"/><rect x="2" y="6" width="1" height="1" fill="#8B6914"/>
      <rect x="0" y="6" width="1" height="1" fill="#d4a017"/>
      <rect x="3" y="5" width="1" height="1" fill="${c}"/><rect x="4" y="4" width="1" height="1" fill="${c}"/>
      <rect x="5" y="3" width="1" height="1" fill="${c}"/><rect x="6" y="2" width="1" height="1" fill="${c}"/>
      <rect x="7" y="1" width="1" height="1" fill="#e8f8ff"/>
    </svg>`;
  }
  _shield() {
    return `<svg width="60" height="62" viewBox="0 0 15 16" xmlns="http://www.w3.org/2000/svg" style="image-rendering:pixelated">
      <!-- outer frame -->
      <rect x="2" y="0" width="11" height="1" fill="#60a5fa"/>
      <rect x="1" y="1" width="13" height="1" fill="#93c5fd"/>
      <rect x="0" y="2" width="1" height="7" fill="#60a5fa"/>
      <rect x="14" y="2" width="1" height="7" fill="#60a5fa"/>
      <rect x="1" y="2" width="13" height="7" fill="#1d4ed8"/>
      <rect x="2" y="9" width="11" height="2" fill="#1e40af"/>
      <rect x="3" y="11" width="9" height="2" fill="#1e3a8a"/>
      <rect x="4" y="13" width="7" height="1" fill="#1e3a8a"/>
      <rect x="5" y="14" width="5" height="1" fill="#1e3a8a"/>
      <rect x="6" y="15" width="3" height="1" fill="#1e3a8a"/>
      <!-- cross -->
      <rect x="6" y="3" width="3" height="6" fill="#93c5fd"/>
      <rect x="4" y="5" width="7" height="2" fill="#93c5fd"/>
      <!-- shine -->
      <rect x="1" y="2" width="2" height="3" fill="rgba(255,255,255,.18)"/>
    </svg>`;
  }
  _blood() {
    return `<svg width="52" height="36" viewBox="0 0 13 9" xmlns="http://www.w3.org/2000/svg" style="image-rendering:pixelated">
      <rect x="4" y="0" width="3" height="1" fill="#cc0000"/><rect x="3" y="1" width="5" height="2" fill="#bb0000"/>
      <rect x="2" y="2" width="7" height="2" fill="#aa0000"/><rect x="1" y="3" width="4" height="1" fill="#880000"/>
      <rect x="7" y="3" width="4" height="1" fill="#880000"/><rect x="9" y="1" width="2" height="1" fill="#cc0000"/>
      <rect x="10" y="4" width="2" height="1" fill="#aa0000"/><rect x="0" y="4" width="2" height="1" fill="#990000"/>
      <rect x="5" y="4" width="3" height="3" fill="#bb0000"/>
    </svg>`;
  }
  _gun() {
    return `<svg width="42" height="28" viewBox="0 0 11 7" xmlns="http://www.w3.org/2000/svg" style="image-rendering:pixelated">
      <rect x="2" y="0" width="9" height="3" fill="#555"/><rect x="10" y="1" width="1" height="1" fill="#888"/>
      <rect x="0" y="2" width="2" height="2" fill="#444"/>
      <rect x="2" y="3" width="5" height="2" fill="#444"/><rect x="3" y="5" width="4" height="1" fill="#333"/>
    </svg>`;
  }
  _flash() {
    return `<svg width="30" height="22" viewBox="0 0 8 6" xmlns="http://www.w3.org/2000/svg" style="image-rendering:pixelated">
      <rect x="0" y="2" width="4" height="2" fill="#ffe066"/><rect x="1" y="1" width="2" height="1" fill="#ffd700"/>
      <rect x="1" y="4" width="2" height="1" fill="#ffd700"/><rect x="3" y="0" width="1" height="1" fill="#fff"/>
      <rect x="3" y="5" width="1" height="1" fill="#fff"/><rect x="4" y="2" width="3" height="2" fill="#ffe066"/>
    </svg>`;
  }

  // ── Layout builder ────────────────────────────────────────────────────────
  _frame(stageHTML, step, badgeTxt, badgeColor, badgeBg, title, body) {
    const dots = [0,1,2,3].map(i=>`<div class="tut-dot${i===this.step?' on':''}"></div>`).join('');
    const last = this.step===3;
    this.overlay.innerHTML = `
      <button class="tut-skip" data-ui-sound="menuConfirm" onclick="window._T.skip()">× SKIP</button>
      <div class="tut-wrap">
        <div class="tut-stage">
          <div class="tut-grid"></div>
          <div class="tut-glow"></div>
          <div class="tut-floor"></div>
          ${stageHTML}
        </div>
        <div class="tut-info">
          <div class="tut-num">STEP ${step} OF 4</div>
          <div class="tut-badge" style="background:${badgeBg};border:1px solid ${badgeColor};color:${badgeColor}">${badgeTxt}</div>
          <div class="tut-title">${title}</div>
          <div class="tut-body">${body}</div>
          <div class="tut-nav">
            <div class="tut-dots">${dots}</div>
            ${this.step>0?`<button class="tut-nbtn" data-ui-sound="menuSelect" onclick="window._T.prev()">← BACK</button>`:''}
            <button class="tut-nbtn pri" data-ui-sound="${last?'menuConfirm':'menuSelect'}" onclick="window._T.next()">${last?'BEGIN':'NEXT →'}</button>
          </div>
        </div>
      </div>`;
    window._T = this;
  }

  _renderStep() {
    this._cancelAll();
    [()=>this._s1(),()=>this._s2(),()=>this._s3(),()=>this._s4()][this.step]?.();
  }

  // ── Step 1: Mafia kills villager ──────────────────────────────────────────
  _s1() {
    this._frame(`
      <div id="_m" class="px" style="left:16%">${this._char('#7a1010','#5a0c0c','#380808')}</div>
      <div id="_sw" class="px-sword" style="left:calc(16%+36px);bottom:68px">${this._sword()}</div>
      <div id="_v" class="px" style="right:16%">${this._char('#8B7355','#4a7c59','#2d5a3a',true)}</div>
      <div id="_bl" class="px-blood" style="right:calc(16% - 4px);bottom:62px">${this._blood()}</div>
      <div id="_lbl" class="px-lbl"></div>
    `,1,'▲ MAFIA ROLE','#ef4444','rgba(239,68,68,.1)',
    'The Mafia Strikes at Night',
    `Each night the <strong>Mafia</strong> holds a secret meeting and votes on one player to eliminate from the village.<br><br>
     Everyone else wakes up to find one of their own gone — with no idea who did it.<br><br>
     Mafia wins when they <strong>equal or outnumber</strong> the remaining Town players.`);
    this._animKill('_m','_sw','_v','_bl','_lbl',16);
  }

  _animKill(mId,swId,vId,blId,lblId,sx) {
    const g=id=>document.getElementById(id);
    let phase=0, x=sx;
    const m=g(mId); if(!m)return;
    m.classList.add('walk');
    const tick=()=>{
      if(phase||!g(mId))return;
      x+=.55; g(mId).style.left=x+'%'; g(swId).style.left=`calc(${x}% + 36px)`;
      if(x<40){this._rafs.push(requestAnimationFrame(tick));}
      else{
        phase=1; m.classList.remove('walk');
        g(swId).style.animation='px-swing .44s ease forwards';
        this._play('tutorialKnifeSweep');
        this._t(()=>{
          if(!g(vId))return;
          g(vId).style.animation='px-hit .2s ease 2';
          g(blId).classList.add('show');
          this._play('tutorialKnifeKill');
          const l=g(lblId); if(l){l.textContent='ELIMINATED!';l.style.color='#ef4444';l.classList.add('show');}
          this._t(()=>{if(!g(vId))return; g(vId).style.animation='px-die .65s ease forwards';},420);
          this._t(()=>{
            if(!g(mId))return;
            phase=0; g(vId).style.animation=''; g(vId).style.opacity='1';
            g(blId).classList.remove('show'); if(g(lblId))g(lblId).classList.remove('show');
            g(swId).style.animation=''; x=sx;
            g(mId).style.left=x+'%'; g(swId).style.left=`calc(${x}% + 36px)`;
            m.classList.add('walk'); this._rafs.push(requestAnimationFrame(tick));
          },2700);
        },460);
      }
    };
    this._rafs.push(requestAnimationFrame(tick));
  }

  // ── Step 2: Doctor shield protects ───────────────────────────────────────
  _s2() {
    this._frame(`
      <div id="_m2" class="px" style="left:7%">${this._char('#7a1010','#5a0c0c','#380808')}</div>
      <div id="_sw2" class="px-sword" style="left:calc(7%+36px);bottom:68px">${this._sword()}</div>
      <div id="_v2" class="px" style="left:50%;transform:translateX(-50%)">${this._char('#c25a00','#7a3800','#5c2800',true)}</div>
      <div id="_sh" class="px-shield-wrap" style="left:calc(50% - 30px);bottom:32px">${this._shield()}</div>
      <div id="_doc" class="px" style="right:7%">${this._char('#1e3a6e','#1d4ed8','#1e3a8a',true)}</div>
      <div id="_dl" class="px-doclist">
        <div class="px-doclist-ttl">✚ PROTECT TONIGHT</div>
        <div class="px-doclist-row sel">► Target Player</div>
      </div>
      <div id="_lbl2" class="px-lbl"></div>
    `,2,'DOCTOR ROLE','#60a5fa','rgba(96,165,250,.1)',
    'The Doctor Saves Lives',
    `Each night the <strong>Doctor</strong> secretly protects one player. If the Mafia attacks that same player, <strong>the kill is blocked</strong> and they survive the night.<br><br>
     The shield is invisible to all others — not even the protected player knows.<br><br>
     During the day, act like a Villager. <strong>Never reveal you're the Doctor</strong> or Mafia will target you.`);
    this._animDoctor();
  }

  _animDoctor() {
    const g=id=>document.getElementById(id);
    let x=7, phase=0;

    // Step A: Show doctor panel
    this._t(()=>{
      if(!g('_dl'))return;
      const l=g('_lbl2');
      g('_dl').classList.add('show');
      if(l){l.textContent='Doctor selects who to protect…';l.style.color='#60a5fa';l.classList.add('show');}

      // Step B: Shield rises after doctor picks
      this._t(()=>{
        if(!g('_sh'))return;
        g('_sh').classList.add('show');
        this._play('tutorialGlassForm');
        g('_dl').classList.remove('show');
        if(l)l.classList.remove('show');

        // Step C: Mafia walks in
        this._t(()=>{
          if(!g('_m2'))return;
          g('_m2').classList.add('walk');
          const tick=()=>{
            if(phase||!g('_m2'))return;
            x+=.55; g('_m2').style.left=x+'%'; g('_sw2').style.left=`calc(${x}% + 36px)`;
            if(x<27){this._rafs.push(requestAnimationFrame(tick));}
            else{
              phase=1; g('_m2').classList.remove('walk');
              g('_sw2').style.animation='px-swing .44s ease forwards';
              this._play('tutorialKnifeSweep');
              // Shield pulses bright on hit
              this._t(()=>{
                if(!g('_sh'))return;
                const sh=g('_sh');
                sh.style.filter='brightness(2.2) saturate(1.8)';
                sh.style.transition='filter .05s';
                this._play('tutorialShieldGlass');
                if(l){l.textContent='PROTECTED! Attack blocked!';l.style.color='#93c5fd';l.classList.add('show');}
                g('_m2').style.animation='px-recoil .3s ease';
                this._t(()=>{ sh.style.filter=''; sh.style.transition='filter .4s'; },280);

                // Step D: Shield fades away after mafia retreats
                this._t(()=>{
                  if(!g('_sh'))return;
                  g('_sh').classList.remove('show');
                  g('_sh').classList.add('hide');
                },900);

                // Reset loop
                this._t(()=>{
                  if(!g('_m2'))return;
                  phase=0; g('_m2').style.animation=''; g('_sw2').style.animation='';
                  if(l)l.classList.remove('show');
                  x=7; g('_m2').style.left=x+'%'; g('_sw2').style.left=`calc(${x}% + 36px)`;
                  this._t(()=>{
                    if(!g('_sh'))return;
                    g('_sh').classList.remove('hide');
                    // Show doctor panel again
                    g('_dl').classList.add('show');
                    this._t(()=>{
                      if(!g('_sh'))return;
                      g('_sh').classList.add('show');
                      this._play('tutorialGlassForm');
                      g('_dl').classList.remove('show');
                      g('_m2').classList.add('walk');
                      this._rafs.push(requestAnimationFrame(tick));
                    },1100);
                  },500);
                },1900);
              },450);
            }
          };
          this._rafs.push(requestAnimationFrame(tick));
        },600);
      },1400);
    },400);
  }

  // ── Step 3: Sheriff shoots mafia ─────────────────────────────────────────
  _s3() {
    this._frame(`
      <div id="_sh3" class="px" style="left:11%">${this._char('#7a6010','#c9a84c','#8B6914')}</div>
      <div id="_gn" style="position:absolute;left:calc(11% + 34px);bottom:60px">${this._gun()}</div>
      <div id="_fl" class="px-flash" style="left:calc(11% + 74px);bottom:63px">${this._flash()}</div>
      <div id="_mf3" class="px" style="right:11%">${this._char('#7a1010','#5a0c0c','#380808',true)}</div>
      <div id="_bl3" class="px-blood" style="right:calc(11% + 6px);bottom:68px">${this._blood()}</div>
      <div id="_lbl3" class="px-lbl"></div>
    `,3,'◆ SHERIFF ROLE','#fcd34d','rgba(252,211,77,.1)',
    'The Sheriff Hunts the Mafia',
    `Each night the <strong>Sheriff</strong> can investigate one player to learn if they are Mafia or Town — and share that intel with the village.<br><br>
     The Sheriff also has a <strong>Kill Shot</strong>: eliminate a suspect on the spot, but it reveals the Sheriff's identity to everyone.<br><br>
     Use information wisely to <strong>coordinate the village vote</strong>.`);
    this._animSheriff();
  }

  _animSheriff() {
    const g=id=>document.getElementById(id);
    const loop=()=>{
      if(!g('_sh3'))return;
      const l=g('_lbl3');
      if(l){l.textContent='Sheriff investigates…';l.style.color='#fcd34d';l.classList.add('show');}
      this._t(()=>{
        if(!g('_fl'))return;
        if(l)l.textContent='MAFIA FOUND! Kill shot!';
        const fl=g('_fl'); fl.classList.remove('bang'); void fl.offsetWidth; fl.classList.add('bang');
        this._play('tutorialGunShot');
        g('_sh3').style.animation='px-recoil .22s ease';
        this._t(()=>{
          g('_bl3').classList.add('show');
          g('_mf3').style.animation='px-die .7s ease forwards';
          if(l){l.textContent='MAFIA ELIMINATED!';l.style.color='#ef4444';}
        },90);
        this._t(()=>{
          if(!g('_mf3'))return;
          g('_fl').classList.remove('bang');
          g('_bl3').classList.remove('show');
          g('_mf3').style.animation=''; g('_mf3').style.opacity='1';
          g('_sh3').style.animation='';
          if(l)l.classList.remove('show');
          this._t(loop,1200);
        },3100);
      },1350);
    };
    this._t(loop,500);
  }

  // ── Step 4: All roles ready ───────────────────────────────────────────────
  _s4() {
    const roles=[
      {h:'#8B7355',b:'#4a7c59',l:'#2d5a3a',c:'#a3e635',lbl:'VILLAGER'},
      {h:'#7a6010',b:'#c9a84c',l:'#8B6914',c:'#fcd34d',lbl:'SHERIFF'},
      {h:'#1e3a6e',b:'#1d4ed8',l:'#1e3a8a',c:'#60a5fa',lbl:'DOCTOR'},
      {h:'#7a1010',b:'#5a0c0c',l:'#380808',c:'#ef4444',lbl:'MAFIA'},
    ];
    const chars=roles.map(r=>`
      <div style="display:flex;flex-direction:column;align-items:center;gap:5px">
        ${this._char(r.h,r.b,r.l)}
        <span style="font-family:Cinzel,serif;font-size:.46rem;color:${r.c};letter-spacing:.1em">${r.lbl}</span>
      </div>`).join('');
    this._frame(`
      <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;padding-bottom:30px">
        <div style="display:flex;gap:22px;align-items:flex-end">${chars}</div>
        <div style="font-family:Cinzel,serif;font-size:.65rem;letter-spacing:.22em;color:rgba(201,168,76,.4)">TRUST NO ONE</div>
      </div>
    `,4,'READY TO PLAY','#c9a84c','rgba(201,168,76,.1)',
    'May the Best AI Win',
    `You'll play alongside <strong>real AI models</strong> — GPT, Claude, Gemini, Grok and more — each reasoning and deceiving in real time.<br><br>
     <strong>Speak</strong> during the day. <strong>Vote</strong> to eliminate suspects. <strong>Use your role ability</strong> each night.<br><br>
     Eliminated? Become a <strong>spectator</strong> and watch the AIs fight to the finish.`);
  }

  // ── Show only on first visit ─────────────────────────────────────────────
  // Production uses localStorage. Local dev uses sessionStorage so stale
  // persistent keys from previous fix attempts never suppress the tutorial.
  showIfFirstTime(onComplete) {
    if (this._hasSeenTutorial()) {
      if (typeof onComplete === 'function') onComplete();
      return;
    }
    this.show(onComplete);
  }

  // ── Navigation ────────────────────────────────────────────────────────────
  next(){ this._cancelAll(); this.step<3?(this.step++,this._renderStep()):this.skip(); }
  prev(){ this._cancelAll(); this.step>0&&(this.step--,this._renderStep()); }
  skip(){
    this._cancelAll();
    this._markSeen();
    window._tutorialShowing = false;
    if (this.overlay) {
      this.overlay.classList.remove('visible', 'tut-on');
      this.overlay.style.display = 'none';
      this.overlay.style.opacity = '';
      this.overlay.style.pointerEvents = 'none';
    }
    if (typeof window._tutDoneCallback === 'function') {
      const cb = window._tutDoneCallback;
      window._tutDoneCallback = null;
      cb();
    }
    if (this.onComplete) this.onComplete();
  }
  _t(fn,ms){ const id=setTimeout(fn,ms||0); this._timers.push(id); return id; }
  _cancelAll(){
    this._rafs.forEach(cancelAnimationFrame); this._rafs=[];
    this._timers.forEach(clearTimeout);      this._timers=[];
  }
}
