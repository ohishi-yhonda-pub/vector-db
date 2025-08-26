# Vector Database API

Cloudflare Workers上で動作する、VectorizeとWorkers AIを活用したベクトルデータベースAPIです。

## 概要

このプロジェクトは、以下の技術を使用して構築されています：

- **Cloudflare Workers** - エッジコンピューティングプラットフォーム
- **Cloudflare Vectorize** - ベクトルデータベース
- **Cloudflare Workers AI** - AI推論エンジン
- **Cloudflare Workflows** - 非同期バッチ処理
- **Cloudflare Agents (Durable Objects)** - ステートフル処理
- **Cloudflare D1** - エッジSQLiteデータベース
- **Hono.js** - 軽量Webフレームワーク
- **Drizzle ORM** - 型安全なデータベース操作
- **Zod** - スキーマバリデーション
- **Notion API** - Notionワークスペース連携

## 主な機能

### 1. ベクトル操作
- ベクトルの作成・更新・削除
- 類似度検索
- バッチ操作
- 非同期処理によるスケーラビリティ

### 2. 埋め込み生成
- テキストから埋め込みベクトルを生成
- バッチ埋め込み生成
- 複数のAIモデルサポート（BGE、その他）
- ワークフローベースの非同期処理

### 3. ファイル処理
- PDF・画像ファイルのアップロード
- Gemma-3-12b-itを使用したマルチモーダル分析
- OCR機能による画像内テキスト抽出
- 自動ベクトル化とメタデータ保存

### 4. 検索機能
- ベクトル検索（コサイン類似度）
- セマンティック検索（自然言語クエリ）
- 類似ベクトル検索
- ネームスペースとメタデータによるフィルタリング

### 5. Notion連携
- Notionページの取得と同期
- ブロックコンテンツの階層的な抽出
- ページプロパティの処理
- 自動ベクトル化とインデックス作成
- キャッシュによる高速アクセス
- バルク同期による効率的な処理
- NotionManagerによる状態管理と同期ジョブ追跡

## Embeddings と Vectors の概念

### 処理フロー
1. **テキスト入力** → 2. **Embeddings生成** → 3. **Vectors保存/検索**

### Embeddings（埋め込み）
- **定義**: テキストや画像などの非構造化データを、機械が理解できる数値ベクトルに変換する処理
- **実装**: Workers AIのEmbeddingモデル（`@cf/baai/bge-base-en-v1.5`など）を使用
- **出力**: 固定次元の浮動小数点配列（例: 768次元のfloat32配列）
- **用途**: セマンティック（意味的）な類似性を数値化

### Vectors（ベクトル）
- **定義**: Embeddingsによって生成された数値配列データとその管理システム
- **保存先**: Cloudflare Vectorizeインデックス
- **機能**: 
  - ベクトル間の類似度計算（コサイン類似度など）
  - 高速な最近傍探索
  - メタデータとの関連付け
- **用途**: 類似コンテンツ検索、レコメンデーション、クラスタリング

### このプロジェクトでの実装
```
入力テキスト/画像
    ↓
AIEmbeddings (Durable Object)
    ├─ Workers AIモデル呼び出し
    └─ 埋め込みベクトル生成（768次元）
    ↓
VectorManager (Durable Object)
    ├─ ベクトルの前処理
    └─ メタデータ付与
    ↓
Vectorize Index
    ├─ ベクトル保存
    └─ 類似度検索の実行
```

## アーキテクチャ

### Agents (Durable Objects)
- **VectorManager**: ベクトル操作とファイル処理の状態管理
- **AIEmbeddings**: 埋め込み生成のジョブ管理
- **NotionManager**: Notion連携の状態管理、同期ジョブの追跡、統計情報の管理

### Workflows
- **BatchEmbeddingsWorkflow**: バッチ埋め込み生成
- **VectorOperationsWorkflow**: ベクトル作成・削除操作
- **FileProcessingWorkflow**: ファイル分析とベクトル化
- **NotionSyncWorkflow**: Notionページの同期とベクトル化

