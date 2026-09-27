/* ==========================================================================
   BALLS & GAMBLING — Cyber-Lottery
   * Black Jack against the house AI (6-deck shoe, dealer stands on 17,
     blackjack pays 3:2, double down on the first two cards)
   * Data Boxes: Brawl-Stars style loot boxes — buy with coins, tap to crack
     them open and reveal coins or new balls / bouncepads one by one.
   * Plinko (unlocked in the skill tree): drop your equipped ball through a
     3D peg board for coin multipliers — or the 0.09% token jackpot.
   * Crash Plane (unlocked in the skill tree): the multiplier grows
     exponentially while the jet climbs; cash out before its random crash.
   ========================================================================== */
(function () {
  'use strict';

  const NEON = window.NEON || {};
  if (!window.THREE || !NEON.profile || !NEON.models || !NEON.stage3d || !NEON.game) return;
  const P = NEON.profile, M = NEON.models, S3 = NEON.stage3d;
  const $ = (id) => document.getElementById(id);
  const play = (name, arg) => { const s = NEON.audio && NEON.audio.sfx; if (s && s[name]) s[name](arg); };
  const wait = (ms) => new Promise((res) => setTimeout(res, ms));
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const rand = (a, b) => a + Math.random() * (b - a);
  const hexNum = (css) => parseInt(css.slice(1), 16);
  const fmt = (n) => n.toLocaleString('en-US');

  // ================================================================ hub
  let view = 'hub';

  function open() {
    NEON.game.hideTitle();
    NEON.game.setMenuOpen(true);
    $('screen-lottery').classList.remove('hidden');
    showView('hub');
    ensureBoxImages();
  }

  function close() {
    $('screen-lottery').classList.add('hidden');
    NEON.game.showTitle();
  }

  const TITLES = { hub: 'CYBER-LOTTERY', bj: 'BLACK JACK', boxes: 'DATA BOXES', plinko: 'PLINKO', crash: 'CRASH PLANE' };

  function showView(v) {
    if (view === 'plinko' && v !== 'plinko') plinkoLeave();
    if (view === 'crash' && v !== 'crash') crashLeave();
    view = v;
    $('lot-hub').classList.toggle('hidden', v !== 'hub');
    $('lot-bj').classList.toggle('hidden', v !== 'bj');
    $('lot-boxes').classList.toggle('hidden', v !== 'boxes');
    $('lot-plinko').classList.toggle('hidden', v !== 'plinko');
    $('lot-crash').classList.toggle('hidden', v !== 'crash');
    const h = $('lot-title');
    h.textContent = TITLES[v];
    h.dataset.text = TITLES[v];
    if (v === 'hub') renderHub();
    if (v === 'bj') bjEnter();
    if (v === 'boxes') renderOffers();
    if (v === 'plinko') plinkoEnter();
    if (v === 'crash') crashEnter();
  }

  function renderHub() {
    const pk = P.perks.plinkoUnlocked();
    $('hub-plinko').classList.toggle('locked', !pk);
    $('hub-plinko-go').textContent = pk ? 'DROP A BALL ›' : 'UNLOCK IN THE SKILL TREE ›';
    const crx = P.perks.crashUnlocked();
    $('hub-crash').classList.toggle('locked', !crx);
    $('hub-crash-go').textContent = crx ? 'TAKE OFF ›' : 'UNLOCK IN THE SKILL TREE ›';
  }

  function back() {
    if (view === 'bj' && bjInHand()) {
      bjMsg('FINISH THE HAND FIRST', 'lose');
      play('error');
      return;
    }
    if (view === 'crash' && cr.state === 'flying' && !cr.cashed) {
      crMsg('CASH OUT OR WAIT FOR THE CRASH', 'lose');
      play('error');
      return;
    }
    play('click');
    if (view !== 'hub') showView('hub');
    else close();
  }

  $('btn-lottery').addEventListener('click', () => { play('click'); open(); });
  $('lot-back').addEventListener('click', back);
  $('hub-bj').addEventListener('click', () => { play('click'); showView('bj'); });
  $('hub-boxes').addEventListener('click', () => { play('click'); showView('boxes'); });
  $('hub-plinko').addEventListener('click', () => {
    play('click');
    if (P.perks.plinkoUnlocked()) { showView('plinko'); return; }
    // locked: jump straight to the PLINKO node in the skill tree
    $('screen-lottery').classList.add('hidden');
    if (NEON.skills) NEON.skills.open('plinko');
  });
  $('hub-crash').addEventListener('click', () => {
    play('click');
    if (P.perks.crashUnlocked()) { showView('crash'); return; }
    $('screen-lottery').classList.add('hidden');
    if (NEON.skills) NEON.skills.open('crash');
  });

  // ========================================================== BLACK JACK
  const SUITS = ['♠', '♥', '♦', '♣'];
  const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const MIN_BET = 10;
  const bj = { shoe: [], player: [], dealer: [], bet: 0, lastBet: 25, pending: 25, phase: 'bet', busy: false };

  function newShoe() {
    bj.shoe = [];
    for (let d = 0; d < 6; d++) for (const s of SUITS) for (const r of RANKS) bj.shoe.push({ r, s });
    for (let i = bj.shoe.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bj.shoe[i], bj.shoe[j]] = [bj.shoe[j], bj.shoe[i]];
    }
  }

  function draw() {
    if (bj.shoe.length < 60) newShoe();
    return Object.assign({}, bj.shoe.pop());
  }

  function handValue(cards) {
    let t = 0, aces = 0;
    for (const c of cards) {
      if (c.r === 'A') { t += 11; aces++; }
      else if (c.r === 'J' || c.r === 'Q' || c.r === 'K') t += 10;
      else t += parseInt(c.r, 10);
    }
    while (t > 21 && aces) { t -= 10; aces--; }
    return t;
  }

  function cardEl(c, down) {
    const red = c.s === '♥' || c.s === '♦';
    const el = document.createElement('div');
    el.className = 'card' + (red ? ' red' : '') + (down ? ' down' : '');
    el.innerHTML =
      '<div class="card-inner">' +
        `<div class="card-face card-front"><span class="c-corner">${c.r}<i>${c.s}</i></span>` +
        `<span class="c-pip">${c.s}</span><span class="c-corner c-br">${c.r}<i>${c.s}</i></span></div>` +
        '<div class="card-face card-back"><span>NS</span></div>' +
      '</div>';
    return el;
  }

  function bjInHand() {
    return bj.busy || bj.phase === 'deal' || bj.phase === 'player' || bj.phase === 'dealer';
  }

  function bjMsg(text, cls) {
    const el = $('bj-msg');
    el.textContent = text;
    el.className = 'bj-msg' + (cls ? ' ' + cls : '');
    void el.offsetWidth;
    el.classList.add('pop');
  }

  function renderBet() {
    $('bj-bet').textContent = fmt(bj.phase === 'bet' || bj.phase === 'done' ? bj.pending : bj.bet);
  }

  function renderTotals() {
    const holeDown = bj.dealer[1] && bj.dealer[1].el && bj.dealer[1].el.classList.contains('down');
    $('bj-player-total').textContent = bj.player.length ? handValue(bj.player) : '';
    $('bj-dealer-total').textContent = !bj.dealer.length ? '' : holeDown ? handValue([bj.dealer[0]]) + ' + ?' : handValue(bj.dealer);
  }

  function setControls(mode) {
    $('bj-betbar').classList.toggle('hidden', mode !== 'bet');
    $('bj-actions').classList.toggle('hidden', mode !== 'play');
    if (mode === 'play') {
      $('bj-double').disabled = bj.player.length !== 2 || P.coins < bj.bet;
    }
  }

  function bjEnter() {
    if (bjInHand()) return;
    bj.phase = 'bet';
    bj.player = [];
    bj.dealer = [];
    $('bj-player').innerHTML = '';
    $('bj-dealer').innerHTML = '';
    bj.pending = clamp(bj.pending, Math.min(MIN_BET, P.coins), Math.max(MIN_BET, P.coins));
    if (P.coins < MIN_BET) bj.pending = 0;
    $('bj-deal').textContent = 'DEAL';
    renderBet();
    renderTotals();
    setControls('bet');
    bjMsg(P.coins < MIN_BET ? 'NOT ENOUGH COINS — PLAY A RUN TO EARN MORE' : 'PLACE YOUR BET', P.coins < MIN_BET ? 'lose' : '');
  }

  async function give(who, down) {
    const c = draw();
    bj[who].push(c);
    c.el = cardEl(c, down);
    $(who === 'player' ? 'bj-player' : 'bj-dealer').appendChild(c.el);
    play('card');
    renderTotals();
    await wait(300);
  }

  async function revealHole() {
    const hole = bj.dealer[1];
    if (hole && hole.el.classList.contains('down')) {
      hole.el.classList.remove('down');
      play('card');
      renderTotals();
      await wait(450);
    }
  }

  async function deal() {
    if (bj.busy || !(bj.phase === 'bet' || bj.phase === 'done')) return;
    const bet = bj.pending;
    if (bet < MIN_BET) { bjMsg('MINIMUM BET IS ' + MIN_BET + ' COINS', 'lose'); play('error'); return; }
    if (!P.spend(bet)) { bjMsg('NOT ENOUGH COINS', 'lose'); play('error'); return; }
    bj.busy = true;
    bj.bet = bet;
    bj.lastBet = bet;
    bj.phase = 'deal';
    bj.player = [];
    bj.dealer = [];
    $('bj-player').innerHTML = '';
    $('bj-dealer').innerHTML = '';
    renderBet();
    setControls('none');
    bjMsg('');
    play('chip');
    await give('player');
    await give('dealer');
    await give('player');
    await give('dealer', true);
    const p = handValue(bj.player), d = handValue(bj.dealer);
    if (p === 21 || d === 21) {
      await revealHole();
      bj.busy = false;
      settle(p === 21 && d === 21 ? 'push' : p === 21 ? 'blackjack' : 'dealerbj');
      return;
    }
    bj.phase = 'player';
    bj.busy = false;
    setControls('play');
  }

  async function hit() {
    if (bj.phase !== 'player' || bj.busy) return;
    bj.busy = true;
    setControls('none');
    await give('player');
    bj.busy = false;
    const v = handValue(bj.player);
    if (v > 21) { await revealHole(); settle('bust'); }
    else if (v === 21) stand();
    else setControls('play');
  }

  async function stand() {
    if (bj.phase !== 'player' || bj.busy) return;
    bj.busy = true;
    bj.phase = 'dealer';
    setControls('none');
    await revealHole();
    while (handValue(bj.dealer) < 17) await give('dealer');
    bj.busy = false;
    const p = handValue(bj.player), d = handValue(bj.dealer);
    settle(d > 21 ? 'dealerbust' : p > d ? 'win' : p < d ? 'lose' : 'push');
  }

  async function doubleDown() {
    if (bj.phase !== 'player' || bj.busy || bj.player.length !== 2) return;
    if (!P.spend(bj.bet)) { bjMsg('NOT ENOUGH COINS TO DOUBLE', 'lose'); play('error'); return; }
    bj.bet *= 2;
    renderBet();
    play('chip');
    bj.busy = true;
    setControls('none');
    await give('player');
    bj.busy = false;
    if (handValue(bj.player) > 21) { await revealHole(); settle('bust'); }
    else stand();
  }

  function settle(result) {
    let pay = 0, text = 'HOUSE WINS', cls = 'lose';
    switch (result) {
      case 'blackjack': pay = Math.floor(bj.bet * 2.5); text = 'BLACKJACK!'; cls = 'win big'; break;
      case 'win': pay = bj.bet * 2; text = 'YOU WIN'; cls = 'win'; break;
      case 'dealerbust': pay = bj.bet * 2; text = 'HOUSE BUSTS — YOU WIN'; cls = 'win'; break;
      case 'push': pay = bj.bet; text = 'PUSH — BET RETURNED'; cls = 'push'; break;
      case 'bust': text = 'BUST'; break;
      case 'dealerbj': text = 'HOUSE BLACKJACK'; break;
      default: break;
    }
    if (pay) P.addCoins(pay);
    const net = pay - bj.bet;
    bjMsg(text + (net > 0 ? '   +' + fmt(net) : net < 0 ? '   ' + fmt(net) : ''), cls);
    if (result === 'blackjack') play('jackpot');
    else if (net > 0) play('win');
    else if (net === 0) play('chip');
    else play('bust');
    bj.phase = 'done';
    // offer the same stake again (not the doubled one), capped by what's left
    bj.pending = Math.min(bj.lastBet, P.coins);
    if (bj.pending < MIN_BET) bj.pending = 0;
    $('bj-deal').textContent = 'DEAL AGAIN';
    renderBet();
    setControls('bet');
  }

  document.querySelectorAll('#bj-betbar .chip').forEach((b) => {
    b.addEventListener('click', () => {
      if (bj.busy || !(bj.phase === 'bet' || bj.phase === 'done')) return;
      const v = b.dataset.chip;
      if (v === 'clear') bj.pending = 0;
      else if (v === 'max') bj.pending = P.coins;
      else bj.pending = Math.min(P.coins, bj.pending + parseInt(v, 10));
      play('chip');
      renderBet();
    });
  });
  $('bj-deal').addEventListener('click', deal);
  $('bj-hit').addEventListener('click', () => { play('click'); hit(); });
  $('bj-stand').addEventListener('click', () => { play('click'); stand(); });
  $('bj-double').addEventListener('click', doubleDown);

  // ========================================================== DATA BOXES
  // heroChance: chance per drop to pull an RPG hero instead (see NEON.rpg.pullHero)
  const BOXES = [
    { id: 'data', name: 'DATA BOX', price: 250, drops: 2, itemChance: 0.35, heroChance: 0.1, coins: [10, 40] },
    { id: 'big', name: 'BIG DATA BOX', price: 650, drops: 4, itemChance: 0.42, heroChance: 0.12, coins: [15, 60] },
    { id: 'mega', name: 'MEGA DATA BOX', price: 1600, drops: 8, itemChance: 0.45, heroChance: 0.15, coins: [20, 80], guarantee: 3 },
  ];
  const heroesOn = () => !!(NEON.rpg && NEON.rpg.pullHero && NEON.rpgData);
  const heroRank = (rw) => Math.min(5, Math.round((rw.rar.rank * 5) / 7));   // 0…7 → the reveal sound's 0…5
  const ITEM_WEIGHTS = { rare: 50, super: 28, epic: 14, mythic: 6, legendary: 2 };

  // skill tree: BARGAIN PROTOCOL lowers prices, LUCKY ALGORITHM improves the odds
  const boxPrice = (box) => Math.round(box.price * P.perks.boxPriceMult());
  function itemWeight(r) {
    return ITEM_WEIGHTS[r] * (P.RARITY[r].rank >= 3 ? P.perks.lootRareMult() : 1);
  }

  function rollItem(minRank) {
    const entries = Object.keys(ITEM_WEIGHTS).filter((r) => P.RARITY[r].rank >= (minRank || 0));
    let total = 0;
    entries.forEach((r) => { total += itemWeight(r); });
    let x = Math.random() * total, rarity = entries[entries.length - 1];
    for (const r of entries) { x -= itemWeight(r); if (x <= 0) { rarity = r; break; } }
    const pool = [];
    P.KINDS.forEach((kind) => P.list(kind).forEach((it) => { if (it.rarity === rarity) pool.push({ kind, it }); }));
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // Rolls every drop, applies it to the profile right away (so nothing is lost if
  // the window closes mid-animation) and returns the rewards in reveal order.
  function rollBox(box) {
    const drops = [];
    let heroes = 0;
    for (let i = 0; i < box.drops; i++) {
      if (heroesOn() && Math.random() < box.heroChance) heroes++;
      else if (Math.random() < box.itemChance + P.perks.lootItemBonus()) drops.push(Object.assign({ type: 'item' }, rollItem(0)));
      else drops.push({ type: 'coins', amount: randInt(box.coins[0], box.coins[1]) });
    }
    if (box.guarantee && !drops.some((d) => d.type === 'item' && P.RARITY[d.it.rarity].rank >= box.guarantee)) {
      if (drops.length) drops[drops.length - 1] = Object.assign({ type: 'item' }, rollItem(box.guarantee));
      else drops.push(Object.assign({ type: 'item' }, rollItem(box.guarantee)));
    }
    const coinTotal = drops.filter((d) => d.type === 'coins').reduce((s, d) => s + d.amount, 0);
    const items = drops.filter((d) => d.type === 'item')
      .sort((a, b) => P.RARITY[a.it.rarity].rank - P.RARITY[b.it.rarity].rank);
    // heroes are pulled (and added to the RPG roster) right away and revealed last
    const pulled = [];
    for (let i = 0; i < heroes; i++) pulled.push(NEON.rpg.pullHero());
    pulled.sort((a, b) => a.rar.rank - b.rar.rank);
    const out = [];
    if (coinTotal) out.push({ type: 'coins', amount: coinTotal });
    out.push(...items, ...pulled);
    for (const d of out) {
      if (d.type === 'coins') { P.addCoins(d.amount); continue; }
      if (d.type === 'hero') continue;
      d.isNew = P.grant(d.kind, d.it.id);
      if (!d.isNew) {
        d.dupe = P.RARITY[d.it.rarity].dupe;
        P.addCoins(d.dupe);
      }
    }
    return out;
  }

  // --- box thumbnails for the shop
  const boxImages = {};
  function boxThumbProgram(tier) {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    camera.position.set(0, 3.2, 7.2);
    camera.lookAt(0, 0.9, 0);
    scene.add(new THREE.AmbientLight(0x6a5aff, 0.6));
    const k = new THREE.PointLight(0xff3cf2, 2.5, 30); k.position.set(-4, 5, 4);
    const f = new THREE.PointLight(0x19e6ff, 2.5, 30); f.position.set(4, 3, 5);
    scene.add(k, f);
    const box = M.makeBox(tier);
    box.group.rotation.y = -0.5;
    scene.add(box.group);
    return { scene, camera, update() {} };
  }
  function ensureBoxImages() {
    BOXES.forEach((b) => { if (!boxImages[b.id]) boxImages[b.id] = S3.snapshot(boxThumbProgram(b.id), 260, 260); });
    $('hub-box-img').src = boxImages.mega;
  }

  function renderOffers() {
    ensureBoxImages();
    const wrap = $('box-offers');
    wrap.innerHTML = '';
    const luck = P.skill('luck');
    BOXES.forEach((b) => {
      const tier = M.BOX_TIERS[b.id];
      const price = boxPrice(b);
      const card = document.createElement('div');
      card.className = 'offer';
      card.style.setProperty('--bc', '#' + tier.color.toString(16).padStart(6, '0'));
      card.innerHTML =
        (luck ? `<div class="offer-luck">LUCK +${luck}</div>` : '') +
        `<img alt="" src="${boxImages[b.id]}">` +
        `<h3>${b.name}</h3>` +
        `<div class="offer-drops">${b.drops} DROPS${b.guarantee ? ' · EPIC+ GUARANTEED' : ''}</div>` +
        (heroesOn() ? `<div class="offer-drops hero">${Math.round(b.heroChance * 100)}% RPG HERO PER DROP</div>` : '') +
        (price < b.price ? `<div class="offer-was">${fmt(b.price)}</div>` : '') +
        `<button class="btn buy ${P.coins < price ? 'poor' : ''}"><i class="coin-icon"></i> ${fmt(price)}</button>` +
        (b.id === 'data' && P.freeBoxes ? `<button class="btn gold free-box">OPEN FREE &times;${P.freeBoxes}</button>` : '') +
        '<div class="offer-err"></div>';
      card.querySelector('.buy').addEventListener('click', () => buyBox(b, card));
      const free = card.querySelector('.free-box');
      if (free) free.addEventListener('click', () => openFreeBox());
      wrap.appendChild(card);
    });
  }

  function buyBox(box, card) {
    const price = boxPrice(box);
    if (P.coins < price) {
      play('error');
      const err = card.querySelector('.offer-err');
      err.textContent = 'NEED ' + fmt(price - P.coins) + ' MORE COINS';
      err.classList.remove('show');
      void err.offsetWidth;
      err.classList.add('show');
      return;
    }
    P.spend(price);
    play('chip');
    openStage(box, rollBox(box));
  }

  // free Data Boxes come from the RPG's AFK loot; `onClose` hands the 3D renderer back to the caller
  function openFreeBox(onClose) {
    if (!P.useFreeBox()) return false;
    play('chip');
    openStage(BOXES[0], rollBox(BOXES[0]));
    stage.onClose = onClose || null;
    $('box-again').classList.add('hidden');
    return true;
  }

  // --- the opening stage (3D program for stage3d)
  const easeOutBounce = (x) => {
    const n1 = 7.5625, d1 = 2.75;
    if (x < 1 / d1) return n1 * x * x;
    if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
    if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
    return n1 * (x -= 2.625 / d1) * x + 0.984375;
  };
  const easeOutBack = (x) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };

  function makeBoxStage() {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 200);
    const camBase = new THREE.Vector3(0, 4.4, 14.5), camLook = new THREE.Vector3(0, 1.6, 0);
    camera.position.copy(camBase);
    camera.lookAt(camLook);
    scene.add(new THREE.AmbientLight(0x6a5aff, 0.55));
    const key = new THREE.PointLight(0xff3cf2, 3, 40); key.position.set(-5, 6, 6);
    const fill = new THREE.PointLight(0x19e6ff, 3, 40); fill.position.set(5, 4, 6);
    const top = new THREE.DirectionalLight(0xffffff, 0.9); top.position.set(0, 12, 4);
    const flashL = new THREE.PointLight(0xffffff, 0, 30); flashL.position.set(0, 3, 3);
    scene.add(key, fill, top, flashL);

    const pedGeo = new THREE.CylinderGeometry(2.4, 2.7, 0.35, 6);
    const ped = new THREE.Mesh(pedGeo, new THREE.MeshStandardMaterial({ color: 0x141830, metalness: 0.9, roughness: 0.2 }));
    ped.position.y = -0.18;
    ped.add(new THREE.LineSegments(new THREE.EdgesGeometry(pedGeo), new THREE.LineBasicMaterial({ color: 0x19e6ff })));
    const pedRing = new THREE.Mesh(new THREE.RingGeometry(2.9, 3.05, 96), new THREE.MeshBasicMaterial({
      color: 0xff3cf2, transparent: true, opacity: 0.8, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    pedRing.rotation.x = -Math.PI / 2;
    pedRing.position.y = -0.34;
    scene.add(ped, pedRing);

    const boxHolder = new THREE.Group();
    const rewardHolder = new THREE.Group();
    scene.add(boxHolder, rewardHolder);
    // soft halo *behind* the reward so it frames the model instead of washing it out
    const rewardGlow = M.glow(0xffffff, 7, 0);
    rewardGlow.position.set(0, 2.6, -2.5);
    scene.add(rewardGlow);

    const sparks = [];
    for (let i = 0; i < 180; i++) {
      const s = M.glow(0xffffff, 0.4, 0);
      s.visible = false;
      scene.add(s);
      sparks.push({ s, vx: 0, vy: 0, vz: 0, life: 0, max: 1 });
    }
    let sparkNext = 0;
    function spray(x, y, z, color, n, speed) {
      for (let i = 0; i < n; i++) {
        const p = sparks[sparkNext];
        sparkNext = (sparkNext + 1) % sparks.length;
        const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
        const sp = speed * (0.35 + Math.random() * 0.65);
        p.s.visible = true;
        p.s.position.set(x, y, z);
        p.s.material.color.setHex(color);
        const sc = 0.2 + Math.random() * 0.5;
        p.s.scale.set(sc, sc, 1);
        p.vx = r * Math.cos(th) * sp;
        p.vy = Math.abs(u) * sp + 1.5;
        p.vz = r * Math.sin(th) * sp;
        p.life = p.max = 0.6 + Math.random() * 0.8;
      }
    }

    const st = { t: 0, phase: 'drop', box: null, landed: false, open: 0, openTarget: 0, squash: 0, shake: 0,
      reward: null, rewardT: 0, rewardColor: 0xffffff, onLand: null, dropStart: 0 };

    function rewardModel(rw) {
      if (rw.type === 'coins') {
        const g = new THREE.Group();
        const n = clamp(Math.ceil(rw.amount / 25), 3, 7);
        const spinners = [];
        for (let i = 0; i < n; i++) {
          const c = M.makeCoin();
          c.group.position.set((i - (n - 1) / 2) * 0.6, Math.sin(i * 1.7) * 0.25, (i % 2) * 0.3);
          c.group.scale.setScalar(1.25);
          c.spinner.rotation.y = i * 0.6;
          spinners.push(c.spinner);
          g.add(c.group);
        }
        return { group: g, update(dt) { spinners.forEach((s) => { s.rotation.y += dt * 3; }); } };
      }
      if (rw.type === 'hero') {
        const m = NEON.rpgData.makeHeroModel(rw.def);
        m.group.scale.setScalar(1.7);
        m.face.rotation.y = -Math.PI / 2;
        return { group: m.group, update: (dt, t) => { m.update(dt, t); m.flash(0); } };
      }
      if (rw.kind === 'ball') {
        const m = M.makeBall(rw.it.id);
        m.group.scale.setScalar(3.6);
        return { group: m.group, update: (dt, t) => m.update(dt, t, 0, 0, 0) };
      }
      if (rw.kind === 'gun') {
        const m = M.makeGun(rw.it.id);
        const g = new THREE.Group();
        m.group.scale.setScalar(1.35);
        m.group.position.y = -0.7;
        m.turret.rotation.y = 0.9;
        g.add(m.group);
        return { group: g, update: (dt, t) => m.update(dt, t, { recoil: 0 }) };
      }
      const m = M.makePad(rw.it.id);
      const g = new THREE.Group();
      m.group.scale.setScalar(1.05);
      m.group.position.y = -0.5;
      g.add(m.group);
      return { group: g, update: (dt, t) => m.update(dt, t, { stun: 0, flash: 0 }) };
    }

    return {
      scene, camera,
      start(tier, onLand) {
        if (st.box) boxHolder.remove(st.box.group);
        st.box = M.makeBox(tier);
        boxHolder.add(st.box.group);
        st.box.setOpen(0);
        st.t = 0;
        st.phase = 'drop';
        st.dropStart = performance.now();
        st.landed = false;
        st.open = st.openTarget = 0;
        st.onLand = onLand;
        boxHolder.position.set(0, 9, 0);
        boxHolder.scale.setScalar(1);
        boxHolder.rotation.set(0, -0.4, 0);
        this.hideReward();
      },
      tap() { st.squash = 1; st.shake = 1; },
      openLid() {
        st.openTarget = 1;
        flashL.intensity = 6;
        flashL.color.setHex(st.box.color);
        spray(0, 1.6, 0, st.box.color, 60, 6);
        spray(0, 1.6, 0, 0xffffff, 30, 5);
      },
      showReward(rw, color) {
        this.hideReward();
        st.reward = rewardModel(rw);
        st.rewardT = 0;
        st.rewardStart = performance.now();
        st.rewardColor = color;
        rewardHolder.add(st.reward.group);
        rewardGlow.material.color.setHex(color);
        flashL.intensity = 4;
        flashL.color.setHex(color);
        spray(0, 1.5, 0.5, color, 45, 6);
        spray(0, 1.5, 0.5, 0xffffff, 12, 4);
      },
      hideReward() {
        if (st.reward) rewardHolder.remove(st.reward.group);
        st.reward = null;
        rewardGlow.material.opacity = 0;
      },
      update(dt) {
        st.t += dt;
        if (!st.box) return;
        const k0 = Math.max(1, 1.2 / camera.aspect);   // back off on portrait screens
        camera.position.copy(camBase).sub(camLook).multiplyScalar(k0).add(camLook);
        camera.lookAt(camLook);
        // box: drop in with a bounce (wall-clock timed so slow frames can't stall it), then idle / squash on taps
        if (st.phase === 'drop') {
          const k = Math.min(1, (performance.now() - st.dropStart) / 800);
          boxHolder.position.y = 9 * (1 - easeOutBounce(k));
          if (k > 0.35 && !st.landed) {
            st.landed = true;
            spray(0, 0.2, 0, st.box.color, 40, 5);
            if (st.onLand) st.onLand();
          }
          if (k >= 1) st.phase = 'idle';
        }
        const opened = st.openTarget > 0;
        if (st.phase !== 'drop') {
          const ty = opened ? -1.2 : 0, tz = opened ? -2.2 : 0;
          boxHolder.position.y += (ty - boxHolder.position.y) * Math.min(1, dt * 5);
          boxHolder.position.z += (tz - boxHolder.position.z) * Math.min(1, dt * 5);
          boxHolder.rotation.y = -0.4 + Math.sin(st.t * 0.8) * 0.18;
        }
        st.open += (st.openTarget - st.open) * Math.min(1, dt * 6);
        st.box.setOpen(st.open);
        st.squash = Math.max(0, st.squash - dt * 4);
        st.shake = Math.max(0, st.shake - dt * 3);
        const base = opened ? 0.8 : 1;
        const sq = Math.sin(st.squash * Math.PI) * st.squash;
        boxHolder.scale.set(base * (1 + sq * 0.12), base * (1 - sq * 0.2), base * (1 + sq * 0.12));
        boxHolder.rotation.z = Math.sin(st.t * 60) * st.shake * 0.06;
        if (!opened && st.phase === 'idle') boxHolder.position.y = Math.sin(st.t * 2.2) * 0.08;
        pedRing.rotation.z += dt * 0.5;

        // reward: burst out of the box and hover in front of it
        if (st.reward) {
          st.rewardT += dt;
          const k = Math.min(1, (performance.now() - st.rewardStart) / 500);
          const e = Math.max(0.001, easeOutBack(k));
          rewardHolder.position.set(0, 0.9 + (2.9 - 0.9) * e, -1 + 2.6 * e);
          rewardHolder.scale.setScalar(e);
          rewardHolder.rotation.y += dt * 0.9;
          rewardGlow.material.opacity = 0.22 + 0.08 * Math.sin(st.t * 4);
          st.reward.update(dt, st.t);
          if (Math.random() < dt * 20) spray(rand(-1.4, 1.4), rand(1.2, 3.4), 1.2, st.rewardColor, 1, 1.2);
        }
        flashL.intensity = Math.max(0, flashL.intensity - dt * 8);
        for (const p of sparks) {
          if (p.life <= 0) continue;
          p.life -= dt;
          if (p.life <= 0) { p.s.visible = false; continue; }
          p.vy -= 6 * dt;
          p.s.position.x += p.vx * dt;
          p.s.position.y += p.vy * dt;
          p.s.position.z += p.vz * dt;
          p.s.material.opacity = p.life / p.max;
        }
      },
    };
  }

  const stage = { prog: null, box: null, rewards: [], idx: -1, done: true, lockUntil: 0 };

  function openStage(box, rewards) {
    if (!stage.prog) stage.prog = makeBoxStage();
    stage.box = box;
    stage.rewards = rewards;
    stage.idx = -1;
    stage.done = false;
    stage.lockUntil = performance.now() + 900;
    stage.onClose = null;
    $('box-again').classList.remove('hidden');
    const el = $('box-stage');
    el.classList.remove('hidden');
    el.style.setProperty('--rc', '#' + M.BOX_TIERS[box.id].color.toString(16).padStart(6, '0'));
    el.classList.remove('revealing');
    $('box-summary').classList.add('hidden');
    $('box-reward').classList.remove('show');
    $('box-title').textContent = box.name;
    $('box-count').textContent = rewards.length;
    $('box-count').classList.remove('hidden');
    $('box-tap').textContent = 'TAP TO OPEN';
    $('box-tap').classList.remove('hidden');
    S3.mount($('box-canvas'), stage.prog);
    stage.prog.start(box.id, () => play('boxTap'));
  }

  function tapStage() {
    if (stage.done || performance.now() < stage.lockUntil) return;
    stage.lockUntil = performance.now() + 420;
    if (stage.idx >= stage.rewards.length - 1) { showSummary(); return; }
    stage.idx++;
    const rw = stage.rewards[stage.idx];
    const hero = rw.type === 'hero';
    const rarity = rw.type === 'coins' ? null : hero ? rw.rar : P.RARITY[rw.it.rarity];
    const colorCss = rarity ? rarity.color : '#ffc933';
    stage.prog.tap();
    if (stage.idx === 0) {
      stage.prog.openLid();
      play('boxOpen');
    }
    stage.prog.showReward(rw, hexNum(colorCss));
    play('reveal', hero ? heroRank(rw) : rarity ? rarity.rank : 0);
    if (rw.type === 'coins') play('coin');

    const el = $('box-stage');
    el.style.setProperty('--rc', colorCss);
    el.classList.add('revealing');
    const info = $('box-reward');
    info.classList.remove('show');
    void info.offsetWidth;
    if (rw.type === 'coins') {
      info.innerHTML = '<div class="rw-rarity">COINS</div>' +
        `<div class="rw-name"><i class="coin-icon"></i> +${fmt(rw.amount)}</div>`;
    } else if (hero) {
      const d = rw.def, s = NEON.rpg.heroStats(d.id, 1, 1);
      info.innerHTML = `<div class="rw-rarity"><span class="rar-badge r-${d.rarity}">${d.rarity}</span> ${rarity.name} RPG HERO</div>` +
        `<div class="rw-name">${d.name}</div>` +
        `<div class="rw-ability">${NEON.rpgData.CLASSES[d.cls].name} · ${d.move === 'pierce' ? '➤ PIERCE' : '⟲ BOUNCE'} · SPD ${s.spd} — ${d.tag}</div>` +
        (rw.isNew ? '<div class="rw-note new">NEW HERO!</div>'
          : `<div class="rw-note dupe">COPY → <i class="dust-icon"></i> +${fmt(rw.dust)} STARDUST</div>`);
    } else {
      const kindName = P.KIND_NAME[rw.kind];
      info.innerHTML = `<div class="rw-rarity">${rarity.name} ${kindName}</div>` +
        `<div class="rw-name">${rw.it.name}</div>` +
        `<div class="rw-ability">${rw.it.ability}</div>` +
        (rw.isNew ? '<div class="rw-note new">NEW!</div>'
          : `<div class="rw-note dupe">DUPLICATE → <i class="coin-icon"></i> +${fmt(rw.dupe)}</div>`);
    }
    info.classList.toggle('epic', !!(rarity && rarity.rank >= (hero ? 4 : 3)));
    info.classList.add('show');
    const left = stage.rewards.length - stage.idx - 1;
    $('box-count').textContent = left;
    $('box-count').classList.toggle('hidden', left === 0);
    $('box-tap').textContent = left ? 'TAP FOR NEXT DROP' : 'TAP TO FINISH';
  }

  function showSummary() {
    stage.done = true;
    stage.prog.hideReward();
    $('box-reward').classList.remove('show');
    $('box-tap').classList.add('hidden');
    $('box-count').classList.add('hidden');
    $('box-stage').classList.remove('revealing');
    const grid = $('sum-grid');
    grid.innerHTML = '';
    let coinsTotal = 0;
    stage.rewards.forEach((rw) => {
      const div = document.createElement('div');
      div.className = 'sum-item';
      if (rw.type === 'coins') {
        coinsTotal += rw.amount;
        div.style.setProperty('--rc', '#ffc933');
        div.innerHTML = '<div class="sum-img coin-big"><i class="coin-icon"></i></div>' +
          `<div class="sum-name">+${fmt(rw.amount)}</div><div class="sum-sub">COINS</div>`;
      } else if (rw.type === 'hero') {
        div.style.setProperty('--rc', rw.rar.color);
        div.innerHTML = `<div class="sum-img"><img alt="" src="${NEON.rpg.thumb(rw.id)}"></div>` +
          `<div class="sum-name"><span class="rar-badge r-${rw.def.rarity}">${rw.def.rarity}</span> ${rw.def.name}</div>` +
          `<div class="sum-sub">${rw.isNew ? '<b>NEW!</b> RPG HERO' : '<i class="dust-icon"></i> +' + fmt(rw.dust) + ' STARDUST'}</div>`;
      } else {
        const r = P.RARITY[rw.it.rarity];
        if (!rw.isNew) coinsTotal += rw.dupe;
        div.style.setProperty('--rc', r.color);
        const img = NEON.collection ? NEON.collection.thumb(rw.kind, rw.it.id) : '';
        div.innerHTML = `<div class="sum-img"><img alt="" src="${img}"></div>` +
          `<div class="sum-name">${rw.it.name}</div>` +
          `<div class="sum-sub">${rw.isNew ? '<b>NEW!</b> ' + r.name : 'DUPE +' + fmt(rw.dupe)}</div>`;
      }
      grid.appendChild(div);
    });
    $('sum-coins').textContent = '+' + fmt(coinsTotal);
    $('box-summary').classList.remove('hidden');
  }

  function closeStage() {
    S3.unmount(stage.prog);
    $('box-stage').classList.add('hidden');
    stage.done = true;
    renderOffers();
    if (stage.onClose) {
      const done = stage.onClose;
      stage.onClose = null;
      done();
    }
  }

  $('box-stage').addEventListener('pointerdown', (e) => {
    if (e.target.closest('#box-summary')) return;
    tapStage();
  });
  $('box-done').addEventListener('click', () => { play('click'); closeStage(); });
  $('box-again').addEventListener('click', () => {
    const box = stage.box;
    closeStage();
    const card = [...document.querySelectorAll('#box-offers .offer')][BOXES.indexOf(box)];
    if (card) buyBox(box, card);
  });

  // ============================================================== PLINKO
  const PK_ROWS = 11;
  const PK_SLOTS = PK_ROWS + 1;
  // outer slots are the token jackpot (0); everything else is a coin multiplier
  const PK_MULT = [0, 9, 3, 1.4, 0.7, 0.4, 0.4, 0.7, 1.4, 3, 9, 0];
  const PK_JACKPOT_TOKENS = 10;
  const PK_JACKPOT_CHANCE = 0.0009;
  const PK_MIN_BET = 10;
  const PK_MAX_IN_FLIGHT = 12;
  const pk = { prog: null, bet: 25, history: [] };

  // Outcome first, animation second: the landing slot is rolled up front and the
  // ball's bounce path is built to reach it. Plain rolls follow the classic 50/50
  // bounce distribution (most balls land in the low-paying middle); PLINKO LUCK
  // adds "lucky bounces" that can land in any non-jackpot slot.
  function plinkoRoll() {
    if (Math.random() < PK_JACKPOT_CHANCE) return Math.random() < 0.5 ? 0 : PK_SLOTS - 1;
    if (Math.random() < P.perks.plinkoLuck()) return 1 + Math.floor(Math.random() * (PK_SLOTS - 2));
    let k;
    do {
      k = 0;
      for (let i = 0; i < PK_ROWS; i++) if (Math.random() < 0.5) k++;
    } while (k === 0 || k === PK_SLOTS - 1);
    return k;
  }

  function slotColor(i) {
    const m = PK_MULT[i];
    if (!m) return 0xb84dff;
    if (m >= 9) return 0xffc933;
    if (m >= 3) return 0xff9a1f;
    if (m >= 1.4) return 0x8dff2a;
    if (m >= 0.7) return 0x19e6ff;
    return 0xff2a4d;
  }

  function slotCanvas(i) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    const g = c.getContext('2d');
    const col = '#' + slotColor(i).toString(16).padStart(6, '0');
    g.font = '900 ' + (PK_MULT[i] ? 82 : 52) + 'px Orbitron, "Arial Black", Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 12;
    g.strokeStyle = 'rgba(4,2,13,0.9)';
    const txt = PK_MULT[i] ? PK_MULT[i] + '×' : 'TOKEN';
    g.strokeText(txt, 128, 68);
    g.fillStyle = '#ffffff';
    g.shadowColor = col;
    g.shadowBlur = 18;
    g.fillText(txt, 128, 68);
    return c;
  }

  function boardCanvas() {
    const c = document.createElement('canvas');
    c.width = c.height = 1024;
    const g = c.getContext('2d');
    g.fillStyle = '#07051a';
    g.fillRect(0, 0, 1024, 1024);
    g.strokeStyle = 'rgba(166,77,255,0.14)';
    g.lineWidth = 2;
    const s = 26, hw = Math.sqrt(3) * s;
    for (let row = 0; row * s * 1.5 < 1060; row++) {
      for (let x = (row % 2) * hw / 2; x < 1060; x += hw) {
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
    const grd = g.createRadialGradient(512, 420, 60, 512, 512, 620);
    grd.addColorStop(0, 'rgba(255,60,242,0.16)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 1024, 1024);
    return c;
  }

  function makePlinkoBoard() {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 200);
    const S = 1.0, DY = 0.92, TOPY = 5.0, PEG_R = 0.12, BALL_S = 0.8;
    const BALL_R = M.BALL_R * BALL_S;
    const pegY = (r) => TOPY - r * DY;
    const SLOT_Y = pegY(PK_ROWS - 1) - 1.05;
    const CY = (TOPY + 1.6 + SLOT_Y - 0.5) / 2;

    scene.add(new THREE.AmbientLight(0x6a5aff, 0.55));
    const key = new THREE.PointLight(0xff3cf2, 2.2, 40); key.position.set(-6, 6, 8);
    const fill = new THREE.PointLight(0x19e6ff, 2.2, 40); fill.position.set(6, 2, 8);
    const flash = new THREE.PointLight(0xffffff, 0, 16); flash.position.set(0, SLOT_Y + 1, 3);
    scene.add(key, fill, flash);

    const boardTex = new THREE.CanvasTexture(boardCanvas());
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(15, 14.5), new THREE.MeshStandardMaterial({
      color: 0x0a0a1a, emissive: 0xffffff, emissiveMap: boardTex, emissiveIntensity: 0.5, metalness: 0.5, roughness: 0.5,
    }));
    panel.position.set(0, CY, -0.5);
    const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(15, 14.5, 0.1)), new THREE.LineBasicMaterial({ color: 0xff3cf2 }));
    frame.position.copy(panel.position);
    scene.add(panel, frame);

    // pegs: 3 at the top, one more per row
    const pegGeo = new THREE.SphereGeometry(PEG_R, 16, 12);
    const pegs = [];
    for (let r = 0; r < PK_ROWS; r++) {
      const row = [];
      for (let i = 0; i < r + 3; i++) {
        const mat = new THREE.MeshStandardMaterial({ color: 0x1a2240, emissive: 0x19e6ff, emissiveIntensity: 0.5, metalness: 0.6, roughness: 0.3 });
        const m = new THREE.Mesh(pegGeo, mat);
        m.position.set((i - (r + 2) / 2) * S, pegY(r), 0);
        scene.add(m);
        row.push({ m, mat, flash: 0 });
      }
      pegs.push(row);
    }

    // slots with their multipliers; the two outer jackpot slots carry a token crystal
    const slotGeo = new THREE.RoundedBoxGeometry(S * 0.9, 0.7, 0.5, 2, 0.08);
    const labelGeo = new THREE.PlaneGeometry(S * 0.86, S * 0.43);
    const slots = [];
    const tokens = [];
    for (let j = 0; j < PK_SLOTS; j++) {
      const col = slotColor(j);
      const mat = new THREE.MeshStandardMaterial({ color: 0x14142a, emissive: col, emissiveIntensity: 0.45, metalness: 0.6, roughness: 0.3 });
      const box = new THREE.Mesh(slotGeo, mat);
      box.position.set((j - (PK_SLOTS - 1) / 2) * S, SLOT_Y, 0);
      const label = new THREE.Mesh(labelGeo, new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(slotCanvas(j)), transparent: true, depthWrite: false }));
      label.position.z = 0.27;
      box.add(label);
      scene.add(box);
      slots.push({ box, mat, flash: 0, baseY: SLOT_Y });
      if (!PK_MULT[j]) {
        const tok = M.makeToken();
        tok.group.scale.setScalar(0.55);
        tok.group.position.set(box.position.x, SLOT_Y + 0.85, 0);
        scene.add(tok.group);
        tokens.push(tok);
      }
    }

    const sparks = [];
    for (let i = 0; i < 90; i++) {
      const s = M.glow(0xffffff, 0.3, 0);
      s.visible = false;
      scene.add(s);
      sparks.push({ s, vx: 0, vy: 0, life: 0, max: 1 });
    }
    let sparkNext = 0;
    function spray(x, y, color, n, speed) {
      for (let i = 0; i < n; i++) {
        const p = sparks[sparkNext];
        sparkNext = (sparkNext + 1) % sparks.length;
        const a = Math.random() * Math.PI * 2, sp = speed * (0.3 + Math.random() * 0.7);
        p.s.visible = true;
        p.s.position.set(x, y, 0.3);
        p.s.material.color.setHex(color);
        const sc = 0.15 + Math.random() * 0.3;
        p.s.scale.set(sc, sc, 1);
        p.vx = Math.cos(a) * sp;
        p.vy = Math.sin(a) * sp + 1;
        p.life = p.max = 0.35 + Math.random() * 0.4;
      }
    }

    const drops = [];
    let t = 0;
    return {
      scene, camera,
      inFlight: () => drops.length,
      drop(ballId, slot, onLand) {
        const dirs = [];
        for (let i = 0; i < PK_ROWS; i++) dirs.push(i < slot ? 1 : -1);
        for (let i = dirs.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
        }
        // waypoints: above the board, touching one peg per row, then into the slot
        const pts = [[rand(-0.12, 0.12), TOPY + 1.4]];
        let half = 0;
        for (let r = 0; r < PK_ROWS; r++) {
          pts.push([half * S / 2, pegY(r) + PEG_R + BALL_R]);
          half += dirs[r];
        }
        pts.push([half * S / 2, SLOT_Y + 0.2]);
        const model = M.makeBall(ballId);
        model.group.scale.setScalar(BALL_S);
        model.group.position.set(pts[0][0], pts[0][1], 0.1);
        scene.add(model.group);
        // segment timing: fall onto the first peg, quick hops between rows, drop into the slot
        const ends = [];
        let acc = 0;
        for (let s = 0; s < pts.length - 1; s++) {
          acc += s === 0 ? 0.32 : s === pts.length - 2 ? 0.28 : 0.15;
          ends.push(acc);
        }
        drops.push({ model, pts, ends, seg: 0, start: performance.now(), slot, onLand });
      },
      update(dt) {
        t += dt;
        const k0 = Math.max(1, 7.3 / (0.3057 * camera.aspect * 21.5));
        camera.position.set(0, CY, 21.5 * k0);
        camera.lookAt(0, CY, 0);
        const now = performance.now();
        for (let i = drops.length - 1; i >= 0; i--) {
          const d = drops[i];
          // wall-clock driven, so a slow frame never slows the ball down
          const el = (now - d.start) / 1000;
          while (d.seg < d.pts.length - 1 && el >= d.ends[d.seg]) {
            d.seg++;
            if (d.seg < d.pts.length - 1) {
              // just bounced off a peg in row seg-1
              const r = d.seg - 1;
              const peg = pegs[r][Math.round(d.pts[d.seg][0] / S + (r + 2) / 2)];
              if (peg) peg.flash = 1;
              play('tick');
              spray(d.pts[d.seg][0], d.pts[d.seg][1] - BALL_R, d.model.trail, 3, 2);
            }
          }
          if (d.seg >= d.pts.length - 1) {
            scene.remove(d.model.group);
            const sl = slots[d.slot];
            sl.flash = 1;
            const col = slotColor(d.slot);
            const big = PK_MULT[d.slot] >= 3 || !PK_MULT[d.slot];
            spray(sl.box.position.x, SLOT_Y + 0.4, col, big ? 40 : 14, 4);
            flash.position.x = sl.box.position.x;
            flash.color.setHex(col);
            flash.intensity = big ? 6 : 2.5;
            drops.splice(i, 1);
            d.onLand(d.slot);
            continue;
          }
          const segStart = d.seg ? d.ends[d.seg - 1] : 0;
          const k = Math.min(1, (el - segStart) / (d.ends[d.seg] - segStart));
          const [x0, y0] = d.pts[d.seg], [x1, y1] = d.pts[d.seg + 1];
          const hop = d.seg === 0 ? 0 : 0.32;
          const x = x0 + (x1 - x0) * k;
          const y = y0 + (y1 - y0) * k * k + hop * Math.sin(Math.PI * k);
          d.model.group.position.set(x, y, 0.1);
          d.model.update(dt, t, Math.sign(x1 - x0) || 1, 0, 4);
        }
        for (const row of pegs) {
          for (const p of row) {
            if (p.flash <= 0) continue;
            p.flash = Math.max(0, p.flash - dt * 4);
            p.mat.emissiveIntensity = 0.5 + p.flash * 2.5;
            p.m.scale.setScalar(1 + p.flash * 0.5);
          }
        }
        for (const s of slots) {
          s.flash = Math.max(0, s.flash - dt * 2.5);
          s.mat.emissiveIntensity = 0.45 + s.flash * 1.6;
          s.box.position.y = s.baseY - Math.sin(s.flash * Math.PI) * 0.12;
        }
        tokens.forEach((tk, i) => {
          tk.spinner.rotation.y += dt * 2;
          tk.group.position.y = SLOT_Y + 0.85 + Math.sin(t * 2 + i) * 0.08;
        });
        flash.intensity = Math.max(0, flash.intensity - dt * 8);
        for (const p of sparks) {
          if (p.life <= 0) continue;
          p.life -= dt;
          if (p.life <= 0) { p.s.visible = false; continue; }
          p.vy -= 7 * dt;
          p.s.position.x += p.vx * dt;
          p.s.position.y += p.vy * dt;
          p.s.material.opacity = p.life / p.max;
        }
      },
    };
  }

  function plinkoEnter() {
    if (!pk.prog) pk.prog = makePlinkoBoard();
    S3.mount($('plinko-canvas'), pk.prog);
    if (pk.bet > P.coins) pk.bet = Math.max(PK_MIN_BET, Math.min(25, P.coins));
    pkMsg('PLACE YOUR BET AND DROP', '');
    renderPlinko();
  }

  function plinkoLeave() {
    if (pk.prog) S3.unmount(pk.prog);
  }

  function pkMsg(text, cls) {
    const el = $('pk-msg');
    el.textContent = text;
    el.className = 'bj-msg pk-msg' + (cls ? ' ' + cls : '');
    void el.offsetWidth;
    el.classList.add('pop');
  }

  function renderPlinko() {
    $('pk-bet').textContent = fmt(pk.bet);
    $('pk-luck').textContent = P.skill('plinkoLuck') + ' / 5';
    $('pk-drop').classList.toggle('poor', P.coins < pk.bet);
    $('pk-history').innerHTML = pk.history.map((h) => `<span class="pk-h ${h.cls}">${h.text}</span>`).join('');
  }

  function plinkoDrop() {
    if (view !== 'plinko' || !pk.prog) return;
    if (pk.prog.inFlight() >= PK_MAX_IN_FLIGHT) return;
    if (pk.bet < PK_MIN_BET) { pkMsg('MINIMUM BET IS ' + PK_MIN_BET + ' COINS', 'lose'); play('error'); return; }
    if (!P.spend(pk.bet)) { pkMsg('NOT ENOUGH COINS', 'lose'); play('error'); return; }
    const bet = pk.bet;
    const slot = plinkoRoll();
    play('launch');
    pk.prog.drop(P.equippedId('ball'), slot, () => plinkoLand(slot, bet));
  }

  function plinkoLand(slot, bet) {
    const m = PK_MULT[slot];
    let entry;
    if (!m) {
      P.addTokens(PK_JACKPOT_TOKENS);
      P.addCoins(bet);
      play('jackpot');
      pkMsg('JACKPOT!  +' + PK_JACKPOT_TOKENS + ' TOKENS', 'win big');
      entry = { cls: 'jp', text: '+' + PK_JACKPOT_TOKENS + ' TKN' };
    } else {
      const win = Math.round(bet * m);
      if (win) P.addCoins(win);
      const net = win - bet;
      if (m >= 3) { play('win'); pkMsg(m + '×  +' + fmt(net), 'win big'); }
      else if (net > 0) { play('coin'); pkMsg(m + '×  +' + fmt(net), 'win'); }
      else { play('chip'); pkMsg(m + '×  ' + fmt(net), 'lose'); }
      entry = { cls: net > 0 ? 'win' : 'lose', text: m + '×' };
    }
    pk.history.unshift(entry);
    if (pk.history.length > 12) pk.history.length = 12;
    renderPlinko();
  }

  document.querySelectorAll('#pk-chips .chip').forEach((b) => {
    b.addEventListener('click', () => {
      const v = b.dataset.chip;
      if (v === 'clear') pk.bet = 0;
      else if (v === 'max') pk.bet = P.coins;
      else pk.bet = Math.min(P.coins, pk.bet + parseInt(v, 10));
      play('chip');
      renderPlinko();
    });
  });
  $('pk-drop').addEventListener('click', plinkoDrop);

  // ========================================================= CRASH PLANE
  const CR_MIN_BET = 10;
  const CR_EDGE = 0.03;        // house edge: P(crash point >= x) = 0.97 / x for every x
  const CR_MAX = 500;
  const CR_GROWTH = 0.13;      // multiplier(t) = e^(0.13 t): 2x after ~5 s, 10x after ~18 s
  const CR_NICE = [0.25, 0.5, 1, 2, 5, 10, 20, 50, 100, 200];
  const cr = {
    prog: null, bet: 25, auto: 0, state: 'idle', start: 0, t: 0, mult: 1, crashAt: 1,
    stake: 0, cashed: 0, history: [], shownMult: '',
  };

  // Outcome first: the crash point is rolled at take-off. 3% of flights blow up at 1.00x.
  function crashRoll() {
    const x = (1 - CR_EDGE) / (1 - Math.random());
    return Math.min(CR_MAX, Math.max(1, Math.floor(x * 100) / 100));
  }
  const crashMultAt = (t) => Math.floor(Math.exp(CR_GROWTH * t) * 100) / 100;

  function crashGridCanvas() {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const g = c.getContext('2d');
    g.fillStyle = '#05041a';
    g.fillRect(0, 0, 512, 512);
    g.strokeStyle = 'rgba(25,230,255,0.05)';
    g.lineWidth = 1;
    for (let i = 32; i < 512; i += 64) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 512); g.stroke();
      g.beginPath(); g.moveTo(0, i); g.lineTo(512, i); g.stroke();
    }
    g.strokeStyle = 'rgba(25,230,255,0.13)';
    g.lineWidth = 2;
    for (let i = 0; i <= 512; i += 64) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 512); g.stroke();
      g.beginPath(); g.moveTo(0, i); g.lineTo(512, i); g.stroke();
    }
    // data-node dots on some crossings
    g.fillStyle = 'rgba(255,60,242,0.35)';
    for (let x = 0; x <= 512; x += 64) {
      for (let y = 0; y <= 512; y += 64) if ((x * 7 + y * 3) % 5 === 0) g.fillRect(x - 2, y - 2, 4, 4);
    }
    return c;
  }

  // low-poly neon jet, nose pointing +X; `body` rolls, `root` climbs
  function makeJet() {
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    const hull = new THREE.MeshStandardMaterial({ color: 0x2b3050, emissive: 0x0a0c24, metalness: 0.85, roughness: 0.3 });
    const neonC = new THREE.MeshBasicMaterial({ color: 0x19e6ff });
    const edge = (geo, color) => new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color }));
    const flat = (pts, depth) => {
      const s = new THREE.Shape();
      pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
      s.closePath();
      const geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false });
      geo.translate(0, 0, -depth / 2);
      return geo;
    };

    const fus = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.9, 6, 14), hull);
    fus.rotation.z = Math.PI / 2;
    fus.scale.set(1, 1, 0.9);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.44, 14), hull);
    nose.rotation.z = -Math.PI / 2;
    nose.position.x = 0.56;
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 10), new THREE.MeshStandardMaterial({
      color: 0x0b3a4a, emissive: 0x19e6ff, emissiveIntensity: 0.7, metalness: 0.2, roughness: 0.1,
    }));
    canopy.scale.set(2.2, 0.9, 0.9);
    canopy.position.set(0.26, 0.1, 0);
    const wingGeo = flat([[0.22, 0], [-0.28, 0.82], [-0.46, 0.82], [-0.34, 0], [-0.46, -0.82], [-0.28, -0.82]], 0.035);
    wingGeo.rotateX(Math.PI / 2);
    const wing = new THREE.Mesh(wingGeo, hull);
    wing.add(edge(wingGeo, 0xff3cf2));
    const stabGeo = flat([[-0.44, 0], [-0.6, 0.3], [-0.7, 0.3], [-0.64, 0], [-0.7, -0.3], [-0.6, -0.3]], 0.025);
    stabGeo.rotateX(Math.PI / 2);
    const stab = new THREE.Mesh(stabGeo, hull);
    stab.add(edge(stabGeo, 0xff3cf2));
    const finGeo = flat([[-0.3, 0.06], [-0.56, 0.46], [-0.68, 0.46], [-0.62, 0.06]], 0.03);
    const fin = new THREE.Mesh(finGeo, hull);
    fin.add(edge(finGeo, 0x19e6ff));
    const stripeGeo = new THREE.BoxGeometry(0.86, 0.025, 0.02);
    const stripeL = new THREE.Mesh(stripeGeo, neonC);
    stripeL.position.set(0, 0, 0.118);
    const stripeR = new THREE.Mesh(stripeGeo, neonC);
    stripeR.position.set(0, 0, -0.118);
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.085, 0.14, 14), hull);
    nozzle.rotation.z = Math.PI / 2;
    nozzle.position.x = -0.62;
    const flameGeo = new THREE.ConeGeometry(0.075, 0.55, 10, 1, true);
    flameGeo.translate(0, 0.275, 0);   // base at the nozzle, tip trailing behind (after the turn below)
    const flame = new THREE.Mesh(flameGeo, new THREE.MeshBasicMaterial({
      color: 0x19e6ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    flame.rotation.z = Math.PI / 2;
    flame.position.x = -0.69;
    const glow = M.glow(0x19e6ff, 1.1, 0.8);
    glow.position.x = -0.8;
    const navGeo = new THREE.SphereGeometry(0.035, 8, 6);
    const navL = new THREE.Mesh(navGeo, new THREE.MeshBasicMaterial({ color: 0xff2a4d }));
    navL.position.set(-0.37, 0, 0.82);
    const navR = new THREE.Mesh(navGeo, new THREE.MeshBasicMaterial({ color: 0x39ff6a }));
    navR.position.set(-0.37, 0, -0.82);
    body.add(fus, nose, canopy, wing, stab, fin, stripeL, stripeR, nozzle, flame, glow, navL, navR);
    return { root, body, flame, glow, nav: [navL, navR] };
  }

  function makeCrashStage() {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 200);
    const W = 12, H = 6.6, OX = 0.9, OY = 0.45, N = 110;
    const CX = W / 2 - 0.35, CY = H / 2 + 0.15;
    const host = $('crash-canvas');

    scene.add(new THREE.AmbientLight(0x6a5aff, 0.7));
    const key = new THREE.PointLight(0xff3cf2, 2.4, 40); key.position.set(-3, 8, 8);
    const fill = new THREE.PointLight(0x19e6ff, 2.4, 40); fill.position.set(12, 2, 8);
    const sun = new THREE.DirectionalLight(0xffffff, 0.9); sun.position.set(2, 6, 10);
    const boom = new THREE.PointLight(0xff6a1f, 0, 14);
    scene.add(key, fill, sun, boom);

    // backdrop: a cyber grid that scrolls past faster the higher the multiplier climbs
    const gridTex = new THREE.CanvasTexture(crashGridCanvas());
    gridTex.wrapS = gridTex.wrapT = THREE.RepeatWrapping;
    gridTex.repeat.set(5, 3);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(34, 20), new THREE.MeshBasicMaterial({ map: gridTex }));
    back.position.set(CX, CY, -1.2);
    scene.add(back);

    const stars = [];
    for (let i = 0; i < 60; i++) {
      const s = M.glow(i % 5 ? 0xffffff : 0xff3cf2, rand(0.08, 0.22), rand(0.3, 0.8));
      s.position.set(rand(-4, W + 4), rand(-1.5, H + 2), -0.8);
      s.userData.depth = rand(0.4, 1.2);
      scene.add(s);
      stars.push(s);
    }

    const axisMat = new THREE.MeshBasicMaterial({ color: 0x8a86b8 });
    const xAxis = new THREE.Mesh(new THREE.PlaneGeometry(W, 0.04), axisMat);
    xAxis.position.set(W / 2, 0, 0);
    const yAxis = new THREE.Mesh(new THREE.PlaneGeometry(0.04, H), axisMat);
    yAxis.position.set(0, H / 2, 0);
    scene.add(xAxis, yAxis);

    // horizontal guides at "nice" multipliers; their labels are DOM spans
    const guideMat = new THREE.MeshBasicMaterial({ color: 0x19e6ff, transparent: true, opacity: 0.18, depthWrite: false });
    const guides = [], labels = [];
    const axisEl = $('crash-axis');
    axisEl.innerHTML = '';
    for (let i = 0; i < 7; i++) {
      const g = new THREE.Mesh(new THREE.PlaneGeometry(W, 0.02), guideMat);
      g.position.set(W / 2, 0, -0.01);
      g.visible = false;
      scene.add(g);
      guides.push(g);
      const span = document.createElement('span');
      axisEl.appendChild(span);
      labels.push(span);
    }

    // the flight path: bright core, soft halo and a fading area fill underneath
    function ribbon(width, opacity) {
      const pos = new Float32Array((N + 1) * 6);
      const col = new Float32Array((N + 1) * 8);
      const idx = [];
      for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
      geo.setIndex(idx);
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        vertexColors: true, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }));
      mesh.frustumCulled = false;
      scene.add(mesh);
      return { mesh, pos, col, width };
    }
    const area = ribbon(0, 1), halo = ribbon(0.42, 0.3), core = ribbon(0.08, 1);
    const RIBBONS = [area, halo, core];
    const cA = new THREE.Color(), cB = new THREE.Color(), cT = new THREE.Color();
    function paint(a, b) {
      cA.setHex(a);
      cB.setHex(b);
      for (let i = 0; i <= N; i++) {
        cT.copy(cA).lerp(cB, i / N);
        for (const r of RIBBONS) {
          for (let s = 0; s < 2; s++) {
            const o = (i * 2 + s) * 4;
            r.col[o] = cT.r; r.col[o + 1] = cT.g; r.col[o + 2] = cT.b;
            r.col[o + 3] = r === area ? (s ? 0 : 0.3 * (i / N)) : 1;
          }
        }
      }
      RIBBONS.forEach((r) => { r.mesh.geometry.attributes.color.needsUpdate = true; });
    }

    // time/multiplier -> board space; the axes rescale so the jet never leaves the screen
    function layout(t, m) {
      const tMax = Math.max(8, t / 0.8), mMax = Math.max(2, 1 + (m - 1) / 0.72);
      return {
        tMax, mMax,
        X: (tt) => OX + (tt / tMax) * (W - OX),
        Y: (mm) => OY + ((mm - 1) / (mMax - 1)) * (H - OY),
      };
    }
    const px = new Float32Array(N + 1), py = new Float32Array(N + 1);
    function updateCurve(t, map) {
      for (let i = 0; i <= N; i++) {
        const tt = (t * i) / N;
        px[i] = map.X(tt);
        py[i] = map.Y(Math.exp(CR_GROWTH * tt));
      }
      for (let i = 0; i <= N; i++) {
        const a = Math.max(0, i - 1), b = Math.min(N, i + 1);
        const tx = px[b] - px[a], ty = py[b] - py[a];
        const l = Math.hypot(tx, ty) || 1;
        const nx = -ty / l, ny = tx / l, o = i * 6;
        for (const r of [halo, core]) {
          const w = r.width / 2;
          r.pos[o] = px[i] + nx * w; r.pos[o + 1] = py[i] + ny * w; r.pos[o + 2] = 0.02;
          r.pos[o + 3] = px[i] - nx * w; r.pos[o + 4] = py[i] - ny * w; r.pos[o + 5] = 0.02;
        }
        area.pos[o] = px[i]; area.pos[o + 1] = py[i]; area.pos[o + 2] = 0;
        area.pos[o + 3] = px[i]; area.pos[o + 4] = 0; area.pos[o + 5] = 0;
      }
      RIBBONS.forEach((r) => { r.mesh.geometry.attributes.position.needsUpdate = true; });
    }

    const jet = makeJet();
    scene.add(jet.root);

    // sprite pools: engine trail puffs and explosion sparks
    const puffs = [];
    for (let i = 0; i < 70; i++) {
      const s = M.glow(0xffffff, 0.3, 0);
      s.visible = false;
      scene.add(s);
      puffs.push({ s, life: 0, max: 1, grow: 1 });
    }
    let puffNext = 0;
    function puff(x, y, color, size, life) {
      const p = puffs[puffNext];
      puffNext = (puffNext + 1) % puffs.length;
      p.s.visible = true;
      p.s.position.set(x, y, 0.25);
      p.s.material.color.setHex(color);
      p.s.scale.set(size, size, 1);
      p.life = p.max = life;
      p.grow = size;
    }
    const sparks = [];
    for (let i = 0; i < 120; i++) {
      const s = M.glow(0xffffff, 0.3, 0);
      s.visible = false;
      scene.add(s);
      sparks.push({ s, vx: 0, vy: 0, life: 0, max: 1 });
    }
    let sparkNext = 0;
    function spray(x, y, color, n, speed) {
      for (let i = 0; i < n; i++) {
        const p = sparks[sparkNext];
        sparkNext = (sparkNext + 1) % sparks.length;
        const a = Math.random() * Math.PI * 2, sp = speed * (0.3 + Math.random() * 0.7);
        p.s.visible = true;
        p.s.position.set(x, y, 0.4);
        p.s.material.color.setHex(color);
        const sc = 0.15 + Math.random() * 0.35;
        p.s.scale.set(sc, sc, 1);
        p.vx = Math.cos(a) * sp;
        p.vy = Math.sin(a) * sp + 1;
        p.life = p.max = 0.4 + Math.random() * 0.6;
      }
    }

    const st = { t: 0, scroll: 0.25, angle: 0.08, fall: null, puffT: 0, shake: 0, cashFx: false, boom: false };
    const tail = new THREE.Vector3();
    const proj = new THREE.Vector3();

    function placeLabels(map) {
      const range = map.mMax - 1;
      const step = CR_NICE.find((s) => s >= range / 4) || 200;
      const w = host.clientWidth, h = host.clientHeight;
      for (let i = 0; i < guides.length; i++) {
        const v = 1 + i * step;
        const on = v <= map.mMax + 1e-6;
        guides[i].visible = on && i > 0;
        labels[i].style.display = on ? '' : 'none';
        if (!on) continue;
        const y = map.Y(v);
        guides[i].position.y = y;
        proj.set(-0.12, y, 0).project(camera);
        labels[i].style.left = ((proj.x + 1) / 2) * w + 'px';
        labels[i].style.top = ((1 - proj.y) / 2) * h + 'px';
        labels[i].textContent = Math.round(v * 100) / 100 + '×';
      }
    }

    paint(0xff3cf2, 0x19e6ff);
    return {
      scene, camera,
      reset() {
        st.fall = null;
        st.boom = st.cashFx = false;
        st.angle = 0.08;
        jet.root.visible = true;
        jet.root.rotation.set(0, 0, 0);
        jet.body.rotation.set(0.5, 0, 0);
        paint(0xff3cf2, 0x19e6ff);
      },
      // both effects are queued and fire once the jet sits at this frame's position
      cashFx() { st.cashFx = true; },
      explode() { st.boom = true; },
      update(dt) {
        crashTick();
        st.t += dt;
        const tn = Math.tan((camera.fov * Math.PI) / 360);
        const dist = Math.max((H + 2.4) / 2 / tn, (W + 2.6) / 2 / (tn * camera.aspect));
        const sh = st.shake * 0.12;
        camera.position.set(CX + rand(-sh, sh), CY + rand(-sh, sh), dist);
        camera.lookAt(CX, CY, 0);
        camera.updateMatrixWorld();
        st.shake = Math.max(0, st.shake - dt * 2.5);

        const idle = cr.state === 'idle';
        const t = idle ? 0 : cr.t, m = idle ? 1 : cr.mult;
        const map = layout(t, m);
        updateCurve(t, map);
        placeLabels(map);

        // jet: rides the tip of the curve, or tumbles down after the crash
        if (!st.fall) {
          const dxdt = (W - OX) / map.tMax;
          const dydt = ((H - OY) / (map.mMax - 1)) * CR_GROWTH * Math.exp(CR_GROWTH * t);
          const ang = idle ? 0.08 : clamp(Math.atan2(dydt, dxdt), 0.05, 1.2);
          st.angle += (ang - st.angle) * Math.min(1, dt * 8);
          jet.root.position.set(map.X(t), map.Y(m) + 0.12 + (idle ? Math.sin(st.t * 2) * 0.05 : 0), 0.3);
          jet.root.rotation.z = st.angle;
          jet.body.rotation.x = 0.5 + Math.sin(st.t * 2.4) * 0.08;
          const { x, y } = jet.root.position;
          if (st.cashFx) {
            st.cashFx = false;
            spray(x, y, 0x8dff2a, 30, 4);
            spray(x, y, 0xffc933, 14, 3);
          }
          if (st.boom) {
            st.boom = false;
            spray(x, y, 0xff6a1f, 50, 6);
            spray(x, y, 0xffc933, 25, 4);
            spray(x, y, 0xffffff, 12, 3);
            boom.position.set(x, y, 2);
            boom.intensity = 9;
            st.shake = 1;
            st.fall = { vx: 1.1, vy: 1.4, t: 0, hit: false };
            paint(0xff2a4d, 0xff6a1f);
          }
        } else {
          const f = st.fall;
          f.t += dt;
          f.vy -= 9 * dt;
          jet.root.position.x += f.vx * dt;
          jet.root.position.y += f.vy * dt;
          jet.root.rotation.z += (-1.4 - jet.root.rotation.z) * Math.min(1, dt * 3);
          jet.body.rotation.x += dt * 7;
          if (jet.root.visible && Math.random() < dt * 40) {
            puff(jet.root.position.x, jet.root.position.y, Math.random() < 0.5 ? 0xff6a1f : 0xff2a4d, 0.5, 0.6);
          }
          if (!f.hit && jet.root.position.y < 0.05) {
            f.hit = true;
            jet.root.visible = false;
            spray(jet.root.position.x, 0.1, 0xff6a1f, 40, 5);
            boom.position.set(jet.root.position.x, 0.5, 2);
            boom.intensity = 6;
            st.shake = 0.7;
            play('bossHit');
          }
        }
        const flying = cr.state === 'flying';
        jet.flame.scale.set(1, (flying ? 1 : 0.45) * (0.75 + Math.random() * 0.5), 1);
        jet.flame.visible = !st.fall;
        jet.glow.material.opacity = st.fall ? 0 : flying ? 0.85 : 0.45;
        const blink = st.t % 1 < 0.14;
        jet.nav.forEach((n) => { n.visible = blink; });

        // engine trail
        if (flying) {
          st.puffT -= dt;
          if (st.puffT <= 0) {
            st.puffT = 0.025;
            tail.set(-0.8, 0, 0);
            jet.root.localToWorld(tail);
            puff(tail.x, tail.y, Math.random() < 0.7 ? 0x19e6ff : 0xff3cf2, 0.35, 0.5);
          }
        }

        // parallax: grid and stars stream past with the climb speed
        const want = flying ? 1.5 + Math.min(9, Math.log(m) * 4) : cr.state === 'crashed' ? 0 : 0.25;
        st.scroll += (want - st.scroll) * Math.min(1, dt * 2);
        gridTex.offset.x += (st.scroll * dt) / 6.8;
        for (const s of stars) {
          s.position.x -= st.scroll * s.userData.depth * dt;
          if (s.position.x < -4) s.position.x += W + 8;
        }
        for (const p of puffs) {
          if (p.life <= 0) continue;
          p.life -= dt;
          if (p.life <= 0) { p.s.visible = false; continue; }
          const k = p.life / p.max;
          p.s.position.x -= st.scroll * dt;
          const sc = p.grow * (1 + (1 - k) * 1.5);
          p.s.scale.set(sc, sc, 1);
          p.s.material.opacity = k * 0.6;
        }
        for (const p of sparks) {
          if (p.life <= 0) continue;
          p.life -= dt;
          if (p.life <= 0) { p.s.visible = false; continue; }
          p.vy -= 7 * dt;
          p.s.position.x += p.vx * dt;
          p.s.position.y += p.vy * dt;
          p.s.material.opacity = p.life / p.max;
        }
        boom.intensity = Math.max(0, boom.intensity - dt * 10);
      },
    };
  }

  // game logic runs on the wall clock (called from the stage's frame loop)
  function crashTick() {
    if (cr.state !== 'flying') return;
    cr.t = (performance.now() - cr.start) / 1000;
    const m = crashMultAt(cr.t);
    if (!cr.cashed && cr.auto && cr.auto <= cr.crashAt && m >= cr.auto) crashCashOut(cr.auto);
    if (m >= cr.crashAt) {
      cr.mult = cr.crashAt;
      cr.t = Math.log(cr.crashAt) / CR_GROWTH;   // freeze the curve right at the crash point
      crashBoom();
      return;
    }
    cr.mult = m;
    renderCrashLive();
  }

  function crMsg(text, cls) {
    const el = $('cr-msg');
    el.textContent = text;
    el.className = 'bj-msg pk-msg' + (cls ? ' ' + cls : '');
    void el.offsetWidth;
    el.classList.add('pop');
  }

  function renderCrashLive() {
    const txt = cr.mult.toFixed(2) + '×';
    const state = cr.state === 'flying' && cr.cashed ? 'cashed' : cr.state;
    const el = $('crash-mult');
    if (txt + state !== cr.shownMult) {
      cr.shownMult = txt + state;
      el.textContent = txt;
      el.className = 'crash-mult ' + state;
      $('crash-status').textContent =
        state === 'crashed' ? 'CRASHED' : state === 'cashed' ? 'CASHED OUT @ ' + cr.cashed.toFixed(2) + '×'
          : state === 'flying' ? 'CLIMBING…' : 'READY FOR TAKE-OFF';
      if (state === 'flying') $('cr-go').textContent = 'CASH OUT  +' + fmt(Math.floor(cr.stake * cr.mult));
    }
  }

  function renderCrash() {
    $('cr-bet').textContent = fmt(cr.bet);
    document.querySelectorAll('#cr-autos button').forEach((b) => b.classList.toggle('on', parseFloat(b.dataset.auto) === cr.auto));
    const go = $('cr-go');
    const flying = cr.state === 'flying';
    go.classList.toggle('cash', flying && !cr.cashed);
    go.classList.toggle('poor', !flying && P.coins < cr.bet);
    go.disabled = flying && !!cr.cashed;
    if (!flying) go.innerHTML = '&#9650; TAKE OFF';
    else if (cr.cashed) go.textContent = 'CASHED OUT ✓';
    else go.textContent = 'CASH OUT  +' + fmt(Math.floor(cr.stake * cr.mult));
    $('cr-history').innerHTML = cr.history
      .map((x) => `<span class="pk-h ${x >= 10 ? 'jp' : x >= 2 ? 'win' : 'lose'}">${x.toFixed(2)}×</span>`).join('');
    cr.shownMult = '';
    renderCrashLive();
  }

  function crashTakeoff() {
    if (view !== 'crash' || !cr.prog || cr.state === 'flying') return;
    if (cr.bet < CR_MIN_BET) { crMsg('MINIMUM BET IS ' + CR_MIN_BET + ' COINS', 'lose'); play('error'); return; }
    if (!P.spend(cr.bet)) { crMsg('NOT ENOUGH COINS', 'lose'); play('error'); return; }
    cr.stake = cr.bet;
    cr.crashAt = crashRoll();
    cr.cashed = 0;
    cr.mult = 1;
    cr.t = 0;
    cr.start = performance.now();
    cr.state = 'flying';
    cr.prog.reset();
    play('launch');
    crMsg('AIRBORNE — CASH OUT BEFORE IT CRASHES', '');
    renderCrash();
  }

  function crashCashOut(at) {
    if (cr.state !== 'flying' || cr.cashed) return;
    const now = crashMultAt((performance.now() - cr.start) / 1000);
    const m = at || now;
    if (m > cr.crashAt) return;   // too late — the next frame blows it up
    cr.cashed = m;
    const win = Math.floor(cr.stake * m);
    P.addCoins(win);
    play(m >= 5 ? 'jackpot' : 'win');
    crMsg('CASHED OUT @ ' + m.toFixed(2) + '×   +' + fmt(win - cr.stake), m >= 5 ? 'win big' : 'win');
    cr.prog.cashFx();
    renderCrash();
  }

  function crashBoom() {
    cr.state = 'crashed';
    cr.prog.explode();
    play('explode');
    if (!cr.cashed) {
      play('bust');
      crMsg('CRASHED @ ' + cr.crashAt.toFixed(2) + '×   -' + fmt(cr.stake), 'lose');
    }
    cr.history.unshift(cr.crashAt);
    if (cr.history.length > 14) cr.history.length = 14;
    renderCrash();
  }

  function crashAction() {
    if (cr.state === 'flying') crashCashOut();
    else crashTakeoff();
  }

  function crashEnter() {
    if (!cr.prog) cr.prog = makeCrashStage();
    S3.mount($('crash-canvas'), cr.prog);
    if (cr.bet > P.coins) cr.bet = Math.max(CR_MIN_BET, Math.min(25, P.coins));
    if (cr.state !== 'flying') crMsg('PLACE YOUR BET AND TAKE OFF', '');
    renderCrash();
  }

  function crashLeave() {
    if (cr.prog) S3.unmount(cr.prog);
    // leaving is only allowed once you've cashed out: land the rest of the flight off-screen
    if (cr.state === 'flying') {
      cr.history.unshift(cr.crashAt);
      if (cr.history.length > 14) cr.history.length = 14;
    }
    if (cr.state !== 'idle') {
      cr.state = 'idle';
      cr.mult = 1;
      cr.t = 0;
      if (cr.prog) cr.prog.reset();
    }
  }

  document.querySelectorAll('#cr-chips .chip').forEach((b) => {
    b.addEventListener('click', () => {
      if (cr.state === 'flying') return;
      const v = b.dataset.chip;
      if (v === 'clear') cr.bet = 0;
      else cr.bet = Math.min(P.coins, cr.bet + parseInt(v, 10));
      play('chip');
      renderCrash();
    });
  });
  document.querySelectorAll('#cr-autos button').forEach((b) => {
    b.addEventListener('click', () => {
      cr.auto = parseFloat(b.dataset.auto) || 0;
      play('click');
      renderCrash();
    });
  });
  $('cr-go').addEventListener('click', crashAction);

  window.addEventListener('keydown', (e) => {
    const stageOpen = !$('box-stage').classList.contains('hidden');
    if (stageOpen) {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!stage.done) tapStage(); }
      else if (e.key === 'Escape' && !stage.done) { while (!stage.done) { stage.lockUntil = 0; tapStage(); } }
      return;
    }
    if ($('screen-lottery').classList.contains('hidden')) return;
    if (view === 'plinko' && (e.key === ' ' || e.key === 'Enter') && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault();
      plinkoDrop();
    }
    if (view === 'crash' && (e.key === ' ' || e.key === 'Enter') && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault();
      crashAction();
    }
    if (e.key === 'Escape') back();
  });

  P.onChange(() => {
    if (!$('lot-boxes').classList.contains('hidden')) {
      document.querySelectorAll('#box-offers .offer').forEach((card, i) => {
        card.querySelector('.buy').classList.toggle('poor', P.coins < boxPrice(BOXES[i]));
      });
    }
    if (view === 'plinko' && !$('screen-lottery').classList.contains('hidden')) renderPlinko();
    if (view === 'crash' && !$('screen-lottery').classList.contains('hidden')) renderCrash();
  });

  NEON.lottery = { open, close, openFreeBox };
})();
