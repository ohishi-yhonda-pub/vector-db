export class VectorOperations {
  constructor(private env: Env) {}

  async insert(vectors: VectorizeVector[]): Promise<void> {
    await this.env.VECTORIZE_INDEX.insert(vectors)
  }

  async upsert(vectors: VectorizeVector[]): Promise<void> {
    await this.env.VECTORIZE_INDEX.upsert(vectors)
  }

  async deleteByIds(ids: string[]): Promise<{ count: number }> {
    return await this.env.VECTORIZE_INDEX.deleteByIds(ids)
  }

  async getByIds(ids: string[]): Promise<VectorizeVector[]> {
    return await this.env.VECTORIZE_INDEX.getByIds(ids)
  }

  generateVectorId(prefix: string = 'vec'): string {
    const timestamp = Date.now()
    const randomStr = Math.random().toString(36).substr(2, 9)
    return `${prefix}_${timestamp}_${randomStr}`
  }
}