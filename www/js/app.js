/* =============================================================
   拼音小星球 · 主应用
   无广告 · 无会员 · 全功能可操作 · 进度存在本地
   ============================================================= */
(function () {
  'use strict';

  var LS_KEY = 'pyxq.state.v1';
  var stage = document.getElementById('stage');
  var State = load();
  var pad = null;
  var recorder = null;
  var currentRoute = '';

  /* ---------------- 状态 ---------------- */
  function load() {
    var def = { stars: 0, learned: {}, settings: { rate: 0.9, sfx: true, extend: 0.8 }, best: {} };
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return def;
      var s = JSON.parse(raw);
      s.stars = s.stars || 0;
      s.learned = s.learned || {};
      s.settings = Object.assign(def.settings, s.settings || {});
      s.best = s.best || {};
      return s;
    } catch (e) { return def; }
  }
  function save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(State)); } catch (e) { }
  }
  function rec(id) {
    if (!State.learned[id]) State.learned[id] = { l: 0, r: 0, w: 0 };
    return State.learned[id];
  }
  function learnedCount(type) {
    return LETTERS.filter(function (l) {
      if (type && l.type !== type) return false;
      var r = State.learned[l.id];
      return r && r.l && r.r && r.w;
    }).length;
  }
  function touchedCount(type) {
    return LETTERS.filter(function (l) {
      if (type && l.type !== type) return false;
      var r = State.learned[l.id];
      return r && (r.l || r.r || r.w);
    }).length;
  }
  function addStars(n) {
    State.stars += n;
    save();
    var chip = document.getElementById('starChip');
    if (chip) {
      chip.textContent = '⭐ ' + State.stars;
      chip.classList.remove('pop');
      void chip.offsetWidth;
      chip.classList.add('pop');
    }
  }

  /* ---------------- 小工具 ---------------- */
  function toast(msg, ms) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._tid);
    t._tid = setTimeout(function () { t.classList.remove('show'); }, ms || 1800);
  }
  function go(hash) { location.hash = hash; }
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

  function burst(x, y) {
    var colors = ['#FF7A59', '#FFC94A', '#3FC1A9', '#5AA9E6', '#A78BFA', '#FF9EB5'];
    for (var i = 0; i < 26; i++) {
      var p = document.createElement('i');
      p.className = 'confetti';
      p.style.left = x + 'px';
      p.style.top = y + 'px';
      p.style.background = colors[i % colors.length];
      p.style.setProperty('--dx', (Math.random() * 260 - 130) + 'px');
      p.style.setProperty('--dy', (-Math.random() * 220 - 60) + 'px');
      p.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');
      document.body.appendChild(p);
      setTimeout(function (el) { return function () { el.remove(); }; }(p), 1100);
    }
  }

  /* ---------------- 语音播报 ---------------- */
  function sayLetter(l) { Voice.speak(l.say); rec(l.id).l = rec(l.id).l; }
  function saySpell(syl) {
    var parts = splitSyl3(syl);
    var sm = LETTER_MAP['sm-' + parts.sm];
    var med = parts.med ? LETTER_MAP['ym-' + parts.med] : null;
    var ym = LETTER_MAP['ym-' + parts.ym];
    var seq = [];
    if (sm) seq.push({ t: sm.say, rate: 0.8 });
    if (med) seq.push({ t: med.say, rate: 0.8 });
    if (ym) seq.push({ t: ym.say, rate: 0.8 });
    seq.push({ t: SYL[syl] || syl, rate: 0.8 });
    Voice.speakSeq(seq);
  }

  /* ---------------- 路由 ---------------- */
  /* 浏览器会把地址里的非 ASCII 字符（ü）转成 %C3%BC，这里要还原，
     否则 #/lesson/ym-ü 取到的是 ym-%C3%BC，查表失败被弹回首页 */
  function hashPath() {
    var raw = (location.hash || '').replace(/^#/, '');
    try { return decodeURIComponent(raw) || '/'; } catch (e) { return raw || '/'; }
  }
  function hashSeg(i) { return hashPath().split('/')[i] || ''; }

  window.addEventListener('hashchange', route);
  function route() {
    var h = hashPath();
    if (h === currentRoute) return;
    currentRoute = h;
    Voice.stop();
    if (pad) { pad.destroy(); pad = null; }
    Games.stop();
    if (recorder) { recorder.destroy(); recorder = null; }
    var p = h.split('/').filter(Boolean);

    if (p.length === 0) return viewHome();
    if (p[0] === 'list') return viewList(p[1] || 'sm', p[2] || 'study');
    if (p[0] === 'lesson') return viewLesson(p[1], p[2]);
    if (p[0] === 'game' && !p[1]) return viewGameHub();
    if (p[0] === 'game' && p[1] === 'play') return viewGamePlay(p[2], p[3] || 'all');
    if (p[0] === 'tone') return viewTone();
    if (p[0] === 'parent') return viewParent();
    viewHome();
  }

  /* ---------------- 首页 ---------------- */
  function viewHome() {
    var done = learnedCount();
    var pct = Math.round(done / 63 * 100);
    var r = 46, c = 2 * Math.PI * r;
    var dash = c * pct / 100;

    stage.innerHTML =
      '<div class="screen home">' +
      '  <header class="topbar">' +
      '    <div class="brand"><span class="logo">🎈</span><span>拼音小星球</span></div>' +
      '    <div class="top-right">' +
      '      <div class="star-chip" id="starChip">⭐ ' + State.stars + '</div>' +
      '      <button class="icon-btn" data-go="#/parent" title="家长设置">⚙️</button>' +
      '    </div>' +
      '  </header>' +

      '  <section class="hero">' +
      '    <div class="hero-text">' +
      '      <p class="hero-hi">你好，小小拼读家</p>' +
      '      <h1>今天想学哪一种？</h1>' +
      '      <p class="hero-sub">听 · 读 · 写，一步一步来</p>' +
      '    </div>' +
      '    <div class="ring-wrap">' +
      '      <svg viewBox="0 0 110 110" class="ring">' +
      '        <circle cx="55" cy="55" r="' + r + '" class="ring-bg"/>' +
      '        <circle cx="55" cy="55" r="' + r + '" class="ring-fg" stroke-dasharray="' + dash + ' ' + c + '"/>' +
      '      </svg>' +
      '      <div class="ring-label"><b>' + pct + '%</b><span>已掌握 ' + done + '/63</span></div>' +
      '    </div>' +
      '  </section>' +

      '  <div class="action-grid">' +
      '    <button class="action-card tone-coral" data-go="#/list/sm/study">' +
      '      <span class="ac-emoji">👂</span><b>听</b><em>听标准发音</em></button>' +
      '    <button class="action-card tone-mint" data-go="#/list/all/read">' +
      '      <span class="ac-emoji">🎤</span><b>读</b><em>拼一拼 · 跟读</em></button>' +
      '    <button class="action-card tone-sky" data-go="#/list/all/write">' +
      '      <span class="ac-emoji">✏️</span><b>写</b><em>四线三格描红</em></button>' +
      '    <button class="action-card tone-sun" data-go="#/game">' +
      '      <span class="ac-emoji">🎮</span><b>玩</b><em>听音小游戏</em></button>' +
      '  </div>' +

      '  <section class="block">' +
      '    <h2 class="block-title">拼音地图<span>点一点，马上开始</span></h2>' +
      '    <div class="type-row">' +
      typeCard('sm') + typeCard('ym') + typeCard('zt') +
      '    </div>' +
      '  </section>' +

      '  <section class="block">' +
      '    <h2 class="block-title">全部 63 个拼音</h2>' +
      '    <div class="letter-grid">' + LETTERS.map(homeTile).join('') + '</div>' +
      '  </section>' +

      '  <footer class="foot">' +
      '    <p>全程无广告 · 无会员 · 无需登录 · 断网可用</p>' +
      '  </footer>' +
      '</div>';

    bindGo(stage);
  }

  function typeCard(t) {
    var m = TYPE_META[t];
    var n = touchedCount(t);
    return '<button class="type-card tone-' + m.tone + '" data-go="#/list/' + t + '/study">' +
      '<span class="tc-name">' + m.name + '</span>' +
      '<span class="tc-sub">' + m.sub + '</span>' +
      '<span class="tc-progress">' + n + ' / ' + m.total + '</span>' +
      '<span class="tc-bar"><i style="width:' + Math.round(n / m.total * 100) + '%"></i></span>' +
      '</button>';
  }

  function homeTile(l) {
    var r = State.learned[l.id];
    var done = r && r.l && r.r && r.w;
    return '<button class="tile tone-' + TYPE_META[l.type].tone + ' len' + l.letter.length + (done ? ' done' : '') + '" data-go="#/lesson/' + l.id + '">' +
      '<b>' + esc(l.letter) + '</b>' + (done ? '<i class="tick">★</i>' : '') + '</button>';
  }

  /* ---------------- 分类列表 ---------------- */
  function viewList(type, mode) {
    var types = type === 'all' ? ['sm', 'ym', 'zt'] : [type];
    var titleMap = { study: '选一个拼音开始', read: '选一个拼音来读', write: '选一个拼音来写' };
    var modeKey = mode === 'read' ? 'r' : mode === 'write' ? 'w' : 'l';

    var html = '<div class="screen list">' +
      '<header class="topbar">' +
      '  <button class="icon-btn" data-go="#/">←</button>' +
      '  <div class="page-title">' + titleMap[mode] + '</div>' +
      '  <div class="star-chip" id="starChip">⭐ ' + State.stars + '</div>' +
      '</header>';

    types.forEach(function (t) {
      var m = TYPE_META[t];
      var arr = LETTERS.filter(function (l) { return l.type === t; });
      var n = arr.filter(function (l) { var r = State.learned[l.id]; return r && r[modeKey]; }).length;
      html += '<section class="block">' +
        '<h2 class="block-title">' + m.name + '<span>' + n + '/' + arr.length + ' 已' + (mode === 'read' ? '读' : mode === 'write' ? '写' : '学') + '</span></h2>' +
        '<div class="letter-grid big">' +
        arr.map(function (l) {
          var r = State.learned[l.id] || {};
          return '<button class="tile tile-lg tone-' + m.tone + ' len' + l.letter.length + (r[modeKey] ? ' done' : '') + '" data-go="#/lesson/' + l.id + '/' + mode + '">' +
            '<b>' + esc(l.letter) + '</b>' +
            (r[modeKey] ? '<i class="tick">★</i>' : '') +
            '</button>';
        }).join('') +
        '</div></section>';
    });

    html += '</div>';
    stage.innerHTML = html;
    bindGo(stage);
  }

  /* ---------------- 课程详情 ---------------- */
  function viewLesson(id, initTab) {
    var l = LETTER_MAP[id];
    if (!l) return go('#/');
    var tab = initTab === 'read' ? 'read' : initTab === 'write' ? 'write' : 'listen';
    var m = TYPE_META[l.type];
    var fs = { 1: 190, 2: 150, 3: 122, 4: 104 }[Math.min(4, l.letter.length)] || 100;

    stage.innerHTML =
      '<div class="screen lesson">' +
      '  <header class="topbar">' +
      '    <button class="icon-btn" data-go="#/list/' + l.type + '/study">←</button>' +
      '    <div class="page-title">' + m.name + ' · 第 ' + l.no + ' 个</div>' +
      '    <div class="star-chip" id="starChip">⭐ ' + State.stars + '</div>' +
      '  </header>' +

      '  <div class="lesson-hero tone-' + m.tone + '">' +
      '    <div class="letter-stage" style="--fs:' + fs + 'px">' +
      '      <div class="four-line"><i></i><i></i><i></i><i></i></div>' +
      '      <span class="py-glyph">' + esc(l.letter) + '</span>' +
      '    </div>' +
      '    <div class="hero-side">' +
      '      <button class="play-btn" id="playLetter"><span>🔊</span>听一听</button>' +
      '      <button class="word-card" id="playWord">' +
      '        <span class="wc-emoji">' + l.emoji + '</span>' +
      '        <span class="wc-text"><b>' + esc(l.wordChar) + '</b><i>' + esc(l.wordPy) + '</i></span>' +
      '      </button>' +
      '    </div>' +
      '  </div>' +

      '  <div class="tabs">' +
      '    <button class="tab' + (tab === 'listen' ? ' on' : '') + '" data-tab="listen">听</button>' +
      '    <button class="tab' + (tab === 'read' ? ' on' : '') + '" data-tab="read">读</button>' +
      '    <button class="tab' + (tab === 'write' ? ' on' : '') + '" data-tab="write">写</button>' +
      '  </div>' +
      '  <div class="tab-body" id="tabBody"></div>' +

      '  <div class="lesson-nav">' +
      '    <button class="btn btn-ghost" id="prevLetter">↑ 上一个</button>' +
      '    <button class="btn btn-primary" id="nextLetter">下一个 ↓</button>' +
      '  </div>' +
      '</div>';

    bindGo(stage);
    $('#playLetter', stage).onclick = function () {
      Voice.speak(l.say); rec(l.id).l = 1; save();
    };
    $('#playWord', stage).onclick = function () { Voice.speak(l.wordChar); };

    var idx = LETTERS.indexOf(l);
    $('#prevLetter', stage).onclick = function () {
      go('#/lesson/' + LETTERS[(idx - 1 + LETTERS.length) % LETTERS.length].id + '/' + tab);
    };
    $('#nextLetter', stage).onclick = function () {
      go('#/lesson/' + LETTERS[(idx + 1) % LETTERS.length].id + '/' + tab);
    };

    $$('.tab', stage).forEach(function (t) {
      t.onclick = function () {
        $$('.tab', stage).forEach(function (x) { x.classList.remove('on'); });
        t.classList.add('on');
        renderTab(l, t.dataset.tab);
      };
    });

    renderTab(l, tab);
    setTimeout(function () { Voice.speak(l.say); }, 320);
    fitGlyph(l);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* 让字母的 x 高度正好落在四线三格的中间格，并保证不超出宽度 */
  function fitGlyph(l) {
    var st = $('.letter-stage'), glyph = $('.py-glyph');
    if (!st || !glyph || !l) return;
    var h = st.clientHeight, w = st.clientWidth;
    if (!h || !w) return;
    var fs = h * 0.63;
    var probe = document.createElement('canvas').getContext('2d');
    probe.font = '700 100px "Comic Sans MS","Chalkboard SE","Bradley Hand","Segoe Print",sans-serif';
    var tw = probe.measureText(l.letter).width / 100;
    var maxW = w * 0.86;
    if (tw * fs > maxW) fs = maxW / tw;
    glyph.style.fontSize = Math.round(fs) + 'px';
  }

  function renderTab(l, tab) {
    if (pad) { pad.destroy(); pad = null; }
    if (recorder) { recorder.destroy(); recorder = null; }
    var body = $('#tabBody');
    if (tab === 'listen') body.innerHTML = tabListenHTML(l);
    if (tab === 'read') body.innerHTML = tabReadHTML(l);
    if (tab === 'write') body.innerHTML = tabWriteHTML(l);
    bindGo(body);
    if (tab === 'listen') bindListenTab(l);
    if (tab === 'read') bindReadTab(l);
    if (tab === 'write') bindWriteTab(l);
  }

  /* ---- 听 ---- */
  function tabListenHTML(l) {
    var toneGroup = l.type === 'ym' ? TONE_MAP[l.letter] : l.type === 'zt' ? TONE_WHOLE[l.letter] : null;
    var html = '<div class="card">' +
      '<h3 class="card-title">🎧 听清楚，再跟着说</h3>' +
      '<div class="sound-row">' +
      '  <button class="sound-btn" data-say="' + esc(l.say) + '">字母音<b>' + esc(l.letter) + '</b></button>' +
      '  <button class="sound-btn" data-say="' + esc(l.wordChar) + '">例词<b>' + l.emoji + ' ' + esc(l.wordChar) + '</b></button>' +
      '  <button class="sound-btn" data-say="' + esc(l.koujue) + '">口诀<b>儿歌</b></button>' +
      '</div>' +
      '<p class="koujue">「' + esc(l.koujue) + '」</p>' +
      '</div>';

    if (toneGroup) {
      html += '<div class="card">' +
        '<h3 class="card-title">🎢 四个声调</h3>' +
        '<p class="card-sub">一声平、二声扬、三声拐弯、四声降</p>' +
        '<div class="tone-row" style="grid-template-columns:repeat(' + toneGroup.length + ',1fr)">' +
        toneGroup.map(function (g, i) {
        var fn = 'tp-' + l.letter.replace('ü','v') + '-' + (i+1) + '.mp3';
        var ch = g[1] === '—' ? '' : g[1];
        return '<button class="tone-btn" data-play="' + fn + '">' +
            '<b>' + esc(g[0]) + '</b><i>' + (ch ? esc(ch) : '·') + '</i>' +
            '<em>' + ['一声', '二声', '三声', '四声'][i] + '</em></button>';
      }).join('') + '</div></div>';
    } else if (l.type === 'sm' && SM_TONE[l.letter]) {
      var st = SM_TONE[l.letter];
      var syl = st[0], chars = st[1];
      html += '<div class="card">' +
        '<h3 class="card-title">🎢 拼一拼，读四声</h3>' +
        '<p class="card-sub">声母 ' + esc(l.letter) + ' 和韵母相拼，读四个声调</p>' +
        '<div class="tone-row" style="grid-template-columns:repeat(4,1fr)">' +
        chars.map(function (c, i) {
          var dis = !c;
          return '<button class="tone-btn' + (dis ? ' disabled' : '') + '" data-say="' + (dis ? '' : esc(c)) + '">' +
            '<b>' + (dis ? '·' : smToneGlyph(syl, i + 1)) + '</b><i>' + (dis ? '·' : c) + '</i>' +
            '<em>' + ['一声', '二声', '三声', '四声'][i] + '</em></button>';
        }).join('') + '</div></div>';
    } else {
      html += '<div class="card tip-card">' +
        '<h3 class="card-title">💡 小知识</h3>' +
        '<p>声母读得轻又短，韵母读得响又长。声母自己不能成音节，要和韵母做朋友才能拼出字来。</p>' +
        '</div>';
    }
    return html;
  }

  function bindListenTab(l) {
    $$('[data-say]', $('#tabBody')).forEach(function (b) {
      b.onclick = function () {
        var t = b.dataset.say;
        if (!t) return;
        b.classList.add('speaking');
        setTimeout(function () { b.classList.remove('speaking'); }, 700);
        if (t === l.koujue) Voice.speakSeq([{ t: t, rate: 0.72 }]);
        else Voice.speak(t, { rate: Voice.getRate() });
      };
    });
    $$('[data-play]', $('#tabBody')).forEach(function (b) {
      b.onclick = function () {
        $$('[data-play]', $('#tabBody')).forEach(function (x) { x.classList.remove('speaking'); });
        b.classList.add('speaking');
        Voice.sfx.tap();
        Voice.playRaw(b.dataset.play, function () { b.classList.remove('speaking'); });
      };
    });
  }

  /* ---- 读 ---- */
  function tabReadHTML(l) {
    var html = '';
    if (l.type === 'sm') {
      var list = (SM_SPELL[l.letter] || []).slice(0, 4);
      html += '<div class="card">' +
        '<h3 class="card-title">🧩 拼一拼：' + esc(l.letter) + ' + 韵母</h3>' +
        '<div class="spell-list">' +
        list.map(function (s) {
          var p = splitSyl3(s);
          var mid = p.three
            ? '<span class="si-ym">' + esc(p.med) + '</span><span class="si-op">+</span>'
            : '';
          return '<button class="spell-item' + (p.three ? ' three' : '') + '" data-spell="' + s + '">' +
            '<span class="si-sm">' + esc(p.sm) + '</span><span class="si-op">+</span>' +
            mid +
            '<span class="si-ym">' + esc(p.ym) + '</span><span class="si-op">=</span>' +
            '<span class="si-whole">' + esc(s) + '</span>' +
            '<span class="si-char">' + esc(SYL[s] || '') + '</span></button>';
        }).join('') + '</div>' +
        '<p class="card-sub">' + (list.some(function (s) { return splitSyl3(s).three; })
          ? '带小介音的（j-i-a）是三拼音节，中间的音要读得又轻又快' : '点一下，听老师慢慢拼给你听') +
        '</p>' +
        '</div>';
    } else if (l.type === 'ym') {
      var list2 = sylsForFinal(l.letter).slice(0, 6);
      html += '<div class="card">' +
        '<h3 class="card-title">🧩 拼一拼：声母 + ' + esc(l.letter) + '</h3>' +
        '<div class="spell-list">' +
        list2.map(function (s) {
          var p = splitSyl(s);
          return '<button class="spell-item" data-spell="' + s + '">' +
            (p.sm ? '<span class="si-sm">' + esc(p.sm) + '</span><span class="si-op">+</span>' : '') +
            '<span class="si-ym">' + esc(p.ym) + '</span><span class="si-op">=</span>' +
            '<span class="si-whole">' + esc(s) + '</span>' +
            '<span class="si-char">' + esc(SYL[s] || '') + '</span></button>';
        }).join('') + '</div>' +
        '<p class="card-sub">' + (list2.length <= 1
          ? '「' + esc(l.letter) + '」是特殊韵母，自己就能成一个音节，不用和声母拼'
          : '点一下，听老师慢慢拼给你听') + '</p>' +
        '</div>';
    } else {
      html += '<div class="card">' +
        '<h3 class="card-title">🧩 整体认读，一口读出来</h3>' +
        '<p class="card-sub">「' + esc(l.letter) + '」不用拼，看到就直接读出它的音。</p>' +
        '<div class="spell-list">' +
        '<button class="spell-item wide" data-say="' + esc(l.say) + '"><span class="si-whole">' + esc(l.letter) + '</span><span class="si-char">' + esc(l.wordChar) + '</span></button>' +
        '</div></div>';
    }

    html += '<div class="card record-card">' +
      '<h3 class="card-title">🎤 我来读一读</h3>' +
      '<p class="card-sub">先听老师读，再按住话筒读一遍，比一比像不像</p>' +
      '<div class="rec-row">' +
      '  <button class="rec-btn" id="recBtn"><span>🎤</span><em>点我开始读</em></button>' +
      '  <div class="rec-side">' +
      '    <button class="mini-btn" id="recListen">🔊 听老师</button>' +
      '    <button class="mini-btn" id="recPlay" disabled>▶️ 听我读</button>' +
      '  </div>' +
      '</div>' +
      '<div class="rec-status" id="recStatus"></div>' +
      '</div>';
    return html;
  }

  function bindReadTab(l) {
    function markRead() {
      var r = rec(l.id);
      if (!r.r) {
        r.r = 1; save(); addStars(1);
        Voice.sfx.correct();
        burst(window.innerWidth / 2, window.innerHeight / 3);
      }
    }
    $$('[data-spell]', $('#tabBody')).forEach(function (b) {
      b.onclick = function () {
        b.classList.add('active');
        setTimeout(function () { b.classList.remove('active'); }, 900);
        saySpell(b.dataset.spell);
        markRead();
      };
    });
    $$('[data-say]', $('#tabBody')).forEach(function (b) {
      b.onclick = function () { Voice.speak(b.dataset.say); markRead(); };
    });

    var btn = $('#recBtn'), status = $('#recStatus'), playBtn = $('#recPlay');
    $('#recListen').onclick = function () { Voice.speak(l.say); };

    btn.onclick = function () {
      if (recorder && recorder.recording) { recorder.stop(); return; }
      if (!(navigator.mediaDevices && window.MediaRecorder)) {
        toast('这个浏览器不支持录音，可以先跟着老师读哦');
        return;
      }
      status.textContent = '准备中…';
      navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
        .then(function (stream) {
          var chunks = [];
          var mr = new MediaRecorder(stream);
          var t0 = Date.now();
          recorder = {
            recording: true,
            stop: function () { try { mr.stop(); } catch (e) { } },
            destroy: function () { try { mr.stop(); } catch (e) { } stream.getTracks().forEach(function (t) { t.stop(); }); }
          };
          mr.ondataavailable = function (e) { if (e.data.size) chunks.push(e.data); };
          mr.onstop = function () {
            stream.getTracks().forEach(function (t) { t.stop(); });
            var blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
            var url = URL.createObjectURL(blob);
            btn.classList.remove('recording');
            btn.querySelector('em').textContent = '再读一次';
            status.innerHTML = '读得不错！听听自己的声音吧 👇';
            playBtn.disabled = false;
            playBtn.onclick = function () {
              var a = new Audio(url);
              a.play();
            };
            if (recorder) recorder.recording = false;
            var r = rec(l.id);
            if (!r.r) { r.r = 1; save(); addStars(1); Voice.sfx.correct(); burst(window.innerWidth / 2, window.innerHeight / 2); }
          };
          mr.start();
          recorder.recording = true;
          btn.classList.add('recording');
          btn.querySelector('em').textContent = '正在听…点我停止';
          status.textContent = '大声读出来吧～';
          setTimeout(function () {
            if (recorder && recorder.recording) recorder.stop();
          }, 5000);
        })
        .catch(function () {
          status.textContent = '没有拿到麦克风权限。可以点「听老师」先跟读，或者到浏览器设置里允许麦克风。';
        });
    };
  }

  /* ---- 写 ---- */
  function tabWriteHTML(l) {
    return '<div class="card write-card">' +
      '<h3 class="card-title">✏️ 在四线三格里写一写</h3>' +
      '<p class="card-sub">' + esc(l.stroke) + '</p>' +
      '<div class="guide-switch">' +
      '  <button class="gs on" data-guide="0">描红</button>' +
      '  <button class="gs" data-guide="1">淡描</button>' +
      '  <button class="gs" data-guide="2">自己写</button>' +
      '</div>' +
      '<div id="padBox"></div>' +
      '<div class="pad-actions">' +
      '  <button class="mini-btn" id="padUndo">↩️ 撤销</button>' +
      '  <button class="mini-btn" id="padClear">🧽 清空</button>' +
      '  <button class="mini-btn" id="padSay">🔊 念口诀</button>' +
      '  <button class="btn btn-primary sm" id="padCheck">看看写得怎么样</button>' +
      '</div>' +
      '<div class="pad-result" id="padResult"></div>' +
      '</div>';
  }

  function bindWriteTab(l) {
    pad = new WritePad($('#padBox'), l.letter, {
      guide: 0,
      onWarn: function () {
        Voice.sfx.wrong();
        if (navigator.vibrate) { try { navigator.vibrate(80); } catch (e) { } }
        Voice.speak('写出格子啦，回到四线格里写哦');
      }
    });
    $$('#tabBody .gs').forEach(function (b) {
      b.onclick = function () {
        $$('#tabBody .gs').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        pad.setGuide(parseInt(b.dataset.guide, 10));
      };
    });
    $('#padUndo').onclick = function () { pad.undo(); };
    $('#padClear').onclick = function () { pad.clear(); };
    $('#padSay').onclick = function () { Voice.speakSeq([{ t: l.stroke, rate: 0.75 }]); };
    $('#padCheck').onclick = function () {
      var res = pad.check();
      var box = $('#padResult');
      if (res.empty) {
        box.innerHTML = '<p class="warn">还没写呢，先描一描吧～</p>';
        return;
      }
      var stars = res.score >= 85 ? 3 : res.score >= 70 ? 2 : res.score >= 50 ? 1 : 0;
      box.innerHTML = '<div class="score-box">' +
        '<div class="sb-num">' + res.score + '<em>分</em></div>' +
        '<div class="sb-detail">覆盖 ' + res.cover + '%　出格 ' + res.outside + '%</div>' +
        '<div class="sb-stars">' + '⭐'.repeat(stars) + '☆'.repeat(3 - stars) + '</div>' +
        '<p class="sb-tip">' + (res.score >= 85 ? '写得真准！' : res.score >= 60 ? '不错，再贴着虚线写会更棒' : '慢一点，跟着淡灰色的字描') + '</p>' +
        '</div>';
      if (res.score >= 60) {
        Voice.sfx.star();
        var r = rec(l.id);
        if (!r.w) { r.w = 1; save(); addStars(2); }
        var rect = box.getBoundingClientRect();
        burst(rect.left + rect.width / 2, rect.top + 40);
      } else {
        Voice.sfx.tap();
      }
    };
  }

  /* ---------------- 游戏 ---------------- */
  function viewGameHub() {
    stage.innerHTML =
      '<div class="screen games">' +
      '<header class="topbar">' +
      '  <button class="icon-btn" data-go="#/">←</button>' +
      '  <div class="page-title">玩一玩</div>' +
      '  <div class="star-chip" id="starChip">⭐ ' + State.stars + '</div>' +
      '</header>' +
      '<section class="block">' +
      '  <h2 class="block-title">先选一组拼音<span>再选游戏</span></h2>' +
      '  <div class="seg" id="segType">' +
      '    <button class="seg-item on" data-type="sm">声母</button>' +
      '    <button class="seg-item" data-type="ym">韵母</button>' +
      '    <button class="seg-item" data-type="zt">整体认读</button>' +
      '    <button class="seg-item" data-type="all">全部</button>' +
      '  </div>' +
      '</section>' +
      '<div class="game-cards">' +
      '  <button class="game-card tone-coral" data-kind="listen"><span>👂</span><b>听音找朋友</b><em>听声音，选出正确的拼音</em></button>' +
      '  <button class="game-card tone-mint" data-kind="mole"><span>🔨</span><b>听音打地鼠</b><em>30 秒，拍中听到的拼音</em></button>' +
      '  <button class="game-card tone-grape" data-kind="tone"><span>🎢</span><b>四声跷跷板</b><em>听声调，选对调号</em></button>' +
      '</div>' +
      '<section class="block">' +
      '  <h2 class="block-title">声调小课堂</h2>' +
      '  <button class="wide-link" data-go="#/tone">去看看四个声调长什么样 →</button>' +
      '</section>' +
      '</div>';

    bindGo(stage);
    var type = 'sm';
    $$('#segType .seg-item').forEach(function (b) {
      b.onclick = function () {
        $$('#segType .seg-item').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        type = b.dataset.type;
      };
    });
    $$('.game-card').forEach(function (b) {
      b.onclick = function () { go('#/game/play/' + b.dataset.kind + '/' + type); };
    });
  }

  function viewGamePlay(kind, type) {
    stage.innerHTML =
      '<div class="screen game-play">' +
      '<header class="topbar">' +
      '  <button class="icon-btn" data-go="#/game">←</button>' +
      '  <div class="page-title">' + ({ listen: '听音找朋友', mole: '听音打地鼠', tone: '四声跷跷板' }[kind] || '小游戏') + '</div>' +
      '  <div class="star-chip" id="starChip">⭐ ' + State.stars + '</div>' +
      '</header>' +
      '<div id="gameStage" class="game-stage"></div>' +
      '</div>';
    bindGo(stage);

    Games.start(kind, $('#gameStage'), {
      type: type,
      onDone: function (res) {
        if (res && res.stars) {
          var prev = State.best[kind] || 0;
          if (res.score > prev) State.best[kind] = res.score;
          save();
          addStars(res.stars);
          toast('获得 ' + res.stars + ' 颗星星！');
        }
        go('#/');
      }
    });
  }

  /* ---------------- 声调专区 ---------------- */
  function viewTone() {
    var keys = Object.keys(TONE_CHART);
    var toneName = ['一声平', '二声扬', '三声拐弯', '四声降'];
    var html = '<div class="screen tone-page">' +
      '<header class="topbar">' +
      '  <button class="icon-btn" data-go="#/game">←</button>' +
      '  <div class="page-title">四声表 · 点一点</div>' +
      '  <div class="star-chip" id="starChip">⭐ ' + State.stars + '</div>' +
      '</header>' +
      '<div class="card intro-card">' +
      '  <div class="tone-mascots">' +
      '    <div class="tm"><svg viewBox="0 0 60 40"><path d="M8 20 H52" stroke-width="5" stroke="#FF7A59" fill="none" stroke-linecap="round"/></svg><b>ā</b><em>一声平</em></div>' +
      '    <div class="tm"><svg viewBox="0 0 60 40"><path d="M8 32 L52 8" stroke-width="5" stroke="#3FC1A9" fill="none" stroke-linecap="round"/></svg><b>á</b><em>二声扬</em></div>' +
      '    <div class="tm"><svg viewBox="0 0 60 40"><path d="M8 16 Q30 44 52 16" stroke-width="5" stroke="#3FC1A9" fill="none" stroke-linecap="round"/></svg><b>ǎ</b><em>三声拐弯</em></div>' +
      '    <div class="tm"><svg viewBox="0 0 60 40"><path d="M8 8 L52 32" stroke-width="5" stroke="#A78BFA" fill="none" stroke-linecap="round"/></svg><b>à</b><em>四声降</em></div>' +
      '  </div>' +
      '  <p class="card-sub" style="margin-top:10px">点任意一个带调号的韵母，听老师标准范读；下面小字是这个音配的例字。</p>' +
      '</div>';

    keys.forEach(function (k) {
      var row = TONE_CHART[k];
      html += '<div class="card tone-group">' +
        '<h3 class="card-title">' + esc(k) + ' 的四声 <span style="font-weight:400;color:#bbb;font-size:12px">' + row.length + ' 调</span></h3>' +
        '<div class="tone-chart-row">' +
        row.map(function (c) {
          return '<button class="chart-tone" data-play="' + c.file + '" data-word="' + esc(c.char) + '">' +
            '<b>' + esc(c.glyph) + '</b>' +
            '<i>' + esc(c.char) + '</i>' +
            '<em>' + toneName[c.n - 1] + '</em></button>';
        }).join('') + '</div></div>';
    });
    html += '<div class="card"><h3 class="card-title">🎮 练一练</h3>' +
      '<p class="card-sub">学会了？去「四声跷跷板」听声调、选对调号吧。</p>' +
      '<button class="btn btn-primary" data-go="#/game/play/tone/all" style="width:100%">去挑战四声游戏 →</button></div>';
    html += '</div>';
    stage.innerHTML = html;
    bindGo(stage);
    $$('[data-play]', stage).forEach(function (b) {
      b.onclick = function () {
        $$('[data-play]', stage).forEach(function (x) { x.classList.remove('speaking'); });
        b.classList.add('speaking');
        Voice.sfx.tap();
        Voice.playRaw(b.dataset.play, function () { b.classList.remove('speaking'); });
      };
    });
  }

  /* ---------------- 家长设置 ---------------- */
  function viewParent() {
    var s = State.settings;
    var ext = s.extend || 0.8;
    stage.innerHTML =
      '<div class="screen parent">' +
      '<header class="topbar">' +
      '  <button class="icon-btn" data-go="#/">←</button>' +
      '  <div class="page-title">家长设置</div>' +
      '  <div class="star-chip" id="starChip">⭐ ' + State.stars + '</div>' +
      '</header>' +
      '<div class="card">' +
      '  <h3 class="card-title">朗读速度</h3>' +
      '  <p class="card-sub">孩子刚学拼音时，慢一点更容易跟上</p>' +
      '  <div class="seg" id="rateSeg">' +
      '    <button class="seg-item' + (s.rate <= 0.75 ? ' on' : '') + '" data-rate="0.7">很慢</button>' +
      '    <button class="seg-item' + (s.rate > 0.75 && s.rate < 0.95 ? ' on' : '') + '" data-rate="0.85">慢</button>' +
      '    <button class="seg-item' + (s.rate >= 0.95 ? ' on' : '') + '" data-rate="1">正常</button>' +
      '  </div>' +
      '</div>' +
      '<div class="card">' +
      '  <h3 class="card-title">发音时长</h3>' +
      '  <p class="card-sub">每个音拖长一点，孩子更容易听清、跟得上；<b>音调不会变</b></p>' +
      '  <div class="seg" id="extSeg">' +
      '    <button class="seg-item' + (ext >= 0.95 ? ' on' : '') + '" data-ext="1">标准</button>' +
      '    <button class="seg-item' + (ext < 0.95 && ext > 0.7 ? ' on' : '') + '" data-ext="0.8">加长 25%</button>' +
      '    <button class="seg-item' + (ext <= 0.7 ? ' on' : '') + '" data-ext="0.65">加长 50%</button>' +
      '  </div>' +
      '  <button class="mini-btn" id="tryExt" style="margin-top:12px">🔊 试听「玻 坡 摸 佛」</button>' +
      '</div>' +
      '<div class="card">' +
      '  <h3 class="card-title">发音与声音</h3>' +
      '  <p class="card-sub" id="voiceInfo">正在检测…</p>' +
      '  <p class="card-sub">软件内置了整套标准普通话语音（晓伊童声朗读，已打包在软件里，完全离线）。<br>' +
      '  如果<b>完全没有声音</b>，请依次检查：<br>' +
      '  ① 按音量上键调大「媒体音量」（不是铃声音量）；<br>' +
      '  ② 安卓：设置 → 无障碍 → 文字转语音 → 安装/选择中文语音引擎；<br>' +
      '  ③ 电脑上建议用 Edge 或 Chrome 打开网页版。</p>' +
      '</div>' +
      '<div class="card">' +
      '  <h3 class="card-title">学习记录</h3>' +
      '  <p class="card-sub">已掌握 ' + learnedCount() + ' / 63 个拼音 · 星星 ' + State.stars + ' 颗</p>' +
      '  <button class="mini-btn danger" id="resetAll">清空学习记录</button>' +
      '</div>' +
      '<div class="card">' +
      '  <h3 class="card-title">怎么用</h3>' +
      '  <p class="card-sub">1. 首页选「声母 / 韵母 / 整体认读」，或直接点任意一个拼音卡。<br>' +
      '  2. 每节课都有 <b>听 → 读 → 写</b> 三个标签页，按顺序玩一遍就掌握一个拼音。<br>' +
      '  3. 「读」里可以录下孩子的声音再回放对比；「写」在四线三格里描红，会自动打分。<br>' +
      '  4. 一次 10–15 分钟即可，学完记得让眼睛休息。</p>' +
      '</div>' +
      '<div class="card about">' +
      '  <h3 class="card-title">关于「拼音小星球」</h3>' +
      '  <p>· 全程无广告、无弹窗、无跳转<br>· 没有会员、没有内购、没有登录<br>· 断网可用，学习记录只保存在本机<br>· 面向 4–7 岁儿童的拼音启蒙</p>' +
      '</div>' +
      '</div>';

    bindGo(stage);
    $$('#rateSeg .seg-item').forEach(function (b) {
      b.onclick = function () {
        $$('#rateSeg .seg-item').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        State.settings.rate = parseFloat(b.dataset.rate);
        Voice.setRate(State.settings.rate);
        save();
      };
    });
    $$('#extSeg .seg-item').forEach(function (b) {
      b.onclick = function () {
        $$('#extSeg .seg-item').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        ext = parseFloat(b.dataset.ext);
        State.settings.extend = ext;
        Voice.setExtend(ext);
        save();
      };
    });
    $('#tryExt').onclick = function () {
      Voice.speakSeq([{ t: '玻' }, { t: '坡' }, { t: '摸' }, { t: '佛' }]);
    };
    $('#resetAll').onclick = function () {
      if (confirm('确定要清空全部学习记录吗？')) {
        State = { stars: 0, learned: {}, settings: State.settings, best: {} };
        save();
        toast('已清空');
        viewParent();
      }
    };
    var info = $('#voiceInfo');
    Voice.onReady(function (ok, name) {
      info.textContent = ok ? '当前使用：' + name : '未检测到中文语音包，发音可能不准确';
      info.style.color = ok ? '' : '#E0643F';
    });
  }

  /* ---------------- 绑定 data-go ---------------- */
  function bindGo(root) {
    $$('[data-go]', root).forEach(function (b) {
      b.onclick = function (e) {
        e.preventDefault();
        Voice.sfx.tap();
        go(b.dataset.go);
      };
    });
  }

  /* ---------------- 启动 ---------------- */
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(function () { });
  }

  /* 原生容器：注入安全区（刘海/挖孔），并接管系统返回键 */
  window.setNativeInsets = function (t, r, b, l) {
    var s = document.documentElement.style;
    if (t > 0) s.setProperty('--sat', t + 'px');
    if (r > 0) s.setProperty('--sar', r + 'px');
    if (b > 0) s.setProperty('--sab', b + 'px');
    if (l > 0) s.setProperty('--sal', l + 'px');
    if (location.hash.indexOf('#/lesson/') === 0) {
      var id0 = hashSeg(2);
      setTimeout(function () { fitGlyph(LETTER_MAP[id0]); }, 30);
    }
  };

  window.__androidBack = function () {
    var h = location.hash || '';
    if (h && h !== '#' && h !== '#/') {
      history.back();
      return true;
    }
    return false;
  };

  window.addEventListener('resize', function () {
    if (location.hash.indexOf('#/lesson/') === 0) {
      var id = hashSeg(2);
      fitGlyph(LETTER_MAP[id]);
    }
  });

  Voice.setRate(State.settings.rate);
  Voice.setExtend(State.settings.extend == null ? 0.8 : State.settings.extend);

  var warned = false;
  function warnVoice() {
    if (warned || !Voice.hasSupport()) return;
    warned = true;
    var bar = document.createElement('div');
    bar.className = 'voice-warn';
    bar.innerHTML = '没找到中文语音，发音可能不准 · <span>点这里看怎么设置</span>';
    bar.onclick = function () { go('#/parent'); };
    document.body.appendChild(bar);
    setTimeout(function () { bar.classList.add('hide'); }, 12000);
  }
  Voice.onReady(function (ok) { if (!ok) warnVoice(); });
  setTimeout(function () { if (!Voice.isReady()) warnVoice(); }, 3200);

  route();
})();
