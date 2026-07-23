import assert from "node:assert/strict";
import test from "node:test";
import manifest from "../data/vendetta-cards.json";
import {
  generateKit,
  rollRareSlotTreatment,
  SEEDED_THEMES,
} from "../lib/collation";
import {
  autoBuildDeck,
  cardMap,
  emptyRunes,
  validateDeck,
} from "../lib/deck-builder";
import { createRandom } from "../lib/prng";
import type { CardDefinition, DeckConfiguration, KitSession } from "../lib/types";

const cards = manifest.cards as CardDefinition[];
const cardsById = cardMap(cards);

test("official Vendetta snapshot is complete and treatment identities resolve", () => {
  assert.equal(cards.length, 228);
  const counts = Object.groupBy(cards, (card) => card.treatment);
  assert.equal(counts.base?.length, 166);
  assert.equal(counts.alt?.length, 18);
  assert.equal(counts["special-alt"]?.length, 6);
  assert.equal(counts.overnumber?.length, 31);
  assert.equal(counts.rune?.length, 6);
  assert.equal(counts.token?.length, 1);
  for (const card of cards.filter((item) => ["alt", "special-alt", "overnumber"].includes(item.treatment))) {
    assert.ok(cardsById.has(card.mechanicalId), `${card.id} maps to ${card.mechanicalId}`);
  }
});

test("same seed produces the same opening", () => {
  const first = generateKit(cards, "the-black-rose");
  const second = generateKit(cards, "the-black-rose");
  assert.deepEqual(first, second);
  assert.notDeepEqual(first, generateKit(cards, "the-black-rose-2"));
});

test("kit and booster slot counts match official collation", () => {
  const kit = generateKit(cards, "slot-audit");
  assert.equal(kit.seededPack.length, 15);
  assert.equal(kit.pool.length, 85);
  assert.equal(kit.packs.length, 5);
  for (const pack of kit.packs) {
    assert.equal(pack.length, 14);
    assert.equal(pack.filter((pull) => pull.slot === "common").length, 7);
    assert.equal(pack.filter((pull) => pull.slot === "uncommon").length, 3);
    assert.equal(pack.filter((pull) => pull.slot.startsWith("rare-or-better")).length, 2);
    assert.equal(pack.filter((pull) => pull.slot === "foil").length, 1);
    assert.equal(pack.filter((pull) => pull.slot === "token-or-rune").length, 1);
    assert.equal(pack[10].slot, "foil");
    assert.ok(
      ["common", "uncommon", "rare"].includes(
        cardsById.get(pack[10].cardId)!.rarity,
      ),
    );
    assert.equal(pack[11].slot, "rare-or-better-1");
    assert.equal(cardsById.get(pack[11].cardId)!.rarity, "rare");
    assert.equal(cardsById.get(pack[11].cardId)!.treatment, "base");
    assert.equal(pack[12].slot, "rare-or-better-2");
    if (cardsById.get(pack[10].cardId)!.rarity === "rare") {
      assert.equal(cardsById.get(pack[12].cardId)!.rarity, "epic");
      assert.equal(cardsById.get(pack[12].cardId)!.treatment, "base");
    }
    assert.equal(pack[13].slot, "token-or-rune");
    const mechanicalIds = pack.map(
      (pull) => cardsById.get(pull.cardId)!.mechanicalId,
    );
    assert.equal(
      new Set(mechanicalIds).size,
      mechanicalIds.length,
      "a physical booster must not repeat the same mechanical card",
    );
  }
});

test("booster collation prevents impossible Battlefield and Legend clusters", () => {
  for (let kitIndex = 0; kitIndex < 100; kitIndex += 1) {
    const kit = generateKit(cards, `collation-guard-${kitIndex}`);
    for (const pack of kit.packs) {
      const uncommons = pack.slice(7, 10);
      assert.ok(
        uncommons.every((pull) => pull.slot === "uncommon"),
        "cards 8–10 must be the three uncommon slots",
      );
      const uncommonBattlefields = uncommons.filter((pull) =>
        cardsById.get(pull.cardId)!.types.includes("battlefield"),
      );
      assert.ok(
        uncommonBattlefields.length <= 1,
        "cards 8–10 may contain at most one Battlefield",
      );

      const premiumCards = pack.filter(
        (pull) =>
          pull.slot === "foil" || pull.slot.startsWith("rare-or-better"),
      );
      const premiumLegends = premiumCards.filter((pull) =>
        cardsById.get(pull.cardId)!.types.includes("legend"),
      );
      assert.ok(premiumLegends.length <= 1);

      const epicOrAbove = premiumCards.filter((pull) => {
        const card = cardsById.get(pull.cardId)!;
        return (
          card.rarity === "epic" ||
          ["alt", "special-alt", "overnumber"].includes(card.treatment)
        );
      });
      assert.ok(epicOrAbove.length <= 1);
    }
  }
});

test("nine champion packs remain reachable and structurally valid", () => {
  const seen = new Set<string>();
  const presetByTheme = new Map<string, string[]>();
  for (let index = 0; index < 500 && seen.size < SEEDED_THEMES.length; index += 1) {
    const kit = generateKit(cards, `theme-${index}`);
    seen.add(kit.theme.id);
    const presetIds = kit.seededPack.map((pull) => pull.cardId);
    const previousPreset = presetByTheme.get(kit.theme.id);
    if (previousPreset) assert.deepEqual(presetIds, previousPreset);
    else presetByTheme.set(kit.theme.id, presetIds);
    const packCards = kit.seededPack.map((pull) => cardsById.get(pull.cardId)!);
    assert.ok(packCards[0].types.includes("legend"));
    assert.ok(packCards[1].isChampion);
    assert.ok(packCards[2].types.includes("battlefield"));
  }
  assert.equal(seen.size, SEEDED_THEMES.length);
});

