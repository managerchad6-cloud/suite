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

/** "PumpFun Gremlin Neckbeard": the member's personal title (from the interview) + archetype */
export const displayName = (p: { archetype: string; title?: string | null }) =>
  `${p.title ? `${p.title} ` : ''}${archetypeName(p.archetype)}`
