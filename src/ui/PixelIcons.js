/**
 * PixelIcons.js — Centralised 16×16 pixel-art SVG icon library
 * Inspired by:
 *   - TimberwolfGames 160+ weapons pack (swords, daggers, axes)
 *   - Clockwork Raven "Raven Fantasy Icons" (8000+ 16×16 dark-outlined icons)
 *   - Dead Revolver "Pixel UI & HUD" (700+ HUD elements)
 *   - J8chi "Voxel RPG Weapons" (27 voxel props)
 * All drawn as inline SVG so zero network requests.
 * Style rules: 2px dark outline, flat fills, max 5 colours per icon,
 * chunky pixel silhouettes readable at 13-20px display size.
 */

// ── WEAPON / ROLE ICONS (16×16 pixel grid) ───────────────────────────────────

/** Mafia — stiletto switchblade, side profile, blood drop */
export const ICON_MAFIA = (size = 16) => `
<svg width="${size}" height="${size}" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" style="image-rendering:pixelated">
  <!-- blade — angled, thin, steel-grey with edge highlight -->
  <rect x="7" y="1" width="2" height="1" fill="#1a1a1a"/>
  <rect x="6" y="2" width="2" height="1" fill="#c8c8d0"/>
  <rect x="5" y="3" width="2" height="1" fill="#d4d4dc"/>
  <rect x="4" y="4" width="2" height="1" fill="#c8c8d0"/>
  <rect x="3" y="5" width="2" height="1" fill="#b0b0b8"/>
  <!-- edge bevel highlight -->
  <rect x="7" y="2" width="1" height="1" fill="#f0f0f8"/>
  <rect x="6" y="3" width="1" height="1" fill="#e8e8f0"/>
  <rect x="5" y="4" width="1" height="1" fill="#e0e0e8"/>
  <!-- guard / crosspiece -->
  <rect x="2" y="6" width="4" height="1" fill="#2a1a0a"/>
  <rect x="2" y="5" width="1" height="2" fill="#3a2a10"/>
  <rect x="5" y="5" width="1" height="2" fill="#3a2a10"/>
  <!-- handle — dark leather wrap -->
  <rect x="2" y="7" width="3" height="4" fill="#1e1008"/>
  <rect x="3" y="8" width="1" height="2" fill="#2e1a10"/>
  <rect x="2" y="9" width="1" height="1" fill="#2e1a10"/>
  <rect x="4" y="9" width="1" height="1" fill="#2e1a10"/>
  <!-- pommel -->
  <rect x="2" y="11" width="3" height="2" fill="#3a2a10"/>
  <rect x="3" y="12" width="1" height="1" fill="#4a3a18"/>
  <!-- blood drop -->
  <rect x="9" y="3" width="2" height="1" fill="#cc0000"/>
  <rect x="9" y="4" width="3" height="2" fill="#aa0000"/>
  <rect x="10" y="6" width="2" height="1" fill="#880000"/>
  <rect x="10" y="7" width="1" height="1" fill="#660000"/>
</svg>`;

/** Doctor — clean medical cross / caduceus-inspired symbol, blue and white */
export const ICON_DOCTOR = (size = 16) => `
<svg width="${size}" height="${size}" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" style="image-rendering:pixelated">
  <!-- Background circle -->
  <rect x="2" y="2" width="12" height="12" rx="2" fill="#1e3a5f"/>
  <rect x="3" y="3" width="10" height="10" rx="1" fill="#2563eb"/>
  
  <!-- Medical cross (vertical bar) -->
  <rect x="7" y="4" width="2" height="8" fill="#ffffff"/>
  <!-- Medical cross (horizontal bar) -->
  <rect x="4" y="7" width="8" height="2" fill="#ffffff"/>
  
  <!-- Cross center highlight -->
  <rect x="7" y="7" width="2" height="2" fill="#dbeafe"/>
  
  <!-- Corner accents -->
  <rect x="3" y="3" width="2" height="2" fill="#60a5fa"/>
  <rect x="11" y="3" width="2" height="2" fill="#60a5fa"/>
  <rect x="3" y="11" width="2" height="2" fill="#60a5fa"/>
  <rect x="11" y="11" width="2" height="2" fill="#60a5fa"/>
</svg>`;

