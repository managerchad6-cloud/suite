// How far this viewer's player is behind live, so the rest of the UI can line up with what
// they'll actually see: a 'chat:status' arrives the moment the server airs something, and the
// viewer sees it this much later.

const PUBLISH_S = 0.9   // encode + segment publish before it reaches the player's live edge (measured)
const UNKNOWN_S = 5.5   // no player on screen, or not playing yet

let behind: number | null = null

/** StreamPlayer reports its latency (seconds behind the live edge) here; null when it stops */
export function setStreamLatency(seconds: number | null) {
  behind = seconds
}

/** ms from a server-side event until this viewer sees it on the stream */
export function viewerDelayMs(): number {
  return Math.round((behind == null ? UNKNOWN_S : behind + PUBLISH_S) * 1000)
}
