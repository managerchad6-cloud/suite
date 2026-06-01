# PFP System — Feature Docs

Wallet-native profile picture system for the VVC ecosystem. Each wallet gets one unique PFP, permanently bound to the address. The PFP is a VVC canon character + a unique set of attributes layered on top — same spirit as NFT PFP collections (CryptoPunks, BAYC) but grounded in VVC lore.

---

## Vision

- User connects Phantom wallet
- New wallet triggers the **Character Interview** — a short questionnaire that determines archetype and attribute set
- Interview output maps to a **base character** (Chad, Virgin, Wizard, etc.) + **attribute layers** (glasses, hats, tattoos, hairstyles, expressions, accessories...)
- PFP is generated using the **same AI pipeline as Meme Factory** (GPT for prompt engineering, Gemini for image generation)
- Result is unique per wallet, recognizable as a VVC character, permanently stored

---

## Where It Lives

**Product location:** `Meme Factory UI/suite` — user account expansion section (not yet implemented)

---

## Files in This Folder

| File | What it contains |
|---|---|
| [`characters.md`](./characters.md) | Full canon character roster organized by gender category (male / female / rather not say) — the assignable base archetypes |
| [`interview.md`](./interview.md) | Interview question logic, answer-to-archetype mapping, spectrum placement rules |
| [`attributes.md`](./attributes.md) | Attribute layer catalog — traits, rarities, character-specific unlocks |
| [`generation.md`](./generation.md) | Generation pipeline — how interview output becomes a GPT prompt, how Gemini renders the PFP |

> Files marked above that don't exist yet are placeholders — to be filled as the feature is specced out.

---

## Core Design Rules

1. **One wallet, one PFP.** The interview is taken once. The result is permanent. New wallet = new identity.
2. **Character-first.** The base archetype must be immediately recognizable as the canonical VVC character. Attributes are layered on top — they customize, they don't obscure.
3. **Same generation tech as Meme Factory.** GPT constructs the prompt, Gemini renders. Two-pass pipeline if needed.
4. **Rarity via archetype tier.** Deity-tier characters (Gad, Gizzard, Zad, Bad) are rare outcomes — earned through interview, not guaranteed. Extended cast is mid-rarity. Primary archetypes are common.
5. **Gender gates the character pool.** First interview question determines which character set is available. Male → male spectrum. Female → female spectrum. Rather not say → deity/androgynous tier.
