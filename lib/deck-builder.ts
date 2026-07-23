import type {
  CardDefinition,
  CardPull,
  DeckConfiguration,
  Domain,
  KitSession,
  ValidationResult,
} from "./types";
import { DOMAINS } from "./types";

export const DOMAIN_LABELS: Record<Domain, string> = {
  fury: "Fury",
  calm: "Calm",
  mind: "Mind",
  body: "Body",
  chaos: "Chaos",
  order: "Order",
};

export function emptyRunes(): Record<Domain, number> {
  return { fury: 0, calm: 0, mind: 0, body: 0, chaos: 0, order: 0 };
}

export function cardMap(cards: CardDefinition[]) {
  return new Map(cards.map((card) => [card.id, card]));
}

export function pullMap(session: KitSession) {
  return new Map(session.pool.map((pull) => [pull.uid, pull]));
}

export function domainsFor(card: CardDefinition): Domain[] {
  return card.domains.filter((domain): domain is Domain =>
    DOMAINS.includes(domain as Domain),
  );
}

export function isWithinDomains(
  card: CardDefinition,
  domains: readonly Domain[],
) {
  return domainsFor(card).every((domain) => domains.includes(domain));
}

function combinations<T>(items: readonly T[], maxSize: number) {
  const result: T[][] = [];
  const visit = (start: number, current: T[]) => {
    if (current.length) result.push([...current]);
    if (current.length === maxSize) return;
    for (let index = start; index < items.length; index += 1) {
      current.push(items[index]);
      visit(index + 1, current);
      current.pop();
    }
  };
  visit(0, []);
  return result;
}

function isMainDeckCard(card: CardDefinition) {
  return (
    !card.types.includes("legend") &&
    !card.types.includes("battlefield") &&
    !card.types.includes("rune") &&
    !card.types.includes("token") &&
    card.types.some((type) => ["unit", "spell", "gear"].includes(type))
  );
}

function removalScore(card: CardDefinition) {
  const text = card.text.toLowerCase();
  return ["kill", "deal ", "stun", "return", "counter", "-2", "-3"]
    .filter((term) => text.includes(term)).length;
}

function scoreCard(card: CardDefinition, themeWords: string[]) {
  const rarity = { common: 0, uncommon: 0.55, rare: 1.15, epic: 1.65 }[
    card.rarity
  ];
  const energy = card.energy ?? 7;
  const curve =
    energy === 2 ? 2.4 : energy === 3 ? 1.8 : energy === 4 ? 1.3 : energy <= 6 ? 0.8 : 0.2;
  const type = card.types.includes("unit") ? 3 : card.types.includes("gear") ? 1.2 : 1;
  const searchable = `${card.name} ${card.text} ${card.keywords.join(" ")}`.toLowerCase();
  const synergy = themeWords.filter((word) => searchable.includes(word)).length * 1.1;
  return rarity + curve + type + synergy + removalScore(card) * 1.25;
}

function curveKey(card: CardDefinition) {
  const energy = card.energy ?? 0;
  return energy >= 7 ? "7+" : String(energy);
}

export function allocateRunes(
  domains: Domain[],
  mainUids: string[],
  pulls: Map<string, CardPull>,
  cards: Map<string, CardDefinition>,
) {
  const runes = emptyRunes();
  if (!domains.length) return runes;
  const demand = new Map(domains.map((domain) => [domain, 0]));
  for (const uid of mainUids) {
    const pull = pulls.get(uid);
    const card = pull ? cards.get(pull.cardId) : undefined;
    if (!card) continue;
    for (const domain of domainsFor(card)) {
      if (demand.has(domain)) demand.set(domain, (demand.get(domain) || 0) + 1);
    }
  }
  domains.forEach((domain) => {
    runes[domain] = 1;
  });
  let remaining = 12 - domains.length;
  const totalDemand = Array.from(demand.values()).reduce((sum, value) => sum + value, 0);
  while (remaining > 0) {
    const domain = [...domains].sort((a, b) => {
      const targetA = (demand.get(a) || 0) / Math.max(totalDemand, 1) * 12;
      const targetB = (demand.get(b) || 0) / Math.max(totalDemand, 1) * 12;
      return targetB - runes[b] - (targetA - runes[a]);
    })[0];
    runes[domain] += 1;
    remaining -= 1;
  }
  return runes;
}