/** Sheriff — 5-point star badge, gold with engraved lines */
export const ICON_SHERIFF = (size = 16) => `
<svg width="${size}" height="${size}" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" style="image-rendering:pixelated">
  <!-- outer star points — pixel approximation of 5-pointed star -->
  <rect x="7" y="1" width="2" height="2" fill="#f59e0b"/>
  <!-- top-right arm -->
  <rect x="10" y="3" width="2" height="2" fill="#f59e0b"/>
  <!-- right arm -->
  <rect x="12" y="6" width="2" height="2" fill="#f59e0b"/>
  <!-- bottom-right arm -->
  <rect x="10" y="10" width="2" height="2" fill="#f59e0b"/>
  <!-- bottom-left arm -->
  <rect x="4"  y="10" width="2" height="2" fill="#f59e0b"/>
  <!-- left arm -->
  <rect x="2"  y="6" width="2" height="2" fill="#f59e0b"/>
  <!-- top-left arm -->
  <rect x="4"  y="3" width="2" height="2" fill="#f59e0b"/>
  <!-- star body — large gold fill -->
  <rect x="5" y="3" width="6" height="10" fill="#fbbf24"/>
  <rect x="3" y="5" width="10" height="6" fill="#fbbf24"/>
  <rect x="4" y="4" width="8" height="8" fill="#fcd34d"/>
  <!-- centre circle / badge details -->
  <rect x="6" y="6" width="4" height="4" fill="#d97706"/>
  <rect x="7" y="7" width="2" height="2" fill="#fef3c7"/>
  <!-- outline/shadow -->
  <rect x="7" y="2" width="2" height="1" fill="#92400e"/>
  <rect x="6" y="3" width="4" height="1" fill="#92400e"/>
  <rect x="5" y="12" width="6" height="1" fill="#92400e"/>
</svg>`;

/** Villager — simple house silhouette, warm colours */
export const ICON_VILLAGER = (size = 16) => `
<svg width="${size}" height="${size}" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" style="image-rendering:pixelated">
  <!-- chimney -->
  <rect x="11" y="2" width="2" height="4" fill="#7a5a3a"/>
  <rect x="11" y="1" width="2" height="1" fill="#5a4020"/>
  <!-- roof -->
  <rect x="7"  y="3" width="2" height="1" fill="#c87040"/>
  <rect x="5"  y="4" width="6" height="1" fill="#c87040"/>
  <rect x="3"  y="5" width="10" height="1" fill="#b86030"/>
  <rect x="2"  y="6" width="12" height="1" fill="#a85020"/>
  <rect x="2"  y="7" width="12" height="1" fill="#c87040"/>
  <!-- wall -->
  <rect x="2"  y="8" width="12" height="6" fill="#d4a97a"/>
  <rect x="3"  y="9" width="10" height="4" fill="#e0ba8a"/>
  <!-- door -->
  <rect x="6"  y="10" width="4" height="4" fill="#3a2010"/>
  <rect x="7"  y="11" width="2" height="3" fill="#5a3820"/>
  <!-- window left -->
  <rect x="3" y="10" width="2" height="2" fill="#aaccff"/>
  <rect x="3" y="10" width="1" height="1" fill="#88aaee"/>
  <!-- window right -->
  <rect x="11" y="10" width="2" height="2" fill="#aaccff"/>
  <rect x="12" y="10" width="1" height="1" fill="#88aaee"/>
  <!-- ground line -->
  <rect x="1" y="14" width="14" height="1" fill="#5a8a3a"/>
  <rect x="1" y="15" width="14" height="1" fill="#3a6a20"/>
</svg>`;

