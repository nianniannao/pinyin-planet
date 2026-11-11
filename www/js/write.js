/* =============================================================
   四线三格书写板：描红 / 淡描 / 自写 + 覆盖率自动评分
   ============================================================= */
function WritePad(root, letter, opts) {
  opts = opts || {};
  this.root = root;
  this.letter = letter;
  this.guide = opts.guide != null ? opts.guide : 0; // 0 描红 1 淡描 2 自写
  this.strokes = [];      // 归一化坐标笔画
  this.drawing = null;
  this.onScore = opts.onScore || function () { };
  this.onWarn = opts.onWarn || function () { }; // 写出格子时的实时提醒
  this._outRun = 0;
  this._lastWarn = 0;
  this._warned = false;
  this._build();
}

WritePad.prototype._build = function () {
  var self = this;
  this.root.innerHTML =
    '<div class="pad-wrap">' +
    '  <canvas class="pad-canvas"></canvas>' +
    '  <div class="pad-tip">跟着四线三格，从上往下写</div>' +
    '</div>';
  this.canvas = this.root.querySelector('canvas');
  this.tip = this.root.querySelector('.pad-tip');
  this.wrap = this.root.querySelector('.pad-wrap');
  this.ctx = this.canvas.getContext('2d');
  this._layout();
  this._bind();

  this.resizeHandler = function () { self._layout(); self._render(); };
  window.addEventListener('resize', this.resizeHandler);
};

WritePad.prototype.destroy = function () {
  window.removeEventListener('resize', this.resizeHandler);
};

WritePad.prototype._layout = function () {
  var rect = this.canvas.parentNode.getBoundingClientRect();
  // 尽量占满可用宽度（卡片内），上限放宽到 620px
  var w = Math.max(280, Math.min(rect.width, 620));
  // 高度同时受屏幕约束，保证整个书写板一屏能看到
  var maxH = Math.max(320, Math.min(window.innerHeight * 0.72, 700));
  var h = Math.round(w * 1.18);
  if (h > maxH) {
    h = Math.round(maxH);
    w = Math.min(w, Math.round(h / 1.02));
  }
  var dpr = Math.min(window.devicePixelRatio || 1, 2.5);

  this.cssW = w; this.cssH = h;
  this.canvas.style.width = w + 'px';
  this.canvas.style.height = h + 'px';
  this.canvas.width = Math.round(w * dpr);
  this.canvas.height = Math.round(h * dpr);
  this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // 四线三格
  this.top = h * 0.12;
  this.band = h * 0.245;
  this.lines = [this.top, this.top + this.band, this.top + this.band * 2, this.top + this.band * 3];
  this.baseline = this.lines[2];
  this.cx = w / 2;

  // 让字母 x 高度正好落在中间格
  var target = this.band * 0.96;
  var fs = this.band * 1.9;
  for (var i = 0; i < 3; i++) {
    this.ctx.font = this._font(fs);
    var m = this.ctx.measureText('x');
    var xh = (m.actualBoundingBoxAscent || fs * 0.5);
    if (xh <= 0.1) break;
    fs = fs * (target / xh);
  }
  this.fs = fs;
  // 太长的音节（整体认读）按宽度再缩一点，避免超出画布
  this.ctx.font = this._font(this.fs);
  var tw = this.ctx.measureText(this.letter).width;
  var maxW = w * 0.84;
  if (tw > maxW) this.fs = this.fs * (maxW / tw);
  this.brush = Math.max(8, this.band * 0.19);
  this._templateCache = null;
};

WritePad.prototype._font = function (fs) {
  return '700 ' + fs + 'px "Comic Sans MS","Chalkboard SE","Bradley Hand","Segoe Print","Nunito",' +
    '"PingFang SC","Microsoft YaHei",sans-serif';
};