export function validateDeck(
  session: KitSession,
  cards: CardDefinition[],
  deck: DeckConfiguration,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const cardsById = cardMap(cards);
  const pullsByUid = pullMap(session);
  const uniqueMain = new Set(deck.mainUids);

  if (deck.mainUids.length < 25)
    errors.push(`Main Deck needs ${25 - deck.mainUids.length} more card(s).`);
  if (deck.domains.length < 1 || deck.domains.length > 3)
    errors.push("Choose between one and three domains.");
  if (uniqueMain.size !== deck.mainUids.length)
    errors.push("A physical card from the sealed pool cannot be used twice.");

  const mainCards: CardDefinition[] = [];
  for (const uid of deck.mainUids) {
    const pull = pullsByUid.get(uid);
    const card = pull ? cardsById.get(pull.cardId) : undefined;
    if (!pull || !card) {
      errors.push("Main Deck contains a card outside this sealed pool.");
      continue;
    }
    if (!isMainDeckCard(card))
      errors.push(`${card.name} cannot be included in the Main Deck.`);
    if (!isWithinDomains(card, deck.domains))
      errors.push(`${card.name} falls outside the chosen domains.`);
    mainCards.push(card);
  }

  if (deck.legendUid) {
    const pull = pullsByUid.get(deck.legendUid);
    const legend = pull ? cardsById.get(pull.cardId) : undefined;
    if (!legend?.types.includes("legend"))
      errors.push("The selected Legend is not an opened Legend card.");
    else if (!isWithinDomains(legend, deck.domains))
      errors.push("Both Legend domains must be included in the domain identity.");
  }

  if (deck.championUid) {
    const pull = pullsByUid.get(deck.championUid);
    const champion = pull ? cardsById.get(pull.cardId) : undefined;
    if (!champion?.isChampion)
      errors.push("The Chosen Champion must be an opened Champion Unit.");
    else {
      if (!deck.mainUids.includes(deck.championUid))
        errors.push("The Chosen Champion counts as one of the Main Deck cards.");
      if (!isWithinDomains(champion, deck.domains))
        errors.push("The Chosen Champion falls outside the chosen domains.");
    }
  }

  const runeTotal = DOMAINS.reduce((sum, domain) => sum + deck.runes[domain], 0);
  if (runeTotal !== 12) errors.push(`Rune Deck must contain 12 Runes (${runeTotal}/12).`);
  for (const domain of DOMAINS) {
    if (deck.runes[domain] > 0 && !deck.domains.includes(domain))
      errors.push(`${DOMAIN_LABELS[domain]} Runes are outside the domain identity.`);
  }

  if (deck.battlefields.length !== 3)
    errors.push("Select three Battlefield options for best-of-one Pre-Rift play.");
  const usedBattlefields = new Set<string>();
  for (const battlefield of deck.battlefields) {
    if (battlefield.startsWith("blank-")) continue;
    const pull = pullsByUid.get(battlefield);
    const card = pull ? cardsById.get(pull.cardId) : undefined;
    if (!card?.types.includes("battlefield"))
      errors.push("A selected Battlefield was not opened in this kit.");
    if (usedBattlefields.has(battlefield))
      errors.push("The same physical Battlefield copy cannot fill two slots.");
    usedBattlefields.add(battlefield);
  }

  const units = mainCards.filter((card) => card.types.includes("unit")).length;
  const twoDrops = mainCards.filter(
    (card) => card.types.includes("unit") && card.energy === 2,
  ).length;
  const energies = mainCards
    .map((card) => card.energy)
    .filter((energy): energy is number => energy !== null);
  const curve = mainCards.reduce<Record<string, number>>((result, card) => {
    const key = curveKey(card);
    result[key] = (result[key] || 0) + 1;
    return result;
  }, {});
  if (deck.mainUids.length > 25)
    warnings.push("Legal, but playing exactly 25 cards improves consistency.");
  if (units < 15) warnings.push(`Riot recommends about 15 Units; this build has ${units}.`);
  if (twoDrops < 5)
    warnings.push(`Riot recommends about five 2-Energy Units; this build has ${twoDrops}.`);
  if (!deck.legendUid || !deck.championUid)
    warnings.push("Missing a Legend or Chosen Champion grants one bonus first-turn draw.");

  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)],
    warnings,
    metrics: {
      mainCount: deck.mainUids.length,
      units,
      twoDrops,
      averageEnergy: energies.length
        ? energies.reduce((sum, energy) => sum + energy, 0) / energies.length
        : 0,
      curve,
      bonusDraw: !deck.legendUid || !deck.championUid,
    },
  };
}

