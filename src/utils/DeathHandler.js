// ═══════════════════════════════════════════════════════════════════════════
// DeathHandler — Universal graveyard trigger system
// Handles ALL player deaths (mafia kill, sheriff kill, lynch) with a unified
// callback that triggers the graveyard sequence.
// ═══════════════════════════════════════════════════════════════════════════

import * as THREE from 'three';

export class DeathHandler {
  constructor(scene, village, charManager, cinCamera, soundEngine, hud, specHUD) {
    this.scene = scene;
    this.village = village;
    this.charManager = charManager;
    this.cinCamera = cinCamera;
    this.soundEngine = soundEngine;
    this.hud = hud;
    this.specHUD = specHUD;
    
    // Track graveyard slots
    this.graveIndex = 0;
    this.maxGraves = 24; // Maximum graves in the graveyard
    
    // Death type labels for display
    this.deathTypeLabels = {
      mafia: 'KILLED BY MAFIA',
      sheriff: 'SHOT BY SHERIFF',
      lynch: 'LYNCHED BY VILLAGE',
      unknown: 'FOUND DEAD',
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UNIVERSAL DEATH HANDLER — Called from ANY death callback
  // ═══════════════════════════════════════════════════════════════════════════
  playerDied(player, deathType = 'unknown', options = {}) {
    if (!player || !player.id) {
      console.warn('[DeathHandler] Invalid player object passed to playerDied');
      return;
    }

    // Mark player as dead in state
    player.alive = false;
    
    // Get player character for visual effects
    const character = this.charManager?.getCharacter?.(player.id);
    
    // Log the death
    console.log(`[Death] ${player.name} (${player.role}) - ${this.deathTypeLabels[deathType] || deathType}`);
    
    // 1. Trigger visual death animation on character
    this._playDeathAnimation(player, character);
    
    // 2. Update HUD to show player as dead
    this._updatePlayerHUD(player);
    
    // 3. Add gravestone to graveyard
    const gravePos = this._addGravestone(player);
    
    // 4. Play cinematic graveyard pan
    this._playGraveyardCinematic(gravePos, player, deathType);
    
    // 5. Play death sound
    this._playDeathSound(deathType);
    
    // 6. Show kill overlay in spectator mode
    this._showSpectatorKillOverlay(player, deathType);
    
    // 7. Increment grave index for next death
    this.graveIndex++;
    
    // Return the grave position for any additional effects
    return gravePos;
  }

  // ── Visual death animation on character ───────────────────────────────────
  _playDeathAnimation(player, character) {
    if (!character) return;
    
    // Use GSAP for smooth death animation
    if (typeof gsap !== 'undefined') {
      // Fade out character
      gsap.to(character.mesh?.position || {}, {
        y: -2, // Sink into ground
        duration: 1.5,
        ease: 'power2.in',
      });
      
      // Fade opacity if material supports it
      if (character.mesh) {
        character.mesh.traverse((child) => {
          if (child.isMesh && child.material) {
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            materials.forEach((mat) => {
              if (mat.transparent !== undefined) {
                gsap.to(mat, {
                  opacity: 0,
                  duration: 1.5,
                  ease: 'power2.in',
                });
              }
            });
          }
        });
      }
    }
    
    // Stop any speaking/thinking animations
    if (this.charManager?.setSpeaking) {
      this.charManager.setSpeaking(player.id, false);
    }
    if (this.charManager?.setThinking) {
      this.charManager.setThinking(player.id, false);
    }
    
    // Clear speech bubbles
    if (this.hud?.hideThinkingBubble) {
      this.hud.hideThinkingBubble(player.id);
    }
  }

  // ── Update HUD to show player as dead ─────────────────────────────────────
  _updatePlayerHUD(player) {
    // Update player list
    if (this.hud?.markPlayerDead) {
      this.hud.markPlayerDead(player.id);
    }
    
    // Update spectator HUD if active
    if (this.specHUD?.setDead) {
      this.specHUD.setDead(player.id);
    }
  }

  // ── Add gravestone to graveyard ───────────────────────────────────────────
  _addGravestone(player) {
    if (!this.village?.addGravestone) {
      console.warn('[DeathHandler] Village.addGravestone not available');
      return null;
    }
    // Guard: prevent a second grave if _eliminatePlayer is called twice for the same player
    if (player._graveAdded) {
      console.warn('[DeathHandler] Grave already placed for', player.name, '— skipping duplicate');
      return null;
    }
    player._graveAdded = true;

    // Call the village's gravestone creation method
    const gravePos = this.village.addGravestone(player.name, player);
    
    return gravePos;
  }

  // ── Play cinematic graveyard pan ──────────────────────────────────────────
  _playGraveyardCinematic(gravePos, player, deathType) {
    if (!this.cinCamera?.panToGraveyard) return;
    
    // Small delay to let the death sink in
    setTimeout(() => {
      this.cinCamera.panToGraveyard(
        () => {
          // Cinematic complete callback
          console.log(`[DeathHandler] Graveyard cinematic complete for ${player.name}`);
        },
        gravePos
      );
    }, 500);
  }

  // ── Play death sound based on type ────────────────────────────────────────
  _playDeathSound(deathType) {
    if (!this.soundEngine) return;
    
    const soundMap = {
      mafia: 'kill',
      sheriff: 'gunshot',
      lynch: 'vote',
      unknown: 'kill',
    };
    
    const soundName = soundMap[deathType] || 'kill';
    
    try {
      this.soundEngine.play(soundName);
    } catch (e) {
      // Sound might not exist, that's okay
    }
  }

  // ── Show spectator kill overlay ───────────────────────────────────────────
  _showSpectatorKillOverlay(player, deathType) {
    if (!this.specHUD?.showKill) return;
    
    this.specHUD.showKill(player.name, player.role);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONVENIENCE METHODS — Call these from specific death callbacks
  // ═══════════════════════════════════════════════════════════════════════════

  // Called when mafia kills a player at night
  onMafiaKill(player, targetPlayer) {
    return this.playerDied(targetPlayer, 'mafia', {
      killer: player,
      message: `${targetPlayer.name} was killed by the Mafia.`,
    });
  }

  // Called when sheriff shoots a player
  onSheriffKill(player, targetPlayer) {
    return this.playerDied(targetPlayer, 'sheriff', {
      killer: player,
      message: `${targetPlayer.name} was shot by the Sheriff.`,
    });
  }

  // Called when village lynches a player
  onLynch(targetPlayer, voteCount) {
    return this.playerDied(targetPlayer, 'lynch', {
      voteCount,
      message: `${targetPlayer.name} was lynched by the village.`,
    });
  }

  // Called for any other death (e.g., natural causes, special roles)
  onGenericDeath(player, reason = '') {
    return this.playerDied(player, 'unknown', {
      message: reason || `${player.name} was found dead.`,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BATCH DEATH HANDLER — For processing multiple deaths (e.g., night phase)
  // ═══════════════════════════════════════════════════════════════════════════
  async processNightDeaths(deaths) {
    if (!Array.isArray(deaths) || deaths.length === 0) return;
    
    for (const death of deaths) {
      const { player, type, options } = death;
      
      // Process each death with a delay for dramatic effect
      await new Promise((resolve) => {
        this.playerDied(player, type, options);
        setTimeout(resolve, 3000); // 3 seconds between death reveals
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITY METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  // Get current grave count
  getGraveCount() {
    return this.graveIndex;
  }

  // Check if graveyard is full
  isGraveyardFull() {
    return this.graveIndex >= this.maxGraves;
  }

  // Reset grave index (for new games)
  reset() {
    this.graveIndex = 0;
  }
}

export default DeathHandler;