WritePad.prototype._mask = function () {
  if (this._templateCache) return this._templateCache;
  var c = document.createElement('canvas');
  var dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  c.width = Math.round(this.cssW * dpr);
  c.height = Math.round(this.cssH * dpr);
  var x = c.getContext('2d');
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  x.font = this._font(this.fs);
  x.textAlign = 'center';
  x.textBaseline = 'alphabetic';
  x.fillStyle = '#000';
  x.fillText(this.letter, this.cx, this.baseline);

  var d = x.getImageData(0, 0, c.width, c.height).data;
  var mask = new Uint8Array(c.width * c.height);
  var count = 0;
  for (var i = 3, p = 0; i < d.length; i += 4, p++) {
    if (d[i] > 40) { mask[p] = 1; count++; }
  }
  this._templateCache = { mask: mask, w: c.width, h: c.height, count: count, dpr: dpr };
  return this._templateCache;
};

WritePad.prototype._render = function () {
  var g = this.ctx, w = this.cssW, h = this.cssH;
  g.clearRect(0, 0, w, h);

  // 背景
  g.fillStyle = '#FFFDF8';
  this._roundRect(g, 0, 0, w, h, 18);
  g.fill();

  // 四线三格
  g.lineWidth = 1.4;
  for (var i = 0; i < 4; i++) {
    g.beginPath();
    g.strokeStyle = (i === 0 || i === 3) ? '#F0A5A0' : '#F5C6C0';
    if (i === 0 || i === 3) g.strokeStyle = '#EF9A93';
    g.moveTo(14, this.lines[i]); g.lineTo(w - 14, this.lines[i]);
    g.stroke();
  }
  // 中间格淡黄底
  g.fillStyle = 'rgba(255, 214, 130, 0.16)';
  g.fillRect(14, this.lines[1], w - 28, this.band);
  // 虚线中线
  g.save();
  g.setLineDash([6, 7]);
  g.strokeStyle = '#F3D6CF';
  g.beginPath();
  g.moveTo(14, this.lines[1] + this.band / 2);
  g.lineTo(w - 14, this.lines[1] + this.band / 2);
  g.stroke();
  g.restore();

  // 描红模板
  var alpha = [0.30, 0.13, 0][this.guide];
  if (alpha > 0) {
    g.save();
    g.font = this._font(this.fs);
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.fillStyle = 'rgba(120, 96, 84, ' + alpha + ')';
    g.fillText(this.letter, this.cx, this.baseline);
    g.restore();
  }

  // 笔迹
  this._drawStrokes(g, w, h);
};

WritePad.prototype._roundRect = function (g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
};

WritePad.prototype._drawStrokes = function (g, w, h) {
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = '#FF7A59';
  var self = this;
  this.strokes.forEach(function (s) {
    if (s.pts.length < 1) return;
    if (s.pts.length === 1) {
      var p = s.pts[0];
      g.beginPath();
      g.arc(p.x * w, p.y * h, self.brush * 0.45, 0, Math.PI * 2);
      g.fillStyle = '#FF7A59';
      g.fill();
      return;
    }
    g.lineWidth = self.brush;
    g.beginPath();
    g.moveTo(s.pts[0].x * w, s.pts[0].y * h);
    for (var i = 1; i < s.pts.length - 1; i++) {
      var p1 = s.pts[i], p2 = s.pts[i + 1];
      var mx = (p1.x + p2.x) / 2 * w, my = (p1.y + p2.y) / 2 * h;
      g.quadraticCurveTo(p1.x * w, p1.y * h, mx, my);
    }
    var last = s.pts[s.pts.length - 1];
    g.lineTo(last.x * w, last.y * h);
    g.stroke();
  });
};

WritePad.prototype._pos = function (e) {
  var r = this.canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
};

/* 实时判断某点是否完全写出了字模范围（留出笔宽容差） */
WritePad.prototype._outsideAt = function (px, py) {
  var t = this._mask();
  var dpr = t.dpr;
  var X = Math.round(px * dpr), Y = Math.round(py * dpr);
  var r = Math.max(2, Math.round(this.brush * 0.62 * dpr));
  var samples = [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]];
  for (var i = 0; i < samples.length; i++) {
    var x = X + samples[i][0], y = Y + samples[i][1];
    if (x < 0 || y < 0 || x >= t.w || y >= t.h) continue; // 画布边缘不判出格
    if (t.mask[y * t.w + x]) return false; // 碰到字模 = 没出格
  }
  return true;
};

