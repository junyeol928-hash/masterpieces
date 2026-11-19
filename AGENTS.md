## 検証
- 生成と検査: `node tools/build.mjs` → `node tools/check.mjs`(CI と同じ。内部リンクと一覧)
- 表示の確認: `python -m http.server 8765` で開き、変更したページを 375px とデスクトップ幅でスクショする
- 終了前に上を実行し、失敗していたら直してから報告する
