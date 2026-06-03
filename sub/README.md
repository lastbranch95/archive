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

## v0.5 実装済み

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
- 詳細画面から画像保存
- 漫画グループ化
- 漫画グループの縦スクロールビューア

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


## v0.5 追加機能

### 画像保存

詳細画面の「画像を保存」から、Archive内に保存されている画像をファイルとして再取得できます。

### 漫画グループ

画像登録時または詳細編集時に「漫画グループ名」と「ページ番号」を入れると、同じグループ名の画像をまとめられます。

漫画グループ欄から開くと、縦スクロール型ビューアでページ順に読めます。

ページ番号が未入力の画像は、ページ番号付き画像の後ろに保存順で並びます。


## v0.5.10 追加・整理

- 漫画ビューアの横読み / 縦読み切替
- 横読み時の上下スワイプ抑止
- 横読み下部ボタンの左右同サイズ化
- 最終ページで「次へ」を「閉じる」に変更
- 縦読み時のヘッダー固定解除
- 縦読み最後の閉じるボタン
- 前回途中まで読んだ漫画の再開確認
- 右綴じ / 左綴じ切替
- グループ管理
  - グループ名変更
  - 表紙変更
  - Private一括切替
  - タグ一括追加
  - ページ番号振り直し
  - ページ順変更
  - グループ削除
- グループ詳細
  - ページ数
  - 推定容量
  - 登録日 / 最終更新日
  - Private枚数 / お気に入り枚数
  - タグ一覧
  - グループメモ
