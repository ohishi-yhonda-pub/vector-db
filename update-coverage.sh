#!/bin/bash

echo "📊 カバレッジ情報を更新中..."

# テスト実行してカバレッジ取得
yarn test --coverage --run > coverage-raw.txt 2>&1

echo "✅ カバレッジファイル生成完了"

# カバレッジテーブル部分を抽出
echo "📋 カバレッジ分析結果 ($(date '+%Y-%m-%d %H:%M:%S'))"
echo "============================================"

# カバレッジテーブル部分を抽出して優先度順に並べて表示
grep -A 50 "% Stmts" coverage-raw.txt | grep -E "(middleware|routes/api/embeddings|utils|workflows|routes/api/search|routes/api/vectors|routes/api/notion|durable-objects|routes/api/files|services|base)" | head -20

echo ""
echo "🎯 次は計画に従って middleware → embeddings → utils → workflows の順で対応"
echo "💾 最新のカバレッジ情報を確認するには: grep -A 30 '% Stmts' coverage-raw.txt"