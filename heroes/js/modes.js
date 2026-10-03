/* ==========================================================================
   SLING HEROES — game modes around the battle
   * campaign: the chapter map with its buttons, the stage popup (enemies,
     rewards, stamina), team select, the fight and the result screen with
     stars, hero EXP and loot
   * Demon Tower: endless floors, a boss every 5th floor
   * Arena: fight the teams of other commanders for honor
   * Guild raid: hit the Ancient Guardian as hard as you can in 6 turns
   * Expeditions: send heroes away for a while, they come back with loot
   ========================================================================== */
(function () {
  'use strict';

  const SH = window.SH;
  const D = SH.data, U = SH.util, GAME = SH.game, UI = SH.ui;
  const el = U.el;
  const $ = U.$;
  const S = () => SH.S();
  const MODES = (SH.modes = {});

  const worldUI = $('world-ui');
  const clearWorldUI = () => { [...worldUI.children].forEach((c) => { if (c !== SH.worldmap.labels) c.remove(); }); };

  function toTown() {
    clearWorldUI();
    SH.battle.end();
    SH.setView('town');
    UI.showHUD(true);
    UI.refresh();
    if (SH.music) SH.music.play('town');
  }
  MODES.toTown = toTown;
  SH.onEscape = () => { if (SH.viewName === 'map') toTown(); };

  // ================================================================ campaign map
  let mapCh = 1;
  MODES.campaign = (ch, diff) => {
    UI.closeAll();
    UI.showHUD(false);
    SH.battle.end();
    mapCh = ch || GAME.currentStage().ch;
    if (!GAME.chapterOpen(mapCh) && !SH.QS.has("dev")) mapCh = 1;
    SH.setView('map');
    SH.worldmap.show(mapCh, diff || SH.worldmap.diff || 'normal');
    drawMapUI();
    SH.worldmap.onNode = (n) => stagePopup(mapCh, n.st, SH.worldmap.diff);
    if (SH.music) SH.music.play('town');
  };
  function drawMapUI() {
    clearWorldUI();
    const C0 = D.CHAPTERS[mapCh - 1];
    const diff = SH.worldmap.diff;
    worldUI.appendChild(el('div', 'map-top', `<div class="map-title">Chapter ${mapCh}: ${C0.name}</div>`));
    worldUI.appendChild(el('div', 'map-stars', `<span class="stars">★</span> ${GAME.chapterStars(mapCh, diff)}/${D.STAGES_PER_CHAPTER * 3}`));
    const back = el('button', 'p-close map-back');
    back.addEventListener('click', () => { SH.audio.sfx.back(); toTown(); });
    worldUI.appendChild(back);
    if (mapCh > 1) {
      const l = el('button', 'map-arrow l', '&#9664;');
      l.addEventListener('click', () => { SH.audio.sfx.tab(); mapCh--; SH.worldmap.show(mapCh); drawMapUI(); });
      worldUI.appendChild(l);
    }
    if (mapCh < D.CHAPTERS.length) {
      const r = el('button', 'map-arrow r', '&#9654;');
      r.addEventListener('click', () => {
        if (!GAME.chapterOpen(mapCh + 1)) { UI.toast(`Clear ${mapCh}-${D.STAGES_PER_CHAPTER} to open the next chapter`, true); return; }
        SH.audio.sfx.tab(); mapCh++; SH.worldmap.show(mapCh); drawMapUI();
      });
      worldUI.appendChild(r);
    }
    const tabs = el('div', 'map-diff');
    D.DIFF_ORDER.forEach((d) => {
      const open = d === 'normal' || GAME.stageStars(mapCh, 1, d === 'elite' ? 'normal' : 'elite') > 0;
      const b = el('button', (d === diff ? 'on' : '') + (open ? '' : ' locked'), D.DIFFS[d].name);
      b.addEventListener('click', () => {
        if (!open) { UI.toast(d === 'elite' ? 'Clear stage 1 on Normal first' : 'Clear stage 1 on Elite first', true); return; }
        SH.audio.sfx.tab();
        SH.worldmap.show(mapCh, d);
        drawMapUI();
      });
      tabs.appendChild(b);
    });
    worldUI.appendChild(tabs);
    // stamina chip
    const st = el('div', 'map-stars', `<img src="${SH.icon('stamina', 64)}" style="width:1.5em;height:1.5em"> ${S().stamina}/${GAME.maxStamina()}`);
    st.style.top = 'calc(env(safe-area-inset-top, 0px) + 5.6em)';
    worldUI.appendChild(st);
  }

  // waves of a stage as battle specs
  function stageSpecs(ch, st, diff) {
    return D.stageWaves(ch, st, diff).map((w) => w.map((id) => (id.endsWith('*') ? { id: id.slice(0, -1), elite: true } : { id })));
  }
  function stagePopup(ch, st, diff) {
    if (!GAME.stageOpen(ch, st, diff)) { UI.toast('Clear the stage before first', true); return; }
    const waves = stageSpecs(ch, st, diff);
    const uniq = [];
    waves.flat().forEach((s) => { if (!uniq.includes(s.id)) uniq.push(s.id); });
    const R = D.stageRewards(ch, st, diff);
    const lvl = D.stageLevel(ch, st, diff);
    const stars = GAME.stageStars(ch, st, diff);
    const cost = D.DIFFS[diff].stamina;
    const box = el('div', 'stage-pop');
    box.innerHTML = `<div class="font-d" style="font-size:1.3em">${ch}-${st} ${st === D.STAGES_PER_CHAPTER ? '<span style="color:#ff7a5a">BOSS</span>' : ''}</div>
      <div>${UI.stars(stars, 3)}</div>`;
    const en = el('div', 'sp-enemies');
    uniq.slice(0, 6).forEach((id) => en.appendChild(UI.pf(id, { enemy: true })));
    box.appendChild(en);
    const myLv = Math.round(S().team.filter(Boolean).reduce((s, id) => s + (S().heroes[id] ? S().heroes[id].lvl : 0), 0) / Math.max(1, S().team.filter(Boolean).length));
    box.appendChild(el('div', 'sp-row', `<span>Recommended level</span><b style="color:${myLv >= lvl ? '#8aff5a' : '#ff8a5a'}">Lv ${lvl}</b>`));
    box.appendChild(el('div', 'sp-row', `<span>Waves</span><b>${waves.length}</b>`));
    box.appendChild(el('div', 'sp-row', `<span>3 stars</span><b>win in ${D.starRounds(waves.map((w) => w.map((s) => s.id + (s.elite ? '*' : ''))))} turns</b>`));
    const rw = el('div', 'r-rew');
    rw.style.cssText = 'display:flex;justify-content:center;gap:.4em;margin:.5em 0';
    rw.innerHTML = `<span class="chip"><img src="${SH.icon('gold', 64)}">${U.fmt(R.gold)}</span><span class="chip"><img src="${SH.icon('exp', 64)}">${U.fmt(R.exp)} EXP</span>${stars ? '' : `<span class="chip"><img src="${SH.icon('gems', 64)}">${st === D.STAGES_PER_CHAPTER ? 150 : 30}</span>`}`;
    box.appendChild(rw);
    UI.modal({
      title: D.CHAPTERS[ch - 1].name, html: box,
      buttons: [{ label: 'Close', cls: 'gray' }, { label: `Battle <span class="cost"><img src="${SH.icon('stamina', 64)}">${cost}</span>`, cls: 'green', fn: () => pickTeam(ch, st, diff) }],
    });
  }
  function pickTeam(ch, st, diff) {
    const cost = D.DIFFS[diff].stamina;
    SH.menus.teamSelect({
      title: `Stage ${ch}-${st}`, cost, button: 'Fight!',
      onStart(team) {
        if (!GAME.spendStamina(cost)) {
          UI.toast('Not enough stamina', true);
          SH.menus.plus('stamina');
          MODES.campaign(ch, diff);
          return;
        }
        startStage(ch, st, diff, team);
      },
    });
    // the team select switched to the showroom; when closed without starting, go back to the map
    const p = UI.top();
    const old = p.opts.onClose;
    p.opts.onClose = () => { old && old(); MODES.campaign(ch, diff); };
  }
  function startStage(ch, st, diff, team) {
    UI.closeAll();
    clearWorldUI();
    UI.showHUD(false);
    const waves = stageSpecs(ch, st, diff);
    const sr = D.starRounds(waves.map((w) => w.map((s) => s.id + (s.elite ? '*' : ''))));
    loadingSplash(waves, `Chapter ${ch}-${st} ${D.DIFFS[diff].name}`, () => {
      SH.battle.start({
        mode: 'campaign', theme: D.CHAPTERS[ch - 1].theme, team, waves, power: D.stagePower(ch, st, diff), starRounds: sr,
        boss: st === D.STAGES_PER_CHAPTER, title: `Chapter ${ch}-${st} ${D.DIFFS[diff].name}`, coinK: 20 + D.stageLevel(ch, st, diff) * 3,
        onEnd(res) {
          if (res.win) {
            const out = GAME.winStage(ch, st, diff, res.stars, team);
            out.got.push({ id: 'gold', n: res.coins });
            GAME.give({ gold: res.coins });
            results(res, out, {
              next: st < D.STAGES_PER_CHAPTER ? () => pickTeam(ch, st + 1, diff) : ch < D.CHAPTERS.length ? () => MODES.campaign(ch + 1, diff) : null,
              retry: () => pickTeam(ch, st, diff),
              back: () => MODES.campaign(ch, diff),
            });
          } else {
            results(res, null, { retry: () => pickTeam(ch, st, diff), back: () => MODES.campaign(ch, diff) });
          }
        },
      });
    });
  }

  // the boss splash while the arena is built ("Collect items for bonus effects")
  const TIPS = [
    'Bounce heroes love tight spots between enemies and walls.',
    'Pierce heroes fly through everything: line up long shots!',
    'Hit the glowing orange WEAK spot of a boss for triple damage.',
    'Bump into your own heroes to fire their combo skills.',
    'Fire beats Wood, Wood beats Water, Water beats Fire. Light and Dark beat each other.',
    'A hero card that glows is ready for a HYPER skill. Tap it on that hero\'s turn!',
    'Enemies attack when their number hits 0. Take out the low ones first.',
    'Finish within the shown turns to get 3 stars.',
  ];
  function loadingSplash(waves, title, then) {
    const last = waves[waves.length - 1];
    const bossSpec = last.find((s) => s.id && D.ENEMIES[s.id] && (D.ENEMIES[s.id].boss || D.ENEMIES[s.id].mini)) || last[0];
    const wrap = el('div', 'result');
    wrap.style.background = 'radial-gradient(ellipse at 50% 40%, #3a4a7a, #0a0c18 75%)';
    const img = new Image();
    img.src = bossSpec.hero ? SH.splash(bossSpec.hero) : SH.portrait('enemy', bossSpec.id, 320);
    img.style.cssText = 'width:72%;max-width:20em;filter:drop-shadow(0 0 1.5em rgba(255,120,60,.5));animation:popIn .6s cubic-bezier(.2,1.4,.5,1)';
    wrap.appendChild(el('div', 'map-title', title));
    wrap.appendChild(img);
    wrap.appendChild(el('div', 'font-d', bossSpec.hero ? D.HERO[bossSpec.hero].name : D.ENEMIES[bossSpec.id].name)).style.cssText = 'font-size:1.4em;margin:.3em 0';
    const bar = el('div', 'ld-bar', '<i></i>');
    bar.style.cssText = 'position:relative;width:70%;margin-top:1em';
    wrap.appendChild(bar);
    wrap.appendChild(el('div', 'muted', U.pick(TIPS))).style.cssText = 'margin-top:1em;width:80%;text-align:center';
    $('modal-layer').appendChild(wrap);
    const fill = bar.querySelector('i');
    let k = 0;
    const tick = () => {
      k += 0.08;
      fill.style.width = Math.min(100, k * 100) + '%';
      if (k < 0.5) requestAnimationFrame(tick);
      else {
        setTimeout(() => {
          then();
          fill.style.width = '100%';
          setTimeout(() => { wrap.style.transition = 'opacity .4s'; wrap.style.opacity = 0; setTimeout(() => wrap.remove(), 400); }, 250);
        }, 30);
      }
    };
    requestAnimationFrame(tick);
  }
  MODES.loadingSplash = loadingSplash;

  // ================================================================ results
  // res from the battle, out from GAME.winStage (or null), actions: {next, retry, back}
  function results(res, out, actions) {
    SH.battle.end();
    const wrap = el('div', 'result' + (res.win ? '' : ' lose'));
    wrap.appendChild(el('div', 'rs-title', res.win ? 'Victory!' : 'Defeat'));
    if (res.win && actions.stars !== false) {
      const st = el('div', 'rs-stars');
      for (let i = 0; i < 3; i++) { const s = el('i', i < res.stars ? 'on' : '', '★'); s.style.animationDelay = (0.4 + i * 0.25) + 's'; st.appendChild(s); }
      wrap.appendChild(st);
      for (let i = 0; i < res.stars; i++) setTimeout(() => SH.audio.sfx.star(), 450 + i * 250);
    }
    wrap.appendChild(el('div', 'muted', `Turns ${res.turns} · Max combo ${res.maxCombo} · Damage ${U.fmt(res.damage)}`));
    if (out && out.ups) {
      const hs = el('div', 'rs-heroes');
      res.team.forEach((id) => {
        const o = S().heroes[id];
        const d = el('div', 'rs-hero');
        d.appendChild(UI.pf(id));
        d.appendChild(el('div', 'bar blue', `<i style="width:${o.exp / D.expNeed(o.lvl) * 100}%"></i>`));
        d.appendChild(el('div', 'up', out.ups[id] ? `LEVEL UP!` : `+${out.exp} EXP`));
        hs.appendChild(d);
      });
      wrap.appendChild(hs);
    }
    if (out && out.got && out.got.length) {
      const list = el('div', 'rw-list');
      SH.menus.merge(out.got).forEach((r, i) => {
        const it = el('div', 'rw-item');
        it.style.animationDelay = (0.8 + i * 0.08) + 's';
        it.appendChild(r.shard ? UI.pf(r.shard, { noLv: true, noStars: true, keepColor: true, cls: 'sm' }) : UI.islot(r.id, r.n));
        list.appendChild(it);
      });
      wrap.appendChild(list);
    }
    if (!res.win) wrap.appendChild(el('div', 'muted center', 'Tip: level up your heroes, raise their stars and equip gear in the Heroes menu.')).style.cssText = 'width:80%;margin:.8em 0';
    const btns = el('div', 'rs-btns');
    const add = (label, cls, fn) => { const b = el('button', 'btn ' + cls, label); b.addEventListener('click', () => { SH.audio.sfx.click(); wrap.remove(); fn(); }); btns.appendChild(b); };
    add(actions.backLabel || 'Map', 'gray', actions.back);
    if (actions.retry) add('Retry', 'blue', actions.retry);
    if (res.win && actions.next) add('Next', 'green', actions.next);
    if (!res.win) add('Heroes', '', () => { actions.back(); setTimeout(() => SH.menus.open('heroes'), 50); });
    wrap.appendChild(btns);
    $('modal-layer').appendChild(wrap);
    UI.refresh();
  }
  MODES.results = results;

  // ================================================================ tower
  const towerPower = (f) => D.powerAt(2 + Math.round(f * 1.45), 1 + Math.floor(f / 10) * 0.15);
  function towerWaves(f) {
    const ch = Math.floor((f - 1) / 5) % D.CHAPTERS.length;
    const C0 = D.CHAPTERS[ch];
    const r = U.rng(f * 13);
    const boss = f % 5 === 0;
    const w = [];
    const n = 3 + Math.min(2, Math.floor(f / 8));
    const a = []; for (let i = 0; i < n; i++) a.push({ id: C0.mobs[Math.floor(r() * C0.mobs.length)] });
    w.push(a);
    if (boss) w.push([{ id: f % 10 === 0 ? C0.boss : C0.mini }, { id: C0.mobs[0] }, { id: C0.mobs[1] }]);
    return { waves: w, theme: C0.theme };
  }
  MODES.tower = () => {
    const p = UI.panel({
      title: 'Demon Tower',
      render(body) {
        const f = S().tower.floor;
        body.appendChild(el('div', 'arena-me', `<span>Next floor</span><b>${f}</b>`));
        body.appendChild(el('div', 'muted center', 'Every floor is harder. Every 5th floor holds a boss. First clears give gems!')).style.marginBottom = '.6em';
        const fl = el('div', 'tower-floors');
        for (let i = Math.max(1, f - 3); i <= f + 4; i++) {
          const boss = i % 5 === 0;
          const tw = towerWaves(i);
          const d = el('div', 'tfloor' + (i === f ? ' cur' : i < f ? ' done' : '') + (boss ? ' boss' : ''));
          d.innerHTML = `<span class="tf-n">F${i}</span><span class="flex1">${boss ? 'BOSS: ' + D.ENEMIES[tw.waves[1][0].id].name : D.CHAPTERS[Math.floor((i - 1) / 5) % D.CHAPTERS.length].name}</span>${i < f ? '✔' : `<span class="chip"><img src="${SH.icon('gems', 64)}">${boss ? 80 : 15}</span>`}`;
          fl.appendChild(d);
        }
        body.appendChild(fl);
        const b = el('button', 'btn green big', `Fight floor ${f}`);
        b.style.cssText = 'margin:.8em auto 0;display:flex';
        b.addEventListener('click', () => {
          p.close(true);
          SH.menus.teamSelect({
            title: `Tower F${f}`, button: 'Fight!',
            onStart(team) {
              const tw = towerWaves(f);
              UI.showHUD(false);
              loadingSplash(tw.waves, `Demon Tower F${f}`, () => SH.battle.start({
                mode: 'tower', theme: tw.theme, team, waves: tw.waves, power: towerPower(f), title: `Demon Tower F${f}`, coinK: 30 + f * 4, boss: f % 5 === 0,
                onEnd(res) {
                  let got = [];
                  if (res.win) { got = GAME.towerWin(); GAME.give({ gold: res.coins }); got.push({ id: 'gold', n: res.coins }); team.forEach((id) => GAME.heroExp(id, 40 + f * 15)); }
                  results(res, res.win ? { got } : null, { stars: false, backLabel: 'Town', back: () => { toTown(); MODES.tower(); }, retry: null, next: res.win ? () => { toTown(); MODES.tower(); } : null });
                },
              }));
            },
          });
        });
        body.appendChild(b);
      },
    });
    return p;
  };

  // ================================================================ arena
  MODES.arena = () => {
    const p = UI.panel({
      title: 'Arena',
      render(body) {
        const A = S().arena;
        body.appendChild(el('div', 'arena-me', `<span>Arena points</span><b>${A.points}</b><span>Tickets <b style="font-size:1em">${A.tickets}/5</b></span>`));
        GAME.arenaFoes().forEach((f, i) => {
          const r = el('div', 'foe');
          const t = el('div', 'f-team');
          f.team.forEach((id) => t.appendChild(UI.pf(id, { noLv: true, noStars: true, keepColor: true })));
          r.innerHTML = `<div class="flex1"><div class="font-d">${f.name}</div><div class="muted">Lv ${f.lvl} · Power ${U.fmt(f.power)} · ${f.points} pts</div></div>`;
          r.querySelector('.flex1').appendChild(t);
          const b = el('button', 'btn small ' + (f.k > 1.1 ? '' : f.k < 0.9 ? 'green' : 'blue'), 'Fight');
          b.addEventListener('click', () => {
            if (A.tickets <= 0) { UI.toast('No tickets left. They refill tomorrow!', true); return; }
            p.close(true);
            SH.menus.teamSelect({
              title: `vs ${f.name}`, button: 'Fight!',
              onStart(team) {
                const waves = [f.team.map((id) => ({ hero: id }))];
                UI.showHUD(false);
                loadingSplash(waves, `Arena vs ${f.name}`, () => SH.battle.start({
                  mode: 'arena', theme: U.pick(['forest', 'desert', 'crypt', 'frost']), team, waves, power: D.powerAt(f.lvl, 0.75 * f.k), title: `Arena vs ${f.name}`, coinK: 20,
                  onEnd(res) {
                    const out = GAME.arenaResult(i, res.win);
                    UI.toast(`Arena points ${out.delta >= 0 ? '+' : ''}${out.delta}`, out.delta < 0);
                    results(res, res.win ? { got: out.got } : null, { stars: false, backLabel: 'Town', back: () => { toTown(); MODES.arena(); } });
                  },
                }));
              },
            });
          });
          r.appendChild(b);
          body.appendChild(r);
        });
        const rf = el('button', 'btn small gray', 'New opponents');
        rf.style.cssText = 'margin:.3em auto;display:flex';
        rf.addEventListener('click', () => { S().arena.foes = null; SH.save(); p.render(); });
        body.appendChild(rf);
        body.appendChild(el('div', 'muted center', 'Win to earn honor. Spend it in the Shop (Honor tab).'));
      },
    });
    return p;
  };

  // ================================================================ guild raid
  MODES.guild = () => {
    const p = UI.panel({
      title: 'Guild Raid',
      render(body) {
        const g = S().guild;
        const pf = UI.pf('ancient', { enemy: true, cls: 'big' });
        pf.style.cssText = 'width:7em;height:7em;margin:0 auto';
        body.appendChild(pf);
        body.appendChild(el('div', 'center font-d', 'Ancient Guardian')).style.cssText = 'font-size:1.3em;margin:.4em 0';
        body.appendChild(el('div', 'muted center', 'The guardian cannot fall. Deal as much damage as you can in 6 turns. More damage = better rewards.'));
        body.appendChild(el('div', 'stat-grid', `<div class="stat"><b>${g.tries}/3</b><span>Tries today</span></div><div class="stat"><b>${U.fmt(g.best)}</b><span>Best</span></div><div class="stat"><b>${U.fmt(g.total)}</b><span>Total</span></div>`)).style.margin = '.7em 0';
        const b = el('button', 'btn green big', 'Attack!');
        b.style.cssText = 'margin:.3em auto;display:flex';
        b.addEventListener('click', () => {
          if (g.tries <= 0) { UI.toast('No tries left today', true); return; }
          p.close(true);
          SH.menus.teamSelect({
            title: 'Guild Raid', button: 'Attack!',
            onStart(team) {
              const waves = [[{ id: 'ancient', immortal: true }, { id: 'sandgolem', hpK: 0.6 }, { id: 'sandgolem', hpK: 0.6 }]];
              UI.showHUD(false);
              const lvl = Math.max(3, Math.round(team.reduce((s, id) => s + S().heroes[id].lvl, 0) / team.length));
              loadingSplash(waves, 'Guild Raid', () => SH.battle.start({
                mode: 'guild', theme: 'crypt', team, waves, power: D.powerAt(lvl, 0.8), title: 'Guild Raid', turnLimit: 6, coinK: 10,
                onEnd(res) {
                  const out = GAME.guildResult(res.damage);
                  results(Object.assign(res, { win: true }), { got: out.got }, { stars: false, backLabel: 'Town', back: () => { toTown(); MODES.guild(); } });
                },
              }));
            },
          });
        });
        body.appendChild(b);
      },
    });
    return p;
  };

  // ================================================================ expeditions
  MODES.expedition = () => {
    let timer = null;
    const p = UI.panel({
      title: 'Expeditions',
      onClose() { clearInterval(timer); },
      render(body) {
        body.appendChild(el('div', 'muted center', 'Send up to 3 heroes on a trip. They can still fight while they are away. Stronger teams bring back more!')).style.marginBottom = '.6em';
        S().expedition.forEach((e, i) => {
          const d = el('div', 'exp-slot');
          if (!e) {
            d.innerHTML = `<div class="es-h"><span>Slot ${i + 1}</span><span class="muted">free</span></div>`;
            const kinds = el('div', 'exp-kinds');
            let pick = 0;
            GAME.EXPEDITIONS.forEach((x, k) => {
              const b = el('button', k === 0 ? 'on' : '', `${x.name}<br>${x.min >= 60 ? x.min / 60 + ' h' : x.min + ' min'}`);
              b.addEventListener('click', () => { pick = k; kinds.querySelectorAll('button').forEach((q, j) => q.classList.toggle('on', j === k)); });
              kinds.appendChild(b);
            });
            d.appendChild(kinds);
            const go = el('button', 'btn small green', 'Pick heroes');
            go.addEventListener('click', () => {
              p.close(true);
              SH.menus.teamSelect({
                title: 'Expedition', button: 'Send', keepTeam: true, team: [null, null, null, null], exclude: GAME.busyHeroes(),
                onStart(team) { GAME.startExpedition(i, pick, team.slice(0, 3)); SH.modes.toTown(); MODES.expedition(); UI.toast('The heroes are on their way!'); },
              });
            });
            d.appendChild(go);
          } else {
            const left = GAME.expeditionLeft(i);
            d.innerHTML = `<div class="es-h"><span>${GAME.EXPEDITIONS[e.kind].name}</span><span>${left > 0 ? U.fmtTime(left / 1000) : '<span style="color:#8aff5a">Done!</span>'}</span></div>`;
            const t = el('div', 'es-team');
            e.heroes.forEach((id) => t.appendChild(UI.pf(id, { cls: 'sm' })));
            d.appendChild(t);
            const bar = el('div', 'bar green', `<i style="width:${(1 - left / e.dur) * 100}%"></i>`);
            d.appendChild(bar);
            if (left <= 0) {
              const c = el('button', 'btn small gold', 'Claim');
              c.style.marginTop = '.4em';
              c.addEventListener('click', () => { const got = GAME.claimExpedition(i); if (got) UI.rewards(got); p.render(); });
              d.appendChild(c);
            }
          }
          body.appendChild(d);
        });
      },
    });
    timer = setInterval(() => { if (UI.top() === p) p.render(); }, 1000);
    return p;
  };
})();