### データベース
- **D1 (SQLite)**: Notionデータのキャッシュと管理
- **Drizzle ORM**: 型安全なデータベース操作

## セットアップ

### 前提条件
- Node.js 18以上
- Cloudflareアカウント
- Wrangler CLI

### インストール
```bash
npm install
```

### 環境変数
`.dev.vars`ファイルを作成し、以下の環境変数を設定：

```bash
# AI Models
DEFAULT_EMBEDDING_MODEL=@cf/baai/bge-base-en-v1.5

# Text Generation Models
DEFAULT_TEXT_GENERATION_MODEL=@cf/google/gemma-3-12b-it

# Image Analysis Settings
IMAGE_ANALYSIS_PROMPT=Describe this image in detail. Include any text visible in the image.
IMAGE_ANALYSIS_MAX_TOKENS=512

# Text Extraction Settings
TEXT_EXTRACTION_MAX_TOKENS=1024

# Notion API
NOTION_API_KEY=your_notion_integration_token
```

### Vectorizeインデックスの作成
```bash
wrangler vectorize create vector-db-index --dimensions=768 --metric=cosine
```

### D1データベースの作成
```bash
wrangler d1 create vector-db
```

作成後、`wrangler.jsonc`の`database_id`を更新してください。

### 開発サーバーの起動
```bash
npm run dev
```

### デプロイ
```bash
npm run deploy
```

### 型定義の生成
```bash
npm run cf-typegen
```

## API エンドポイント

### ベクトル操作
- `POST /api/vectors` - ベクトルの作成
- `GET /api/vectors/:id` - ベクトルの取得
- `GET /api/vectors` - ベクトル一覧
- `DELETE /api/vectors/:id` - ベクトルの削除

### 埋め込み生成
- `POST /api/embeddings/generate` - 単一埋め込み生成
- `POST /api/embeddings/batch` - バッチ埋め込み生成
- `GET /api/embeddings/models` - 利用可能なモデル一覧

### ファイル処理
- `POST /api/files/upload` - ファイルアップロード（PDF/画像）
- `GET /api/files/status/:workflowId` - 処理ステータス確認

### 検索
- `POST /api/search/vectors` - ベクトル検索
- `POST /api/search/semantic` - セマンティック検索
- `POST /api/search/similar/:vectorId` - 類似ベクトル検索

### Notion連携
- `GET /api/notion/pages` - ページ一覧取得（Notion APIまたはキャッシュから）
- `GET /api/notion/pages/:pageId` - Notionページ取得
- `POST /api/notion/pages/:pageId/sync` - Notionページ同期（ブロック、プロパティを含む）
- `POST /api/notion/pages/bulk-sync` - 複数ページ一括同期（最大100ページ）
- `GET /api/notion/pages/:pageId/blocks` - ページ内ブロック取得

## 使用例

### テキストからベクトルを作成
```bash
curl -X POST http://localhost:8787/api/vectors \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Cloudflare Workersは素晴らしい",
    "namespace": "default",
    "metadata": {"category": "tech"}
  }'
```

### セマンティック検索
```bash
curl -X POST http://localhost:8787/api/search/semantic \
  -H "Content-Type: application/json" \
  -d '{
    "query": "エッジコンピューティングについて",
    "topK": 5,
    "namespace": "default"
  }'
```

### ファイルアップロード
```bash
curl -X POST http://localhost:8787/api/files/upload \
  -F "file=@document.pdf" \
  -F "namespace=documents" \
  -F 'metadata={"source": "manual"}'
```

### Notionページ一覧取得
```bash
# Notion APIから最新のページ一覧を取得
curl -X GET http://localhost:8787/api/notion/pages

# キャッシュからページ一覧を取得（高速）
curl -X GET http://localhost:8787/api/notion/pages?from_cache=true
```

