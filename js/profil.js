/* ==========================================================================
   NEON SIGIL — player profile
   Coins, owned gear and the equipped loadout, persisted in localStorage.
   Also holds the item catalogue (balls + bouncepads) and rarity tiers.
   ========================================================================== */
(function () {
  'use strict';

  const NEON = (window.NEON = window.NEON || {});
  const KEY = 'neonSigil.profile.v1';
  const START_COINS = 200;

  // Brawl-Stars style rarity ladder
  const RARITY = {
    common:    { name: 'COMMON',     color: '#a9b8d0', rank: 0, dupe: 0 },
    rare:      { name: 'RARE',       color: '#39ff6a', rank: 1, dupe: 30 },
    super:     { name: 'SUPER RARE', color: '#2d9bff', rank: 2, dupe: 60 },
    epic:      { name: 'EPIC',       color: '#b84dff', rank: 3, dupe: 120 },
    mythic:    { name: 'MYTHIC',     color: '#ff2a4d', rank: 4, dupe: 240 },
    legendary: { name: 'LEGENDARY',  color: '#ffd23a', rank: 5, dupe: 480 },
  };

  // Balls carry two abilities: `ability/desc` for Classic & Survival,
  // `fab/fdesc` for Funky Balls. Bouncepads only work in Classic & Survival,
  // Cyberguns only in Funky Balls.
  const ITEMS = {
    ball: [
      { id: 'core', name: 'CORE ORB', rarity: 'common', ability: 'STANDARD ISSUE',
        desc: 'A stable plasma core. No tricks, no surprises.',
        fab: 'BASELINE', fdesc: 'Deals 1 damage per hit. Reliable.' },
      { id: 'shard', name: 'NEON SHARD', rarity: 'rare', ability: 'SHATTER',
        desc: 'Crystal edges deal double damage, so armoured bricks crack twice as fast.',
        fab: 'CRIT SHARDS', fdesc: '20% chance per hit to land a critical strike for 3 damage.' },
      { id: 'pixel', name: 'PIXEL CUBE', rarity: 'rare', ability: 'SCORE HACK',
        desc: '+50% score from every brick, drone and boss hit.',
        fab: 'DATA MINER', fdesc: 'Every destroyed brick has a 30% chance to drop 2 coins.' },
      { id: 'magma', name: 'MAGMA CORE', rarity: 'super', ability: 'MELTDOWN',
        desc: 'Every 8th bounce off your pad ignites the ball: 3 s of plasma that burns straight through bricks.',
        fab: 'IGNITE', fdesc: 'Bricks it hits catch fire and take 1 burn damage at the end of every turn.' },
      { id: 'glitch', name: 'GLITCH ORB', rarity: 'epic', ability: 'GHOST COPY',
        desc: 'Each brick it breaks has a 15% chance to spawn a ghost ball for 8 s. Losing ghosts costs no lives.',
        fab: 'FORK', fdesc: 'The first ball of every volley forks into three on its first brick hit.' },
      { id: 'gyro', name: 'GOLDEN GYRO', rarity: 'epic', ability: 'JACKPOT',
        desc: 'Every coin you pick up is worth double.',
        fab: 'CAROM', fdesc: 'After bouncing off a wall, the ball’s next brick hit deals 2 damage.' },
      { id: 'nova', name: 'SOLAR NOVA', rarity: 'mythic', ability: 'SUPERNOVA',
        desc: 'Every 5th brick it destroys detonates a nova that damages all surrounding bricks.',
        fab: 'CHAIN NOVA', fdesc: 'Every 20th hit in a turn detonates a nova: 2 damage to all 8 surrounding bricks.' },
      { id: 'void', name: 'VOID SINGULARITY', rarity: 'legendary', ability: 'EVENT HORIZON',
        desc: 'Its gravity bends the ball toward the nearest brick while it travels upward.',
        fab: 'GRAVITY WELL', fdesc: 'Balls curve toward the nearest brick while they fly upward.' },
    ],
    pad: [
      { id: 'vector', name: 'VECTOR-1', rarity: 'common', ability: 'STANDARD ISSUE',
        desc: 'Balanced hover deck. Does the job.' },
      { id: 'pulse', name: 'PULSE DECK', rarity: 'rare', ability: 'WIDE BEAM',
        desc: '25% wider than a standard bouncepad.' },
      { id: 'magnet', name: 'MAGNET RAIL', rarity: 'super', ability: 'CATCH',
        desc: 'Catches the ball on contact. Click / Space fires it again (auto-release after 2 s).' },
      { id: 'aegis', name: 'AEGIS', rarity: 'super', ability: 'SAFEGUARD',
        desc: 'Every life starts with an energy barrier that saves one falling ball.' },
      { id: 'twin', name: 'TWIN BLASTER', rarity: 'epic', ability: 'RETALIATE',
        desc: 'Fires a twin laser volley every time the ball bounces off the pad.' },
      { id: 'tesla', name: 'TESLA COIL', rarity: 'epic', ability: 'ARC STRIKE',
        desc: 'Every 5 s a lightning arc jumps from the pad and strikes a random brick.' },
      { id: 'chrono', name: 'CHRONO DECK', rarity: 'mythic', ability: 'BULLET TIME',
        desc: 'Time slows down whenever the ball approaches the pad.' },
      { id: 'seraph', name: 'SERAPH-X', rarity: 'legendary', ability: 'DIVINE FAVOR',
        desc: 'Double power-up drops, power-ups last 50% longer, and capsules & coins drift toward you.' },
    ],
    gun: [
      { id: 'pistol', name: 'PULSE PISTOL', rarity: 'common', fab: 'STANDARD ISSUE',
        fdesc: 'Fires your whole magazine in one straight, tight stream.' },
      { id: 'scatter', name: 'SCATTERBLASTER', rarity: 'rare', fab: 'SPREAD SHOT',
        fdesc: 'Balls leave the barrels in a narrow fan and spray across more bricks.' },
      { id: 'railgun', name: 'RAILGUN MK-II', rarity: 'super', fab: 'OVERCHARGE',
        fdesc: 'The first 3 balls of every volley deal double damage.' },
      { id: 'prism', name: 'PRISM LANCE', rarity: 'epic', fab: 'LASER SIGHT',
        fdesc: 'The aim line predicts 3 bounces instead of 1.' },
      { id: 'helix', name: 'HELIX DRIVER', rarity: 'mythic', fab: 'DOUBLE HELIX',
        fdesc: 'Every 4th ball fired spawns a free twin that deals damage too.' },
      { id: 'archangel', name: 'ARCHANGEL', rarity: 'legendary', fab: 'DIVINE AMMO',
        fdesc: 'Gain +1 ball at the start of every turn.' },
    ],
  };

  const KINDS = ['ball', 'pad', 'gun'];
  const DEFAULT = { ball: 'core', pad: 'vector', gun: 'pistol' };

  // Skill tree — bought with tokens. `requires` names the parent node that must be level 1+.
  const SKILLS = [
    { id: 'coins', name: 'COIN FLOW', icon: 'C+', max: 5, costs: [1, 2, 3, 4, 5], requires: null,
      desc: 'Every coin you earn while playing is worth more (all modes).',
      effect: (l) => '+' + l * 10 + '% coins from runs' },
    { id: 'bargain', name: 'BARGAIN PROTOCOL', icon: '-%', max: 5, costs: [1, 2, 3, 4, 5], requires: 'coins',
      desc: 'Data Boxes cost less in the Cyber-Lottery.',
      effect: (l) => '-' + l * 6 + '% Data Box price' },
    { id: 'crash', name: 'CRASH PLANE', icon: 'CRX', max: 1, costs: [3], requires: 'bargain',
      desc: 'Unlocks Crash Plane in the Cyber-Lottery: the multiplier climbs while the jet rises — cash out before it crashes.',
      effect: (l) => (l ? 'Crash Plane unlocked' : 'Crash Plane locked') },
    { id: 'luck', name: 'LUCKY ALGORITHM', icon: 'LCK', max: 5, costs: [2, 3, 4, 5, 6], requires: 'coins',
      desc: 'Data Boxes drop gear more often and roll Epic, Mythic and Legendary gear more often.',
      effect: (l) => '+' + l * 3 + '% gear drops, Epic+ odds ×' + (1 + l * 0.25).toFixed(2) },
    { id: 'plinko', name: 'PLINKO', icon: 'PLK', max: 1, costs: [3], requires: 'luck',
      desc: 'Unlocks Plinko in the Cyber-Lottery: drop your ball for coins, or hit the token jackpot.',
      effect: (l) => (l ? 'Plinko unlocked' : 'Plinko locked') },
    { id: 'plinkoLuck', name: 'PLINKO LUCK', icon: 'PL+', max: 5, costs: [2, 3, 4, 5, 6], requires: 'plinko',
      desc: 'Plinko balls get lucky bounces toward the high-paying outer slots more often.',
      effect: (l) => '+' + (l * 1.5).toFixed(1) + '% lucky bounces' },
    { id: 'mag', name: 'EXTRA MAGAZINE', icon: '+1', max: 5, costs: [1, 2, 3, 4, 5], requires: null,
      desc: 'Start Funky Balls with more balls in your Cybergun.',
      effect: (l) => (1 + l) + ' starting ball' + (l ? 's' : '') },
    { id: 'dmg', name: 'OVERCLOCK', icon: 'DMG', max: 5, costs: [2, 3, 4, 5, 6], requires: 'mag',
      desc: 'Funky Balls hits get a chance to deal +1 bonus damage.',
      effect: (l) => l * 10 + '% chance of +1 damage' },
    { id: 'slots', name: 'CARD SLOTS', icon: 'SLT', max: 2, costs: [4, 8], requires: 'mag',
      desc: 'Hold more level-up cards at once in Funky Balls. Without it you can only equip a single card type per run.',
      effect: (l) => 'Equip up to ' + (1 + l) + ' card' + (l ? 's' : '') + ' at once' },
  ];

  function defaults() {
    return {
      coins: START_COINS,
      tokens: 0,
      skills: {},
      owned: { ball: [DEFAULT.ball], pad: [DEFAULT.pad], gun: [DEFAULT.gun] },
      equipped: { ball: DEFAULT.ball, pad: DEFAULT.pad, gun: DEFAULT.gun },
      freeBoxes: 0,   // Data Boxes won as RPG AFK loot, opened for free in the lottery
      rpg: null,      // RPG mode state, validated by js/rpg.js
    };
  }

  function find(kind, id) {
    return (ITEMS[kind] || []).find((it) => it.id === id) || null;
  }

  // repair anything odd in stored data so a corrupted save never breaks the game
  function sanitize(d) {
    const out = defaults();
    if (!d || typeof d !== 'object') return out;
    out.coins = Math.max(0, Math.floor(Number(d.coins) || 0));
    out.tokens = Math.max(0, Math.floor(Number(d.tokens) || 0));
    out.freeBoxes = Math.max(0, Math.floor(Number(d.freeBoxes) || 0));
    if (d.rpg && typeof d.rpg === 'object' && !Array.isArray(d.rpg)) out.rpg = d.rpg;
    out.skills = {};
    if (d.skills && typeof d.skills === 'object') {
      SKILLS.forEach((s) => {
        const l = Math.floor(Number(d.skills[s.id]) || 0);
        if (l > 0) out.skills[s.id] = Math.min(s.max, l);
      });
    }
    KINDS.forEach((kind) => {
      const owned = Array.isArray(d.owned && d.owned[kind]) ? d.owned[kind] : [];
      out.owned[kind] = Array.from(new Set([DEFAULT[kind]].concat(owned.filter((id) => find(kind, id)))));
      const eq = d.equipped && d.equipped[kind];
      out.equipped[kind] = out.owned[kind].includes(eq) ? eq : DEFAULT[kind];
    });
    return out;
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return sanitize(JSON.parse(raw));
    } catch (e) { /* unreadable save — start fresh */ }
    return defaults();
  }

  let data = load();
  const listeners = [];
  const lvl = (id) => (data.skills && data.skills[id]) || 0;

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* storage blocked */ }
    listeners.forEach((fn) => { try { fn(data); } catch (e) { console.error(e); } });
  }

  NEON.profile = {
    RARITY,
    RARITY_ORDER: ['common', 'rare', 'super', 'epic', 'mythic', 'legendary'],
    KINDS,
    KIND_NAME: { ball: 'BALL', pad: 'BOUNCEPAD', gun: 'CYBERGUN' },
    ITEMS,
    item: find,
    list(kind) { return ITEMS[kind].slice(); },
    get coins() { return data.coins; },
    addCoins(n) {
      n = Math.floor(n);
      if (!n) return;
      data.coins = Math.max(0, data.coins + n);
      save();
    },
    spend(n) {
      n = Math.floor(n);
      if (n < 0 || data.coins < n) return false;
      data.coins -= n;
      save();
      return true;
    },
    owns(kind, id) { return data.owned[kind].includes(id); },
    ownedCount(kind) { return data.owned[kind].length; },
    // returns true when the item is new, false for a duplicate
    grant(kind, id) {
      if (!find(kind, id) || data.owned[kind].includes(id)) return false;
      data.owned[kind].push(id);
      save();
      return true;
    },
    equip(kind, id) {
      if (!data.owned[kind].includes(id)) return false;
      data.equipped[kind] = id;
      save();
      return true;
    },
    // tokens: earned only by playing Funky Balls (plus the rare Plinko jackpot), spent in the skill tree
    get tokens() { return data.tokens || 0; },
    addTokens(n) {
      n = Math.floor(n);
      if (!n) return;
      data.tokens = Math.max(0, (data.tokens || 0) + n);
      save();
    },
    // free Data Boxes (RPG AFK loot)
    get freeBoxes() { return data.freeBoxes || 0; },
    addFreeBoxes(n) {
      n = Math.floor(n);
      if (!n) return;
      data.freeBoxes = Math.max(0, (data.freeBoxes || 0) + n);
      save();
    },
    useFreeBox() {
      if (!data.freeBoxes) return false;
      data.freeBoxes--;
      save();
      return true;
    },
    // RPG mode state: js/rpg.js owns its shape; commitRpg() persists changes
    rpgData() {
      if (!data.rpg) data.rpg = {};
      return data.rpg;
    },
    commitRpg() { save(); },
    SKILLS,
    skillDef(id) { return SKILLS.find((s) => s.id === id) || null; },
    skill(id) { return (data.skills && data.skills[id]) || 0; },
    skillStatus(id) {
      const def = SKILLS.find((s) => s.id === id);
      const level = (data.skills && data.skills[id]) || 0;
      const maxed = level >= def.max;
      const unlocked = !def.requires || ((data.skills && data.skills[def.requires]) || 0) > 0;
      const cost = maxed ? null : def.costs[level];
      return { level, max: def.max, maxed, unlocked, cost, affordable: !maxed && unlocked && (data.tokens || 0) >= cost };
    },
    upgradeSkill(id) {
      const st = this.skillStatus(id);
      if (!st.affordable) return false;
      data.tokens -= st.cost;
      data.skills = data.skills || {};
      data.skills[id] = st.level + 1;
      save();
      return true;
    },
    // gameplay effects of the skill tree in one place
    perks: {
      coinMult: () => 1 + 0.1 * lvl('coins'),
      boxPriceMult: () => 1 - 0.06 * lvl('bargain'),
      lootItemBonus: () => 0.03 * lvl('luck'),
      lootRareMult: () => 1 + 0.25 * lvl('luck'),
      plinkoUnlocked: () => lvl('plinko') > 0,
      plinkoLuck: () => 0.015 * lvl('plinkoLuck'),
      crashUnlocked: () => lvl('crash') > 0,
      startBalls: () => 1 + lvl('mag'),
      bonusDmgChance: () => 0.1 * lvl('dmg'),
      cardSlots: () => 1 + lvl('slots'),
    },
    equippedId(kind) { return data.equipped[kind]; },
    equipped(kind) { return find(kind, data.equipped[kind]); },
    onChange(fn) { listeners.push(fn); },
  };
})();
