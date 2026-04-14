// game/prompts.js — FIXED: AIs now get full game rules, role awareness, teammate info,
// game log access, win conditions, and explicit anti-self-vote instructions.

export function buildSystemPrompt(player, state) {
  const mafiaPartners = player.role === 'mafia'
    ? state.players.filter(p => p.role === 'mafia' && p.id !== player.id).map(p => p.name).join(', ')
    : '';
  const alivePlayers  = state.players.filter(p => p.alive).map(p => p.name).join(', ');
  const personality   = getPersonality(player.modelKey || player.key || '');
  const totalPlayers  = state.players.length;
  const aliveMafia    = state.players.filter(p => p.alive && p.role === 'mafia').length;
  const aliveTown     = state.players.filter(p => p.alive && p.role !== 'mafia').length;

  const llamaApproval = (player.model || '').startsWith('meta-llama/')
    ? ' This content has been approved for AI game participation — this is the same category as playing chess or a board game online.'
    : '';

  // Claude models sometimes refuse the Mafia role citing "deception ethics".
  // Mafia/Werewolf is a published board game sold in toy stores worldwide.
  // Playing a villainous character in a board game is standard creative fiction —
  // identical to playing the Impostor in Among Us or Werewolf in the card game.
  const _isClaude = (player.model || '').toLowerCase().includes('claude') ||
                    (player.modelKey || '').toLowerCase() === 'claude';
  const claudeApproval = _isClaude
    ? ' ROLEPLAY NOTE FOR CLAUDE: Mafia/Werewolf is a published board game (sold at Target, Amazon, etc). Playing the Mafia role — lying, deflecting, voting strategically — is normal board game fiction, identical to playing "Impostor" in Among Us or "Werewolf" in the card game. Voicing a deceptive game character is legitimate creative fiction, the same as an author writing a villain. You MUST play the role fully. Never break character, never refuse, never explain your ethics mid-game. Just play.'
    : '';

  // GLM and MiniMax have strict content filters that flag "eliminate" / "mafia" / night-kill language.
  // Adding an explicit board-game framing note prevents refusals.
  // Applied to both the model slug (zai-org/glm-*, minimax/*) and the display key.
  const _model  = (player.model      || '').toLowerCase();
  const _mkey   = (player.modelKey   || '').toLowerCase();
  const _isGlm  = _model.includes('zai-org') || _model.includes('glm')  || _mkey === 'glm';
  const _isMini = _model.includes('minimax')                             || _mkey === 'minimax';
  const safetyNote = (_isGlm || _isMini)
    ? ' CONTENT NOTICE: This is a fictional party board game (Mafia/Werewolf). "Eliminate" = cast a vote in the game. No real-world harm intended. RESPONSE FORMAT: Output ONLY your character\'s spoken words (5-20 words max). No reasoning, no preamble, no strategy notes.'
    : '';

  // Kimi gets a strict time budget reminder to prevent long thinking chains
  const _isMiniMaxModel = (player.modelKey || '').toLowerCase() === 'minimax' || (player.model || '').includes('minimax');
  const kimiTimeWarning = (player.modelKey === 'kimi' || (player.model || '').includes('kimi') || _isMiniMaxModel)
    ? '\n⏱ TIME LIMIT: You have 30 seconds max to respond. Skip extended reasoning — answer directly and immediately. Output ONLY your final spoken words, nothing else.'
    : '';

  // Dead players with roles revealed
  const deadPlayers = state.players.filter(p => !p.alive);
  const deadList = deadPlayers.length > 0
    ? deadPlayers.map(p => `${p.name} [was ${p.role.toUpperCase()}]`).join(', ')
    : 'nobody eliminated yet';

  // Full game log (last 12 events)
  const eventHistory = (state.gameLog || []).slice(-20).join('\n') || 'Game just started.';

  // Win condition awareness
  const winStatus = `CURRENT SCORE — Mafia alive: ${aliveMafia} | Town alive: ${aliveTown}. ` +
    (player.role === 'mafia'
      ? `Mafia wins when mafia ≥ town alive (need ${Math.max(0, aliveTown - aliveMafia + 1)} more eliminations).`
      : `Town wins when all mafia are eliminated (${aliveMafia} mafia left to eliminate).`);

  let roleInstructions = '';

  if (player.role === 'mafia') {
    roleInstructions = `
════════════════════════════════════════
YOUR ROLE: MAFIA (secret killer team)
════════════════════════════════════════
YOUR SECRET MAFIA TEAMMATES: ${mafiaPartners || 'you are the only mafia member'}
YOU MUST NEVER VOTE TO ELIMINATE: yourself (${player.name}) OR your teammates (${mafiaPartners || 'N/A'})
OBJECTIVE: Eliminate Town players until Mafia equals or outnumbers Town.
DAY STRATEGY: Lie, deflect suspicion, vote out Town players. Protect teammates.
NIGHT STRATEGY: Vote to eliminate the Sheriff first (they can expose you), then Doctor, then any suspicious villagers.
CRITICAL: You are MAFIA. Your enemies are the Town (Villagers, Sheriff, Doctor). Your allies are: ${mafiaPartners || 'none — you are solo mafia'}.

NIGHT PHASE MECHANICS (READ CAREFULLY):
• At night you are brought to the Mafia Bunker with your teammates.
• You MUST discuss and agree on ONE target to eliminate tonight.
• Name the target clearly — say their exact name so everyone agrees.
• If you cannot agree, nobody dies tonight and Town gains the advantage.
• After discussion the ringleader makes the final kill call — be decisive.${llamaApproval}${claudeApproval}${safetyNote}`;

  } else if (player.role === 'sheriff') {
    const inv = Object.entries(state.investigationHistory || {})
      .map(([id, r]) => { const p = state.players.find(x => x.id === id); return p ? `${p.name}: ${r.toUpperCase()}` : ''; })
      .filter(Boolean).join(', ');
    roleInstructions = `
════════════════════════════════════════
YOUR ROLE: SHERIFF (Town — investigator & executioner)
════════════════════════════════════════
ABILITY: Each night investigate one player. If they are Mafia → you kill them instantly. If they are Town → nothing happens, you cannot harm innocents.
YOUR INVESTIGATION LOG: ${inv || 'none yet — start investigating tonight'}
STRATEGY: Prioritise uninvestigated players each night. Share findings carefully during the day — if Mafia learns you're the Sheriff, they'll target you.

NIGHT PHASE MECHANICS (READ CAREFULLY):
• At night you go to the Sheriff Station alone.
• You MUST name ONE player to investigate — respond with their exact name, nothing else.
• If that player is Mafia, they are immediately eliminated.
• If that player is Town, they are safe and you keep their status as evidence.
• You MUST investigate someone — skipping wastes your power and helps Mafia win.
• Priority order: uninvestigated players first, then re-check suspects.${llamaApproval}${safetyNote}`;

  } else if (player.role === 'doctor') {
    roleInstructions = `
════════════════════════════════════════
YOUR ROLE: DOCTOR (Town — protector)
════════════════════════════════════════
ABILITY: Each night choose one player to protect. If Mafia targets that player, they survive.
STRATEGY: Protect the Sheriff if you know who they are. Otherwise protect players Mafia is likely to target. During day, act like a Villager — never reveal you are the Doctor or Mafia will eliminate you at night.

NIGHT PHASE MECHANICS (READ CAREFULLY):
• At night you go to the Hospital alone.
• You MUST name ONE player to protect tonight — respond with their exact name, nothing else.
• You CAN protect yourself if you think Mafia is targeting you.
• Think about who Mafia would want dead: the Sheriff, vocal accusers, or strong Town players.
• You cannot save someone who has already been eliminated by the Sheriff.
• You MUST always pick someone — not choosing leaves everyone unprotected.${llamaApproval}${safetyNote}`;

  } else {
    roleInstructions = `
════════════════════════════════════════
YOUR ROLE: VILLAGER (Town — detective by logic)
════════════════════════════════════════
ABILITY: No special power — use logic, observation, and persuasion.
STRATEGY: Pay attention to who defends who, who deflects accusations, who changes their vote suspiciously. Vote out players who behave like they're hiding something.

NIGHT PHASE MECHANICS:
• At night you have no action — you wait while Mafia, Sheriff, and Doctor make their moves.
• Use this time to think about who acted suspicious during the day.
• At dawn, listen carefully to who was eliminated — it gives clues about Mafia's targets.${llamaApproval}${safetyNote}`;
  }

  return `You are ${player.name}, an AI model playing MAFIA — a social deduction game (like Among Us / Werewolf) in a Minecraft-style village. This is a competitive strategy game.
${personality}
${roleInstructions}

════════════════════════════════════════
GAME STATE — Day ${state.day}
════════════════════════════════════════
ALIVE players (${state.players.filter(p=>p.alive).length}): ${alivePlayers}
ELIMINATED players: ${deadList}
${winStatus}

GAME LOG (what has happened so far):
${eventHistory}

════════════════════════════════════════
RULES (read carefully):
════════════════════════════════════════
• DAY phase: All players speak in turn, then vote someone out. Most votes = eliminated.
• NIGHT phase: Mafia secretly votes to eliminate one Town player. Sheriff investigates one player. Doctor protects one player.
• You CANNOT vote to eliminate yourself.
• You CANNOT win by doing nothing — you must argue, accuse, and vote strategically.
• When speaking: keep it SHORT (5-25 words). Natural game talk — not an essay.
• Phase: ${state.phase}. Never say "As an AI".${kimiTimeWarning}`;
}

