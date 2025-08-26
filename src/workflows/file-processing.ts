import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from 'cloudflare:workers'
import { fileProcessingParamsSchema, type FileProcessingParams } from './schemas/workflow.schema'

export interface FileProcessingResult {
  type: 'pdf' | 'image'
  success: boolean
  content: {
    text?: string
    description?: string
    extractedText?: string
    extractedPages?: number
    metadata?: Record<string, any>
  }
  vectorIds: string[]
  error?: string
  completedAt: string
}

export class FileProcessingWorkflow extends WorkflowEntrypoint<Env, FileProcessingParams> {
  async run(event: WorkflowEvent<FileProcessingParams>, step: WorkflowStep): Promise<FileProcessingResult> {
    console.log('[FileProcessingWorkflow] Starting file processing workflow')
    const params = fileProcessingParamsSchema.parse(event.payload)
    console.log('[FileProcessingWorkflow] File info:', {
      fileName: params.fileName,
      fileType: params.fileType,
      fileSize: params.fileSize,
      namespace: params.namespace
    })
    
    // PDFも画像も同じ処理フローで統一
    if (params.fileType === 'application/pdf' || params.fileType.startsWith('image/')) {
      return await this.processFile(params, step)
    }
    
    throw new Error(`Unsupported file type: ${params.fileType}`)
  }

