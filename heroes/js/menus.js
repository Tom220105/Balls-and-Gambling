/* ==========================================================================
   SLING HEROES — the menus
   Heroes (list, details with the 3D model, level, stars, gear, breakthrough),
   team select, Mastery, Missions, Inventory, Shop, Daily Gift, Mail,
   Settings, Profile and the Wishing Altar (summon).
   SH.menus.open(name) opens one of them from the HUD or a town building.
   ========================================================================== */
(function () {
  'use strict';

  const SH = window.SH;
  const D = SH.data, U = SH.util, GAME = SH.game, UI = SH.ui;
  const el = U.el;
  const S = () => SH.S();
  const M = (SH.menus = {});

  const sortHeroes = (ids) => ids.sort((a, b) => GAME.power(b) - GAME.power(a));
  const ok = (got, title) => { if (got) UI.rewards(got, title); };
  const locked = (feature, name) => {
    if (GAME.unlocked(feature)) return false;
    UI.toast(`${name} opens at Team Lv ${D.UNLOCK[feature]}`, true);
    return true;
  };

  M.open = (name, arg) => {
    switch (name) {
      case 'heroes': return heroes();
      case 'mastery': return locked('mastery', 'Mastery') || mastery();
      case 'missions': return missions();
      case 'inventory': return inventory(arg);
      case 'shop': return shop(arg);
      case 'login': return login();
      case 'mail': return mail();
      case 'settings': return settings();
      case 'profile': return profile();
      case 'summon': return summon();
      case 'expedition': return locked('expedition', 'Expeditions') || SH.modes.expedition();
      case 'arena': return locked('arena', 'The Arena') || SH.modes.arena();
      case 'tower': return locked('tower', 'The Demon Tower') || SH.modes.tower();
      case 'guild': return locked('guild', 'The Guild') || SH.modes.guild();
      case 'campaign': return SH.modes.campaign();
      default: return null;
    }
  };
  M.plus = (res) => {
    if (res === 'stamina') {
      UI.confirm('Stamina', `Spend <b>50</b> gems for <b>120</b> stamina?<br><span class="muted">You have ${S().items.stamina || 0} Stamina Tonics in the inventory too.</span>`, () => {
        if (GAME.buyStamina()) { UI.toast('+120 stamina'); SH.audio.sfx.coin(); } else UI.toast('Not enough gems', true);
      }, { yes: 'Buy' });
    } else shop(res === 'gems' ? 'gems' : 'market');
  };

  // ================================================================ HEROES
  function heroes() {
    const p = UI.panel({
      title: 'Heroes', tabs: [{ id: 'all', label: 'All' }, ...D.EL_ORDER.map((e) => ({ id: e, label: D.ELEMENTS[e].name }))],
      render(body, tab) {
        const all = D.HEROES.filter((h) => tab === 'all' || h.el === tab).map((h) => h.id);
        const own = sortHeroes(all.filter((id) => GAME.owned(id)));
        const rest = all.filter((id) => !GAME.owned(id)).sort((a, b) => (S().shards[b] || 0) / GAME.unlockCost(b) - (S().shards[a] || 0) / GAME.unlockCost(a));
        body.appendChild(el('div', 'sec-title', `Your heroes ${own.length}/${D.HEROES.filter((h) => tab === 'all' || h.el === tab).length}`));
        const grid = el('div', 'grid2');
        own.forEach((id) => grid.appendChild(heroCard(id, () => heroDetail(id, own))));
        body.appendChild(grid);
        if (rest.length) {
          body.appendChild(el('div', 'sec-title', 'Not recruited'));
          const g2 = el('div', 'grid2');
          rest.forEach((id) => g2.appendChild(heroCard(id, () => heroDetail(id, rest))));
          body.appendChild(g2);
        }
      },
    });
    return p;
  }
  function heroCard(id, onClick) {
    const h = D.HERO[id], o = S().heroes[id];
    const c = el('button', 'hcard' + (o ? '' : ' locked'));
    c.appendChild(UI.pf(id));
    const info = el('div', 'hc-info');
    info.appendChild(el('div', 'hc-name', h.name));
    if (o) {
      info.appendChild(el('div', 'hc-sub', `${UI.elDot(h.el)} ${h.role} · <b>${U.fmt(GAME.power(id))}</b>`));
      const g = el('div', 'hc-gear');
      D.GEAR_SLOTS.forEach((s) => {
        const i = el('i', o.gear[s] !== undefined && o.gear[s] !== null ? 'on' : '');
        if (o.gear[s] !== undefined && o.gear[s] !== null) i.style.backgroundImage = `url(${SH.icon(`gear_${s}_${o.gear[s]}`, 64)})`;
        g.appendChild(i);
      });
      info.appendChild(g);
      if (o.stars < D.MAX_STARS && (S().shards[id] || 0) >= D.starCost(o.stars)) c.appendChild(el('b', 'dot')), c.classList.add('has-dot');
    } else {
      const have = S().shards[id] || 0, need = GAME.unlockCost(id);
      info.appendChild(el('div', 'hc-sub', `${UI.elDot(h.el)} ${h.role}`));
      const bar = el('div', 'shardbar' + (have >= need ? ' full' : ''), `<i style="width:${Math.min(100, have / need * 100)}%"></i><em>${have}/${need}</em>`);
      info.appendChild(bar);
      if (have >= need) { c.appendChild(el('b', 'dot')); c.classList.add('has-dot'); }
    }
    c.appendChild(info);
    c.addEventListener('click', () => { SH.audio.sfx.click(); onClick(); });
    return c;
  }

  // hero details: 3D model in the showroom + a panel below
  function heroDetail(id, list) {
    let cur = id;
    const prevView = SH.viewName;
    SH.setView('showroom');
    SH.showroom.hero(cur, { burst: true });
    const tabs = [{ id: 'info', label: 'Info' }, { id: 'level', label: 'Level' }, { id: 'stars', label: 'Stars' }, { id: 'gear', label: 'Gear' }];
    const head = el('div', 'hd-head');
    head.style.cssText = 'position:absolute;left:0;right:0;top:0;bottom:56%;z-index:6;pointer-events:none';
    document.getElementById('panels').appendChild(head);
    let p = null;
    p = UI.panel({
      cls: 'hd-panel', tabs, keep3D: true,
      onClose() { head.remove(); SH.setView(prevView === 'showroom' ? 'town' : prevView); UI.rerender(); },
      render(body, tab) {
        const h = D.HERO[cur], o = S().heroes[cur];
        drawHead();
        if (!o) { recruitView(body, cur); return; }
        if (tab === 'info') infoView(body, cur);
        else if (tab === 'level') levelView(body, cur, p);
        else if (tab === 'stars') starsView(body, cur, p);
        else gearView(body, cur, p);
        if (!o && h) { /* never */ }
      },
    });
    function drawHead() {
      const h = D.HERO[cur], o = S().heroes[cur];
      head.innerHTML = `
        <div class="hd-name rar-${h.rarity}" style="top:5.6em"><div class="n1">${h.name}</div><div class="n2">${h.title}</div>
          <div class="n3"><span class="rar-tag">${h.rarity}</span>${o ? UI.stars(o.stars, D.MAX_STARS) : ''}</div>
          <div class="n2" style="margin-top:.2em">${UI.heroLine(cur)}</div></div>
        ${o ? `<div class="hd-power" style="top:5.8em"><b>${U.fmt(GAME.power(cur))}</b><span>POWER</span><br><span>Lv ${o.lvl}/${GAME.levelCap(cur)}</span></div>` : ''}
        <div class="hd-arrows"><button data-d="-1">&#9664;</button><button data-d="1">&#9654;</button></div>`;
      head.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => {
        const i = list.indexOf(cur);
        cur = list[(i + Number(b.dataset.d) + list.length) % list.length];
        SH.audio.sfx.tab();
        SH.showroom.hero(cur, { burst: true });
        p.render();
      }));
    }
    return p;
  }
  function infoView(body, id) {
    const h = D.HERO[id], st = GAME.stats(id);
    body.appendChild(el('div', 'stat-grid', `
      <div class="stat"><b style="color:#8aff5a">${U.fmt(st.hp)}</b><span>HP</span></div>
      <div class="stat"><b style="color:#ff8a5a">${U.fmt(st.atk)}</b><span>ATK</span></div>
      <div class="stat"><b style="color:#7ad8ff">${st.spd}</b><span>Speed</span></div>`));
    body.appendChild(el('div', 'sec-title', 'Skills'));
    const hy = D.HYPERS[h.hyper], co = D.COMBOS[h.combo], pa = D.PASSIVES[h.passive];
    body.appendChild(el('div', 'skill', `<div class="sk-ico sk-hyper">HYPER</div><div><div class="sk-name">${hy.name}<small>charges in ${h.charge} turns</small></div><div class="sk-desc">${hy.desc}</div></div>`));
    body.appendChild(el('div', 'skill', `<div class="sk-ico sk-combo">COMBO</div><div><div class="sk-name">${co.name}<small>power ${Math.round(h.comboPow * 100)}%</small></div><div class="sk-desc">${co.desc} Fires when another hero bumps into ${h.name}.</div></div>`));
    body.appendChild(el('div', 'skill', `<div class="sk-ico sk-passive">PASSIVE</div><div><div class="sk-name">${pa.name}</div><div class="sk-desc">${pa.desc(h.pv, h.el)}</div></div>`));
    body.appendChild(el('div', 'muted', h.type === 'bounce' ? 'BOUNCE: bounces off enemies and walls. Great for many hits in tight spots.' : 'PIERCE: flies straight through enemies. Great for long lines and big bosses.'));
  }
  function levelView(body, id, p) {
    const o = S().heroes[id], cap = GAME.levelCap(id);
    const need = D.expNeed(o.lvl);
    body.appendChild(el('div', 'sec-title', `Level ${o.lvl} / ${cap}`));
    body.appendChild(el('div', 'bar blue', `<i style="width:${o.exp / need * 100}%"></i><em>${o.exp} / ${need} EXP</em>`));
    const inv = el('div', 'flex', '');
    inv.style.margin = '.7em 0';
    ['exp1', 'exp2', 'exp3'].forEach((k) => { const s = UI.islot(k, S().items[k] || 0); s.style.width = '3.4em'; inv.appendChild(s); });
    inv.appendChild(el('div', 'muted flex1', `Potions: ${U.fmt(GAME.potionExp())} EXP<br>Gold per level: ${U.fmt(D.goldNeed(o.lvl))}`));
    body.appendChild(inv);
    if (o.lvl >= cap) { body.appendChild(el('div', 'center muted', 'Max level for these stars. Raise the stars to level further!')); return; }
    const row = el('div', 'flex');
    row.style.justifyContent = 'center';
    const b1 = el('button', 'btn green', 'Level +1');
    const b5 = el('button', 'btn', 'Level +5');
    b1.addEventListener('click', () => doLv(1));
    b5.addEventListener('click', () => doLv(5));
    row.append(b1, b5);
    body.appendChild(row);
    body.appendChild(el('div', 'muted center', 'EXP potions drop in the campaign and can be bought in the shop.'));
    function doLv(n) {
      const done = GAME.levelUp(id, n);
      if (!done) { UI.toast(GAME.potionExp() < D.expNeed(o.lvl) - o.exp ? 'Not enough EXP potions' : 'Not enough gold', true); return; }
      SH.audio.sfx.level();
      SH.showroom.pose();
      UI.toast(`Level up! Lv ${S().heroes[id].lvl}`);
      p.render();
    }
  }
  function starsView(body, id, p) {
    const o = S().heroes[id];
    const have = S().shards[id] || 0, need = D.starCost(o.stars);
    body.appendChild(el('div', 'center', `<div style="font-size:2em">${UI.stars(o.stars, D.MAX_STARS)}</div>`));
    if (o.stars >= D.MAX_STARS) { body.appendChild(el('div', 'center muted', 'Max stars reached!')); return; }
    body.appendChild(el('div', 'sec-title', 'Shards'));
    body.appendChild(el('div', 'shardbar' + (have >= need ? ' full' : ''), `<i style="width:${Math.min(100, have / need * 100)}%"></i><em>${have}/${need}</em>`));
    const st = GAME.stats(id);
    const nxt = D.heroStats(id, Object.assign({}, o, { stars: o.stars + 1 }), S().mastery);
    body.appendChild(el('div', 'stat-grid', `
      <div class="stat"><b>${U.fmt(st.hp)} &#8594; <span style="color:#8aff5a">${U.fmt(nxt.hp)}</span></b><span>HP</span></div>
      <div class="stat"><b>${U.fmt(st.atk)} &#8594; <span style="color:#ff8a5a">${U.fmt(nxt.atk)}</span></b><span>ATK</span></div>
      <div class="stat"><b>${D.levelCap(o.stars)} &#8594; <span style="color:#7ad8ff">${D.levelCap(o.stars + 1)}</span></b><span>Max Lv</span></div>`)).style.marginTop = '.6em';
    const b = el('button', 'btn gold big', 'Star Up');
    b.style.margin = '.8em auto 0'; b.style.display = 'flex';
    if (have < need) b.classList.add('off');
    b.addEventListener('click', () => {
      if (!GAME.starUp(id)) { UI.toast('Not enough shards. Summon this hero again or find shards!', true); return; }
      SH.audio.sfx.star();
      SH.showroom.hero(id, { burst: true });
      UI.toast('★ Star up! ★');
      p.render();
    });
    body.appendChild(b);
  }
  function gearView(body, id, p) {
    const o = S().heroes[id];
    const rank = D.RANKS[o.rank];
    body.appendChild(el('div', 'center', `<span class="font-d" style="font-size:1.1em;color:${rank.color}">Rank: ${rank.name}</span>`));
    const g = el('div', 'gear4');
    g.style.margin = '.6em 0 1.6em';
    D.GEAR_SLOTS.forEach((s) => {
      const tier = Math.min(5, o.rank), has = o.gear[s] !== undefined && o.gear[s] !== null;
      const item = `g_${s}_${tier}`;
      const can = !has && (S().items[item] || 0) > 0;
      const slot = el('button', 'gslot' + (has ? '' : ' empty') + (can ? ' can' : ''), `<img src="${SH.icon(`gear_${s}_${tier}`, 96)}"><span>${has ? D.ITEMS[item].name : can ? 'Tap to equip' : `Need ${D.GEAR_TIER[tier].name}`}</span>`);
      slot.addEventListener('click', () => {
        if (has) return;
        if (!can) { UI.toast(`You need a ${D.ITEMS[item].name}. Gear drops in the campaign and is sold in the shop.`, true); return; }
        GAME.equip(id, s); SH.audio.sfx.shield(); p.render();
      });
      g.appendChild(slot);
    });
    body.appendChild(g);
    if (o.rank >= D.RANKS.length - 1) { body.appendChild(el('div', 'center muted', 'Highest rank reached!')); return; }
    const b = el('button', 'btn blue big', `Breakthrough ${UI.costHtml({ gold: GAME.breakCost(id) })}`);
    b.style.margin = '0 auto'; b.style.display = 'flex';
    if (!GAME.canBreak(id)) b.classList.add('off');
    b.addEventListener('click', () => {
      if (!GAME.breakthrough(id)) { UI.toast('Equip all 4 pieces of gear first (and have enough gold).', true); return; }
      SH.audio.sfx.level();
      SH.showroom.hero(id, { burst: true });
      UI.toast(`Breakthrough! Rank ${D.RANKS[S().heroes[id].rank].name}`);
      p.render();
    });
    body.appendChild(b);
    body.appendChild(el('div', 'muted center', 'Breakthrough: +12% HP and ATK and the next gear tier.')).style.marginTop = '.5em';
  }
  function recruitView(body, id) {
    const h = D.HERO[id];
    const have = S().shards[id] || 0, need = GAME.unlockCost(id);
    infoView(body, id);
    body.appendChild(el('div', 'sec-title', 'Recruit'));
    body.appendChild(el('div', 'shardbar' + (have >= need ? ' full' : ''), `<i style="width:${Math.min(100, have / need * 100)}%"></i><em>${have}/${need} shards</em>`));
    const b = el('button', 'btn gold big', 'Recruit');
    b.style.margin = '.7em auto 0'; b.style.display = 'flex';
    if (have < need) b.classList.add('off');
    b.addEventListener('click', () => {
      if (!GAME.unlockWithShards(id)) { UI.toast(`Collect ${need} shards of ${h.name} first. Summon at the Wishing Altar!`, true); return; }
      SH.audio.sfx.reveal(2);
      SH.showroom.hero(id, { burst: true });
      UI.toast(`${h.name} joined your team!`);
      UI.rerender();
    });
    body.appendChild(b);
  }
  M.heroDetail = heroDetail;

  // ================================================================ TEAM SELECT
  // opts: title, cost (stamina), button, onStart(team), enemies (ids for a preview), exclude (busy heroes), max
  M.teamSelect = (opts) => {
    const prevView = SH.viewName;
    const team = (opts.team || S().team).slice(0, 4);
    while (team.length < 4) team.push(null);
    const ex = opts.exclude || [];
    for (let i = 0; i < 4; i++) if (team[i] && (!GAME.owned(team[i]) || ex.includes(team[i]))) team[i] = null;
    SH.setView('showroom');
    SH.showroom.team(team);
    const p = UI.panel({
      cls: 'hd-panel', keep3D: true, title: opts.title || 'Team',
      onClose() { SH.setView(prevView === 'showroom' ? 'town' : prevView); },
      render(body) {
        const slots = el('div', 'team-slots');
        team.forEach((id, i) => {
          const s = el('button', 'tslot');
          s.appendChild(el('span', 'ts-k', String(i + 1)));
          if (id) { s.appendChild(UI.pf(id)); s.appendChild(el('div', 'ts-n', D.HERO[id].name)); }
          else { s.appendChild(el('div', 'pf empty')); s.appendChild(el('div', 'ts-n muted', 'Empty')); }
          s.addEventListener('click', () => { if (team[i]) { team[i] = null; SH.audio.sfx.back(); upd(); } });
          slots.appendChild(s);
        });
        body.appendChild(slots);
        const real = team.filter(Boolean);
        body.appendChild(el('div', 'team-info', `<span>Team HP <b>${U.fmt(GAME.teamHP(real))}</b></span><span>Power <b>${U.fmt(GAME.teamPower(real))}</b></span>${opts.cost ? `<span>Stamina <b>${opts.cost}</b></span>` : ''}`));
        body.appendChild(el('div', 'muted', 'Tap a hero to add or remove. Slot 1 is slung first.')).style.margin = '.3em 0';
        const grid = el('div', 'pick-grid');
        sortHeroes(GAME.ownedList()).forEach((id) => {
          const busy = ex.includes(id);
          const f = UI.pf(id, { cls: (team.includes(id) ? 'picked' : '') + (busy ? ' busy' : '') });
          f.addEventListener('click', () => {
            if (busy) { UI.toast('This hero is away on an expedition', true); return; }
            const at = team.indexOf(id);
            if (at >= 0) team[at] = null;
            else { const free = team.indexOf(null); if (free < 0) { UI.toast('The team is full. Tap a slot to remove a hero.', true); return; } team[free] = id; }
            SH.audio.sfx.tab();
            upd();
          });
          grid.appendChild(f);
        });
        body.appendChild(grid);
      },
    });
    const foot = el('div', 'p-foot');
    const go = el('button', 'btn green big flex1', opts.button || 'Start');
    go.addEventListener('click', () => {
      const real = team.filter(Boolean);
      if (!real.length) { UI.toast('Pick at least one hero', true); return; }
      // compact: no gaps
      const t = real.concat([null, null, null, null]).slice(0, 4);
      if (!opts.keepTeam) { S().team = t.slice(); SH.save(); }
      SH.audio.sfx.click();
      p.close(true);
      opts.onStart(real);
    });
    foot.appendChild(go);
    p.el.appendChild(foot);
    function upd() { SH.showroom.team(team); p.render(); }
    return p;
  };

  // ================================================================ MASTERY
  function mastery() {
    return UI.panel({
      title: 'Mastery',
      render(body) {
        body.appendChild(el('div', 'muted center', `Every level gives +2% HP and ATK to all heroes of that element. Max level: ${Math.min(40, GAME.masteryMax())} (grows with your team level).`)).style.marginBottom = '.6em';
        D.EL_ORDER.forEach((e) => {
          const lv = S().mastery[e];
          const r = el('div', 'ms-row');
          r.style.setProperty('--elc', D.ELEMENTS[e].color);
          r.innerHTML = `<div class="ms-orb">${lv}</div><div class="flex1"><div class="font-d">${D.ELEMENTS[e].name} Mastery</div><div class="muted">+${lv * 2}% HP & ATK for ${D.ELEMENTS[e].name} heroes</div></div>`;
          const b = el('button', 'btn small ' + (lv >= Math.min(40, GAME.masteryMax()) ? 'off' : 'green'), lv >= Math.min(40, GAME.masteryMax()) ? 'Max' : UI.costHtml({ gold: GAME.masteryCost(e) }));
          b.addEventListener('click', () => {
            if (GAME.masteryUp(e)) { SH.audio.sfx.level(); UI.rerender(); } else UI.toast(lv >= GAME.masteryMax() ? 'Raise your team level first' : 'Not enough gold', true);
          });
          r.appendChild(b);
          body.appendChild(r);
        });
      },
    });
  }

  // ================================================================ MISSIONS
  function missions() {
    return UI.panel({
      title: 'Missions', tabs: [{ id: 'daily', label: 'Daily' }, { id: 'progress', label: 'Progress' }],
      render(body, tab) {
        if (tab === 'daily') {
          const st = S().daily;
          const top = el('div', 'row dark');
          const max = D.DAILY_CHESTS[D.DAILY_CHESTS.length - 1].pts;
          top.innerHTML = `<div class="r-main"><div class="r-title">Activity: ${st.pts}</div><div class="bar" style="margin:.4em 0"><i style="width:${Math.min(100, st.pts / max * 100)}%"></i></div></div>`;
          const chests = el('div', 'flex');
          D.DAILY_CHESTS.forEach((c, i) => {
            const got = st.chests[i], can = !got && st.pts >= c.pts;
            const b = el('button', 'flex', `<img src="${SH.icon(i === 3 ? 'chest_purple' : i === 2 ? 'chest_blue' : 'chest', 96)}" style="width:2.6em;${got ? 'filter:grayscale(1) brightness(.6)' : can ? 'animation:pulse 1s infinite' : ''}">`);
            b.style.flexDirection = 'column';
            b.appendChild(el('span', 'muted', String(c.pts)));
            b.addEventListener('click', () => { const g = GAME.claimChest(i); if (g) ok(g); else UI.toast(got ? 'Already claimed' : `Reach ${c.pts} activity`, !got); UI.rerender(); });
            chests.appendChild(b);
          });
          top.querySelector('.r-main').appendChild(chests);
          body.appendChild(top);
          D.DAILY.forEach((m) => {
            const pr = st.prog[m.id] || 0, done = st.claimed[m.id], can = !done && pr >= m.goal;
            const r = el('div', 'row' + (done ? ' done' : ''));
            r.innerHTML = `<div class="r-ico"><img src="${SH.icon(m.id === 'summon' ? 'wish' : m.id === 'arena' ? 'swords' : m.id === 'win' ? 'nav_heroes' : 'nav_missions', 96)}"></div>
              <div class="r-main"><div class="r-title">${m.name}</div><div class="r-desc">${m.desc}</div><div class="r-rew">${UI.rewardChips(m.reward)}<span>+${m.pts} activity</span></div></div>`;
            const side = el('div', 'r-side', `<div class="r-count">${Math.min(pr, m.goal)}/${m.goal}</div>`);
            const b = el('button', 'btn small ' + (done ? 'gray' : can ? 'gold' : ''), done ? 'Done' : can ? 'Claim' : 'Go');
            b.addEventListener('click', () => {
              if (can) { ok(GAME.claimDaily(m.id)); UI.rerender(); return; }
              if (!done) goFor(m.id);
            });
            side.appendChild(b);
            r.appendChild(side);
            body.appendChild(r);
          });
        } else {
          D.PROGRESS.forEach((pm) => {
            const tier = S().prog.claimed[pm.id] || 0;
            const fin = tier >= pm.goals.length;
            const goal = pm.goals[Math.min(tier, pm.goals.length - 1)];
            const val = GAME.progValue(pm.id), can = !fin && val >= goal;
            const r = el('div', 'row' + (fin ? ' done' : ''));
            r.innerHTML = `<div class="r-ico"><img src="${SH.icon('star', 96)}"></div>
              <div class="r-main"><div class="r-title">${pm.name} ${'I'.repeat(Math.min(3, tier + 1))}${tier >= 3 ? '+' : ''}</div><div class="r-desc">${pm.desc(goal)}</div><div class="r-rew">${UI.rewardChips(pm.reward(Math.min(tier, pm.goals.length - 1)))}</div></div>`;
            const side = el('div', 'r-side', `<div class="r-count">${Math.min(val, goal)}/${goal}</div>`);
            const b = el('button', 'btn small ' + (fin ? 'gray' : can ? 'gold' : 'off'), fin ? 'Done' : 'Claim');
            b.addEventListener('click', () => { if (can) { ok(GAME.claimProgress(pm.id)); UI.rerender(); } });
            side.appendChild(b);
            r.appendChild(side);
            body.appendChild(r);
          });
        }
      },
    });
  }
  function goFor(id) {
    UI.closeAll();
    const map = { win: 'campaign', stamina: 'campaign', combo: 'campaign', hyper: 'campaign', summon: 'summon', levelup: 'heroes', tower: 'tower', arena: 'arena', expedition: 'expedition' };
    if (map[id]) M.open(map[id]);
  }

  // ================================================================ INVENTORY
  function inventory(tabArg) {
    let sel = null;
    return UI.panel({
      title: 'Inventory', tabs: [{ id: 'supplies', label: 'Supplies' }, { id: 'gear', label: 'Gear' }, { id: 'shards', label: 'Shards' }], tab: tabArg,
      render(body, tab, p) {
        const items = S().items;
        if (tab === 'shards') {
          const ids = Object.keys(S().shards).filter((k) => S().shards[k] > 0);
          if (!ids.length) { body.appendChild(el('div', 'center muted', 'No shards yet. You get shards from summoning heroes you already own.')); return; }
          const g = el('div', 'grid2');
          ids.forEach((id) => g.appendChild(heroCard(id, () => heroDetail(id, ids))));
          body.appendChild(g);
          return;
        }
        const list = Object.keys(items).filter((k) => D.ITEMS[k] && D.ITEMS[k].tab === tab && items[k] > 0);
        list.sort((a, b) => (D.ITEMS[a].tier || 0) - (D.ITEMS[b].tier || 0));
        if (!list.length) { body.appendChild(el('div', 'center muted', 'Nothing here yet.')); return; }
        if (!sel || !list.includes(sel)) sel = list[0];
        const g = el('div', 'igrid');
        list.forEach((k) => {
          const s = UI.islot(k, items[k]);
          if (k === sel) s.classList.add('sel');
          s.addEventListener('click', () => { sel = k; SH.audio.sfx.tab(); p.render(); });
          g.appendChild(s);
        });
        body.appendChild(g);
        const it = D.ITEMS[sel];
        const box = el('div', 'row dark');
        box.style.marginTop = '.8em';
        const desc = it.slot ? `${D.GEAR_TIER[it.tier].name} ${it.slot}. ${Object.entries(D.gearStat(it.slot, it.tier)).map(([k, v]) => `+${v} ${k.toUpperCase()}`).join(', ')}. Equip it in a hero's Gear tab.` : it.desc;
        box.innerHTML = `<div class="r-ico"><img src="${UI.iconUrl(sel)}"></div><div class="r-main"><div class="r-title">${it.name} x${items[sel]}</div><div class="r-desc">${desc}</div></div>`;
        const side = el('div', 'r-side');
        if (it.sell) {
          const b = el('button', 'btn small blue', `Sell ${UI.costHtml({ gold: it.sell })}`);
          b.addEventListener('click', () => { if (GAME.sellItem(sel, 1)) { SH.audio.sfx.coin(); p.render(); } });
          side.appendChild(b);
        }
        if (it.use) {
          const b = el('button', 'btn small green', 'Use');
          b.addEventListener('click', () => { const got = GAME.useItem(sel); if (got) ok(got); p.render(); });
          side.appendChild(b);
        }
        box.appendChild(side);
        body.appendChild(box);
      },
    });
  }

  // ================================================================ SHOP
  function shop(tabArg) {
    let timer = null;
    const p = UI.panel({
      title: 'Shop', tabs: [{ id: 'market', label: 'Market' }, { id: 'gems', label: 'Gems' }, { id: 'honor', label: 'Honor' }], tab: tabArg,
      onClose() { clearInterval(timer); },
      render(body, tab) {
        if (tab === 'market') {
          const m = GAME.market();
          const left = 3 * 3600 * 1000 - (Date.now() - m.t);
          const top = el('div', 'flex', `<span class="muted flex1">New goods in ${U.fmtTime(left / 1000)}</span>`);
          const rf = el('button', 'btn small blue', `Refresh ${UI.costHtml({ gems: 20 })}`);
          rf.addEventListener('click', () => { if (GAME.refreshMarket(false)) { SH.audio.sfx.coin(); p.render(); } else UI.toast('Not enough gems', true); });
          top.appendChild(rf);
          body.appendChild(top);
          const g = el('div', 'grid2');
          g.style.marginTop = '.5em';
          m.slots.forEach((s, i) => g.appendChild(shopCard(s, () => { const got = GAME.buy(i); if (got) { SH.audio.sfx.coin(); ok(got); p.render(); } else UI.toast('Not enough ' + Object.keys(s.cost)[0], true); })));
          body.appendChild(g);
        } else if (tab === 'gems') {
          const r = el('div', 'row');
          r.innerHTML = `<div class="r-ico"><img src="${SH.icon('chest_purple', 96)}"></div><div class="r-main"><div class="r-title">Daily Treasure</div><div class="r-desc">A free chest every day: 80 gems and 5,000 gold.</div></div>`;
          const b = el('button', 'btn small ' + (GAME.freeGemsReady() ? 'gold' : 'gray'), GAME.freeGemsReady() ? 'Free!' : 'Tomorrow');
          b.addEventListener('click', () => { const got = GAME.claimFreeGems(); if (got) ok(got); else UI.toast('Come back tomorrow', true); p.render(); });
          r.appendChild(b);
          body.appendChild(r);
          const r2 = el('div', 'row');
          r2.innerHTML = `<div class="r-ico"><img src="${SH.icon('stamina', 96)}"></div><div class="r-main"><div class="r-title">Stamina Refill</div><div class="r-desc">+120 stamina right now.</div></div>`;
          const b2 = el('button', 'btn small', UI.costHtml({ gems: 50 }));
          b2.addEventListener('click', () => { if (GAME.buyStamina()) { SH.audio.sfx.coin(); UI.toast('+120 stamina'); } else UI.toast('Not enough gems', true); });
          r2.appendChild(b2);
          body.appendChild(r2);
          body.appendChild(el('div', 'muted center', 'Gems come from missions, new stages, the tower, the daily treasure and the mail. Everything in this game is free.'));
        } else {
          body.appendChild(el('div', 'arena-me', `<span>Your honor</span><b>${U.fmt(S().honor)}</b>`));
          const g = el('div', 'grid2');
          GAME.HONOR_SHOP.forEach((s, i) => g.appendChild(shopCard(s, () => { const got = GAME.buy(i, GAME.HONOR_SHOP); if (got) { SH.audio.sfx.coin(); ok(got); p.render(); } else UI.toast('Not enough honor. Win arena fights!', true); })));
          body.appendChild(g);
        }
      },
    });
    timer = setInterval(() => { if (p.tab === 'market' && UI.top() === p) p.render(); }, 1000);
    return p;
  }
  function shopCard(s, buy) {
    const c = el('div', 'hcard' + (s.bought ? ' locked' : ''));
    c.style.flexDirection = 'column'; c.style.alignItems = 'center'; c.style.textAlign = 'center';
    const slot = UI.islot(s.item, s.n);
    slot.style.width = '4em';
    c.appendChild(slot);
    c.appendChild(el('div', 'hc-name', D.ITEMS[s.item].name));
    const b = el('button', 'btn small ' + (s.bought ? 'gray' : 'green'), s.bought ? 'Sold out' : UI.costHtml(s.cost));
    b.addEventListener('click', () => { if (!s.bought) buy(); });
    c.appendChild(b);
    return c;
  }

  // ================================================================ DAILY GIFT
  function login() {
    return UI.panel({
      title: 'Daily Gift',
      render(body) {
        const st = S().login;
        body.appendChild(el('div', 'muted center', 'Log in every day for a gift. Day 7 is the best one!')).style.marginBottom = '.6em';
        const g = el('div', 'login-grid');
        D.LOGIN.forEach((r, i) => {
          const day = i + 1;
          const got = day < st.streak || (day === st.streak && st.claimed);
          const today = day === st.streak && !st.claimed;
          const c = el('div', 'lday' + (got ? ' got' : '') + (today ? ' today' : '') + (day === 7 ? ' d7' : ''));
          c.appendChild(el('div', 'ld-d', `Day ${day}`));
          const k = Object.keys(r)[0];
          const s = UI.islot(k, r[k]);
          if (day === 7) s.style.width = '35%';
          c.appendChild(s);
          g.appendChild(c);
        });
        body.appendChild(g);
        const b = el('button', 'btn gold big', st.claimed ? 'Come back tomorrow' : 'Claim');
        b.style.margin = '1em auto 0'; b.style.display = 'flex';
        if (st.claimed) b.classList.add('off');
        b.addEventListener('click', () => { const got = GAME.claimLogin(); if (got) { ok(got); UI.rerender(); } });
        body.appendChild(b);
      },
    });
  }

  // ================================================================ MAIL
  function mail() {
    return UI.panel({
      title: 'Mail',
      render(body) {
        const list = S().mail.slice().reverse();
        if (!list.length) { body.appendChild(el('div', 'center muted', 'No mail.')); return; }
        list.forEach((m) => {
          const r = el('div', 'row' + (m.claimed ? ' done' : ''));
          r.innerHTML = `<div class="r-ico"><img src="${SH.icon('mail', 96)}"></div><div class="r-main"><div class="r-title">${m.title}</div><div class="r-desc"><b>${m.from}:</b> ${m.body}</div><div class="r-rew">${UI.rewardChips(m.reward)}</div></div>`;
          const b = el('button', 'btn small ' + (m.claimed ? 'gray' : 'gold'), m.claimed ? 'Claimed' : 'Claim');
          b.addEventListener('click', () => { const got = GAME.claimMail(m.id); if (got) { ok(got); UI.rerender(); } });
          r.appendChild(b);
          body.appendChild(r);
        });
        if (list.some((m) => !m.claimed)) {
          const all = el('button', 'btn green', 'Claim all');
          all.style.margin = '.4em auto'; all.style.display = 'flex';
          all.addEventListener('click', () => { let got = []; S().mail.forEach((m) => { const g = GAME.claimMail(m.id); if (g) got = got.concat(g); }); ok(merge(got)); UI.rerender(); });
          body.appendChild(all);
        }
      },
    });
  }
  function merge(list) {
    const out = {};
    const rest = [];
    list.forEach((r) => { if (r.id) out[r.id] = (out[r.id] || 0) + r.n; else rest.push(r); });
    return Object.keys(out).map((id) => ({ id, n: out[id] })).concat(rest);
  }
  M.merge = merge;

  // ================================================================ SETTINGS
  function settings() {
    const st = SH.settings;
    return UI.panel({
      title: 'Settings',
      render(body) {
        const opt = (label, key, values, names, reload) => {
          const r = el('div', 'set-row', `<label>${label}</label>`);
          const o = el('div', 'opts');
          values.forEach((v, i) => {
            const b = el('button', st[key] === v ? 'on' : '', names[i]);
            b.addEventListener('click', () => {
              st[key] = v; SH.saveSettings(); SH.audio.sfx.tab();
              if (reload) UI.confirm('Graphics', 'The new graphics setting needs a restart. Restart now?', () => location.reload(), { yes: 'Restart' });
              UI.rerender();
            });
            o.appendChild(b);
          });
          r.appendChild(o);
          body.appendChild(r);
        };
        const slider = (label, key) => {
          const r = el('div', 'set-row', `<label>${label}</label>`);
          const s = el('input');
          s.type = 'range'; s.min = 0; s.max = 100; s.value = st[key];
          s.addEventListener('input', () => { st[key] = Number(s.value); SH.saveSettings(); SH.audio.volumes(); if (SH.music) SH.music.volume(); });
          r.appendChild(s);
          body.appendChild(r);
        };
        opt('Graphics', 'quality', ['auto', 'low', 'medium', 'high'], ['Auto', 'Low', 'Mid', 'High'], true);
        opt('Frame rate', 'fps', [30, 60, 0], ['30', '60', 'Max']);
        slider('Music', 'music');
        slider('Sounds', 'sfx');
        opt('Screen shake', 'shake', [true, false], ['On', 'Off']);
        opt('Damage numbers', 'numbers', [true, false], ['On', 'Off']);
        body.appendChild(el('div', 'muted center', `Graphics now: ${SH.qualityLevel.toUpperCase()} · ${Math.round(SH.fps)} FPS · ${SH.platform}`)).style.margin = '.6em 0';
        const reset = el('button', 'btn gray small', 'Reset game');
        reset.style.margin = '1em auto 0'; reset.style.display = 'flex';
        reset.addEventListener('click', () => UI.confirm('Reset', 'Delete your whole progress and start again?', () => SH.resetGame(), { yes: 'Delete' }));
        body.appendChild(reset);
      },
    });
  }

  // ================================================================ PROFILE
  function profile() {
    return UI.panel({
      title: 'Commander',
      render(body) {
        const s = S();
        body.appendChild(el('div', 'arena-me', `<span>Team Level</span><b>${s.teamLv}</b>`));
        body.appendChild(el('div', 'stat-grid', `
          <div class="stat"><b>${Object.keys(s.heroes).length}/${D.HEROES.length}</b><span>Heroes</span></div>
          <div class="stat"><b>${GAME.progValue('stages')}</b><span>Stages</span></div>
          <div class="stat"><b>${U.fmt(GAME.teamPower())}</b><span>Team Power</span></div>
          <div class="stat"><b>${s.tower.best}</b><span>Tower</span></div>
          <div class="stat"><b>${s.arena.points}</b><span>Arena</span></div>
          <div class="stat"><b>${s.prog.c.summons}</b><span>Summons</span></div>`));
        body.appendChild(el('div', 'sec-title', 'Your team'));
        const t = el('div', 'team-slots');
        s.team.forEach((id) => { const d = el('div', 'tslot'); if (id) { d.appendChild(UI.pf(id)); d.appendChild(el('div', 'ts-n', D.HERO[id].name)); } else d.appendChild(el('div', 'pf empty')); t.appendChild(d); });
        body.appendChild(t);
        const b = el('button', 'btn', 'Change team');
        b.style.margin = '.5em auto'; b.style.display = 'flex';
        b.addEventListener('click', () => M.teamSelect({ title: 'Team', button: 'Save', onStart() { UI.toast('Team saved'); UI.refresh(); } }));
        body.appendChild(b);
      },
    });
  }

  // ================================================================ SUMMON
  function summon() {
    const prevView = SH.viewName;
    SH.setView('showroom');
    SH.showroom.altar();
    UI.showHUD(true);
    const wrap = el('div', '');
    wrap.style.cssText = 'position:absolute;inset:0;z-index:6';
    document.getElementById('panels').appendChild(wrap);
    const p = { opts: { keep3D: true }, close };
    UI.stack.push(p);
    UI.sync3D();
    SH.audio.sfx.open();
    function close() {
      const i = UI.stack.indexOf(p);
      if (i >= 0) UI.stack.splice(i, 1);
      wrap.remove();
      SH.showroom.skipSummon();
      SH.setView(prevView === 'showroom' ? 'town' : prevView);
      UI.sync3D();
      UI.refresh();
    }
    function banners() {
      wrap.innerHTML = '';
      const back = el('button', 'p-close');
      back.style.cssText = 'right:.8em;top:6em';
      back.addEventListener('click', () => { SH.audio.sfx.back(); close(); });
      wrap.appendChild(back);
      wrap.appendChild(el('div', 'map-top', '<div class="map-title" style="margin-top:4.6em">Wishing Altar</div>'));
      const b = el('div', 'sum-banners');
      const card = (kind, title, desc) => {
        const c = el('div', 'sum-card ' + kind);
        const R = GAME.RATES[kind];
        c.innerHTML = `<img src="${SH.icon(kind === 'basic' ? 'scroll' : 'scroll_gold', 96)}" style="width:3.4em"><div class="flex1"><div class="sc-t">${title}</div><div class="sc-d">${desc}</div><div class="sum-rates">SS ${R.SS}% · S ${R.S}% · A ${R.A}%${R.B ? ' · B ' + R.B + '%' : ''}</div></div>`;
        const bt = el('div', 'sc-btns');
        [1, 10].forEach((n) => {
          const price = GAME.summonPrice(kind, n);
          const x = el('button', 'btn small ' + (kind === 'premium' ? 'gold' : 'blue'), `x${n} ${UI.costHtml(price)}`);
          x.addEventListener('click', () => doSummon(kind, n));
          bt.appendChild(x);
        });
        c.appendChild(bt);
        return c;
      };
      b.appendChild(card('basic', 'Basic Wish', 'Common heroes with a small chance of legends.'));
      b.appendChild(card('premium', 'Star Wish', S().firstPremium ? 'Your first 10x Star Wish has a guaranteed SS hero!' : 'Much better odds. 10x always has an S or better.'));
      wrap.appendChild(b);
    }
    function doSummon(kind, n) {
      const price = GAME.summonPrice(kind, n);
      if (!GAME.pay(price)) { UI.toast('Not enough ' + Object.keys(price).map((k) => D.ITEMS[k] ? D.ITEMS[k].name : k).join(' / '), true); return; }
      const res = GAME.summon(kind, n);
      wrap.innerHTML = '';
      const skip = el('button', 'btn small gray', 'Skip');
      skip.style.cssText = 'position:absolute;right:.8em;top:6.2em';
      wrap.appendChild(skip);
      const info = el('div', 'sum-reveal');
      info.style.pointerEvents = 'none';
      wrap.appendChild(info);
      const done = () => summary(res);
      skip.addEventListener('click', () => { SH.showroom.skipSummon(); });
      SH.onSummonTap = () => { SH.showroom.nextSummon(); };
      info.addEventListener('click', () => SH.showroom.nextSummon());
      SH.showroom.playSummon(res, (r) => {
        const h = D.HERO[r.hero];
        info.style.pointerEvents = 'auto';
        info.innerHTML = `<div class="sr-name rar-${h.rarity}"><span class="rar-tag" style="font-size:.8em">${h.rarity}</span> ${h.name}${r.isNew ? '<span class="sr-new">NEW</span>' : ''}</div>
          <div class="sr-sub">${h.title} · ${UI.heroLine(h.id)}${r.isNew ? '' : ` · already owned: +${r.shards} shards`}</div><div class="muted">Tap to continue</div>`;
      }, done);
    }
    function summary(res) {
      SH.onSummonTap = null;
      wrap.innerHTML = '';
      const box = el('div', 'sum-reveal');
      box.innerHTML = '<div class="sr-name">Your new heroes</div>';
      const g = el('div', 'sum-grid');
      res.forEach((r, i) => {
        const f = UI.pf(r.hero, { keepColor: true });
        f.style.animationDelay = (i * 0.07) + 's';
        if (r.isNew) f.appendChild(el('span', 'new', 'NEW'));
        g.appendChild(f);
      });
      box.appendChild(g);
      const row = el('div', 'flex');
      row.style.marginTop = '1em';
      const again = el('button', 'btn gold', 'Again');
      again.addEventListener('click', () => banners());
      const back = el('button', 'btn gray', 'Back');
      back.addEventListener('click', close);
      row.append(back, again);
      box.appendChild(row);
      wrap.appendChild(box);
      SH.showroom.altar();
      UI.refresh();
    }
    banners();
    return p;
  }
  M.summon = summon;
})();
