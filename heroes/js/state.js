/* ==========================================================================
   SLING HEROES — the save game and all game rules outside of battle
   * the player: team level, gold, gems, stamina (refills over time), honor
   * heroes: level up with EXP potions + gold, stars with shards, gear and
     breakthrough ranks, the mastery bonus per element
   * summoning (basic / premium, the first premium 10x always has an SS)
   * daily missions with activity chests, progress missions, the 7 day login,
     the mailbox, the market, expeditions, the tower, the arena, the guild raid
   Everything is saved in localStorage after every change.
   ========================================================================== */
(function () {
  'use strict';

  const SH = window.SH;
  const D = SH.data, U = SH.util;
  const VERSION = 1;
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };

  const STARTERS = ['scarlet', 'yuki', 'lin', 'aurelia'];

  function fresh() {
    const s = {
      v: VERSION, created: Date.now(),
      teamLv: 1, teamExp: 0,
      gold: 30000, gems: 600, honor: 0,
      stamina: 60, staminaT: Date.now(),
      heroes: {}, shards: {},
      team: STARTERS.slice(),
      items: { exp1: 12, exp2: 3, scroll: 3, stamina: 2 },
      stages: {}, eliteOpen: {},
      tower: { floor: 1, best: 0 },
      arena: { points: 1000, tickets: 5, day: '', foes: null, wins: 0 },
      expedition: [null, null, null],
      guild: { day: '', tries: 3, best: 0, total: 0 },
      daily: { day: '', prog: {}, claimed: {}, pts: 0, chests: {} },
      prog: { claimed: {}, c: { summons: 0, wins: 0 } },
      login: { day: '', streak: 0, claimed: false },
      mail: [],
      mastery: { fire: 0, water: 0, wood: 0, light: 0, dark: 0 },
      firstPremium: true,
      market: null,
      freeGems: '',
      seen: {},
    };
    STARTERS.forEach((id, i) => { s.heroes[id] = { lvl: 3 + i % 2, exp: 0, stars: 1, rank: 0, gear: {} }; });
    s.mail.push({ id: 1, from: 'The King', title: 'Welcome, Commander!', body: 'Our kingdom is in danger. Take these gifts, summon new heroes at the Wishing Altar and free the lands from the Demon Lord!', reward: { gems: 1000, pscroll: 10, gold: 50000 }, t: Date.now(), claimed: false });
    s.mail.push({ id: 2, from: 'Guild Master', title: 'Starter supplies', body: 'A few potions to train your heroes. Good luck out there!', reward: { exp2: 10, chest_gear: 2, stamina: 3 }, t: Date.now(), claimed: false });
    return s;
  }

  let S = SH.store.load();
  if (!S || S.v !== VERSION) S = fresh();
  SH.S = () => S;
  let saveT = 0;
  function save() { clearTimeout(saveT); saveT = setTimeout(() => SH.store.write(S), 150); }
  SH.save = save;
  SH.saveNow = () => SH.store.write(S);
  window.addEventListener('pagehide', () => SH.store.write(S));
  document.addEventListener('visibilitychange', () => { if (document.hidden) SH.store.write(S); });
  SH.resetGame = () => { S = fresh(); SH.store.write(S); location.reload(); };

  const listeners = [];
  SH.onChange = (fn) => listeners.push(fn);
  function changed(what) { save(); listeners.forEach((fn) => fn(what)); }
  SH.changed = changed;

  // ------------------------------------------------------------ daily reset
  function dailyReset() {
    const d = today();
    if (S.daily.day !== d) S.daily = { day: d, prog: {}, claimed: {}, pts: 0, chests: {} };
    if (S.arena.day !== d) { S.arena.day = d; S.arena.tickets = 5; S.arena.foes = null; }
    if (S.guild.day !== d) { S.guild.day = d; S.guild.tries = 3; }
    if (S.login.day !== d) {
      const y = new Date(Date.now() - 86400000);
      const yd = y.getFullYear() + '-' + (y.getMonth() + 1) + '-' + y.getDate();
      S.login.streak = S.login.day === yd ? S.login.streak + 1 : (S.login.day ? 1 : 1);
      if (S.login.streak > 7) S.login.streak = 1;
      S.login.day = d; S.login.claimed = false;
      if (S.created && Date.now() - S.created > 60000) {
        S.mail.push({ id: Date.now(), from: 'Quartermaster', title: 'Daily supplies', body: 'Fresh supplies for today.', reward: { stamina: 1, exp1: 3, gold: 3000 }, t: Date.now(), claimed: false });
      }
    }
    mission('login', 1);
  }

  // ------------------------------------------------------------ resources
  const API = (SH.game = {});
  API.today = today;
  API.maxStamina = () => D.maxStamina(S.teamLv);
  API.tickStamina = () => {
    const max = API.maxStamina();
    if (S.stamina >= max) { S.staminaT = Date.now(); return 0; }
    const n = Math.floor((Date.now() - S.staminaT) / (D.STAMINA_SEC * 1000));
    if (n > 0) {
      S.stamina = Math.min(max, S.stamina + n);
      S.staminaT += n * D.STAMINA_SEC * 1000;
      if (S.stamina >= max) S.staminaT = Date.now();
      changed('res');
    }
    return D.STAMINA_SEC - ((Date.now() - S.staminaT) / 1000) % D.STAMINA_SEC;
  };
  API.spendStamina = (n) => {
    API.tickStamina();
    if (S.stamina < n) return false;
    if (S.stamina >= API.maxStamina()) S.staminaT = Date.now();
    S.stamina -= n;
    mission('stamina', n);
    addTeamExp(n * 10);
    changed('res');
    return true;
  };
  API.canPay = (cost) => Object.keys(cost).every((k) => (k === 'gold' || k === 'gems' || k === 'honor' ? S[k] : (S.items[k] || 0)) >= cost[k]);
  API.pay = (cost) => {
    if (!API.canPay(cost)) return false;
    for (const k in cost) {
      if (k === 'gold' || k === 'gems' || k === 'honor') S[k] -= cost[k];
      else { S.items[k] -= cost[k]; if (S.items[k] <= 0) delete S.items[k]; }
    }
    changed('res');
    return true;
  };
  // reward: {gold, gems, honor, stamina?, teamExp, <itemId>: n, shards: {heroId: n}, hero: id}
  API.give = (r) => {
    const out = [];
    for (const k in r) {
      const v = r[k];
      if (!v) continue;
      if (k === 'gold' || k === 'gems' || k === 'honor') { S[k] += v; out.push({ id: k, n: v }); }
      else if (k === 'staminaPts') { S.stamina += v; out.push({ id: 'stamina', n: v }); }
      else if (k === 'teamExp') addTeamExp(v);
      else if (k === 'shards') { for (const h in v) { S.shards[h] = (S.shards[h] || 0) + v[h]; out.push({ shard: h, n: v[h] }); } }
      else if (k === 'hero') { const res = API.addHero(v); out.push(res); }
      else if (D.ITEMS[k]) { S.items[k] = (S.items[k] || 0) + v; out.push({ id: k, n: v }); }
    }
    changed('res');
    return out;
  };

  function addTeamExp(n) {
    S.teamExp += n;
    let up = false;
    while (S.teamExp >= D.teamExpNeed(S.teamLv)) {
      S.teamExp -= D.teamExpNeed(S.teamLv);
      S.teamLv++;
      S.stamina += Math.round(API.maxStamina() * 0.5);
      up = true;
    }
    if (up) { progress(); if (SH.onTeamLevel) SH.onTeamLevel(S.teamLv); }
  }
  API.addTeamExp = addTeamExp;

  // ------------------------------------------------------------ heroes
  API.owned = (id) => !!S.heroes[id];
  API.ownedList = () => Object.keys(S.heroes);
  API.stats = (id) => D.heroStats(id, S.heroes[id], S.mastery);
  API.power = (id) => D.power(API.stats(id));
  API.teamPower = (team) => (team || S.team).filter(Boolean).reduce((s, id) => s + API.power(id), 0);
  API.teamHP = (team) => (team || S.team).filter(Boolean).reduce((s, id) => s + API.stats(id).hp, 0);
  // a summoned hero: new, or turns into shards when you already have it
  API.addHero = (id) => {
    if (!S.heroes[id]) {
      S.heroes[id] = { lvl: 1, exp: 0, stars: 1, rank: 0, gear: {} };
      progress();
      return { hero: id, isNew: true };
    }
    const n = D.RARITY[D.HERO[id].rarity].shards;
    S.shards[id] = (S.shards[id] || 0) + n;
    return { hero: id, isNew: false, shards: n };
  };
  API.unlockCost = (id) => D.RARITY[D.HERO[id].rarity].shards;
  API.unlockWithShards = (id) => {
    const need = API.unlockCost(id);
    if (S.heroes[id] || (S.shards[id] || 0) < need) return false;
    S.shards[id] -= need;
    S.heroes[id] = { lvl: 1, exp: 0, stars: 1, rank: 0, gear: {} };
    progress();
    changed('hero');
    return true;
  };
  API.levelCap = (id) => D.levelCap(S.heroes[id].stars);
  // spends potions (small first) and gold to get the next level
  API.levelUp = (id, times) => {
    const h = S.heroes[id];
    let done = 0;
    for (let i = 0; i < (times || 1); i++) {
      if (h.lvl >= API.levelCap(id)) break;
      const need = D.expNeed(h.lvl) - h.exp, gold = D.goldNeed(h.lvl);
      if (S.gold < gold) break;
      let have = 0;
      for (const p of ['exp1', 'exp2', 'exp3']) have += (S.items[p] || 0) * D.ITEMS[p].exp;
      if (have < need) break;
      let left = need;
      for (const p of ['exp1', 'exp2', 'exp3']) {
        while (left > 0 && (S.items[p] || 0) > 0) {
          S.items[p]--; left -= D.ITEMS[p].exp;
          if (!S.items[p]) delete S.items[p];
        }
      }
      S.gold -= gold;
      h.lvl++;
      h.exp = Math.max(0, -left > 0 ? Math.min(-left, D.expNeed(h.lvl) - 1) : 0);
      done++;
    }
    if (done) { mission('levelup', done); changed('hero'); }
    return done;
  };
  API.levelUpCost = (id) => {
    const h = S.heroes[id];
    return { exp: D.expNeed(h.lvl) - h.exp, gold: D.goldNeed(h.lvl) };
  };
  API.potionExp = () => ['exp1', 'exp2', 'exp3'].reduce((s, p) => s + (S.items[p] || 0) * D.ITEMS[p].exp, 0);
  // battle exp
  API.heroExp = (id, n) => {
    const h = S.heroes[id];
    if (!h) return 0;
    let ups = 0;
    h.exp += n;
    while (h.lvl < API.levelCap(id) && h.exp >= D.expNeed(h.lvl)) { h.exp -= D.expNeed(h.lvl); h.lvl++; ups++; }
    if (h.lvl >= API.levelCap(id)) h.exp = Math.min(h.exp, D.expNeed(h.lvl) - 1);
    return ups;
  };
  API.starUp = (id) => {
    const h = S.heroes[id];
    const need = D.starCost(h.stars);
    if (h.stars >= D.MAX_STARS || (S.shards[id] || 0) < need) return false;
    S.shards[id] -= need;
    h.stars++;
    changed('hero');
    return true;
  };
  API.equip = (id, slot) => {
    const h = S.heroes[id];
    const tier = h.rank;
    const item = `g_${slot}_${Math.min(5, tier)}`;
    if (h.gear[slot] !== undefined && h.gear[slot] !== null) return false;
    if (!S.items[item]) return false;
    S.items[item]--;
    if (!S.items[item]) delete S.items[item];
    h.gear[slot] = Math.min(5, tier);
    changed('hero');
    return true;
  };
  API.canBreak = (id) => {
    const h = S.heroes[id];
    return h.rank < D.RANKS.length - 1 && D.GEAR_SLOTS.every((s) => h.gear[s] !== undefined && h.gear[s] !== null) && S.gold >= API.breakCost(id);
  };
  API.breakCost = (id) => 5000 * Math.pow(2.2, S.heroes[id].rank);
  API.breakthrough = (id) => {
    if (!API.canBreak(id)) return false;
    const h = S.heroes[id];
    S.gold -= API.breakCost(id);
    h.rank++;
    h.gear = {};
    changed('hero');
    return true;
  };
  API.masteryCost = (el) => Math.round(800 * Math.pow(1.28, S.mastery[el]));
  API.masteryMax = () => 5 + S.teamLv * 2;
  API.masteryUp = (el) => {
    if (S.mastery[el] >= Math.min(40, API.masteryMax())) return false;
    if (!API.pay({ gold: API.masteryCost(el) })) return false;
    S.mastery[el]++;
    changed('hero');
    return true;
  };

  // ------------------------------------------------------------ summon
  const RATES = {
    basic: { B: 55, A: 35, S: 9, SS: 1 },
    premium: { B: 0, A: 55, S: 35, SS: 10 },
  };
  API.RATES = RATES;
  API.SUMMON_COST = { basic: { gold: 12000, scroll: 1 }, premium: { gems: 280, pscroll: 1 } };
  function rollRarity(kind) {
    const r = RATES[kind];
    let x = Math.random() * 100;
    for (const k of D.RARITY_ORDER) { if (x < r[k]) return k; x -= r[k]; }
    return 'A';
  }
  API.summon = (kind, count) => {
    const res = [];
    for (let i = 0; i < count; i++) {
      let rar = rollRarity(kind);
      if (kind === 'premium' && count >= 10 && i === count - 1 && !res.some((r) => D.HERO[r.hero].rarity === 'SS') && S.firstPremium) rar = 'SS';
      if (count >= 10 && i === count - 1 && !res.some((r) => ['S', 'SS'].includes(D.HERO[r.hero].rarity)) && rar !== 'SS') rar = 'S';
      const pool = D.HEROES.filter((h) => h.rarity === rar);
      const h = U.pick(pool);
      res.push(API.addHero(h.id));
    }
    if (kind === 'premium' && count >= 10) S.firstPremium = false;
    S.prog.c.summons += count;
    mission('summon', count);
    progress();
    changed('hero');
    return res;
  };
  // pays with a scroll first, else with gold / gems
  API.summonPrice = (kind, count) => {
    const scroll = kind === 'basic' ? 'scroll' : 'pscroll';
    if ((S.items[scroll] || 0) >= count) return { [scroll]: count };
    const base = kind === 'basic' ? { gold: 12000 } : { gems: 280 };
    const k = Object.keys(base)[0];
    return { [k]: Math.round(base[k] * count * (count >= 10 ? 0.9 : 1)) };
  };

  // ------------------------------------------------------------ missions
  function mission(id, n) {
    const m = D.DAILY.find((x) => x.id === id);
    if (!m || S.daily.day !== today()) { if (S.daily.day !== today()) { /* reset happens on next open */ } }
    if (!m) return;
    S.daily.prog[id] = Math.min(m.goal, (S.daily.prog[id] || 0) + n);
  }
  API.mission = (id, n) => { mission(id, n); changed('mission'); };
  API.claimDaily = (id) => {
    const m = D.DAILY.find((x) => x.id === id);
    if (!m || S.daily.claimed[id] || (S.daily.prog[id] || 0) < m.goal) return null;
    S.daily.claimed[id] = true;
    S.daily.pts += m.pts;
    const got = API.give(m.reward);
    changed('mission');
    return got;
  };
  API.claimChest = (i) => {
    const c = D.DAILY_CHESTS[i];
    if (!c || S.daily.chests[i] || S.daily.pts < c.pts) return null;
    S.daily.chests[i] = true;
    const got = API.give(c.reward);
    changed('mission');
    return got;
  };
  function progValue(id) {
    switch (id) {
      case 'stages': return Object.keys(S.stages).filter((k) => k.endsWith('normal') && S.stages[k] > 0).length;
      case 'teamlv': return S.teamLv;
      case 'heroes': return Object.keys(S.heroes).length;
      case 'stars3': return Object.keys(S.stages).filter((k) => S.stages[k] >= 3).length;
      case 'tower': return S.tower.best;
      case 'summons': return S.prog.c.summons;
      case 'elite': return Object.keys(S.stages).filter((k) => k.endsWith('elite') && S.stages[k] > 0).length;
      default: return 0;
    }
  }
  API.progValue = progValue;
  function progress() { /* values are read live */ }
  API.claimProgress = (id) => {
    const p = D.PROGRESS.find((x) => x.id === id);
    const tier = S.prog.claimed[id] || 0;
    if (!p || tier >= p.goals.length || progValue(id) < p.goals[tier]) return null;
    S.prog.claimed[id] = tier + 1;
    const got = API.give(p.reward(tier));
    changed('mission');
    return got;
  };
  API.missionBadge = () => {
    if (D.DAILY.some((m) => !S.daily.claimed[m.id] && (S.daily.prog[m.id] || 0) >= m.goal)) return true;
    if (D.DAILY_CHESTS.some((c, i) => !S.daily.chests[i] && S.daily.pts >= c.pts)) return true;
    return D.PROGRESS.some((p) => { const t = S.prog.claimed[p.id] || 0; return t < p.goals.length && progValue(p.id) >= p.goals[t]; });
  };

  // ------------------------------------------------------------ login + mail
  API.loginReward = () => D.LOGIN[(Math.max(1, S.login.streak) - 1) % 7];
  API.claimLogin = () => {
    if (S.login.claimed) return null;
    S.login.claimed = true;
    const got = API.give(API.loginReward());
    changed('login');
    return got;
  };
  API.mailUnread = () => S.mail.filter((m) => !m.claimed).length;
  SH.mailCount = API.mailUnread;
  API.claimMail = (id) => {
    const m = S.mail.find((x) => x.id === id);
    if (!m || m.claimed) return null;
    m.claimed = true;
    const got = API.give(m.reward);
    changed('mail');
    return got;
  };

  // ------------------------------------------------------------ market
  const MARKET_POOL = [
    { item: 'exp1', n: 10, cost: { gold: 6000 } }, { item: 'exp2', n: 5, cost: { gold: 15000 } }, { item: 'exp3', n: 2, cost: { gems: 120 } },
    { item: 'stamina', n: 1, cost: { gems: 50 } }, { item: 'scroll', n: 1, cost: { gold: 10000 } }, { item: 'pscroll', n: 1, cost: { gems: 250 } },
    { item: 'chest_gear', n: 1, cost: { gold: 18000 } }, { item: 'chest_shard', n: 1, cost: { gems: 150 } }, { item: 'chest_gold', n: 1, cost: { gems: 60 } },
  ];
  const HONOR_SHOP = [
    { item: 'chest_shard', n: 1, cost: { honor: 300 } }, { item: 'pscroll', n: 1, cost: { honor: 600 } }, { item: 'exp3', n: 1, cost: { honor: 150 } },
    { item: 'chest_gear', n: 1, cost: { honor: 200 } },
  ];
  API.HONOR_SHOP = HONOR_SHOP;
  API.market = () => {
    const REFRESH = 3 * 3600 * 1000;
    if (!S.market || Date.now() - S.market.t > REFRESH) API.refreshMarket(true);
    return S.market;
  };
  API.refreshMarket = (free) => {
    if (!free && !API.pay({ gems: 20 })) return false;
    const pool = MARKET_POOL.slice();
    const slots = [];
    // gear of a random tier near your best hero's rank
    const maxRank = Math.max(0, ...Object.values(S.heroes).map((h) => h.rank));
    for (let i = 0; i < 2; i++) {
      const slot = U.pick(D.GEAR_SLOTS), tier = Math.min(5, U.randi(0, maxRank));
      slots.push({ item: `g_${slot}_${tier}`, n: 1, cost: { gold: Math.round(4000 * Math.pow(2.4, tier)) }, bought: false });
    }
    for (let i = 0; i < 4; i++) { const k = Math.floor(Math.random() * pool.length); slots.push(Object.assign({ bought: false }, pool.splice(k, 1)[0])); }
    S.market = { t: Date.now(), slots };
    changed('shop');
    return true;
  };
  API.buy = (slot, list) => {
    const s = (list || S.market.slots)[slot];
    if (!s || s.bought) return null;
    if (!API.pay(s.cost)) return null;
    if (!list) s.bought = true;
    return API.give({ [s.item]: s.n });
  };
  API.freeGemsReady = () => S.freeGems !== today();
  API.claimFreeGems = () => { if (!API.freeGemsReady()) return null; S.freeGems = today(); return API.give({ gems: 80, gold: 5000 }); };
  API.buyStamina = () => { if (!API.pay({ gems: 50 })) return false; S.stamina += 120; changed('res'); return true; };

  // ------------------------------------------------------------ items
  API.useItem = (id) => {
    const it = D.ITEMS[id];
    if (!it || !S.items[id]) return null;
    let got = null;
    if (id === 'stamina') { S.items[id]--; S.stamina += 60; got = [{ id: 'stamina', n: 60 }]; }
    else if (id === 'chest_gold') { S.items[id]--; got = API.give({ gold: U.randi(5, 20) * 1000 }); }
    else if (id === 'chest_gear') {
      S.items[id]--;
      const maxRank = Math.max(0, ...Object.values(S.heroes).map((h) => h.rank));
      const r = {};
      for (let i = 0; i < 3; i++) { const k = `g_${U.pick(D.GEAR_SLOTS)}_${Math.min(5, U.randi(0, maxRank))}`; r[k] = (r[k] || 0) + 1; }
      got = API.give(r);
    } else if (id === 'chest_shard') {
      S.items[id]--;
      const h = U.pick(D.HEROES.filter((x) => x.rarity !== 'SS' || Math.random() < 0.3));
      got = API.give({ shards: { [h.id]: 10 } });
    } else return null;
    if (S.items[id] <= 0) delete S.items[id];
    changed('res');
    return got;
  };
  API.sellItem = (id, n) => {
    const it = D.ITEMS[id];
    if (!it || !it.sell || (S.items[id] || 0) < n) return false;
    S.items[id] -= n;
    if (!S.items[id]) delete S.items[id];
    S.gold += it.sell * n;
    changed('res');
    return true;
  };

  // ------------------------------------------------------------ campaign
  const sKey = (ch, st, diff) => `${ch}-${st}-${diff}`;
  API.stageStars = (ch, st, diff) => S.stages[sKey(ch, st, diff)] || 0;
  API.stageOpen = (ch, st, diff) => {
    if (diff !== 'normal' && API.stageStars(ch, st, 'normal') === 0) return false;
    if (diff === 'nightmare' && API.stageStars(ch, st, 'elite') === 0) return false;
    if (st === 1) return ch === 1 || API.stageStars(ch - 1, D.STAGES_PER_CHAPTER, diff) > 0;
    return API.stageStars(ch, st - 1, diff) > 0;
  };
  API.chapterOpen = (ch) => ch === 1 || API.stageStars(ch - 1, D.STAGES_PER_CHAPTER, 'normal') > 0;
  API.chapterStars = (ch, diff) => { let n = 0; for (let s = 1; s <= D.STAGES_PER_CHAPTER; s++) n += API.stageStars(ch, s, diff); return n; };
  API.currentStage = () => {
    for (let c = 1; c <= D.CHAPTERS.length; c++) for (let s = 1; s <= D.STAGES_PER_CHAPTER; s++) if (!API.stageStars(c, s, 'normal')) return { ch: c, st: s };
    return { ch: D.CHAPTERS.length, st: D.STAGES_PER_CHAPTER };
  };
  // after a won battle
  API.winStage = (ch, st, diff, stars, team) => {
    const k = sKey(ch, st, diff);
    const first = !S.stages[k];
    S.stages[k] = Math.max(S.stages[k] || 0, stars);
    const R = D.stageRewards(ch, st, diff);
    const reward = { gold: R.gold, teamExp: 0 };
    if (first) reward.gems = st === D.STAGES_PER_CHAPTER ? 150 : 30;
    R.drops.forEach((d) => {
      if (d === 'gear') { const g = `g_${U.pick(D.GEAR_SLOTS)}_${Math.min(5, Math.floor(D.stageLevel(ch, st, diff) / 9))}`; reward[g] = (reward[g] || 0) + 1; }
      else reward[d] = (reward[d] || 0) + 1;
    });
    if (Math.random() < 0.35) { const h = U.pick(D.HEROES.filter((x) => x.rarity === 'B' || x.rarity === 'A')); reward.shards = { [h.id]: U.randi(1, 3) }; }
    const got = API.give(reward);
    const ups = {};
    team.forEach((id) => { ups[id] = API.heroExp(id, R.exp); });
    S.prog.c.wins++;
    mission('win', 1);
    changed('stage');
    return { got, ups, exp: R.exp, first };
  };

  // ------------------------------------------------------------ tower
  API.towerWin = () => {
    const f = S.tower.floor;
    const boss = f % 5 === 0;
    const got = API.give({ gems: boss ? 80 : 15, gold: 2000 + f * 400, ...(boss ? { chest_gear: 1 } : {}) });
    S.tower.best = Math.max(S.tower.best, f);
    S.tower.floor++;
    mission('tower', 1);
    changed('tower');
    return got;
  };

  // ------------------------------------------------------------ arena
  API.arenaFoes = () => {
    if (S.arena.foes) return S.arena.foes;
    const my = API.teamPower();
    const owned = Object.keys(S.heroes);
    const foes = [];
    const names = ['Shadowfang', 'Lady Rosa', 'Kaito', 'IronWill', 'Mira', 'DragonKid', 'Sunny', 'Vex', 'Astra', 'Bolt', 'Nimbus', 'Ravenna'];
    for (let i = 0; i < 3; i++) {
      const k = [0.85, 1.0, 1.2][i];
      const team = [];
      const pool = D.HEROES.slice();
      for (let j = 0; j < 4; j++) team.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0].id);
      const avgLvl = owned.length ? Math.max(1, Math.round(S.team.reduce((s, id) => s + (S.heroes[id] ? S.heroes[id].lvl : 1), 0) / 4 * k)) : 1;
      const name = names.splice(Math.floor(Math.random() * names.length), 1)[0];
      foes.push({ name, team, lvl: avgLvl, k, power: Math.round(my * k), points: Math.round(S.arena.points + (k - 1) * 300 + U.randi(-40, 40)) });
    }
    S.arena.foes = foes;
    save();
    return foes;
  };
  API.arenaResult = (i, win) => {
    const f = S.arena.foes[i];
    S.arena.tickets--;
    const delta = win ? Math.round(18 + (f.k - 1) * 60) : -10;
    S.arena.points = Math.max(0, S.arena.points + delta);
    let got = [];
    if (win) { S.arena.wins++; got = API.give({ honor: Math.round(40 * f.k), gold: 3000 }); }
    S.arena.foes = null;
    mission('arena', 1);
    changed('arena');
    return { delta, got };
  };

  // ------------------------------------------------------------ guild raid
  API.guildResult = (damage) => {
    S.guild.tries--;
    S.guild.best = Math.max(S.guild.best, damage);
    S.guild.total += damage;
    const tier = Math.min(6, Math.floor(Math.log10(Math.max(10, damage)) - 2));
    const got = API.give({ gold: 2000 + tier * 2500, gems: 10 + tier * 10, ...(tier >= 3 ? { chest_gear: 1 } : {}), ...(tier >= 5 ? { pscroll: 1 } : {}) });
    changed('guild');
    return { tier, got };
  };

  // ------------------------------------------------------------ expedition
  API.EXPEDITIONS = [
    { name: 'Forest Patrol', min: 10, reward: (p) => ({ gold: 3000 + p * 0.2, exp1: 3 }) },
    { name: 'Mountain Scouting', min: 60, reward: (p) => ({ gold: 9000 + p * 0.6, exp2: 2, gems: 20 }) },
    { name: 'Ruins Delve', min: 240, reward: (p) => ({ gold: 25000 + p * 1.5, exp2: 5, gems: 60, chest_gear: 1 }) },
  ];
  API.busyHeroes = () => S.expedition.filter(Boolean).flatMap((e) => e.heroes);
  API.startExpedition = (slot, kind, heroes) => {
    if (S.expedition[slot] || !heroes.length) return false;
    S.expedition[slot] = { kind, heroes, start: Date.now(), dur: API.EXPEDITIONS[kind].min * 60000, power: heroes.reduce((s, id) => s + API.power(id), 0) };
    changed('exp');
    return true;
  };
  API.expeditionLeft = (slot) => { const e = S.expedition[slot]; return e ? Math.max(0, e.start + e.dur - Date.now()) : 0; };
  API.claimExpedition = (slot) => {
    const e = S.expedition[slot];
    if (!e || API.expeditionLeft(slot) > 0) return null;
    const r = API.EXPEDITIONS[e.kind].reward(e.power);
    for (const k in r) r[k] = Math.round(r[k]);
    S.expedition[slot] = null;
    mission('expedition', 1);
    const got = API.give(r);
    changed('exp');
    return got;
  };
  API.expeditionReady = () => S.expedition.some((e, i) => e && API.expeditionLeft(i) === 0);

  API.unlocked = (feature) => S.teamLv >= (D.UNLOCK[feature] || 0);

  dailyReset();
  setInterval(() => { dailyReset(); API.tickStamina(); }, 30000);
  API.tickStamina();
})();
