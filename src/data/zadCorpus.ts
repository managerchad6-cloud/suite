// ─────────────────────────────────────────────────────────────────────────────
// ZAD TOUR
// The scripted first-visit tour. Zad's knowledge corpus and system prompt live server-side
// (memestudio-backend prompts/zad-system.md), where the chat is answered.
// ─────────────────────────────────────────────────────────────────────────────

export type PositionKey =
  | 'bottom-right'
  | 'bottom-left'
  | 'mid-left'
  | 'top-left'
  | 'bottom-center'

export interface TourStep {
  id: string
  targetNav: string | null
  position: PositionKey
  script: string   // pre-scripted — shown verbatim during tour
}

// ─── TOUR STEPS ───────────────────────────────────────────────────────────────

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    targetNav: null,
    position: 'bottom-right',
    script: "You found it. Most don't get this far.\n\nI'm Zad — divine agent of the Essence of Chad. I appear when someone needs direction. Today that someone is you. Let me show you what you've walked into.",
  },
  {
    id: 'factory',
    targetNav: 'factory',
    position: 'bottom-left',
    script: "The Factory.\n\nYou describe the contrast — Virgin behavior on the left, Chad on the right. The AI generates the meme. Ten credits per creation, or one USDC straight on-chain.\n\nThe Chad doesn't read the manual. He creates.",
  },
  {
    id: 'studio',
    targetNav: 'studio',
    position: 'bottom-left',
    script: "The Studio.\n\nFull canvas editor — layers, tools, characters, AI enhancement. Reskin a character. Generate action poses. Publish to the gallery.\n\nSome things can't be generated. They have to be made.",
  },
  {
    id: 'memes',
    targetNav: 'memes',
    position: 'mid-left',
    script: "The Feed.\n\nFactory memes, Studio memes, Reddit imports — all flowing here. Sort by what's rising, what's hot, what's newest. Your votes train the algorithm.\n\nThe river doesn't wait.",
  },
  {
    id: 'vote',
    targetNav: 'vote',
    position: 'mid-left',
    script: "Three voting systems: which videos play on stream, where development goes, what the community wants built.\n\nYour votes on memes in the Feed determine their tier — Fresh to Pantheon. Inaction is also a trade. Make it deliberate.",
  },
  {
    id: 'pfp',
    targetNav: 'pfp',
    position: 'top-left',
    script: "The quiz assigns your archetype. Twenty to twenty-eight questions — broad early, surgical late.\n\nAt the end: your character, your portrait, your place in the Chadiverse.\n\nThe interview finds what you've been avoiding knowing.",
  },
  {
    id: 'cast',
    targetNav: 'cast',
    position: 'top-left',
    script: "Thirty-plus archetypes. The full roster.\n\nEvery archetype of the human condition organized by spectrum — Virgin to Chad, Witch to Stacy. Full lore, rarity tiers, tagged memes per character.\n\nI'm in there. Rare tier. It's accurate.",
  },
  {
    id: 'live',
    targetNav: 'live',
    position: 'top-left',
    script: "When the stream is running, this is where the Chadiverse speaks.\n\nStream, chat, meme queue. It's quiet right now. It won't always be.",
  },
  {
    id: 'prizes',
    targetNav: 'prizes',
    position: 'mid-left',
    script: "Weekly tournament bracket. Memes compete head-to-head. The community votes.\n\nThe champion gets inducted into the Pantheon — the highest tier there is, permanently.\n\nThe Pantheon doesn't have many seats.",
  },
  {
    id: 'credits',
    targetNav: 'credits',
    position: 'bottom-center',
    script: "Credits are the fuel. Ten per Factory meme. Studio AI tools cost three to eight depending on what you're doing.\n\nBuy with USDC, SOL, or $VVC. Or bring your own Gemini key and bypass the system entirely.\n\nYour wallet is already connected.",
  },
  {
    id: 'done',
    targetNav: null,
    position: 'bottom-right',
    script: "That's the Suite. You know what's here.\n\nI'm not going anywhere — ask me anything about the tools, the lore, the characters, how things work.\n\nI know this place.",
  },
]
