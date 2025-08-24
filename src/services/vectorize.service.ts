export class VectorizeService {
  constructor(
    private env: Env
  ) {}

  async insert(vectors: VectorizeVector[]): Promise<void> {
    await this.env.VECTORIZE_INDEX.insert(vectors)
  }

  async upsert(vectors: VectorizeVector[]): Promise<void> {
    await this.env.VECTORIZE_INDEX.upsert(vectors)
  }

  async query(
    vector: number[],
    options?: VectorizeQueryOptions
  ): Promise<VectorizeMatches> {
    return await this.env.VECTORIZE_INDEX.query(vector, options)
  }

  async getByIds(ids: string[]): Promise<VectorizeVector[]> {
    return await this.env.VECTORIZE_INDEX.getByIds(ids)
  }

  async deleteByIds(ids: string[]): Promise<{ count: number }> {
    return await this.env.VECTORIZE_INDEX.deleteByIds(ids)
  }

  async findSimilar(
    vectorId: string,
    options?: VectorizeQueryOptions & { excludeSelf?: boolean }
  ): Promise<VectorizeMatches> {
    const vectors = await this.getByIds([vectorId])
    if (!vectors || vectors.length === 0) {
      throw new Error(`Vector ${vectorId} not found`)
    }

    const queryOptions: VectorizeQueryOptions = {
      topK: options?.excludeSelf ? (options.topK || 10) + 1 : options?.topK || 10,
      namespace: options?.namespace || vectors[0].namespace,
      returnMetadata: options?.returnMetadata ?? true,
      filter: options?.filter
    }

    const results = await this.query(vectors[0].values as number[], queryOptions)

    if (options?.excludeSelf) {
      results.matches = results.matches
        .filter(match => match.id !== vectorId)
        .slice(0, options.topK || 10)
    }

    return results
  }

  generateVectorId(prefix: string = 'vec'): string {
    const timestamp = Date.now()
    const randomStr = Math.random().toString(36).substr(2, 9)
    return `${prefix}_${timestamp}_${randomStr}`
  }
}