export class SoundEngine {
  constructor() {
    this.ctx        = null;   // created lazily on first user gesture
    this.muted      = false;
    this.ambientNode = null;
    this._lastUiSound   = '';
    this._lastUiSoundAt = 0;
    this._pendingSounds = []; // queued while ctx doesn't exist yet

    // ── Lazy AudioContext creation ──────────────────────────────────────────
    // Chrome's autoplay policy: AudioContext created INSIDE a user-gesture
    // handler starts in "running" state immediately — no resume() needed.
    // Creating it during page load (no gesture) leaves it suspended forever.
    // We listen for the very first pointer/key event and create ctx then.
    this._gestureHandler = (e) => this._onFirstGesture();
    window.addEventListener('pointerdown', this._gestureHandler, { passive: true, capture: true });
    window.addEventListener('touchstart',  this._gestureHandler, { passive: true, capture: true });
    window.addEventListener('keydown',     this._gestureHandler, { capture: true });
  }

  _onFirstGesture() {
    // Remove listeners — we only need to create the context once
    window.removeEventListener('pointerdown', this._gestureHandler, true);
    window.removeEventListener('touchstart',  this._gestureHandler, true);
    window.removeEventListener('keydown',     this._gestureHandler, true);
    this._gestureHandler = null;

    if (this.ctx) return; // already created

    try {
      // Creating AudioContext here (synchronously inside a gesture handler)
      // means Chrome grants it "running" state directly.
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      console.warn('[SoundEngine] Web Audio API not available:', e);
      return;
    }

    // If still suspended for some reason (mobile Safari), try resume
    if (this.ctx.state !== 'running') {
      this.ctx.resume().catch(() => {});
    }

    // Play any sounds that were requested before the gesture
    this._drainPending();

    // Restart ambient if it was requested before ctx existed
    if (this._ambientWanted) {
      this._ambientWanted = false;
      this.playAmbient();
    }
  }

  // unlock() kept for backwards-compat — ctx is already running after gesture
  async unlock() {
    if (!this.ctx) return false;
    if (this.ctx.state === 'running') return true;
    try { await this.ctx.resume(); } catch {}
    return this.ctx?.state === 'running';
  }

  _resume() { return this.unlock(); }

  setMuted(v) { this.muted = v; }

  play(soundName) {
    if (this.muted) return;
    const fn = this[`_${soundName}`];
    if (!fn) return;
    // No ctx yet (first gesture hasn't fired) — queue for when it's created
    if (!this.ctx) { this._queueSound(soundName, fn); return; }
    if (this.ctx.state === 'running') { fn.call(this); return; }
    // Context exists but suspended — queue and nudge resume
    this._queueSound(soundName, fn);
    this.unlock();
  }

  // Queue a sound, replacing any older queued instance of the same name
  // so we never stack duplicate sounds when the queue drains.
  _queueSound(soundName, fn) {
    this._pendingSounds = this._pendingSounds.filter(p => p.name !== soundName);
    this._pendingSounds.push({ name: soundName, fn });
  }

  // Drain the pending queue immediately — called after context goes running.
  _drainPending() {
    if (this._pendingSounds.length === 0) return;
    const toPlay = this._pendingSounds.splice(0);
    // Give AudioContext one microtask to fully settle, then play
    Promise.resolve().then(() => {
      if (this.muted || this.ctx?.state !== 'running') return;
      toPlay.forEach(({ fn }) => {
        try { fn.call(this); } catch (e) {}
      });
    });
  }

  playUi(soundName) {
    if (this.muted || !this.ctx) return;
    const fn = this[`_${soundName}`];
    if (!fn) return;
    // Dedup: block same sound within 80 ms to prevent double-fires from
    // fast clicks, but allow tutorial animation loops (which space sounds by seconds)
    const nowMs = (typeof performance !== 'undefined' && performance.now)
      ? performance.now()
      : Date.now();
    if (this._lastUiSound === soundName && (nowMs - this._lastUiSoundAt) < 80) return;
    this._lastUiSound = soundName;
    this._lastUiSoundAt = nowMs;
    // No ctx yet — queue, will drain when first gesture creates context
    if (!this.ctx) { this._queueSound(soundName, fn); return; }
    if (this.ctx.state === 'running') { fn.call(this); return; }
    this._queueSound(soundName, fn);
    this.unlock();
  }

