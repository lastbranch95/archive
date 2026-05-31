# Archive

Archive は、iPhone写真アプリの「非表示」に溜まっている参考画像・スクショ・漫画・作品情報を整理するためのローカルアプリです。

目的は、単なる保存ではなく「再発見・再利用」です。

## 方針

- 完全ローカル
- IndexedDB保存
- クラウドなし
- Supabaseなし
- 起動時PIN必須
- JSON Export / Import対応
- 論理削除対応

## 初期PIN

```txt
0908
```

※ `app.js` の `DEFAULT_PIN` で変更できます。

## 初期構成

```txt
archive/
├─ index.html
├─ style.css
├─ app.js
├─ manifest.webmanifest
├─ README.md
└─ .gitignore
```

## v0.1 実装済み

- PINロック
- 画像登録
- 一覧表示
- 詳細表示
- 検索
- タグ
- カテゴリ
- お気に入り
- NSFWフラグ
- 論理削除 / 復元
- JSON Export
- JSON Import

## Git初期化

```bash
git init
git add .
git commit -m "Initial commit"
```

## 今後のブランチ例

```bash
git checkout -b feature/pin-lock
git checkout -b feature/image-save
git checkout -b feature/json-backup
```