/** Pistol — side-view blocky pixel gun, mafia-era revolver style */
export const ICON_GUN = (size = 16) => `
<svg width="${size}" height="${size}" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" style="image-rendering:pixelated">
  <!-- barrel -->
  <rect x="2" y="5" width="10" height="3" fill="#1a1a1a"/>
  <rect x="3" y="6" width="8" height="1" fill="#3a3a3a"/>
  <!-- barrel end/muzzle highlight -->
  <rect x="2" y="5" width="1" height="3" fill="#555"/>
  <rect x="12" y="5" width="1" height="1" fill="#555"/>
  <!-- slide top -->
  <rect x="5" y="4" width="7" height="2" fill="#2a2a2a"/>
  <rect x="6" y="4" width="5" height="1" fill="#444"/>
  <!-- ejection port -->
  <rect x="8" y="4" width="2" height="1" fill="#1a1a1a"/>
  <!-- frame / body -->
  <rect x="9" y="8" width="5" height="4" fill="#222"/>
  <rect x="10" y="8" width="3" height="3" fill="#333"/>
  <!-- trigger guard -->
  <rect x="8" y="8" width="2" height="1" fill="#1a1a1a"/>
  <rect x="7" y="9" width="1" height="2" fill="#1a1a1a"/>
  <rect x="8" y="11" width="3" height="1" fill="#1a1a1a"/>
  <!-- trigger -->
  <rect x="9" y="9" width="1" height="2" fill="#888"/>
  <!-- grip / handle — dark wood panels -->
  <rect x="11" y="9" width="4" height="5" fill="#2e1a08"/>
  <rect x="12" y="10" width="2" height="3" fill="#3a2210"/>
  <rect x="13" y="10" width="1" height="2" fill="#4a2e18"/>
  <!-- grip screws -->
  <rect x="12" y="9" width="1" height="1" fill="#888"/>
  <rect x="14" y="12" width="1" height="1" fill="#888"/>
  <!-- sight -->
  <rect x="12" y="4" width="1" height="1" fill="#666"/>
  <!-- flash suppressor hint -->
  <rect x="1" y="6" width="1" height="1" fill="#444"/>
</svg>`;

/** Magnifying glass — investigation / sheriff inspect */
export const ICON_INVESTIGATE = (size = 16) => `
<svg width="${size}" height="${size}" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" style="image-rendering:pixelated">
  <!-- lens ring -->
  <rect x="3" y="1" width="6" height="1" fill="#1a1a1a"/>
  <rect x="1" y="3" width="1" height="6" fill="#1a1a1a"/>
  <rect x="2" y="2" width="2" height="1" fill="#1a1a1a"/>
  <rect x="8" y="2" width="2" height="1" fill="#1a1a1a"/>
  <rect x="9" y="3" width="1" height="6" fill="#1a1a1a"/>
  <rect x="3" y="9" width="6" height="1" fill="#1a1a1a"/>
  <rect x="2" y="8" width="1" height="1" fill="#1a1a1a"/>
  <rect x="8" y="8" width="1" height="1" fill="#1a1a1a"/>
  <!-- lens interior -->
  <rect x="2" y="3" width="7" height="6" fill="#88aacc"/>
  <rect x="3" y="2" width="5" height="7" fill="#aaccee"/>
  <!-- lens highlight -->
  <rect x="3" y="3" width="2" height="2" fill="#cce4ff"/>
  <rect x="4" y="3" width="1" height="1" fill="#eef4ff"/>
  <!-- lens tint -->
  <rect x="6" y="6" width="3" height="2" fill="#6699bb"/>
  <!-- handle -->
  <rect x="9"  y="9"  width="2" height="1" fill="#1a1a1a"/>
  <rect x="10" y="10" width="2" height="1" fill="#1a1a1a"/>
  <rect x="11" y="11" width="2" height="2" fill="#5a3a10"/>
  <rect x="12" y="12" width="2" height="2" fill="#7a5220"/>
  <rect x="13" y="13" width="2" height="2" fill="#5a3a10"/>
</svg>`;

