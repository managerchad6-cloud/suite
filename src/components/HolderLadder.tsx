// The $VVC holder ladder: bag-size tiers (Holder → Kraken) with what each earns a week, where you
// are on it, your time-held bonus, and the next step up (more $VVC, or just keep holding).
import type { HolderStatus, TokenConfig } from '../api/credits'
import './HolderLadder.css'

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 })
const ICONS: Record<string, string> = { holder: '🪙', bag: '💰', whale: '🐋', kraken: '🦑' }

function untilText(iso: string) {
  const days = Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000))
  return days <= 1 ? 'tomorrow' : `in ${days} days`
}

export function HolderLadder({ config, holder, compact }: { config: TokenConfig; holder: HolderStatus | null; compact?: boolean }) {
  const sym = `$${config.symbol}`
  const tier = holder?.tier ?? null
  const bonus = tier?.loyalty.bonusPct ?? 0
  const balance = holder?.tokenBalance ?? 0
  return (
    <div className={`hl${compact ? ' hl--compact' : ''}`}>
      <ol className="hl-rungs">
        {config.tiers.map(t => {
          const mine = tier?.key === t.key
          const reached = balance >= t.minBalance
          const pct = !reached && t.minBalance > 0 ? Math.min(100, (balance / t.minBalance) * 100) : 100
          return (
            <li key={t.key} className={`hl-rung${mine ? ' is-mine' : ''}${reached ? ' is-reached' : ''}`}>
              <span className="hl-icon" aria-hidden>{ICONS[t.key] ?? '•'}</span>
              <span className="hl-name">{t.name}{mine && <em>you</em>}</span>
              <span className="hl-min">{fmt(t.minBalance)}+ {sym}</span>
              <span className="hl-weekly"><b>⚡ {fmt(Math.round(t.weekly * (1 + (reached ? bonus : 0) / 100)))}</b>/wk</span>
              {!reached && <i className="hl-bar" aria-hidden><s style={{ width: `${pct}%` }} /></i>}
            </li>
          )
        })}
      </ol>

      {tier ? (
        <div className="hl-next">
          <span className={`hl-loyalty hl-loyalty--${tier.loyalty.key}`}>
            {tier.loyalty.name}{bonus > 0 && <> · +{bonus}%</>}
          </span>
          {tier.nextLoyalty && (
            <span>Keep holding: <b>{tier.nextLoyalty.name}</b> (+{tier.nextLoyalty.bonusPct}%) {untilText(tier.nextLoyalty.at)}</span>
          )}
          {tier.nextBag && (
            <span><b>{fmt(Math.max(0, tier.nextBag.minBalance - balance))} more {sym}</b> → {tier.nextBag.name}, ⚡ {fmt(tier.nextBag.weekly)}/wk</span>
          )}
        </div>
      ) : !compact && (
        <p className="hl-hint">
          Holding longer pays more: {config.loyalty.filter(l => l.bonusPct > 0).map(l => `+${l.bonusPct}% after ${l.weeks} weeks`).join(', ')}, while your bag stays above {fmt(config.holder.minBalance)} {sym}.
        </p>
      )}
    </div>
  )
}
