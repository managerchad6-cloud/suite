export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary'
export type Group  = 'male' | 'female' | 'deity'

export interface CharData {
  key:      string
  name:     string
  file:     string
  ext?:     string
  rarity:   Rarity
  group:    Group
  tier:     string
  tagline:  string
  lore:     string
  traits:   string[]
  usedFor:  string
}

export const CHARACTERS: CharData[] = [
  // ── MALE ──────────────────────────────────────────────────────────────────
  {
    key: 'gigachad', name: 'Gigachad', file: 'gigachad', ext: 'webp',
    rarity: 'legendary', group: 'male',
    tier: 'Apex Male',
    tagline: 'He transcended the spectrum. The spectrum had to apologize.',
    lore: 'The ultimate evolution beyond Chad, Gigachad exists as a hypermuscular, unearthly specimen whose geometrically perfect jaw defies anatomical law. Originally based on a series of surreal, heavily-filtered photographs of Berlin model Ernest Khalimov, Gigachad became the face of "sigma" culture — operating outside hierarchies because hierarchies are for people who care. When even Chad is too try-hard to qualify, you need Gigachad.',
    traits: ['Perfect jaw from any angle', 'Doesn\'t explain himself', 'Effortless at everything', 'Immune to social pressure', 'The original sigma'],
    usedFor: 'The unattainable ideal, the impossible standard that makes everything else look small',
  },
  {
    key: 'chad', name: 'Chad', file: 'chad',
    rarity: 'common', group: 'male',
    tier: 'Peak Male',
    tagline: 'Never heard a song in his life. Doesn\'t need to.',
    lore: 'Chad is the archetypal confident male whose actions are so exaggerated they transcend ordinary achievement. He\'s never heard a song in his entire life, makes direct eye contact at all times, and his mohawk defies the laws of physics and aerodynamics. Chad represents the absurdist ideal — impractical, ridiculous, yet undeniably winning. He doesn\'t do things the right way. He does them his way, and his way is objectively better.',
    traits: ['Supernatural confidence', 'Impossibly athletic without effort', 'Zero self-consciousness', 'Does things the flashy impractical way', 'Always wins somehow'],
    usedFor: 'The absurdly overdone approach that somehow works better than the sensible one',
  },
  {
    key: 'thad', name: 'Thad', file: 'thad',
    rarity: 'uncommon', group: 'male',
    tier: 'Sigma Hero',
    tagline: 'Jacked enough to destroy the world. Chooses to protect it.',
    lore: 'Thad is the redemption arc of the Chad archetype — almost always depicted as a sweet protector of Virgins who combines superhuman physicality with genuine kindness. His muscle density is so extreme there\'s no space between atoms. Unlike Chad\'s oblivious swagger, Thad\'s confidence is so complete he has nothing to prove, which makes him actually nice to people. Chads themselves look up to Thad. He\'s always shirtless because shirts are a social construct and Thad knows it.',
    traits: ['Supernatural muscle density', 'Genuinely protective and kind', 'Shirtless as a lifestyle', 'Beloved across all tiers', 'So secure he helps virgins'],
    usedFor: 'The powerful force that actually uses its power for good, the heroic version of dominance',
  },
  {
    key: 'lad', name: 'Lad', file: 'lad',
    rarity: 'rare', group: 'male',
    tier: 'Chaotic Evil',
    tagline: 'So Chad it looped back around to felony.',
    lore: 'Lad is Chad taken to such grotesque extremes that he becomes a force of chaos and harm. His exaggerated Chadly qualities have metastasized into something genuinely dangerous. Depicted with colossal musculature, a yellow mohawk, and virtually nothing else, Lad is defined in the lore by committing increasingly disturbing acts with total casualness. Memes featuring Lad reliably end with the phrase "What the fuck, Lad?" in bewildered dismay. He is not a villain — he simply has no concept of restraint.',
    traits: ['Hypermusculature bordering on body horror', 'Zero moral comprehension', 'Acts without consequence', 'Revulsion wrapped in humor', 'Memes end in confusion'],
    usedFor: 'When a good idea has been taken so far it becomes actively catastrophic and inexcusable',
  },
  {
    key: 'brad', name: 'Brad', file: 'brad',
    rarity: 'uncommon', group: 'male',
    tier: 'False Alpha',
    tagline: 'Has the aesthetics of Chad. Has the soul of a Virgin.',
    lore: 'Brad is the hybrid born when a Virgin merged with Chad, sparking the catastrophic Brad-Chad War. He performs confidence without actually having it. His Rolex is fake. His Audi is on a lease he can barely afford. Brad\'s entire identity is constructed around appearing to be Chad while quietly disintegrating inside. He needs someone to talk to but will eat glass before admitting it. The surface is immaculate. The interior is a FEMA disaster zone.',
    traits: ['Mimics Chad without understanding', 'Fake confidence over real insecurity', 'Permanently over-accessorized', 'Desperately needs validation', 'Secretly self-loathing'],
    usedFor: 'The poser who copies the format but missed the entire point',
  },
  {
    key: 'boomer', name: 'Dad', file: 'boomer',
    rarity: 'rare', group: 'male',
    tier: 'Primordial Elder',
    tagline: 'He built what you\'re standing on. Stop complaining.',
    lore: 'Dad is a balding man in his late 50s inspired by Midwestern baby boomer stereotypes who somehow exists on the same tier as Thad. He\'s characterized by inexplicable body horror traits that defy explanation and has apparently fathered Virgin, Chad, and Thad — making him a primordial force in the entire Chadiverse. His position on the spectrum remains enigmatic. He just does things, has always done things, and finds your generation exhausting.',
    traits: ['Inexplicable body horror', 'Father of the entire spectrum', 'Pragmatic to a fault', 'Has done everything already', 'Baffled by your choices'],
    usedFor: 'Representing the old way that still somehow works, the confusing elder who predates explanation',
  },
  {
    key: 'basic', name: 'Basic', file: 'basic',
    rarity: 'common', group: 'male',
    tier: 'Baseline Normal',
    tagline: 'Not a loser, not impressive. Just… there.',
    lore: 'Basic is the rarely depicted everyday man — completely average, neither a Virgin nor a Chad. He stands above Virgin but well below Chad, distinguished primarily by the absence of any distinguishing qualities. Basic doesn\'t fail spectacularly. He doesn\'t succeed memorably. He exists. He uses the default settings on everything and has never had a strong opinion about anything in his life. He is the statistical mean of the entire male spectrum.',
    traits: ['No remarkable qualities', 'Consumes exactly what\'s recommended', 'Never the loudest or quietest', 'Has no strong opinions', 'The invisible man'],
    usedFor: 'The neutral baseline take on anything — functional, unremarkable, utterly forgettable',
  },
  {
    key: 'neckbeard', name: 'Neckbeard', file: 'neckbeard',
    rarity: 'uncommon', group: 'male',
    tier: 'Digital Recluse',
    tagline: 'M\'lady. *tips fedora at screen*',
    lore: 'Neckbeard is the Virgin taken to sad extremes — the last stage before becoming a Wizard. He is morbidly obese, clad only in underwear, moving only to play video games or browse forums where he is king. He has elaborate opinions on topics that have never mattered to anyone and will explain them at length. The fedora is a deliberate statement about being above social norms. He\'s not. He is sustained exclusively by fantasy escapism, fast food, and the certainty that he is the smartest person in any given room.',
    traits: ['Expert on things that don\'t matter', 'Elaborate opinions, unsolicited', 'M\'lady ironically and sincerely', 'The fedora is not ironic', 'Hasn\'t been outside this week'],
    usedFor: 'The self-styled intellectual who has never been tested by reality',
  },
  {
    key: 'incel', name: 'Incel', file: 'incel',
    rarity: 'uncommon', group: 'male',
    tier: 'Involuntary Exile',
    tagline: 'He knows it\'s his fault. That makes it worse.',
    lore: 'Incel — Involuntary Celibate — is the most self-aware disaster in the spectrum. He blames the world and everyone in it for his situation while simultaneously, somewhere behind his eyes, knowing the real answer. This self-awareness doesn\'t help — if anything, it\'s combustive. Behind the seething resentment is serious depression, isolation, and a profound inability to break the cycle. He is not sympathetic. He is, however, explicable.',
    traits: ['Seething visible resentment', 'Blames everyone except himself', 'Underneath: profound self-loathing', 'Refuses any offered path out', 'Knows it\'s his fault, resents that too'],
    usedFor: 'The toxic combination of victimhood and complicity, someone who sees the exit but refuses to take it',
  },
  {
    key: 'wizard', name: 'Wizard', file: 'wizard',
    rarity: 'common', group: 'male',
    tier: 'Supernatural Ascetic',
    tagline: 'He lost. He gained. He is beyond your understanding.',
    lore: 'An old Japanese legend adapted by the West: remain a virgin past age 30 and you gain magical powers. In the VVC universe, the Wizard has taken everything pathetic about Virgin and distilled it into a supernatural abomination — craned neck stretched impossibly forward, mangled hands, tentacle-like hair. And yet he\'s so relentlessly, painfully polite that he\'s grown angel wings. He\'s both horrifying and curiously sympathetic — a meme so committed to its own failure that failure became a second form of power.',
    traits: ['Power gained through total failure', 'Grotesquely deformed yet gentle', 'Impossibly polite despite appearance', 'Angel wings from sustained politeness', 'The cursed blessing'],
    usedFor: 'The ultimate loser who has paradoxically transcended through complete defeat — involuntary celibacy as power source',
  },
  {
    key: 'virgin', name: 'Virgin', file: 'virgin',
    rarity: 'common', group: 'male',
    tier: 'Baseline Loser',
    tagline: 'Does everything the safe, sensible, joyless way.',
    lore: 'Virgin is the foundational archetype — the average person doing things the normal, boring, practical way. He has poor posture because he\'s bracing for criticism. He over-explains because he assumes he\'ll need to justify himself. He uses the approved method, files the correct form, and arrives slightly late to everything cool. Virgin isn\'t evil or broken — he\'s just not Chad. He is everyone\'s baseline shame and the reason the format works.',
    traits: ['Anxious and over-explaining', 'Poor posture, expects judgment', 'Does things the approved way', 'Technically correct, spiritually dead', 'Always slightly late to coolness'],
    usedFor: 'The boring, overly-cautious, practical approach — correct but joyless, safe but forgettable',
  },

  // ── FEMALE ────────────────────────────────────────────────────────────────
  {
    key: 'stacy', name: 'Stacy', file: 'stacy',
    rarity: 'common', group: 'female',
    tier: 'Apex Female',
    tagline: 'She doesn\'t need your approval. She never asked.',
    lore: 'Stacy is the female Chad — the archetypal confident woman who moves through the world without seeking permission. Beautiful, popular, completely autonomous. In incel lore she is simultaneously idolized and resented, the unattainable ideal who makes wrong choices without consequence because the world bends differently for her. In the VVC universe, Stacy is simply the woman who does what she wants, answers to no one, and looks good doing it.',
    traits: ['Effortlessly beautiful', 'Sexually autonomous and unapologetic', 'Indifferent to lesser opinions', 'Never explains herself', 'Does exactly what she wants'],
    usedFor: 'Unstoppable female confidence, the approach that works purely by refusing to accept that it might not',
  },
  {
    key: 'tracy', name: 'Tracy', file: 'tracy',
    rarity: 'rare', group: 'female',
    tier: 'Sigma Heroine',
    tagline: 'She was already three moves ahead. She always is.',
    lore: 'Tracy is the female Thad — a Bully Hunter who combines physical capability with genuine protectiveness. Where Stacy\'s power is social and aesthetic, Tracy\'s is operational. She\'s cryptically calm, never the loudest presence in any room, already knowing the outcome before others realize the game has started. All black tactical. Slight knowing smile. Earpiece optional. Tracy is the competent one who doesn\'t need to announce it.',
    traits: ['Tactically three moves ahead', 'Bully hunter, protector', 'Never the loudest, always in control', 'Cryptic calm expression', 'Capability that needs no announcement'],
    usedFor: 'Quiet, decisive female competence — the kind that was already done before you noticed it started',
  },
  {
    key: 'lacy', name: 'Lacy', file: 'lacy',
    rarity: 'rare', group: 'female',
    tier: 'Chaotic Evil',
    tagline: 'She wished to be the stacciest Stacy. The genie obliged terribly.',
    lore: 'Lacy is the female Lad — a Becky who wished on a cursed genie to become "the stacciest Stacy who ever Stacyed," and got exactly that, to horrifying effect. Every Stacy quality magnified beyond the point of glamour into grotesque parody. She is impossible to ignore, overwhelming to encounter, and exists as a cautionary tale about wanting something without understanding what it actually means to have it completely.',
    traits: ['Grotesquely exaggerated femininity', 'Wish-corrupted and magnificent', 'Impossible to ignore or look at', 'Cautionary tale made flesh', 'The genie\'s finest work'],
    usedFor: 'Getting exactly what you asked for in the most disastrously literal way',
  },
  {
    key: 'brandy', name: 'Brandy', file: 'brandy',
    rarity: 'uncommon', group: 'female',
    tier: 'False Stacy',
    tagline: 'She has every accessory Stacy has. She has none of what Stacy has.',
    lore: 'Brandy is the female Brad — a wannabe-Stacy who has the aesthetic dialed in but missed the frequency entirely. She copies the outfit, the posture, the designer bag. She walks into rooms the way she thinks Stacy walks into rooms. None of it lands quite right. Her confidence is performed rather than felt, and this makes it brittle in a way that Stacy\'s never is. She is, genuinely, one authentic moment away from being fine.',
    traits: ['Imitates Stacy obsessively', 'Gets the format, misses the substance', 'Confidence that needs an audience', 'Over-accessorized strategically', 'Could be real if she stopped trying'],
    usedFor: 'The follower who mastered copying the surface without grasping the source',
  },
  {
    key: 'veronica', name: 'Veronica', file: 'veronica',
    rarity: 'common', group: 'female',
    tier: 'Baseline Normal',
    tagline: 'Completely average. Not a bad thing. Not a good thing.',
    lore: 'Veronica is the female Basic — so thoroughly average as to be functionally invisible in most social settings. Neither trying nor failing, neither popular nor excluded. Veronica just exists, does her thing, goes home. In some depictions she has a mild superiority complex over Beckies, which is the most interesting thing about her. Her worth is sometimes measured by whether she has a boyfriend, which is the saddest sentence in this entire document.',
    traits: ['Pleasantly forgettable', 'Mild superiority over Beckies', 'Self-worth tied to relationships', 'Functional and unremarkable', 'The default female character'],
    usedFor: 'The neutral middle ground that neither excels nor fails, just exists and fills space',
  },
  {
    key: 'becky', name: 'Becky', file: 'becky',
    rarity: 'common', group: 'female',
    tier: 'Failed Standard',
    tagline: 'Educated, opinionated, and in the wrong tier for it to matter.',
    lore: 'Becky is the female Virgin — the average woman deemed below the standard by cruel metrics she didn\'t set. She is educated, outspoken, and more interesting than the spectrum gives her credit for. She overthinks everything, tries occasionally, succeeds sometimes, and carries a persistent low-grade awareness that the social calculus was never going to work in her favor. She has strong opinions about things that matter and is right about most of them.',
    traits: ['Educated and genuinely opinionated', 'Overthinks every interaction', 'More interesting than credited', 'Technically sound, socially anxious', 'Right about things, unrewarded for it'],
    usedFor: 'The technically correct but unrecognized approach — right in ways the room isn\'t ready for',
  },
  {
    key: 'femcel', name: 'Femcel', file: 'femcel',
    rarity: 'uncommon', group: 'female',
    tier: 'Involuntary Exile',
    tagline: 'She has the receipts. She never shows them to anyone.',
    lore: 'Femcel is the female Incel — a woman below Becky who blames the world\'s failure to see her value on the world, men, and social structures that don\'t deserve her. Like her male counterpart, she\'s partially right and entirely impossible to be around. The dark hoodie, the scowl, the crossed arms — these are defenses, not laziness. She is someone real pain turned inward and then outward in the worst direction.',
    traits: ['Bitter at specific targets', 'Resentful and partially justified', 'Defenses mistaken for apathy', 'Has given up on asking', 'Real pain, wrong outlet'],
    usedFor: 'Female resentment energy — legitimate grievance expressed in the most counterproductive way possible',
  },
  {
    key: 'legbeard', name: 'Legbeard', file: 'legbeard',
    rarity: 'uncommon', group: 'female',
    tier: 'Digital Recluse',
    tagline: 'Wrong? Wrong?? Let her finish her five-paragraph response.',
    lore: 'Legbeard is the female Neckbeard — aggressively online, politically passionate beyond all social sustainability, and in possession of strong hygiene opinions which she applies to everyone else. She is obsessive over any male attention she receives and will attach completely. She will explain why you\'re wrong about things you didn\'t ask about. She has strong opinions about everything. Mostly she is right. That\'s the tragedy of Legbeard.',
    traits: ['Five-paragraph responses to casual remarks', 'Multiple button badges mandatory', 'Hygiene is ideological', 'Intensely over-attached when seen', 'Correct about most things, insufferable about it'],
    usedFor: 'The passionate, principled position delivered in the least persuasive way possible',
  },
  {
    key: 'witch', name: 'Witch', file: 'witch',
    rarity: 'common', group: 'female',
    tier: 'Supernatural Outcast',
    tagline: 'She opted out. The cats agreed it was the right call.',
    lore: 'Witch is the female Wizard — a Becky who maintained her virginity past 40 and, through sustained celibacy and social withdrawal, accumulated her own form of power. She lives alone with cats, practices things polite society doesn\'t ask about, and has developed a knowing sneer that takes years to perfect. She didn\'t lose — she changed the game she was playing. The wine glass is always full.',
    traits: ['Opted out, doesn\'t regret it', 'Lives with multiple cats strategically', 'The knowing sneer takes years to earn', 'Has stopped explaining herself', 'Accumulated unconventional power'],
    usedFor: 'The withdrawn expert who has transcended the system by refusing to participate in it',
  },

  // ── DEITIES ───────────────────────────────────────────────────────────────
  {
    key: 'gad', name: 'Gad', file: 'gad',
    rarity: 'legendary', group: 'deity',
    tier: 'Creator Deity',
    tagline: 'He split the universe in two. It was a Tuesday.',
    lore: 'Gad is the God of the Chadiverse — the supreme creator who brought the entire spectrum into existence through an act so absurdly, cosmically Chad that reality bifurcated permanently. He has eight arms, all of which are doing something more important than your current problem. Gad is the ultimate good force of the Chadiverse, representing faith, creation, and divine absurdity taken to its logical conclusion. He sometimes has a love for methamphetamines. The lore is what it is.',
    traits: ['Eight arms, all occupied', 'Created the Chadiverse', 'Ultimate good force', 'Divine and absurdist simultaneously', 'Occasionally chemically enhanced'],
    usedFor: 'The all-powerful creative force that simply does, without question, without limit, without explanation',
  },
  {
    key: 'zad', name: 'Zad', file: 'zad',
    rarity: 'rare', group: 'deity',
    tier: 'Divine Agent',
    tagline: 'He appears in the minds of the lost. He reminds them they aren\'t.',
    lore: 'Zad is a divine agent of the Essence of Chad itself — a mysterious being who appears in the minds of Virgins, Incels, and Neckbeards to remind them that the Chad within is not a destination but a choice. He represents the internal voice that knows better, the quiet certainty that the path exists even when you can\'t see it. Zad is hope, but the uncomfortable kind that requires action. Soft white glow. Radiates quiet confidence. Standing perfectly upright.',
    traits: ['Appears in the minds of the lost', 'Agent of the Chad Essence', 'The transformative inner voice', 'Redemptive but not comfortable', 'Soft white glow, upright posture'],
    usedFor: 'The internal voice that knows you\'re capable of better, the nudge toward the path you\'re avoiding',
  },
  {
    key: 'bad', name: 'Bad', file: 'bad',
    rarity: 'rare', group: 'deity',
    tier: 'Chaotic Anomaly',
    tagline: 'Neither Chad nor Virgin. The universe finds this offensive.',
    lore: 'Bad is one of Gizzard\'s most powerful minions, created when a Virgin received captured Chadly powers as reward for starting the Brad-Chad War. This transformation made Bad a paradoxical abomination — simultaneously possessing the qualities of both Chad and Virgin, which the Chadiverse was not designed to accommodate. He is dark, suffering, hollow-eyed, and wreathed in dark red aura. He\'s also wearing a mountain hat that says "bad." Both of them.',
    traits: ['Impossible paradox made flesh', 'Chad and Virgin simultaneously', 'Fused contradictory natures', 'Dark red aura, suffering expression', 'The hat says "bad"'],
    usedFor: 'The impossible contradiction — the thing that shouldn\'t be able to exist but does, badly',
  },
  {
    key: 'gizzard', name: 'Gizzard', file: 'gizzard',
    rarity: 'legendary', group: 'deity',
    tier: 'Dark Deity',
    tagline: 'He made the rule that virgins become Wizards at 30. He enforces it personally.',
    lore: 'Gizzard is the Big Bad of the Chadiverse — directly opposing Gad in every dimension. Gizzard is responsible for the rule: fail to achieve sexual success by age 30 and you become a Wizard. He doesn\'t just oversee this law; he enforces it with personal investment. Gizzard represents the cosmic force of sexual failure made divine — the universe\'s punishment function, personified and inexplicably rendered in cursed meme format. He has an omniscient grimace. Time bends around him slightly.',
    traits: ['Enforces the 30-year virginity rule', 'Directly opposes Gad', 'Omniscient grimace', 'Time bends in his presence', 'Cosmic lord of failure'],
    usedFor: 'The inevitable cosmic punishment, the rule that turns persistent failure into something permanent',
  },
]

export const MALE    = CHARACTERS.filter(c => c.group === 'male')
export const FEMALE  = CHARACTERS.filter(c => c.group === 'female')
export const DEITIES = CHARACTERS.filter(c => c.group === 'deity')
