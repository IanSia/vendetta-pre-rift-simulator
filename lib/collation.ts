import { createRandom, type RandomSource } from "./prng";
import type {
  CardDefinition,
  CardPull,
  CollationConfig,
  Domain,
  KitSession,
  SeededTheme,
} from "./types";

export const COLLATION_CONFIG: CollationConfig = {
  official: {
    common: 7,
    uncommon: 3,
    rareOrBetter: 2,
    foil: 1,
    tokenOrRune: 1,
  },
  estimatedRareSlotWeights: {
    rare: 0.81742,
    epic: 0.13397,
    alt: 0.04167,
    overnumber: 0.00694,
  },
  estimatedSignedOvernumberRate: 0.1,
};

export const SEEDED_THEMES: SeededTheme[] = [
  {
    id: "jayce",
    champion: "Jayce",
    legendId: "ven-149-166",
    championId: "ven-088-166",
    domains: ["mind", "body"],
    keywords: ["gear", "mech", "ready"],
    battlefield: "Piltovan Forge",
    summary: "Build, recycle, and turn Gear into efficient answers.",
  },
  {
    id: "kennen",
    champion: "Kennen",
    legendId: "ven-155-166",
    championId: "ven-135-166",
    domains: ["order", "chaos"],
    keywords: ["flow", "trash", "spell"],
    battlefield: "Mystic Vortex",
    summary: "Chain Flow spells and reuse the cards in your trash.",
  },
  {
    id: "akali",
    champion: "Akali",
    legendId: "ven-139-166",
    championId: "ven-038-166",
    domains: ["fury", "calm"],
    keywords: ["move", "attack", "conquer", "retreat"],
    battlefield: "Kinkou Temple",
    summary: "Strike quickly, retreat, and keep conquering.",
  },
  {
    id: "ambessa",
    champion: "Ambessa",
    legendId: "ven-153-166",
    championId: "ven-084-166",
    domains: ["body", "order"],
    keywords: ["empower", "ready", "assault"],
    battlefield: "Risen Altar",
    summary: "Empower the warband and attack again before they recover.",
  },
  {
    id: "nasus",
    champion: "Nasus",
    legendId: "ven-145-166",
    championId: "ven-063-166",
    domains: ["calm", "mind"],
    keywords: ["empower", "rune", "cost", "seven"],
    battlefield: "Sandswept Tomb",
    summary: "Ramp toward expensive threats and dominate the late game.",
  },
  {
    id: "zed",
    champion: "Zed",
    legendId: "ven-143-166",
    championId: "ven-112-166",
    domains: ["fury", "chaos"],
    keywords: ["burn", "flow", "trash", "discard"],
    battlefield: "Shadow Temple",
    summary: "Burn and discard now, then attack from the trash.",
  },
  {
    id: "shen",
    champion: "Shen",
    legendId: "ven-147-166",
    championId: "ven-042-166",
    domains: ["calm", "order"],
    keywords: ["hidden", "hold", "defend", "shield"],
    battlefield: "Threshold of the Gray",
    summary: "Hold battlefields with pairs of units and hidden tricks.",
  },
  {
    id: "renekton",
    champion: "Renekton",
    legendId: "ven-141-166",
    championId: "ven-019-166",
    domains: ["fury", "body"],
    keywords: ["recycle", "rune", "assault", "damage"],
    battlefield: "Protective Sands",
    summary: "Recycle runes for explosive turns and overwhelming Might.",
  },
  {
    id: "mel",
    champion: "Mel",
    legendId: "ven-151-166",
    championId: "ven-110-166",
    domains: ["mind", "chaos"],
    keywords: ["spell", "damage", "kill", "deflect"],
    battlefield: "Heisho, Shell of the World",
    summary: "Control the board with spells and precise removal.",
  },
];

function domainSet(card: CardDefinition) {
  return card.domains.filter((domain) => domain !== "colorless") as Domain[];
}

function isWithin(card: CardDefinition, domains: readonly Domain[]) {
  return domainSet(card).every((domain) => domains.includes(domain));
}

function weightedPick<T>(
  random: RandomSource,
  entries: readonly { item: T; weight: number }[],
) {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let target = random.next() * total;
  for (const entry of entries) {
    target -= entry.weight;
    if (target <= 0) return entry.item;
  }
  return entries[entries.length - 1].item;
}

