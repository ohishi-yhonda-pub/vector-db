export class VectorSearch {
  constructor(private env: Env) {}

  async query(
    vector: number[],
    options?: VectorizeQueryOptions
  ): Promise<VectorizeMatches> {
    return await this.env.VECTORIZE_INDEX.query(vector, options)
  }

  async findSimilar(
    vectorId: string,
    options?: VectorizeQueryOptions & { excludeSelf?: boolean }
  ): Promise<VectorizeMatches> {
    const vectors = await this.env.VECTORIZE_INDEX.getByIds([vectorId])
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
}