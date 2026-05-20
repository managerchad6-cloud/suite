import type { UserProfile } from '../lib/quizLog'

const CHAR_NAME: Record<string, string> = {
  gigachad: 'Gigachad', chad: 'Chad', thad: 'Thad', lad: 'Lad',
  boomer: 'Dad', brad: 'Brad', basic: 'Basic', neckbeard: 'Neckbeard',
  incel: 'Incel', wizard: 'Wizard', virgin: 'Virgin', stacy: 'Stacy',
  tracy: 'Tracy', lacy: 'Lacy', brandy: 'Brandy', veronica: 'Veronica',
  becky: 'Becky', femcel: 'Femcel', legbeard: 'Legbeard', witch: 'Witch',
  gad: 'Gad', zad: 'Zad', bad: 'Bad', gizzard: 'Gizzard',
}

interface Props {
  address: string
  profile: UserProfile | null
  onGoToOracle: () => void
}

export function Profile({ address, profile, onGoToOracle }: Props) {
  if (!profile) return (
    <div className="profile-empty">
      <p className="quiz-oracle-label">MY PROFILE</p>
      <h2 className="profile-empty-title">No archetype yet</h2>
      <p className="profile-empty-sub">Complete the Oracle interview to get your character.</p>
      <button className="quiz-start-btn" onClick={onGoToOracle}>Go to Oracle</button>
    </div>
  )

  const name    = CHAR_NAME[profile.character] ?? profile.character
  const avatar  = profile.portraitDataUrl ?? `/assets/chars/${profile.character}.png`
  const updated = profile.updatedAt ? new Date(profile.updatedAt).toLocaleDateString() : null

  return (
    <div className="profile-page">
      <div className="profile-hero">
        <img src={avatar} alt={name} className="profile-hero-avatar" />
        <div className="profile-hero-info">
          <p className="quiz-oracle-label">YOUR ARCHETYPE</p>
          <h1 className="profile-hero-name">{name}</h1>
          <p className="profile-hero-desc">{profile.description}</p>
          {updated && <p className="profile-hero-date">Last updated {updated}</p>}
          {profile.portraitDataUrl && (
            <a
              href={profile.portraitDataUrl}
              download={`${profile.character}_portrait.jpg`}
              className="pfp-modal-download"
            >
              Download PFP
            </a>
          )}
        </div>
      </div>

      <div className="profile-section">
        <h3 className="profile-section-title">Traits</h3>
        <div className="quiz-reveal-attrs">
          {Object.entries(profile.attributes).map(([k, v]) => (
            <span key={k} className="pfp-attr-tag">
              <span className="pfp-attr-key">{k}</span> {v}
            </span>
          ))}
        </div>
      </div>

      <div className="profile-section">
        <h3 className="profile-section-title">Memes</h3>
        <p className="profile-section-empty">Memes you've generated will appear here.</p>
      </div>

      <div className="profile-section">
        <button className="quiz-retake-btn" onClick={onGoToOracle}>Retake Oracle Interview</button>
      </div>
    </div>
  )
}
