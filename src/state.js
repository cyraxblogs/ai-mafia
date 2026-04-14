// src/state.js - shared global state flag
// Breaks the circular import between game/engine.js and src/main.js

export let isGameActive = false;

export function setGameActive(v) {
  isGameActive = v;
}
