#!/usr/bin/env node

import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';

/**
 * カバレッジ情報を取得・保存するスクリプト
 */

async function updateCoverage() {
  console.log('📊 カバレッジ情報を更新中...');

  try {
    // JSONレポート付きでテスト実行
    console.log('🧪 テスト実行中...');
    const result = execSync('yarn test --coverage --reporter=json --run', { 
      encoding: 'utf-8',
      cwd: process.cwd()
    });

    // カバレッジJSONを抽出（最後のJSON部分）
    const lines = result.split('\n');
    let coverageJson = null;
    
    // 最後の有効なJSONを見つける
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        if (lines[i].trim().startsWith('{') && lines[i].includes('coverage')) {
          coverageJson = JSON.parse(lines[i]);
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!coverageJson) {
      throw new Error('カバレッジJSONが見つかりません');
    }

    // カテゴリ別カバレッジを解析
    const categories = {};
    const coverageData = coverageJson.coverage || {};

    Object.keys(coverageData).forEach(file => {
      const fileCoverage = coverageData[file];
      let category = 'other';

      // ファイルパスからカテゴリを特定
      if (file.includes('/middleware/')) category = 'middleware';
      else if (file.includes('/routes/api/embeddings/')) category = 'routes/api/embeddings';
      else if (file.includes('/routes/api/search/')) category = 'routes/api/search';
      else if (file.includes('/routes/api/vectors/')) category = 'routes/api/vectors';
      else if (file.includes('/routes/api/notion/')) category = 'routes/api/notion';
      else if (file.includes('/routes/api/files/')) category = 'routes/api/files';
      else if (file.includes('/utils/')) category = 'utils';
      else if (file.includes('/workflows/')) category = 'workflows';
      else if (file.includes('/durable-objects/')) category = 'durable-objects';
      else if (file.includes('/services/')) category = 'services';
      else if (file.includes('/base/')) category = 'base';
      else if (file.includes('/schemas/')) category = 'schemas';

      if (!categories[category]) {
        categories[category] = {
          statements: { covered: 0, total: 0 },
          branches: { covered: 0, total: 0 },
          functions: { covered: 0, total: 0 },
          lines: { covered: 0, total: 0 },
          files: []
        };
      }

      // ファイル情報を追加
      categories[category].files.push({
        file: file.replace(process.cwd(), ''),
        statements: fileCoverage.s ? Object.values(fileCoverage.s).filter(v => v > 0).length + '/' + Object.keys(fileCoverage.s).length : '0/0',
        statementsHit: fileCoverage.s ? Object.values(fileCoverage.s).filter(v => v > 0).length : 0,
        statementsTotal: fileCoverage.s ? Object.keys(fileCoverage.s).length : 0
      });

      // カテゴリ合計に追加
      if (fileCoverage.s) {
        categories[category].statements.covered += Object.values(fileCoverage.s).filter(v => v > 0).length;
        categories[category].statements.total += Object.keys(fileCoverage.s).length;
      }
      if (fileCoverage.b) {
        categories[category].branches.covered += Object.values(fileCoverage.b).filter(b => b.some(v => v > 0)).length;
        categories[category].branches.total += Object.keys(fileCoverage.b).length;
      }
      if (fileCoverage.f) {
        categories[category].functions.covered += Object.values(fileCoverage.f).filter(v => v > 0).length;
        categories[category].functions.total += Object.keys(fileCoverage.f).length;
      }
    });

    // パーセンテージを計算
    Object.keys(categories).forEach(category => {
      const cat = categories[category];
      cat.statements.pct = cat.statements.total > 0 ? (cat.statements.covered / cat.statements.total * 100).toFixed(2) : 0;
      cat.branches.pct = cat.branches.total > 0 ? (cat.branches.covered / cat.branches.total * 100).toFixed(2) : 0;
      cat.functions.pct = cat.functions.total > 0 ? (cat.functions.covered / cat.functions.total * 100).toFixed(2) : 0;
      cat.lines.pct = cat.statements.pct; // 簡略化
    });

    // 全体カバレッジを計算
    const totalStatements = Object.values(categories).reduce((sum, cat) => sum + cat.statements.total, 0);
    const coveredStatements = Object.values(categories).reduce((sum, cat) => sum + cat.statements.covered, 0);
    const totalBranches = Object.values(categories).reduce((sum, cat) => sum + cat.branches.total, 0);
    const coveredBranches = Object.values(categories).reduce((sum, cat) => sum + cat.branches.covered, 0);
    const totalFunctions = Object.values(categories).reduce((sum, cat) => sum + cat.functions.total, 0);
    const coveredFunctions = Object.values(categories).reduce((sum, cat) => sum + cat.functions.covered, 0);

    // 既存のトラッカーファイルを読み込み
    let tracker = {
      priorityList: [
        "middleware",
        "routes/api/embeddings", 
        "utils",
        "workflows", 
        "routes/api/search",
        "routes/api/vectors",
        "routes/api/notion",
        "durable-objects",
        "routes/api/files",
        "services",
        "base"
      ]
    };
    
    if (fs.existsSync('./coverage-tracker.json')) {
      tracker = JSON.parse(fs.readFileSync('./coverage-tracker.json', 'utf8'));
    }

    // トラッカーファイルを更新
    tracker.lastUpdated = new Date().toISOString();
    tracker.overallCoverage = {
      statements: { 
        pct: totalStatements > 0 ? (coveredStatements / totalStatements * 100).toFixed(2) : 0,
        covered: coveredStatements, 
        total: totalStatements 
      },
      branches: { 
        pct: totalBranches > 0 ? (coveredBranches / totalBranches * 100).toFixed(2) : 0,
        covered: coveredBranches, 
        total: totalBranches 
      },
      functions: { 
        pct: totalFunctions > 0 ? (coveredFunctions / totalFunctions * 100).toFixed(2) : 0,
        covered: coveredFunctions, 
        total: totalFunctions 
      },
      lines: { 
        pct: totalStatements > 0 ? (coveredStatements / totalStatements * 100).toFixed(2) : 0,
        covered: coveredStatements, 
        total: totalStatements 
      }
    };
    tracker.categories = categories;

    // ファイルを保存
    fs.writeFileSync('./coverage-tracker.json', JSON.stringify(tracker, null, 2));

    console.log('✅ カバレッジ情報を更新しました');
    console.log(`📊 全体カバレッジ: ${tracker.overallCoverage.statements.pct}%`);
    
    // 優先度順に表示
    console.log('\n📋 カテゴリ別カバレッジ（優先度順）:');
    tracker.priorityList.forEach(category => {
      if (categories[category]) {
        const pct = categories[category].statements.pct;
        const status = pct < 25 ? '🔴' : pct < 50 ? '🟡' : pct < 75 ? '🟠' : '🟢';
        console.log(`${status} ${category}: ${pct}%`);
      }
    });

    return tracker;

  } catch (error) {
    console.error('❌ カバレッジ更新エラー:', error.message);
    process.exit(1);
  }
}

// スクリプトとして実行された場合
updateCoverage();