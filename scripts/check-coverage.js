#!/usr/bin/env node

import fs from 'fs';

/**
 * 保存されたカバレッジ情報を確認するスクリプト
 */

function checkCoverage() {
  if (!fs.existsSync('./coverage-tracker.json')) {
    console.log('❌ coverage-tracker.json が見つかりません。先に update-coverage.js を実行してください。');
    return null;
  }

  const tracker = JSON.parse(fs.readFileSync('./coverage-tracker.json', 'utf8'));
  
  console.log(`📊 最終更新: ${new Date(tracker.lastUpdated).toLocaleString('ja-JP')}`);
  console.log(`📈 全体カバレッジ: ${tracker.overallCoverage.statements.pct}% (${tracker.overallCoverage.statements.covered}/${tracker.overallCoverage.statements.total})`);
  
  console.log('\n📋 優先度順カテゴリ:');
  
  // 優先度順に表示
  tracker.priorityList.forEach((category, index) => {
    const cat = tracker.categories[category];
    if (cat) {
      const pct = parseFloat(cat.statements.pct);
      const status = pct < 25 ? '🔴' : pct < 50 ? '🟡' : pct < 75 ? '🟠' : '🟢';
      const priority = index < 2 ? '⭐' : index < 4 ? '⚡' : '';
      
      console.log(`${priority} ${status} ${category}: ${pct}% (${cat.statements.covered}/${cat.statements.total})`);
      
      // 低カバレッジの場合、ファイル詳細を表示
      if (pct < 50 && cat.files.length > 0) {
        console.log('   📁 低カバレッジファイル:');
        cat.files
          .filter(f => f.statementsTotal > 0)
          .sort((a, b) => (a.statementsHit / a.statementsTotal) - (b.statementsHit / b.statementsTotal))
          .slice(0, 3)
          .forEach(file => {
            const filePct = file.statementsTotal > 0 ? (file.statementsHit / file.statementsTotal * 100).toFixed(1) : 0;
            console.log(`      • ${file.file}: ${filePct}% (${file.statements})`);
          });
      }
    }
  });

  // 次の推奨アクション
  const nextCategory = tracker.priorityList.find(cat => {
    const catData = tracker.categories[cat];
    return catData && parseFloat(catData.statements.pct) < 90;
  });

  if (nextCategory) {
    const pct = parseFloat(tracker.categories[nextCategory].statements.pct);
    console.log(`\n🎯 次の推奨作業: ${nextCategory} (現在${pct}%)`);
  } else {
    console.log('\n🎉 全カテゴリ90%以上達成！');
  }

  return tracker;
}

// スクリプトとして実行された場合
checkCoverage();