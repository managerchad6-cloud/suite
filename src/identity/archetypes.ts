export const ARCHETYPE_NAME: Record<string, string> = {
  gigachad: 'Gigachad', chad: 'Chad', thad: 'Thad', lad: 'Lad',
  boomer: 'Dad', brad: 'Brad', cad: 'Cad', basic: 'Basic', neckbeard: 'Neckbeard',
  incel: 'Incel', coomer: 'Coomer', shlad: 'Shlad', lshad: 'Lshad', wizard: 'Wizard',
  grandwizard: 'Grand Wizard', wraith: 'Wraith', virgin: 'Virgin', stacy: 'Stacy',
  tracy: 'Tracy', lacy: 'Lacy', brandy: 'Brandy', veronica: 'Veronica',
  becky: 'Becky', femcel: 'Femcel', legbeard: 'Legbeard', witch: 'Witch',
  gad: 'Gad', zad: 'Zad', bad: 'Bad', gizzard: 'Gizzard',
}

export const archetypeName = (key: string) => ARCHETYPE_NAME[key] ?? key

/**
 * Where each archetype the Oracle assigns sits between Virgin (0) and Chad (1), from how the Oracle
 * describes them (identity's onboarding prompt). The profile's spectrum meter marks this; edit here.
 * Deities sit at the ends or, for Zad (balance) and Gizzard (outside all spectrums), the middle.
 */
export const ARCHETYPE_SPECTRUM: Record<string, number> = {
  grandwizard: 0.03, wizard: 0.08, incel: 0.07, femcel: 0.08, coomer: 0.1, neckbeard: 0.12, legbeard: 0.12,
  virgin: 0.16, lshad: 0.3, shlad: 0.34, wraith: 0.38, becky: 0.4, witch: 0.4, cad: 0.42,
  basic: 0.5, veronica: 0.5, brad: 0.58, brandy: 0.6, lad: 0.64, boomer: 0.68, lacy: 0.7,
  thad: 0.78, tracy: 0.84, chad: 0.88, stacy: 0.9, gigachad: 0.97,
  bad: 0.02, gad: 1, zad: 0.5, gizzard: 0.5,
}
export const archetypeSpectrum = (key: string) => ARCHETYPE_SPECTRUM[key] ?? 0.5

/** "PumpFun Gremlin Neckbeard": the member's personal title (from the interview) + archetype */
export const displayName = (p: { archetype: string; title?: string | null }) =>
  `${p.title ? `${p.title} ` : ''}${archetypeName(p.archetype)}`
