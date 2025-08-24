# Claude 設定

## プロジェクト概要
Cloudflare Workers上でHono.jsを使用し、VectorizeとWorkers AIを活用したベクトルデータベースプロジェクトです。

## 主要コマンド
```bash
# 依存関係のインストール
yarn install

# 開発サーバーの起動
yarn dev

# Cloudflareへのデプロイ
yarn deploy

# ビルド
yarn build

# テストの実行
yarn test

# リント
yarn lint

# 型チェック
yarn typecheck
```

## Wrangler コマンド
```bash
# ローカル開発
wrangler dev

# デプロイ
wrangler deploy

# ログの確認
wrangler tail

# Vectorizeインデックスの作成
wrangler vectorize create <index-name> --dimensions=<dimensions>

# Vectorizeインデックスの一覧
wrangler vectorize list
```

## プロジェクト構造
- `src/` - ソースコード
  - `index.ts` - Honoアプリケーションのエントリーポイント
  - `routes/` - APIルート
    - `api/` - API関連のルート
      - `vectors.ts` - ベクトル操作エンドポイント
      - `search.ts` - 検索エンドポイント
  - `schemas/` - Zodスキーマ定義
  - `services/` - ビジネスロジック
  - `types/` - TypeScript型定義
- `wrangler.jsonc` - Wrangler設定ファイル
- `tests/` - テストファイル
- `dist/` - ビルド出力

## 開発ガイドライン
- Hono.jsのベストプラクティスに従う
- TypeScriptを使用して型安全性を確保
- Workers AIとVectorizeのAPIを適切に使用
- エラーハンドリングを徹底する
- 新機能にはテストを書く

## 重要な注意事項
- Cloudflare Workersの制限事項を考慮する（CPU時間、メモリ等）
- Vectorizeのインデックス設定（dimensions、metric等）を適切に管理
- Workers AIのモデル選択と使用量に注意
- 型はworker-configuration.d.tsを使用して、必要に応じてwrangler typesで更新
- @cloudflare/workers-typesは使用せず、wrangler typesで生成される型定義を使用
- 環境変数の型定義は`worker-configuration.d.ts`の`Env`インターフェースを使用
- 環境変数とシークレットは`wrangler.jsonc`または`.dev.vars`で管理
- durable object を使用し、vectorizeのクライアントを使用することでパフォーマンス向上
- キャッシュは使用しない
- KVやR2などの他のCloudflareサービスとの連携も考慮

## Windows環境での注意事項
- ファイル検索時は`find`や`grep`コマンドの代わりに`ripgrep (rg)`を使用する
- Windowsでは`find`コマンドがUNIX系と異なる動作をするため避ける
- パスの区切り文字は`\`ではなく`/`を使用するか、適切にエスケープする
- ファイルパスにスペースが含まれる場合は必ずダブルクォートで囲む
- ファイル/ディレクトリの削除は`rm -rf`コマンドを使用（Git Bash環境で動作）
- Windowsネイティブコマンドの`rmdir`や`del`は避ける
- windowsなので、削除コマンドを適切に実施する

## 環境変数
- `VECTORIZE_INDEX` - Vectorizeインデックス名
- `AI_MODEL` - 使用するWorkers AIモデル
- その他必要な環境変数は`.dev.vars`に記載

## 型定義に関するメモ
- worker-configuration.d.tsは変更せず、wrangler typesで更新する
- 型定義をそれぞれ使うのではなく、zodを使ってtype生成

## ルーティングに関するメモ
- routeはpath毎にfolder,fileを作成し、index.tsにて各ファイルへroute
- ルーティングはHonoのrouterを使用し、各routeファイルでエンドポイントを定義
- 各routeファイルはエクスポートを使用して、ルートハンドラーをエクスポートする

## ネーミング規則に関するメモ
- file名にdurable-object入れるより、folder使って