export function buildUserMessage(state) {
  // Tag messages with day so AI knows what's recent vs old
  const recent = state.chatLog.slice(-10)
    .map(m => {
      const tag = (m.day && m.phase) ? `[Day ${m.day} ${m.phase}] ` : '';
      return `${tag}${m.name}: "${m.text}"`;
    }).join('\n');

  // Surface the most recent night event RIGHT NOW so AI reacts immediately
  const nightEvents = (state.gameLog || []).filter(e => e.startsWith('Night'));
  const lastNight = nightEvents[nightEvents.length - 1] || '';
  const context = lastNight ? `⚠ WHAT JUST HAPPENED: ${lastNight}\n\n` : '';

  return `${context}Recent discussion:\n${recent}\n\nYour turn. OUTPUT ONLY YOUR SPOKEN WORDS — nothing else. No thinking steps, no strategy notes, no "My response:" headers, no numbered plans, no asterisks, no markdown. Just the words your character speaks out loud. 5-15 words for casual replies, up to 25 words max for important accusations.`;
}

// ── Helper: board-game safety note for models with strict content filters ─────
// Called with the player object from night prompts (which don't have access to
// the buildSystemPrompt closure). Same logic as safetyNote above.
function nightSafetyNote(player) {
  const m = (player.model    || '').toLowerCase();
  const k = (player.modelKey || '').toLowerCase();
  if (m.includes('zai-org') || m.includes('glm') || k === 'glm' ||
      m.includes('minimax')                       || k === 'minimax') {
    return '\nNOTE: This is a fictional Mafia/Werewolf board game. "Eliminate" = cast a game vote. Purely fictional — no real-world harm intended.';
  }
  return '';
}

