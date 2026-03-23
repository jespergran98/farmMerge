## Farm Merge Valley simulator

In Farm Merge Valley, your goal is to collect 108 stickers within 50 days.
Stickers are obtained from three sources: consecutive logins, daily challenges, and the Star Vault.
This document lists all known hard values needed to simulate sticker rarity and collection probability across a full 50-day season.

---

**Definitions**

- Sticker: the collectable item
- Sticker pack (daily): a pack earned either from consecutive logins or from completing daily challenges; both sources produce identical packs with the same possible contents — the only difference is how they are obtained
- Sticker pack (Star Vault): a pack bought with stars; unlike daily packs, these guarantee one non-duplicate sticker of the pack's star rating
- Daily challenges: up to 10 tasks available per day, sorted by difficulty; each task resets every 24 hours
- Season: the 50-day duration in which you have to collect 108 stickers; both the Sticker Album and Star Vault reset at the end of each season

---

**Consecutive logins (5-day repeating cycle)**

Day 1: one-star sticker pack
Day 2: two-star sticker pack
Day 3: three-star sticker pack
Day 4: four-star sticker pack
Day 5: five-star sticker pack
(repeat)

---

**Daily challenges**

Every day you can complete up to 10 tasks to earn 10 sticker packs.
It is impossible to get a five-star sticker pack from daily challenges.
Pack rarity is determined by task difficulty — the harder the task, the higher the star rating of the pack it rewards.

The 4 task types, from easiest to hardest:
1. Open supplies
2. Consume energy
3. Harvest
4. Complete orders

The 10 challenge types given are completely random each day.

⚠️ The exact mapping of which task type gives which star-rated pack is UNKNOWN — not confirmed from any source.

Bonus for completing all 10 tasks in a day: 120 energy + 80 crates + 36 gems

---

**Sticker pack contents**

When opening any sticker pack, you receive at least one sticker matching the pack's rarity. The rarer the pack, the more and rarer the additional stickers it contains.

| Pack   | Contents                                   |
|--------|--------------------------------------------|
| 1-star | 2× one-star stickers                       |
| 2-star | 2× one-star stickers + 1× two-star sticker |
| 3-star | ⚠️ UNKNOWN — not confirmed from any source |
| 4-star | ⚠️ UNKNOWN — not confirmed from any source |
| 5-star | ⚠️ UNKNOWN — not confirmed from any source |

---

**The 108 stickers by rarity**

| Rarity    | Count   |
|-----------|---------|
| 1-star    | 27      |
| 2-star    | 21      |
| 3-star    | 18      |
| 4-star    | 18      |
| 5-star    | 25      |
| **Total** | **108** |

---

**Star currency and the Star Vault**

Duplicate system:
If you receive a sticker you already own, it is automatically converted into stars based on its rarity:

| Sticker rarity | Stars awarded |
|----------------|---------------|
| 1-star         | 1 star        |
| 2-star         | 2 stars       |
| 3-star         | 3 stars       |
| 4-star         | 4 stars       |
| 5-star         | 5 stars       |

Star Vault packs:
Stars can be spent in the Star Vault to buy sticker packs that each guarantee one non-duplicate sticker of the pack's rarity. The Star Vault becomes unavailable for a given tier once you have collected all stickers of that rarity (since a non-duplicate can no longer be guaranteed).

| Vault Pack | Star cost | Guaranteed contents       | Additional contents |
|------------|-----------|---------------------------|---------------------|
| 3-star     | 250 stars | 1× new 3-star sticker     | ⚠️ UNKNOWN          |
| 4-star     | 500 stars | 1× new 4-star sticker     | ⚠️ UNKNOWN          |
| 5-star     | 800 stars | 1× new 5-star sticker     | ⚠️ UNKNOWN          |