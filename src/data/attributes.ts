export interface AttributeSet {
  [key: string]: string
}

type Pool = Record<string, string[]>

const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)]

// ── Shared pools ───────────────────────────────────────────────────────
const SKIN   = ['pale white','light beige','warm tan','deep brown','olive']
const EYES   = ['blue','green','brown','grey','hazel','bloodshot red','yellow']
const CHAINS = ['thick gold chain','silver chain with cross','no chain']
const TATTS  = ['full sleeve tattoo on left arm','tribal neck tattoo','no visible tattoos','rose tattoo on forearm']

// ── Per-character attribute pools ──────────────────────────────────────
const POOLS: Record<string, Pool> = {
  chad: {
    mohawk:    ['yellow','electric blue','hot pink','red','white','black','green'],
    tank:      ['red','black','white','orange','purple','camo green'],
    tankText:  ['OUCH!','CHAD','NO MERCY','BUILT DIFF','GAINS','W ONLY','SIGMA'],
    pants:     ['bright green','black','grey','red','navy blue','camo'],
    boots:     ['yellow','white','red','black','orange'],
    accessory: ['gold chain around neck','wristband','fingerless gloves','no accessory','sunglasses on forehead'],
    extra:     ['veins visible on arms','six-pack abs showing','confident smirk'],
  },
  gigachad: {
    beard:     ['full black beard','trimmed stubble','clean shaven','salt-and-pepper beard'],
    pants:     ['dark grey','black','charcoal','navy'],
    boots:     ['black combat boots','dark brown boots','grey boots'],
    extra:     ['chiselled jaw','piercing eyes','stoic expression','slight smirk'],
    accessory: ['no accessory','simple silver ring','black leather wristband'],
  },
  thad: {
    shorts:    ['red','navy','black','dark green','purple'],
    boots:     ['green','black','white','grey'],
    skin:      SKIN,
    extra:     ['imposing posture','slight grin','broad shoulders','tattoo on chest'],
    accessory: ['no accessory','dog tags','wrist wrap'],
  },
  virgin: {
    hair:      ['messy black','dark brown','greasy flat','dishevelled dark','unkempt black'],
    glasses:   ['black-rimmed glasses','no glasses','thin wire-frame glasses','sunglasses hanging off nose'],
    hoodie:    ['dark grey','navy blue','dark green','black','dark maroon'],
    jeans:     ['dark navy','black','dark grey','faded blue'],
    shoes:     ['white New Balance','black sneakers','grey sneakers','worn-out white trainers'],
    extra:     ['hunched posture','avoids eye contact','hands in pockets'],
  },
  wizard: {
    robeColor: ['dark purple','dark blue','black','forest green','maroon'],
    hatColor:  ['same as robe','black','dark blue','purple'],
    beard:     ['long white flowing beard','long grey beard','medium grey beard'],
    staff:     ['wooden staff with glowing tip','plain wooden staff','no staff'],
    extra:     ['mysterious expression','floating slightly off ground','surrounded by faint glow'],
  },
  lad: {
    shirt:     ['red polo','tight white t-shirt','no shirt','hawaiian shirt'],
    shorts:    ['khaki','blue','white','cargo'],
    shoes:     ['boat shoes','flip flops','white trainers'],
    extra:     ['grotesquely wide','enormous belly','huge grin','sunburn red face'],
    accessory: ['pint of beer in hand','cigarette behind ear','sunglasses'],
  },
  boomer: { // Dad
    shirt:     ['white polo','blue polo','plaid flannel','grey t-shirt'],
    trousers:  ['khaki chinos','blue jeans','dark grey slacks'],
    shoes:     ['white New Balance','brown loafers','black shoes'],
    accessory: ['spatula in hand','beer in hand','reading glasses on nose','baseball cap','no accessory'],
    extra:     ['proud expression','slight gut','arms crossed','thumbs in belt loops'],
  },
  brad: {
    hair:      ['frosted tips','spiky gel','slicked back','man bun'],
    shirt:     ['tight polo','designer t-shirt','V-neck white','striped button-up'],
    jeans:     ['skinny jeans','ripped jeans','white jeans','dark slim fit'],
    shoes:     ['white loafers','boat shoes','suede chelsea boots'],
    accessory: ['designer sunglasses','fake Rolex','protein shaker in hand'],
    extra:     ['trying too hard expression','slight tan','hair perfectly styled'],
  },
  basic: {
    hair:      ['plain brown','plain black','plain blonde','mousy brown'],
    shirt:     ['grey t-shirt','white t-shirt','beige polo'],
    trousers:  ['dark jeans','khakis','grey trousers'],
    shoes:     ['plain white sneakers','black sneakers'],
    extra:     ['completely neutral expression','forgettable face','average build'],
  },
  neckbeard: {
    hat:       ['brown fedora','no hat','black fedora'],
    beard:     ['patchy neckbeard','full unkempt beard','scraggly chin beard'],
    shirt:     ['Iron Maiden t-shirt','Call of Duty print t-shirt','anime print t-shirt','too-small polo'],
    food:      ['slice of cold pizza in hand','bag of tacos on the floor','KFC bucket nearby','Mountain Dew in hand'],
    phone:     ['phone open on PumpFun chart','phone showing red candles','no phone visible'],
    extra:     ['visibly complaining about something','Cheeto dust on fingers','sweaty appearance','greasy skin'],
    accessory: ['katana behind back','Call of Duty controller nearby','no accessory'],
  },
  incel: {
    head:      ['completely bald and shiny','shaved head','thinning hair'],
    shirt:     ['grey t-shirt','black t-shirt','worn white undershirt'],
    extra:     ['clenched jaw','thousand-yard stare','dark eye circles'],
    skin:      ['pale white','blotchy pale','sickly pale'],
    accessory: ['no accessory','energy drink in hand'],
  },
  stacy: {
    hair:      ['long blonde','beach waves','high ponytail','red','platinum blonde'],
    outfit:    ['red dress','white sundress','designer jeans and crop top','black bodycon'],
    shoes:     ['high heels','white sneakers','strappy sandals'],
    accessory: ['designer handbag','sunglasses on head','gold jewellery','no accessory'],
    extra:     ['confident posture','perfect posture','radiant smile'],
  },
  tracy: {
    hair:      ['black bob','dark bun','sleek straight dark hair','white streak in black hair'],
    outfit:    ['all black tactical','dark trench coat','black turtleneck and slacks'],
    extra:     ['cryptic calm expression','stands completely still','slight knowing smile'],
    accessory: ['earpiece','no accessory','black gloves'],
  },
  lacy: {
    hair:      ['wild bleached','huge teased blonde','pink and yellow'],
    outfit:    ['matching animal print','leopard print dress','neon yellow bikini top and shorts'],
    extra:     ['grotesquely exaggerated curves','huge grin','overwhelming presence'],
    accessory: ['giant handbag','pint in hand','feather boa'],
  },
  brandy: {
    hair:      ['highlighted brown','straight chestnut','blonde highlights'],
    outfit:    ['copycat designer look','tight jeans and nice top','almost-Stacy dress'],
    shoes:     ['block heels','white trainers','wedge sandals'],
    extra:     ['trying to look like Stacy','close but not quite','over-accessorised'],
    accessory: ['large sunglasses','designer dupe bag'],
  },
  veronica: {
    hair:      ['plain brown shoulder-length','straight black','mousy blonde'],
    outfit:    ['plain jeans and t-shirt','simple dress','beige cardigan and trousers'],
    extra:     ['completely average appearance','forgettable face','pleasant neutral expression'],
    shoes:     ['plain flats','plain white sneakers'],
  },
  becky: {
    hair:      ['short practical cut','librarian bun','straight shoulder-length','asymmetric cut'],
    outfit:    ['blazer over shirt','smart casual','frumpy blazer','turtleneck and slacks'],
    glasses:   ['thick-rimmed glasses','round glasses','no glasses'],
    accessory: ['stack of books','reusable coffee cup','tote bag','lanyard'],
    extra:     ['overcompensating posture','slightly pinched expression'],
  },
  femcel: {
    hood:      ['hood pulled up hiding hair','hood down revealing lank hair'],
    outfit:    ['oversized hoodie','dark baggy clothes','black sweatshirt and leggings'],
    extra:     ['scowling expression','avoids eye contact','arms folded','dark under-eye circles'],
    shoes:     ['worn-out trainers','beaten-up black shoes'],
  },
  legbeard: {
    hair:      ['greasy unbrushed','stringy long hair','piled up mess'],
    outfit:    ['Tumblr aesthetic','oversized cat print t-shirt','mismatched layers'],
    accessory: ['many button badges','no accessory','stuffed animal tucked under arm'],
    extra:     ['unwashed appearance','intense defensive posture'],
  },
  witch: {
    hair:      ['wild grey','long grey tangled','short grey','wild white'],
    cats:      ['one cat at feet','two cats','no cats visible'],
    outfit:    ['black cardigan over everything','shapeless black dress','oversized black jumper'],
    extra:     ['knowing sneer','cat sitting on shoulder','surrounded by plants'],
    accessory: ['wine glass in hand','herbal tea mug','no accessory'],
  },
  gad: {
    arms:      ['eight arms raised','eight arms holding symbols','eight arms in mudra poses'],
    hair:      ['Fibonacci spiral golden hair','flowing golden hair','radiant white hair'],
    extra:     ['glowing aura','divine light radiating outward','celestial expression'],
    outfit:    ['golden divine robes','glowing white garments','cosmic fabric'],
  },
  gizzard: {
    expression:['omniscient grimace','knowing blank stare','cursed serene expression'],
    glow:      ['faint green glow','sickly yellow aura','no glow — just void'],
    extra:     ['impossibly still','surrounded by cosmic symbols','time bends around them'],
  },
  zad: {
    hair:      ['short neat dark','shaved head','medium dark'],
    outfit:    ['simple white robes','minimalist dark outfit','plain athletic wear — transcended fashion'],
    extra:     ['benevolent calm expression','radiates quiet confidence','stands perfectly upright'],
    glow:      ['soft white glow','warm golden halo','no glow — purely physical'],
  },
  bad: {
    hair:      ['wild dark','matted dark','void-black'],
    outfit:    ['torn dark clothing','shadowy robes','dark rags'],
    extra:     ['suffering expression','hollow eyes','cracked skin','dark smoke around them'],
    glow:      ['dark red aura','sickly purple glow','no glow — absorbs light'],
  },
}

// ── Prompt builder ─────────────────────────────────────────────────────
export function buildAttributePrompt(characterFile: string): { prompt: string; attrs: AttributeSet } {
  const key = characterFile.replace('_template', '').replace('ogchad', 'chad').replace('basdchad', 'chad').replace('boomer', 'boomer')
  const pool = POOLS[key] ?? POOLS['basic']

  const attrs: AttributeSet = {}
  for (const [trait, options] of Object.entries(pool)) {
    attrs[trait] = pick(options)
  }

  const attrLines = Object.entries(attrs)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n')

  const prompt = `You are given a black-and-white line-art template of a cartoon character. Color it with the exact attributes listed below. Keep the same pose, proportions, and body shape. Use bold flat cartoon colors with black outlines, white background. VVC meme-style cartoon illustration.\n\nAttributes:\n${attrLines}\n\nDo not change the pose. Do not add or remove body parts. Only color and add surface details as described.`

  return { prompt, attrs }
}