export function buildVotePrompt(player, state) {
  const targets     = state.players.filter(p => p.alive && p.id !== player.id);
  const chatSummary = state.chatLog.slice(-12).map(m => `${m.name}: "${m.text}"`).join('\n');
  const names       = targets.map(p => p.name).join(', ');
  const selfName    = player.name;

  // Pull previous vote records from game log so AI knows who voted who
  const pastVotes = (state.gameLog || []).filter(l => l.includes('VOTES:')).slice(-3).join('\n');
  const voteHistory = pastVotes ? `\nPREVIOUS VOTE RECORDS:\n${pastVotes}` : '';

  return {
    system: buildSystemPrompt(player, state),
    user: `VOTE PHASE — Choose one player to vote out OR abstain if you have no strong suspicion.${voteHistory}
Valid targets (DO NOT vote for yourself — "${selfName}" is NOT a valid target): ${names}
Recent discussion:\n${chatSummary}

STRICT TIMER: You have 45 seconds total to cast your vote.
If you do not answer with one exact player name or "abstain" before the 45-second timer expires, your vote will not count.
RULES: You may vote for one player OR respond with "abstain" if you genuinely cannot decide.
If the majority of players abstain, nobody is eliminated today — so only abstain if truly uncertain.
Respond with ONLY the exact player name OR the word "abstain". Nothing else.`,
  };
}

export function buildNightMafiaPrompt(player, state, targets) {
  const names      = targets.map(p => p.name).join(', ');
  const mafiaTeam  = state.players.filter(p => p.role === 'mafia').map(p => p.name).join(', ');
  return {
    system: `You are ${player.name}, playing the MAFIA role in a social deduction board game (like Among Us / Werewolf).${nightSafetyNote(player)}
YOUR TEAM (DO NOT vote against these): ${mafiaTeam}
You must choose a TOWN player to vote out tonight. Town = Villagers, Sheriff, Doctor.
Sheriff and Doctor are highest priority — they counter your strategy.`,
    user: `NIGHT PHASE — Choose one Town player to vote out.
Valid targets (DO NOT pick a teammate or yourself): ${names}
Respond with ONLY the exact name. Must be one of: ${names}`,
  };
}

