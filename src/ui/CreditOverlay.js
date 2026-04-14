/**
 * CreditOverlay - full-screen API credits exhausted warning
 */
export class CreditOverlay {
  constructor(onDismiss) {
    this.el = document.getElementById('credit-overlay');
    this.onDismiss = onDismiss;
  }

  show() {
    this.el.classList.add('visible');
  }

  hide() {
    this.el.classList.remove('visible');
  }

  dismiss() {
    this.hide();
    if (this.onDismiss) this.onDismiss();
  }
}
