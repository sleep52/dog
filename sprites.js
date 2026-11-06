// 精灵处理：把四张白底照片抠成透明、裁紧的 sprite，供三个模式共用。
// 照片是纯白背景，所以从四条边做洪水填充去掉连通白底，再只保留最大连通块（顺带去掉右下角水印），
// 最后对 alpha 通道做 1 像素羽化，边缘不会生硬。
window.PET = window.PET || {};

PET.Sprites = (function () {
  const MAX_EDGE = 760;
  const BG_MIN_RGB = 238;
  const cache = new Map();
  const pending = new Map();

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      const im = new Image();
      im.onload = function () { resolve(im); };
      im.onerror = function () { reject(new Error('图片加载失败: ' + src.slice(0, 40))); };
      im.src = src;
    });
  }

  function isBackground(data, i) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    return Math.min(r, g, b) >= BG_MIN_RGB;
  }

  // 从边界出发标记所有连通的近白像素
  function floodBackground(data, w, h) {
    const mask = new Uint8Array(w * h); // 1 = 背景
    const queue = new Int32Array(w * h);
    let head = 0, tail = 0;
    function push(x, y) {
      const p = y * w + x;
      if (!mask[p] && isBackground(data, p * 4)) { mask[p] = 1; queue[tail++] = p; }
    }
    for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
    for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
    while (head < tail) {
      const p = queue[head++];
      const x = p % w, y = (p - x) / w;
      if (x > 0) push(x - 1, y);
      if (x < w - 1) push(x + 1, y);
      if (y > 0) push(x, y - 1);
      if (y < h - 1) push(x, y + 1);
    }
    return mask;
  }

  // 只保留最大连通块，其余（水印、杂点）当作背景去掉
  function keepLargestBlob(mask, w, h) {
    const label = new Int32Array(w * h);
    const queue = new Int32Array(w * h);
    let next = 1, bestId = 0, bestSize = 0;
    const total = w * h;
    for (let start = 0; start < total; start++) {
      if (mask[start] || label[start]) continue;
      let head = 0, tail = 0, size = 0;
      label[start] = next; queue[tail++] = start;
      while (head < tail) {
        const p = queue[head++];
        size++;
        const x = p % w;
        const neighbours = [p - 1, p + 1, p - w, p + w];
        if (x === 0) neighbours[0] = -1;
        if (x === w - 1) neighbours[1] = -1;
        for (let k = 0; k < 4; k++) {
          const q = neighbours[k];
          if (q < 0 || q >= total || mask[q] || label[q]) continue;
          label[q] = next;
          queue[tail++] = q;
        }
      }
      if (size > bestSize) { bestSize = size; bestId = next; }
      next++;
    }
    for (let p = 0; p < total; p++) if (label[p] !== bestId) mask[p] = 1;
  }

  function buildCanvas(dataUri) {
    return loadImage(dataUri).then(function (im) {
      const scale = Math.min(1, MAX_EDGE / Math.max(im.naturalWidth, im.naturalHeight));
      const w = Math.max(1, Math.round(im.naturalWidth * scale));
      const h = Math.max(1, Math.round(im.naturalHeight * scale));

      const src = document.createElement('canvas');
      src.width = w; src.height = h;
      const sctx = src.getContext('2d', { willReadFrequently: true });
      sctx.drawImage(im, 0, 0, w, h);
      const img = sctx.getImageData(0, 0, w, h);
      const data = img.data;

      const mask = floodBackground(data, w, h);
      keepLargestBlob(mask, w, h);

      const alpha = new Float32Array(w * h);
      for (let p = 0; p < w * h; p++) {
        data[p * 4 + 3] = mask[p] ? 0 : 255;
        alpha[p] = mask[p] ? 0 : 1;
      }
      // alpha 通道 3x3 均值一次，做 1px 羽化
      const soft = new Float32Array(w * h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let sum = 0, n = 0;
          for (let dy = -1; dy <= 1; dy++) {
            const yy = y + dy;
            if (yy < 0 || yy >= h) continue;
            for (let dx = -1; dx <= 1; dx++) {
              const xx = x + dx;
              if (xx < 0 || xx >= w) continue;
              sum += alpha[yy * w + xx]; n++;
            }
          }
          soft[y * w + x] = sum / n;
        }
      }
      for (let p = 0; p < w * h; p++) data[p * 4 + 3] = Math.round(soft[p] * 255);

      let minX = w, minY = h, maxX = -1, maxY = -1;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (soft[y * w + x] > 0.5) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX < 0) { minX = 0; minY = 0; maxX = w - 1; maxY = h - 1; }

      const cw = maxX - minX + 1, ch = maxY - minY + 1;
      const full = document.createElement('canvas');
      full.width = w; full.height = h;
      full.getContext('2d').putImageData(img, 0, 0);

      const trimmed = document.createElement('canvas');
      trimmed.width = cw; trimmed.height = ch;
      const tctx = trimmed.getContext('2d');
      tctx.drawImage(full, minX, minY, cw, ch, 0, 0, cw, ch);

      return { canvas: trimmed, full: full, w: cw, h: ch, srcW: w, srcH: h, box: { minX: minX, minY: minY, cw: cw, ch: ch } };
    });
  }

  // 预加载完成后同步取用（跑酷主循环里不能 await）
  function peek(id) {
    return cache.get(id) || null;
  }

  function get(id) {
    if (cache.has(id)) return Promise.resolve(cache.get(id));
    if (pending.has(id)) return pending.get(id);
    const uri = window.PET_PHOTOS && window.PET_PHOTOS[id];
    if (!uri) return Promise.reject(new Error('没有这张照片: ' + id));
    const p = buildCanvas(uri).then(function (sprite) {
      cache.set(id, sprite);
      pending.delete(id);
      return sprite;
    });
    pending.set(id, p);
    return p;
  }

  function all(ids) {
    return Promise.all(ids.map(get)).then(function () { return true; });
  }

  function photo(id) {
    return window.PET_PHOTOS[id];
  }

  // 记忆翻牌用：同一张照片切成两个不同取景的方块（全身 / 上半张脸）
  function tile(id, region) {
    return get(id).then(function (sp) {
      const size = 240;
      const c = document.createElement('canvas');
      c.width = size; c.height = size;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fffdf6';
      ctx.fillRect(0, 0, size, size);

      const b = sp.box;
      let sx = b.minX, sy = b.minY, sw = b.cw, sh = b.ch;
      if (region === 'face') {
        // 取中段而不是顶部：四张照片里脸都在中间偏上，顶部常常是尾巴或帽子
        sy = b.minY + Math.round(b.ch * 0.28);
        sh = Math.round(b.ch * 0.46);
      }
      // 等比缩放进正方形，居中
      const k = size / Math.max(sw, sh);
      const dw = sw * k, dh = sh * k;
      ctx.drawImage(sp.full, sx, sy, sw, sh, (size - dw) / 2, (size - dh) / 2, dw, dh);
      return c;
    });
  }

  return { get: get, peek: peek, all: all, photo: photo, tile: tile };
})();