function makePull(
  card: CardDefinition,
  uid: string,
  source: CardPull["source"],
  slot: string,
  options: Partial<CardPull> = {},
): CardPull {
  return {
    uid,
    cardId: card.id,
    source,
    slot,
    playable: source !== "promo" && !["rune", "token"].some((type) =>
      card.types.includes(type),
    ),
    ...options,
  };
}

export function rollRareSlotTreatment(random: RandomSource) {
  const roll = random.next();
  const weights = COLLATION_CONFIG.estimatedRareSlotWeights;
  let treatment: "rare" | "epic" | "alt" | "overnumber" = "rare";
  if (roll >= weights.rare && roll < weights.rare + weights.epic)
    treatment = "epic";
  else if (
    roll >= weights.rare + weights.epic &&
    roll < weights.rare + weights.epic + weights.alt
  )
    treatment = "alt";
  else if (roll >= weights.rare + weights.epic + weights.alt)
    treatment = "overnumber";
  return treatment;
}

function rareSlot(
  random: RandomSource,
  cards: CardDefinition[],
  excludedMechanicalIds: ReadonlySet<string>,
  excludeLegends: boolean,
  excludeEpicOrAbove: boolean,
) {
  const treatment = excludeEpicOrAbove
    ? "rare"
    : rollRareSlotTreatment(random);
  const pool =
    treatment === "alt"
      ? cards.filter(
          (card) =>
            (card.treatment === "alt" || card.treatment === "special-alt") &&
            (!excludeLegends || !card.types.includes("legend")) &&
            !excludedMechanicalIds.has(card.mechanicalId),
        )
      : treatment === "overnumber"
        ? cards.filter(
            (card) =>
              card.treatment === "overnumber" &&
              (!excludeLegends || !card.types.includes("legend")) &&
              !excludedMechanicalIds.has(card.mechanicalId),
          )
        : cards.filter(
            (card) =>
              card.treatment === "base" &&
              card.rarity === treatment &&
              (!excludeLegends || !card.types.includes("legend")) &&
              !excludedMechanicalIds.has(card.mechanicalId),
          );
  return {
    card: random.pick(pool),
    signed:
      treatment === "overnumber" &&
      random.next() < COLLATION_CONFIG.estimatedSignedOvernumberRate,
    treatment,
  };
}

function isEpicOrAbove(card: CardDefinition) {
  return (
    card.rarity === "epic" ||
    ["alt", "special-alt", "overnumber"].includes(card.treatment)
  );
}

function generateBooster(
  random: RandomSource,
  cards: CardDefinition[],
  packIndex: number,
) {
  const pulls: CardPull[] = [];
  const usedMechanicalIds = new Set<string>();
  let uidIndex = 0;
  const add = (
    card: CardDefinition,
    slot: string,
    options: Partial<CardPull> = {},
  ) => {
    usedMechanicalIds.add(card.mechanicalId);
    pulls.push(
      makePull(
        card,
        `p${packIndex}-${String(uidIndex++).padStart(2, "0")}`,
        "booster",
        slot,
        { packIndex, ...options },
      ),
    );
  };

  const commonPool = cards.filter(
    (card) => card.treatment === "base" && card.rarity === "common",
  );
  const uncommonPool = cards.filter(
    (card) => card.treatment === "base" && card.rarity === "uncommon",
  );
  random
    .shuffle(commonPool)
    .slice(0, COLLATION_CONFIG.official.common)
    .forEach((card) => add(card, "common"));
  const selectedUncommons: CardDefinition[] = [];
  for (const card of random.shuffle(uncommonPool)) {
    const battlefieldCount = selectedUncommons.filter((selected) =>
      selected.types.includes("battlefield"),
    ).length;
    if (card.types.includes("battlefield") && battlefieldCount >= 1) continue;
    selectedUncommons.push(card);
    if (selectedUncommons.length === COLLATION_CONFIG.official.uncommon) break;
  }
  selectedUncommons.forEach((card) => add(card, "uncommon"));

  const foilPool = cards.filter(
    (card) =>
      card.treatment === "base" &&
      ["common", "uncommon", "rare"].includes(card.rarity) &&
      !usedMechanicalIds.has(card.mechanicalId),
  );
  const foil = random.pick(foilPool);
  add(foil, "foil", { foil: true });
  let premiumLegendPulled = foil.types.includes("legend");
  let epicOrAbovePulled = isEpicOrAbove(foil);

  const guaranteedRarePool = cards.filter(
    (card) =>
      card.treatment === "base" &&
      card.rarity === "rare" &&
      (!premiumLegendPulled || !card.types.includes("legend")) &&
      !usedMechanicalIds.has(card.mechanicalId),
  );
  const guaranteedRare = random.pick(guaranteedRarePool);
  add(guaranteedRare, "rare-or-better-1");
  premiumLegendPulled ||= guaranteedRare.types.includes("legend");

  if (foil.rarity === "rare") {
    const guaranteedEpicPool = cards.filter(
      (card) =>
        card.treatment === "base" &&
        card.rarity === "epic" &&
        (!premiumLegendPulled || !card.types.includes("legend")) &&
        !usedMechanicalIds.has(card.mechanicalId),
    );
    const guaranteedEpic = random.pick(guaranteedEpicPool);
    add(guaranteedEpic, "rare-or-better-2");
  } else {
    const result = rareSlot(
      random,
      cards,
      usedMechanicalIds,
      premiumLegendPulled,
      epicOrAbovePulled,
    );
    add(result.card, "rare-or-better-2", {
      signed: result.signed,
    });
    premiumLegendPulled ||= result.card.types.includes("legend");
    epicOrAbovePulled ||= isEpicOrAbove(result.card);
  }

  const tokenPool = cards.filter(
    (card) => card.treatment === "rune" || card.treatment === "token",
  );
  add(random.pick(tokenPool), "token-or-rune");
  return pulls;
}

