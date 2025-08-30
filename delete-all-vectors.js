#!/usr/bin/env node

// Vectorizeのすべてのベクトルを削除するスクリプト
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

async function deleteAllVectors() {
  try {
    console.log('Getting all vector IDs...');
    
    // すべてのベクトルIDを取得
    const { stdout } = await execPromise('npx wrangler vectorize list-vectors vector-db-index --count 1000 --json');
    const data = JSON.parse(stdout.split('...')[1]); // "Listing vectors..." の後のJSONを取得
    
    if (data.vectors && data.vectors.length > 0) {
      const ids = data.vectors.map(v => v.id);
      console.log(`Found ${ids.length} vectors to delete`);
      
      // IDをJSON形式で保存
      const fs = require('fs');
      const idsJson = JSON.stringify(ids);
      fs.writeFileSync('vector-ids.json', idsJson);
      
      // wrangler vectorize delete-vectors コマンドを実行
      console.log('Deleting vectors...');
      const deleteCommand = `npx wrangler vectorize delete-vectors vector-db-index --ids ${idsJson}`;
      
      try {
        const { stdout: deleteOutput } = await execPromise(deleteCommand);
        console.log('Delete result:', deleteOutput);
      } catch (error) {
        console.error('Delete error:', error.message);
      }
      
    } else {
      console.log('No vectors found to delete');
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

deleteAllVectors();