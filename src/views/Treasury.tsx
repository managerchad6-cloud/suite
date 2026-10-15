import './Treasury.css'

interface AllocationDef {
  id: string
  label: string
  pct: number
  color: string
  detail?: string[]
}

const ALLOCATIONS: AllocationDef[] = [
  {
    id: 'dao', label: 'DAO', pct: 40, color: '#F0A020',
    detail: ['Staking', 'Growth Hacking Fund', 'NFTs', 'Games', 'Virality Rewards'],
  },
  { id: 'team',      label: 'Team',          pct: 10, color: '#4acc7a' },
  { id: 'private',   label: 'Private Sale',  pct: 10, color: '#4dc8ff' },
  { id: 'cex',       label: 'CEX Listings',  pct: 5,  color: '#c060ff' },
  { id: 'advisory',  label: 'Advisory',      pct: 5,  color: '#ff4dce' },
  { id: 'ops',       label: 'Operational Costs / AI', pct: 10, color: '#ff8a4d' },
  { id: 'tba',       label: 'Reserved — TBA', pct: 20, color: '#2a2a2a' },
]

function buildConicGradient(allocs: AllocationDef[]): string {
  let acc = 0
  const stops = allocs.map(a => {
    const start = acc
    acc += a.pct
    return `${a.color} ${start}% ${acc}%`
  })
  return `conic-gradient(${stops.join(', ')})`
}

export function Treasury() {
  const gradient = buildConicGradient(ALLOCATIONS)

  return (
    <div className="treasury-root">
      <div className="treasury-header">
        <h1 className="treasury-title">Treasury</h1>
        <p className="treasury-sub">DAO &amp; community-controlled funds — where $VVC actually goes.</p>
      </div>

      <div className="treasury-body">
        <div className="treasury-chart-wrap">
          <div className="treasury-donut" style={{ background: gradient }}>
            <div className="treasury-donut-hole">
              <span className="treasury-donut-label">$VVC</span>
              <span className="treasury-donut-sub">Tokenomics</span>
            </div>
          </div>
        </div>

        <div className="treasury-legend">
          {ALLOCATIONS.map(a => (
            <div key={a.id} className={`treasury-legend-row ${a.id === 'tba' ? 'treasury-legend-row--tba' : ''}`}>
              <span className="treasury-legend-swatch" style={{ background: a.color }} />
              <div className="treasury-legend-text">
                <div className="treasury-legend-top">
                  <span className="treasury-legend-label">{a.label}</span>
                  <span className="treasury-legend-pct">{a.pct}%</span>
                </div>
                {a.detail && (
                  <div className="treasury-legend-detail">
                    {a.detail.join(' · ')}
                  </div>
                )}
                {a.id === 'tba' && (
                  <div className="treasury-legend-detail">Final allocation pending confirmation from the team.</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
