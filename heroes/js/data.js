/* ==========================================================================
   SLING HEROES — game data
   * ELEMENTS: fire > wood > water > fire, light and dark beat each other.
   * HEROES: 25 heroes. Each one has a look (read by js/chars.js to build the
     3D model), base stats, a HYPER skill (charges over a few turns), a COMBO
     skill (fires when another hero bumps into it) and a passive.
     BOUNCE heroes ricochet off enemies, PIERCE heroes fly straight through.
   * ENEMIES and BOSSES with their attacks, CHAPTERS with 8 stages each.
   * ITEMS, GEAR, MISSIONS, the daily gifts and all the formulas
     (hero stats, power, stage strength, rewards) in one place.
   ========================================================================== */
(function () {
  'use strict';

  const SH = (window.SH = window.SH || {});

  const ELEMENTS = {
    fire: { name: 'Fire', color: '#ff5a2a', hex: 0xff5a2a, beats: 'wood' },
    water: { name: 'Water', color: '#2aa8ff', hex: 0x2aa8ff, beats: 'fire' },
    wood: { name: 'Wood', color: '#4ccf3a', hex: 0x4ccf3a, beats: 'water' },
    light: { name: 'Light', color: '#ffd23a', hex: 0xffd23a, beats: 'dark' },
    dark: { name: 'Dark', color: '#b05aff', hex: 0xb05aff, beats: 'light' },
  };
  const EL_ORDER = ['fire', 'water', 'wood', 'light', 'dark'];
  // 1.5 when the attacker has the advantage, 0.8 when the defender has it
  function elementMod(att, def) {
    if (!att || !def) return 1;
    if (ELEMENTS[att].beats === def) return 1.5;
    if (ELEMENTS[def].beats === att && !(att === 'light' || att === 'dark')) return 0.8;
    return 1;
  }

  const RARITY = {
    B: { name: 'B', color: '#7fb8ff', base: { hp: 900, atk: 250 }, shards: 10, frame: 'r-b' },
    A: { name: 'A', color: '#c07aff', base: { hp: 1080, atk: 305 }, shards: 20, frame: 'r-a' },
    S: { name: 'S', color: '#ffb43a', base: { hp: 1300, atk: 380 }, shards: 30, frame: 'r-s' },
    SS: { name: 'SS', color: '#ff4a6a', base: { hp: 1580, atk: 465 }, shards: 50, frame: 'r-ss' },
  };
  const RARITY_ORDER = ['B', 'A', 'S', 'SS'];

  // ------------------------------------------------------------ skills
  const HYPERS = {
    inferno: { kind: 'empower', name: 'Inferno Rush', desc: 'Bursts into flames: flies faster, pierces everything and deals 2.5x damage, leaving a burning trail.' },
    glacier: { kind: 'empower', name: 'Glacier Lance', desc: 'Becomes a lance of ice: pierces through and freezes every enemy it hits.' },
    reaper: { kind: 'empower', name: 'Soul Reaper', desc: 'Dark blade form: pierces through, deals 2.5x damage and heals the team with every hit.' },
    windslash: { kind: 'empower', name: 'Gale Slash', desc: 'Rides the wind: flies much faster and sends wind blades to enemies on every hit.' },
    meteor: { kind: 'meteor', name: 'Meteor Rain', desc: 'Calls down 9 burning meteors on the enemies.' },
    starfall: { kind: 'meteor', name: 'Starfall', desc: 'Stars rain from the sky and smash into 10 random enemies.' },
    judgment: { kind: 'beam', name: 'Judgment Ray', desc: 'A pillar of holy light sweeps over the arena and burns every enemy.' },
    radiant: { kind: 'beam', name: 'Radiant Fist', desc: 'Fires a giant fist of light at the strongest enemy and everything behind it.' },
    quake: { kind: 'nova', name: 'Earthsplitter', desc: 'Slams the ground: a shockwave hits every enemy and stuns them (+1 turn).' },
    solar: { kind: 'nova', name: 'Solar Hammer', desc: 'A blazing hammer strike. The closer the enemy, the harder it hits.' },
    palm: { kind: 'nova', name: 'Iron Palm', desc: 'A wave of chi that knocks every enemy back and stuns them (+1 turn).' },
    bullets: { kind: 'barrage', name: 'Bullet Storm', desc: 'Fires 24 homing bullets at the enemies.' },
    cannons: { kind: 'barrage', name: 'Cannon Barrage', desc: 'The ship fires 12 heavy cannon balls that explode on impact.' },
    arrows: { kind: 'barrage', name: 'Thousand Arrows', desc: 'A storm of 30 glowing arrows hunts down the enemies.' },
    zero: { kind: 'freeze', name: 'Absolute Zero', desc: 'Freezes every enemy (+2 turns) and shatters them for big damage.' },
    vines: { kind: 'freeze', name: 'Vine Prison', desc: 'Thorny vines grab every enemy (+2 turns) and poison them.' },
    rain: { kind: 'heal', name: 'Healing Rain', desc: 'Heals 35% of the team HP.' },
    sanctuary: { kind: 'heal', name: 'Sanctuary', desc: 'Heals 40% of the team HP and blocks the next enemy attacks.' },
    bloom: { kind: 'heal', name: 'Bloom', desc: 'Flowers bloom: heals 30% of the team HP and boosts the next shot.' },
    tidal: { kind: 'wave', name: 'Tidal Wave', desc: 'A giant wave rolls over the whole arena and hits every enemy twice.' },
    clones: { kind: 'clones', name: 'Shadow Clones', desc: 'Splits into 3 shadows that are slung together.' },
    void: { kind: 'blackhole', name: 'Void Rift', desc: 'Opens a black hole that pulls in the enemies and crushes them.' },
    drain: { kind: 'drain', name: 'Drain Kiss', desc: 'Steals life from every enemy and heals the team.' },
    crimson: { kind: 'drain', name: 'Crimson Night', desc: 'A blood moon rises: huge damage to every enemy, half of it heals the team.' },
    burst: { kind: 'burst', name: 'Flame Burst', desc: 'Explodes in flames, then flies with double damage.' },
  };

  const COMBOS = {
    laserH: { name: 'Side Laser', desc: 'Fires a laser to the left and right.' },
    laserV: { name: 'Sky Laser', desc: 'Fires a laser up and down.' },
    laserX: { name: 'Cross Laser', desc: 'Fires lasers in 4 directions.' },
    laser8: { name: 'Star Laser', desc: 'Fires lasers in 8 directions.' },
    blast: { name: 'Blast', desc: 'An explosion hits the enemies around it.' },
    homing: { name: 'Homing Orbs', desc: 'Sends 5 orbs that hunt enemies.' },
    chain: { name: 'Chain Lightning', desc: 'Lightning jumps between 5 enemies.' },
    heal: { name: 'Heal', desc: 'Heals 6% of the team HP.' },
    shield: { name: 'Guard', desc: 'Blocks 30% of the next enemy attack.' },
    arrows: { name: 'Arrow Fan', desc: 'Fires a fan of 7 arrows.' },
    nova: { name: 'Nova', desc: 'A ring of energy hits everything nearby.' },
    meteor1: { name: 'Fireball', desc: 'Drops a fireball on the nearest enemy.' },
  };

  const PASSIVES = {
    atkEl: { name: 'Elemental Bond', desc: (v, el) => `+${v}% ATK for ${ELEMENTS[el].name} heroes in the team.` },
    hpTeam: { name: 'Fortitude', desc: (v) => `+${v}% team HP.` },
    weak: { name: 'Weak Spot Hunter', desc: (v) => `+${v}% weakness damage.` },
    regen: { name: 'Blessing', desc: (v) => `Heals ${v}% of the team HP every turn.` },
    comboUp: { name: 'Teamwork', desc: (v) => `+${v}% combo skill damage.` },
    firstHit: { name: 'Opening Strike', desc: (v) => `The first hit of each shot deals +${v}% damage.` },
    hyperFast: { name: 'Quick Charge', desc: (v) => `Hyper skills charge ${v}% faster.` },
    bossDmg: { name: 'Giant Slayer', desc: (v) => `+${v}% damage against bosses.` },
    lifesteal: { name: 'Vampirism', desc: (v) => `${v}% of this hero's damage heals the team.` },
    critUp: { name: 'Elemental Mastery', desc: (v) => `Element advantage deals +${v}% more.` },
  };

  // ------------------------------------------------------------ heroes
  const H = (id, name, title, el, rarity, type, role, spd, hpK, atkK, hyper, charge, combo, comboPow, passive, pv, look) => ({
    id, name, title, el, rarity, type, role, spd, hpK, atkK, hyper, charge, combo, comboPow, passive, pv, look,
  });

  const HEROES = [
    // ---------------- fire
    H('ignis', 'Ignis', 'Flame Warlord', 'fire', 'SS', 'pierce', 'Warrior', 450, 1.05, 1.08, 'inferno', 5, 'laserX', 1.1, 'atkEl', 20, {
      skin: '#f2c7a5', hair: { style: 'spiky', color: '#e0281c' }, eyes: { color: '#ffb020', style: 'sharp' }, mouth: 'grin',
      body: { style: 'armor', top: '#3a2a30', bottom: '#2a1e22', accent: '#d4301e' }, metal: '#3a3036',
      head: ['horns'], weapon: 'flamesword', cape: '#8a1010', glow: '#ff6a1a' }),
    H('pyra', 'Pyra', 'Ember Witch', 'fire', 'S', 'bounce', 'Mage', 560, 0.92, 1.05, 'meteor', 4, 'meteor1', 1.3, 'comboUp', 25, {
      skin: '#ffe2cc', hair: { style: 'twintails', color: '#ff7a1a' }, eyes: { color: '#ff4a2a', style: 'cute' }, mouth: 'open',
      body: { style: 'dress', top: '#d42a3a', bottom: '#ffb43a', accent: '#ffe08a' },
      head: ['witch'], hatColor: '#c41e30', weapon: 'staff', glow: '#ff7a2a' }),
    H('brakk', 'Brakk', 'Mountain Berserker', 'fire', 'A', 'pierce', 'Warrior', 420, 1.15, 0.98, 'quake', 4, 'blast', 1.0, 'hpTeam', 8, {
      skin: '#dba27c', hair: { style: 'messy', color: '#8a3a16' }, beard: '#8a3a16', eyes: { color: '#ffaa33', style: 'fierce' }, mouth: 'grin',
      body: { style: 'tunic', top: '#7a4a2a', bottom: '#4a3020', accent: '#c08a3a' }, metal: '#9a9aa4',
      head: ['vikinghelm'], weapon: 'axe', scale: 1.06 }),
    H('scarlet', 'Scarlet', 'Crimson Gunslinger', 'fire', 'S', 'bounce', 'Gunner', 580, 0.95, 1.02, 'bullets', 4, 'homing', 0.9, 'firstHit', 60, {
      skin: '#ffdcc4', hair: { style: 'long', color: '#b8202a' }, eyes: { color: '#ff5050', style: 'cool' }, mouth: 'smirk',
      body: { style: 'coat', top: '#a01a2a', bottom: '#2a1a1a', accent: '#ffcc55' },
      head: ['tricorn'], hatColor: '#2a1a1a', weapon: 'pistols' }),
    H('cinder', 'Cinder', 'Little Imp', 'fire', 'B', 'bounce', 'Rogue', 600, 0.9, 0.95, 'burst', 3, 'blast', 0.8, 'hyperFast', 15, {
      skin: '#e8705a', hair: { style: 'short', color: '#2a1010' }, eyes: { color: '#ffdd33', style: 'cute' }, mouth: 'fang',
      body: { style: 'tunic', top: '#3a2020', bottom: '#2a1616', accent: '#ff9a3a' },
      head: ['horns'], tail: 'devil', weapon: 'claws', glow: '#ff7a2a', scale: 0.92 }),
    // ---------------- water
    H('marina', 'Marina', 'Tide Princess', 'water', 'SS', 'bounce', 'Mage', 570, 1.0, 1.06, 'tidal', 5, 'laser8', 0.9, 'atkEl', 20, {
      skin: '#ffe6d6', hair: { style: 'long', color: '#3ad6e0' }, eyes: { color: '#2a7aff', style: 'normal' }, mouth: 'smile',
      body: { style: 'dress', top: '#2a8ad8', bottom: '#1a5ab0', accent: '#ffd86a' },
      head: ['crown'], weapon: 'trident', glow: '#5af0ff' }),
    H('yuki', 'Yuki', 'Frost Blade', 'water', 'S', 'pierce', 'Ninja', 470, 0.92, 1.08, 'zero', 4, 'laserV', 1.1, 'weak', 40, {
      skin: '#fff0e8', hair: { style: 'ponytail', color: '#eaf4ff' }, eyes: { color: '#5ab8ff', style: 'sharp' }, mouth: 'neutral',
      body: { style: 'ninja', top: '#2a3a6a', bottom: '#1a2240', accent: '#9ad8ff' },
      head: ['headband'], scarf: '#9ad8ff', weapon: 'katana', glow: '#9ae8ff' }),
    H('finn', 'Admiral Finn', 'Storm Captain', 'water', 'A', 'bounce', 'Gunner', 540, 1.05, 0.98, 'cannons', 4, 'homing', 0.8, 'bossDmg', 25, {
      skin: '#e8b894', hair: { style: 'short', color: '#3a2a1a' }, beard: '#3a2a1a', eyes: { color: '#3a6aff', style: 'normal' }, mouth: 'grin',
      body: { style: 'coat', top: '#1a3a7a', bottom: '#e8e0cc', accent: '#e8c050' },
      head: ['bicorne'], hatColor: '#1a2240', weapon: 'cutlass' }),
    H('nerio', 'Nerio', 'Rain Caller', 'water', 'B', 'bounce', 'Healer', 540, 1.0, 0.85, 'rain', 4, 'heal', 1.0, 'regen', 3, {
      skin: '#ffe2cc', hair: { style: 'bob', color: '#3a6ad8' }, eyes: { color: '#3ab0ff', style: 'cute' }, mouth: 'smile',
      body: { style: 'robe', top: '#2a6ac8', bottom: '#1a3a8a', accent: '#bfe8ff' },
      head: ['hood'], hatColor: '#2a5ab8', weapon: 'orb', glow: '#6ad8ff', scale: 0.95 }),
    H('glacia', 'Glacia', 'Ice Valkyrie', 'water', 'S', 'pierce', 'Knight', 440, 1.12, 0.98, 'glacier', 4, 'shield', 1.0, 'hpTeam', 12, {
      skin: '#f5e0d6', hair: { style: 'long', color: '#cfe8ff' }, eyes: { color: '#7ac8ff', style: 'cool' }, mouth: 'neutral',
      body: { style: 'armor', top: '#d8ecff', bottom: '#8ab8e0', accent: '#3a8ad8' }, metal: '#c8dcef',
      head: ['tiara'], weapon: 'lance', cape: '#3a7ac8', glow: '#9ae8ff' }),
    // ---------------- wood
    H('sylva', 'Sylva', 'Queen of the Woods', 'wood', 'SS', 'bounce', 'Archer', 590, 0.96, 1.08, 'arrows', 5, 'arrows', 1.0, 'critUp', 30, {
      skin: '#ffe6d0', hair: { style: 'long', color: '#9ae04a' }, eyes: { color: '#3ad87a', style: 'normal' }, mouth: 'smile',
      body: { style: 'dress', top: '#2a8a3a', bottom: '#e8d8a8', accent: '#ffd86a' },
      head: ['elfears', 'flower'], weapon: 'bow', cape: '#1a6a2a', glow: '#b8ff7a' }),
    H('thorn', 'Thorn', 'Elder Druid', 'wood', 'S', 'pierce', 'Druid', 440, 1.08, 1.0, 'vines', 4, 'chain', 0.9, 'regen', 4, {
      skin: '#d8b090', hair: { style: 'messy', color: '#5a3a1a' }, beard: '#5a3a1a', eyes: { color: '#9aff5a', style: 'fierce' }, mouth: 'neutral',
      body: { style: 'robe', top: '#3a5a2a', bottom: '#2a3a1a', accent: '#9ad84a' },
      head: ['antlers'], weapon: 'staff', cape: '#2a4a1a', glow: '#9aff4a' }),
    H('lin', 'Lin', 'Bamboo Monk', 'wood', 'A', 'pierce', 'Monk', 450, 1.1, 0.96, 'palm', 4, 'nova', 1.0, 'firstHit', 50, {
      skin: '#ffe8d8', hair: { style: 'short', color: '#1a1a1a' }, eyes: { color: '#2a2a2a', style: 'cute' }, mouth: 'smile',
      body: { style: 'monk', top: '#ececec', bottom: '#1a1a1a', accent: '#d83a2a' },
      head: ['pandahood'], weapon: 'bamboo' }),
    H('pip', 'Pip', 'Forest Sprite', 'wood', 'B', 'bounce', 'Healer', 600, 0.88, 0.9, 'bloom', 3, 'heal', 0.8, 'hyperFast', 20, {
      skin: '#ffe8d4', hair: { style: 'short', color: '#ffb84a' }, eyes: { color: '#4ad84a', style: 'cute' }, mouth: 'open',
      body: { style: 'tunic', top: '#4ab84a', bottom: '#2a7a2a', accent: '#ffe08a' },
      head: ['leafhat'], wings: 'fairy', weapon: 'wand', glow: '#aaff66', scale: 0.9 }),
    H('kenji', 'Kenji', 'Wandering Ronin', 'wood', 'A', 'pierce', 'Samurai', 470, 0.98, 1.04, 'windslash', 4, 'laserH', 1.0, 'weak', 30, {
      skin: '#f0c8a0', hair: { style: 'ponytail', color: '#1a1a2a' }, eyes: { color: '#3a3a2a', style: 'sharp' }, mouth: 'neutral',
      body: { style: 'tunic', top: '#3a6a3a', bottom: '#2a2a2a', accent: '#d8c060' },
      head: ['strawhat'], weapon: 'katana' }),
    // ---------------- light
    H('lumina', 'Lumina', 'Seraph Paladin', 'light', 'SS', 'bounce', 'Paladin', 560, 1.1, 1.04, 'judgment', 5, 'laserX', 1.1, 'hpTeam', 15, {
      skin: '#ffe8da', hair: { style: 'long', color: '#ffe070' }, eyes: { color: '#3a8aff', style: 'normal' }, mouth: 'smile',
      body: { style: 'armor', top: '#f4f4ff', bottom: '#e0e4f4', accent: '#ffcc33' }, metal: '#f0e4c8',
      head: ['halo', 'tiara'], weapon: 'sword', offhand: 'shield', wings: 'angel', glow: '#fff2a0' }),
    H('aurelia', 'Aurelia', 'Dawn Priestess', 'light', 'S', 'bounce', 'Healer', 550, 1.02, 0.9, 'sanctuary', 4, 'heal', 1.2, 'regen', 5, {
      skin: '#ffeadc', hair: { style: 'bob', color: '#fff0b0' }, eyes: { color: '#d8a03a', style: 'closed' }, mouth: 'smile',
      body: { style: 'robe', top: '#ffffff', bottom: '#f0e0b0', accent: '#e8b830' },
      head: ['halo'], weapon: 'staff', glow: '#fff0a0' }),
    H('leon', 'Leon', 'Golden Lion', 'light', 'A', 'pierce', 'Knight', 430, 1.12, 1.0, 'solar', 4, 'blast', 1.1, 'bossDmg', 30, {
      skin: '#e8c0a0', hair: { style: 'spiky', color: '#e8a030' }, eyes: { color: '#d88a20', style: 'fierce' }, mouth: 'grin',
      body: { style: 'armor', top: '#e8c050', bottom: '#b88a30', accent: '#c02a2a' }, metal: '#e8c050',
      head: ['plumehelm'], weapon: 'hammer', cape: '#c02a2a', glow: '#ffd23a' }),
    H('sol', 'Sol', 'Sunfist', 'light', 'B', 'pierce', 'Brawler', 460, 1.0, 0.95, 'radiant', 3, 'nova', 0.8, 'firstHit', 40, {
      skin: '#e0a878', hair: { style: 'spiky', color: '#ff9a2a' }, eyes: { color: '#ffaa2a', style: 'fierce' }, mouth: 'grin',
      body: { style: 'monk', top: '#ff9a2a', bottom: '#7a3a1a', accent: '#ffe08a' },
      head: ['headband'], headbandColor: '#d82a2a', weapon: 'fists', glow: '#ffd23a' }),
    H('celeste', 'Celeste', 'Star Sage', 'light', 'S', 'bounce', 'Mage', 560, 0.94, 1.06, 'starfall', 4, 'chain', 1.0, 'comboUp', 30, {
      skin: '#ffece0', hair: { style: 'twintails', color: '#e8e0ff' }, eyes: { color: '#ffd84a', style: 'cute' }, mouth: 'smile',
      body: { style: 'dress', top: '#2a2a6a', bottom: '#3a3a8a', accent: '#ffd84a' },
      head: ['starhat'], hatColor: '#2a2a6a', weapon: 'book', glow: '#ffe680' }),
    // ---------------- dark
    H('noir', 'Count Noir', 'Pale Count', 'dark', 'SS', 'pierce', 'Swordsman', 460, 0.98, 1.12, 'crimson', 5, 'laserH', 1.2, 'lifesteal', 8, {
      skin: '#f2e8ec', hair: { style: 'short', color: '#2a2a3a' }, eyes: { color: '#e0203a', style: 'sharp' }, mouth: 'smirk',
      body: { style: 'coat', top: '#1a1a2a', bottom: '#2a2a3a', accent: '#c8a040' },
      head: ['tophat'], hatColor: '#121218', weapon: 'rapier', cape: '#6a0a1a', glow: '#ff2a4a' }),
    H('nyx', 'Nyx', 'Void Witch', 'dark', 'S', 'bounce', 'Mage', 560, 0.94, 1.06, 'void', 4, 'homing', 1.0, 'atkEl', 15, {
      skin: '#f4e0f0', hair: { style: 'long', color: '#7a3ad8' }, eyes: { color: '#d84aff', style: 'cool' }, mouth: 'smirk',
      body: { style: 'dress', top: '#2a1a3a', bottom: '#5a2a8a', accent: '#d84aff' },
      head: ['witch'], hatColor: '#2a1a3a', weapon: 'scythe', glow: '#c04aff' }),
    H('mortis', 'Mortis', 'Death Knight', 'dark', 'A', 'pierce', 'Knight', 430, 1.15, 0.98, 'reaper', 4, 'laserV', 1.0, 'lifesteal', 6, {
      skin: '#b8b8cc', hair: { style: 'none', color: '#222' }, eyes: { color: '#5affc8', style: 'glow' }, mouth: 'none',
      body: { style: 'armor', top: '#2a2a38', bottom: '#1e1e2a', accent: '#5affc8' }, metal: '#3a3a4a',
      head: ['darkhelm'], weapon: 'greatsword', cape: '#1a1a24', glow: '#5affc8' }),
    H('shade', 'Shade', 'Night Assassin', 'dark', 'S', 'pierce', 'Assassin', 480, 0.9, 1.1, 'clones', 4, 'chain', 1.0, 'weak', 50, {
      skin: '#f0d8c8', hair: { style: 'messy', color: '#3a3a5a' }, eyes: { color: '#b04aff', style: 'sharp' }, mouth: 'none',
      body: { style: 'ninja', top: '#2a2236', bottom: '#1a1622', accent: '#8a4aff' },
      head: ['hood', 'mask'], hatColor: '#2a2236', scarf: '#8a2aff', weapon: 'daggers', glow: '#b04aff' }),
    H('lili', 'Lili', 'Little Succubus', 'dark', 'B', 'bounce', 'Rogue', 590, 0.92, 0.95, 'drain', 3, 'homing', 0.7, 'lifesteal', 5, {
      skin: '#ffe0e8', hair: { style: 'twintails', color: '#ff5aa8' }, eyes: { color: '#ff3a8a', style: 'cute' }, mouth: 'fang',
      body: { style: 'dress', top: '#3a1a3a', bottom: '#ff5aa8', accent: '#ffd0e8' },
      head: ['horns'], wings: 'bat', tail: 'devil', weapon: 'whip', glow: '#ff5aa8', scale: 0.92 }),
  ];
  const HERO = {};
  HEROES.forEach((h) => { HERO[h.id] = h; });

  // ------------------------------------------------------------ enemies
  // model = builder in js/chars.js, look = colours for it. hp / atk are multiples of the stage strength.
  // atk: melee (runs at a hero), shot (projectile), aoe (hits the whole team), laser, heal (heals enemies)
  const ENEMIES = {
    // forest
    slime: { name: 'Slime', model: 'slime', el: 'wood', hp: 0.8, atk: 0.8, r: 0.85, cd: [2, 3], attack: 'melee', look: { color: '#5ad84a' } },
    goblin: { name: 'Goblin', model: 'goblin', el: 'wood', hp: 1.0, atk: 1.0, r: 0.85, cd: [2, 3], attack: 'melee', look: { skin: '#7ac850', cloth: '#7a5a2a', weapon: 'club' } },
    shroom: { name: 'Shroomling', model: 'mushroom', el: 'wood', hp: 0.9, atk: 0.9, r: 0.8, cd: [3, 3], attack: 'shot', look: { cap: '#d83a3a', dots: '#fff' } },
    wolf: { name: 'Thorn Wolf', model: 'wolf', el: 'wood', hp: 1.1, atk: 1.1, r: 0.95, cd: [2, 2], attack: 'melee', look: { fur: '#6a6a5a', belly: '#c8c0a8', eye: '#ffdd44' } },
    goblinChief: { name: 'Goblin Chief', model: 'goblin', el: 'wood', hp: 6, atk: 1.6, r: 1.5, cd: [2, 3], attack: 'aoe', mini: true, look: { skin: '#5aa83a', cloth: '#a03a2a', weapon: 'axe', crown: true, scale: 1.7 } },
    treant: { name: 'Elder Treant', model: 'treant', el: 'wood', hp: 14, atk: 2.0, r: 2.1, cd: [2, 3], attack: 'aoe', boss: true, look: { bark: '#6a4a2a', leaves: '#4aa83a', eye: '#ffd23a' } },
    // frost
    iceslime: { name: 'Frost Slime', model: 'slime', el: 'water', hp: 0.8, atk: 0.8, r: 0.85, cd: [2, 3], attack: 'melee', look: { color: '#7ad8ff' } },
    frostwolf: { name: 'Frost Wolf', model: 'wolf', el: 'water', hp: 1.1, atk: 1.1, r: 0.95, cd: [2, 2], attack: 'melee', look: { fur: '#dce8f4', belly: '#ffffff', eye: '#4ac8ff' } },
    icebat: { name: 'Ice Bat', model: 'bat', el: 'water', hp: 0.8, atk: 1.0, r: 0.8, cd: [2, 3], attack: 'shot', look: { body: '#5a7ab8', wing: '#8ab8e8', eye: '#aef4ff' } },
    yeti: { name: 'Yeti', model: 'yeti', el: 'water', hp: 1.4, atk: 1.2, r: 1.05, cd: [3, 3], attack: 'melee', look: { fur: '#eef4ff', skin: '#8ab0d8' } },
    yetiAlpha: { name: 'Yeti Alpha', model: 'yeti', el: 'water', hp: 6, atk: 1.6, r: 1.5, cd: [2, 3], attack: 'aoe', mini: true, look: { fur: '#cfe0f4', skin: '#5a80b8', scale: 1.5 } },
    frostdrake: { name: 'Frost Drake', model: 'dragon', el: 'water', hp: 15, atk: 2.0, r: 2.1, cd: [2, 3], attack: 'laser', boss: true, look: { body: '#6ab8e8', belly: '#dff4ff', wing: '#3a78b8', horn: '#eef8ff', eye: '#ffffff' } },
    // desert
    scorpion: { name: 'Sand Scorpion', model: 'scorpion', el: 'fire', hp: 1.1, atk: 1.1, r: 0.95, cd: [2, 3], attack: 'melee', look: { shell: '#c88a3a', dark: '#6a3a1a' } },
    mummy: { name: 'Mummy', model: 'mummy', el: 'dark', hp: 1.2, atk: 1.0, r: 0.85, cd: [3, 3], attack: 'shot', look: { wrap: '#e0d4b0', eye: '#7affb0' } },
    sandgolem: { name: 'Sandstone Golem', model: 'golem', el: 'fire', hp: 1.6, atk: 1.1, r: 1.05, cd: [3, 4], attack: 'melee', look: { rock: '#c8a06a', rune: '#ffb43a' } },
    cobra: { name: 'Desert Cobra', model: 'snake', el: 'fire', hp: 0.9, atk: 1.2, r: 0.85, cd: [2, 2], attack: 'shot', look: { skin: '#d8b04a', belly: '#f4e0a0', eye: '#ff3a3a' } },
    pharaoh: { name: 'Mummy Pharaoh', model: 'mummy', el: 'dark', hp: 6, atk: 1.6, r: 1.5, cd: [2, 3], attack: 'aoe', mini: true, look: { wrap: '#e8dcb8', eye: '#ffd23a', crown: true, scale: 1.6 } },
    colossus: { name: 'Desert Colossus', model: 'golem', el: 'fire', hp: 16, atk: 2.1, r: 2.2, cd: [3, 3], attack: 'aoe', boss: true, look: { rock: '#b88a50', rune: '#ff7a1a', scale: 2.2 } },
    // crypt
    skeleton: { name: 'Skeleton', model: 'skeleton', el: 'dark', hp: 1.0, atk: 1.0, r: 0.85, cd: [2, 3], attack: 'melee', look: { bone: '#ece6d6', eye: '#ff4a3a' } },
    ghost: { name: 'Phantom', model: 'ghost', el: 'dark', hp: 0.9, atk: 1.1, r: 0.85, cd: [2, 3], attack: 'shot', look: { color: '#a8c8ff', eye: '#3affd8' } },
    vampbat: { name: 'Vampire Bat', model: 'bat', el: 'dark', hp: 0.8, atk: 1.0, r: 0.8, cd: [2, 2], attack: 'melee', look: { body: '#3a2a3a', wing: '#6a2a4a', eye: '#ff3a3a' } },
    zombie: { name: 'Ghoul', model: 'goblin', el: 'dark', hp: 1.3, atk: 1.0, r: 0.9, cd: [3, 3], attack: 'melee', look: { skin: '#8aa88a', cloth: '#4a4a5a', weapon: 'none', zombie: true } },
    boneknight: { name: 'Bone Knight', model: 'skeleton', el: 'dark', hp: 6, atk: 1.6, r: 1.5, cd: [2, 3], attack: 'aoe', mini: true, look: { bone: '#d8d0c0', eye: '#7affd8', armor: true, scale: 1.6 } },
    lich: { name: 'Lich King', model: 'lich', el: 'dark', hp: 16, atk: 2.1, r: 2.0, cd: [2, 3], attack: 'laser', boss: true, look: { robe: '#2a1a3a', trim: '#7affd8', bone: '#e8e2d2' } },
    // infernal
    imp: { name: 'Imp', model: 'imp', el: 'fire', hp: 0.9, atk: 1.0, r: 0.8, cd: [2, 3], attack: 'shot', look: { skin: '#d8302a', wing: '#5a1a1a', eye: '#ffe03a' } },
    hellhound: { name: 'Hellhound', model: 'wolf', el: 'fire', hp: 1.2, atk: 1.2, r: 1.0, cd: [2, 2], attack: 'melee', look: { fur: '#3a1a16', belly: '#6a2a1a', eye: '#ffb43a', flame: true } },
    firebat: { name: 'Flame Bat', model: 'bat', el: 'fire', hp: 0.8, atk: 1.0, r: 0.8, cd: [2, 3], attack: 'shot', look: { body: '#6a1a1a', wing: '#d8401a', eye: '#ffe03a' } },
    demon: { name: 'Lesser Demon', model: 'demon', el: 'fire', hp: 1.5, atk: 1.2, r: 1.05, cd: [3, 3], attack: 'aoe', look: { skin: '#b82a22', armor: '#2a1a1a', horn: '#e8dcc0', eye: '#ffe03a', scale: 1.0 } },
    brute: { name: 'Demon Brute', model: 'demon', el: 'fire', hp: 6.5, atk: 1.7, r: 1.6, cd: [2, 3], attack: 'aoe', mini: true, look: { skin: '#8a1a1a', armor: '#3a2a2a', horn: '#2a2020', eye: '#ffb43a', scale: 1.6 } },
    demonlord: { name: 'Azgor the Demon Lord', model: 'demonlord', el: 'fire', hp: 18, atk: 2.2, r: 2.2, cd: [2, 3], attack: 'laser', boss: true, look: { skin: '#6a1a22', armor: '#2a2026', gold: '#c8902a', eye: '#ffd23a', flame: '#ff5a1a' } },
    // abyss
    fishman: { name: 'Deep One', model: 'fishman', el: 'water', hp: 1.1, atk: 1.1, r: 0.9, cd: [2, 3], attack: 'melee', look: { skin: '#3a9a9a', fin: '#2a6a8a', eye: '#ffe03a' } },
    crab: { name: 'Iron Crab', model: 'crab', el: 'water', hp: 1.5, atk: 1.0, r: 1.0, cd: [3, 3], attack: 'melee', look: { shell: '#d84a3a', claw: '#f08a5a' } },
    jelly: { name: 'Glow Jelly', model: 'jelly', el: 'light', hp: 0.8, atk: 1.0, r: 0.85, cd: [2, 3], attack: 'shot', look: { color: '#ff7ad8', glow: '#ffb0f0' } },
    seaslime: { name: 'Abyss Slime', model: 'slime', el: 'dark', hp: 0.9, atk: 0.9, r: 0.85, cd: [2, 3], attack: 'melee', look: { color: '#7a5ad8' } },
    crabking: { name: 'Crab King', model: 'crab', el: 'water', hp: 7, atk: 1.6, r: 1.6, cd: [2, 3], attack: 'aoe', mini: true, look: { shell: '#e8b83a', claw: '#ffd86a', crown: true, scale: 1.6 } },
    tidetitan: { name: 'Thalassor the Tide Titan', model: 'titan', el: 'water', hp: 19, atk: 2.2, r: 2.2, cd: [2, 3], attack: 'laser', boss: true, look: { skin: '#e8a882', hair: '#2a4a8a', armor: '#2a4a9a', gold: '#e8b83a', water: '#3ad8ff' } },
    // guild raid boss
    ancient: { name: 'Ancient Guardian', model: 'golem', el: 'light', hp: 999, atk: 1.8, r: 2.4, cd: [2, 2], attack: 'aoe', boss: true, look: { rock: '#8a8aa0', rune: '#7ad8ff', scale: 2.5 } },
  };

  // ------------------------------------------------------------ chapters
  // theme = arena look in js/battle.js, map = terrain colours in js/worldmap.js
  const CHAPTERS = [
    { id: 1, name: 'Verdant Woods', theme: 'forest', mobs: ['slime', 'goblin', 'shroom', 'wolf'], mini: 'goblinChief', boss: 'treant', bg: '#3a7a2a' },
    { id: 2, name: 'Frost Peaks', theme: 'frost', mobs: ['iceslime', 'frostwolf', 'icebat', 'yeti'], mini: 'yetiAlpha', boss: 'frostdrake', bg: '#8ab8e0' },
    { id: 3, name: 'Sunscorch Dunes', theme: 'desert', mobs: ['scorpion', 'mummy', 'sandgolem', 'cobra'], mini: 'pharaoh', boss: 'colossus', bg: '#d8a85a' },
    { id: 4, name: 'Haunted Crypt', theme: 'crypt', mobs: ['skeleton', 'ghost', 'vampbat', 'zombie'], mini: 'boneknight', boss: 'lich', bg: '#4a3a6a' },
    { id: 5, name: 'Infernal Depths', theme: 'lava', mobs: ['imp', 'hellhound', 'firebat', 'demon'], mini: 'brute', boss: 'demonlord', bg: '#8a2a1a' },
    { id: 6, name: 'Sunken Temple', theme: 'abyss', mobs: ['fishman', 'crab', 'jelly', 'seaslime'], mini: 'crabking', boss: 'tidetitan', bg: '#1a5a7a' },
  ];
  const STAGES_PER_CHAPTER = 8;
  const DIFFS = {
    normal: { name: 'Normal', lvl: 0, k: 1, stamina: 6, reward: 1 },
    elite: { name: 'Elite', lvl: 6, k: 1.7, stamina: 10, reward: 2 },
    nightmare: { name: 'Nightmare', lvl: 12, k: 2.8, stamina: 15, reward: 3.5 },
  };
  const DIFF_ORDER = ['normal', 'elite', 'nightmare'];

  // recommended hero level for a stage
  const stageLevel = (ch, st, diff) => 1 + (ch - 1) * 7 + Math.round((st - 1) * 0.9) + DIFFS[diff || 'normal'].lvl;

  // ------------------------------------------------------------ hero formulas
  const levelCap = (stars) => 20 + stars * 10;           // 1★ 30 … 6★ 80
  const MAX_STARS = 6;
  const starCost = (stars) => [0, 10, 20, 40, 60, 90, 0][stars] || 0;   // shards for the next star
  const expNeed = (lvl) => Math.round(60 * Math.pow(1.14, lvl - 1));
  const goldNeed = (lvl) => Math.round(40 + lvl * lvl * 6);
  const RANKS = [
    { name: 'White', color: '#d8dce8' }, { name: 'Green', color: '#4ad86a' }, { name: 'Blue', color: '#3a9aff' },
    { name: 'Purple', color: '#b45aff' }, { name: 'Orange', color: '#ff9a2a' }, { name: 'Red', color: '#ff3a4a' }, { name: 'Rainbow', color: '#ffffff' },
  ];
  const GEAR_SLOTS = ['weapon', 'armor', 'helm', 'charm'];
  const GEAR_TIER = [
    { name: 'Bronze', color: '#c88a5a' }, { name: 'Silver', color: '#c8d0dc' }, { name: 'Gold', color: '#ffc83a' },
    { name: 'Epic', color: '#b45aff' }, { name: 'Legend', color: '#ff7a2a' }, { name: 'Mythic', color: '#ff3a6a' },
  ];
  const GEAR_NAMES = {
    weapon: ['Bronze Blade', 'Silver Saber', 'Golden Edge', 'Runeblade', 'Dragonfang', 'Starbreaker'],
    armor: ['Leather Vest', 'Chain Mail', 'Gilded Plate', 'Rune Armor', 'Dragon Scale', 'Celestial Aegis'],
    helm: ['Iron Cap', 'Silver Helm', 'Golden Crest', 'Rune Helm', 'Dragon Crown', 'Halo of Ages'],
    charm: ['Lucky Coin', 'Moon Pendant', 'Sun Amulet', 'Rune Charm', 'Dragon Heart', 'Star Core'],
  };
  const gearStat = (slot, tier) => {
    const k = [1, 2.2, 3.8, 6, 9, 13][tier];
    if (slot === 'weapon') return { atk: Math.round(18 * k) };
    if (slot === 'armor') return { hp: Math.round(110 * k) };
    if (slot === 'helm') return { hp: Math.round(70 * k), atk: Math.round(6 * k) };
    return { atk: Math.round(10 * k), hp: Math.round(40 * k) };
  };

  // the stats of an owned hero (o = save entry). mastery = save.mastery
  function heroStats(id, o, mastery) {
    const h = HERO[id], r = RARITY[h.rarity];
    o = o || { lvl: 1, stars: 1, rank: 0, gear: {} };
    const lv = 1 + (o.lvl - 1) * 0.085 + Math.pow(o.lvl - 1, 1.6) * 0.002;
    const st = 1 + 0.16 * (o.stars - 1);
    const rk = 1 + 0.12 * (o.rank || 0);
    const ms = 1 + 0.02 * ((mastery && mastery[h.el]) || 0);
    let hp = r.base.hp * h.hpK * lv * st * rk * ms;
    let atk = r.base.atk * h.atkK * lv * st * rk * ms;
    const gear = o.gear || {};
    GEAR_SLOTS.forEach((s) => {
      if (gear[s] !== undefined && gear[s] !== null) {
        const g = gearStat(s, gear[s]);
        hp += g.hp || 0; atk += g.atk || 0;
      }
    });
    const spd = Math.round(h.spd * (1 + 0.012 * (o.stars - 1) + 0.008 * (o.rank || 0)));
    return { hp: Math.round(hp), atk: Math.round(atk), spd };
  }
  const power = (s) => Math.round(s.hp * 0.25 + s.atk * 2.2 + s.spd * 0.6);

  // stage strength: what a team at the recommended level hits like
  function stagePower(ch, st, diff) {
    return powerAt(stageLevel(ch, st, diff), DIFFS[diff || 'normal'].k);
  }
  function powerAt(lvl, k) {
    const ref = { hp: 1150, atk: 340 };
    const lv = 1 + (lvl - 1) * 0.085 + Math.pow(lvl - 1, 1.6) * 0.002;
    const starK = 1 + 0.16 * Math.min(5, Math.floor(lvl / 12));
    const rankK = 1 + 0.12 * Math.min(6, Math.floor(lvl / 10));
    k = k || 1;
    const heroAtk = ref.atk * lv * starK * rankK;
    const heroHp = ref.hp * lv * starK * rankK;
    return {
      lvl,
      hp: heroAtk * 3.4 * k,                 // a normal enemy takes about 1 to 2 shots
      atk: heroHp * 4 * 0.075 * Math.sqrt(k), // a normal hit takes ~7% of the team HP
    };
  }

  // the waves of a stage: [[{id, x, z}...], ...]. Random but the same every time for the same stage.
  function stageWaves(ch, st, diff) {
    const C = CHAPTERS[ch - 1];
    const rnd = SH.util.rng(ch * 1000 + st * 37 + DIFF_ORDER.indexOf(diff || 'normal') * 7);
    const nWaves = st <= 2 ? 2 : 3;
    const waves = [];
    for (let w = 0; w < nWaves; w++) {
      const last = w === nWaves - 1;
      const list = [];
      if (last) {
        list.push(st === STAGES_PER_CHAPTER ? C.boss : st % 4 === 0 ? C.mini : C.mobs[Math.floor(rnd() * C.mobs.length)] + '*');
        const adds = st === STAGES_PER_CHAPTER ? 2 : 2 + Math.floor(rnd() * 2);
        for (let i = 0; i < adds; i++) list.push(C.mobs[Math.floor(rnd() * C.mobs.length)]);
      } else {
        const n = 3 + Math.floor(rnd() * 2) + (st > 5 ? 1 : 0);
        for (let i = 0; i < n; i++) list.push(C.mobs[Math.floor(rnd() * Math.min(C.mobs.length, 2 + st))]);
      }
      waves.push(list);
    }
    return waves;
  }
  // rounds you may use and still get 3 stars
  const starRounds = (waves) => waves.reduce((n, w) => n + (w.some((e) => ENEMIES[e.replace('*', '')] && (ENEMIES[e.replace('*', '')].boss || ENEMIES[e.replace('*', '')].mini)) ? 6 : w.length > 4 ? 3 : 2), 0) + 2;

  function stageRewards(ch, st, diff) {
    const k = DIFFS[diff || 'normal'].reward;
    const lvl = stageLevel(ch, st, diff);
    return {
      gold: Math.round((120 + lvl * 45) * k),
      exp: Math.round((50 + lvl * 22) * k),   // hero exp
      teamExp: DIFFS[diff || 'normal'].stamina * 10,
      drops: st === STAGES_PER_CHAPTER ? ['chest_gear', 'exp2'] : st % 2 ? ['exp1'] : ['gear'],
    };
  }

  // ------------------------------------------------------------ items
  const ITEMS = {
    exp1: { name: 'Small EXP Potion', icon: 'potion_g', tab: 'supplies', exp: 300, sell: 30, desc: 'Gives a hero 300 EXP.' },
    exp2: { name: 'EXP Potion', icon: 'potion_b', tab: 'supplies', exp: 1500, sell: 120, desc: 'Gives a hero 1,500 EXP.' },
    exp3: { name: 'Grand EXP Potion', icon: 'potion_p', tab: 'supplies', exp: 8000, sell: 500, desc: 'Gives a hero 8,000 EXP.' },
    stamina: { name: 'Stamina Tonic', icon: 'tonic', tab: 'supplies', sell: 50, use: true, desc: 'Restores 60 stamina.' },
    scroll: { name: 'Summon Scroll', icon: 'scroll', tab: 'supplies', sell: 100, desc: 'One basic summon at the Wishing Altar.' },
    pscroll: { name: 'Star Scroll', icon: 'scroll_gold', tab: 'supplies', sell: 300, desc: 'One premium summon at the Wishing Altar. Better heroes!' },
    chest_gold: { name: 'Gold Chest', icon: 'chest', tab: 'supplies', sell: 0, use: true, desc: 'Open it for 5,000 to 20,000 gold.' },
    chest_gear: { name: 'Gear Chest', icon: 'chest_blue', tab: 'supplies', sell: 0, use: true, desc: 'Open it for 3 random pieces of gear.' },
    chest_shard: { name: 'Hero Shard Chest', icon: 'chest_purple', tab: 'supplies', sell: 0, use: true, desc: 'Open it for 10 shards of a random hero.' },
  };
  // gear items: g_<slot>_<tier>
  GEAR_SLOTS.forEach((s) => GEAR_TIER.forEach((t, i) => {
    ITEMS[`g_${s}_${i}`] = { name: GEAR_NAMES[s][i], icon: 'gear_' + s, tier: i, slot: s, tab: 'gear', sell: 40 * Math.pow(3, i), desc: '' };
  }));

  // ------------------------------------------------------------ missions
  const DAILY = [
    { id: 'login', name: 'Daily Check-in', desc: 'Open the game today.', goal: 1, pts: 10, reward: { gold: 2000 } },
    { id: 'win', name: 'Battle Ready', desc: 'Win 3 battles.', goal: 3, pts: 20, reward: { gold: 5000, exp1: 2 } },
    { id: 'stamina', name: 'Adventurer', desc: 'Spend 60 stamina.', goal: 60, pts: 20, reward: { gems: 30 } },
    { id: 'summon', name: 'Make a Wish', desc: 'Summon 1 hero.', goal: 1, pts: 10, reward: { gold: 3000 } },
    { id: 'levelup', name: 'Training', desc: 'Level up heroes 3 times.', goal: 3, pts: 10, reward: { exp1: 3 } },
    { id: 'hyper', name: 'Hyper Strike!', desc: 'Use 3 hyper skills.', goal: 3, pts: 20, reward: { gems: 20 } },
    { id: 'combo', name: 'Combo Master', desc: 'Reach a 30 combo in one shot.', goal: 1, pts: 20, reward: { gold: 6000 } },
    { id: 'tower', name: 'Tower Climber', desc: 'Clear a tower floor.', goal: 1, pts: 20, reward: { gems: 20 } },
    { id: 'arena', name: 'Gladiator', desc: 'Fight 1 arena battle.', goal: 1, pts: 20, reward: { honor: 50 } },
    { id: 'expedition', name: 'Explorer', desc: 'Finish an expedition.', goal: 1, pts: 10, reward: { gold: 4000 } },
  ];
  const DAILY_CHESTS = [
    { pts: 40, reward: { gold: 10000 } },
    { pts: 80, reward: { gems: 60 } },
    { pts: 120, reward: { scroll: 2 } },
    { pts: 160, reward: { pscroll: 1 } },
  ];
  const PROGRESS = [
    { id: 'stages', name: 'Conqueror', desc: (g) => `Clear ${g} campaign stages.`, goals: [3, 8, 16, 24, 32, 48], reward: (i) => ({ gems: 50 + i * 50 }) },
    { id: 'teamlv', name: 'Rising Team', desc: (g) => `Reach team level ${g}.`, goals: [5, 10, 15, 20, 30, 40], reward: (i) => ({ gems: 80 + i * 40 }) },
    { id: 'heroes', name: 'Collector', desc: (g) => `Own ${g} heroes.`, goals: [6, 10, 15, 20, 25], reward: (i) => ({ pscroll: 1 + Math.floor(i / 2) }) },
    { id: 'stars3', name: 'Perfectionist', desc: (g) => `Get 3 stars on ${g} stages.`, goals: [5, 15, 30, 48], reward: (i) => ({ gems: 100 + i * 50 }) },
    { id: 'tower', name: 'Sky Walker', desc: (g) => `Reach tower floor ${g}.`, goals: [5, 10, 20, 30, 50], reward: (i) => ({ gems: 60 + i * 60 }) },
    { id: 'summons', name: 'Wishmaker', desc: (g) => `Summon ${g} heroes.`, goals: [10, 30, 60, 100], reward: (i) => ({ chest_shard: 1 + i }) },
    { id: 'elite', name: 'Elite Status', desc: (g) => `Clear ${g} elite stages.`, goals: [3, 8, 16, 32], reward: (i) => ({ gems: 100 + i * 60 }) },
  ];

  const LOGIN = [
    { gold: 10000 }, { scroll: 3 }, { gems: 100 }, { exp2: 5 }, { chest_gear: 2 }, { gems: 200 }, { pscroll: 3 },
  ];

  // team level: exp from spent stamina
  const teamExpNeed = (lv) => Math.round(80 + lv * lv * 9);
  const maxStamina = (lv) => 60 + lv * 2;
  const STAMINA_SEC = 60;   // one stamina point per minute

  const UNLOCK = { mastery: 2, expedition: 3, tower: 4, arena: 5, guild: 7 };

  SH.data = {
    ELEMENTS, EL_ORDER, elementMod, RARITY, RARITY_ORDER, HYPERS, COMBOS, PASSIVES, HEROES, HERO,
    ENEMIES, CHAPTERS, STAGES_PER_CHAPTER, DIFFS, DIFF_ORDER, stageLevel, stagePower, powerAt, stageWaves, starRounds, stageRewards,
    levelCap, MAX_STARS, starCost, expNeed, goldNeed, RANKS, GEAR_SLOTS, GEAR_TIER, GEAR_NAMES, gearStat, heroStats, power,
    ITEMS, DAILY, DAILY_CHESTS, PROGRESS, LOGIN, teamExpNeed, maxStamina, STAMINA_SEC, UNLOCK,
  };
})();
