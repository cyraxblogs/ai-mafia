export class FireflyParticles {
  constructor() {
    this.canvas = document.getElementById('particles-canvas');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.particles = [];
    this.active = true;
    this._resize();
    this._spawn();
    this._loop();
    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  _spawn() {
    const count = 65;
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: (Math.random() - 0.5) * 0.4,
        vy: -Math.random() * 0.6 - 0.15,
        radius: Math.random() * 2.2 + 0.8,
        opacity: Math.random(),
        opacityDir: Math.random() > 0.5 ? 1 : -1,
        hue: 38 + Math.random() * 35,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  _loop() {
    if (!this.active) return;
    requestAnimationFrame((ts) => this._loop(ts));

    // ── 30 fps cap ──────────────────────────────────────────────────────────
    // Fireflies move <0.6 px/frame — halving render rate is invisible to the eye
    // but saves ~3,900 createRadialGradient() GC objects per second.
    const now = Date.now() * 0.001;
    if (!this._lastFrameTime) this._lastFrameTime = now;
    const elapsed = now - this._lastFrameTime;
    if (elapsed < 0.033) return; // skip frame — not yet 1/30 s
    this._lastFrameTime = now;

    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);

    this.particles.forEach(p => {
      // Movement (uses `now` computed above)
      p.x += p.vx + Math.sin(now * 0.7 + p.phase) * 0.2;
      p.y += p.vy + Math.cos(now * 0.5 + p.phase) * 0.1;

      // Opacity pulsing
      p.opacity += p.opacityDir * 0.012;
      if (p.opacity >= 1) { p.opacity = 1; p.opacityDir = -1; }
      if (p.opacity <= 0.05) {
        p.opacity = 0.05;
        p.opacityDir = 1;
        // Reset particles that go off screen
        if (p.y < -20 || p.x < -20 || p.x > W + 20) {
          p.x = Math.random() * W;
          p.y = H + Math.random() * 40;
          p.vx = (Math.random() - 0.5) * 0.4;
          p.vy = -Math.random() * 0.6 - 0.15;
        }
      }

      // Draw glow
      const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius * 4);
      gradient.addColorStop(0, `hsla(${p.hue}, 90%, 70%, ${p.opacity * 0.8})`);
      gradient.addColorStop(0.4, `hsla(${p.hue}, 80%, 55%, ${p.opacity * 0.3})`);
      gradient.addColorStop(1, `hsla(${p.hue}, 70%, 40%, 0)`);

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius * 4, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();

      // Core bright dot
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius * 0.6, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p.hue}, 100%, 85%, ${p.opacity})`;
      ctx.fill();
    });
  }

  destroy() {
    this.active = false;
  }
}