  private async processFile(
    params: FileProcessingParams,
    step: WorkflowStep
  ): Promise<FileProcessingResult> {
    try {
      console.log('[FileProcessingWorkflow.processFile] Starting file processing')
      const fileType = params.fileType === 'application/pdf' ? 'pdf' : 'image'
      console.log('[FileProcessingWorkflow.processFile] File type:', fileType)
      const fileBuffer = Uint8Array.from(atob(params.fileData), c => c.charCodeAt(0))
      console.log('[FileProcessingWorkflow.processFile] File buffer size:', fileBuffer.length)
      
      // Step 1: Gemma-3-12b-itを使用してファイルを分析
      const fileAnalysis = await step.do('analyze-file-with-ai', async () => {
        console.log('[FileProcessingWorkflow] Step 1: Analyzing file with AI')
        try {
          // ファイルサイズが大きすぎる場合はスキップ（2MB以上）
          if (params.fileSize > 2 * 1024 * 1024) {
            console.log('[FileProcessingWorkflow] File too large for AI analysis (>2MB), using simple extraction')
            const simpleText = `${params.fileName} - ${fileType} document (large file)`
            return {
              description: `Large ${fileType} file: ${params.fileName}`,
              extractedText: simpleText,
              topics: fileType,
              keywords: params.fileName.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' '),
              hasText: true
            }
          }

          // Base64エンコードしたPDFデータをGemmaに渡してテキスト抽出
          console.log('[FileProcessingWorkflow] Using AI model for text extraction:', this.env.DEFAULT_TEXT_GENERATION_MODEL)
          console.log('[FileProcessingWorkflow] Sending file data to Gemma, buffer length:', fileBuffer.length)
          
          // 大きなファイルでもスタックオーバーフローを避けるためチャンク処理
          let base64Data = ''
          const chunkSize = 8192
          for (let i = 0; i < fileBuffer.length; i += chunkSize) {
            const chunk = fileBuffer.slice(i, Math.min(i + chunkSize, fileBuffer.length))
            base64Data += btoa(String.fromCharCode(...chunk))
          }
          
          const result = await this.env.AI.run(
            this.env.DEFAULT_TEXT_GENERATION_MODEL as keyof AiModels,
            {
              messages: [
                {
                  role: 'system',
                  content: 'あなたはPDFや画像から重要な情報を抽出する専門家です。与えられたファイルの内容を分析し、主要な情報を日本語で要約してください。'
                },
                {
                  role: 'user',
                  content: `以下は${fileType === 'pdf' ? 'PDF' : '画像'}ファイルのBase64データです。このファイルの内容を分析して、重要な情報を抽出してください：\n\nファイル名: ${params.fileName}\nBase64データ: ${base64Data.substring(0, 1000)}...\n\nこのファイルから読み取れる主要な内容を日本語で説明してください。`
                }
              ],
              max_tokens: 512 // トークン数を増やして詳細な抽出を可能に
            }
          )
          
          console.log('[FileProcessingWorkflow] AI result type:', typeof result)
          console.log('[FileProcessingWorkflow] AI result:', JSON.stringify(result).substring(0, 200))
          const response = this.extractTextFromResult(result)
          console.log('[FileProcessingWorkflow] Extracted text length:', response?.length || 0)
          
          return {
            description: `${fileType} file: ${params.fileName}`,
            extractedText: response || params.fileName,
            topics: fileType,
            keywords: params.fileName.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' '),
            hasText: true
          }
        } catch (error) {
          console.error('[FileProcessingWorkflow] AI analysis failed:', error)
          console.error('[FileProcessingWorkflow] Error stack:', error instanceof Error ? error.stack : 'No stack')
          // エラー時はシンプルな抽出にフォールバック
          return {
            description: `${fileType} file: ${params.fileName}`,
            extractedText: params.fileName,
            topics: fileType,
            keywords: params.fileName.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' '),
            hasText: true
          }
        }
      })

      // Step 2: 分析結果をチャンクに分割（長いテキストの場合）
      const chunks = await step.do('prepare-content-chunks', async () => {
        console.log('[FileProcessingWorkflow] Step 2: Preparing content chunks')
        const contentParts: Array<{ text: string; type: string }> = []
        
        // 説明を追加
        if (fileAnalysis.description) {
          contentParts.push({
            text: fileAnalysis.description,
            type: 'description'
          })
        }
        
        // 抽出されたテキストをチャンク分割
        if (fileAnalysis.extractedText) {
          const chunkSize = 1000
          if (fileAnalysis.extractedText.length > chunkSize) {
            for (let i = 0; i < fileAnalysis.extractedText.length; i += chunkSize) {
              contentParts.push({
                text: fileAnalysis.extractedText.slice(i, i + chunkSize),
                type: 'extracted-text'
              })
            }
          } else {
            contentParts.push({
              text: fileAnalysis.extractedText,
              type: 'extracted-text'
            })
          }
        }
        
        // トピックとキーワードを追加
        if (fileAnalysis.topics || fileAnalysis.keywords) {
          contentParts.push({
            text: `Topics: ${fileAnalysis.topics}\nKeywords: ${fileAnalysis.keywords}`,
            type: 'metadata'
          })
        }
        
        console.log('[FileProcessingWorkflow] Created', contentParts.length, 'content chunks')
        return contentParts
      })

      // Step 3: 各チャンクをベクトル化
      const vectorIds = await step.do('vectorize-content', async () => {
        console.log('[FileProcessingWorkflow] Step 3: Vectorizing', chunks.length, 'chunks')
        const ids: string[] = []
        const timestamp = Date.now()
        
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i]
          // ファイル名をサニタイズしてIDの長さを制限（最大64バイト）
          const safeFileName = params.fileName
            .replace(/[^\x00-\x7F]/g, '') // ASCII以外を削除
            .replace(/[^a-zA-Z0-9._-]/g, '_') // 特殊文字を_に置換
            .substring(0, 10) // さらに短く制限
          // タイムスタンプも短縮
          const shortTimestamp = Date.now().toString(36)
          const vectorId = `${fileType.substring(0, 3)}_${safeFileName}_${i}_${shortTimestamp}`
          
          // Step 1: Generate embedding for the chunk text
          const embeddingWorkflowId = `embed_${vectorId}`
          console.log(`[FileProcessingWorkflow] Creating embedding workflow ${i+1}/${chunks.length}: ${embeddingWorkflowId}`)
          await this.env.EMBEDDINGS_WORKFLOW.create({
            id: embeddingWorkflowId,
            params: {
              text: chunk.text,
              model: this.env.DEFAULT_EMBEDDING_MODEL
            }
          })
          
          // Wait for embedding to complete
          const embeddingWorkflowInstance = await this.env.EMBEDDINGS_WORKFLOW.get(embeddingWorkflowId)
          
          // Poll for workflow completion
          let attempts = 0
          const maxAttempts = 30
          let embeddingResult = null
          console.log(`[FileProcessingWorkflow] Polling embedding workflow for chunk ${i+1}`)
          
          while (attempts < maxAttempts) {
            const statusResult = await embeddingWorkflowInstance.status()
            
            if (statusResult.status === 'complete' && statusResult.output) {
              console.log(`[FileProcessingWorkflow] Embedding completed for chunk ${i+1}`)
              embeddingResult = statusResult.output
              break
            } else if (statusResult.status === 'errored') {
              console.error(`[FileProcessingWorkflow] Embedding workflow failed for chunk ${i+1}: ${statusResult.error}`)
              break
            }
            
            await new Promise(resolve => setTimeout(resolve, 1000))
            attempts++
          }
          
          if (!embeddingResult || !embeddingResult.success || !embeddingResult.embedding) {
            console.error(`[FileProcessingWorkflow] Failed to generate embedding for chunk ${i+1}: ${embeddingResult?.error || 'Timeout'}`)
            continue // Skip this chunk if embedding fails
          }
          console.log(`[FileProcessingWorkflow] Embedding generated for chunk ${i+1}, vector dims:`, embeddingResult.embedding?.length)
          
          // Step 2: Save vector with embedding
          console.log(`[FileProcessingWorkflow] Saving vector ${i+1}/${chunks.length}: ${vectorId}`)
          await this.env.VECTOR_OPERATIONS_WORKFLOW.create({
            id: vectorId,
            params: {
              type: 'create',
              embedding: embeddingResult.embedding,
              vectorId,
              namespace: params.namespace || `${fileType}-uploads`,
              metadata: {
                ...params.metadata,
                sourceType: fileType,
                fileName: params.fileName,
                fileType: params.fileType,
                contentType: chunk.type,
                chunkIndex: i,
                totalChunks: chunks.length,
                hasExtractedText: fileAnalysis.hasText,
                text: chunk.text,  // Store original text in metadata
                model: embeddingResult.model,
                analyzedAt: new Date().toISOString()
              }
            }
          })
          
          // Wait for vector save to complete
          const vectorWorkflowInstance = await this.env.VECTOR_OPERATIONS_WORKFLOW.get(vectorId)
          attempts = 0
          let vectorSaveResult = null
          
          while (attempts < maxAttempts) {
            const statusResult = await vectorWorkflowInstance.status()
            
            if (statusResult.status === 'complete' && statusResult.output) {
              console.log(`[FileProcessingWorkflow] Vector saved for chunk ${i+1}`)
              vectorSaveResult = statusResult.output
              break
            } else if (statusResult.status === 'errored') {
              console.error(`[FileProcessingWorkflow] Vector save failed for chunk ${i+1}: ${statusResult.error}`)
              break
            }
            
            await new Promise(resolve => setTimeout(resolve, 1000))
            attempts++
          }
          
          if (vectorSaveResult && vectorSaveResult.success) {
            console.log(`[FileProcessingWorkflow] Successfully saved vector for chunk ${i+1}`)
            ids.push(vectorId)
          } else {
            console.error(`[FileProcessingWorkflow] Failed to save vector for chunk ${i+1}`)
          }
        }
        
        console.log(`[FileProcessingWorkflow] Vectorization complete. Saved ${ids.length} vectors`)
        return ids
      })

      console.log('[FileProcessingWorkflow] File processing completed successfully')
      console.log('[FileProcessingWorkflow] Total vectors created:', vectorIds.length)
      return {
        type: fileType as 'pdf' | 'image',
        success: true,
        content: {
          text: fileAnalysis.extractedText,
          description: fileAnalysis.description,
          metadata: {
            fileName: params.fileName,
            fileType: params.fileType,
            fileSize: params.fileSize,
            hasExtractedText: fileAnalysis.hasText,
            topics: fileAnalysis.topics,
            keywords: fileAnalysis.keywords
          }
        },
        vectorIds,
        completedAt: new Date().toISOString()
      }
    } catch (error) {
      console.error('[FileProcessingWorkflow] File processing failed:', error)
      console.error('[FileProcessingWorkflow] Error details:', error instanceof Error ? error.stack : 'No stack')
      const fileType = params.fileType === 'application/pdf' ? 'pdf' : 'image'
      return {
        type: fileType as 'pdf' | 'image',
        success: false,
        content: {},
        vectorIds: [],
        error: error instanceof Error ? error.message : 'File processing failed',
        completedAt: new Date().toISOString()
      }
    }
  }

  private extractTextFromResult(result: any): string {
    // AI結果からテキストを抽出する汎用メソッド
    if (!result) return ''
    
    // テキストが直接返される場合
    if (typeof result === 'string') {
      return result
    }
    
    // オブジェクトとして返される場合
    if (typeof result === 'object') {
      // response フィールドがある場合（Gemmaなど）
      if ('response' in result && typeof result.response === 'string') {
        return result.response
      }
      
      // text フィールドがある場合
      if ('text' in result && typeof result.text === 'string') {
        return result.text
      }
      
      // description フィールドがある場合（Visionモデル）
      if ('description' in result && typeof result.description === 'string') {
        return result.description
      }
      
      // generated_text フィールドがある場合
      if ('generated_text' in result && typeof result.generated_text === 'string') {
        return result.generated_text
      }
      
      // result フィールドがある場合
      if ('result' in result && typeof result.result === 'string') {
        return result.result
      }
    }
    
    return ''
  }

  private parseAnalysisResponse(response: string): {
    description?: string
    extractedText?: string
    topics?: string
    keywords?: string
  } {
    const sections: any = {}
    
    // 各セクションを抽出
    const descMatch = response.match(/DESCRIPTION:\s*([\s\S]*?)(?=EXTRACTED_TEXT:|TOPICS:|KEYWORDS:|$)/i)
    const textMatch = response.match(/EXTRACTED_TEXT:\s*([\s\S]*?)(?=DESCRIPTION:|TOPICS:|KEYWORDS:|$)/i)
    const topicsMatch = response.match(/TOPICS:\s*([\s\S]*?)(?=DESCRIPTION:|EXTRACTED_TEXT:|KEYWORDS:|$)/i)
    const keywordsMatch = response.match(/KEYWORDS:\s*([\s\S]*?)(?=DESCRIPTION:|EXTRACTED_TEXT:|TOPICS:|$)/i)
    
    if (descMatch) sections.description = descMatch[1].trim()
    if (textMatch) sections.extractedText = textMatch[1].trim()
    if (topicsMatch) sections.topics = topicsMatch[1].trim()
    if (keywordsMatch) sections.keywords = keywordsMatch[1].trim()
    
    // セクションが見つからない場合は全体をdescriptionとして扱う
    if (Object.keys(sections).length === 0) {
      sections.description = response
    }
    
    return sections
  }
}