/** Moon / night — crescent for night phase */
export const ICON_MOON = (size = 16) => `
<svg width="${size}" height="${size}" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" style="image-rendering:pixelated">
  <!-- crescent body -->
  <rect x="7" y="1" width="4" height="1" fill="#fde68a"/>
  <rect x="5" y="2" width="6" height="1" fill="#fde68a"/>
  <rect x="4" y="3" width="7" height="1" fill="#fef3c7"/>
  <rect x="3" y="4" width="8" height="2" fill="#fef3c7"/>
  <rect x="3" y="6" width="7" height="2" fill="#fde68a"/>
  <rect x="4" y="8" width="7" height="2" fill="#fde68a"/>
  <rect x="5" y="10" width="6" height="1" fill="#fcd34d"/>
  <rect x="6" y="11" width="5" height="1" fill="#fcd34d"/>
  <rect x="7" y="12" width="4" height="1" fill="#f59e0b"/>
  <!-- cut-out for crescent (dark "bite") -->
  <rect x="5" y="3" width="4" height="8" fill="transparent"/>
  <rect x="6" y="2" width="5" height="1" fill="#0a0806"/>
  <rect x="5" y="3" width="4" height="1" fill="#0a0806"/>
  <rect x="4" y="4" width="4" height="5" fill="#0a0806"/>
  <rect x="5" y="9" width="4" height="2" fill="#0a0806"/>
  <rect x="6" y="11" width="3" height="1" fill="#0a0806"/>
  <!-- stars -->
  <rect x="12" y="2" width="1" height="1" fill="#fde68a"/>
  <rect x="14" y="5" width="1" height="1" fill="#fef3c7"/>
  <rect x="1"  y="7" width="1" height="1" fill="#fde68a"/>
  <rect x="2"  y="11" width="1" height="1" fill="#fcd34d"/>
  <rect x="13" y="11" width="2" height="1" fill="#fde68a"/>
  <rect x="14" y="10" width="1" height="2" fill="#fde68a"/>
</svg>`;

/** Sun / day — chunky pixel sun with rays */
export const ICON_SUN = (size = 14) => `
<svg width="${size}" height="${size}" viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg" style="image-rendering:pixelated">
  <!-- rays -->
  <rect x="6" y="0" width="2" height="2" fill="#fbbf24"/>
  <rect x="6" y="12" width="2" height="2" fill="#fbbf24"/>
  <rect x="0" y="6" width="2" height="2" fill="#fbbf24"/>
  <rect x="12" y="6" width="2" height="2" fill="#fbbf24"/>
  <rect x="2" y="2" width="2" height="2" fill="#f59e0b"/>
  <rect x="10" y="2" width="2" height="2" fill="#f59e0b"/>
  <rect x="2" y="10" width="2" height="2" fill="#f59e0b"/>
  <rect x="10" y="10" width="2" height="2" fill="#f59e0b"/>
  <!-- body -->
  <rect x="3" y="3" width="8" height="8" fill="#fbbf24"/>
  <rect x="4" y="2" width="6" height="10" fill="#fbbf24"/>
  <rect x="2" y="4" width="10" height="6" fill="#fbbf24"/>
  <!-- inner glow -->
  <rect x="4" y="4" width="6" height="6" fill="#fef3c7"/>
  <rect x="5" y="3" width="4" height="8" fill="#fef3c7"/>
  <rect x="3" y="5" width="8" height="4" fill="#fef3c7"/>
  <!-- centre highlight -->
  <rect x="5" y="5" width="4" height="4" fill="#fff"/>
</svg>`;

