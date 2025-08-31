/**
 * ファイル解析ワークフロー
 * FileProcessingWorkflowから分離したファイル解析機能
 */

import { WorkflowStep } from 'cloudflare:workers'
import { BaseWorkflow } from '../base/workflow'
import { AppError, ErrorCodes } from '../utils/error-handler'

/**
 * ファイル解析パラメータ
 */
export interface FileAnalysisParams {
  fileName: string
  fileType: string
  fileSize: number
  fileData: string
  namespace?: string
  metadata?: Record<string, any>
}

/**
 * ファイル解析結果
 */
export interface FileAnalysisResult {
  description: string
  extractedText: string
  topics?: string
  keywords?: string
  hasText: boolean
  metadata?: Record<string, any>
}

/**
 * ファイル解析ワークフロー
 */
export class FileAnalyzer extends BaseWorkflow<FileAnalysisParams, FileAnalysisResult> {
  private readonly MAX_FILE_SIZE = 2 * 1024 * 1024 // 2MB
  private readonly CHUNK_SIZE = 8192

  /**
   * ワークフロー実行
   */
  protected async execute(
    params: FileAnalysisParams,
    step: WorkflowStep
  ): Promise<FileAnalysisResult> {
    this.logger.info('Starting file analysis', {
      fileName: params.fileName,
      fileType: params.fileType,
      fileSize: params.fileSize
    })

    // ファイルタイプの検証
    const fileType = this.getFileType(params.fileType)
    if (!fileType) {
      throw new AppError(
        ErrorCodes.VALIDATION_ERROR,
        `Unsupported file type: ${params.fileType}`,
        400
      )
    }

    // ファイル解析を実行
    return await this.executeStep(
      step,
      'analyze-file',
      () => this.analyzeFile(params, fileType),
      { retry: true }
    ).then(result => {
      if (!result.success) {
        throw new AppError(
          ErrorCodes.WORKFLOW_ERROR,
          `File analysis failed: ${result.error}`,
          500
        )
      }
      return result.data!
    })
  }

  /**
   * ファイルタイプを判定
   */
  private getFileType(mimeType: string): 'pdf' | 'image' | null {
    if (mimeType === 'application/pdf') {
      return 'pdf'
    }
    if (mimeType.startsWith('image/')) {
      return 'image'
    }
    return null
  }

  /**
   * ファイルを解析
   */
  private async analyzeFile(
    params: FileAnalysisParams,
    fileType: 'pdf' | 'image'
  ): Promise<FileAnalysisResult> {
    // ファイルサイズチェック
    if (params.fileSize > this.MAX_FILE_SIZE) {
      this.logger.info('File too large for AI analysis', {
        fileSize: params.fileSize,
        maxSize: this.MAX_FILE_SIZE
      })
      
      return this.createSimpleAnalysis(params.fileName, fileType)
    }

    // AIによる解析
    return await this.analyzeWithAI(params, fileType)
  }

  /**
   * 簡易解析結果を作成
   */
  private createSimpleAnalysis(
    fileName: string,
    fileType: 'pdf' | 'image'
  ): FileAnalysisResult {
    const cleanName = fileName.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ')
    
    return {
      description: `Large ${fileType} file: ${fileName}`,
      extractedText: `${fileName} - ${fileType} document (large file)`,
      topics: fileType,
      keywords: cleanName,
      hasText: true,
      metadata: {
        simplified: true,
        reason: 'file_too_large'
      }
    }
  }

  /**
   * AIを使用してファイルを解析
   */
  private async analyzeWithAI(
    params: FileAnalysisParams,
    fileType: 'pdf' | 'image'
  ): Promise<FileAnalysisResult> {
    this.logger.info('Analyzing file with AI', {
      model: this.env.DEFAULT_TEXT_GENERATION_MODEL,
      fileType
    })

    // Base64データの準備
    const base64Data = await this.prepareBase64Data(params.fileData)
    
    // AI APIを呼び出し
    const result = await this.callAIAPI(
      fileType,
      params.fileName,
      base64Data
    )

    // 結果を解析
    return this.parseAIResult(result, params.fileName, fileType)
  }

  /**
   * Base64データを準備
   */
  private async prepareBase64Data(fileData: string): Promise<string> {
    const fileBuffer = Uint8Array.from(atob(fileData), c => c.charCodeAt(0))
    
    // チャンク処理でBase64エンコード
    let base64Data = ''
    for (let i = 0; i < fileBuffer.length; i += this.CHUNK_SIZE) {
      const chunk = fileBuffer.slice(i, Math.min(i + this.CHUNK_SIZE, fileBuffer.length))
      base64Data += btoa(String.fromCharCode(...chunk))
    }
    
    return base64Data
  }

  /**
   * AI APIを呼び出し
   */
  private async callAIAPI(
    fileType: 'pdf' | 'image',
    fileName: string,
    base64Data: string
  ): Promise<any> {
    return await this.env.AI.run(
      this.env.DEFAULT_TEXT_GENERATION_MODEL as keyof AiModels,
      {
        messages: [
          {
            role: 'system',
            content: 'あなたはPDFや画像から重要な情報を抽出する専門家です。与えられたファイルの内容を分析し、主要な情報を日本語で要約してください。'
          },
          {
            role: 'user',
            content: `以下は${fileType === 'pdf' ? 'PDF' : '画像'}ファイルのBase64データです。このファイルの内容を分析して、重要な情報を抽出してください：\n\nファイル名: ${fileName}\nBase64データ: ${base64Data.substring(0, 1000)}...\n\nこのファイルから読み取れる主要な内容を日本語で説明してください。`
          }
        ],
        max_tokens: 512
      }
    )
  }

  /**
   * AI結果を解析
   */
  private parseAIResult(
    result: any,
    fileName: string,
    fileType: 'pdf' | 'image'
  ): FileAnalysisResult {
    const extractedText = this.extractTextFromResult(result)
    
    if (!extractedText) {
      this.logger.warn('No text extracted from AI result')
      return this.createSimpleAnalysis(fileName, fileType)
    }

    return {
      description: `AI analyzed ${fileType}: ${fileName}`,
      extractedText,
      topics: this.extractTopics(extractedText),
      keywords: this.extractKeywords(extractedText),
      hasText: true,
      metadata: {
        ai_analyzed: true,
        model: this.env.DEFAULT_TEXT_GENERATION_MODEL
      }
    }
  }

  /**
   * AI結果からテキストを抽出
   */
  private extractTextFromResult(result: any): string | null {
    if (typeof result === 'string') {
      return result
    }
    if (result?.response) {
      return result.response
    }
    if (result?.choices?.[0]?.message?.content) {
      return result.choices[0].message.content
    }
    return null
  }

  /**
   * テキストからトピックを抽出
   */
  private extractTopics(text: string): string {
    // 簡易的なトピック抽出（最初の50文字）
    return text.substring(0, 50).replace(/\n/g, ' ')
  }

  /**
   * テキストからキーワードを抽出
   */
  private extractKeywords(text: string): string {
    // 簡易的なキーワード抽出（頻出単語など）
    const words = text.split(/\s+/).slice(0, 10)
    return words.join(' ')
  }
}