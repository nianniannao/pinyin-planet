/* =============================================================
   听音小游戏：听音找朋友 / 听音打地鼠 / 四声跷跷板
   ============================================================= */
const Games = (function () {
  var timers = [];
  var active = false;

  function later(fn, ms) { var id = setTimeout(fn, ms); timers.push(id); return id; }
  function every(fn, ms) { var id = setInterval(fn, ms); timers.push(id); return id; }
  function stopAll() { timers.forEach(function (t) { clearTimeout(t); clearInterval(t); }); timers = []; active = false; }

  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function poolOf(type) {
    if (!type || type === 'all') return LETTERS.slice();
    return LETTERS.filter(function (l) { return l.type === type; });
  }

  /* ---------------- 通用 HUD ---------------- */
  function hud(total, title) {
    var dots = '';
    if (total > 0) for (var i = 0; i < total; i++) dots += '<i class="dot" data-i="' + i + '"></i>';
    return '<div class="game-hud">' +
      '<div class="gh-title">' + title + '</div>' +
      '<div class="gh-dots" id="dots">' + dots + '</div>' +
      '<div class="gh-score"><span id="gscore">0</span> 分</div>' +
      '</div>';
  }

  function markDot(i, ok) {
    var d = document.querySelector('#dots .dot[data-i="' + i + '"]');
    if (d) d.className = 'dot ' + (ok ? 'ok' : 'no');
  }
  function setScore(n) { var s = document.getElementById('gscore'); if (s) s.textContent = n; }

  function finish(ctx, score, total, root, starsFixed) {
    stopAll();
    var rate = score / Math.max(1, total);
    var stars = starsFixed != null ? starsFixed : (rate >= 0.9 ? 3 : rate >= 0.7 ? 2 : rate >= 0.5 ? 1 : 0);
    if (stars >= 2) Voice.sfx.star(); else Voice.sfx.tap();
    var box = document.createElement('div');
    box.className = 'game-end';
    box.innerHTML =
      '<div class="ge-card">' +
      '  <div class="ge-emoji">' + (stars >= 2 ? '🎉' : stars === 1 ? '👍' : '💪') + '</div>' +
      '  <h3>' + (stars >= 2 ? '太棒啦！' : stars === 1 ? '做得不错！' : '再试一次吧') + '</h3>' +
      '  <p>答对 <b>' + score + '</b> / ' + total + ' 题</p>' +
      '  <div class="ge-stars">' + '⭐'.repeat(stars) + '☆'.repeat(3 - stars) + '</div>' +
      '  <div class="ge-actions">' +
      '    <button class="btn btn-ghost" id="geAgain">再玩一次</button>' +
      '    <button class="btn btn-primary" id="geBack">回到首页</button>' +
      '  </div>' +
      '</div>';
    root.appendChild(box);
    box.querySelector('#geAgain').onclick = function () {
      box.remove();
      start(ctx.kind, root, { type: ctx.type, onDone: ctx.onDone, again: true });
    };
    box.querySelector('#geBack').onclick = function () {
      box.remove();
      if (ctx.onDone) ctx.onDone({ score: score, total: total, stars: stars });
    };
  }

  /* ---------------- 1. 听音找朋友 ---------------- */
  function gameListen(root, opts) {
    var total = 8;
    var pool = poolOf(opts.type);
    var round = 0, score = 0, target = null, locked = false;

    root.innerHTML = hud(total, '听一听，找出这个拼音') +
      '<div class="game-body">' +
      '  <button class="speaker-big" id="replay"><span>🔊</span><em>点我听声音</em></button>' +
      '  <div class="opt-grid" id="opts"></div>' +
      '</div>';

    var optsEl = root.querySelector('#opts');
    root.querySelector('#replay').onclick = function () {
      if (target) Voice.speak(target.say);
    };

    function nextRound() {
      if (round >= total) { finish({ kind: 'listen', type: opts.type, onDone: opts.onDone }, score, total, root); return; }
      locked = false;
      target = pick(pool);
      var same = pool.filter(function (l) { return l.id !== target.id; });
      var others = shuffle(same).slice(0, 3);
      var list = shuffle([target].concat(others));
      optsEl.innerHTML = list.map(function (l) {
        return '<button class="opt-card" data-id="' + l.id + '"><b>' + l.letter + '</b></button>';
      }).join('');
      setTimeout(function () { Voice.speak(target.say); }, 260);

      Array.prototype.forEach.call(optsEl.children, function (btn) {
        btn.onclick = function () {
          if (locked) return;
          locked = true;
          var ok = btn.dataset.id === target.id;
          btn.classList.add(ok ? 'right' : 'wrong');
          if (!ok) {
            var right = optsEl.querySelector('[data-id="' + target.id + '"]');
            if (right) right.classList.add('right');
          }
          if (ok) { score++; setScore(score); Voice.sfx.correct(); markDot(round, true); }
          else { Voice.sfx.wrong(); markDot(round, false); }
          round++;
          setTimeout(nextRound, ok ? 620 : 1050);
        };
      });
    }
    nextRound();
  }

  /* ---------------- 2. 听音打地鼠 ---------------- */
  function gameMole(root, opts) {
    var pool = poolOf(opts.type);
    var total = 30;            // 时长（秒）
    var score = 0, timeLeft = total, target = pick(pool), running = true;

    var holes = '';
    for (var i = 0; i < 9; i++) {
      holes += '<button class="hole" data-i="' + i + '"><span class="mole"></span></button>';
    }
    root.innerHTML = hud(0, '听音打地鼠 · 听声音，拍对的拼音') +
      '<div class="game-body">' +
      '  <div class="mole-top">' +
      '    <div class="timer"><div class="timer-fill" id="tfill"></div></div>' +
      '    <button class="mini-speak" id="replayMole">🔊 再听一次</button>' +
      '  </div>' +
      '  <div class="mole-grid" id="grid">' + holes + '</div>' +
      '</div>';

    var grid = root.querySelector('#grid');
    var cells = Array.prototype.slice.call(grid.children);
    root.querySelector('#replayMole').onclick = function () { if (running) Voice.speak(target.say); };

    cells.forEach(function (cell) {
      cell.onclick = function () {
        if (!running) return;
        var shown = cell.dataset.letter;
        if (!shown) return;
        if (shown === target.letter) {
          score++; setScore(score);
          Voice.sfx.correct();
          cell.classList.add('hit');
          setTimeout(function () { cell.dataset.letter = ''; cell.classList.remove('show', 'hit'); }, 150);
          target = pick(pool);
          setTimeout(function () { if (running) Voice.speak(target.say); }, 220);
        } else {
          Voice.sfx.wrong();
          cell.classList.add('miss');
          setTimeout(function () { cell.classList.remove('miss'); }, 260);
        }
      };
    });

    function spawn() {
      if (!running) return;
      var free = cells.filter(function (c) { return !c.dataset.letter; });
      if (!free.length) return;
      var cell = pick(free);
      var l = Math.random() < 0.42 ? target : pick(pool.filter(function (x) { return x.id !== target.id; }));
      cell.dataset.letter = l.letter;
      cell.querySelector('.mole').textContent = l.letter;
      cell.classList.add('show');
      later(function () {
        if (cell.dataset.letter === l.letter) {
          cell.dataset.letter = '';
          cell.classList.remove('show');
        }
      }, 1500);
    }

    later(function () { Voice.speak(target.say); }, 300);
    every(spawn, 620);
    every(function () {
      timeLeft--;
      var f = root.querySelector('#tfill');
      if (f) f.style.width = (timeLeft / total * 100) + '%';
      if (timeLeft % 5 === 0 && running) Voice.speak(target.say);
      if (timeLeft <= 0) {
        running = false;
        finish({ kind: 'mole', type: opts.type, onDone: opts.onDone }, score, 9, root, score >= 9 ? 3 : score >= 6 ? 2 : score >= 3 ? 1 : 0);
      }
    }, 1000);
    later(function () {
      if (running) {
        running = false;
        finish({ kind: 'mole', type: opts.type, onDone: opts.onDone }, score, 9, root, score >= 9 ? 3 : score >= 6 ? 2 : score >= 3 ? 1 : 0);
      }
    }, total * 1000 + 200);
  }

  /* ---------------- 3. 四声跷跷板 ---------------- */
  function gameTone(root, opts) {
    var keys = Object.keys(TONE_MAP).concat(Object.keys(TONE_WHOLE)).filter(function (k) {
      var g = TONE_MAP[k] || TONE_WHOLE[k];
      return g.filter(function (x) { return x[1] !== '—'; }).length >= 3;
    });
    var total = 8, round = 0, score = 0, locked = false;

    root.innerHTML = hud(total, '听声调，选出正确的音') +
      '<div class="game-body">' +
      '  <button class="speaker-big" id="replayTone"><span>🔊</span><em>点我听声音</em></button>' +
      '  <div class="tone-opts" id="toneOpts"></div>' +
      '</div>';

    var optsEl = root.querySelector('#toneOpts');

    function nextRound() {
      if (round >= total) { finish({ kind: 'tone', type: opts.type, onDone: opts.onDone }, score, total, root); return; }
      locked = false;
      var key = pick(keys);
      var group = TONE_MAP[key] || TONE_WHOLE[key];
      var valid = group.filter(function (g) { return g[1] !== '—'; });
      var item = pick(valid);
      var text = item[1];

      optsEl.innerHTML = group.map(function (g, i) {
        return '<button class="tone-opt" data-t="' + g[0] + '"><b>' + g[0] + '</b><i>' + (g[1] === '—' ? '·' : g[1]) + '</i></button>';
      }).join('');
      setTimeout(function () { Voice.speak(text); }, 260);
      root.querySelector('#replayTone').onclick = function () { Voice.speak(text); };

      Array.prototype.forEach.call(optsEl.children, function (btn) {
        btn.onclick = function () {
          if (locked) return;
          locked = true;
          var ok = btn.dataset.t === item[0];
          btn.classList.add(ok ? 'right' : 'wrong');
          if (!ok) {
            var right = optsEl.querySelector('[data-t="' + item[0] + '"]');
            if (right) right.classList.add('right');
          }
          if (ok) { score++; setScore(score); Voice.sfx.correct(); markDot(round, true); }
          else { Voice.sfx.wrong(); markDot(round, false); }
          round++;
          setTimeout(nextRound, ok ? 650 : 1150);
        };
      });
    }
    nextRound();
  }

  function start(kind, root, opts) {
    stopAll();
    active = true;
    opts = opts || {};
    if (kind === 'listen') return gameListen(root, opts);
    if (kind === 'mole') return gameMole(root, opts);
    if (kind === 'tone') return gameTone(root, opts);
  }

  return { start: start, stop: stopAll, shuffle: shuffle, pick: pick };
})();
