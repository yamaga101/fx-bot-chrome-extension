# FX Bot Chrome Extension v16.2

🤖 FXデモサイト用の4通貨ペア同時対応自動売買ツール

> ⚠️ **警告**: このツールはデモ環境専用です。本番取引には絶対に使用しないでください。

## 機能

- 🎯 **4通貨ペア同時対応**: USD/JPY, EUR/USD, AUD/JPY, GBP/JPY
- 🔄 **自動売買**: 両建て戦略による自動エントリー/決済
- 📊 **ステップアップベット**: 勝敗に応じたベット額調整
- ⚙️ **設定画面**: 通貨ペア、ベット額のカスタマイズ
- 🔔 **更新通知**: GitHub Releases経由の自動更新チェック

## インストール方法

### 開発者モードで読み込む

1. [Releases](https://github.com/yamaga101/fx-bot-chrome-extension/releases) から最新の `fx-bot-chrome-extension.zip` をダウンロード
2. ZIPを解凍
3. Chrome で `chrome://extensions` を開く
4. 右上の「デベロッパーモード」をON
5. 「パッケージ化されていない拡張機能を読み込む」をクリック
6. 解凍したフォルダを選択

### GitHubから直接クローン（開発用）

```bash
git clone https://github.com/yamaga101/fx-bot-chrome-extension.git
```

その後、上記の手順3-6を実行

## 使い方

1. 対象サイト（`https://vt-fx.gaikaex.com/...`）にアクセス
2. FX Bot パネルが右上に表示される
3. ウィンドウが自動で4つ起動
4. 「▶ 自動売買 ON」ボタンで開始

## 設定

拡張機能アイコンをクリック → 設定画面へ

- **通貨ペア**: 有効/無効の切り替え
- **ベットステップ**: 各ステップの取引数量
- **クールダウン**: 発注間隔（秒）
- **エクスポート/インポート**: 設定のバックアップ

## 更新方法

1. 設定画面で「更新を確認」をクリック
2. 新バージョンがあれば、ダウンロードリンクが表示される
3. ZIPをダウンロードして再読み込み

## 開発

```bash
# リポジトリをクローン
git clone https://github.com/yamaga101/fx-bot-chrome-extension.git
cd fx-bot-chrome-extension

# Chrome拡張として読み込んで開発
# chrome://extensions でフォルダを指定
```

## リリース

タグをプッシュすると GitHub Actions が自動でZIPを生成してリリース

```bash
git tag v16.2.1
git push origin v16.2.1
```

## ライセンス

MIT License

## 免責事項

このソフトウェアは教育・検証目的で提供されています。実際の金融取引での使用は自己責任で行ってください。開発者は一切の責任を負いません。