/** Skull — death / eliminated marker */
export const ICON_SKULL = (size = 14) => `
<svg width="${size}" height="${size}" viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg" style="image-rendering:pixelated">
  <!-- cranium -->
  <rect x="3" y="1" width="8" height="1" fill="#d1d5db"/>
  <rect x="1" y="2" width="12" height="1" fill="#d1d5db"/>
  <rect x="1" y="3" width="12" height="5" fill="#e5e7eb"/>
  <rect x="2" y="8" width="10" height="2" fill="#d1d5db"/>
  <!-- jaw -->
  <rect x="3" y="10" width="8" height="2" fill="#c0c4cc"/>
  <rect x="3" y="12" width="8" height="1" fill="#9ca3af"/>
  <!-- teeth gaps -->
  <rect x="4" y="11" width="1" height="2" fill="#1a1a1a"/>
  <rect x="6" y="11" width="1" height="2" fill="#1a1a1a"/>
  <rect x="8" y="11" width="1" height="2" fill="#1a1a1a"/>
  <!-- eye sockets -->
  <rect x="3" y="4" width="3" height="3" fill="#1a1a1a"/>
  <rect x="8" y="4" width="3" height="3" fill="#1a1a1a"/>
  <!-- nose hole -->
  <rect x="6" y="6" width="2" height="2" fill="#1a1a1a"/>
</svg>`;

/** Eye — spectator mode */
export const ICON_EYE = (size = 14) => `
<svg width="${size}" height="${size}" viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg" style="image-rendering:pixelated">
  <!-- upper eyelid curve -->
  <rect x="2" y="4" width="2" height="1" fill="#d1d5db"/>
  <rect x="4" y="3" width="6" height="1" fill="#d1d5db"/>
  <rect x="10" y="4" width="2" height="1" fill="#d1d5db"/>
  <!-- sclera (white) -->
  <rect x="1" y="5" width="12" height="4" fill="#f9fafb"/>
  <rect x="2" y="4" width="10" height="5" fill="#f9fafb"/>
  <!-- iris -->
  <rect x="5" y="5" width="4" height="4" fill="#3b82f6"/>
  <!-- pupil -->
  <rect x="6" y="6" width="2" height="2" fill="#1a1a1a"/>
  <!-- highlight -->
  <rect x="6" y="5" width="1" height="1" fill="#bfdbfe"/>
  <!-- lower eyelid -->
  <rect x="2" y="9" width="2" height="1" fill="#d1d5db"/>
  <rect x="4" y="10" width="6" height="1" fill="#d1d5db"/>
  <rect x="10" y="9" width="2" height="1" fill="#d1d5db"/>
</svg>`;

/** Chat bubble — chat log toggle */
export const ICON_CHAT = (size = 14) => `
<svg width="${size}" height="${size}" viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg" style="image-rendering:pixelated">
  <!-- bubble body -->
  <rect x="1" y="1" width="12" height="9" fill="#374151"/>
  <rect x="2" y="2" width="10" height="7" fill="#4b5563"/>
  <!-- text lines -->
  <rect x="3" y="3" width="8" height="1" fill="#d1d5db"/>
  <rect x="3" y="5" width="6" height="1" fill="#9ca3af"/>
  <rect x="3" y="7" width="7" height="1" fill="#9ca3af"/>
  <!-- tail -->
  <rect x="3" y="10" width="1" height="1" fill="#374151"/>
  <rect x="3" y="11" width="1" height="1" fill="#374151"/>
  <rect x="4" y="11" width="1" height="1" fill="#374151"/>
  <rect x="4" y="12" width="1" height="1" fill="#374151"/>
</svg>`;

/** Sound on — speaker with waves */
export const ICON_SOUND_ON = (size = 14) => `
<svg width="${size}" height="${size}" viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg" style="image-rendering:pixelated">
  <!-- speaker cone -->
  <rect x="1" y="5" width="3" height="4" fill="#d1d5db"/>
  <rect x="4" y="3" width="1" height="8" fill="#9ca3af"/>
  <rect x="5" y="2" width="1" height="10" fill="#d1d5db"/>
  <rect x="6" y="1" width="1" height="12" fill="#d1d5db"/>
  <!-- sound waves -->
  <rect x="8" y="4" width="1" height="6" fill="#60a5fa"/>
  <rect x="10" y="3" width="1" height="8" fill="#3b82f6"/>
  <rect x="12" y="2" width="1" height="10" fill="#1d4ed8"/>
</svg>`;

