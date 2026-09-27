/* ==========================================================================
   BALLS & GAMBLING — Skill Tree
   Spend tokens (earned in Funky Balls) on permanent upgrades. Two branches
   grow out of the Neural Core: ECONOMY (coins, box price, loot luck, Plinko,
   Crash Plane) and FUNKY BALLS (starting balls, bonus damage, card slots).
   ========================================================================== */
(function () {
  'use strict';

  const NEON = window.NEON || {};
  if (!NEON.profile || !NEON.game) return;
  const P = NEON.profile;
  const $ = (id) => document.getElementById(id);
  const play = (name, arg) => { const s = NEON.audio && NEON.audio.sfx; if (s && s[name]) s[name](arg); };
  const SVG_NS = 'http://www.w3.org/2000/svg';

  // node positions in a 1000 x 560 design space
  const POS = {
    core: [80, 280],
    coins: [265, 150], bargain: [480, 70], crash: [690, 70], luck: [480, 235], plinko: [690, 235], plinkoLuck: [895, 235],
    mag: [265, 410], dmg: [480, 360], slots: [480, 480],
  };
  const BRANCH = {
    coins: 'eco', bargain: 'eco', crash: 'eco', luck: 'eco', plinko: 'eco', plinkoLuck: 'eco',
    mag: 'funky', dmg: 'funky', slots: 'funky',
  };
  const JACKPOT_NODES = ['plinko', 'crash'];   // nodes that unlock a new lottery game

  let built = false;
  let selected = 'coins';
  const nodes = {};
  const links = {};

  function build() {
    const map = $('skill-map');
    const svg = $('skill-links');
    P.SKILLS.forEach((s) => {
      const [x1, y1] = POS[s.requires || 'core'], [x2, y2] = POS[s.id];
      const mid = Math.round((x1 + x2) / 2);
      const d = `M${x1} ${y1} H${mid} V${y2} H${x2}`;
      const glow = document.createElementNS(SVG_NS, 'path');
      glow.setAttribute('d', d);
      glow.setAttribute('class', 'link-glow ' + BRANCH[s.id]);
      const line = document.createElementNS(SVG_NS, 'path');
      line.setAttribute('d', d);
      line.setAttribute('class', 'link ' + BRANCH[s.id]);
      svg.append(glow, line);
      links[s.id] = [glow, line];
    });

    const core = document.createElement('div');
    core.className = 'skill-core';
    core.style.left = POS.core[0] / 10 + '%';
    core.style.top = POS.core[1] / 5.6 + '%';
    core.innerHTML = '<span>NEURAL<br>CORE</span>';
    map.appendChild(core);

    P.SKILLS.forEach((s) => {
      const b = document.createElement('button');
      b.className = 'skill-node ' + BRANCH[s.id];
      b.style.left = POS[s.id][0] / 10 + '%';
      b.style.top = POS[s.id][1] / 5.6 + '%';
      b.innerHTML = `<span class="sn-hex"><span class="sn-icon">${s.icon}</span></span>` +
        `<span class="sn-name">${s.name}</span><span class="sn-pips"></span>`;
      b.addEventListener('click', () => {
        selected = s.id;
        play('click');
        render();
      });
      map.appendChild(b);
      nodes[s.id] = b;
    });
  }

  function render() {
    P.SKILLS.forEach((s) => {
      const st = P.skillStatus(s.id);
      const b = nodes[s.id];
      b.classList.toggle('locked', !st.unlocked);
      b.classList.toggle('owned', st.level > 0);
      b.classList.toggle('maxed', st.maxed);
      b.classList.toggle('ready', st.affordable);
      b.classList.toggle('selected', selected === s.id);
      b.querySelector('.sn-pips').innerHTML =
        Array.from({ length: s.max }, (_, i) => `<i class="${i < st.level ? 'on' : ''}"></i>`).join('');
      links[s.id].forEach((p) => {
        p.classList.toggle('lit', st.unlocked);
        p.classList.toggle('full', st.level > 0);
      });
    });

    const s = P.skillDef(selected), st = P.skillStatus(selected);
    $('sk-detail').className = 'skill-detail ' + BRANCH[s.id];
    $('sk-icon').textContent = s.icon;
    $('sk-name').textContent = s.name;
    $('sk-level').textContent = 'LEVEL ' + st.level + ' / ' + st.max;
    $('sk-desc').textContent = s.desc;
    $('sk-now').textContent = st.level ? s.effect(st.level) : '—';
    $('sk-next').textContent = st.maxed ? 'MAXED OUT' : s.effect(st.level + 1);
    const btn = $('sk-buy');
    if (st.maxed) {
      btn.disabled = true;
      btn.textContent = '✓ MAXED';
    } else if (!st.unlocked) {
      btn.disabled = true;
      btn.textContent = 'REQUIRES ' + P.skillDef(s.requires).name;
    } else {
      btn.disabled = !st.affordable;
      btn.innerHTML = `UPGRADE &nbsp;<i class="token-icon"></i> ${st.cost}`;
    }
    $('sk-hint').classList.toggle('hidden', st.maxed || !st.unlocked || st.affordable);
  }

  function upgrade() {
    if (!P.upgradeSkill(selected)) {
      play('error');
      return;
    }
    play('equip');
    const b = nodes[selected];
    b.classList.remove('pulse');
    void b.offsetWidth;
    b.classList.add('pulse');
    if (JACKPOT_NODES.includes(selected)) play('jackpot');
    render();
  }

  function open(focus) {
    if (!built) { build(); built = true; }
    if (focus && P.skillDef(focus)) selected = focus;
    NEON.game.hideTitle();
    NEON.game.setMenuOpen(true);
    $('screen-skills').classList.remove('hidden');
    render();
  }

  function close() {
    $('screen-skills').classList.add('hidden');
    NEON.game.showTitle();
  }

  $('btn-skills').addEventListener('click', () => { play('click'); open(); });
  $('skills-back').addEventListener('click', () => { play('click'); close(); });
  $('sk-buy').addEventListener('click', upgrade);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('screen-skills').classList.contains('hidden')) close();
  });
  P.onChange(() => { if (built && !$('screen-skills').classList.contains('hidden')) render(); });

  NEON.skills = { open, close };
})();
