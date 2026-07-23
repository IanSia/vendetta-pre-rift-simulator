export const DOMAINS = [
  "fury",
  "calm",
  "mind",
  "body",
  "chaos",
  "order",
] as const;

export type Domain = (typeof DOMAINS)[number];
export type Rarity = "common" | "uncommon" | "rare" | "epic";
export type Treatment =
  | "base"
  | "alt"
  | "special-alt"
  | "overnumber"
  | "rune"
  | "token";

export interface CardDefinition {
  id: string;
  mechanicalId: string;
  collectorNumber: number;
  publicCode: string;
  name: string;
  rarity: Rarity;
  treatment: Treatment;
  domains: string[];
  types: string[];
  superTypes: string[];
  tags: string[];
  energy: number | null;
  might: number | null;
  text: string;
  keywords: string[];
  isChampion: boolean;
  isSignature: boolean;
  imagePath: string;
  sourceImageUrl: string;
  accessibilityText: string;
}

export interface VendettaManifest {
  source: string;
  preRiftSource: string;
  sourceUpdatedAt: string;
  syncedAt: string;
  officialRecordCount: number;
  promoSource: string;
  cards: CardDefinition[];
}

export type PullSource = "promo" | "seeded" | "booster";

export interface CardPull {
  uid: string;
  cardId: string;
  source: PullSource;
  slot: string;
  packIndex?: number;
  foil?: boolean;
  signed?: boolean;
  playable: boolean;
}

export interface SeededTheme {
  id: string;
  champion: string;
  legendId: string;
  championId: string;
  domains: Domain[];
  keywords: string[];
  battlefield: string;
  summary: string;
}

export interface KitSession {
  seed: string;
  promo: CardPull;
  theme: SeededTheme;
  seededPack: CardPull[];
  packs: CardPull[][];
  pool: CardPull[];
}

export interface DeckConfiguration {
  domains: Domain[];
  legendUid: string | null;
  championUid: string | null;
  mainUids: string[];
  runes: Record<Domain, number>;
  battlefields: string[];
}

export interface DeckMetrics {
  mainCount: number;
  units: number;
  twoDrops: number;
  averageEnergy: number;
  curve: Record<string, number>;
  bonusDraw: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  metrics: DeckMetrics;
}

export interface CollationConfig {
  official: {
    common: number;
    uncommon: number;
    rareOrBetter: number;
    foil: number;
    tokenOrRune: number;
  };
  estimatedRareSlotWeights: {
    rare: number;
    epic: number;
    alt: number;
    overnumber: number;
  };
  estimatedSignedOvernumberRate: number;
}
