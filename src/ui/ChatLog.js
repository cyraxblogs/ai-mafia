/**
 * ChatLog - manages the scrollable game chat/activity log
 */

export class ChatLog {
  constructor() {
    this.container = document.getElementById('chat-log');
    this.maxMessages = 80;
    this.messages = [];
  }

  /**
   * Add a chat message
   * @param {string} name - Speaker name
   * @param {string} text - Message text
   * @param {Object} opts - {type: 'speech'|'system'|'action'|'vote', color: hex}
   */
  add(name, text, opts = {}) {
    const { type = 'speech', color = null } = opts;

    const msg = document.createElement('div');
    msg.className = `chat-msg chat-${type}`;

    const nameEl = document.createElement('span');
    nameEl.className = 'chat-name';
    if (color) nameEl.style.color = color;
    nameEl.textContent = name;

    const textEl = document.createElement('span');
    textEl.className = 'chat-text';

    if (type === 'system') {
      nameEl.style.color = '#aaa';
      textEl.style.color = '#bbb';
      textEl.style.fontStyle = 'italic';
    } else if (type === 'vote') {
      nameEl.style.color = '#cc8800';
      textEl.style.color = '#ccaa66';
    } else if (type === 'action') {
      nameEl.style.color = '#9060d0';
      textEl.style.color = '#b090e0';
    }

    textEl.textContent = text;

    msg.appendChild(nameEl);
    msg.appendChild(textEl);
    this.container.appendChild(msg);
    this.messages.push(msg);

    // Trim old messages
    while (this.messages.length > this.maxMessages) {
      const old = this.messages.shift();
      if (old.parentNode) old.parentNode.removeChild(old);
    }

    // Auto-scroll
    this.container.scrollTop = this.container.scrollHeight;

    return msg;
  }

  /**
   * Add a system announcement
   */
  system(text) {
    return this.add('SYSTEM', text, { type: 'system' });
  }

  /**
   * Add a speech entry
   */
  speech(name, text, color) {
    return this.add(name, text, { type: 'speech', color });
  }

  /**
   * Add a vote entry
   */
  vote(name, text) {
    return this.add(name, text, { type: 'vote' });
  }

  /**
   * Add an action entry (night actions, etc)
   */
  action(text) {
    return this.add('[ACT]', text, { type: 'action' });
  }

  /**
   * Add a separator / phase change marker
   */
  separator(text) {
    const div = document.createElement('div');
    div.className = 'chat-msg';
    div.style.textAlign = 'center';
    div.style.padding = '0.5rem 0';
    div.style.fontSize = '0.75rem';
    div.style.color = '#555';
    div.style.letterSpacing = '0.1em';
    div.style.fontFamily = 'Cinzel, serif';
    div.style.borderBottom = '1px solid rgba(201,168,76,0.1)';
    div.textContent = `- ${text} -`;
    this.container.appendChild(div);
    this.container.scrollTop = this.container.scrollHeight;
  }

  /**
   * Clear all messages
   */
  clear() {
    this.container.innerHTML = '';
    this.messages = [];
  }

  /**
   * Get all messages as plain text (for AI context)
   * @param {number} lastN - how many recent messages
   */
  getRecentText(lastN = 10) {
    return this.messages
      .slice(-lastN)
      .map(msg => {
        const name = msg.querySelector('.chat-name')?.textContent || '';
        const text = msg.querySelector('.chat-text')?.textContent || '';
        return `${name}: ${text}`;
      })
      .join('\n');
  }
}
