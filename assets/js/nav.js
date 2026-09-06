/* =========================================================================
   戻る

   作品ページは、作品一覧・年表・画家ページ・流派ページのどこからでも開かれる。
   だから行き先を一つに決め打ちできない。**来た場所へ戻す**のが正しい。

   ただし、検索やリンク共有で直接開かれることもある。その場合は履歴がないので、
   戻り先として書いてある href をそのまま使う。
   **これが動かなくても、ただのリンクとして機能する。**
   ========================================================================= */
(function () {
  'use strict';

  var back = document.querySelector('.back');
  if (!back) return;

  /* 同じサイトの中から来たときだけ、履歴を一つ戻す。
     外から来た場合に history.back() をすると、サイトの外へ出てしまう。 */
  var ref = document.referrer;
  var internal = false;
  try {
    internal = !!ref && new URL(ref).origin === location.origin && ref !== location.href;
  } catch (e) { internal = false; }

  if (!internal) return;   // href のまま。リンクとして働く

  var label = back.querySelector('.label');
  if (label) label.textContent = '戻る';

  back.addEventListener('click', function (e) {
    // 新しいタブで開こうとしている操作は邪魔しない
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    history.back();
  });
})();