### Notionページ同期
```bash
curl -X POST http://localhost:8787/api/notion/pages/{pageId}/sync \
  -H "Content-Type: application/json" \
  -d '{
    "includeBlocks": true,
    "includeProperties": true,
    "namespace": "notion"
  }'
```

### すべてのNotionページを一括同期
```bash
curl -X POST http://localhost:8787/api/notion/pages/bulk-sync \
  -H "Content-Type: application/json" \
  -d '{
    "includeBlocks": true,
    "includeProperties": true,
    "namespace": "notion",
    "maxPages": 50
  }'
```

### 特定のNotionページを取得
```bash
# Notion APIから最新データを取得
curl -X GET http://localhost:8787/api/notion/pages/{pageId}

# キャッシュから取得（高速）
curl -X GET http://localhost:8787/api/notion/pages/{pageId}?fromCache=true
```

## 注意事項

### Windows環境での開発
- ファイルパスは`/`を使用
- `ripgrep (rg)`を検索に使用
- Git Bash環境を推奨

### 制限事項
- Cloudflare Workersの制限（CPU時間、メモリ等）に準拠
- ファイルアップロードは10MBまで
- Vectorizeのインデックス設定（dimensions、metric）は作成後変更不可
- Notion API レート制限に準拠（3リクエスト/秒）

## アーキテクチャの詳細

### NotionManager (Durable Object)
NotionManagerは、Notion連携のすべての操作を統括する中央管理システムです：

- **同期ジョブ管理**: 各ページの同期状態を追跡
- **統計情報**: 同期済みページ数、失敗数、作成されたベクトル数など
- **設定管理**: デフォルトの同期設定、ネームスペース設定
- **キャッシュ制御**: D1データベースを使用した効率的なキャッシング

### データフロー
1. **ページ同期要求** → NotionManager → NotionSyncWorkflow
2. **Workflow実行** → Notion API → D1キャッシュ → VectorManager
3. **ベクトル作成** → Vectorizeインデックス
4. **検索時** → セマンティック検索 → Vectorize → 結果返却

## テスト・品質保証

### 100% ブランチカバレッジ達成 🎉

このプロジェクトは、**Zod-firstアプローチ**により全ワークフロー・APIルートで**100%ブランチカバレッジ**を達成しています：

#### 対象ファイル
- ✅ `src/workflows/notion-sync.ts`: 100% branches
- ✅ `src/workflows/vector-operations.ts`: 100% branches  
- ✅ `src/workflows/file-processing.ts`: 100% branches
- ✅ `src/routes/api/files/upload.ts`: 100% branches
- ✅ `src/routes/api/notion/list-pages.ts`: 100% branches

#### Zodベースの最適化技術
```typescript
// 1. safeParse()でtry-catchブロック削除
const result = schema.safeParse(data)
if (!result.success) { /* handle error */ }

// 2. discriminatedUnion で型安全な分岐
const PropertySchema = z.discriminatedUnion('type', [
  TitleSchema, RichTextSchema, SelectSchema
])

// 3. default()でdestructuring代入最適化
z.string().default('100').transform(val => parseInt(val))

// 4. ctx.addIssue() + z.NEVER でカスタムバリデーション
transform((val, ctx) => {
  try { return JSON.parse(val) } 
  catch { ctx.addIssue({...}); return z.NEVER }
})
```

#### テスト実行
```bash
# テスト実行
npm test

# カバレッジ確認
npm run test:coverage

# 特定ファイルのテスト
npm test tests/unit/workflows/notion-sync.test.ts
```

### 品質保証の方針
- **型安全性優先**: Zodスキーマによるランタイムバリデーション
- **保守性重視**: モック依存を最小化し、実用的なテストケース
- **エッジケース対応**: 実際の運用で発生する可能性のある例外処理
- **継続的品質向上**: CI/CDパイプラインでの自動テスト実行

## ライセンス

このプロジェクトはMITライセンスの下で公開されています。