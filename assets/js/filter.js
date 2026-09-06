/* =========================================================================
   作品一覧の絞り込み

   250点を一枚のページに置くので、探す手段がないと使えない。
   ただし**これが動かなくても全点は並んでいる。** 絞れなくなるだけである。
   だから札そのものは HTML に書き出してあり、ここでは表示を切り替えるだけ。
   ========================================================================= */
(function () {
  'use strict';

  var grid = document.getElementById('grid');
  var count = document.getElementById('count');
  if (!grid) return;

  var items = Array.prototype.slice.call(grid.children);
  var chips = Array.prototype.slice.call(document.querySelectorAll('.chip'));
  var search = document.querySelector('.search');

  var state = { movement: '', q: '' };

  function apply() {
    var q = state.q.trim().toLowerCase();
    var n = 0;
    items.forEach(function (li) {
      var ok = (!state.movement || li.dataset.movement === state.movement)
            && (!q || (li.dataset.key || '').indexOf(q) !== -1);
      li.hidden = !ok;
      if (ok) n++;
    });
    if (count) count.textContent = String(n);
  }

  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      var group = chip.dataset.filter;
      chips.forEach(function (c) {
        if (c.dataset.filter === group) c.setAttribute('aria-pressed', String(c === chip));
      });
      state[group] = chip.dataset.value;
      apply();
    });
  });

  if (search) {
    search.addEventListener('input', function () { state.q = search.value; apply(); });
  }
})();
