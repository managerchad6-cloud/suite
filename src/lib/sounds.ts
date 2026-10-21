// Trade sounds, synthesised (no audio files): an air horn + cash register for a buy, a sad trombone
// for a sell. On by default; the ticker's speaker button mutes them (remembered per browser).

const MUTE_KEY = 'vvc:sound-muted'
export const isMuted = () => { try { return localStorage.getItem(MUTE_KEY) === '1' } catch { return false } }
export const setMuted = (v: boolean) => { try { localStorage.setItem(MUTE_KEY, v ? '1' : '0') } catch { /* private mode */ } }

let ctx: AudioContext | null = null
function audio(): AudioContext | null {
  if (isMuted()) return null
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch { return null }
}

/** One note: oscillator → gain envelope, optional pitch slide to `to`. */
function tone(c: AudioContext, { type, freq, to, start, dur, vol }: { type: OscillatorType; freq: number; to?: number; start: number; dur: number; vol: number }) {
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, start)
  if (to) o.frequency.exponentialRampToValueAtTime(to, start + dur)
  g.gain.setValueAtTime(0.0001, start)
  g.gain.exponentialRampToValueAtTime(vol, start + 0.02)
  g.gain.setValueAtTime(vol, start + dur * 0.7)
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur)
  o.connect(g).connect(c.destination)
  o.start(start)
  o.stop(start + dur + 0.05)
}

export function playBuy() {
  const c = audio(); if (!c) return
  const t = c.currentTime
  // Air horn: three blasts of a detuned saw chord
  for (const [i, len] of [[0, 0.16], [1, 0.16], [2, 0.5]] as const) {
    const s = t + i * 0.2
    for (const f of [233, 294, 349, 466]) tone(c, { type: 'sawtooth', freq: f, start: s, dur: len, vol: 0.05 })
  }
  // Cha-ching
  tone(c, { type: 'triangle', freq: 1568, start: t + 0.75, dur: 0.12, vol: 0.12 })
  tone(c, { type: 'triangle', freq: 2093, start: t + 0.86, dur: 0.45, vol: 0.12 })
}

export function playSell() {
  const c = audio(); if (!c) return
  const t = c.currentTime
  // Wah wah wah waaaah
  const notes: [number, number, number][] = [[392, 370, 0.45], [370, 349, 0.45], [349, 330, 0.45], [330, 247, 1.4]]
  let s = t
  for (const [from, to, dur] of notes) {
    tone(c, { type: 'triangle', freq: from, to, start: s, dur, vol: 0.14 })
    tone(c, { type: 'sawtooth', freq: from / 2, to: to / 2, start: s, dur, vol: 0.03 })
    s += dur + 0.05
  }
}