  // ── Day break: rising major chord ─────────────────────────────────────────
  _dayBreak() {
    const freqs = [261.63, 329.63, 392.00, 523.25];
    freqs.forEach((f, i) => {
      setTimeout(() => this._tone(f, 0.3, 'sine', 0, 1.5), i * 200);
    });
    // Bird chirp
    setTimeout(() => this._chirp(), 800);
  }

  // ── Night fall: descending minor ──────────────────────────────────────────
  _nightFall() {
    const freqs = [392, 349.23, 311.13, 261.63];
    freqs.forEach((f, i) => {
      setTimeout(() => this._tone(f, 0.2, 'sine', 0, 1.2), i * 250);
    });
    // Owl hoot
    setTimeout(() => this._owlHoot(), 500);
  }

  // ── Speaking pop ──────────────────────────────────────────────────────────
  _speaking() {
    this._tone(880, 0.15, 'sine', 0.01, 0.15);
  }

  // ── Clock tick ────────────────────────────────────────────────────────────
  _clockTick() {
    this._noise(0.1, 0.04);
  }

  _clockUrgent() {
    this._tone(440, 0.2, 'square', 0, 0.08);
  }

  // ── Vote gavel ────────────────────────────────────────────────────────────
  _vote() {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(60, this.ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.4, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.25);
    osc.connect(gain); gain.connect(this.ctx.destination);
    osc.start(); osc.stop(this.ctx.currentTime + 0.3);
  }

  // ── Elimination sting ─────────────────────────────────────────────────────
  _elimination() {
    const freqs = [392, 370, 349, 311];
    freqs.forEach((f, i) => {
      setTimeout(() => this._tone(f, 0.25, 'sawtooth', 0, 0.4), i * 120);
    });
  }

