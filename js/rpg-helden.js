/* ==========================================================================
   NEON SIGIL — RPG heroes
   The 26 hero balls of the RPG mode (they only exist there): factions,
   classes, rarities (C … HR), base stats, marble abilities (move type, combo,
   hyper, passive, level 20/40 abilities, level 30 signature relic),
   the procedural cyber-ball models and the little SVG icons for the UI.
   The marble battles that use them live in js/rpg-kampf.js.
   ========================================================================== */
(function () {
  'use strict';

  const NEON = window.NEON || {};
  if (!window.THREE || !NEON.models) return;
  const M = NEON.models;
  const css = (hex) => '#' + hex.toString(16).padStart(6, '0');
  const rgba = (hex, a) => `rgba(${(hex >> 16) & 255},${(hex >> 8) & 255},${hex & 255},${a})`;

  // ------------------------------------------------------------ factions
  // Advantage cycle like AFK Arena: CHROME > RIOT > BIOHACK > NULLSEC > CHROME,
  // HALO and VOID hunt each other. Advantage = +25% damage.
  const svg = (body, extra) => `<svg viewBox="0 0 24 24" aria-hidden="true"${extra || ''}>${body}</svg>`;
  const FACTIONS = {
    chrome: { name: 'CHROME', color: 0xffc933, beats: 'riot', motto: 'Order, hardlight and gold-plated code.',
      icon: svg('<path d="M12 1.5l2.6 7.9 7.9 2.6-7.9 2.6L12 22.5l-2.6-7.9L1.5 12l7.9-2.6z"/>') },
    riot: { name: 'RIOT', color: 0xff5a1f, beats: 'biohack', motto: 'Street code. Loud, hot and hard to kill.',
      icon: svg('<path d="M12 1.5c1.2 4.3 6 6.6 6 12.1a6 6 0 0 1-12 0c0-2.6 1.3-4.3 2.6-5.5 0 2.3 1 3.6 2.3 3.6-1-3.4-.2-6.8 1.1-10.2z"/>') },
    biohack: { name: 'BIOHACK', color: 0x39ff6a, beats: 'nullsec', motto: 'Grown, not built. Nature running on silicon.',
      icon: svg('<path d="M3.5 20.5C3.5 10 10 3.5 20.5 3.5c0 10.5-6.5 17-17 17zM6.5 17.5l8-8" stroke="#0b0720" stroke-width="1.6"/>') },
    nullsec: { name: 'NULLSEC', color: 0xa64dff, beats: 'chrome', motto: 'Deleted programs that refused to stay deleted.',
      icon: svg('<path fill-rule="evenodd" d="M12 2.5a8 8 0 0 0-8 8v4.2l3 2V21h10v-4.3l3-2v-4.2a8 8 0 0 0-8-8zM8.8 9.5a2.1 2.1 0 1 1 0 4.2 2.1 2.1 0 0 1 0-4.2zm6.4 0a2.1 2.1 0 1 1 0 4.2 2.1 2.1 0 0 1 0-4.2z"/>') },
    halo: { name: 'HALO', color: 0x9ff4ff, beats: 'void', motto: 'Guardian AIs from the upper net.',
      icon: svg('<ellipse cx="12" cy="4.6" rx="7" ry="2.4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 8.5l2.1 5 5.4.6-4.1 3.5 1.2 5.3L12 20.2l-4.6 2.7 1.2-5.3-4.1-3.5 5.4-.6z"/>') },
    void: { name: 'VOID', color: 0xff2a4d, beats: 'halo', motto: 'Things that crawled out of the deep web.',
      icon: svg('<path d="M3 2.5l5 6.5M21 2.5l-5 6.5" stroke="currentColor" stroke-width="2.2"/><path d="M1.5 14.5c4.5-6.5 16.5-6.5 21 0-4.5 6.5-16.5 6.5-21 0z"/><circle cx="12" cy="14.5" r="2.8" fill="#0b0720"/>') },
  };
  const FACTION_ORDER = ['chrome', 'riot', 'biohack', 'nullsec', 'halo', 'void'];

  // ------------------------------------------------------------- classes
  // base stats at level 1 / 1 star; `range` in arena units, `rate` = seconds per attack,
  // `spd` = class factor on the marble speed (SPD) in battle
  const CLASSES = {
    tank: { name: 'TANK', hp: 1500, atk: 58, def: 60, spd: 1, rate: 1.35, range: 1.9, move: 3.0, ranged: false,
      role: 'Frontline wall. Soaks hits and protects the team.',
      icon: svg('<path d="M12 1.5l8.5 3.2v6.4c0 5.4-3.7 9.6-8.5 11.4-4.8-1.8-8.5-6-8.5-11.4V4.7z"/>') },
    warrior: { name: 'WARRIOR', hp: 1050, atk: 92, def: 36, spd: 1.1, rate: 1.0, range: 1.9, move: 3.6, ranged: false,
      role: 'Melee damage. Dives in and cuts things apart.',
      icon: svg('<path d="M15 2h7v7L10.8 20.2l-2.1.6.6-2.1zM3.6 14.8l5.6 5.6-2 2-5.6-5.6z"/>') },
    ranger: { name: 'RANGER', hp: 720, atk: 102, def: 20, spd: 1.12, rate: 1.05, range: 11, move: 2.8, ranged: true,
      role: 'Long-range single-target damage from the back row.',
      icon: svg('<circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M12 .5v6.5M12 17v6.5M.5 12H7M17 12h6.5" stroke="currentColor" stroke-width="2.2"/><circle cx="12" cy="12" r="2"/>') },
    mage: { name: 'MAGE', hp: 680, atk: 112, def: 18, spd: 1.04, rate: 1.4, range: 10, move: 2.8, ranged: true,
      role: 'Area damage and crowd control from the back row.',
      icon: svg('<path d="M12 1l2 5.2 5.2 2-5.2 2L12 15.4l-2-5.2-5.2-2 5.2-2z"/><circle cx="18.5" cy="18.5" r="3"/><circle cx="6" cy="19" r="2"/>') },
    support: { name: 'SUPPORT', hp: 800, atk: 70, def: 26, spd: 1.02, rate: 1.25, range: 9, move: 2.8, ranged: true,
      role: 'Heals, shields and buffs. Keeps the team alive.',
      icon: svg('<path d="M9 2.5h6v6.5h6.5v6H15v6.5H9V15H2.5V9H9z"/>') },
  };
  const CLASS_ORDER = ['tank', 'warrior', 'ranger', 'mage', 'support'];

  // ------------------------------------------------------------ rarities
  // C < R < E < A < S < SS < SSS < HR (hyper rare).
  //   mult:   stat multiplier        weight: pull chance in % (Hero Crates, Data Boxes)
  //   dust:   stardust for a copy you already own        copy: stardust price of a copy
  const RARITIES = {
    C: { name: 'COMMON', color: '#a9b3c9', rank: 0, mult: 0.92, weight: 34, dust: 10, copy: 40 },
    R: { name: 'RARE', color: '#4aa8ff', rank: 1, mult: 0.98, weight: 27, dust: 16, copy: 64 },
    E: { name: 'EPIC', color: '#b45cff', rank: 2, mult: 1.05, weight: 18, dust: 25, copy: 100 },
    A: { name: 'A-CLASS', color: '#3dffb0', rank: 3, mult: 1.12, weight: 10.5, dust: 40, copy: 160 },
    S: { name: 'S-CLASS', color: '#ffc933', rank: 4, mult: 1.19, weight: 6, dust: 65, copy: 260 },
    SS: { name: 'SS-CLASS', color: '#ff7a2a', rank: 5, mult: 1.27, weight: 2.9, dust: 100, copy: 400 },
    SSS: { name: 'SSS-CLASS', color: '#ff2a6d', rank: 6, mult: 1.36, weight: 1.2, dust: 160, copy: 640 },
    HR: { name: 'HYPER RARE', color: '#ff5cf0', rank: 7, mult: 1.48, weight: 0.4, dust: 260, copy: 1000 },
  };
  const RARITY_ORDER = ['C', 'R', 'E', 'A', 'S', 'SS', 'SSS', 'HR'];
  // marble speed: BOUNCE balls are the fast ones, PIERCE balls hit harder but fly slower
  const MOVE_SPD = { bounce: 500, pierce: 350 };
  const RELIC_LVL = 30;

  // --------------------------------------------------------------- heroes
  // Marble battles (Hyper Heroes style): every hero is a ball you sling across the arena.
  //   move:    'bounce' rebounds off enemies, 'pierce' smashes straight through them
  //   combo:   fires when the slung hero touches this hero on the field
  //   hyper:   charges over `charge` turns, then boosts one launch (or unleashes a spell)
  //   passive: always-on `mods` (see js/rpg-kampf.js)
  // look: body shape, hull colour, glow colour, eye colour/type, emissive pattern, extra parts
  const HEROES = [
    // ---------------------------------------------------------------- CHROME
    { id: 'aegis', name: 'AEGIS-7', faction: 'chrome', cls: 'tank', rarity: 'C', move: 'bounce',
      tag: 'A firewall with a soul. Stands in front so nobody else has to.',
      look: { body: 'sphere', base: 0x2c3350, glow: 0xffc933, eye: 0xfff1b0, eyeType: 'visor', pattern: 'plates', extra: ['plates'], sig: 'aegisShields' },
      combo: { name: 'BULWARK PULSE', kind: 'bulwark', shield: 0.2, power: 0.6, r: 6, desc: 'Shields the team (20% less damage) and a pulse knocks nearby enemies back for 60% ATK.' },
      hyper: { name: 'PHALANX', kind: 'shieldWall', charge: 10, heal: 0.15, shield: 0.5, turns: 2, reflect: 0.5, desc: 'Raises a hex wall: heals 15%, halves enemy damage and throws 50% of it back for 2 enemy turns.' },
      passive: { name: 'HARDLIGHT PLATING', desc: 'The whole team takes 8% less damage.' },
      mods: { teamArmor: 0.08 } },
    { id: 'lux', name: 'LUX LANCER', faction: 'chrome', cls: 'warrior', rarity: 'A', move: 'pierce',
      tag: 'Paladin subroutine. Rides the light straight through the enemy line.',
      look: { body: 'sphere', base: 0xd8dde8, glow: 0xffd23a, eye: 0x19e6ff, eyeType: 'slit', pattern: 'stripes', extra: ['crest'], sig: 'solarLance' },
      combo: { name: 'SUNBEAM', kind: 'laser2', power: 1.2, desc: 'A horizontal laser across the whole arena for 120% ATK.' },
      hyper: { name: 'SOLAR FLARE', kind: 'solarFlare', charge: 11, power: 2.2, burn: 1.2, desc: 'Pierces everything for 220% damage and leaves a trail of sunfire that erupts for 120% ATK when it stops.' },
      passive: { name: 'RADIANT EDGE', desc: '+20% critical hit chance.' },
      mods: { crit: 0.2 } },
    { id: 'halcyon', name: 'HALCYON', faction: 'chrome', cls: 'support', rarity: 'E', move: 'bounce',
      tag: 'Medic daemon. Patches bodies faster than they break.',
      look: { body: 'sphere', base: 0xe9e4d6, glow: 0xffc933, eye: 0xffe9a0, eyeType: 'mono', pattern: 'circuit', extra: [], sig: 'lantern' },
      combo: { name: 'AFTERGLOW', kind: 'renew', heal: 0.06, regen: 0.03, turns: 2, desc: 'Heals the team for 6% now and another 3% at the start of the next 2 turns.' },
      hyper: { name: 'SANCTUARY', kind: 'sanctuary', charge: 12, heal: 0.3, regen: 0.1, turns: 3, desc: 'A healing sanctuary: heals 30% now and 10% at the start of each of the next 3 turns.' },
      passive: { name: 'TRIAGE', desc: 'Every destroyed enemy heals the team for 3%.' },
      mods: { healOnKill: 0.03 } },
    { id: 'voltage', name: 'VOLTAGE', faction: 'chrome', cls: 'ranger', rarity: 'A', move: 'bounce',
      tag: 'Overclocked power grid on legs. Hums at 50 kHz and never sits still.',
      look: { body: 'sphere', base: 0x20283a, glow: 0xffe070, eye: 0x19e6ff, eyeType: 'visor', pattern: 'circuit', extra: [], sig: 'teslaCoils' },
      combo: { name: 'TESLA ARC', kind: 'chain', power: 0.9, n: 4, desc: 'Lightning jumps through 4 enemies for 90% ATK each.' },
      hyper: { name: 'THUNDERSTORM', kind: 'strikes', charge: 10, power: 1.3, n: 7, desc: 'Calls 7 lightning strikes on random enemies (130% ATK each), then launches.' },
      passive: { name: 'OVERCLOCK', desc: '+15% SPD.' },
      mods: { speed: 0.15 } },
    { id: 'bastion', name: 'BASTION', faction: 'chrome', cls: 'tank', rarity: 'SS', move: 'bounce',
      tag: 'A walking citadel. The last wall of the gold-plated city.',
      look: { body: 'dodeca', base: 0x2e3448, glow: 0xffc933, eye: 0xffffff, eyeType: 'twin', pattern: 'plates', extra: ['spikes'], sig: 'citadel' },
      combo: { name: 'AEGIS FIELD', kind: 'shield', shield: 0.35, desc: 'The next enemy attacks deal 35% less damage.' },
      hyper: { name: 'CITADEL', kind: 'fortress', charge: 13, heal: 0.35, shield: 0.7, delay: 1, desc: 'Walls rise around the team: heals 35%, blocks 70% of the next attacks and delays every enemy by 1 turn.' },
      passive: { name: 'IRON WILL', desc: 'The whole team takes 15% less damage.' },
      mods: { teamArmor: 0.15 } },

    // ------------------------------------------------------------------ RIOT
    { id: 'scrapjaw', name: 'SCRAPJAW', faction: 'riot', cls: 'warrior', rarity: 'C', move: 'bounce',
      tag: 'Built from junkyard servos. Eats scrap, spits sparks.',
      look: { body: 'dodeca', base: 0x3a2a22, glow: 0xff7a2a, eye: 0xffd23a, eyeType: 'twin', pattern: 'hazard', extra: [], sig: 'buzzsaw' },
      combo: { name: 'SAW BLADE', kind: 'sawblade', power: 0.8, n: 4, desc: 'Flings a saw blade that ricochets between 4 enemies for 80% ATK each.' },
      hyper: { name: 'SCRAP STORM', kind: 'scrapStorm', charge: 9, power: 1.6, speed: 1.2, saw: 0.6, desc: 'Launches 20% faster for 160% damage with 3 saw blades orbiting it that shred everything they touch (60% ATK).' },
      passive: { name: 'SCRAP FEEDER', desc: 'Heals the team for 4% of all damage SCRAPJAW deals.' },
      mods: { lifesteal: 0.04 } },
    { id: 'pyro', name: 'PYRO-PUNK', faction: 'riot', cls: 'mage', rarity: 'C', move: 'bounce',
      tag: 'Garage-band pyromancer. Every show ends in flames.',
      look: { body: 'sphere', base: 0x2a1010, glow: 0xff5a1f, eye: 0xffe070, eyeType: 'visor', pattern: 'cracks', extra: ['mohawk', 'flame'], sig: 'flameGuitar' },
      combo: { name: 'FIREWORKS', kind: 'homing', power: 0.55, n: 4, desc: '4 homing fireworks at random enemies for 55% ATK each.' },
      hyper: { name: 'NAPALM RAIN', kind: 'meteorRain', charge: 11, power: 1.4, n: 6, desc: '6 fire meteors crash onto random enemies (140% ATK each), then launches.' },
      passive: { name: 'IGNITER', desc: 'PYRO-PUNK’s combo deals 30% more damage.' },
      mods: { comboPower: 0.3 } },
    { id: 'ramcore', name: 'RAMCORE', faction: 'riot', cls: 'tank', rarity: 'E', move: 'bounce',
      tag: 'Demolition drone with a grudge and a very hard head.',
      look: { body: 'sphere', base: 0x3b1a1a, glow: 0xff3a2a, eye: 0xffb070, eyeType: 'slit', pattern: 'plates', extra: [], sig: 'ramHorns' },
      combo: { name: 'GROUND POUND', kind: 'quake', power: 0.8, r: 7, delay: 0.3, desc: 'Slams the floor: every enemy within reach takes 80% ATK and has a 30% chance to lose a turn.' },
      hyper: { name: 'BULL RUSH', kind: 'overdrive', charge: 10, power: 2.2, speed: 1.5, desc: 'Launches 50% faster and deals 220% damage this turn.' },
      passive: { name: 'THICK CHASSIS', desc: '+30% max HP for the team pool.' },
      mods: { hpMult: 1.3 } },
    { id: 'decibel', name: 'DECIBEL', faction: 'riot', cls: 'support', rarity: 'R', move: 'bounce',
      tag: 'Pirate-radio DJ. Turns every fight into a rave.',
      look: { body: 'sphere', base: 0x2a1030, glow: 0xff3cf2, eye: 0x8dff2a, eyeType: 'visor', pattern: 'stripes', extra: ['speakers'], sig: 'equalizer' },
      combo: { name: 'BASS DROP', kind: 'nova', power: 0.8, r: 7.5, desc: 'A bass wave hits every enemy within reach for 80% ATK.' },
      hyper: { name: 'MOSH PIT', kind: 'freeze', charge: 10, power: 1.2, delay: 2, desc: 'Stuns the crowd: 120% ATK to all enemies and delays their attacks by 2 turns.' },
      passive: { name: 'HYPE MAN', desc: 'DECIBEL’s combo deals 25% more damage.' },
      mods: { comboPower: 0.25 } },

    // --------------------------------------------------------------- BIOHACK
    { id: 'spore', name: 'SPORE', faction: 'biohack', cls: 'support', rarity: 'C', move: 'bounce',
      tag: 'A garden that learned to walk. Smells like rain and ozone.',
      look: { body: 'sphere', base: 0x143020, glow: 0x39ff6a, eye: 0xc8ff9a, eyeType: 'cute', pattern: 'dots', extra: [], sig: 'mushroom' },
      combo: { name: 'SPORE CLOUD', kind: 'sporeCloud', heal: 0.05, power: 0.3, r: 5, desc: 'Heals the team for 5% and poisons the enemies nearby (30% ATK at the next 2 enemy turns).' },
      hyper: { name: 'OVERGROWTH', kind: 'sporeBloom', charge: 10, heal: 0.2, power: 1.4, n: 4, desc: 'Heals 20% and grows toxic mushrooms on 4 enemies that burst at the next enemy turn for 140% ATK.' },
      passive: { name: 'PHOTOSYNTH', desc: 'The team regenerates 3% HP at the start of every turn.' },
      mods: { regen: 0.03 } },
    { id: 'viper', name: 'VIPER.EXE', faction: 'biohack', cls: 'ranger', rarity: 'R', move: 'pierce',
      tag: 'Stealth sniper. You only see it when the dart lands.',
      look: { body: 'ico', base: 0x0e2a18, glow: 0x8dff2a, eye: 0xeaff6a, eyeType: 'slit', pattern: 'scales', extra: [], sig: 'snakeTail' },
      combo: { name: 'VENOM DARTS', kind: 'venomDarts', power: 0.45, n: 3, poison: 0.35, desc: '3 homing darts for 45% ATK that also poison (35% ATK at the next 2 enemy turns).' },
      hyper: { name: 'NEUROTOXIN', kind: 'neurotoxin', charge: 9, n: 2, poison: 0.6, desc: 'Poisons every enemy (60% ATK at the next 2 enemy turns), then splits into 3 marbles.' },
      passive: { name: 'AMBUSH', desc: 'The first enemy hit every turn takes double damage.' },
      mods: { firstHit: true } },
    { id: 'mossback', name: 'MOSSBACK', faction: 'biohack', cls: 'tank', rarity: 'E', move: 'bounce',
      tag: 'An old server rack overgrown with living code. Unmovable.',
      look: { body: 'dodeca', base: 0x1e3322, glow: 0x39ff6a, eye: 0xeaff6a, eyeType: 'twin', pattern: 'circuit', extra: [], sig: 'turtleShell' },
      combo: { name: 'ROOT SNARE', kind: 'roots', power: 0.7, n: 2, desc: 'Roots the 2 nearest enemies: 70% ATK and they lose a turn.' },
      hyper: { name: 'BARKSKIN', kind: 'rootCage', charge: 12, heal: 0.2, shield: 0.4, power: 0.8, delay: 1, desc: 'Heals 20%, blocks 40% of the next attacks and roots every enemy (80% ATK, +1 turn).' },
      passive: { name: 'BRAMBLE CODE', desc: 'The whole team takes 10% less damage.' },
      mods: { teamArmor: 0.1 } },
    { id: 'thornlash', name: 'THORNLASH', faction: 'biohack', cls: 'warrior', rarity: 'A', move: 'pierce',
      tag: 'Carnivorous vine AI. Wraps, squeezes, deletes.',
      look: { body: 'ico', base: 0x1c3a14, glow: 0x8dff2a, eye: 0xff3cf2, eyeType: 'mono', pattern: 'dots', extra: ['spikes'], sig: 'vines' },
      combo: { name: 'VINE WHIP', kind: 'laserV', power: 1.1, desc: 'A vertical vine lash across the whole arena for 110% ATK.' },
      hyper: { name: 'STRANGLEROOT', kind: 'strangleroot', charge: 11, power: 1.2, tether: 1.5, desc: 'Every enemy it hits gets tied up in vines; when the ball stops they are crushed for 150% ATK and lose a turn.' },
      passive: { name: 'SAP DRINKER', desc: 'Heals the team for 5% of all damage THORNLASH deals.' },
      mods: { lifesteal: 0.05 } },

    // --------------------------------------------------------------- NULLSEC
    { id: 'hexwraith', name: 'HEXWRAITH', faction: 'nullsec', cls: 'mage', rarity: 'S', move: 'pierce',
      tag: 'A cursed save file. It remembers everyone who deleted it.',
      look: { body: 'sphere', base: 0x1a1030, glow: 0xb84dff, eye: 0xff6af5, eyeType: 'mono', pattern: 'runes', extra: ['horns'], sig: 'grimoire' },
      combo: { name: 'HEX CROSS', kind: 'cross', power: 1.0, desc: 'Horizontal and vertical curse lasers for 100% ATK.' },
      hyper: { name: 'SOUL SIPHON', kind: 'curseNova', charge: 11, power: 1.6, drain: 0.15, curse: 0.3, desc: 'Curses every enemy (+30% damage taken for the rest of the battle), then launches for 160% damage; 15% of it heals.' },
      passive: { name: 'DEATH MARK', desc: 'Deals 30% more damage to enemies below 50% HP.' },
      mods: { execute: 0.3 } },
    { id: 'nullblade', name: 'NULLBLADE', faction: 'nullsec', cls: 'warrior', rarity: 'S', move: 'pierce',
      tag: 'Assassin process. Terminates the weakest thread first.',
      look: { body: 'octa', base: 0x120a1e, glow: 0xa64dff, eye: 0xff4dd8, eyeType: 'mono', pattern: 'stripes', extra: ['fins'], sig: 'bladeStorm' },
      combo: { name: 'PHANTOM CUT', kind: 'phantomCut', power: 1.1, n: 3, desc: 'Blinks to the 3 weakest enemies and cuts each for 110% ATK.' },
      hyper: { name: 'BLINK STRIKE', kind: 'blinkStrike', charge: 10, power: 1.5, n: 6, desc: 'Teleports through up to 6 enemies (150% ATK each), then launches for double damage.' },
      passive: { name: 'FIRST STRIKE', desc: 'The first enemy hit every turn takes double damage.' },
      mods: { firstHit: true } },
    { id: 'widow', name: 'GLITCHWIDOW', faction: 'nullsec', cls: 'ranger', rarity: 'R', move: 'bounce',
      tag: 'A spider-bot that weaves webs out of corrupted packets.',
      look: { body: 'octa', base: 0x1a0a24, glow: 0xff4dd8, eye: 0xff2a4d, eyeType: 'twin', pattern: 'scales', extra: ['legs'], sig: 'webAbdomen' },
      combo: { name: 'WEB SNARE', kind: 'webSnare', power: 0.45, n: 5, delay: 0.35, desc: '5 homing web shots for 45% ATK; 35% chance each that the target loses a turn.' },
      hyper: { name: 'WEB TRAP', kind: 'webTrap', charge: 9, n: 3, webs: 4, desc: 'Wraps 4 enemies in webs (+2 turns), then splits into 4 marbles.' },
      passive: { name: 'EIGHT EYES', desc: '+15% critical hit chance.' },
      mods: { crit: 0.15 } },
    { id: 'reaper', name: 'REAPER.SYS', faction: 'nullsec', cls: 'tank', rarity: 'E', move: 'pierce',
      tag: 'Garbage collector with a scythe. Frees memory. Permanently.',
      look: { body: 'sphere', base: 0x0e0a18, glow: 0xa64dff, eye: 0x9ff4ff, eyeType: 'slit', pattern: 'runes', extra: ['wisps'], sig: 'scythe' },
      combo: { name: 'SCYTHE SWEEP', kind: 'scytheSweep', power: 1.1, r: 5, exec: 0.2, desc: 'A full-circle sweep for 110% ATK; enemies below 20% HP are executed (not bosses).' },
      hyper: { name: 'HARVEST', kind: 'reap', charge: 12, power: 2, drain: 0.2, exec: 0.3, desc: 'Executes every enemy below 30% HP (not bosses), then launches for double damage; 20% of it heals.' },
      passive: { name: 'SOUL TAX', desc: 'Every destroyed enemy heals the team for 4%.' },
      mods: { healOnKill: 0.04 } },

    // ------------------------------------------------------------------ HALO
    { id: 'seraphine', name: 'SERAPHINE', faction: 'halo', cls: 'support', rarity: 'SSS', move: 'bounce',
      tag: 'The last guardian AI of the upper net. Wings made of pure bandwidth.',
      look: { body: 'sphere', base: 0xf0f4ff, glow: 0x9ff4ff, eye: 0x19e6ff, eyeType: 'visor', pattern: 'circuit', extra: [], sig: 'seraphWings' },
      combo: { name: 'DIVINE LIGHT', kind: 'divine', heal: 0.08, shield: 0.25, desc: 'Heals the team for 8% and shields it (25% less damage).' },
      hyper: { name: 'DIVINE PATCH', kind: 'recharge', charge: 12, heal: 0.4, n: 3, desc: 'Heals the team for 40% and charges every other hero’s HYPER by 3 turns.' },
      passive: { name: 'GUARDIAN PROTOCOL', desc: 'Once per battle, when the team drops below 25% HP, it is restored by 35%.' },
      mods: { guardian: 0.35 } },
    { id: 'arc', name: 'ARC ANGEL', faction: 'halo', cls: 'ranger', rarity: 'SSS', move: 'pierce',
      tag: 'Orbital defence satellite that decided to come down and help.',
      look: { body: 'sphere', base: 0xdde6f5, glow: 0x19e6ff, eye: 0xffffff, eyeType: 'mono', pattern: 'stripes', extra: [], sig: 'satellite' },
      combo: { name: 'JUDGEMENT RAYS', kind: 'laser4', power: 1.2, desc: 'Lasers in 8 directions (cross and diagonals) for 120% ATK.' },
      hyper: { name: 'ORBITAL STRIKE', kind: 'nova', charge: 12, power: 2.6, desc: 'Fires an orbital beam on every enemy for 260% ATK, then launches.' },
      passive: { name: 'RICOCHET MATRIX', desc: '+15% damage for every wall bounce this turn (up to 6).' },
      mods: { wallPower: 0.15 } },
    { id: 'aurora', name: 'AURORA', faction: 'halo', cls: 'mage', rarity: 'S', move: 'bounce',
      tag: 'A living prism. Splits every photon into a weapon.',
      look: { body: 'sphere', base: 0xe6f0ff, glow: 0x9ff4ff, eye: 0xff3cf2, eyeType: 'mono', pattern: 'scales', extra: [], sig: 'auroraRibbons' },
      combo: { name: 'PRISM SPLIT', kind: 'laserX', power: 1.0, desc: 'Two diagonal prism lasers across the arena for 100% ATK.' },
      hyper: { name: 'NORTHERN LIGHTS', kind: 'laserStorm', charge: 11, power: 1.5, desc: 'Every other hero fires its combo at 150% power, then AURORA launches.' },
      passive: { name: 'REFRACTION', desc: 'AURORA’s combo deals 35% more damage.' },
      mods: { comboPower: 0.35 } },
    { id: 'valkyrie', name: 'VALKYRIE', faction: 'halo', cls: 'warrior', rarity: 'SS', move: 'pierce',
      tag: 'Chooser of the deleted. Carries fallen programs to the cloud.',
      look: { body: 'sphere', base: 0xf2f6ff, glow: 0x19e6ff, eye: 0xffc933, eyeType: 'slit', pattern: 'plates', extra: ['plates'], sig: 'wingedHelm' },
      combo: { name: 'SPEAR RAIN', kind: 'spearRain', power: 0.6, n: 6, desc: '6 light spears fall from the sky onto random enemies for 60% ATK each.' },
      hyper: { name: 'RAGNARÖK DIVE', kind: 'ragnarok', charge: 12, power: 4, r: 5.5, splash: 1.5, desc: 'Soars out of the arena and dives onto the strongest enemy for 400% ATK (150% to everything around it), then launches.' },
      passive: { name: 'VALHALLA CODE', desc: '+20% damage for every wall bounce this turn (up to 6).' },
      mods: { wallPower: 0.2 } },
    { id: 'unicore', name: 'UNICORE', faction: 'halo', cls: 'mage', rarity: 'HR', move: 'bounce',
      tag: 'A pixel unicorn that galloped out of a broken arcade cabinet. Leaves rainbows wherever it rolls.',
      look: { body: 'sphere', base: 0xf6f0ff, glow: 0xff9af5, eye: 0x9a5cff, eyeType: 'cute', pattern: 'stars', extra: [], sig: 'unicorn' },
      combo: { name: 'STARFALL', kind: 'starfall', power: 0.6, n: 5, heal: 0.02, desc: '5 shooting stars hit random enemies for 60% ATK each and heal the team 2% each.' },
      hyper: { name: 'RAINBOW DASH', kind: 'rainbowDash', charge: 11, power: 2.2, speed: 1.35, heal: 0.25, burn: 1.2, desc: 'Gallops as a rainbow comet (pierces, 220% damage). Its rainbow road then heals the team 25% and burns every enemy on it for 120% ATK.' },
      passive: { name: 'LUCKY HORN', desc: '+20% critical hit chance and 15% more coins.' },
      mods: { crit: 0.2, coinFind: 0.15 } },

    // ------------------------------------------------------------------ VOID
    { id: 'oblivion', name: 'OBLIVION', faction: 'void', cls: 'mage', rarity: 'HR', move: 'bounce',
      tag: 'A black hole wearing a ball as a disguise.',
      look: { body: 'sphere', base: 0x050208, glow: 0xff2a4d, eye: 0xff6a3a, eyeType: 'mono', pattern: 'cracks', extra: ['rings'], sig: 'gravityLens' },
      combo: { name: 'GRAVITY WELL', kind: 'gravityWell', power: 1.1, r: 6, desc: 'Drags the enemies nearby into OBLIVION and crushes them for 110% ATK.' },
      hyper: { name: 'EVENT HORIZON', kind: 'blackhole', charge: 13, power: 2.2, delay: 1, desc: 'Pulls every enemy toward the centre for 220% ATK and delays their attacks by 1 turn.' },
      passive: { name: 'SINGULARITY', desc: 'Deals 30% more damage to bosses.' },
      mods: { dmgBoss: 0.3 } },
    { id: 'dreadcore', name: 'DREADCORE', faction: 'void', cls: 'warrior', rarity: 'SS', move: 'pierce',
      tag: 'Abyssal war machine. Gets angrier with every kill.',
      look: { body: 'dodeca', base: 0x1a0508, glow: 0xff2a4d, eye: 0xffd23a, eyeType: 'twin', pattern: 'cracks', extra: ['horns'], sig: 'warMachine' },
      combo: { name: 'HELLFIRE', kind: 'hellfire', power: 1.0, n: 5, desc: 'Hellfire erupts under 5 random enemies for 100% ATK each.' },
      hyper: { name: 'APOCALYPSE', kind: 'apocalypse', charge: 12, power: 3, speed: 1.2, boom: 1, desc: 'Triple damage this turn — and every enemy it destroys explodes for 100% ATK to its neighbours.' },
      passive: { name: 'CARNAGE ENGINE', desc: '+8% damage for every enemy destroyed this battle (up to 10 stacks).' },
      mods: { killStack: 0.08 } },
    { id: 'leviathan', name: 'LEVIATHAN', faction: 'void', cls: 'tank', rarity: 'A', move: 'bounce',
      tag: 'Something huge that lives under the deep web’s data ocean.',
      look: { body: 'dodeca', base: 0x100410, glow: 0xff2a4d, eye: 0x19e6ff, eyeType: 'mono', pattern: 'scales', extra: [], sig: 'tentacles' },
      combo: { name: 'WHIRLPOOL', kind: 'whirlpool', power: 0.5, r: 6.5, desc: 'A whirlpool spins twice around LEVIATHAN: 2 × 50% ATK to every enemy in reach.' },
      hyper: { name: 'TIDAL WAVE', kind: 'tidalWave', charge: 12, power: 1.8, delay: 1, desc: 'A giant wave sweeps the arena: 180% ATK to every enemy, pushing them back; all of them lose a turn.' },
      passive: { name: 'ABYSSAL HIDE', desc: 'The whole team takes 12% less damage.' },
      mods: { teamArmor: 0.12 } },
    { id: 'hollow', name: 'HOLLOW', faction: 'void', cls: 'ranger', rarity: 'R', move: 'pierce',
      tag: 'An empty shell that shoots whatever it used to be.',
      look: { body: 'ico', base: 0x120408, glow: 0xff6a3a, eye: 0xffffff, eyeType: 'none', pattern: 'cracks', extra: ['wisps'], sig: 'mask' },
      combo: { name: 'SHADOW CLONE', kind: 'shadowClone', power: 1.2, desc: 'A shadow clone dashes through the nearest enemy and everything behind it for 120% ATK.' },
      hyper: { name: 'NIGHTFALL', kind: 'bomb', charge: 10, power: 1.0, desc: 'Every enemy hit this turn explodes: its neighbours take 100% of the hit’s damage.' },
      passive: { name: 'EXECUTIONER', desc: 'Deals 25% more damage to enemies below 50% HP.' },
      mods: { execute: 0.25 } },
  ];
  // Two extra abilities per hero, unlocked at level 20 and level 40.
  // Their `mods` stack on top of the passive (see js/rpg-kampf.js for what each key does).
  const s = (lvl, name, desc, mods) => ({ lvl, name, desc, mods });
  const SKILLS = {
    aegis: [s(20, 'REINFORCED CORE', 'AEGIS-7 adds 25% more HP to the team pool.', { hpUp: 0.25 }),
      s(40, 'COUNTER FIELD', 'Enemies take 30% of the damage they deal to the team right back.', { counter: 0.3 })],
    lux: [s(20, 'BLAZING TRAIL', 'Every enemy LUX LANCER pierces speeds it up by 8% instead of slowing it down.', { pierceBoost: 0.08 }),
      s(40, 'SUNFORGED', '+25% ATK.', { atkUp: 0.25 })],
    halcyon: [s(20, 'SOOTHING LIGHT', 'The team regenerates 2% HP at the start of every turn.', { regen: 0.02 }),
      s(40, 'MIRACLE CODE', '50% chance for AFTERGLOW to fire twice.', { comboEcho: 0.5 })],
    voltage: [s(20, 'STATIC WALLS', 'Every wall bounce releases a shock that hits enemies nearby for 40% ATK (up to 5 per turn).', { wallShock: 0.4 }),
      s(40, 'SUPERCONDUCTOR', 'Starts every battle with its HYPER charged 4 turns further.', { startCharge: 4 })],
    bastion: [s(20, 'BULWARK PROTOCOL', 'Every wave starts with a 25% team shield.', { shieldStart: 0.25 }),
      s(40, 'FORTRESS HEART', 'BASTION adds 40% more HP to the team pool.', { hpUp: 0.4 })],
    scrapjaw: [s(20, 'SHRAPNEL', 'Every hit sprays shrapnel: enemies close by take 35% of the hit’s damage.', { splash: 0.35 }),
      s(40, 'BERSERK SERVOS', '+50% damage while the team is below 30% HP.', { lastStand: 0.5 })],
    pyro: [s(20, 'HOT SHOTS', 'FIREWORKS deals another 30% more damage.', { comboPower: 0.3 }),
      s(40, 'INFERNO', 'NAPALM RAIN hits 40% harder.', { hyperPower: 0.4 })],
    ramcore: [s(20, 'HEAVY IMPACT', 'Every enemy it hits has a 20% chance (once per turn) to lose 1 turn.', { delayHit: 0.2 }),
      s(40, 'IRON RAM', '+30% ATK.', { atkUp: 0.3 })],
    decibel: [s(20, 'FEEDBACK LOOP', 'Every wall bounce releases a sound wave that hits enemies nearby for 30% ATK (up to 5 per turn).', { wallShock: 0.3 }),
      s(40, 'ENCORE', '60% chance for BASS DROP to play twice.', { comboEcho: 0.6 })],
    spore: [s(20, 'SPORE BURST', 'Every destroyed enemy heals the team for 3%.', { healOnKill: 0.03 }),
      s(40, 'ANCIENT ROOTS', 'Every wave starts with a 20% team shield.', { shieldStart: 0.2 })],
    viper: [s(20, 'TOXIC TIPS', 'Deals 30% more damage to enemies below 50% HP.', { execute: 0.3 }),
      s(40, 'COLD BLOOD', '+20% critical hit chance.', { crit: 0.2 })],
    mossback: [s(20, 'THICK BARK', 'MOSSBACK adds 30% more HP to the team pool.', { hpUp: 0.3 }),
      s(40, 'THORN SHELL', 'Enemies take 35% of the damage they deal to the team right back.', { counter: 0.35 })],
    thornlash: [s(20, 'RAMPANT GROWTH', 'Every enemy THORNLASH pierces speeds it up by 6%.', { pierceBoost: 0.06 }),
      s(40, 'CARNIVORE', 'Every enemy THORNLASH destroys charges its HYPER by 1 turn.', { killRefund: 1 })],
    hexwraith: [s(20, 'CURSE WEAVE', 'HEX CROSS deals 30% more damage.', { comboPower: 0.3 }),
      s(40, 'LICH FORM', 'SOUL SIPHON hits 50% harder.', { hyperPower: 0.5 })],
    nullblade: [s(20, 'SHADOW STEP', '+15% SPD.', { speed: 0.15 }),
      s(40, 'THOUSAND CUTS', '+25% critical hit chance.', { crit: 0.25 })],
    widow: [s(20, 'SILK LINES', 'Grabs orbs from much further away and finds 20% more coins.', { magnet: 1.5, coinFind: 0.2 }),
      s(40, 'VENOM NEST', 'Every hit sprays venom: enemies close by take 40% of the hit’s damage.', { splash: 0.4 })],
    reaper: [s(20, 'HARVEST MOON', 'Every enemy REAPER.SYS destroys charges its HYPER by 1 turn.', { killRefund: 1 }),
      s(40, 'DEATH TOLL', 'Deals 40% more damage to enemies below 50% HP.', { execute: 0.4 })],
    seraphine: [s(20, 'HALO SHIELD', 'Every wave starts with a 25% team shield.', { shieldStart: 0.25 }),
      s(40, 'RESURRECTION PATCH', 'The team regenerates 3% HP per turn and DIVINE PATCH starts 3 turns closer.', { regen: 0.03, startCharge: 3 })],
    arc: [s(20, 'TARGET LOCK', 'The first enemy hit every turn takes double damage.', { firstHit: true }),
      s(40, 'SATELLITE UPLINK', 'Starts every battle with ORBITAL STRIKE charged 5 turns further.', { startCharge: 5 })],
    aurora: [s(20, 'SPECTRUM', '40% chance for PRISM SPLIT to fire twice.', { comboEcho: 0.4 }),
      s(40, 'RADIANCE', 'NORTHERN LIGHTS hits 50% harder.', { hyperPower: 0.5 })],
    valkyrie: [s(20, 'WINGED CHARGE', 'Every enemy VALKYRIE pierces speeds it up by 10%.', { pierceBoost: 0.1 }),
      s(40, 'EINHERJAR', '+60% damage while the team is below 30% HP.', { lastStand: 0.6 })],
    oblivion: [s(20, 'GRAVITY LENS', 'Every hit crushes enemies close by for 45% of the hit’s damage.', { splash: 0.45 }),
      s(40, 'EVENT CASCADE', 'Every enemy it hits has a 25% chance (once per turn) to lose 1 turn.', { delayHit: 0.25 })],
    dreadcore: [s(20, 'BLOODLUST', 'Heals the team for 4% of all damage DREADCORE deals.', { lifesteal: 0.04 }),
      s(40, 'DOOMSDAY ENGINE', '+35% ATK.', { atkUp: 0.35 })],
    leviathan: [s(20, 'UNDERTOW', 'Loses 25% less speed while rolling, so it travels much further.', { bounceKeep: 0.25 }),
      s(40, 'ABYSSAL ARMOR', 'Enemies take 30% of the damage they deal to the team right back.', { counter: 0.3 })],
    unicore: [s(20, 'RAINBOW ROAD', 'Every destroyed enemy heals the team for 3% and UNICORE gallops 10% faster.', { healOnKill: 0.03, speed: 0.1 }),
      s(40, 'WISH UPON A STAR', 'STARFALL drops 3 extra shooting stars.', { comboN: 3 })],
    hollow: [s(20, 'SOUL MAGNET', 'Grabs orbs from further away and finds 25% more coins.', { magnet: 1, coinFind: 0.25 }),
      s(40, 'NIGHT HUNTER', '+20% critical hit chance and +10% ATK.', { crit: 0.2, atkUp: 0.1 })],
  };
  HEROES.forEach((h) => { h.skills = SKILLS[h.id] || []; });

  // Signature relics: unlock by themselves at level 30. The rarer the ball, the stronger its relic.
  const r = (name, desc, mods) => ({ name, desc, mods, lvl: RELIC_LVL });
  const RELICS = {
    // C
    aegis: r('PALADIN CORE', 'AEGIS-7 adds 12% more HP to the team pool and the team takes 5% less damage.', { hpUp: 0.12, teamArmor: 0.05 }),
    pyro: r('BURNT GUITAR PICK', 'FIREWORKS launches 2 extra rockets.', { comboN: 2 }),
    spore: r('SEED VAULT', 'Every wave starts with a 10% team shield and the team regenerates another 1% HP per turn.', { shieldStart: 0.1, regen: 0.01 }),
    scrapjaw: r('RUSTY FLYWHEEL', '+12% SPD and +10% ATK.', { speed: 0.12, atkUp: 0.1 }),
    // R
    viper: r('VENOM GLAND', 'Every hit poisons the enemy: it takes 30% ATK at the start of the next 2 enemy turns.', { poison: 0.3 }),
    decibel: r('GOLDEN MIC', 'Whenever BASS DROP plays, DECIBEL’s HYPER charges 1 turn (once per turn).', { comboCharge: 1 }),
    widow: r('SILK SPINNERET', 'WEB SNARE fires 3 extra shots and +10% critical hit chance.', { comboN: 3, crit: 0.1 }),
    hollow: r('HOLLOW MASK', 'Critical hits deal 50% more damage and +10% critical hit chance.', { critDmg: 0.5, crit: 0.1 }),
    // E
    mossback: r('ELDER ACORN', 'MOSSBACK adds 20% more HP to the team pool and every wave starts with a 15% shield.', { hpUp: 0.2, shieldStart: 0.15 }),
    ramcore: r('BATTERING RAM', '+10% damage for every wall bounce this turn (up to 6) and +15% ATK.', { wallPower: 0.1, atkUp: 0.15 }),
    halcyon: r('LANTERN OF MERCY', 'Every heal from HALCYON is 50% stronger and the team regenerates 1% HP per turn.', { healPower: 0.5, regen: 0.01 }),
    reaper: r('SOUL LEDGER', 'Enemies below 15% HP that REAPER.SYS hits are executed on the spot (bosses excluded).', { reap: 0.15 }),
    // A
    lux: r('SUNFORGED LANCE', '+20% SPD and +20% ATK.', { speed: 0.2, atkUp: 0.2 }),
    thornlash: r('MOTHER SEED', 'Every enemy it hits has a 25% chance (once per turn) to lose 1 turn, and THORNLASH heals the team for another 4% of its damage.', { delayHit: 0.25, lifesteal: 0.04 }),
    voltage: r('TESLA COIL', 'Every wall bounce fires a lightning bolt at a random enemy for 50% ATK (up to 8 per turn).', { wallBolt: 0.5 }),
    leviathan: r('ABYSSAL PEARL', 'LEVIATHAN adds 30% more HP to the team pool and every wave starts with a 20% shield.', { hpUp: 0.3, shieldStart: 0.2 }),
    // S
    hexwraith: r('CURSED GRIMOIRE', 'Every hit curses the enemy: cursed enemies take 25% more damage from everything.', { curse: 0.25 }),
    nullblade: r('ZERO-DAY KEY', '+25% SPD, +15% critical hit chance and critical hits deal 60% more damage.', { speed: 0.25, crit: 0.15, critDmg: 0.6 }),
    aurora: r('HEART OF THE PRISM', 'PRISM SPLIT fires in all 8 directions and deals 40% more damage.', { comboKind: 'laser4', comboPower: 0.4 }),
    // SS
    bastion: r('CITADEL CORE', 'Every wave starts with a 30% shield, the team takes 10% less damage and enemies take 30% of their damage back.', { shieldStart: 0.3, teamArmor: 0.1, counter: 0.3 }),
    valkyrie: r('BIFRÖST WINGS', '+30% SPD, +25% ATK and every enemy it pierces speeds it up by 6%.', { speed: 0.3, atkUp: 0.25, pierceBoost: 0.06 }),
    dreadcore: r('HEART OF THE ABYSS', 'CARNAGE ENGINE stacks up to 20 times, +20% ATK and every kill heals the team for 2%.', { killCap: 10, atkUp: 0.2, healOnKill: 0.02 }),
    // SSS
    seraphine: r('HALO OF THE FIRST CODE', 'Once per battle a lethal blow is cancelled and the team is restored to 60% HP. +2% HP regeneration per turn.', { revive: 0.6, regen: 0.02 }),
    arc: r('ORBITAL UPLINK', 'At the start of every turn ARC ANGEL’s satellite fires an orbital beam at a random enemy for 80% ATK.', { satellite: 0.8 }),
    // HR
    unicore: r('HORN OF WISHES', 'Once per battle a lethal blow is cancelled and the team is restored to 50% HP. Critical hits deal 30% more damage and RAINBOW DASH starts 4 turns charged.', { revive: 0.5, critDmg: 0.3, startCharge: 4 }),
    oblivion: r('SINGULARITY SEED', 'Every hit tears open a micro black hole: enemies close by are dragged in and take 60% of the hit’s damage. EVENT HORIZON hits 50% harder and starts 3 turns charged.', { gravHit: 0.6, hyperPower: 0.5, startCharge: 3 }),
  };
  HEROES.forEach((h) => { h.relic = RELICS[h.id]; });

  // passive + every ability (and the relic) unlocked at this level, merged (numbers add up, flags switch on)
  function heroMods(def, lvl) {
    const out = Object.assign({}, def.mods || {});
    def.skills.concat(def.relic ? [def.relic] : []).forEach((sk) => {
      if (lvl < sk.lvl) return;
      Object.keys(sk.mods).forEach((k) => {
        const v = sk.mods[k];
        out[k] = typeof v === 'number' ? (out[k] || 0) + v : v || out[k];
      });
    });
    return out;
  }

  const HERO = {};
  HEROES.forEach((h) => { HERO[h.id] = h; });

  // ------------------------------------------------------------- textures
  // white-on-black emissive patterns wrapped around the ball (equirectangular)
  function seeded(seed) {
    let s = seed >>> 0 || 1;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  const PATTERNS = {
    plates(g, W, H) {
      g.lineWidth = 4;
      for (let y = H / 6; y < H; y += H / 6) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
      for (let x = 0; x < W; x += W / 8) { g.beginPath(); g.moveTo(x, H * 0.18); g.lineTo(x, H * 0.82); g.stroke(); }
      for (let x = W / 16; x < W; x += W / 8) {
        for (let y = H / 4; y < H * 0.8; y += H / 6) { g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill(); }
      }
    },
    stripes(g, W, H) {
      [[0.3, 6], [0.38, 2], [0.5, 14], [0.62, 2], [0.7, 6]].forEach(([k, w]) => g.fillRect(0, H * k - w / 2, W, w));
      for (let x = 0; x < W; x += W / 12) g.fillRect(x, H * 0.47, 10, H * 0.06);
    },
    circuit(g, W, H, rnd) {
      g.lineWidth = 3;
      for (let i = 0; i < 26; i++) {
        let x = rnd() * W, y = H * (0.2 + rnd() * 0.6);
        g.beginPath();
        g.moveTo(x, y);
        for (let s = 0; s < 4; s++) {
          if (s % 2) y += (rnd() - 0.5) * 50; else x += (rnd() - 0.3) * 80;
          g.lineTo(x, y);
        }
        g.stroke();
        g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill();
      }
    },
    hazard(g, W, H) {
      g.save();
      g.beginPath();
      g.rect(0, H * 0.42, W, H * 0.16);
      g.clip();
      for (let x = -H; x < W + H; x += 40) {
        g.beginPath(); g.moveTo(x, H); g.lineTo(x + 20, H); g.lineTo(x + 20 + H, 0); g.lineTo(x + H, 0); g.closePath(); g.fill();
      }
      g.restore();
      g.lineWidth = 3;
      for (let y of [H * 0.25, H * 0.75]) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    },
    cracks(g, W, H, rnd) {
      g.lineCap = 'round';
      for (let k = 0; k < 22; k++) {
        let x = rnd() * W, y = H * (0.1 + rnd() * 0.8);
        g.lineWidth = 2 + rnd() * 5;
        g.beginPath();
        g.moveTo(x, y);
        for (let s = 0; s < 6; s++) { x += (rnd() - 0.5) * 70; y += (rnd() - 0.5) * 34; g.lineTo(x, y); }
        g.stroke();
      }
    },
    dots(g, W, H, rnd) {
      for (let i = 0; i < 60; i++) {
        g.globalAlpha = 0.5 + rnd() * 0.5;
        g.beginPath(); g.arc(rnd() * W, H * (0.12 + rnd() * 0.76), 3 + rnd() * 9, 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1;
    },
    scales(g, W, H) {
      g.lineWidth = 3;
      const s = 20, hw = Math.sqrt(3) * s;
      for (let row = 0; row * s * 1.5 < H + s; row++) {
        for (let x = (row % 2) * hw / 2; x < W + hw; x += hw) {
          g.beginPath();
          for (let k = 0; k < 6; k++) {
            const a = Math.PI / 6 + (k * Math.PI) / 3;
            const px = x + Math.cos(a) * (s - 3), py = row * s * 1.5 + Math.sin(a) * (s - 3);
            if (k) g.lineTo(px, py); else g.moveTo(px, py);
          }
          g.closePath();
          g.stroke();
        }
      }
    },
    runes(g, W, H, rnd) {
      g.lineWidth = 3;
      g.lineCap = 'round';
      for (let x = 12; x < W; x += 34) {
        for (const y of [H * 0.36, H * 0.56]) {
          g.beginPath();
          for (let s = 0; s < 3; s++) {
            const x0 = x + rnd() * 18, y0 = y + rnd() * 26;
            g.moveTo(x0, y0);
            g.lineTo(x0 + (rnd() - 0.5) * 20, y0 + (rnd() - 0.5) * 20);
          }
          g.stroke();
        }
      }
      g.fillRect(0, H * 0.48, W, 3);
    },
    stars(g, W, H, rnd) {
      for (let i = 0; i < 34; i++) {
        const x = rnd() * W, y = H * (0.15 + rnd() * 0.7), r = 5 + rnd() * 9;
        g.globalAlpha = 0.55 + rnd() * 0.45;
        g.beginPath();
        for (let k = 0; k <= 10; k++) {
          const a = -Math.PI / 2 + (k / 10) * Math.PI * 2, rr = k % 2 ? r * 0.42 : r;
          if (k) g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); else g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        }
        g.fill();
      }
      g.globalAlpha = 1;
    },
  };

  const patternCache = {};
  function patternTex(name) {
    if (patternCache[name]) return patternCache[name];
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, 512, 256);
    g.fillStyle = g.strokeStyle = '#fff';
    (PATTERNS[name] || PATTERNS.plates)(g, 512, 256, seeded(name.length * 7919 + name.charCodeAt(0)));
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 4;
    patternCache[name] = t;
    return t;
  }

  let diskTexCache = null;
  function diskTex() {
    if (diskTexCache) return diskTexCache;
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(0.62, 'rgba(0,0,0,0)');
    grd.addColorStop(0.66, 'rgba(255,220,200,1)');
    grd.addColorStop(0.76, 'rgba(255,70,60,0.8)');
    grd.addColorStop(1, 'rgba(120,0,40,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
    diskTexCache = new THREE.CanvasTexture(c);
    return diskTexCache;
  }

  // --------------------------------------------------------------- models
  const HR = 0.62;   // hero ball radius
  const geoCache = {};
  const geo = (key, make) => geoCache[key] || (geoCache[key] = make());

  const BODY = {
    sphere: () => geo('b_sphere', () => new THREE.SphereGeometry(HR, 48, 32)),
    ico: () => geo('b_ico', () => new THREE.IcosahedronGeometry(HR * 1.08, 1)),
    dodeca: () => geo('b_dodeca', () => new THREE.DodecahedronGeometry(HR * 1.12, 0)),
    octa: () => geo('b_octa', () => new THREE.OctahedronGeometry(HR * 1.22, 0)),
  };
  // distance from the centre to the surface in front (+x) at height y / depth z
  function frontX(body, y, z) {
    if (body === 'octa') return HR * 1.22 - Math.abs(y) - Math.abs(z);
    const r = body === 'sphere' ? HR : HR * 0.98;
    return Math.sqrt(Math.max(0.01, r * r - y * y - z * z));
  }

  function metal(color, glow, k) {
    return new THREE.MeshStandardMaterial({ color, metalness: 0.8, roughness: 0.3, emissive: glow || 0x000000, emissiveIntensity: k || 0 });
  }
  const basic = (color, extra) => new THREE.MeshBasicMaterial(Object.assign({ color }, extra || {}));
  const additive = (color, opacity) => new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: opacity === undefined ? 1 : opacity, blending: THREE.AdditiveBlending, depthWrite: false,
  });

  function extrudeFlat(pts, depth) {
    const s = new THREE.Shape();
    pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false });
    g.translate(0, 0, -depth / 2);
    return g;
  }

  // ---------------------------------------------------- signature looks
  // Every hero wears one big, unmistakable feature with its own animation.
  const texCache = {};
  function canvasTex(key, w, h, draw) {
    if (texCache[key]) return texCache[key];
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d'), w, h);
    texCache[key] = new THREE.CanvasTexture(c);
    return texCache[key];
  }
  const plusTex = () => canvasTex('plus', 32, 32, (g) => { g.fillStyle = '#fff'; g.fillRect(12, 4, 8, 24); g.fillRect(4, 12, 24, 8); });
  const runeTex = (i) => canvasTex('rune' + i, 32, 32, (g) => {
    const rnd = seeded(i * 97 + 5);
    g.strokeStyle = '#fff';
    g.lineWidth = 3;
    g.lineCap = 'round';
    g.beginPath();
    for (let k = 0; k < 3; k++) { const x = 6 + rnd() * 20, y = 4 + rnd() * 24; g.moveTo(x, y); g.lineTo(6 + rnd() * 20, 4 + rnd() * 24); }
    g.stroke();
  });
  const pageTex = () => canvasTex('page', 64, 80, (g, w, h) => {
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#fff';
    g.lineWidth = 2;
    for (let y = 10; y < h - 6; y += 9) { g.beginPath(); g.moveTo(8, y); g.lineTo(8 + Math.random() * 44, y); g.stroke(); }
  });
  const panelTex = () => canvasTex('solar', 128, 64, (g, w, h) => {
    g.fillStyle = '#0a1a3a';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#19e6ff';
    g.lineWidth = 2;
    for (let x = 0; x <= w; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 0; y <= h; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  });
  const ribbonTex = () => canvasTex('ribbon', 16, 128, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, 'rgba(255,60,242,0)');
    grd.addColorStop(0.3, 'rgba(255,60,242,0.9)');
    grd.addColorStop(0.65, 'rgba(61,255,122,0.9)');
    grd.addColorStop(1, 'rgba(25,230,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  });
  const spiralTex = () => canvasTex('spiral', 64, 64, (g, w, h) => {
    g.fillStyle = '#fff6d8';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffc933';
    for (let k = -2; k < 4; k++) { g.beginPath(); g.moveTo(k * 22, h); g.lineTo(k * 22 + 10, h); g.lineTo(k * 22 + 10 + h, 0); g.lineTo(k * 22 + h, 0); g.fill(); }
  });
  const tube = (pts, r, seg) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z))), seg || 24, r, 6, false);
  const RAINBOW = [0xff3a5a, 0xff9a1f, 0xffe23a, 0x3dff7a, 0x19c6ff, 0x7a5cff, 0xff5cf0];
  // a floating sprite with a plain texture
  const spr = (map, color, size, additiveBlend) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color, transparent: true, depthWrite: false, blending: additiveBlend ? THREE.AdditiveBlending : THREE.NormalBlending }));
    s.scale.setScalar(size);
    return s;
  };
  // a chain of joints that can wave (vines, tentacles, tails)
  function jointChain(parent, n, len, segGeo, mat, extra) {
    const joints = [];
    let p = parent;
    for (let k = 0; k < n; k++) {
      const j = new THREE.Group();
      j.position.y = k ? len : 0;
      const seg = new THREE.Mesh(segGeo, mat);
      seg.scale.setScalar(1 - k * (0.6 / n));
      j.add(seg);
      if (extra) extra(j, k);
      p.add(j);
      p = j;
      joints.push(j);
    }
    return joints;
  }

  const SIGS = {
    // AEGIS-7: three hex shield drones orbiting it
    aegisShields({ group, anim, L }) {
      const orbit = new THREE.Group();
      const hexGeo = geo('aegisHex', () => { const c = new THREE.CylinderGeometry(0.34, 0.34, 0.05, 6); c.rotateZ(Math.PI / 2); return c; });
      const plateMat = new THREE.MeshStandardMaterial({ color: 0x1a1e30, metalness: 0.85, roughness: 0.25, emissive: L.glow, emissiveMap: patternTex('scales'), emissiveIntensity: 0.75 });
      const edgeMat = new THREE.LineBasicMaterial({ color: L.glow });
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2, p = new THREE.Group();
        p.add(new THREE.Mesh(hexGeo, plateMat), new THREE.LineSegments(geo('aegisHexEdge', () => new THREE.EdgesGeometry(hexGeo)), edgeMat));
        p.position.set(Math.cos(a) * 1.02, 0.05, Math.sin(a) * 1.02);
        p.rotation.y = -a;
        orbit.add(p);
      }
      group.add(orbit);
      anim.push((dt, t) => { orbit.rotation.y += dt * 0.7; orbit.position.y = Math.sin(t * 1.8) * 0.05; });
    },
    // LUX LANCER: a lance of light and a sun disc of rays behind it
    solarLance({ face, anim, L, glowMat, hull }) {
      const lance = new THREE.Group();
      const shaft = new THREE.Mesh(geo('lanceShaft', () => { const c = new THREE.ConeGeometry(0.11, 1.3, 10); c.rotateZ(-Math.PI / 2); return c; }), glowMat);
      shaft.position.x = 0.95;
      const guard = new THREE.Mesh(geo('lanceGuard', () => { const t = new THREE.TorusGeometry(0.19, 0.045, 6, 20); t.rotateY(Math.PI / 2); return t; }), hull);
      guard.position.x = 0.32;
      const tip = M.glow(L.glow, 0.8, 0.9);
      tip.position.x = 1.62;
      lance.add(shaft, guard, tip);
      lance.position.set(0, -0.2, 0.46);
      face.add(lance);
      const sun = new THREE.Group();
      const rayGeo = geo('sunRay', () => new THREE.BoxGeometry(0.035, 0.46, 0.035));
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2, r = new THREE.Mesh(rayGeo, glowMat);
        r.position.set(0, Math.cos(a) * 0.98, Math.sin(a) * 0.98);
        r.rotation.x = a;
        sun.add(r);
      }
      sun.position.x = -0.5;
      face.add(sun);
      anim.push((dt, t) => { sun.rotation.x += dt * 0.8; lance.position.x = Math.sin(t * 2.4) * 0.05; });
    },
    // HALCYON: a swinging medic lantern; healing crosses drift up
    lantern({ group, anim, L, hull }) {
      const g = new THREE.Group();
      const cage = new THREE.LineSegments(geo('lanternCage', () => new THREE.EdgesGeometry(new THREE.BoxGeometry(0.32, 0.42, 0.32))), new THREE.LineBasicMaterial({ color: L.glow }));
      const core = new THREE.Mesh(geo('lanternCore', () => new THREE.OctahedronGeometry(0.12, 0)), basic(0xffffff));
      const chain = new THREE.Mesh(geo('lanternChain', () => new THREE.CylinderGeometry(0.012, 0.012, 0.4, 4)), hull);
      chain.position.y = 0.41;
      g.add(cage, core, chain, M.glow(L.glow, 1.5, 0.8));
      g.position.set(0.12, HR + 0.6, 0);
      group.add(g);
      const crosses = [0, 1, 2, 3].map(() => { const s = spr(plusTex(), 0x8dff2a, 0.24, true); group.add(s); return s; });
      anim.push((dt, t) => {
        g.rotation.z = Math.sin(t * 1.7) * 0.2;
        core.rotation.y += dt * 3;
        crosses.forEach((s, i) => {
          const k = (t * 0.45 + i / 4) % 1;
          s.position.set(Math.sin(i * 2.1 + t * 0.6) * 0.65, 0.1 + k * 1.5, Math.cos(i * 2.1 + t * 0.6) * 0.65);
          s.material.opacity = 1 - k;
        });
      });
    },
    // VOLTAGE: two tesla coils with a live arc between them
    teslaCoils({ face, anim, L, glowMat, hull }) {
      const group = face;   // the coils sit on its shoulders and turn with it
      const tipsAt = [];
      [-1, 1].forEach((s) => {
        const coil = new THREE.Group();
        const pole = new THREE.Mesh(geo('coilPole', () => new THREE.CylinderGeometry(0.04, 0.06, 0.55, 8)), hull);
        pole.position.y = 0.27;
        coil.add(pole);
        for (let k = 0; k < 3; k++) {
          const r = new THREE.Mesh(geo('coilRing', () => { const t = new THREE.TorusGeometry(0.1, 0.022, 6, 16); t.rotateX(Math.PI / 2); return t; }), glowMat);
          r.position.y = 0.1 + k * 0.14;
          coil.add(r);
        }
        const tip = new THREE.Mesh(geo('coilTip', () => new THREE.SphereGeometry(0.08, 10, 8)), basic(0xffffff));
        tip.position.y = 0.6;
        const tg = M.glow(L.glow, 0.7, 0.9);
        tg.position.y = 0.6;
        coil.add(tip, tg);
        coil.position.set(-0.05, HR * 0.62, s * 0.4);
        coil.rotation.x = s * 0.55;
        group.add(coil);
        tipsAt.push(new THREE.Vector3(-0.05, HR * 0.62 + 0.6 * Math.cos(0.55), s * (0.4 + 0.6 * Math.sin(0.55))));
      });
      const N = 9, pos = new Float32Array(N * 3);
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const arc = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xdffbff }));
      group.add(arc);
      anim.push(() => {
        const [a, b] = tipsAt;
        arc.visible = Math.random() > 0.25;
        for (let i = 0; i < N; i++) {
          const k = i / (N - 1), j = i && i < N - 1 ? 1 : 0;
          pos[i * 3] = a.x + (b.x - a.x) * k + (Math.random() - 0.5) * 0.14 * j;
          pos[i * 3 + 1] = a.y + (b.y - a.y) * k + Math.sin(k * Math.PI) * 0.18 + (Math.random() - 0.5) * 0.14 * j;
          pos[i * 3 + 2] = a.z + (b.z - a.z) * k;
        }
        lg.attributes.position.needsUpdate = true;
      });
    },
    // BASTION: castle battlements, a banner and a tower shield
    citadel({ face, group, anim, L, hull }) {
      const stone = metal(0x2e3448, L.glow, 0.15);
      const merlon = geo('merlon', () => new THREE.BoxGeometry(0.16, 0.2, 0.16));
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2, m = new THREE.Mesh(merlon, stone);
        m.position.set(Math.cos(a) * 0.42, HR + 0.04, Math.sin(a) * 0.42);
        m.rotation.y = -a;
        group.add(m);
      }
      const pole = new THREE.Mesh(geo('flagPole', () => new THREE.CylinderGeometry(0.015, 0.015, 0.8, 6)), hull);
      pole.position.set(-0.05, HR + 0.4, 0);
      const flag = new THREE.Mesh(geo('flag', () => { const p = new THREE.PlaneGeometry(0.4, 0.24); p.translate(-0.2, 0, 0); return p; }), new THREE.MeshBasicMaterial({ color: L.glow, side: THREE.DoubleSide }));
      flag.position.set(-0.05, HR + 0.66, 0);
      group.add(pole, flag);
      const shield = new THREE.Mesh(geo('towerShield', () => new THREE.BoxGeometry(0.08, 1.05, 0.62)), new THREE.MeshStandardMaterial({
        color: 0x1a1e30, metalness: 0.85, roughness: 0.3, emissive: L.glow, emissiveMap: patternTex('plates'), emissiveIntensity: 0.6,
      }));
      shield.position.set(frontX('dodeca', 0, 0) + 0.3, -0.05, 0.1);
      face.add(shield);
      anim.push((dt, t) => { flag.rotation.y = Math.sin(t * 4) * 0.35; shield.position.y = -0.05 + Math.sin(t * 2) * 0.03; });
    },
    // SCRAPJAW: a buzzsaw on its side and a chomping jaw
    buzzsaw({ face, anim, L, glowMat }) {
      const saw = new THREE.Group();
      saw.add(new THREE.Mesh(geo('sawDisc', () => { const c = new THREE.CylinderGeometry(0.42, 0.42, 0.04, 28); c.rotateX(Math.PI / 2); return c; }), metal(0x9aa0b0, L.glow, 0.2)));
      const tooth = geo('sawTooth', () => { const c = new THREE.ConeGeometry(0.06, 0.15, 4); c.translate(0, 0.47, 0); return c; });
      for (let i = 0; i < 16; i++) { const tth = new THREE.Mesh(tooth, glowMat); tth.rotation.z = (i / 16) * Math.PI * 2; saw.add(tth); }
      saw.position.set(0.2, HR * 0.5, 0.56);
      face.add(saw);
      const jaw = new THREE.Group();
      jaw.add(new THREE.Mesh(geo('jaw', () => new THREE.SphereGeometry(HR * 1.08, 20, 8, Math.PI - 0.9, 1.8, 1.95, 0.85)), metal(0x4a3526, L.glow, 0.3)));
      const fang = geo('fang', () => new THREE.ConeGeometry(0.035, 0.13, 4));
      for (let i = 0; i < 5; i++) {
        const f = new THREE.Mesh(fang, basic(0xfff0d0));
        const a = -0.5 + i * 0.25;
        f.position.set(Math.cos(a) * HR * 0.92, -0.2, Math.sin(a) * HR * 0.92);
        jaw.add(f);
      }
      face.add(jaw);
      anim.push((dt, t) => { saw.rotation.z -= dt * 14; jaw.rotation.z = -Math.max(0, Math.sin(t * 5)) * 0.28; });
    },
    // PYRO-PUNK: a flying-V guitar on its back
    // (slung across its side: the V body low at the front, the neck up over its back)
    flameGuitar({ face, anim, hull }) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(geo('vGuitar', () => extrudeFlat([[0, 0], [0.55, 0.22], [0.66, 0.12], [0.24, 0], [0.66, -0.12], [0.55, -0.22]], 0.07)), metal(0x3a0808, 0xff3a1a, 0.9));
      const neck = new THREE.Mesh(geo('gNeck', () => new THREE.BoxGeometry(0.8, 0.05, 0.04)), hull);
      neck.position.x = -0.4;
      const head = new THREE.Mesh(geo('gHead', () => new THREE.BoxGeometry(0.16, 0.1, 0.05)), metal(0x3a0808, 0xff5a1f, 0.8));
      head.position.x = -0.84;
      const strings = new THREE.Mesh(geo('gStrings', () => new THREE.BoxGeometry(1.1, 0.012, 0.012)), basic(0xffd23a));
      strings.position.set(-0.3, 0, 0.045);
      g.add(body, neck, head, strings);
      g.scale.setScalar(1.2);
      g.position.set(-0.08, 0.02, HR + 0.1);
      g.rotation.z = -0.93;
      face.add(g);
      const flames = [0, 1, 2].map(() => { const f = M.glow(0xff5a1f, 0.4, 0.8); g.add(f); return f; });
      anim.push((dt, t) => {
        g.rotation.z = -0.93 + Math.sin(t * 7) * 0.05;
        flames.forEach((f, i) => { const k = (t * 1.6 + i / 3) % 1; f.position.set(0.3 + Math.sin(i * 2 + t * 5) * 0.15, 0.1 + k * 0.5, 0.05); f.material.opacity = 0.8 * (1 - k); });
      });
    },
    // RAMCORE: curled ram horns, a battering plate and exhaust pipes
    ramHorns({ face, group, anim, L }) {
      const hornMat = metal(0x4a2a1a, L.glow, 0.4);
      [-1, 1].forEach((s) => {
        const pts = [];
        for (let i = 0; i <= 14; i++) {
          const a = (i / 14) * Math.PI * 1.5, r = 0.3 - i * 0.012;
          pts.push([0.05 - Math.sin(a) * r, HR * 0.55 + Math.cos(a) * r * 0.9, s * (HR * 0.72 + i * 0.025)]);
        }
        face.add(new THREE.Mesh(tube(pts, 0.075), hornMat));
      });
      face.add(new THREE.Mesh(geo('ramPlate', () => new THREE.SphereGeometry(HR * 1.07, 20, 10, Math.PI - 0.55, 1.1, 0.85, 1.25)), metal(0x7a808f, L.glow, 0.15)));
      const puffs = [];
      [-1, 1].forEach((s) => {
        const pipe = new THREE.Mesh(geo('pipe', () => new THREE.CylinderGeometry(0.06, 0.07, 0.34, 10)), metal(0x303440, 0x000000, 0));
        pipe.position.set(-HR * 0.6, HR * 0.6, s * 0.22);
        pipe.rotation.z = 0.5;
        face.add(pipe);
        for (let k = 0; k < 3; k++) { const p = M.glow(0x999aa8, 0.5, 0); group.add(p); puffs.push({ p, s, k }); }
      });
      anim.push((dt, t) => puffs.forEach(({ p, s, k }) => {
        const q = (t * 0.8 + k / 3) % 1;
        p.position.set(-HR * 0.8 - q * 0.5, HR * 0.8 + q * 0.6, s * 0.22);
        p.scale.setScalar(0.3 + q * 0.6);
        p.material.opacity = 0.35 * (1 - q);
      }));
    },
    // DECIBEL: a hologram equalizer above its head and headphones
    equalizer({ face, group, anim }) {
      const bars = [];
      const barGeo = geo('eqBar', () => { const c = new THREE.BoxGeometry(0.08, 0.3, 0.05); c.translate(0, 0.15, 0); return c; });
      for (let i = 0; i < 7; i++) {
        const b = new THREE.Mesh(barGeo, additive(RAINBOW[i], 0.95));
        b.position.set((i - 3) * 0.11, HR + 0.34, 0);
        group.add(b);
        bars.push(b);
      }
      const hpMat = metal(0x1a1022, 0xff3cf2, 0.35);
      const band = new THREE.Mesh(geo('headphones', () => new THREE.TorusGeometry(HR * 1.08, 0.045, 6, 24, Math.PI)), hpMat);
      band.rotation.y = Math.PI / 2;
      band.position.set(-0.05, 0.05, 0);
      face.add(band);
      [-1, 1].forEach((s) => {
        const cup = new THREE.Mesh(geo('earCup', () => { const c = new THREE.CylinderGeometry(0.2, 0.2, 0.14, 18); c.rotateX(Math.PI / 2); return c; }), hpMat);
        cup.position.set(-0.05, 0.05, s * (HR + 0.04));
        const pad = new THREE.Mesh(geo('earPad', () => new THREE.CircleGeometry(0.14, 18)), additive(0xff3cf2, 0.9));
        pad.position.z = s * 0.075;
        if (s < 0) pad.rotation.y = Math.PI;
        cup.add(pad);
        face.add(cup);
      });
      anim.push((dt, t) => bars.forEach((b, i) => { b.scale.y = 0.25 + Math.abs(Math.sin(t * 9 + i * 1.3)) * 1.3 * (0.6 + 0.4 * Math.sin(t * 2 + i)); }));
    },
    // SPORE: a big glowing mushroom cap and drifting spores
    mushroom({ group, anim, L }) {
      const cap = new THREE.Mesh(geo('mushCap', () => new THREE.SphereGeometry(0.74, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2.2)), new THREE.MeshStandardMaterial({
        color: 0x2a8a4a, emissive: L.glow, emissiveMap: patternTex('dots'), emissiveIntensity: 0.9, roughness: 0.6,
      }));
      cap.position.y = HR * 0.5;
      cap.scale.y = 0.72;
      group.add(cap);
      [[0.2, 0.5], [-0.35, -0.45]].forEach(([x, z], i) => {
        const m = new THREE.Group();
        const stem = new THREE.Mesh(geo('miniStem', () => new THREE.CylinderGeometry(0.04, 0.05, 0.2, 6)), basic(0xe8ffe0));
        const c = new THREE.Mesh(geo('miniCap', () => new THREE.SphereGeometry(0.12, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2)), basic(i ? 0xff3cf2 : L.glow));
        c.position.y = 0.1;
        m.add(stem, c);
        m.position.set(x, HR * 0.95, z);
        group.add(m);
      });
      const spores = [0, 1, 2, 3, 4].map(() => { const s = M.glow(L.glow, 0.18, 0.8); group.add(s); return s; });
      anim.push((dt, t) => {
        cap.scale.y = 0.72 + Math.sin(t * 2.5) * 0.04;
        spores.forEach((s, i) => { const k = (t * 0.3 + i / 5) % 1; s.position.set(Math.sin(i * 1.7 + t) * 0.8, 0.6 + k * 1.3, Math.cos(i * 1.7 + t) * 0.8); s.material.opacity = 0.9 * (1 - k); });
      });
    },
    // VIPER.EXE: a slithering tail, a cobra hood and fangs
    snakeTail({ face, anim, L, bodyMat }) {
      const segs = [];
      for (let i = 0; i < 7; i++) {
        const s = new THREE.Mesh(geo('tailSeg', () => new THREE.SphereGeometry(0.17, 10, 8)), bodyMat);
        s.scale.setScalar(1 - i * 0.11);
        s.position.set(-HR - 0.05 - i * 0.2, -0.32, 0);
        face.add(s);
        segs.push(s);
      }
      const hood = new THREE.Mesh(geo('hood', () => { const c = new THREE.CircleGeometry(0.75, 20, Math.PI * 0.12, Math.PI * 0.76); c.rotateY(Math.PI / 2); return c; }), new THREE.MeshStandardMaterial({
        color: 0x0e2a18, emissive: L.glow, emissiveMap: patternTex('scales'), emissiveIntensity: 0.75, side: THREE.DoubleSide,
      }));
      hood.position.set(-0.28, 0.05, 0);
      face.add(hood);
      const fang = geo('snakeFang', () => { const c = new THREE.ConeGeometry(0.03, 0.14, 5); c.rotateZ(Math.PI); return c; });
      [-0.08, 0.08].forEach((z) => { const f = new THREE.Mesh(fang, basic(0xffffff)); f.position.set(frontX('ico', -0.15, z) - 0.03, -0.24, z); face.add(f); });
      anim.push((dt, t) => segs.forEach((s, i) => { s.position.z = Math.sin(t * 5 - i * 0.7) * 0.07 * i; s.position.y = -0.32 + Math.sin(t * 3 - i) * 0.03; }));
    },
    // MOSSBACK: a mossy turtle shell with crystals and stubby legs
    turtleShell({ face, anim, L, glowMat }) {
      const shell = new THREE.Mesh(geo('turtleShell', () => new THREE.SphereGeometry(HR * 1.22, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2.3)), new THREE.MeshStandardMaterial({
        color: 0x2a4a22, emissive: L.glow, emissiveMap: patternTex('scales'), emissiveIntensity: 0.6, metalness: 0.3, roughness: 0.6, flatShading: true,
      }));
      shell.position.set(-0.14, 0.02, 0);
      shell.scale.set(1.05, 0.9, 1);
      face.add(shell);
      const cg = geo('shellCrystal', () => new THREE.OctahedronGeometry(0.11, 0));
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2, c = new THREE.Mesh(cg, glowMat);
        c.position.set(-0.14 + Math.cos(a) * 0.32, HR * 1.12, Math.sin(a) * 0.32);
        c.scale.set(1, 1.9, 1);
        face.add(c);
      }
      const legs = [];
      [[0.25, 0.4], [0.25, -0.4], [-0.4, 0.4], [-0.4, -0.4]].forEach(([x, z]) => {
        const l = new THREE.Mesh(geo('turtleLeg', () => new THREE.CylinderGeometry(0.1, 0.12, 0.28, 8)), metal(0x2a4a22, L.glow, 0.2));
        l.position.set(x, -HR * 0.85, z);
        face.add(l);
        legs.push(l);
      });
      anim.push((dt, t) => legs.forEach((l, i) => { l.rotation.z = Math.sin(t * 4 + i * 1.6) * 0.3; }));
    },
    // THORNLASH: three whipping thorn vines
    vines({ face, anim, L }) {
      const segGeo = geo('vineSeg', () => { const c = new THREE.CylinderGeometry(0.035, 0.05, 0.2, 6); c.translate(0, 0.1, 0); return c; });
      const thorn = geo('thorn', () => { const c = new THREE.ConeGeometry(0.025, 0.1, 4); c.rotateZ(-Math.PI / 2); c.translate(0.07, 0.1, 0); return c; });
      const vm = metal(0x1c5a14, L.glow, 0.5), tm = basic(0xff3cf2);
      const vines = [];
      for (let v = 0; v < 3; v++) {
        const root = new THREE.Group();
        root.position.set(-0.25, 0.15 + v * 0.12, (v - 1) * 0.36);
        root.rotation.set((v - 1) * 0.5, 0, 0.9);
        face.add(root);
        vines.push(jointChain(root, 6, 0.19, segGeo, vm, (j, k) => { if (k % 2) j.add(new THREE.Mesh(thorn, tm)); }));
      }
      anim.push((dt, t) => vines.forEach((js, v) => js.forEach((j, k) => { j.rotation.z = Math.sin(t * 3 + v * 2 + k * 0.6) * 0.38; j.rotation.x = Math.cos(t * 2.3 + v + k * 0.5) * 0.22; })));
    },
    // HEXWRAITH: an open grimoire, a circle of runes and a ghostly cloak
    grimoire({ face, group, anim, L }) {
      const book = new THREE.Group();
      const pageGeo = geo('page', () => { const p = new THREE.PlaneGeometry(0.3, 0.4); p.translate(0.15, 0, 0); return p; });
      const pm = new THREE.MeshBasicMaterial({ map: pageTex(), color: L.glow, side: THREE.DoubleSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      const left = new THREE.Mesh(pageGeo, pm), right = new THREE.Mesh(pageGeo, pm);
      book.add(left, right, M.glow(L.glow, 1.2, 0.6));
      book.position.set(HR + 0.45, 0.2, 0);
      book.rotation.z = 0.35;
      face.add(book);
      const runes = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => { const s = spr(runeTex(i), L.glow, 0.26, true); group.add(s); return s; });
      const cloak = new THREE.Mesh(geo('cloak', () => new THREE.ConeGeometry(0.72, 0.8, 18, 1, true)), new THREE.MeshBasicMaterial({ color: 0x3a1a5a, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
      cloak.position.y = -0.35;
      cloak.rotation.x = Math.PI;
      group.add(cloak);
      anim.push((dt, t) => {
        left.rotation.y = Math.PI * 0.62 + Math.sin(t * 3) * 0.1;
        right.rotation.y = Math.PI * 0.38 - Math.sin(t * 3) * 0.1;
        book.position.y = 0.2 + Math.sin(t * 2) * 0.05;
        runes.forEach((s, i) => { const a = t * 0.9 + (i / 8) * Math.PI * 2; s.position.set(Math.cos(a) * 1.05, 0.3 + Math.sin(t * 2 + i) * 0.12, Math.sin(a) * 1.05); });
        cloak.scale.set(1 + Math.sin(t * 3) * 0.05, 1, 1 + Math.cos(t * 3) * 0.05);
      });
    },
    // NULLBLADE: four katanas orbiting like a blade storm, a trailing scarf
    bladeStorm({ face, group, anim, L, glowMat, hull }) {
      const orbit = new THREE.Group();
      const blade = geo('katana', () => { const c = new THREE.BoxGeometry(0.85, 0.05, 0.02); c.translate(0.42, 0, 0); return c; });
      const hilt = geo('katanaHilt', () => { const c = new THREE.BoxGeometry(0.18, 0.06, 0.05); c.translate(-0.09, 0, 0); return c; });
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2, k = new THREE.Group();
        k.add(new THREE.Mesh(blade, glowMat), new THREE.Mesh(hilt, hull));
        k.position.set(Math.cos(a) * 0.95, 0, Math.sin(a) * 0.95);
        k.rotation.y = -a + Math.PI / 2;
        orbit.add(k);
      }
      group.add(orbit);
      const scarf = [];
      const sGeo = geo('scarfSeg', () => new THREE.PlaneGeometry(0.2, 0.12));
      const sMat = new THREE.MeshBasicMaterial({ color: L.eye, side: THREE.DoubleSide });
      for (let i = 0; i < 6; i++) { const p = new THREE.Mesh(sGeo, sMat); face.add(p); scarf.push(p); }
      anim.push((dt, t) => {
        orbit.rotation.y += dt * 3;
        orbit.rotation.z = Math.sin(t * 1.3) * 0.25;
        scarf.forEach((p, i) => { p.position.set(-0.45 - i * 0.18, 0.15 + Math.sin(t * 6 - i) * 0.05 * i, Math.sin(t * 4 - i * 0.8) * 0.06 * i); p.rotation.x = Math.sin(t * 6 - i); });
      });
    },
    // GLITCHWIDOW: a big abdomen with an hourglass mark hanging on a silk thread
    webAbdomen({ face, anim, L }) {
      const abd = new THREE.Mesh(geo('abdomen', () => new THREE.SphereGeometry(0.5, 20, 14)), new THREE.MeshStandardMaterial({
        color: 0x1a0a24, metalness: 0.6, roughness: 0.3, emissive: L.glow, emissiveMap: patternTex('scales'), emissiveIntensity: 0.5,
      }));
      abd.position.set(-0.8, 0.18, 0);
      abd.scale.set(1.25, 0.9, 0.9);
      const glass = geo('hourglass', () => extrudeFlat([[-0.12, 0.16], [0.12, 0.16], [0, 0], [0.12, -0.16], [-0.12, -0.16], [0, 0]], 0.02));
      const mark = new THREE.Mesh(glass, basic(0xff2a4d));
      mark.position.set(-0.8, 0.62, 0);
      mark.rotation.x = -Math.PI / 2;
      const thread = new THREE.Mesh(geo('silk', () => new THREE.CylinderGeometry(0.006, 0.006, 3, 4)), additive(0xffffff, 0.45));
      thread.position.set(-0.8, 2.1, 0);
      face.add(abd, mark, thread);
      anim.push((dt, t) => { abd.scale.set(1.25 + Math.sin(t * 3) * 0.04, 0.9, 0.9 + Math.sin(t * 3) * 0.03); });
    },
    // REAPER.SYS: a hood and a huge glowing scythe
    scythe({ face, anim, L, glowMat, hull }) {
      const s = new THREE.Group();
      s.add(new THREE.Mesh(geo('scythePole', () => new THREE.CylinderGeometry(0.03, 0.03, 1.9, 6)), hull));
      const blade = new THREE.Mesh(geo('scytheBlade', () => extrudeFlat([[0, 0], [0.12, 0.06], [0.6, -0.04], [0.92, -0.38], [0.42, -0.14], [0, -0.1]], 0.03)), glowMat);
      blade.position.y = 0.92;
      const bg = M.glow(L.glow, 1.3, 0.5);
      bg.position.set(0.45, 0.8, 0);
      s.add(blade, bg);
      s.position.set(0.05, 0.15, 0.66);
      s.rotation.set(-0.15, 0, -0.25);
      face.add(s);
      const hood = new THREE.Mesh(geo('reaperHood', () => new THREE.ConeGeometry(0.78, 1.0, 18, 1, true, Math.PI * 0.35, Math.PI * 1.3)), new THREE.MeshStandardMaterial({
        color: 0x0a0612, roughness: 0.85, side: THREE.DoubleSide, emissive: L.glow, emissiveIntensity: 0.08,
      }));
      hood.position.set(-0.06, 0.42, 0);
      face.add(hood);
      anim.push((dt, t) => { s.rotation.z = -0.25 + Math.sin(t * 1.6) * 0.12; });
    },
    // SERAPHINE: three pairs of wings, a double halo and falling feathers
    seraphWings({ face, group, anim, L }) {
      const wg = geo('wing', () => extrudeFlat([[0, 0], [-0.25, 0.55], [-0.75, 0.95], [-0.55, 0.45], [-0.85, 0.5], [-0.45, 0.12]], 0.03));
      const wm = new THREE.MeshStandardMaterial({ color: 0xf2f8ff, metalness: 0.4, roughness: 0.3, emissive: L.glow, emissiveIntensity: 0.6 });
      const wings = [];
      [[0.1, 0.9], [-0.25, 0.75], [0.4, 0.62]].forEach(([y, sc], p) => [1, -1].forEach((s) => {
        const w = new THREE.Mesh(wg, wm);
        w.position.set(-HR * 0.3, y, s * HR * 0.8);
        w.scale.setScalar(sc);
        w.rotation.set(0, s * 0.35, p === 1 ? -0.5 : p === 2 ? 0.45 : 0);
        face.add(w);
        wings.push({ w, s, p });
      }));
      const halos = [0, 1].map((i) => {
        const h = new THREE.Mesh(geo('seraphHalo' + i, () => { const t = new THREE.TorusGeometry(0.36 + i * 0.12, 0.03, 8, 40); t.rotateX(Math.PI / 2); return t; }), basic(i ? 0xffffff : L.glow));
        h.position.y = HR + 0.32 + i * 0.1;
        group.add(h);
        return h;
      });
      const feathers = [0, 1, 2].map(() => { const f = M.glow(0xffffff, 0.2, 0.9); group.add(f); return f; });
      anim.push((dt, t) => {
        wings.forEach(({ w, s, p }) => { w.rotation.x = s * (0.15 + Math.sin(t * 3 + p * 0.7) * 0.14); });
        halos[0].rotation.y += dt;
        halos[1].rotation.y -= dt * 0.6;
        halos[1].rotation.x = Math.sin(t) * 0.2;
        feathers.forEach((f, i) => { const k = (t * 0.25 + i / 3) % 1; f.position.set(Math.sin(t + i * 2) * 0.9, 1.4 - k * 1.8, Math.cos(t * 0.7 + i * 2) * 0.9); f.material.opacity = Math.sin(k * Math.PI); });
      });
    },
    // ARC ANGEL: solar panel wings, a dish and a tiny satellite in orbit
    satellite({ face, group, anim, L, hull }) {
      const pm = new THREE.MeshStandardMaterial({ color: 0x0a1a3a, emissive: 0x19e6ff, emissiveMap: panelTex(), emissiveIntensity: 0.8, metalness: 0.6, roughness: 0.3 });
      [-1, 1].forEach((s) => {
        const arm = new THREE.Mesh(geo('panelArm', () => new THREE.CylinderGeometry(0.02, 0.02, 0.3, 6)), hull);
        arm.rotation.x = Math.PI / 2;
        arm.position.set(-0.1, 0.05, s * (HR + 0.12));
        const panel = new THREE.Mesh(geo('panel', () => new THREE.BoxGeometry(0.5, 0.02, 0.9)), pm);
        panel.position.set(-0.1, 0.05, s * (HR + 0.72));
        face.add(arm, panel);
      });
      const dish = new THREE.Mesh(geo('dish', () => new THREE.SphereGeometry(0.3, 18, 8, 0, Math.PI * 2, 0, 0.9)), metal(0xdde6f5, L.glow, 0.2));
      dish.rotation.z = 0.9;
      dish.position.set(0, HR + 0.05, 0);
      const rod = new THREE.Mesh(geo('dishRod', () => new THREE.CylinderGeometry(0.015, 0.015, 0.3, 4)), hull);
      rod.position.set(0.1, HR + 0.2, 0);
      rod.rotation.z = -0.9;
      const blink = M.glow(0xff2a4d, 0.4, 1);
      blink.position.set(0.22, HR + 0.3, 0);
      face.add(dish, rod, blink);
      const mini = new THREE.Group();
      mini.add(new THREE.Mesh(geo('miniSat', () => new THREE.BoxGeometry(0.1, 0.1, 0.1)), metal(0xdde6f5, L.glow, 0.3)));
      const mp = new THREE.Mesh(geo('miniPanel', () => new THREE.BoxGeometry(0.02, 0.07, 0.42)), pm);
      mini.add(mp);
      group.add(mini);
      anim.push((dt, t) => {
        blink.material.opacity = Math.sin(t * 6) > 0 ? 1 : 0.1;
        mini.position.set(Math.cos(t * 1.2) * 1.2, 0.5 + Math.sin(t * 1.2) * 0.3, Math.sin(t * 1.2) * 1.2);
        mini.rotation.y = -t * 1.2;
      });
    },
    // AURORA: aurora ribbons swirling around it and a floating prism
    auroraRibbons({ group, anim }) {
      const rm = new THREE.MeshBasicMaterial({ map: ribbonTex(), transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
      const ribbons = [0, 1, 2].map((i) => {
        const g = new THREE.PlaneGeometry(0.34, 1.3, 1, 12);
        const m = new THREE.Mesh(g, rm);
        group.add(m);
        return { m, g, base: g.attributes.position.array.slice(), i };
      });
      const prism = new THREE.Mesh(geo('bigPrism', () => new THREE.OctahedronGeometry(0.2, 0)), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.6, metalness: 0.3, roughness: 0.05 }));
      prism.scale.set(1, 1.7, 1);
      prism.position.y = HR + 0.45;
      const pg = M.glow(0xff9af5, 1.2, 0.5);
      pg.position.y = HR + 0.45;
      group.add(prism, pg);
      anim.push((dt, t) => {
        ribbons.forEach(({ m, g, base, i }) => {
          const a = t * 0.8 + (i / 3) * Math.PI * 2;
          m.position.set(Math.cos(a) * 0.95, 0.15, Math.sin(a) * 0.95);
          m.rotation.y = -a;
          const p = g.attributes.position.array;
          for (let k = 0; k < p.length; k += 3) p[k + 2] = base[k + 2] + Math.sin(t * 4 + base[k + 1] * 4 + i) * 0.08;
          g.attributes.position.needsUpdate = true;
        });
        prism.rotation.y += dt * 1.5;
        prism.material.emissive.setHSL((t * 0.2) % 1, 0.8, 0.6);
      });
    },
    // VALKYRIE: a winged helmet, a spear and a round shield
    wingedHelm({ face, anim, L, glowMat, hull }) {
      const helm = new THREE.Mesh(geo('helm', () => new THREE.SphereGeometry(HR * 1.08, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2.6)), metal(0xc9d2e6, L.glow, 0.15));
      face.add(helm);
      const wg = geo('helmWing', () => extrudeFlat([[0, 0], [-0.15, 0.3], [-0.45, 0.5], [-0.35, 0.25], [-0.5, 0.25], [-0.25, 0.05]], 0.025));
      const wm = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: L.glow, emissiveIntensity: 0.5 });
      const wings = [1, -1].map((s) => { const w = new THREE.Mesh(wg, wm); w.position.set(0, HR * 0.55, s * HR * 0.85); w.rotation.y = s * 0.4; face.add(w); return w; });
      const spear = new THREE.Group();
      spear.add(new THREE.Mesh(geo('spearShaft', () => new THREE.CylinderGeometry(0.025, 0.025, 1.8, 6)), hull));
      const head = new THREE.Mesh(geo('spearHead', () => new THREE.ConeGeometry(0.07, 0.3, 6)), glowMat);
      head.position.y = 1.02;
      spear.add(head);
      spear.position.set(0.1, 0.15, -0.66);
      spear.rotation.z = -0.35;
      face.add(spear);
      const shield = new THREE.Mesh(geo('roundShield', () => { const c = new THREE.CylinderGeometry(0.36, 0.36, 0.05, 24); c.rotateX(Math.PI / 2); return c; }), new THREE.MeshStandardMaterial({
        color: 0xdde6f5, metalness: 0.8, roughness: 0.3, emissive: L.glow, emissiveMap: patternTex('plates'), emissiveIntensity: 0.5,
      }));
      shield.position.set(0.05, -0.05, 0.7);
      face.add(shield);
      anim.push((dt, t) => { wings.forEach((w, i) => { w.rotation.x = (i ? -1 : 1) * Math.sin(t * 4) * 0.15; }); spear.rotation.z = -0.35 + Math.sin(t * 1.8) * 0.06; });
    },
    // OBLIVION: debris spiralling into its event horizon
    gravityLens({ group, anim }) {
      const rocks = [];
      for (let i = 0; i < 7; i++) {
        const r = new THREE.Mesh(geo('debrisRock', () => new THREE.DodecahedronGeometry(0.07, 0)), metal(0x2a2030, 0xff2a4d, 0.3));
        group.add(r);
        rocks.push({ r, ph: i / 7 });
      }
      const lens = M.glow(0x3a0a4a, 3.4, 0.5);
      group.add(lens);
      anim.push((dt, t) => rocks.forEach(({ r, ph }) => {
        const k = (t * 0.18 + ph) % 1, rad = 1.5 - k * 0.9, a = t * 1.8 / Math.max(0.3, rad) + ph * 9;
        r.position.set(Math.cos(a) * rad, Math.sin(a * 0.5) * 0.15, Math.sin(a) * rad);
        r.scale.setScalar(1 - k * 0.8);
        r.rotation.x += dt * 4;
      }));
    },
    // DREADCORE: shoulder cannons, smoking stacks and a double axe
    warMachine({ face, group, anim, L, glowMat, hull }) {
      const pm = metal(0x2a0a0e, L.glow, 0.35);
      [-1, 1].forEach((s) => {
        const pauldron = new THREE.Mesh(geo('pauldron', () => new THREE.SphereGeometry(0.34, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2)), pm);
        pauldron.position.set(-0.05, HR * 0.55, s * HR * 0.85);
        pauldron.rotation.x = s * 0.6;
        face.add(pauldron);
        const barrel = new THREE.Mesh(geo('dreadBarrel', () => { const c = new THREE.CylinderGeometry(0.07, 0.08, 0.6, 10); c.rotateZ(-Math.PI / 2); return c; }), hull);
        barrel.position.set(0.25, HR * 0.9, s * HR * 0.85);
        const mz = M.glow(0xff5a1f, 0.5, 0.8);
        mz.position.set(0.58, HR * 0.9, s * HR * 0.85);
        face.add(barrel, mz);
      });
      const fires = [];
      [-1, 1].forEach((s) => {
        const stack = new THREE.Mesh(geo('stack', () => new THREE.CylinderGeometry(0.07, 0.09, 0.45, 10)), hull);
        stack.position.set(-HR * 0.7, HR * 0.75, s * 0.2);
        face.add(stack);
        const f = M.glow(0xff5a1f, 0.6, 0.9);
        group.add(f);
        fires.push({ f, s });
      });
      const axe = new THREE.Group();
      axe.add(new THREE.Mesh(geo('axeHandle', () => new THREE.CylinderGeometry(0.03, 0.03, 1.3, 6)), hull));
      const blade = geo('axeBlade', () => extrudeFlat([[0, 0.2], [0.4, 0.34], [0.46, 0], [0.4, -0.34], [0, -0.2]], 0.03));
      [1, -1].forEach((s) => { const b = new THREE.Mesh(blade, glowMat); b.position.y = 0.55; b.scale.x = s; axe.add(b); });
      axe.position.set(0.05, 0, -0.75);
      axe.rotation.z = 0.3;
      face.add(axe);
      anim.push((dt, t) => fires.forEach(({ f, s }) => { f.position.set(-HR * 0.7, HR + 0.2 + Math.random() * 0.1, s * 0.2); f.scale.setScalar(0.4 + Math.random() * 0.4); }));
    },
    // LEVIATHAN: tentacles, a dorsal fin and an anglerfish lure
    tentacles({ face, anim, L }) {
      const segGeo = geo('tentSeg', () => { const c = new THREE.CylinderGeometry(0.06, 0.08, 0.24, 8); c.translate(0, 0.12, 0); return c; });
      const tm = metal(0x2a0818, L.glow, 0.35);
      const arms = [];
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2, root = new THREE.Group();
        root.position.set(Math.cos(a) * 0.35 - 0.1, -HR * 0.6, Math.sin(a) * 0.35);
        root.rotation.set(Math.sin(a) * 2.2, 0, -Math.cos(a) * 2.2 - 0.2);
        face.add(root);
        arms.push(jointChain(root, 5, 0.22, segGeo, tm));
      }
      const fin = new THREE.Mesh(geo('dorsal', () => extrudeFlat([[0.3, 0], [-0.4, 0], [-0.55, 0.55], [-0.1, 0.25]], 0.03)), basic(L.glow));
      fin.position.set(-0.1, HR * 0.8, 0);
      face.add(fin);
      const stalk = new THREE.Mesh(tube([[0.1, HR * 0.8, 0], [0.4, HR + 0.5, 0], [0.8, HR + 0.45, 0], [0.95, HR + 0.2, 0]], 0.02, 16), metal(0x2a0818, L.glow, 0.3));
      const bulb = new THREE.Mesh(geo('lureBulb', () => new THREE.SphereGeometry(0.08, 12, 8)), basic(0x9ff4ff));
      bulb.position.set(0.95, HR + 0.16, 0);
      const bg = M.glow(0x19e6ff, 1, 0.9);
      bg.position.copy(bulb.position);
      face.add(stalk, bulb, bg);
      anim.push((dt, t) => {
        arms.forEach((js, i) => js.forEach((j, k) => { j.rotation.z = Math.sin(t * 2.4 + i + k * 0.7) * 0.35; }));
        bg.material.opacity = 0.6 + Math.sin(t * 3) * 0.35;
      });
    },
    // HOLLOW: a bone-white mask with hollow glowing eyes, shards orbiting
    mask({ face, group, anim, L }) {
      const m = new THREE.Mesh(geo('maskPlate', () => new THREE.SphereGeometry(HR * 1.12, 22, 14, Math.PI - 0.75, 1.5, 0.55, 1.35)), new THREE.MeshStandardMaterial({ color: 0xf2eee6, roughness: 0.5, metalness: 0.1, side: THREE.DoubleSide }));
      face.add(m);
      [-0.19, 0.19].forEach((z) => {
        const hole = new THREE.Mesh(geo('maskHole', () => { const c = new THREE.CircleGeometry(0.1, 16); c.rotateY(Math.PI / 2); c.scale(1, 1.4, 1); return c; }), basic(0x050003));
        hole.position.set(frontX('sphere', 0.12, z) + 0.1, 0.12, z);
        const pupil = M.glow(L.glow, 0.35, 1);
        pupil.position.set(hole.position.x + 0.02, 0.1, z);
        face.add(hole, pupil);
      });
      const stripe = new THREE.Mesh(geo('maskStripe', () => new THREE.BoxGeometry(0.02, 0.3, 0.05)), basic(0xff2a4d));
      stripe.position.set(frontX('sphere', -0.15, 0.19) + 0.08, -0.14, 0.19);
      face.add(stripe);
      const shards = [];
      for (let i = 0; i < 5; i++) { const s = new THREE.Mesh(geo('shard', () => new THREE.TetrahedronGeometry(0.09, 0)), basic(0xf2eee6)); group.add(s); shards.push(s); }
      anim.push((dt, t) => shards.forEach((s, i) => { const a = t * 0.7 + (i / 5) * Math.PI * 2; s.position.set(Math.cos(a) * 1.0, 0.25 + Math.sin(t * 1.5 + i) * 0.2, Math.sin(a) * 1.0); s.rotation.x += dt * 2; s.rotation.y += dt; }));
    },
    // UNICORE: a spiral horn, a rainbow mane and tail, little wings and sparkles
    unicorn({ face, group, anim, L }) {
      const horn = new THREE.Mesh(geo('uniHorn', () => { const c = new THREE.ConeGeometry(0.12, 0.95, 20, 10); c.translate(0, 0.475, 0); return c; }), new THREE.MeshStandardMaterial({
        map: spiralTex(), emissive: 0xffe6a0, emissiveMap: spiralTex(), emissiveIntensity: 0.7, metalness: 0.4, roughness: 0.25,
      }));
      horn.position.set(HR * 0.62, HR * 0.62, 0);
      horn.rotation.z = -0.7;
      const hornBase = new THREE.Mesh(geo('uniHornBase', () => { const t = new THREE.TorusGeometry(0.12, 0.035, 8, 20); t.rotateX(Math.PI / 2); return t; }), basic(0xffd23a));
      hornBase.position.copy(horn.position);
      hornBase.rotation.z = -0.7;
      const hg = M.glow(0xfff3c0, 1.1, 0.9);
      hg.position.set(HR * 0.62 + Math.sin(0.7) * 0.95, HR * 0.62 + Math.cos(0.7) * 0.95, 0);
      face.add(horn, hornBase, hg);
      [-1, 1].forEach((s) => {
        const ear = new THREE.Mesh(geo('uniEar', () => new THREE.ConeGeometry(0.07, 0.2, 6)), new THREE.MeshStandardMaterial({ color: 0xf6f0ff, emissive: 0xff9af5, emissiveIntensity: 0.3 }));
        ear.position.set(HR * 0.15, HR * 0.9, s * 0.25);
        ear.rotation.x = s * 0.4;
        face.add(ear);
      });
      // the mane: soft rainbow locks flowing from the crown down its back
      const mane = [];
      const maneGeo = geo('maneLock', () => { const c = new THREE.SphereGeometry(0.1, 12, 8); c.scale(0.9, 2.6, 1.1); c.translate(0, -0.14, 0); return c; });
      RAINBOW.forEach((col, i) => {
        const lock = new THREE.Mesh(maneGeo, new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.55, roughness: 0.4 }));
        const a = 1.45 + i * 0.24;
        lock.position.set(Math.cos(a) * HR * 1.02, Math.sin(a) * HR * 1.02, (i % 2 ? 1 : -1) * 0.07);
        lock.rotation.z = a + Math.PI - 0.35;   // follows the curve of the head, tips flowing back and a little out
        face.add(lock);
        mane.push({ lock, a });
      });
      const tail = RAINBOW.map((col, i) => {
        const s = new THREE.Mesh(geo('tailPuff', () => new THREE.SphereGeometry(0.1, 10, 8)), basic(col));
        face.add(s);
        return s;
      });
      const wg = geo('uniWing', () => extrudeFlat([[0, 0], [-0.15, 0.32], [-0.45, 0.55], [-0.32, 0.26], [-0.5, 0.28], [-0.27, 0.07]], 0.025));
      const wm = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xff9af5, emissiveIntensity: 0.4 });
      const wings = [1, -1].map((s) => { const w = new THREE.Mesh(wg, wm); w.position.set(-HR * 0.25, 0.15, s * HR * 0.85); w.rotation.y = s * 0.35; face.add(w); return w; });
      const sparkles = [0, 1, 2, 3, 4].map((i) => { const s = M.glow(RAINBOW[i + 1], 0.25, 1); group.add(s); return s; });
      anim.push((dt, t) => {
        mane.forEach(({ lock, a }, i) => { lock.rotation.z = a + Math.PI - 0.35 + Math.sin(t * 5 - i * 0.6) * 0.14; });
        tail.forEach((s, i) => s.position.set(-HR - 0.05 - i * 0.14, -0.1 + Math.sin(t * 4 - i * 0.6) * 0.06 - i * 0.03, Math.sin(t * 3 - i * 0.7) * 0.04 * i));
        wings.forEach((w, i) => { w.rotation.x = (i ? -1 : 1) * (0.1 + Math.sin(t * 6) * 0.18); });
        sparkles.forEach((s, i) => { const a = t * 1.1 + i * 1.26; s.position.set(Math.cos(a) * 1.05, 0.3 + Math.sin(t * 2.2 + i) * 0.35, Math.sin(a) * 1.05); s.material.opacity = 0.5 + Math.sin(t * 8 + i * 2) * 0.5; });
        hg.material.opacity = 0.6 + Math.sin(t * 4) * 0.3;
      });
    },
  };

  // Builds a hero ball. The model faces +x; rotate `face` to aim it.
  // returns { group, face, update(dt, t), flash(k), setTint(hex|null) }
  function makeHeroModel(def, opts) {
    const L = def.look;
    const o = opts || {};
    const group = new THREE.Group();
    const face = new THREE.Group();   // everything that turns toward the enemy
    group.add(face);
    const anim = [];                  // per-frame animation callbacks

    // body with a glowing pattern and a fresnel rim
    const bodyMat = new THREE.MeshStandardMaterial({
      color: L.base, metalness: 0.75, roughness: 0.32, emissive: L.glow, emissiveMap: patternTex(L.pattern),
      emissiveIntensity: 0.85, flatShading: L.body !== 'sphere',
    });
    const body = new THREE.Mesh(BODY[L.body](), bodyMat);
    face.add(body);
    const rim = new THREE.Mesh(geo('rimShell', () => new THREE.SphereGeometry(HR * 1.12, 32, 20)), M.fresnel(L.glow, 2.4, 0.55));
    face.add(rim);

    // faction band around the equator
    const band = new THREE.Mesh(geo('band', () => { const t = new THREE.TorusGeometry(HR * 1.02, 0.028, 8, 64); t.rotateX(Math.PI / 2); return t; }),
      basic(FACTIONS[def.faction].color));
    band.position.y = -0.14;
    if (L.body === 'sphere') face.add(band);

    // eyes
    const eyeMat = basic(L.eye);
    if (L.eyeType === 'visor' || L.eyeType === 'slit') {
      const wide = L.eyeType === 'visor';
      const vg = geo('visor_' + L.eyeType, () => {
        const arc = wide ? 1.5 : 1.1;
        const t = new THREE.TorusGeometry(HR * 0.99, wide ? 0.085 : 0.045, 8, 32, arc);
        t.rotateX(Math.PI / 2);
        t.rotateY(arc / 2);
        t.scale(1, wide ? 1.4 : 1, 1);
        return t;
      });
      const visor = new THREE.Mesh(vg, eyeMat);
      visor.position.y = 0.12;
      face.add(visor);
    } else if (L.eyeType === 'cute') {
      // big round eyes with a sparkle highlight
      [-0.2, 0.2].forEach((z) => {
        const e = new THREE.Mesh(geo('cuteEye', () => new THREE.SphereGeometry(0.14, 16, 12)), basic(0x160a2a));
        e.position.set(frontX(L.body, 0.1, z) - 0.05, 0.1, z);
        e.scale.set(0.6, 1.15, 1);
        const iris = new THREE.Mesh(geo('cuteIris', () => new THREE.SphereGeometry(0.075, 12, 10)), eyeMat);
        iris.position.set(e.position.x + 0.05, 0.07, z);
        const hl = new THREE.Mesh(geo('cuteHl', () => new THREE.SphereGeometry(0.035, 8, 6)), basic(0xffffff));
        hl.position.set(e.position.x + 0.08, 0.16, z + 0.03);
        face.add(e, iris, hl);
      });
    } else if (L.eyeType !== 'none') {
      const twin = L.eyeType === 'twin';
      const r = twin ? 0.09 : 0.14;
      const eg = geo('eye' + r, () => new THREE.SphereGeometry(r, 16, 12));
      (twin ? [-0.2, 0.2] : [0]).forEach((z) => {
        const e = new THREE.Mesh(eg, eyeMat);
        e.position.set(frontX(L.body, 0.12, z) - r * 0.35, 0.12, z);
        const ring = new THREE.Mesh(geo('eyeRing' + r, () => { const t = new THREE.TorusGeometry(r * 1.25, 0.018, 6, 20); t.rotateY(Math.PI / 2); return t; }),
          basic(L.glow));
        ring.position.copy(e.position);
        ring.position.x += 0.02;
        face.add(e, ring);
      });
    }
    if (L.eyeType !== 'none') {
      const eyeGlow = M.glow(L.eye, 0.9, 0.55);
      eyeGlow.position.set(frontX(L.body, 0.12, 0) + 0.05, 0.12, 0);
      face.add(eyeGlow);
    }

    const hull = metal(0x1c2030, L.glow, 0.15);
    const glowMat = basic(L.glow);

    // ---------------------------------------------------- class gear
    // (only for heroes without a signature look — the signature replaces it)
    const cls = L.sig ? '' : def.cls;
    if (L.sig && SIGS[L.sig]) SIGS[L.sig]({ face, group, anim, L, def, hull, glowMat, bodyMat });
    if (cls === 'tank') {
      const shield = new THREE.Group();
      const hexGeo = geo('shieldHex', () => { const c = new THREE.CylinderGeometry(0.5, 0.5, 0.07, 6); c.rotateZ(Math.PI / 2); return c; });
      const plate = new THREE.Mesh(hexGeo, new THREE.MeshStandardMaterial({
        color: 0x1a1e30, metalness: 0.85, roughness: 0.3, emissive: L.glow, emissiveMap: patternTex('scales'), emissiveIntensity: 0.6,
      }));
      const edges = new THREE.LineSegments(geo('shieldEdges', () => new THREE.EdgesGeometry(hexGeo)), new THREE.LineBasicMaterial({ color: L.glow }));
      const core = new THREE.Mesh(geo('shieldCore', () => { const c = new THREE.CircleGeometry(0.2, 6); c.rotateY(Math.PI / 2); return c; }), additive(L.glow, 0.9));
      core.position.x = 0.04;
      shield.add(plate, edges, core);
      shield.position.set(frontX(L.body, 0, 0) + 0.36, -0.05, 0.12);
      face.add(shield);
      anim.push((dt, t) => { shield.position.y = -0.05 + Math.sin(t * 2.2) * 0.04; });
    } else if (cls === 'warrior') {
      const bladeGeo = geo('blade', () => new THREE.BoxGeometry(0.07, 1.15, 0.2));
      const hiltGeo = geo('hilt', () => new THREE.BoxGeometry(0.12, 0.3, 0.12));
      const sides = L.extra.includes('twinblade') ? [1, -1] : [1];
      sides.forEach((s) => {
        const sword = new THREE.Group();
        const blade = new THREE.Mesh(bladeGeo, glowMat);
        blade.position.y = 0.72;
        const hilt = new THREE.Mesh(hiltGeo, hull);
        hilt.position.y = 0.05;
        const bg = M.glow(L.glow, 1.2, 0.35);
        bg.position.y = 0.72;
        sword.add(blade, hilt, bg);
        sword.position.set(0.1, -0.35, s * (HR + 0.28));
        sword.rotation.z = -0.55;
        sword.rotation.x = s * 0.15;
        face.add(sword);
        anim.push((dt, t) => { sword.rotation.z = -0.55 + Math.sin(t * 2 + s) * 0.08; });
      });
    } else if (cls === 'ranger') {
      const gun = new THREE.Group();
      const barrel = new THREE.Mesh(geo('barrel', () => { const c = new THREE.CylinderGeometry(0.06, 0.08, 0.95, 12); c.rotateZ(Math.PI / 2); return c; }), hull);
      const coilGeo = geo('coil', () => { const t = new THREE.TorusGeometry(0.11, 0.025, 6, 16); t.rotateY(Math.PI / 2); return t; });
      [0.05, 0.25].forEach((x) => { const c = new THREE.Mesh(coilGeo, glowMat); c.position.x = x; gun.add(c); });
      const muzzle = M.glow(L.glow, 0.6, 0.8);
      muzzle.position.x = 0.5;
      gun.add(barrel, muzzle);
      gun.position.set(0.25, HR + 0.08, 0);
      face.add(gun);
    } else if (cls === 'mage') {
      const orbit = new THREE.Group();
      const orbGeo = geo('orb', () => new THREE.SphereGeometry(0.09, 12, 8));
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const orb = new THREE.Mesh(orbGeo, glowMat);
        orb.position.set(Math.cos(a) * 0.98, 0, Math.sin(a) * 0.98);
        const og = M.glow(L.glow, 0.55, 0.8);
        og.position.copy(orb.position);
        orbit.add(orb, og);
      }
      const ring = new THREE.Mesh(geo('orbitRing', () => { const t = new THREE.TorusGeometry(0.98, 0.01, 6, 64); t.rotateX(Math.PI / 2); return t; }), additive(L.glow, 0.45));
      orbit.add(ring);
      orbit.rotation.x = 0.35;
      group.add(orbit);   // orbits independently of facing
      anim.push((dt) => { orbit.rotation.y += dt * 1.6; });
    } else if (cls === 'support') {
      const halo = new THREE.Mesh(geo('halo', () => { const t = new THREE.TorusGeometry(0.34, 0.035, 8, 40); t.rotateX(Math.PI / 2); return t; }), glowMat);
      halo.position.y = HR + 0.3;
      const hg = M.glow(L.glow, 1.1, 0.45);
      hg.position.y = HR + 0.3;
      group.add(halo, hg);
      anim.push((dt, t) => { halo.position.y = hg.position.y = HR + 0.3 + Math.sin(t * 2.5) * 0.05; halo.rotation.y += dt; });
    }

    // ---------------------------------------------------- extras
    const ex = L.extra;
    if (ex.includes('plates')) {
      const plateMat = metal(0x252a3e, L.glow, 0.08);
      const cap = new THREE.Mesh(geo('capPlate', () => new THREE.SphereGeometry(HR * 1.05, 32, 8, 0, Math.PI * 2, 0, 0.62)), plateMat);
      face.add(cap);
      [1, -1].forEach((s) => {
        const side = new THREE.Mesh(geo('sidePlate', () => new THREE.SphereGeometry(HR * 1.05, 16, 12, -0.5, 1.0, 1.1, 0.9)), plateMat);
        side.rotation.y = s * Math.PI / 2;
        face.add(side);
      });
    }
    if (ex.includes('spikes')) {
      const spikeGeo = geo('spike', () => { const c = new THREE.ConeGeometry(0.08, 0.36, 6); c.translate(0, HR + 0.1, 0); return c; });
      const sm = metal(0x2a2a30, L.glow, 0.35);
      const up = new THREE.Vector3(0, 1, 0);
      for (let i = 0; i < 12; i++) {
        const y = 1 - ((i + 0.5) / 12) * 1.6, r = Math.sqrt(1 - y * y), th = i * 2.39996;
        const s = new THREE.Mesh(spikeGeo, sm);
        s.quaternion.setFromUnitVectors(up, new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r));
        face.add(s);
      }
    }
    if (ex.includes('horns')) {
      const hornGeo = geo('horn', () => { const c = new THREE.ConeGeometry(0.1, 0.55, 8); c.translate(0, 0.27, 0); return c; });
      const hm = metal(0x14141c, L.glow, 0.5);
      [1, -1].forEach((s) => {
        const h = new THREE.Mesh(hornGeo, hm);
        h.position.set(0.1, HR * 0.75, s * 0.3);
        h.rotation.set(s * 0.55, 0, -0.35);
        face.add(h);
      });
    }
    if (ex.includes('crown')) {
      const cg = geo('crownSpike', () => new THREE.ConeGeometry(0.05, 0.24, 6));
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const c = new THREE.Mesh(cg, glowMat);
        c.position.set(Math.cos(a) * 0.26, HR + 0.1, Math.sin(a) * 0.26);
        group.add(c);
      }
    }
    if (ex.includes('crest')) {
      const cr = new THREE.Mesh(geo('crest', () => extrudeFlat([[0.35, 0], [-0.55, 0.05], [-0.7, 0.42], [-0.1, 0.16]], 0.04)), glowMat);
      cr.position.y = HR * 0.78;
      face.add(cr);
    }
    if (ex.includes('fins')) {
      const fg = geo('fin', () => extrudeFlat([[0, 0], [-0.5, 0.1], [-0.62, 0.36]], 0.03));
      [1, -1].forEach((s) => {
        const f = new THREE.Mesh(fg, glowMat);
        f.position.set(-HR * 0.55, 0, s * HR * 0.72);
        f.rotation.x = s * 0.5;
        face.add(f);
      });
    }
    if (ex.includes('antenna')) {
      const ant = new THREE.Mesh(geo('antenna', () => new THREE.CylinderGeometry(0.015, 0.015, 0.5, 6)), hull);
      ant.position.set(-0.1, HR + 0.2, 0.1);
      const tip = new THREE.Mesh(geo('antTip', () => new THREE.SphereGeometry(0.06, 10, 8)), glowMat);
      tip.position.set(-0.1, HR + 0.47, 0.1);
      face.add(ant, tip);
      anim.push((dt, t) => { tip.scale.setScalar(1 + Math.sin(t * 6) * 0.25); });
    }
    if (ex.includes('mohawk')) {
      const mg = geo('mohawk', () => new THREE.ConeGeometry(0.05, 0.34, 5));
      for (let i = 0; i < 5; i++) {
        const a = 0.35 + i * 0.28;   // front-top to back-top
        const m = new THREE.Mesh(mg, glowMat);
        m.position.set(Math.cos(a) * HR * 0.98, Math.sin(a) * HR * 0.98, 0);
        m.rotation.z = a - Math.PI / 2;
        face.add(m);
      }
    }
    if (ex.includes('flame')) {
      const flames = [0, 1, 2].map((i) => {
        const f = M.glow(i ? 0xff9a1f : 0xff3a1a, 1.3, 0.5);
        group.add(f);
        return f;
      });
      anim.push((dt, t) => flames.forEach((f, i) => {
        f.position.set(Math.sin(t * 3 + i * 2) * 0.35, 0.5 + ((t * 0.9 + i / 3) % 1) * 0.6, Math.cos(t * 3 + i * 2) * 0.35);
        f.material.opacity = 0.55 * (1 - ((t * 0.9 + i / 3) % 1));
      }));
    }
    if (ex.includes('leaves')) {
      const lg = geo('leaf', () => { const c = new THREE.CircleGeometry(0.2, 12); c.scale(1, 0.45, 1); return c; });
      const lm = new THREE.MeshStandardMaterial({ color: 0x1c5a2a, emissive: L.glow, emissiveIntensity: 0.6, side: THREE.DoubleSide });
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const l = new THREE.Mesh(lg, lm);
        l.position.set(Math.cos(a) * 0.3, HR * 0.9, Math.sin(a) * 0.3);
        l.rotation.set(-0.9, -a, 0);
        face.add(l);
      }
    }
    if (ex.includes('moss')) {
      const cg = geo('mossCrystal', () => new THREE.OctahedronGeometry(0.12, 0));
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const c = new THREE.Mesh(cg, glowMat);
        c.position.set(Math.cos(a) * 0.32, HR * 0.95, Math.sin(a) * 0.32);
        c.scale.set(1, 1.8, 1);
        face.add(c);
      }
    }
    if (ex.includes('wings')) {
      const wg = geo('wing', () => extrudeFlat([[0, 0], [-0.25, 0.55], [-0.75, 0.95], [-0.55, 0.45], [-0.85, 0.5], [-0.45, 0.12]], 0.03));
      const wm = new THREE.MeshStandardMaterial({ color: 0xe8f4ff, metalness: 0.4, roughness: 0.3, emissive: L.glow, emissiveIntensity: 0.55 });
      const wings = [1, -1].map((s) => {
        const w = new THREE.Mesh(wg, wm);
        w.position.set(-HR * 0.3, 0.1, s * HR * 0.8);
        w.rotation.y = s * 0.35;
        face.add(w);
        return w;
      });
      anim.push((dt, t) => wings.forEach((w, i) => { w.rotation.x = (i ? -1 : 1) * (0.15 + Math.sin(t * 3) * 0.12); }));
    }
    if (ex.includes('wisps')) {
      const wisps = [0, 1, 2].map(() => { const w = M.glow(L.glow, 0.7, 0.7); group.add(w); return w; });
      anim.push((dt, t) => wisps.forEach((w, i) => {
        const a = t * 1.3 + (i * Math.PI * 2) / 3;
        w.position.set(Math.cos(a) * 0.95, 0.2 + Math.sin(t * 2 + i) * 0.3, Math.sin(a) * 0.95);
      }));
    }
    if (ex.includes('rings')) {
      const disk = new THREE.Mesh(geo('disk', () => new THREE.RingGeometry(HR * 1.3, HR * 2.2, 72)), new THREE.MeshBasicMaterial({
        map: diskTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }));
      const tilt = new THREE.Group();
      tilt.rotation.x = -Math.PI / 2 + 0.4;
      tilt.add(disk);
      group.add(tilt);
      anim.push((dt) => { disk.rotation.z += dt * 2; });
    }
    if (ex.includes('legs')) {
      // spider-bot legs: two bent segments per leg, four legs a side
      const upper = geo('legUp', () => { const c = new THREE.CylinderGeometry(0.035, 0.045, 0.62, 6); c.translate(0, 0.31, 0); return c; });
      const lower = geo('legLow', () => { const c = new THREE.CylinderGeometry(0.02, 0.035, 0.7, 6); c.translate(0, -0.35, 0); return c; });
      const lm = metal(0x1a1022, L.glow, 0.5);
      const legs = [];
      for (let i = 0; i < 8; i++) {
        const side = i < 4 ? 1 : -1, k = i % 4;
        const hip = new THREE.Group();
        hip.position.set(0.3 - k * 0.2, -0.05, side * HR * 0.8);
        const a = new THREE.Mesh(upper, lm);
        a.rotation.x = side * 1.05;
        a.rotation.z = (k - 1.5) * 0.35;
        const knee = new THREE.Group();
        knee.position.set(0, 0.62, 0);
        knee.add(new THREE.Mesh(lower, lm));
        a.add(knee);
        knee.rotation.x = -side * 1.9;
        hip.add(a);
        face.add(hip);
        legs.push(a);
      }
      anim.push((dt, t) => legs.forEach((a, i) => { a.rotation.z = ((i % 4) - 1.5) * 0.35 + Math.sin(t * 7 + i * 1.3) * 0.12; }));
    }
    if (ex.includes('speakers')) {
      const sg = geo('speaker', () => { const c = new THREE.CylinderGeometry(0.24, 0.24, 0.14, 20); c.rotateX(Math.PI / 2); return c; });
      const cone = geo('speakerCone', () => { const c = new THREE.CircleGeometry(0.17, 20); return c; });
      const sm = metal(0x14101c, L.glow, 0.2);
      const cones = [1, -1].map((s) => {
        const sp = new THREE.Mesh(sg, sm);
        sp.position.set(0.05, 0.05, s * (HR + 0.05));
        const c = new THREE.Mesh(cone, additive(L.glow, 0.9));
        c.position.z = s * 0.075;
        if (s < 0) c.rotation.y = Math.PI;
        sp.add(c);
        face.add(sp);
        return c;
      });
      anim.push((dt, t) => { const k = 1 + Math.max(0, Math.sin(t * 13)) * 0.25; cones.forEach((c) => c.scale.setScalar(k)); });
    }
    if (ex.includes('prisms')) {
      const pg = geo('prism', () => new THREE.TetrahedronGeometry(0.16, 0));
      const orbit = new THREE.Group();
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const p = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ color: [0x19e6ff, 0xff3cf2, 0xffc933, 0x8dff2a][i] }));
        p.position.set(Math.cos(a) * 0.95, 0.35 + (i % 2) * 0.2, Math.sin(a) * 0.95);
        orbit.add(p);
      }
      group.add(orbit);
      anim.push((dt) => { orbit.rotation.y -= dt * 1.2; orbit.children.forEach((p) => { p.rotation.x += dt * 3; p.rotation.y += dt * 2; }); });
    }
    if (RARITIES[def.rarity].rank >= 5) {   // SS and above wear a soft aura
      const aura = M.glow(def.rarity === 'HR' ? 0xff5cf0 : L.glow, def.rarity === 'HR' ? 4 : 3.4, 0.22);
      aura.position.z = -0.4;
      group.add(aura);
      anim.push((dt, t) => { aura.material.opacity = 0.18 + Math.sin(t * 2) * 0.06; });
    }
    if (o.boss) {
      const aura = M.glow(0xff2a4d, 4.2, 0.35);
      group.add(aura);
    }

    let flashK = 0;
    return {
      group, face,
      update(dt, t) { for (const f of anim) f(dt, t); },
      flash(k) {
        flashK = Math.max(flashK, k);
        bodyMat.emissiveIntensity = 0.85 + flashK * 2.5;
        flashK = Math.max(0, flashK - 0.08);
      },
    };
  }

  // corrupted minion ("virus") for the AFK farm and campaign fodder
  function makeVirusModel(color) {
    const g = new THREE.Group();
    const face = new THREE.Group();
    const spin = new THREE.Group();
    g.add(face);
    face.add(spin);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x200812, metalness: 0.6, roughness: 0.35, emissive: color, emissiveMap: patternTex('cracks'), emissiveIntensity: 1, flatShading: true,
    });
    const body = new THREE.Mesh(geo('virus', () => new THREE.IcosahedronGeometry(0.42, 0)), bodyMat);
    const spikeGeo = geo('vspike', () => { const c = new THREE.ConeGeometry(0.06, 0.3, 5); c.translate(0, 0.5, 0); return c; });
    const sm = basic(color);
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < 10; i++) {
      const y = 1 - ((i + 0.5) / 10) * 2, r = Math.sqrt(1 - y * y), th = i * 2.39996;
      const s = new THREE.Mesh(spikeGeo, sm);
      s.quaternion.setFromUnitVectors(up, new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r));
      spin.add(s);
    }
    spin.add(body);
    const eye = new THREE.Mesh(geo('veye', () => new THREE.SphereGeometry(0.1, 12, 8)), basic(0xffffff));
    eye.position.set(0.4, 0.08, 0);
    face.add(eye, M.glow(color, 1.6, 0.35));
    let flashK = 0;
    return {
      group: g, face,
      update(dt) { spin.rotation.x += dt * 0.8; spin.rotation.z += dt * 0.5; },
      flash(k) {
        flashK = Math.max(flashK, k);
        bodyMat.emissiveIntensity = 1 + flashK * 2.5;
        flashK = Math.max(0, flashK - 0.08);
      },
    };
  }

  // the signature relic as a small floating crystal (hero showcase, battle)
  const rarityHex = (id) => parseInt(RARITIES[id].color.slice(1), 16);
  function makeRelicModel(def) {
    const col = rarityHex(def.rarity);
    const g = new THREE.Group();
    const gem = new THREE.Mesh(geo('relicGem', () => new THREE.OctahedronGeometry(0.22, 0)), new THREE.MeshStandardMaterial({
      color: col, emissive: col, emissiveIntensity: 0.9, metalness: 0.4, roughness: 0.15, flatShading: true,
    }));
    gem.scale.y = 1.6;
    const ring = new THREE.Mesh(geo('relicRing', () => new THREE.TorusGeometry(0.34, 0.022, 6, 40)), basic(def.look.glow));
    const ring2 = new THREE.Mesh(geo('relicRing2', () => new THREE.TorusGeometry(0.42, 0.014, 6, 40)), additive(col, 0.7));
    g.add(gem, ring, ring2, M.glow(col, 1.5, 0.6));
    return {
      group: g,
      update(dt, t) {
        gem.rotation.y += dt * 2.2;
        ring.rotation.set(t * 1.3, t * 0.7, 0);
        ring2.rotation.set(-t * 0.9, 0, t * 1.1);
      },
    };
  }

  NEON.rpgData = {
    FACTIONS, FACTION_ORDER, CLASSES, CLASS_ORDER, RARITIES, RARITY_ORDER, MOVE_SPD, RELIC_LVL, HEROES, HERO, HR, heroMods,
    makeHeroModel, makeVirusModel, makeRelicModel, rarityHex, css, rgba,
  };
})();