function generateSeededPack(cards: CardDefinition[], theme: SeededTheme) {
  const presetRandom = createRandom(`vendetta-seeded-${theme.id}-v1`);
  const byId = new Map(cards.map((card) => [card.id, card]));
  const legend = byId.get(theme.legendId);
  const champion = byId.get(theme.championId);
  if (!legend || !champion) throw new Error(`Missing seeded cards for ${theme.id}.`);
  const battlefield =
    cards.find(
      (card) =>
        card.treatment === "base" &&
        card.types.includes("battlefield") &&
        card.name === theme.battlefield,
    ) ||
    presetRandom.pick(
      cards.filter(
        (card) => card.treatment === "base" && card.types.includes("battlefield"),
      ),
    );

  const supportPool = cards.filter(
    (card) =>
      card.treatment === "base" &&
      (card.rarity === "common" || card.rarity === "uncommon") &&
      !card.isChampion &&
      card.types.some((type) => ["unit", "spell", "gear"].includes(type)) &&
      isWithin(card, theme.domains),
  );
  const support: CardDefinition[] = [];
  const remaining = [...supportPool];
  while (support.length < 12 && remaining.length) {
    const chosen = weightedPick(
      presetRandom,
      remaining.map((card) => {
        const searchable = `${card.name} ${card.text} ${card.keywords.join(" ")}`.toLowerCase();
        const synergy = theme.keywords.filter((word) => searchable.includes(word)).length;
        const curve = card.types.includes("unit") && (card.energy || 9) <= 3 ? 1.5 : 0;
        return {
          item: card,
          weight: 1 + synergy * 2.5 + curve + (card.rarity === "uncommon" ? 0.5 : 0),
        };
      }),
    );
    support.push(chosen);
    remaining.splice(remaining.indexOf(chosen), 1);
  }

  return [legend, champion, battlefield, ...support].map((card, index) =>
    makePull(card, `seeded-${String(index).padStart(2, "0")}`, "seeded", 
      index === 0 ? "legend" : index === 1 ? "rare-champion" : index === 2 ? "battlefield" : "support"),
  );
}

export function generateKit(cards: CardDefinition[], seed: string): KitSession {
  const random = createRandom(seed);
  const theme = random.pick(SEEDED_THEMES);
  const seededPack = generateSeededPack(cards, theme);
  const packs = Array.from({ length: 5 }, (_, index) =>
    generateBooster(random, cards, index + 1),
  );
  const riven =
    cards.find(
      (card) => card.name === "Riven, Shattered" && card.treatment === "base",
    ) || cards.find((card) => card.name === "Riven, Shattered");
  if (!riven) throw new Error("Riven promo source card is missing.");
  const promo = makePull(riven, "promo-riven", "promo", "promo", {
    playable: false,
  });
  const pool = [...seededPack, ...packs.flat()];
  return { seed, promo, theme, seededPack, packs, pool };
}
