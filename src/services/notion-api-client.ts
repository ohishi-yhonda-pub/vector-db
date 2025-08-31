import type { NotionPage as NotionAPIPage, NotionBlock as NotionAPIBlock } from '../schemas/notion.schema'

export class NotionAPIClient {
  private readonly baseUrl = 'https://api.notion.com/v1'
  private readonly headers: Record<string, string>

  constructor(notionToken: string) {
    this.headers = {
      'Authorization': `Bearer ${notionToken}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    }
  }

  // Fetch page from Notion API
  async fetchPage(pageId: string): Promise<NotionAPIPage | null> {
    try {
      const response = await fetch(`${this.baseUrl}/pages/${pageId}`, {
        headers: this.headers
      })

      if (!response.ok) {
        if (response.status === 404) return null
        throw new Error(`Notion API error: ${response.status}`)
      }

      return await response.json() as NotionAPIPage
    } catch (error) {
      console.error('Failed to fetch page from Notion:', error)
      throw error
    }
  }

  // Fetch blocks from Notion API
  async fetchBlocks(pageId: string): Promise<NotionAPIBlock[]> {
    const blocks: NotionAPIBlock[] = []
    let cursor: string | null = null

    try {
      do {
        const url = new URL(`${this.baseUrl}/blocks/${pageId}/children`)
        if (cursor) url.searchParams.append('start_cursor', cursor)
        url.searchParams.append('page_size', '100')

        const response = await fetch(url.toString(), {
          headers: this.headers
        })

        if (!response.ok) {
          throw new Error(`Notion API error: ${response.status}`)
        }

        const data = await response.json() as {
          results: NotionAPIBlock[]
          has_more: boolean
          next_cursor: string | null
        }

        blocks.push(...data.results)
        cursor = data.has_more ? data.next_cursor : null
      } while (cursor)

      return blocks
    } catch (error) {
      console.error('Failed to fetch blocks from Notion:', error)
      throw error
    }
  }

  // Fetch property from Notion API
  async fetchProperty(pageId: string, propertyId: string): Promise<any> {
    try {
      const response = await fetch(
        `${this.baseUrl}/pages/${pageId}/properties/${propertyId}`,
        {
          headers: this.headers
        }
      )

      if (!response.ok) {
        throw new Error(`Notion API error: ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Failed to fetch property from Notion:', error)
      throw error
    }
  }

  // Search pages in Notion
  async searchPages(options: {
    start_cursor?: string
    page_size?: number
    filter?: {
      property: string
      value: string
    }
  } = {}): Promise<{
    results: NotionAPIPage[]
    has_more: boolean
    next_cursor: string | null
  }> {
    try {
      const searchBody: any = {
        page_size: options.page_size || 100
      }

      if (options.start_cursor) {
        searchBody.start_cursor = options.start_cursor
      }

      if (options.filter) {
        searchBody.filter = {
          property: options.filter.property,
          [options.filter.property]: {
            equals: options.filter.value
          }
        }
      }

      const response = await fetch(`${this.baseUrl}/search`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(searchBody)
      })

      if (!response.ok) {
        throw new Error(`Notion API error: ${response.status}`)
      }

      const data = await response.json() as {
        results: any[]
        has_more: boolean
        next_cursor: string | null
      }
      
      return {
        results: data.results.filter((item) => item.object === 'page'),
        has_more: data.has_more,
        next_cursor: data.next_cursor
      }
    } catch (error) {
      console.error('Failed to search pages from Notion:', error)
      throw error
    }
  }
}