test("estimated rates converge near their disclosed targets", () => {
  const random = createRandom("published-rate-audit");
  const packs = 100_000;
  let epicPacks = 0;
  let altPacks = 0;
  let overnumberPacks = 0;
  for (let index = 0; index < packs; index += 1) {
    const slots = [rollRareSlotTreatment(random), rollRareSlotTreatment(random)];
    if (slots.includes("epic")) epicPacks += 1;
    if (slots.includes("alt")) altPacks += 1;
    if (slots.includes("overnumber")) overnumberPacks += 1;
  }
  assert.ok(Math.abs(epicPacks / packs - 0.25) < 0.006);
  assert.ok(Math.abs(altPacks / packs - 2 / 24) < 0.004);
  assert.ok(Math.abs(overnumberPacks / packs - 1 / 72) < 0.002);
});

test("auto-builder returns a legal deck across hundreds of openings", () => {
  for (let index = 0; index < 300; index += 1) {
    const kit = generateKit(cards, `legal-build-${index}`);
    const deck = autoBuildDeck(kit, cards);
    const result = validateDeck(kit, cards, deck);
    assert.equal(result.valid, true, `${index}: ${result.errors.join("; ")}`);
    assert.equal(deck.mainUids.length, 25);
    assert.equal(Object.values(deck.runes).reduce((sum, count) => sum + count, 0), 12);
    assert.equal(deck.battlefields.length, 3);
  }
});

test("Pre-Rift exceptions: optional setup, blanks, unlimited copies, and one bonus draw", () => {
  const original = generateKit(cards, "exception-kit");
  const built = autoBuildDeck(original, cards);
  const chosenPull = original.pool.find((pull) => built.mainUids.includes(pull.uid))!;
  const clones = Array.from({ length: 4 }, (_, index) => ({ ...chosenPull, uid: `opened-copy-${index}` }));
  const session: KitSession = { ...original, pool: [...original.pool, ...clones] };
  const mainWithoutFive = built.mainUids.filter((uid) => uid !== chosenPull.uid).slice(0, 20);
  const deck: DeckConfiguration = {
    ...built,
    legendUid: null,
    championUid: null,
    mainUids: [...mainWithoutFive, chosenPull.uid, ...clones.map((pull) => pull.uid)],
    battlefields: ["blank-1", "blank-2", "blank-3"],
  };
  const result = validateDeck(session, cards, deck);
  assert.equal(result.valid, true, result.errors.join("; "));
  assert.equal(result.metrics.bonusDraw, true);
  assert.equal(result.warnings.filter((warning) => warning.includes("bonus")).length, 1);
});

test("validator rejects four domains and rune-domain mismatches", () => {
  const kit = generateKit(cards, "invalid-runes");
  const built = autoBuildDeck(kit, cards);
  const fourDomains = ["fury", "calm", "mind", "body"] as const;
  const outside = "chaos";
  const runes = emptyRunes();
  runes[outside] = 12;
  const result = validateDeck(kit, cards, { ...built, domains: [...fourDomains], runes });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("one and three domains")));
  assert.ok(result.errors.some((error) => error.includes("Runes are outside")));
});

test("Champion tags may mismatch the Legend and Signature cards only need domains", () => {
  const kit = generateKit(cards, "mixed-champion-signature");
  const built = autoBuildDeck(kit, cards);
  const legend = built.legendUid
    ? cardsById.get(kit.pool.find((pull) => pull.uid === built.legendUid)!.cardId)!
    : cardsById.get(kit.seededPack[0].cardId)!;
  const champion = cards.find(
    (card) =>
      card.isChampion &&
      card.types.includes("unit") &&
      card.tags.every((tag) => !legend.tags.includes(tag)) &&
      card.domains.every((domain) => built.domains.includes(domain as never)),
  )!;
  const signature = cards.find(
    (card) =>
      card.isSignature &&
      !card.types.some((type) => ["legend", "battlefield"].includes(type)) &&
      card.domains.every((domain) => built.domains.includes(domain as never)),
  )!;
  assert.ok(champion);
  assert.ok(signature);
  const championPull = { ...kit.pool[0], uid: "mismatched-champion", cardId: champion.id };
  const signaturePull = { ...kit.pool[1], uid: "domain-only-signature", cardId: signature.id };
  const session: KitSession = { ...kit, pool: [...kit.pool, championPull, signaturePull] };
  const mainUids = [...built.mainUids.slice(0, 23), championPull.uid, signaturePull.uid];
  const result = validateDeck(session, cards, {
    ...built,
    legendUid: built.legendUid || kit.seededPack[0].uid,
    championUid: championPull.uid,
    mainUids,
  });
  assert.equal(result.valid, true, result.errors.join("; "));
});

test("promo, token, and Rune cards cannot enter the Main Deck", () => {
  const kit = generateKit(cards, "non-playable-cards");
  const built = autoBuildDeck(kit, cards);
  const rune = kit.pool.find((pull) => {
    const card = cardsById.get(pull.cardId)!;
    return card.types.includes("rune") || card.types.includes("token");
  })!;
  const result = validateDeck(kit, cards, {
    ...built,
    mainUids: [...built.mainUids.slice(0, 24), rune.uid],
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("cannot be included")));
});
