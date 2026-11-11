/* =============================================================
   发音引擎（三层保障）：
   1. 内置标准普通话语音库（晓伊童声，离线打包，最稳定最标准）
   2. 安卓原生系统 TTS（window.PyNative，容器注入）
   3. 浏览器 Web Speech API（电脑浏览器）
   音效（WebAudio 合成，不依赖音频文件）
   ============================================================= */
const Voice = (function () {
  var synth = window.speechSynthesis || null;
  var voices = [];
  var picked = null;
  var ready = false;
  var listeners = [];
  var rate = 0.9;
  /* 发音延长系数：1 = 原始时长；0.8 = 放慢到 80%（时长增加 25%，音调不变） */
  var extend = 1;

  /* 内置语音库：window.AUDIO 由 js/audio-map.js 提供（文本 → mp3 文件名） */
  var AUD = null;
  try { AUD = (typeof window.AUDIO !== 'undefined') ? window.AUDIO : null; } catch (e) { AUD = null; }

  /* 安卓容器注入的原生 TTS */
  var nat = null;
  try { nat = (typeof window.PyNative !== 'undefined') ? window.PyNative : null; } catch (e) { nat = null; }

  function nativeReady() {
    try { return !!(nat && nat.isReady()); } catch (e) { return false; }
  }
  function nativeDead() {
    try { return !!(nat && nat.isDead()); } catch (e) { return false; }
  }
  function audioOk() {
    return !!(AUD && typeof Audio !== 'undefined');
  }

  /* ---------------- 内置语音播放 ---------------- */
  var seqToken = 0;
  var curAudio = null;

  function stopAudio() {
    seqToken++;
    if (curAudio) {
      try { curAudio.pause(); curAudio.currentTime = 0; } catch (e) { }
      curAudio = null;
    }
  }

  function playFile(file, r, onend, onerr) {
    var a;
    try { a = new Audio('audio/' + file); } catch (e) { if (onerr) onerr(); return null; }
    var pr = ((r || 0.9) / 0.9) * extend;
    if (pr < 0.45) pr = 0.45;
    if (pr > 1.5) pr = 1.5;
    if (pr !== 1) {
      try { a.playbackRate = pr; a.preservesPitch = true; a.mozPreservesPitch = true; a.webkitPreservesPitch = true; } catch (e) { }
    }
    a.onended = function () { if (onend) onend(); };
    a.onerror = function () { if (onerr) onerr(); };
    try {
      var p = a.play();
      if (p && p.catch) p.catch(function () { if (onerr) onerr(); });
    } catch (e) { if (onerr) onerr(); }
    return a;
  }

  /* ---------------- Web Speech ---------------- */
  function pickVoice() {
    if (!synth) return;
    voices = synth.getVoices() || [];
    var zh = voices.filter(function (v) {
      return /zh[-_]?(CN|Hans|SG)|cmn|Chinese|中文|普通话/i.test(v.lang + ' ' + v.name);
    });
    zh.sort(function (a, b) {
      var sa = /zh[-_]?(CN|Hans)|cmn|普通话/i.test(a.lang + a.name) ? 1 : 0;
      var sb = /zh[-_]?(CN|Hans)|cmn|普通话/i.test(b.lang + b.name) ? 1 : 0;
      return sb - sa;
    });
    var prefer = ['Xiaoxiao', 'Xiaoyi', 'Yunxi', 'Huihui', 'Yaoyao', 'Tingting', 'Meijia', 'Google 普通话', 'Chinese'];
    picked = null;
    for (var i = 0; i < prefer.length && !picked; i++) {
      picked = zh.filter(function (v) { return v.name.indexOf(prefer[i]) >= 0; })[0] || null;
    }
    if (!picked) picked = zh[0] || null;
    ready = !!picked;
    var nm = audioOk() ? '内置语音库' : (picked ? picked.name : '');
    listeners.forEach(function (fn) { fn(Voice.isReady(), nm); });
  }

  var speechInited = false;
  function initWebSpeech() {
    if (!synth || speechInited) return;
    speechInited = true;
    pickVoice();
    synth.onvoiceschanged = pickVoice;
    setTimeout(pickVoice, 300);
    setTimeout(pickVoice, 1200);
  }

  // 没有内置语音库时才启用 Web Speech；有原生 TTS 时由原生报告状态
  if (!AUD) initWebSpeech();

  /* ---------------- 对外：朗读 ---------------- */
  function slow(r) {
    var v = (r == null ? rate : r) * extend;
    if (v < 0.3) v = 0.3;
    if (v > 1.5) v = 1.5;
    return v;
  }
  function ttsSpeak(text, opt) {
    if (nat && !nativeDead()) {
      try { nat.speak(String(text), slow(opt.rate)); } catch (e) { }
      return;
    }
    if (!synth) return;
    try { synth.cancel(); } catch (e) { }
    var u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    u.rate = slow(opt.rate);
    u.pitch = opt.pitch != null ? opt.pitch : 1.08;
    u.volume = 1;
    if (picked) u.voice = picked;
    if (opt.onend) u.onend = opt.onend;
    if (opt.onstart) u.onstart = opt.onstart;
    try { synth.speak(u); } catch (e) { }
  }

  function ttsSpeakSeq(list, opt) {
    if (nat && !nativeDead()) {
      try {
        var payload = list.map(function (item) {
          var t = typeof item === 'string' ? item : item.t;
          var r = typeof item === 'string'
            ? slow(opt.rate)
            : slow(item.rate || opt.rate);
          return { t: String(t), r: r, g: 240 };
        });
        nat.speakSeq(JSON.stringify(payload));
      } catch (e) { }
      return;
    }
    if (!synth) return;
    try { synth.cancel(); } catch (e) { }
    list.forEach(function (item, i) {
      var text = typeof item === 'string' ? item : item.t;
      var r = typeof item === 'string' ? slow(opt.rate) : slow(item.rate || opt.rate);
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN';
      u.rate = r;
      u.pitch = opt.pitch != null ? opt.pitch : 1.08;
      if (picked) u.voice = picked;
      if (i === 0 && opt.onstart) u.onstart = opt.onstart;
      if (i === list.length - 1 && opt.onend) u.onend = opt.onend;
      try { synth.speak(u); } catch (e) { }
    });
  }

  function speak(text, opt) {
    if (!text) return;
    opt = opt || {};
    stopAudio();
    if (audioOk() && AUD[text]) {
      curAudio = playFile(AUD[text], opt.rate != null ? opt.rate : rate, opt.onend, function () {
        curAudio = null;
        ttsSpeak(text, opt);
      });
      return;
    }
    ttsSpeak(text, opt);
  }

  function speakSeq(list, opt) {
    opt = opt || {};
    stopAudio();
    if (audioOk() && list.length) {
      var files = [];
      var all = true;
      for (var i = 0; i < list.length; i++) {
        var t = typeof list[i] === 'string' ? list[i] : list[i].t;
        var f = AUD[t];
        if (!f) { all = false; break; }
        files.push(f);
      }
      if (all) { seqPlay(list, files, opt); return; }
    }
    ttsSpeakSeq(list, opt);
  }

  function seqPlay(list, files, opt) {
    var token = ++seqToken;
    var i = 0;
    function next() {
      if (token !== seqToken) return;
      if (i >= list.length) { if (opt.onend) opt.onend(); return; }
      var item = list[i];
      var t = typeof item === 'string' ? item : item.t;
      var r = typeof item === 'string'
        ? (opt.rate != null ? opt.rate : rate)
        : (item.rate || (opt.rate != null ? opt.rate : rate));
      var f = files[i];
      i++;
      curAudio = playFile(f, r, function () {
        if (token !== seqToken) return;
        setTimeout(function () { if (token === seqToken) next(); }, 230);
      }, function () {
        if (token !== seqToken) return;
        curAudio = null;
        ttsSpeakSeq(list.slice(i - 1), opt);
      });
    }
    if (opt.onstart) opt.onstart();
    next();
  }

  function stop() {
    stopAudio();
    if (nat) { try { nat.stop(); } catch (e) { } }
    if (synth) { try { synth.cancel(); } catch (e) { } }
  }

  /* 原生容器在 TTS 初始化完成后回调 */
  var natName = '';
  function setReady(ok, name) {
    ready = !!ok;
    if (name) natName = name;
    if (!ok) initWebSpeech();
    listeners.forEach(function (fn) {
      fn(Voice.isReady(), Voice.voiceName());
    });
  }

  /* ---------------- 音效（WebAudio 合成） ---------------- */
  var actx = null;
  function ctx() {
    if (!actx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      actx = new AC();
    }
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }

  function tone(freq, start, dur, type, gain) {
    var c = ctx(); if (!c) return;
    var o = c.createOscillator();
    var g = c.createGain();
    o.type = type || 'sine';
    o.frequency.value = freq;
    o.connect(g); g.connect(c.destination);
    var t0 = c.currentTime + start;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain || 0.18, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  var sfx = {
    correct: function () { tone(784, 0, 0.14); tone(988, 0.1, 0.14); tone(1319, 0.2, 0.26); },
    wrong: function () { tone(220, 0, 0.16, 'triangle', 0.14); tone(165, 0.14, 0.22, 'triangle', 0.12); },
    tap: function () { tone(660, 0, 0.06, 'sine', 0.1); },
    star: function () { tone(1047, 0, 0.1); tone(1319, 0.08, 0.1); tone(1568, 0.16, 0.1); tone(2093, 0.24, 0.3); },
    pop: function () { tone(520, 0, 0.05, 'square', 0.06); }
  };

  /* 直接播放指定音频文件（用于四声表等自带文件名的素材） */
  function playRaw(file, onend) {
    stopAudio();
    curAudio = playFile(file, rate, onend, function () {
      curAudio = null;
      if (onend) onend();
    });
    return curAudio;
  }

  return {
    speak: speak,
    speakSeq: speakSeq,
    playRaw: playRaw,
    stop: stop,
    setReady: setReady,
    sfx: sfx,
    isReady: function () {
      if (audioOk()) return true;
      return nat ? nativeReady() : ready;
    },
    voiceName: function () {
      if (audioOk()) return '内置标准语音库（晓伊童声 · 普通话）';
      return nat ? (natName || '系统中文语音') : (picked ? picked.name : '');
    },
    hasSupport: function () { return audioOk() || !!nat || !!synth; },
    hasBundledAudio: function () { return audioOk() && Object.keys(AUD).length > 0; },
    isNative: function () { return !!nat; },
    onReady: function (fn) {
      listeners.push(fn);
      if (Voice.isReady()) fn(true, Voice.voiceName());
    },
    setRate: function (r) { rate = r; },
    getRate: function () { return rate; },
    setExtend: function (k) { extend = (k > 0 && k <= 2) ? k : 1; },
    getExtend: function () { return extend; }
  };
})();
