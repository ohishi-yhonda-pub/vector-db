const fs = require('fs');
const FormData = require('form-data');

async function uploadFile() {
  const form = new FormData();
  
  // ファイルを追加（UTF-8でファイル名を正しく送信）
  const fileStream = fs.createReadStream('ドラム式電気洗濯乾燥機.pdf');
  form.append('file', fileStream, {
    filename: 'ドラム式電気洗濯乾燥機.pdf',
    contentType: 'application/pdf'
  });
  
  form.append('namespace', 'node-test');
  form.append('metadata', JSON.stringify({
    source: 'manual',
    type: '取扱説明書'
  }));

  try {
    const response = await fetch('http://localhost:8787/api/files/upload', {
      method: 'POST',
      body: form,
      headers: form.getHeaders()
    });

    const result = await response.json();
    console.log('Response:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
}

uploadFile();