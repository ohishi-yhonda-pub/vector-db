# Vector DB 簡略化設計書

## 現状の問題点
- **87個のソースファイル** - 過度に細分化されている
- **11層のディレクトリ構造** - ナビゲーションが困難
- **1000+のテストケース** - メンテナンスコストが高い
- **重複した抽象化** - Services, Durable Objects, Workflows が役割重複

## 新設計の方針

### 設計原則
1. **KISS (Keep It Simple, Stupid)** - シンプルさを最優先
2. **YAGNI (You Aren't Gonna Need It)** - 必要になるまで作らない
3. **DRY (Don't Repeat Yourself)** - 重複を避ける
4. **フラット構造** - 深いネストを避ける

### ファイル構成（7ファイルのみ）

```
src/
├── index.ts          # メインエントリーポイント & ルーティング
├── embeddings.ts     # 埋め込み生成機能
├── vectors.ts        # ベクトル操作（CRUD + 検索）
├── storage.ts        # ストレージ層（Vectorize, Durable Objects）
├── types.ts          # 型定義とスキーマ
├── utils.ts          # 共通ユーティリティ
└── config.ts         # 設定と定数

wrangler.toml         # Cloudflare設定（.jsonc → .toml）
```

## モジュール詳細設計

### 1. index.ts（~200行）
```typescript
// Honoアプリケーション設定とルーティング
import { Hono } from 'hono'
import { OpenAPIHono } from '@hono/zod-openapi'

const app = new OpenAPIHono<{ Bindings: Env }>()

// ミドルウェア
app.use('*', cors())
app.use('*', authMiddleware)

// ルート定義（直接記述、別ファイルに分けない）
app.post('/embeddings', generateEmbedding)
app.post('/embeddings/batch', batchEmbedding)
app.post('/vectors', createVector)
app.get('/vectors/:id', getVector)
app.delete('/vectors/:id', deleteVector)
app.post('/search', searchVectors)

export default app
```

### 2. embeddings.ts（~150行）
```typescript
// 埋め込み生成ロジック
export async function generateEmbedding(c: Context) {
  const { text, model } = await c.req.json()
  const ai = c.env.AI
  
  const result = await ai.run(model || '@cf/baai/bge-base-en-v1.5', {
    text: [text]
  })
  
  return c.json({ embedding: result.data[0] })
}

export async function batchEmbedding(c: Context) {
  // バッチ処理（Workflowは使わない、直接処理）
}
```

### 3. vectors.ts（~200行）
```typescript
// ベクトルCRUD操作
export async function createVector(c: Context) {
  const index = c.env.VECTORIZE_INDEX
  const { id, values, metadata } = await c.req.json()
  
  await index.insert([{ id, values, metadata }])
  return c.json({ success: true, id })
}

export async function searchVectors(c: Context) {
  const index = c.env.VECTORIZE_INDEX
  const { query, topK = 10 } = await c.req.json()
  
  const results = await index.query(query, { topK })
  return c.json({ matches: results.matches })
}
```

### 4. storage.ts（~100行）
```typescript
// ストレージ抽象化（必要最小限）
export class VectorStore {
  constructor(private index: VectorizeIndex) {}
  
  async upsert(vectors: Vector[]) {
    return this.index.upsert(vectors)
  }
  
  async search(query: number[], limit: number) {
    return this.index.query(query, { topK: limit })
  }
}

// Durable Objectsは使わない（複雑さの原因）
```

### 5. types.ts（~100行）
```typescript
// 型定義（Zodスキーマ統合）
import { z } from 'zod'

export const VectorSchema = z.object({
  id: z.string(),
  values: z.array(z.number()),
  metadata: z.record(z.any()).optional()
})

export const EmbeddingRequestSchema = z.object({
  text: z.string(),
  model: z.string().optional()
})

export type Vector = z.infer<typeof VectorSchema>
export type EmbeddingRequest = z.infer<typeof EmbeddingRequestSchema>
```

### 6. utils.ts（~100行）
```typescript
// 共通ユーティリティ
export function createResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

export function handleError(error: unknown) {
  console.error(error)
  return createResponse({ error: 'Internal Server Error' }, 500)
}

// 認証ミドルウェア
export async function authMiddleware(c: Context, next: Next) {
  const apiKey = c.req.header('X-API-Key')
  if (apiKey !== c.env.API_KEY) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  await next()
}
```

### 7. config.ts（~50行）
```typescript
// 設定値
export const CONFIG = {
  DEFAULT_MODEL: '@cf/baai/bge-base-en-v1.5',
  MAX_BATCH_SIZE: 100,
  VECTOR_DIMENSIONS: 768,
  SEARCH_LIMIT: 100
}
```

## 削除する機能

### 完全削除
- **Durable Objects** - 不要な複雑さ
- **Workflows** - 単純な非同期処理で十分
- **Services層** - 薄いラッパーで価値なし
- **Notion連携** - コア機能ではない
- **ファイルアップロード** - コア機能ではない

### 統合・簡略化
- **全スキーマ** → types.ts に統合
- **全ミドルウェア** → index.ts に統合（30行程度）
- **エラーハンドリング** → utils.ts に統合（20行程度）
- **レスポンスビルダー** → utils.ts に統合（10行程度）

## テスト戦略

### テストファイル（5ファイルのみ）
```
tests/
├── embeddings.test.ts  # 10-15テスト
├── vectors.test.ts     # 10-15テスト
├── search.test.ts      # 5-10テスト
├── utils.test.ts       # 5-10テスト
└── integration.test.ts # 5-10テスト

合計: 35-60テスト（現在の1000+から大幅削減）
```

## 移行計画

### Phase 1: 基本構造（Day 1）
1. 新しい7ファイル構造を作成
2. 基本的なCRUD機能を実装
3. 埋め込み生成を実装

### Phase 2: 機能統合（Day 2）
1. 検索機能を実装
2. バッチ処理を実装
3. エラーハンドリングを統合

### Phase 3: テスト（Day 3）
1. 基本的なテストを作成（50個程度）
2. 統合テストを作成
3. カバレッジ確認（目標: 80%）

### Phase 4: クリーンアップ（Day 4）
1. 古いコードを削除
2. ドキュメント更新
3. デプロイ設定更新

## 期待される成果

### 定量的改善
- **ファイル数**: 87 → 7（92%削減）
- **コード行数**: ~10,000行 → ~1,000行（90%削減）
- **テスト数**: 1000+ → 50（95%削減）
- **ビルド時間**: 30秒 → 5秒（83%削減）

### 定性的改善
- **理解容易性**: 新規開発者が1時間で全体を理解可能
- **デバッグ**: 問題箇所の特定が簡単
- **変更容易性**: 機能追加・変更が素早く実施可能
- **保守性**: 依存関係がシンプルで更新が容易

## リスクと対策

### リスク
1. **機能の欠落** - 重要な機能を見落とす可能性
   - 対策: 現在のAPIテストを実行して確認

2. **パフォーマンス低下** - 最適化の喪失
   - 対策: ベンチマークテストで確認

3. **後方互換性** - 既存APIとの互換性
   - 対策: APIインターフェースは維持

## 決定事項

1. **Durable Objectsは使わない** - Vectorizeで十分
2. **Workflowsは使わない** - 単純な非同期処理で対応
3. **OpenAPIは最小限** - 必要な部分のみ使用
4. **テストは実用的なレベル** - 100%カバレッジは目指さない
5. **YAMLではなくTOML** - wrangler.tomlを使用

## 成功基準

- [ ] 全APIエンドポイントが動作する
- [ ] テストが全て通る（50個程度）
- [ ] コードカバレッジ80%以上
- [ ] ビルド時間5秒以内
- [ ] デプロイ可能な状態

---

作成日: 2025-09-02
作成者: Claude
バージョン: 1.0