function buildBattlefields(
  session: KitSession,
  cardsById: Map<string, CardDefinition>,
) {
  const opened = session.pool.filter((pull) =>
    cardsById.get(pull.cardId)?.types.includes("battlefield"),
  );
  const preferred = opened.find(
    (pull) => cardsById.get(pull.cardId)?.name === session.theme.battlefield,
  );
  const ordered = preferred
    ? [preferred, ...opened.filter((pull) => pull.uid !== preferred.uid)]
    : opened;
  const result = ordered.slice(0, 3).map((pull) => pull.uid);
  while (result.length < 3) result.push(`blank-${result.length + 1}`);
  return result;
}

export function autoBuildDeck(
  session: KitSession,
  cards: CardDefinition[],
): DeckConfiguration {
  const cardsById = cardMap(cards);
  const pullsByUid = pullMap(session);
  const domainOptions = combinations(DOMAINS, 3) as Domain[][];
  const legendPulls = session.pool.filter((pull) =>
    cardsById.get(pull.cardId)?.types.includes("legend"),
  );
  const championPulls = session.pool.filter(
    (pull) => cardsById.get(pull.cardId)?.isChampion,
  );
  let best: { deck: DeckConfiguration; score: number } | null = null;

  for (const domains of domainOptions) {
    const eligible = session.pool.filter((pull) => {
      const card = cardsById.get(pull.cardId);
      return card && isMainDeckCard(card) && isWithinDomains(card, domains);
    });
    if (eligible.length < 25) continue;
    const ranked = eligible.sort(
      (a, b) =>
        scoreCard(cardsById.get(b.cardId)!, session.theme.keywords) -
          scoreCard(cardsById.get(a.cardId)!, session.theme.keywords) ||
        a.uid.localeCompare(b.uid),
    );
    const legendOptions: Array<CardPull | null> = [
      null,
      ...legendPulls.filter((pull) =>
        isWithinDomains(cardsById.get(pull.cardId)!, domains),
      ),
    ];
    const championOptions: Array<CardPull | null> = [
      null,
      ...championPulls.filter((pull) =>
        isWithinDomains(cardsById.get(pull.cardId)!, domains),
      ),
    ];
    for (const legend of legendOptions) {
      for (const champion of championOptions) {
        const selected: CardPull[] = champion ? [champion] : [];
        const remaining = ranked
          .filter((pull) => pull.uid !== champion?.uid)
          .slice();

        const takeUntil = (
          predicate: (card: CardDefinition) => boolean,
          target: number,
        ) => {
          let matching = selected.filter((pull) =>
            predicate(cardsById.get(pull.cardId)!),
          ).length;
          for (let index = 0; index < remaining.length && matching < target; ) {
            const pull = remaining[index];
            if (predicate(cardsById.get(pull.cardId)!)) {
              selected.push(pull);
              remaining.splice(index, 1);
              matching += 1;
            } else index += 1;
          }
        };
        takeUntil(
          (card) => card.types.includes("unit") && card.energy === 2,
          5,
        );
        takeUntil((card) => card.types.includes("unit"), 15);
        while (selected.length < 25 && remaining.length) selected.push(remaining.shift()!);
        if (selected.length < 25) continue;

        const mainUids = selected.slice(0, 25).map((pull) => pull.uid);
        const deck: DeckConfiguration = {
          domains,
          legendUid: legend?.uid || null,
          championUid: champion?.uid || null,
          mainUids,
          runes: allocateRunes(domains, mainUids, pullsByUid, cardsById),
          battlefields: buildBattlefields(session, cardsById),
        };
        const result = validateDeck(session, cards, deck);
        if (!result.valid) continue;
        const cardScore = selected.reduce(
          (sum, pull) => sum + scoreCard(cardsById.get(pull.cardId)!, session.theme.keywords),
          0,
        );
        const score =
          cardScore +
          Math.min(result.metrics.units, 15) * 1.2 +
          Math.min(result.metrics.twoDrops, 5) * 1.7 +
          (legend ? 5 : 0) +
          (champion ? 4 : 0) -
          domains.length * 0.35;
        if (!best || score > best.score) best = { deck, score };
      }
    }
  }

  if (!best) {
    throw new Error("The generated kit did not contain a legal 25-card build.");
  }
  return best.deck;
}