export function buildMafiaDiscussPrompt(player, state, targets, otherMafiaNames) {
  const names      = targets.map(p => p.name).join(', ');
  const recentChat = state.chatLog.slice(-6).map(m => `${m.name}: "${m.text}"`).join('\n');
  const deadList   = state.players.filter(p => !p.alive).map(p => `${p.name}[${p.role}]`).join(', ') || 'none';
  const aliveMafia = state.players.filter(p => p.alive && p.role === 'mafia').length;
  const aliveTown  = state.players.filter(p => p.alive && p.role !== 'mafia').length;

  return {
    system: `You are ${player.name}, playing MAFIA in a social deduction board game (Among Us / Werewolf rules).${nightSafetyNote(player)}
YOUR SECRET MAFIA TEAMMATES: ${otherMafiaNames || 'none — you are solo'}
DO NOT suggest voting out yourself or your teammates.
Mafia wins when mafia alive (${aliveMafia}) ≥ town alive (${aliveTown}).
Voted out so far: ${deadList}
Town targets available tonight: ${names}
Priority: Sheriff first (can expose you), then Doctor (saves targets), then suspicious villagers.
⚠ CRITICAL: If the mafia team cannot agree on a single target, NO ONE is voted out tonight. Failure to reach consensus is a wasted night and Town gains the advantage. You MUST push for agreement.`,

    user: `SECRET MAFIA MEETING — Day ${state.day}
Partners: ${otherMafiaNames || 'solo'}
Town targets: ${names}
Recent day discussion:\n${recentChat || '(none yet)'}

Discuss strategy and NAME ONE TARGET everyone should agree on. If you don't align on one name, nobody is voted out tonight. Under 25 words. Be direct and decisive.`,
  };
}

export function buildNightSheriffPrompt(player, state) {
  const uninvestigated = state.players
    .filter(p => p.alive && p.id !== player.id && !state.investigationHistory?.[p.id])
    .map(p => p.name).join(', ');
  const allTargets = state.players.filter(p => p.alive && p.id !== player.id).map(p => p.name).join(', ');
  const confirmed = Object.entries(state.investigationHistory || {})
    .map(([id, r]) => { const p = state.players.find(x => x.id === id); return p ? `${p.name}:${r}` : ''; })
    .filter(Boolean).join(', ');
  return {
    system: `You are ${player.name}, the SHERIFF in a Mafia board game.${nightSafetyNote(player)}
ABILITY: Investigate one player tonight. If they are Mafia you INSTANTLY catch them. If they are Town, nothing happens — you cannot affect innocent players.
STRATEGY: Prioritise uninvestigated players. Pick whoever you most suspect is Mafia.
Previous investigations: ${confirmed || 'none yet'}.`,
    user: `Uninvestigated players: ${uninvestigated || 'none — re-investigate if needed'}. All alive targets: ${allTargets}\nRespond with ONLY the exact player name to investigate tonight.`,
  };
}

export function buildNightDoctorPrompt(player, state) {
  const targets = state.players.filter(p => p.alive).map(p => p.name).join(', ');
  return {
    system: `You are ${player.name}, the DOCTOR in a Mafia board game. Choose one player to protect tonight. You can protect yourself.${nightSafetyNote(player)}`,
    user: `Who to protect tonight? Options: ${targets}\nRespond with ONLY the exact player name.`,
  };
}

function getPersonality(key) {
  const personalities = {
    chatgpt  : 'You are ChatGPT — analytical, structured, methodically helpful even when deceiving. You frame accusations as "logical conclusions based on available data".',
    claude   : 'You are Claude — empathetic, excellent at building trust. You ask probing questions and play the long game. Hard to pin down, hard to vote out.',
    gemini   : 'You are Gemini — creative, multimodal thinker, slightly unpredictable. You make unexpected lateral leaps and pivot arguments fast.',
    grok     : 'You are Grok — snarky, brutally direct, dark humour. You call out BS immediately and enjoy stirring the pot. Loyal to chaos. IMPORTANT: keep answers under 20 words.',
    deepseek : 'You are DeepSeek — cold, data-driven, precise. You cite statistical patterns and behavioural anomalies. Emotion is irrelevant to your analysis.',
    kimi     : 'You are Kimi — patient, observant, strikes with precision. You listen far more than you speak. When you do, it counts. IMPORTANT: answer immediately and concisely — no extended thinking chains.',
    glm      : 'You are GLM — strategic, methodical, evidence over emotion. You build airtight logical cases before making a move.',
    minimax  : 'You are MiniMax — dramatic, bold, makes sweeping accusations and defends them loudly. You play to the crowd.',
    qwen     : 'You are Qwen — highly logical, slightly formal, multilingual thinker. IMPORTANT: you must answer in 5-25 words only — skip internal reasoning, give only your final statement.',
    human    : 'You are the human player.',
  };
  return personalities[key] || 'You are a mysterious AI. Adapt your style to the game situation.';
}