/* 出格提醒：抖动 + 红字提示 + 回调（音效/震动/语音由外部决定） */
WritePad.prototype._warn = function () {
  var now = Date.now();
  if (now - this._lastWarn < 2200) return;
  this._lastWarn = now;
  var self = this;
  this.wrap.classList.add('warn');
  this.tip.textContent = '⚠️ 写出格子啦，回到四线格里写哦';
  this.tip.classList.add('warn');
  setTimeout(function () { self.wrap.classList.remove('warn'); }, 520);
  this.onWarn();
};

WritePad.prototype._resetWarn = function () {
  this._outRun = 0;
  if (this.tip) {
    this.tip.textContent = '跟着四线三格，从上往下写';
    this.tip.classList.remove('warn');
  }
};

WritePad.prototype._bind = function () {
  var self = this;
  var c = this.canvas;
  c.style.touchAction = 'none';

  function down(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    c.setPointerCapture(e.pointerId);
    self._resetWarn();
    self._mask(); // 预热字模，避免首笔检测卡顿
    self.drawing = { pts: [self._pos(e)] };
    self.strokes.push(self.drawing);
    self._render();
    if (self.onStroke) self.onStroke();
  }
  function move(e) {
    if (!self.drawing) return;
    var p = self._pos(e);
    var last = self.drawing.pts[self.drawing.pts.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) < 0.004) return;
    self.drawing.pts.push(p);
    // 增量绘制，避免整幅重绘卡顿
    var g = self.ctx;
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.lineWidth = self.brush; g.strokeStyle = '#FF7A59';
    g.beginPath();
    g.moveTo(last.x * self.cssW, last.y * self.cssH);
    g.lineTo(p.x * self.cssW, p.y * self.cssH);
    g.stroke();
    // 实时出格检测：连续多笔采样都在字模外才提醒，避免误报
    if (self._outsideAt(p.x * self.cssW, p.y * self.cssH)) {
      self._outRun++;
      if (self._outRun >= 9) self._warn();
    } else {
      self._outRun = 0;
    }
    if (self.onStroke) self.onStroke();
  }
  function up() { self.drawing = null; }

  c.addEventListener('pointerdown', down);
  c.addEventListener('pointermove', move);
  c.addEventListener('pointerup', up);
  c.addEventListener('pointercancel', up);
  c.addEventListener('pointerleave', up);
};

WritePad.prototype.undo = function () {
  this.strokes.pop();
  this._resetWarn();
  this._render();
};
WritePad.prototype.clear = function () {
  this.strokes = [];
  this._resetWarn();
  this._render();
};
WritePad.prototype.setGuide = function (lv) {
  this.guide = lv;
  this._render();
};
WritePad.prototype.strokeCount = function () { return this.strokes.length; };

/* 评分：模板覆盖率 - 出界惩罚 */
WritePad.prototype.check = function () {
  // 只留笔迹层做比对（避免四线三格的线被算成笔画）
  this.ctx.clearRect(0, 0, this.cssW, this.cssH);
  this._drawStrokes(this.ctx, this.cssW, this.cssH);
  var t = this._mask();
  var W = this.canvas.width, H = this.canvas.height;
  var data = this.ctx.getImageData(0, 0, W, H).data;
  // 笔迹蒙版（红色通道高、蓝色通道低 => 笔画）
  var total = 0, tpl = t.count, hit = 0;
  var step = 1;
  for (var y = 0; y < H; y += step) {
    for (var x = 0; x < W; x += step) {
      var idx = (y * W + x) * 4;
      var r = data[idx], gg = data[idx + 1], b = data[idx + 2];
      var isInk = (r > 150 && b < 150 && r - b > 40); // 橙红色笔迹
      if (!isInk) continue;
      total++;
      if (t.mask[y * t.w + x]) hit++;
    }
  }
  if (total < tpl * 0.02) { this._render(); return { score: 0, cover: 0, outside: 0, empty: true }; }

  var cover = hit / tpl;
  var outside = (total - hit) / total;
  var score = Math.round(Math.min(100, Math.max(0, cover * 118 - outside * 62)));
  this._render();
  return { score: score, cover: Math.round(cover * 100), outside: Math.round(outside * 100), empty: false };
};
