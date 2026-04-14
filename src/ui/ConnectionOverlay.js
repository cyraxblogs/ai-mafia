/**
 * ConnectionOverlay - shows/hides connection lost message
 */
export class ConnectionOverlay {
  constructor() {
    this.el = document.getElementById('connection-overlay');
    this._online = true;

    window.addEventListener('offline', () => this.show());
    window.addEventListener('online', () => this.hide());
  }

  show(message) {
    if (message) this.el.textContent = message;
    this.el.classList.add('visible');
    this._online = false;
  }

  hide() {
    this.el.classList.remove('visible');
    this._online = true;
  }

  isOnline() {
    return this._online;
  }
}
