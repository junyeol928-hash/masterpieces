/* =========================================================================
   図版の解決 ── 三段構え

     1. assets/artworks/<id>.jpg   … 焼き込み済み（最速・確実）
     2. Wikimedia Commons の API   … 閲覧者のブラウザが実行時に取得
     3. ページに書かれた <svg>     … 構図を抽象化した自作図

   どの段で失敗しても、静かに次へ落ちる。壊れた画像アイコンは出さない。

   守ること。
   ・**これが動かなくても解説文は読める。** 図版が出ないだけで、文章は残る。
   ・著作権が生きている作品は外へ探しにいかない（noPhoto）。
     ここを開けておくと、ブラウザが関係のない写真を掴んでくる。
   ========================================================================= */
(function () {
  'use strict';

  var CACHE_KEY = 'plate.v1';
  var CACHE_TTL = 1000 * 60 * 60 * 24 * 30;   // 30日
  var manifest = null;

  /* ---------- サイトの根を求める ────────────────────────────
     works/ や artists/ の下からでも効くように、
     自分自身の src から逆算する。 */
  var ROOT = (function () {
    var s = document.currentScript;
    if (s && s.src) return s.src.replace(/assets\/js\/plate\.js.*$/, '');
    return './';
  })();

  /* ---------- localStorage ────────────────────────────────
     プライベートモードや容量超過では例外が飛ぶ。
     figure が出ないだけの話なので、黙って諦める。 */
  function cacheRead() {
    try {
      var o = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
      return (o && typeof o === 'object') ? o : {};
    } catch (e) { return {}; }
  }
  function cacheGet(id) {
    var e = cacheRead()[id];
    if (!e || !e.t || (Date.now() - e.t) > CACHE_TTL) return null;
    return e.u || null;
  }
  function cacheSet(id, url) {
    try {
      var c = cacheRead();
      c[id] = { u: url, t: Date.now() };
      localStorage.setItem(CACHE_KEY, JSON.stringify(c));
    } catch (e) { /* 容量超過などは無視してよい */ }
  }

  function getJSON(url) {
    return fetch(url, { credentials: 'omit' }).then(function (r) {
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    });
  }

  /* 画像が本当に読めるか確かめてから差し込む。
     1×1 のダミーを掴まされることがあるので、小さすぎるものは弾く。 */
  function tryImage(url) {
    return new Promise(function (resolve, reject) {
      if (!url) return reject(new Error('no url'));
      var im = new Image();
      im.decoding = 'async';
      im.referrerPolicy = 'no-referrer';
      im.onload = function () {
        if (im.naturalWidth < 8 || im.naturalHeight < 8) reject(new Error('too small'));
        else resolve(url);
      };
      im.onerror = function () { reject(new Error('load failed')); };
      im.src = url;
    });
  }

  function fromCommons(file, width) {
    var api = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*'
            + '&prop=imageinfo&iiprop=url&iiurlwidth=' + (width || 1600)
            + '&titles=' + encodeURIComponent('File:' + file);
    return getJSON(api).then(function (d) {
      var pages = d && d.query && d.query.pages;
      for (var k in pages) {
        var ii = pages[k].imageinfo;
        if (ii && ii[0]) return ii[0].thumburl || ii[0].url;
      }
      throw new Error('no imageinfo');
    });
  }

  function fromWikipedia(lang, title) {
    var api = 'https://' + lang + '.wikipedia.org/api/rest_v1/page/summary/'
            + encodeURIComponent(title.replace(/ /g, '_'));
    return getJSON(api).then(function (d) {
      var u = (d.originalimage && d.originalimage.source)
           || (d.thumbnail && d.thumbnail.source);
      if (!u) throw new Error('no image');
      return u.replace(/\/(\d+)px-/, '/1600px-');
    });
  }

  /* 記事名が作者の名前そのものなら、その記事の代表画像はこの作品ではなく、
     作者の顔か別の代表作である。額に他人の絵を入れないよう、ここで塞ぐ。 */
  function isArtistPage(m) {
    return !!(m.wiki && m.artist && m.wiki === m.artist);
  }

  function resolve(id, small) {
    var m = (manifest && manifest[id]) || {};

    // 著作権が生きている作品。外を探さない。自作の図にそのままゆだねる。
    if (m.noPhoto) return Promise.reject(new Error('noPhoto'));

    var key = id + (small ? '@s' : '');
    var chain = Promise.reject(new Error('start'));

    // 段1: 焼き込み済み
    if (small) {
      chain = chain.catch(function () { return tryImage(ROOT + 'assets/artworks/thumb/' + id + '.jpg'); });
    }
    chain = chain.catch(function () { return tryImage(ROOT + 'assets/artworks/' + id + '.jpg'); });

    // 段1.5: 前に外から取れたURLを覚えていれば試す
    var cached = cacheGet(key);
    if (cached) chain = chain.catch(function () { return tryImage(cached); });

    // 段2: Commons のファイル名
    if (m.commons) {
      chain = chain.catch(function () {
        return fromCommons(m.commons, small ? 800 : 1600).then(tryImage);
      });
    }
    // 段2の予備: Wikipedia の「作品の」記事
    if (m.wiki && !isArtistPage(m)) {
      var lang = m.wikiLang || 'ja';
      chain = chain.catch(function () { return fromWikipedia(lang, m.wiki).then(tryImage); });
      if (lang !== 'en' && m.wikiEn) {
        chain = chain.catch(function () { return fromWikipedia('en', m.wikiEn).then(tryImage); });
      }
    }
    return chain.then(function (url) { cacheSet(key, url); return url; });
  }

  /* ---------- 拡大して見る ────────────────────────────────
     暗い展示室の照明を、いったん一点に絞る。 */
  var viewer = null;
  function openViewer(url, label) {
    if (!viewer) {
      viewer = document.createElement('div');
      viewer.className = 'viewer';
      viewer.hidden = true;
      viewer.innerHTML = '<button class="viewer-close" aria-label="閉じる">×</button><img alt="">';
      document.body.appendChild(viewer);
      viewer.addEventListener('click', closeViewer);
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && !viewer.hidden) closeViewer();
      });
    }
    var img = viewer.querySelector('img');
    img.src = url;
    img.alt = label || '';
    viewer.hidden = false;
    document.body.classList.add('-viewing');
    viewer.querySelector('.viewer-close').focus();
  }
  function closeViewer() {
    if (!viewer) return;
    viewer.hidden = true;
    document.body.classList.remove('-viewing');
  }

  /* ---------- 図版1つを仕上げる ──────────────────────────── */
  function mount(fig) {
    var id = fig.dataset.art;
    if (!id) return;
    var box = fig.querySelector('.mount');
    if (!box) return;

    var small = fig.classList.contains('-card');
    box.classList.add('-loading');

    resolve(id, small).then(function (url) {
      var m = (manifest && manifest[id]) || {};
      var img = new Image();
      img.src = url;
      img.alt = fig.dataset.alt || [m.title, m.artist].filter(Boolean).join(' ／ ');
      img.loading = 'lazy';
      img.decoding = 'async';
      img.referrerPolicy = 'no-referrer';

      var svg = box.querySelector('svg.fallback');
      if (svg) svg.remove();
      box.insertBefore(img, box.firstChild);
      box.classList.remove('-loading');
      fig.classList.add('-real');

      // 一覧の札は、押すと作品のページへ行く。拡大するのは作品ページだけ。
      if (small) return;
      img.tabIndex = 0;
      img.setAttribute('role', 'button');
      img.setAttribute('aria-label', (m.title || '図版') + 'を拡大する');
      img.addEventListener('click', function () { openViewer(url, img.alt); });
      img.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openViewer(url, img.alt); }
      });
    }).catch(function () {
      // 三段目。ページに書かれた自作の図をそのまま見せる。
      box.classList.remove('-loading');
      fig.classList.add('-drawn');
    });
  }

  function start() {
    var figs = document.querySelectorAll('figure.plate[data-art]');
    if (!figs.length) return;
    Array.prototype.forEach.call(figs, mount);
  }

  getJSON(ROOT + 'data/manifest.json')
    .then(function (m) { manifest = m; })
    .catch(function () { manifest = {}; })   // 無くても焼き込みだけで動く
    .then(start);
})();
