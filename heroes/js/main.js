/* ==========================================================================
   SLING HEROES — start up
   The loading screen stays until the town, the icons, the hero portraits and
   every shader (town, map, showroom, battle) are built, so nothing freezes
   later in the game. Then the town opens and the buildings come alive.
   ========================================================================== */
(function () {
  'use strict';

  const SH = window.SH;
  const U = SH.util, D = SH.data, UI = SH.ui;
  const $ = U.$;

  const TIPS = [
    'Drag back and let go to sling your hero across the arena.',
    'Bump into your own heroes to fire their combo skills.',
    'Hit a boss on its glowing weak spot for triple damage!',
    'Check your mail: the King left you a welcome gift.',
    'Your first 10x Star Wish always has an SS hero.',
  ];

  async function boot() {
    const fill = $('ld-fill'), text = $('ld-text');
    $('ld-tip').textContent = U.pick(TIPS);
    SH.resize();
    const steps = [
      ['Building the town', () => SH.town.warm()],
      ['Painting the icons', () => {
        ['gems', 'gold', 'stamina', 'nav_heroes', 'nav_mastery', 'nav_missions', 'nav_inventory', 'nav_shop', 'gift', 'mail', 'compass', 'wish', 'swords', 'cog', 'exp'].forEach((n) => SH.icon(n, 128));
        ['gems', 'gold', 'stamina', 'exp'].forEach((n) => SH.icon(n, 64));
      }],
      ['Calling the heroes', () => { SH.game.ownedList().forEach((id) => SH.portrait('hero', id, 160)); }],
      ['Preparing the arena', () => SH.battle.view.warm()],
      ['Drawing the map', () => SH.worldmap.warm()],
      ['Lighting the altar', () => SH.showroom.warm()],
    ];
    for (let i = 0; i < steps.length; i++) {
      text.textContent = steps[i][0];
      fill.style.width = (i / steps.length * 100) + '%';
      await U.frame();
      await U.frame();
      try { steps[i][1](); } catch (e) { console.error(e); }
    }
    fill.style.width = '100%';
    text.textContent = 'Ready!';
    UI.wire();
    UI.refresh();
    SH.setView('town');
    SH.town.focus('campaign');
    SH.startLoop();
    await U.wait(250);
    $('loading').classList.add('out');
    setTimeout(() => $('loading').remove(), 700);
    UI.showHUD(true);
    if (SH.music) SH.music.play('town');
    // the rest of the portraits in the background, a few per frame
    const rest = D.HEROES.map((h) => h.id).filter((id) => !SH.game.owned(id));
    const idle = () => {
      if (!rest.length) return;
      SH.portrait('hero', rest.shift(), 160);
      setTimeout(idle, 60);
    };
    setTimeout(idle, 1500);
    welcome();
  }

  function welcome() {
    const S = SH.S();
    if (S.seen.welcome) return;
    S.seen.welcome = true;
    SH.save();
    setTimeout(() => UI.modal({
      title: 'Welcome, Commander!',
      html: 'The Demon Lord Azgor has woken up. Lead your heroes through 6 chapters and set the kingdom free!<br><br><b>1.</b> Open your <b>Mail</b> for gifts.<br><b>2.</b> Make a <b>Star Wish</b> at the Wishing Altar.<br><b>3.</b> Tap the glowing <b>Campaign</b> gate to fight.',
      buttons: [{ label: 'Let\'s go!', cls: 'gold' }],
    }), 900);
  }

  // tapping a building in the town
  SH.onBuilding = (id) => {
    const map = { campaign: 'campaign', arena: 'arena', tower: 'tower', summon: 'summon', expedition: 'expedition', guild: 'guild', mastery: 'mastery', shop: 'shop', mail: 'mail' };
    SH.menus.open(map[id] || id);
  };
  SH.onTeamLevel = (lv) => {
    setTimeout(() => {
      SH.audio.sfx.level();
      UI.toast(`Team level ${lv}! Stamina refilled.`);
      const f = Object.keys(D.UNLOCK).find((k) => D.UNLOCK[k] === lv);
      if (f) setTimeout(() => UI.toast(`New: ${{ mastery: 'Mastery', expedition: 'Expeditions', tower: 'Demon Tower', arena: 'Arena', guild: 'Guild Raid' }[f]} unlocked!`), 1200);
    }, 600);
  };

  // offline cache + installable app (only over http/https, e.g. GitHub Pages)
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !SH.QS.has('nosw')) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => { /* the game still runs */ }); });
  }

  boot();
})();