/** Sound off / muted */
export const ICON_SOUND_OFF = (size = 14) => `
<svg width="${size}" height="${size}" viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg" style="image-rendering:pixelated">
  <!-- speaker cone (greyed) -->
  <rect x="1" y="5" width="3" height="4" fill="#6b7280"/>
  <rect x="4" y="3" width="1" height="8" fill="#4b5563"/>
  <rect x="5" y="2" width="1" height="10" fill="#6b7280"/>
  <rect x="6" y="1" width="1" height="12" fill="#6b7280"/>
  <!-- X cross — muted -->
  <rect x="9"  y="5"  width="1" height="1" fill="#ef4444"/>
  <rect x="10" y="6"  width="1" height="1" fill="#ef4444"/>
  <rect x="11" y="7"  width="1" height="1" fill="#ef4444"/>
  <rect x="10" y="8"  width="1" height="1" fill="#ef4444"/>
  <rect x="9"  y="9"  width="1" height="1" fill="#ef4444"/>
  <rect x="11" y="5"  width="1" height="1" fill="#ef4444"/>
  <rect x="12" y="6"  width="1" height="1" fill="#ef4444"/>
  <rect x="12" y="8"  width="1" height="1" fill="#ef4444"/>
  <rect x="11" y="9"  width="1" height="1" fill="#ef4444"/>
</svg>`;

/** Shield / protect — doctor protection action */
export const ICON_SHIELD = (size = 16) => `
<svg width="${size}" height="${size}" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" style="image-rendering:pixelated">
  <!-- shield outline -->
  <rect x="3" y="1" width="10" height="1" fill="#1d4ed8"/>
  <rect x="2" y="2" width="12" height="1" fill="#2563eb"/>
  <rect x="1" y="3" width="14" height="7" fill="#3b82f6"/>
  <rect x="2" y="10" width="12" height="2" fill="#2563eb"/>
  <rect x="4" y="12" width="8" height="2" fill="#1d4ed8"/>
  <rect x="6" y="14" width="4" height="1" fill="#1e40af"/>
  <rect x="7" y="15" width="2" height="1" fill="#1e3a8a"/>
  <!-- shield face -->
  <rect x="2" y="3" width="12" height="8" fill="#60a5fa"/>
  <rect x="3" y="2" width="10" height="9" fill="#93c5fd"/>
  <!-- cross emblem -->
  <rect x="7" y="4" width="2" height="6" fill="#fff"/>
  <rect x="5" y="6" width="6" height="2" fill="#fff"/>
  <!-- highlight top-left -->
  <rect x="2" y="3" width="3" height="2" fill="#bfdbfe"/>
</svg>`;

/** Crosshair / target — kill shot action */
export const ICON_KILLSHOT = (size = 16) => `
<svg width="${size}" height="${size}" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" style="image-rendering:pixelated">
  <!-- outer ring -->
  <rect x="5" y="1" width="6" height="1" fill="#ef4444"/>
  <rect x="3" y="2" width="2" height="1" fill="#ef4444"/>
  <rect x="11" y="2" width="2" height="1" fill="#ef4444"/>
  <rect x="2" y="3" width="1" height="2" fill="#ef4444"/>
  <rect x="13" y="3" width="1" height="2" fill="#ef4444"/>
  <rect x="1" y="5" width="1" height="6" fill="#ef4444"/>
  <rect x="14" y="5" width="1" height="6" fill="#ef4444"/>
  <rect x="2" y="11" width="1" height="2" fill="#ef4444"/>
  <rect x="13" y="11" width="1" height="2" fill="#ef4444"/>
  <rect x="3" y="13" width="2" height="1" fill="#ef4444"/>
  <rect x="11" y="13" width="2" height="1" fill="#ef4444"/>
  <rect x="5" y="14" width="6" height="1" fill="#ef4444"/>
  <!-- crosshairs -->
  <rect x="7" y="1" width="2" height="4" fill="#ef4444"/>
  <rect x="7" y="11" width="2" height="4" fill="#ef4444"/>
  <rect x="1" y="7" width="4" height="2" fill="#ef4444"/>
  <rect x="11" y="7" width="4" height="2" fill="#ef4444"/>
  <!-- centre dot -->
  <rect x="6" y="6" width="4" height="4" fill="#fca5a5"/>
  <rect x="7" y="7" width="2" height="2" fill="#fff"/>
</svg>`;

