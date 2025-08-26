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
    const params = fileProcessingParamsSchema.parse(event.payload)
    
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
      const fileType = params.fileType === 'application/pdf' ? 'pdf' : 'image'
      const fileBuffer = Uint8Array.from(atob(params.fileData), c => c.charCodeAt(0))
      
      // Step 1: Gemma-3-12b-itを使用してファイルを分析
      const fileAnalysis = await step.do('analyze-file-with-gemma', async () => {
        try {
          // マルチモーダル入力でファイルを分析
          const result = await this.env.AI.run(
            this.env.DEFAULT_TEXT_GENERATION_MODEL as keyof AiModels,
            {
              messages: [
                {
                  role: 'user',
                  content: [
                    {
                      type: 'image',
                      image: [...fileBuffer]
                    },
                    {
                      type: 'text',
                      text: `Analyze this ${fileType} file and provide:
1. A detailed description of all content
2. Extract ALL text visible in the file (transcribe exactly)
3. Identify key topics and themes
4. Generate searchable keywords

Format your response as:
DESCRIPTION: [detailed description]
EXTRACTED_TEXT: [all visible text]
TOPICS: [main topics]
KEYWORDS: [searchable keywords]`
                    }
                  ]
                }
              ],
              max_tokens: parseInt(this.env.TEXT_EXTRACTION_MAX_TOKENS) * 2
            }
          )
          
          const response = this.extractTextFromResult(result)
          
          // レスポンスをパース
          const sections = this.parseAnalysisResponse(response)
          
          return {
            description: sections.description || `${fileType} file: ${params.fileName}`,
            extractedText: sections.extractedText || '',
            topics: sections.topics || '',
            keywords: sections.keywords || '',
            hasText: (sections.extractedText || '').length > 0
          }
        } catch (error) {
          console.error('Gemma analysis failed:', error)
          return {
            description: `${fileType} file: ${params.fileName}`,
            extractedText: '',
            topics: '',
            keywords: '',
            hasText: false
          }
        }
      })

      // Step 2: 分析結果をチャンクに分割（長いテキストの場合）
      const chunks = await step.do('prepare-content-chunks', async () => {
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
        
        return contentParts
      })

      // Step 3: 各チャンクをベクトル化
      const vectorIds = await step.do('vectorize-content', async () => {
        const ids: string[] = []
        const timestamp = Date.now()
        
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i]
          const vectorId = `${fileType}_${params.fileName}_${chunk.type}_${i}_${timestamp}`
          
          // Step 1: Generate embedding for the chunk text
          const embeddingWorkflow = await this.env.EMBEDDINGS_WORKFLOW.create({
            id: `embed_${vectorId}`,
            params: {
              text: chunk.text,
              model: this.env.DEFAULT_EMBEDDING_MODEL
            }
          })
          
          // Wait for embedding to complete
          const embeddingResult = await embeddingWorkflow.get()
          
          if (!embeddingResult.success || !embeddingResult.embedding) {
            console.error(`Failed to generate embedding for chunk ${i}: ${embeddingResult.error}`)
            continue // Skip this chunk if embedding fails
          }
          
          // Step 2: Save vector with embedding
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
          
          ids.push(vectorId)
        }
        
        return ids
      })

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