  // ── Death bell ────────────────────────────────────────────────────────────
  _death() {
    this._tone(196, 0.5, 'sine', 0.01, 3.0);
    setTimeout(() => this._tone(174, 0.3, 'sine', 0.01, 2.5), 600);
    // Descending glissando
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, this.ctx.currentTime + 1);
    osc.frequency.exponentialRampToValueAtTime(55, this.ctx.currentTime + 2.5);
    gain.gain.setValueAtTime(0.2, this.ctx.currentTime + 1);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 2.5);
    osc.connect(gain); gain.connect(this.ctx.destination);
    osc.start(this.ctx.currentTime + 1);
    osc.stop(this.ctx.currentTime + 2.8);
  }

  // ── Sheriff shot ──────────────────────────────────────────────────────────
  _sheriffShot() {
    this._noise(0.6, 0.12);
    this._tone(220, 0.2, 'sawtooth', 0, 0.1);
  }

  // ── Sheriff result ────────────────────────────────────────────────────────
  _sheriffResult() {
    this._tone(523.25, 0.3, 'sine', 0, 0.3);
    setTimeout(() => this._tone(659.25, 0.3, 'sine', 0, 0.3), 150);
    setTimeout(() => this._tone(783.99, 0.4, 'sine', 0, 0.5), 300);
  }

  // ── Night kill ────────────────────────────────────────────────────────────
  _nightKill() {
    this._tone(80, 0.5, 'sine', 0.01, 0.8);
    setTimeout(() => this._tone(60, 0.4, 'sine', 0.01, 0.6), 200);
  }

  // ── Game over town ────────────────────────────────────────────────────────
  _gameOverTown() {
    const fanfare = [523.25, 659.25, 783.99, 1046.50];
    fanfare.forEach((f, i) => {
      setTimeout(() => this._tone(f, 0.4, 'sine', 0.02, 0.6), i * 150);
    });
    setTimeout(() => {
      const chord = [523.25, 659.25, 783.99];
      chord.forEach(f => this._tone(f, 0.5, 'sine', 0.02, 1.5));
    }, 700);
  }

  // ── Game over mafia ───────────────────────────────────────────────────────
  _gameOverMafia() {
    const dark = [196, 233.08, 220];
    dark.forEach((f, i) => {
      setTimeout(() => this._tone(f, 0.4, 'sawtooth', 0.01, 0.8), i * 200);
    });
  }

  // ── Message in ────────────────────────────────────────────────────────────
  _messageIn() {
    this._tone(1046, 0.12, 'sine', 0, 0.15);
  }

  // ── Button click ─────────────────────────────────────────────────────────
  _buttonClick() {
    this._tone(660, 0.12, 'triangle', 0.001, 0.11);
    setTimeout(() => this._tone(920, 0.05, 'sine', 0.001, 0.08), 28);
  }

  _menuSelect() {
    const now = this.ctx.currentTime;
    this._noiseBand(0.02, 0.04, 2200, 'highpass', now);
    this._tone(640, 0.16, 'triangle', 0.001, 0.11);
    setTimeout(() => this._tone(920, 0.13, 'sine', 0.001, 0.15), 34);
    setTimeout(() => this._tone(1240, 0.06, 'sine', 0.001, 0.09), 78);
  }

  _menuConfirm() {
    const now = this.ctx.currentTime;
    this._tone(196, 0.08, 'sine', 0.001, 0.18);
    this._tone(520, 0.17, 'triangle', 0.001, 0.15);
    this._noiseBand(0.018, 0.05, 1600, 'bandpass', now + 0.01);
    setTimeout(() => this._tone(780, 0.15, 'sine', 0.001, 0.2), 55);
    setTimeout(() => this._tone(1120, 0.11, 'sine', 0.001, 0.28), 125);
  }

  // ── Role selection click (Play / Spectator choice buttons) ──────────────
  // Subtle, professional — a clean weighted press, like a premium membrane key
  // or a confident physical button.  Two layers, total duration ~90ms.
  _roleSelect() {
    const now = this.ctx.currentTime;

    // ── Layer 1: Body thump — mid-frequency plastic/wood knock ──
    // Drops fast from ~240→55 Hz; gives the satisfying "weight" of a real press.
    const body = this.ctx.createOscillator();
    const bodyGain = this.ctx.createGain();
    body.type = 'sine';
    body.frequency.setValueAtTime(240, now);
    body.frequency.exponentialRampToValueAtTime(55, now + 0.045);
    bodyGain.gain.setValueAtTime(0.0001, now);
    bodyGain.gain.exponentialRampToValueAtTime(0.28, now + 0.003);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.072);
    body.connect(bodyGain); bodyGain.connect(this.ctx.destination);
    body.start(now); body.stop(now + 0.08);

    // ── Layer 2: Click transient — tight bandpass noise burst ──
    // Very brief (22ms) high-frequency snap; adds crispness without any tone.
    const snapSize = Math.floor(this.ctx.sampleRate * 0.022);
    const snapBuf  = this.ctx.createBuffer(1, snapSize, this.ctx.sampleRate);
    const sn = snapBuf.getChannelData(0);
    for (let i = 0; i < snapSize; i++) sn[i] = Math.random() * 2 - 1;
    const snap = this.ctx.createBufferSource();
    snap.buffer = snapBuf;
    const snapBp = this.ctx.createBiquadFilter();
    snapBp.type = 'bandpass';
    snapBp.frequency.value = 4800;
    snapBp.Q.value = 2.2;
    const snapGain = this.ctx.createGain();
    snapGain.gain.setValueAtTime(0.0001, now);
    snapGain.gain.exponentialRampToValueAtTime(0.13, now + 0.0015);
    snapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.022);
    snap.connect(snapBp); snapBp.connect(snapGain); snapGain.connect(this.ctx.destination);
    snap.start(now); snap.stop(now + 0.025);
  }

  _tutorialKnifeSweep() {
    const now = this.ctx.currentTime;

    // ── Layer 1: Main whoosh — noise swept through rising bandpass ──
    const buf1Size = Math.floor(this.ctx.sampleRate * 0.22);
    const buf1 = this.ctx.createBuffer(1, buf1Size, this.ctx.sampleRate);
    const d1 = buf1.getChannelData(0);
    for (let i = 0; i < buf1Size; i++) d1[i] = Math.random() * 2 - 1;
    const whoosh = this.ctx.createBufferSource();
    whoosh.buffer = buf1;
    const whooshBp = this.ctx.createBiquadFilter();
    whooshBp.type = 'bandpass';
    whooshBp.frequency.setValueAtTime(600, now);
    whooshBp.frequency.exponentialRampToValueAtTime(5500, now + 0.18);
    whooshBp.Q.value = 1.8;
    const whooshGain = this.ctx.createGain();
    whooshGain.gain.setValueAtTime(0.0001, now);
    whooshGain.gain.exponentialRampToValueAtTime(0.55, now + 0.015);
    whooshGain.gain.exponentialRampToValueAtTime(0.001, now + 0.21);
    whoosh.connect(whooshBp); whooshBp.connect(whooshGain); whooshGain.connect(this.ctx.destination);
    whoosh.start(now); whoosh.stop(now + 0.23);

    // ── Layer 2: Metallic scrape — sawtooth with high-freq crackle ──
    const scrape = this.ctx.createOscillator();
    const scrapeHp = this.ctx.createBiquadFilter();
    const scrapeGain = this.ctx.createGain();
    scrape.type = 'sawtooth';
    scrape.frequency.setValueAtTime(220, now);
    scrape.frequency.exponentialRampToValueAtTime(1800, now + 0.14);
    scrapeHp.type = 'highpass';
    scrapeHp.frequency.value = 1400;
    scrapeGain.gain.setValueAtTime(0.0001, now);
    scrapeGain.gain.exponentialRampToValueAtTime(0.07, now + 0.01);
    scrapeGain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
    scrape.connect(scrapeHp); scrapeHp.connect(scrapeGain); scrapeGain.connect(this.ctx.destination);
    scrape.start(now); scrape.stop(now + 0.19);

    // ── Layer 3: Air displacement crack at the end ──
    const buf3Size = Math.floor(this.ctx.sampleRate * 0.06);
    const buf3 = this.ctx.createBuffer(1, buf3Size, this.ctx.sampleRate);
    const d3 = buf3.getChannelData(0);
    for (let i = 0; i < buf3Size; i++) d3[i] = Math.random() * 2 - 1;
    const crack = this.ctx.createBufferSource();
    crack.buffer = buf3;
    const crackHp = this.ctx.createBiquadFilter();
    crackHp.type = 'highpass';
    crackHp.frequency.value = 3500;
    const crackGain = this.ctx.createGain();
    crackGain.gain.setValueAtTime(0.0001, now + 0.13);
    crackGain.gain.exponentialRampToValueAtTime(0.28, now + 0.135);
    crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);
    crack.connect(crackHp); crackHp.connect(crackGain); crackGain.connect(this.ctx.destination);
    crack.start(now + 0.13); crack.stop(now + 0.2);
  }

  _tutorialKnifeKill() {
    const now = this.ctx.currentTime;

    // ── Layer 1: Dull flesh thud — low oscillator drops fast ──
    const thud = this.ctx.createOscillator();
    const thudGain = this.ctx.createGain();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(160, now);
    thud.frequency.exponentialRampToValueAtTime(42, now + 0.09);
    thudGain.gain.setValueAtTime(0.0001, now);
    thudGain.gain.exponentialRampToValueAtTime(0.45, now + 0.004);
    thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    thud.connect(thudGain); thudGain.connect(this.ctx.destination);
    thud.start(now); thud.stop(now + 0.15);

    // ── Layer 2: Wet impact noise — bandpass around the "punch" freq ──
    const wetSize = Math.floor(this.ctx.sampleRate * 0.14);
    const wetBuf = this.ctx.createBuffer(1, wetSize, this.ctx.sampleRate);
    const wd = wetBuf.getChannelData(0);
    for (let i = 0; i < wetSize; i++) wd[i] = Math.random() * 2 - 1;
    const wet = this.ctx.createBufferSource();
    wet.buffer = wetBuf;
    const wetBp = this.ctx.createBiquadFilter();
    wetBp.type = 'bandpass';
    wetBp.frequency.setValueAtTime(420, now);
    wetBp.frequency.exponentialRampToValueAtTime(180, now + 0.1);
    wetBp.Q.value = 0.7;
    const wetGain = this.ctx.createGain();
    wetGain.gain.setValueAtTime(0.0001, now);
    wetGain.gain.exponentialRampToValueAtTime(0.32, now + 0.006);
    wetGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    wet.connect(wetBp); wetBp.connect(wetGain); wetGain.connect(this.ctx.destination);
    wet.start(now); wet.stop(now + 0.16);

    // ── Layer 3: Crispy high bite — adds the cutting sensation ──
    const biteSize = Math.floor(this.ctx.sampleRate * 0.05);
    const biteBuf = this.ctx.createBuffer(1, biteSize, this.ctx.sampleRate);
    const bd = biteBuf.getChannelData(0);
    for (let i = 0; i < biteSize; i++) bd[i] = Math.random() * 2 - 1;
    const bite = this.ctx.createBufferSource();
    bite.buffer = biteBuf;
    const biteHp = this.ctx.createBiquadFilter();
    biteHp.type = 'bandpass';
    biteHp.frequency.value = 2800;
    biteHp.Q.value = 2.2;
    const biteGain = this.ctx.createGain();
    biteGain.gain.setValueAtTime(0.0001, now);
    biteGain.gain.exponentialRampToValueAtTime(0.18, now + 0.003);
    biteGain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
    bite.connect(biteHp); biteHp.connect(biteGain); biteGain.connect(this.ctx.destination);
    bite.start(now); bite.stop(now + 0.07);
  }

  // ── Tutorial: Glass shield FORMING — crystalline materialisation ──────────
  // Sounds like glass solidifying out of thin air: a cold shimmer that builds
  // into a resonant, ringing plate.  Three layers:
  //   1. Slow rising shimmer — white noise swept through a narrow bandpass
  //   2. Inharmonic resonators — glass has ratios ~1 / 1.8 / 3.0 / 5.2 / 7.4
  //   3. Faint cryo breath — sub-bass "air" gives weight to the formation
  _tutorialGlassForm() {
    const now = this.ctx.currentTime;

    // ── Layer 1: Cold shimmer — narrow bandpass noise builds slowly ──
    const shimSize = Math.floor(this.ctx.sampleRate * 0.9);
    const shimBuf  = this.ctx.createBuffer(1, shimSize, this.ctx.sampleRate);
    const sd = shimBuf.getChannelData(0);
    for (let i = 0; i < shimSize; i++) sd[i] = Math.random() * 2 - 1;
    const shim = this.ctx.createBufferSource();
    shim.buffer = shimBuf;
    const shimBp = this.ctx.createBiquadFilter();
    shimBp.type = 'bandpass';
    shimBp.frequency.setValueAtTime(900, now);
    shimBp.frequency.exponentialRampToValueAtTime(4200, now + 0.75);
    shimBp.Q.value = 3.5;
    const shimGain = this.ctx.createGain();
    shimGain.gain.setValueAtTime(0.0001, now);
    shimGain.gain.exponentialRampToValueAtTime(0.14, now + 0.35);
    shimGain.gain.exponentialRampToValueAtTime(0.001, now + 0.88);
    shim.connect(shimBp); shimBp.connect(shimGain); shimGain.connect(this.ctx.destination);
    shim.start(now); shim.stop(now + 0.92);

    // ── Layer 2: Inharmonic glass resonators — staggered entry, long ring ──
    // Glass resonance ratios: 1, 1.84, 3.01, 5.22, 7.38
    const baseFreq = 1340;
    const partials = [1, 1.84, 3.01, 5.22, 7.38];
    const partialGains = [0.065, 0.048, 0.038, 0.026, 0.018];
    partials.forEach((ratio, i) => {
      const delay = i * 0.065;
      const freq  = baseFreq * ratio;
      const osc   = this.ctx.createOscillator();
      const g2    = this.ctx.createGain();
      osc.type    = 'sine';
      // Each partial starts slightly flat and rises into tune — "solidifying"
      osc.frequency.setValueAtTime(freq * 0.93, now + delay);
      osc.frequency.exponentialRampToValueAtTime(freq, now + delay + 0.12);
      g2.gain.setValueAtTime(0.0001, now + delay);
      g2.gain.exponentialRampToValueAtTime(partialGains[i], now + delay + 0.07);
      g2.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.72 - i * 0.05);
      osc.connect(g2); g2.connect(this.ctx.destination);
      osc.start(now + delay); osc.stop(now + delay + 0.8);
    });

    // ── Layer 3: Cryo breath — very quiet sub-bass thud, "air cools" ──
    const cryo = this.ctx.createOscillator();
    const cryoGain = this.ctx.createGain();
    cryo.type = 'sine';
    cryo.frequency.setValueAtTime(58, now);
    cryo.frequency.exponentialRampToValueAtTime(32, now + 0.55);
    cryoGain.gain.setValueAtTime(0.0001, now);
    cryoGain.gain.exponentialRampToValueAtTime(0.09, now + 0.04);
    cryoGain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    cryo.connect(cryoGain); cryoGain.connect(this.ctx.destination);
    cryo.start(now); cryo.stop(now + 0.6);

    // ── Layer 4: Final "set" ping — glass locks into place ──
    setTimeout(() => {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const ping = this.ctx.createOscillator();
      const pingGain = this.ctx.createGain();
      ping.type = 'sine';
      ping.frequency.setValueAtTime(3800, t);
      ping.frequency.exponentialRampToValueAtTime(2600, t + 0.35);
      pingGain.gain.setValueAtTime(0.0001, t);
      pingGain.gain.exponentialRampToValueAtTime(0.055, t + 0.008);
      pingGain.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
      ping.connect(pingGain); pingGain.connect(this.ctx.destination);
      ping.start(t); ping.stop(t + 0.42);
    }, 520);
  }

  _tutorialShieldGlass() {
    const now = this.ctx.currentTime;

    // ── Layer 1: Impact crack — sharp transient knock ──
    const crackOsc = this.ctx.createOscillator();
    const crackGain = this.ctx.createGain();
    crackOsc.type = 'triangle';
    crackOsc.frequency.setValueAtTime(2400, now);
    crackOsc.frequency.exponentialRampToValueAtTime(380, now + 0.04);
    crackGain.gain.setValueAtTime(0.0001, now);
    crackGain.gain.exponentialRampToValueAtTime(0.5, now + 0.003);
    crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    crackOsc.connect(crackGain); crackGain.connect(this.ctx.destination);
    crackOsc.start(now); crackOsc.stop(now + 0.06);

    // ── Layer 2: Main glass shatter — burst of high noise ──
    const shatterSize = Math.floor(this.ctx.sampleRate * 0.28);
    const shatterBuf = this.ctx.createBuffer(1, shatterSize, this.ctx.sampleRate);
    const sd = shatterBuf.getChannelData(0);
    for (let i = 0; i < shatterSize; i++) sd[i] = Math.random() * 2 - 1;
    const shatter = this.ctx.createBufferSource();
    shatter.buffer = shatterBuf;
    const shatterHp = this.ctx.createBiquadFilter();
    shatterHp.type = 'highpass';
    shatterHp.frequency.setValueAtTime(3200, now);
    shatterHp.frequency.exponentialRampToValueAtTime(800, now + 0.25);
    const shatterGain = this.ctx.createGain();
    shatterGain.gain.setValueAtTime(0.0001, now + 0.005);
    shatterGain.gain.exponentialRampToValueAtTime(0.38, now + 0.01);
    shatterGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    shatter.connect(shatterHp); shatterHp.connect(shatterGain); shatterGain.connect(this.ctx.destination);
    shatter.start(now + 0.005); shatter.stop(now + 0.3);

    // ── Layer 3: Cascading glass shards — 5 high-freq resonators falling ──
    const shardFreqs = [4200, 3600, 5100, 2900, 4800];
    shardFreqs.forEach((freq, i) => {
      const delay = i * 0.03;
      const shard = this.ctx.createOscillator();
      const shardGain = this.ctx.createGain();
      shard.type = 'sine';
      shard.frequency.setValueAtTime(freq, now + delay);
      shard.frequency.exponentialRampToValueAtTime(freq * 0.4, now + delay + 0.22);
      shardGain.gain.setValueAtTime(0.0001, now + delay);
      shardGain.gain.exponentialRampToValueAtTime(0.06, now + delay + 0.005);
      shardGain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.2);
      shard.connect(shardGain); shardGain.connect(this.ctx.destination);
      shard.start(now + delay); shard.stop(now + delay + 0.24);
    });

    // ── Layer 4: Sub thud — shield absorbing the blow ──
    const sub = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(90, now);
    sub.frequency.exponentialRampToValueAtTime(35, now + 0.12);
    subGain.gain.setValueAtTime(0.0001, now);
    subGain.gain.exponentialRampToValueAtTime(0.22, now + 0.005);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    sub.connect(subGain); subGain.connect(this.ctx.destination);
    sub.start(now); sub.stop(now + 0.14);
  }

  _tutorialGunShot() {
    const now = this.ctx.currentTime;

    // ── Layer 1: The BANG — sharp low boom ──
    const bang = this.ctx.createOscillator();
    const bangGain = this.ctx.createGain();
    bang.type = 'square';
    bang.frequency.setValueAtTime(210, now);
    bang.frequency.exponentialRampToValueAtTime(38, now + 0.06);
    bangGain.gain.setValueAtTime(0.0001, now);
    bangGain.gain.exponentialRampToValueAtTime(0.55, now + 0.002);
    bangGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    bang.connect(bangGain); bangGain.connect(this.ctx.destination);
    bang.start(now); bang.stop(now + 0.1);

    // ── Layer 2: High crack — the bullet breaking the sound barrier ──
    const crackSize = Math.floor(this.ctx.sampleRate * 0.04);
    const crackBuf = this.ctx.createBuffer(1, crackSize, this.ctx.sampleRate);
    const cd = crackBuf.getChannelData(0);
    for (let i = 0; i < crackSize; i++) cd[i] = Math.random() * 2 - 1;
    const crack = this.ctx.createBufferSource();
    crack.buffer = crackBuf;
    const crackHp = this.ctx.createBiquadFilter();
    crackHp.type = 'highpass';
    crackHp.frequency.value = 5500;
    const crackGain = this.ctx.createGain();
    crackGain.gain.setValueAtTime(0.0001, now);
    crackGain.gain.exponentialRampToValueAtTime(0.42, now + 0.001);
    crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    crack.connect(crackHp); crackHp.connect(crackGain); crackGain.connect(this.ctx.destination);
    crack.start(now); crack.stop(now + 0.05);

    // ── Layer 3: Mid body noise — the body of the shot ──
    const bodySize = Math.floor(this.ctx.sampleRate * 0.18);
    const bodyBuf = this.ctx.createBuffer(1, bodySize, this.ctx.sampleRate);
    const dd = bodyBuf.getChannelData(0);
    for (let i = 0; i < bodySize; i++) dd[i] = Math.random() * 2 - 1;
    const body = this.ctx.createBufferSource();
    body.buffer = bodyBuf;
    const bodyBp = this.ctx.createBiquadFilter();
    bodyBp.type = 'bandpass';
    bodyBp.frequency.setValueAtTime(900, now);
    bodyBp.frequency.exponentialRampToValueAtTime(200, now + 0.16);
    bodyBp.Q.value = 0.9;
    const bodyGain = this.ctx.createGain();
    bodyGain.gain.setValueAtTime(0.0001, now + 0.005);
    bodyGain.gain.exponentialRampToValueAtTime(0.28, now + 0.012);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    body.connect(bodyBp); bodyBp.connect(bodyGain); bodyGain.connect(this.ctx.destination);
    body.start(now + 0.005); body.stop(now + 0.2);

    // ── Layer 4: Room tail — simulated reverb decay ──
    setTimeout(() => {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const tailSize = Math.floor(this.ctx.sampleRate * 0.35);
      const tailBuf = this.ctx.createBuffer(1, tailSize, this.ctx.sampleRate);
      const td = tailBuf.getChannelData(0);
      for (let i = 0; i < tailSize; i++) td[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / tailSize, 2.5);
      const tail = this.ctx.createBufferSource();
      tail.buffer = tailBuf;
      const tailLp = this.ctx.createBiquadFilter();
      tailLp.type = 'lowpass';
      tailLp.frequency.value = 600;
      const tailGain = this.ctx.createGain();
      tailGain.gain.setValueAtTime(0.12, t);
      tailGain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      tail.connect(tailLp); tailLp.connect(tailGain); tailGain.connect(this.ctx.destination);
      tail.start(t); tail.stop(t + 0.37);
    }, 55);
  }

  _enterVillage() {
    const now = this.ctx.currentTime;

    // ── Deep gate rumble — wood and stone creaking open ──
    const rumble = this.ctx.createOscillator();
    const rumbleGain = this.ctx.createGain();
    rumble.type = 'sawtooth';
    rumble.frequency.setValueAtTime(48, now);
    rumble.frequency.linearRampToValueAtTime(62, now + 0.8);
    rumble.frequency.linearRampToValueAtTime(44, now + 1.6);
    rumbleGain.gain.setValueAtTime(0.0001, now);
    rumbleGain.gain.linearRampToValueAtTime(0.07, now + 0.15);
    rumbleGain.gain.linearRampToValueAtTime(0.04, now + 0.9);
    rumbleGain.gain.exponentialRampToValueAtTime(0.001, now + 1.7);
    const rumbleLp = this.ctx.createBiquadFilter();
    rumbleLp.type = 'lowpass'; rumbleLp.frequency.value = 180;
    rumble.connect(rumbleLp); rumbleLp.connect(rumbleGain); rumbleGain.connect(this.ctx.destination);
    rumble.start(now); rumble.stop(now + 1.8);

    // ── Chord swell — village ambience rises ──
    const chord = [146.83, 220.0, 293.66, 440.0, 587.33];
    chord.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();
      osc.type = i < 2 ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(freq * 0.65, now);
      osc.frequency.exponentialRampToValueAtTime(freq, now + 0.28);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(500 + i * 160, now);
      filter.frequency.exponentialRampToValueAtTime(3200 + i * 280, now + 1.1);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.052, now + 0.1 + i * 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 2.1);
      osc.connect(filter); filter.connect(gain); gain.connect(this.ctx.destination);
      osc.start(now + i * 0.02); osc.stop(now + 2.2);
    });

    // ── Wind whoosh — rushing through the gate ──
    const windSize = Math.floor(this.ctx.sampleRate * 0.9);
    const windBuf = this.ctx.createBuffer(1, windSize, this.ctx.sampleRate);
    const wd = windBuf.getChannelData(0);
    for (let i = 0; i < windSize; i++) wd[i] = Math.random() * 2 - 1;
    const wind = this.ctx.createBufferSource();
    wind.buffer = windBuf;
    const windBp = this.ctx.createBiquadFilter();
    windBp.type = 'bandpass';
    windBp.frequency.setValueAtTime(800, now + 0.05);
    windBp.frequency.exponentialRampToValueAtTime(200, now + 0.85);
    windBp.Q.value = 0.5;
    const windGain = this.ctx.createGain();
    windGain.gain.setValueAtTime(0.0001, now + 0.05);
    windGain.gain.exponentialRampToValueAtTime(0.055, now + 0.18);
    windGain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
    wind.connect(windBp); windBp.connect(windGain); windGain.connect(this.ctx.destination);
    wind.start(now + 0.05); wind.stop(now + 0.95);

    // ── Bell toll — village bell welcomes / warns you ──
    this._tone(73.42, 0.14, 'sine', 0.01, 0.7);
    setTimeout(() => {
      if (!this.ctx) return;
      this._tone(659.25, 0.07, 'sine', 0.01, 0.9);
    }, 220);
    setTimeout(() => {
      if (!this.ctx) return;
      this._tone(830.61, 0.055, 'triangle', 0.01, 1.1);
    }, 390);
  }

  // ── Ambient village ───────────────────────────────────────────────────────
  playAmbient() {
    if (this.muted) return;
    if (!this.ctx) {
      // ctx doesn't exist yet — set a flag so _onFirstGesture starts ambient
      this._ambientWanted = true;
      return;
    }
    if (this.ambientNode) return;
    const bufSize = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.015;
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buf;
    source.loop = true;
    const gainNode = this.ctx.createGain();
    gainNode.gain.value = 0.06;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;
    source.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.ctx.destination);
    source.start();
    this.ambientNode = { source, gainNode };
  }

  stopAmbient() {
    if (this.ambientNode) {
      try { this.ambientNode.source.stop(); } catch (e) {}
      this.ambientNode = null;
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  _tone(freq, gain, type = 'sine', attackTime = 0.01, duration = 0.5) {
    const osc = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gainNode.gain.setValueAtTime(0, this.ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(gain, this.ctx.currentTime + attackTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    osc.connect(gainNode);
    gainNode.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + duration + 0.05);
  }

  _noise(gain, duration) {
    const bufSize = Math.floor(this.ctx.sampleRate * duration);
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(gain, this.ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    src.connect(gainNode);
    gainNode.connect(this.ctx.destination);
    src.start();
  }

  _noiseBand(gain, duration, frequency = 1200, type = 'highpass', when = this.ctx.currentTime) {
    const bufSize = Math.floor(this.ctx.sampleRate * duration);
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(frequency, when);
    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(0.0001, when);
    gainNode.gain.exponentialRampToValueAtTime(gain, when + 0.005);
    gainNode.gain.exponentialRampToValueAtTime(0.001, when + duration);
    src.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.ctx.destination);
    src.start(when);
    src.stop(when + duration + 0.02);
  }

  _chirp() {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(2400, this.ctx.currentTime);
    osc.frequency.setValueAtTime(3200, this.ctx.currentTime + 0.05);
    osc.frequency.setValueAtTime(2800, this.ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.2);
    osc.connect(gain); gain.connect(this.ctx.destination);
    osc.start(); osc.stop(this.ctx.currentTime + 0.25);
  }

  _owlHoot() {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, this.ctx.currentTime);
    osc.frequency.setValueAtTime(260, this.ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.8);
    osc.connect(gain); gain.connect(this.ctx.destination);
    osc.start(); osc.stop(this.ctx.currentTime + 0.9);
  }
}