/** Scales / balance — vote phase */
export const ICON_SCALES = (size = 14) => `
<svg width="${size}" height="${size}" viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg" style="image-rendering:pixelated">
  <!-- pole -->
  <rect x="6" y="1" width="2" height="12" fill="#8B6914"/>
  <rect x="7" y="1" width="1" height="11" fill="#a87820"/>
  <!-- cross-arm -->
  <rect x="1" y="4" width="12" height="1" fill="#c9a84c"/>
  <rect x="2" y="3" width="10" height="1" fill="#d4a020"/>
  <!-- left chain -->
  <rect x="2" y="5" width="1" height="4" fill="#888"/>
  <!-- right chain -->
  <rect x="11" y="5" width="1" height="4" fill="#888"/>
  <!-- left pan -->
  <rect x="1" y="9" width="3" height="1" fill="#c9a84c"/>
  <rect x="1" y="10" width="4" height="1" fill="#a87820"/>
  <!-- right pan (lower — guilty side) -->
  <rect x="10" y="10" width="3" height="1" fill="#c9a84c"/>
  <rect x="9"  y="11" width="4" height="1" fill="#a87820"/>
  <!-- base -->
  <rect x="4" y="13" width="6" height="1" fill="#7a5220"/>
  <rect x="5" y="12" width="4" height="1" fill="#8B6914"/>
</svg>`;

/** Thought bubble / brain — thinking indicator */
export const ICON_THINKING = (size = 14) => `
<svg width="${size}" height="${size}" viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg" style="image-rendering:pixelated">
  <!-- main bubble -->
  <rect x="2" y="2" width="9" height="1" fill="#6b7280"/>
  <rect x="1" y="3" width="11" height="6" fill="#374151"/>
  <rect x="2" y="9" width="9" height="1" fill="#6b7280"/>
  <!-- interior -->
  <rect x="2" y="3" width="9" height="6" fill="#4b5563"/>
  <!-- dots inside bubble (thinking) -->
  <rect x="4" y="5" width="1" height="2" fill="#d1d5db"/>
  <rect x="6" y="5" width="1" height="2" fill="#d1d5db"/>
  <rect x="8" y="5" width="1" height="2" fill="#d1d5db"/>
  <!-- tail dots -->
  <rect x="3"  y="10" width="2" height="1" fill="#6b7280"/>
  <rect x="2"  y="11" width="2" height="1" fill="#4b5563"/>
  <rect x="1"  y="12" width="2" height="1" fill="#374151"/>
</svg>`;

/** Warning triangle — danger / warning */
export const ICON_WARNING = (size = 14) => `
<svg width="${size}" height="${size}" viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg" style="image-rendering:pixelated">
  <!-- triangle outline -->
  <rect x="6" y="1" width="2" height="2" fill="#f59e0b"/>
  <rect x="5" y="3" width="4" height="1" fill="#f59e0b"/>
  <rect x="4" y="4" width="6" height="1" fill="#fbbf24"/>
  <rect x="3" y="5" width="8" height="1" fill="#fbbf24"/>
  <rect x="2" y="6" width="10" height="1" fill="#fcd34d"/>
  <rect x="1" y="7" width="12" height="1" fill="#fcd34d"/>
  <rect x="1" y="8" width="12" height="1" fill="#fbbf24"/>
  <rect x="1" y="9" width="12" height="1" fill="#fbbf24"/>
  <rect x="1" y="10" width="12" height="2" fill="#f59e0b"/>
  <!-- interior fill -->
  <rect x="3" y="7" width="8" height="3" fill="#fef3c7"/>
  <rect x="4" y="6" width="6" height="4" fill="#fef3c7"/>
  <rect x="5" y="5" width="4" height="5" fill="#fef3c7"/>
  <rect x="6" y="4" width="2" height="5" fill="#fef3c7"/>
  <!-- exclamation -->
  <rect x="6" y="5" width="2" height="4" fill="#92400e"/>
  <rect x="6" y="10" width="2" height="2" fill="#92400e"/>
</svg>`;

