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
Each row below is one specific task in the daily challenge list (10 tasks total per day):

| Task # | Harvest | Spend energy | Complete orders | Open supplies | Pack reward |
|--------|---------|--------------|-----------------|---------------|-------------|
| 1      | 10      | 70           | 4               | 40            | 1-star      |
| 2      | 20      | 140          | 8               | 80            | 2-star      |
| 3      | 35      | 210          | 12              | 120           | 2-star      |
| 4      | 45      | 280          | 16              | 160           | 2-star      |
| 5      | 55      | 350          | 20              | 200           | 2-star      |
| 6      | 65      | 420          | 24              | 240           | 3-star      |
| 7      | 75      | 490          | 28              | 280           | 3-star      |
| 8      | 90      | 560          | 32              | 320           | 4-star      |
| 9      | 100     | 630          | 36              | 360           | 4-star      |
| 10     | 110     | 700          | 40              | 400           | 4-star      |

---

**Sticker pack contents**

Each pack always contains one guaranteed sticker of the pack's own rarity. The remaining slots are drawn randomly according to the probabilities below.

**1-star pack** — 2 stickers total
- 1× guaranteed 1-star
- 1 additional slot: 70% → 1-star, 30% → 2-star

**2-star pack** — 3 stickers total
- 1× guaranteed 2-star
- 2 additional slots, each independently: 50% → 1-star, 40% → 2-star, 10% → 3-star

**3-star pack** — 4 stickers total
- 1× guaranteed 3-star
- 3 additional slots, each independently: 40% → 1-star, 35% → 2-star, 20% → 3-star, 5% → 4-star

**4-star pack** — 5 stickers total
- 1× guaranteed 4-star
- 4 additional slots, each independently: 30% → 1-star, 30% → 2-star, 25% → 3-star, 10% → 4-star, 5% → 5-star

**5-star pack** — 6 stickers total
- 1× guaranteed 5-star
- 5 additional slots, each independently: 20% → 1-star, 25% → 2-star, 25% → 3-star, 20% → 4-star, 10% → 5-star

---

**The 108 stickers by rarity**

| Rarity    | Count   |
|-----------|---------|
| 1-star    | 27      |
| 2-star    | 21      |
| 3-star    | 18      |
| 4-star    | 18      |
| 5-star    | 24      |
| **Total** | **108** |

---

**Star currency and the Star Vault**

Duplicate system:

| Sticker rarity | Stars awarded |
|----------------|---------------|
| 1-star         | 1 star        |
| 2-star         | 2 stars       |
| 3-star         | 3 stars       |
| 4-star         | 4 stars       |
| 5-star         | 5 stars       |

Star Vault packs:
Stars can be spent in the Star Vault to buy sticker packs that each guarantee one non-duplicate sticker of the pack's rarity. The remaining sticker slots follow the exact same drop probabilities as a normal pack of that rarity. The Star Vault becomes unavailable for a given tier once you have collected all stickers of that rarity (since a non-duplicate can no longer be guaranteed).

| Vault Pack | Star cost | Stickers total | Guaranteed             | Remaining slots                          |
|------------|-----------|----------------|------------------------|----------------------------------------  |
| 3-star     | 250 stars | 4              | 1× new 3-star sticker  | 3 slots, same odds as normal 3-star pack |
| 4-star     | 500 stars | 5              | 1× new 4-star sticker  | 4 slots, same odds as normal 4-star pack |
| 5-star     | 800 stars | 6              | 1× new 5-star sticker  | 5 slots, same odds as normal 5-star pack |