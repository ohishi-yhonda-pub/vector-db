export class FileProcessor {
  /**
   * ファイル名の文字化けを修正
   */
  static decodeFileName(fileName: string): string {
    console.log('Original filename:', fileName)
    console.log('Filename char codes:', Array.from(fileName).map(c => c.charCodeAt(0)))
    
    try {
      // Latin-1として解釈された文字を元のバイト列に戻す
      const originalBytes = new Uint8Array(fileName.length)
      for (let i = 0; i < fileName.length; i++) {
        originalBytes[i] = fileName.charCodeAt(i)
      }
      
      // UTF-8としてデコードし直す
      const decoder = new TextDecoder('utf-8')
      const decodedName = decoder.decode(originalBytes)
      console.log('Decoded filename:', decodedName)
      
      // 正常にデコードできたか確認（日本語文字が含まれているか）
      if (/[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/.test(decodedName)) {
        console.log('Using decoded filename:', decodedName)
        return decodedName
      } else {
        console.log('No Japanese characters found in decoded name')
        return fileName
      }
    } catch (error) {
      // デコードに失敗した場合は元のファイル名を使用
      console.log('Failed to decode filename, using original:', fileName, error)
      return fileName
    }
  }

  /**
   * ファイルをBase64エンコード
   */
  static async encodeFileToBase64(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer()
    const uint8Array = new Uint8Array(arrayBuffer)
    
    // バイナリ文字列を作成（チャンクごとに処理）
    const chunkSize = 8192
    let binaryString = ''
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.slice(i, Math.min(i + chunkSize, uint8Array.length))
      binaryString += String.fromCharCode(...chunk)
    }
    
    // 全体を一度にBase64エンコード
    return btoa(binaryString)
  }

  /**
   * ファイル処理をVectorManagerに依頼
   */
  static async processWithVectorManager(
    env: Env,
    fileData: string,
    fileName: string,
    fileType: string,
    fileSize: number,
    namespace?: string,
    metadata?: any
  ): Promise<any> {
    const vectorManagerId = env.VECTOR_CACHE.idFromName('global')
    const vectorManager = env.VECTOR_CACHE.get(vectorManagerId)
    
    return await vectorManager.processFileAsync(
      fileData,
      fileName,
      fileType,
      fileSize,
      namespace,
      metadata
    )
  }

  /**
   * リクエストヘッダーをログ出力
   */
  static logRequestHeaders(headers: Record<string, string | undefined>): void {
    console.log('Request headers:', {
      'content-type': headers['content-type'],
      'content-length': headers['content-length'],
      'accept-charset': headers['accept-charset']
    })
  }

  /**
   * ファイル情報をログ出力
   */
  static logFileInfo(file: File): void {
    console.log('File object:', {
      name: file.name,
      type: file.type,
      size: file.size,
      lastModified: file.lastModified,
      constructor: file.constructor.name
    })
  }
}