/** Gravestone — death / eliminated */
export const ICON_GRAVE = (size = 16) => `
<svg width="${size}" height="${size}" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" style="image-rendering:pixelated">
  <!-- base slab -->
  <rect x="2" y="13" width="12" height="2" fill="#4b5563"/>
  <rect x="3" y="14" width="10" height="1" fill="#374151"/>
  <!-- stone body -->
  <rect x="4" y="5" width="8" height="9" fill="#6b7280"/>
  <rect x="5" y="6" width="6" height="7" fill="#9ca3af"/>
  <!-- arched top -->
  <rect x="4" y="3" width="8" height="2" fill="#6b7280"/>
  <rect x="5" y="2" width="6" height="2" fill="#6b7280"/>
  <rect x="6" y="1" width="4" height="2" fill="#9ca3af"/>
  <!-- cross engraved -->
  <rect x="7" y="4" width="2" height="5" fill="#4b5563"/>
  <rect x="5" y="6" width="6" height="2" fill="#4b5563"/>
  <!-- moss patch -->
  <rect x="4" y="11" width="2" height="1" fill="#2d5a1a"/>
  <rect x="10" y="12" width="2" height="1" fill="#2d5a1a"/>
</svg>`;

/** Clipboard / case file — investigation panel */
export const ICON_CLIPBOARD = (size = 14) => `
<svg width="${size}" height="${size}" viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg" style="image-rendering:pixelated">
  <!-- clip -->
  <rect x="5" y="0" width="4" height="2" fill="#374151"/>
  <rect x="4" y="1" width="6" height="2" fill="#1f2937"/>
  <!-- board -->
  <rect x="1" y="2" width="12" height="12" fill="#374151"/>
  <rect x="2" y="3" width="10" height="10" fill="#f9fafb"/>
  <!-- lines of text -->
  <rect x="3" y="4" width="8" height="1" fill="#374151"/>
  <rect x="3" y="6" width="7" height="1" fill="#9ca3af"/>
  <rect x="3" y="8" width="8" height="1" fill="#9ca3af"/>
  <rect x="3" y="10" width="5" height="1" fill="#9ca3af"/>
  <!-- red mark (suspect) -->
  <rect x="10" y="6" width="2" height="4" fill="#ef4444"/>
  <rect x="9"  y="7" width="1" height="2" fill="#ef4444"/>
  <rect x="11" y="7" width="1" height="2" fill="#ef4444"/>
</svg>`;

// ── Inline SVG getter — returns html string with given size ───────────────────
export function icon(name, size) {
  const map = {
    mafia: ICON_MAFIA, doctor: ICON_DOCTOR, sheriff: ICON_SHERIFF,
    villager: ICON_VILLAGER, gun: ICON_GUN, investigate: ICON_INVESTIGATE,
    moon: ICON_MOON, sun: ICON_SUN, skull: ICON_SKULL, eye: ICON_EYE,
    chat: ICON_CHAT, sound_on: ICON_SOUND_ON, sound_off: ICON_SOUND_OFF,
    shield: ICON_SHIELD, killshot: ICON_KILLSHOT, scales: ICON_SCALES,
    thinking: ICON_THINKING, warning: ICON_WARNING, grave: ICON_GRAVE,
    clipboard: ICON_CLIPBOARD,
  };
  const fn = map[name];
  return fn ? fn(size) : '';
}
