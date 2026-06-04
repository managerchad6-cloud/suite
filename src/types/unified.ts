export type MemeSourceType = 'studio' | 'factory' | 'reddit'
export type MemeTier = 'fresh' | 'rising' | 'hot' | 'legendary' | 'pantheon'

export interface UnifiedMemeItem {
  key: string
  type: MemeSourceType
  imageUrl: string
  title: string
  meta: string        // wallet (truncated) or score string
  dateIso: string
  sourceId: string    // studio id / factory job_id / reddit post id

  // available at list time — show without a fetch
  wallet?: string
  characters?: string[]   // character keys for filtering (studio memes)
  has_draft?: boolean     // studio memes: draft saved for remixing
  remixed_from?: string   // id of the meme this was remixed from
  redditPermalink?: string
  redditScore?: number
  redditTopic?: string | null
  redditLeftTitle?: string | null
  redditRightTitle?: string | null
  redditLeftLabels?: string[]
  redditRightLabels?: string[]

  // vote + tier state (loaded lazily or returned by feed API)
  tier?: MemeTier
  up_votes?: number
  down_votes?: number
  score?: number
  velocity?: number
  your_vote?: 1 | -1 | null
}
