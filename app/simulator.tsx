"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  allocateRunes,
  autoBuildDeck,
  cardMap,
  DOMAIN_LABELS,
  isWithinDomains,
  pullMap,
  validateDeck,
} from "@/lib/deck-builder";
import { generateKit } from "@/lib/collation";
import { randomSeed } from "@/lib/prng";
import { DOMAINS } from "@/lib/types";
import type {
  CardDefinition,
  CardPull,
  DeckConfiguration,
  Domain,
  KitSession,
} from "@/lib/types";

type Phase = "intro" | "seeded" | "pack" | "pool" | "builder";

const RARITY_ORDER = { common: 0, uncommon: 1, rare: 2, epic: 3 };

function cleanText(card: CardDefinition) {
  return card.accessibilityText
    .replace(/^Riftbound (?:Unit|Spell|Gear|Legend|Battlefield):\s*/i, "")
    .replace(/^[\s\S]*?\.\s(?=\[|[A-Z])/, "")
    .trim();
}

function titleCase(value: string) {
  return value
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function isMainCard(card: CardDefinition) {
  return (
    !card.types.some((type) =>
      ["legend", "battlefield", "rune", "token"].includes(type),
    ) && card.types.some((type) => ["unit", "spell", "gear"].includes(type))
  );
}

function pullCard(
  pull: CardPull | undefined,
  cardsById: Map<string, CardDefinition>,
) {
  return pull ? cardsById.get(pull.cardId) : undefined;
}

function CardArt({
  card,
  pull,
  promo = false,
  compact = false,
  onZoom,
}: {
  card: CardDefinition;
  pull?: CardPull;
  promo?: boolean;
  compact?: boolean;
  onZoom?: () => void;
}) {
  const treatment = pull?.signed
    ? "Signed overnumber"
    : pull?.foil && card.treatment === "base"
      ? `Foil ${card.rarity}`
      : card.treatment !== "base"
        ? titleCase(card.treatment)
        : card.rarity;
  return (
    <button
      className={`card-art rarity-${card.rarity} treatment-${card.treatment}${pull?.foil ? " is-foil" : ""}${compact ? " is-compact" : ""}`}
      onClick={onZoom}
      type="button"
      aria-label={`Inspect ${card.name}`}
    >
      <Image
        src={promo ? "/cards/riven-prerift-promo.webp" : card.imagePath}
        alt={promo ? "Stamped Riven Pre-Rift promo" : card.accessibilityText}
        width={744}
        height={1039}
        priority={!compact}
        sizes={compact ? "(max-width: 760px) 25vw, 10vw" : "(max-width: 760px) 75vw, 370px"}
      />
      <span className="card-treatment">{titleCase(treatment)}</span>
      {pull?.signed ? <span className="signature-mark">10</span> : null}
    </button>
  );
}

function FacedownCard({ label }: { label: string }) {
  return (
    <div className="facedown-card" aria-label={label}>
      <div className="rift-mark">V</div>
      <span>Vendetta</span>
      <small>{label}</small>
    </div>
  );
}

function CardModal({
  pull,
  card,
  promo,
  onClose,
}: {
  pull?: CardPull;
  card: CardDefinition;
  promo?: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="card-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`${card.name} card details`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <CardArt card={card} pull={pull} promo={promo} />
        <div className="card-details">
          <button className="icon-button modal-close" onClick={onClose} type="button">
            ×<span className="sr-only">Close</span>
          </button>
          <p className="eyebrow">{card.publicCode} · {titleCase(card.rarity)}</p>
          <h2>{promo ? "Riven · Pre-Rift Promo" : card.name}</h2>
          <div className="detail-tags">
            {card.domains.map((domain) => <span key={domain}>{titleCase(domain)}</span>)}
            {card.types.map((type) => <span key={type}>{titleCase(type)}</span>)}
            {pull?.foil ? <span>Foil</span> : null}
            {pull?.signed ? <span>Signature treatment</span> : null}
          </div>
          {promo ? (
            <p className="rules-copy">Exclusive stamped keepsake. It is not part of the sealed pool and cannot enter your Pre-Rift deck.</p>
          ) : (
            <p className="rules-copy">{cleanText(card) || "No rules text."}</p>
          )}
          <dl className="stats-row">
            <div><dt>Energy</dt><dd>{card.energy ?? "—"}</dd></div>
            <div><dt>Might</dt><dd>{card.might ?? "—"}</dd></div>
            <div><dt>Treatment</dt><dd>{titleCase(card.treatment)}</dd></div>
          </dl>
        </div>
      </section>
    </div>
  );
}

function Methodology({ onClose, updatedAt }: { onClose: () => void; updatedAt: string }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="method-modal" role="dialog" aria-modal="true" aria-labelledby="odds-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="icon-button modal-close" onClick={onClose} type="button">×<span className="sr-only">Close</span></button>
        <p className="eyebrow">Transparent simulation model</p>
        <h2 id="odds-title">Odds & methodology</h2>
        <div className="method-grid">
          <article>
            <span className="status-dot official" />
            <h3>Official facts</h3>
            <ul>
              <li>One random 15-card champion pack and five randomized Vendetta boosters.</li>
              <li>Each champion pack guarantees its Legend, Rare Champion, one Battlefield, and 12 support cards.</li>
              <li>Each booster has 7 Commons, 3 Uncommons, 2 rare-or-better cards, 1 foil, and 1 token/rune slot.</li>
              <li>A booster never repeats the same mechanical card; different boosters can still produce additional copies.</li>
            </ul>
          </article>
          <article>
            <span className="status-dot estimate" />
            <h3>Clearly labeled estimates</h3>
            <ul>
              <li>Before a premium hit, a rare-or-better roll uses 81.742% Rare, 13.397% Epic, 4.167% alternate, and 0.694% overnumber.</li>
              <li>That targets about a 25% pack chance for an Epic, 2 alternates per display, and 1 overnumber per 3 displays.</li>
              <li>Signature treatment is modeled on 10% of overnumbers; eligible cards are uniform within treatment pools.</li>
              <li>The final foil plus two rare-or-better cards contain at most one Legend and at most one Epic or showcase treatment.</li>
              <li>Card 11 is foil Common/Uncommon/Rare, card 12 is a guaranteed base Rare, card 13 becomes a guaranteed base Epic when the foil is Rare, and the token/Rune card is last.</li>
              <li>The nine champion packs are equally likely. Their unpublished support cards are seeded from on-domain curve and theme synergy.</li>
            </ul>
          </article>
        </div>
        <p className="source-stamp">Official gallery snapshot: {new Date(updatedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</p>
      </section>
    </div>
  );
}

function Progress({ phase, packIndex }: { phase: Phase; packIndex: number }) {
  const current = phase === "intro" ? 0 : phase === "seeded" ? 1 : phase === "pack" ? 2 + packIndex : phase === "pool" ? 7 : 8;
  const steps = ["Kit", "Champion", "1", "2", "3", "4", "5", "Pool", "Deck"];
  return (
    <ol className="progress" aria-label="Opening progress">
      {steps.map((label, index) => (
        <li key={label + index} className={index < current ? "done" : index === current ? "current" : ""}>
          <span>{index < current ? "✓" : label}</span>
        </li>
      ))}
    </ol>
  );
}

function RevealGallery({
  pulls,
  revealed,
  cardsById,
  onZoom,
}: {
  pulls: CardPull[];
  revealed: number;
  cardsById: Map<string, CardDefinition>;
  onZoom: (pull: CardPull) => void;
}) {
  return (
    <div className="reveal-gallery">
      {pulls.map((pull, index) => {
        const card = cardsById.get(pull.cardId)!;
        return index < revealed ? (
          <CardArt key={pull.uid} card={card} pull={pull} compact onZoom={() => onZoom(pull)} />
        ) : (
          <div className="mini-facedown" key={pull.uid} aria-label="Unrevealed card"><span>V</span></div>
        );
      })}
    </div>
  );
}

function OpeningStage({
  kicker,
  title,
  copy,
  pulls,
  revealed,
  cardsById,
  onZoom,
  featuredPull,
  singleReveal = false,
  sealedImage,
  onSealedClick,
}: {
  kicker: string;
  title: string;
  copy: string;
  pulls: CardPull[];
  revealed: number;
  cardsById: Map<string, CardDefinition>;
  onZoom: (pull: CardPull) => void;
  featuredPull?: CardPull;
  singleReveal?: boolean;
  sealedImage?: string;
  onSealedClick?: () => void;
}) {
  const current = revealed > 0 ? featuredPull || pulls[revealed - 1] : undefined;
  const card = pullCard(current, cardsById);
  return (
    <section className={`opening-stage${singleReveal ? " single-reveal" : ""}`}>
      <div className="opening-copy">
        <p className="eyebrow">{kicker}</p>
        <h1>{title}</h1>
        <p>{copy}</p>
        {card ? (
          <div className="current-card-meta" aria-live="polite">
            <span>{card.publicCode}</span>
            <h2>{card.name}</h2>
            <p>{titleCase(current?.signed ? "signed-overnumber" : current?.foil ? `foil-${card.rarity}` : card.treatment !== "base" ? card.treatment : card.rarity)}</p>
          </div>
        ) : null}
      </div>
      <div className="hero-card-slot">
        {card && current ? (
          <div className="card-reveal" key={current.uid}>
            <CardArt card={card} pull={current} onZoom={() => onZoom(current)} />
          </div>
        ) : sealedImage ? (
          <button
            className="sealed-booster"
            type="button"
            onClick={onSealedClick}
            aria-label="Open this Vendetta booster"
          >
            <Image
              src={sealedImage}
              alt="Riftbound Vendetta 14-card booster pack featuring Akali"
              width={765}
              height={1244}
              priority
            />
            <span>Click to tear open</span>
          </button>
        ) : <FacedownCard label={kicker} />}
      </div>
      {!singleReveal ? <RevealGallery pulls={pulls} revealed={revealed} cardsById={cardsById} onZoom={onZoom} /> : null}
    </section>
  );
}

function PoolView({
  session,
  cardsById,
  onZoom,
}: {
  session: KitSession;
  cardsById: Map<string, CardDefinition>;
  onZoom: (pull: CardPull) => void;
}) {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const pulls = useMemo(() => session.pool.filter((pull) => {
    const card = cardsById.get(pull.cardId)!;
    const matchesFilter = filter === "all" || card.rarity === filter || card.treatment === filter || card.types.includes(filter);
    return matchesFilter && card.name.toLowerCase().includes(query.toLowerCase());
  }).sort((a, b) => {
    const cardA = cardsById.get(a.cardId)!;
    const cardB = cardsById.get(b.cardId)!;
    return RARITY_ORDER[cardB.rarity] - RARITY_ORDER[cardA.rarity] || cardA.name.localeCompare(cardB.name);
  }), [cardsById, filter, query, session.pool]);
  const stats = useMemo(() => ({
    units: session.pool.filter((pull) => cardsById.get(pull.cardId)?.types.includes("unit")).length,
    epics: session.pool.filter((pull) => cardsById.get(pull.cardId)?.rarity === "epic").length,
    showcases: session.pool.filter((pull) => cardsById.get(pull.cardId)?.treatment !== "base").length,
  }), [cardsById, session.pool]);
  return (
    <section className="pool-view">
      <div className="section-heading">
        <div><p className="eyebrow">Sealed pool complete</p><h1>Read what the rift gave you.</h1></div>
        <div className="pool-stats">
          <span><strong>{session.pool.length}</strong> cards</span>
          <span><strong>{stats.units}</strong> units</span>
          <span><strong>{stats.epics}</strong> epics</span>
          <span><strong>{stats.showcases}</strong> showcases</span>
        </div>
      </div>
      <div className="pool-toolbar">
        <div className="filter-row">
          {["all", "unit", "spell", "gear", "epic", "alt", "overnumber"].map((value) => (
            <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)} type="button">{titleCase(value)}</button>
          ))}
        </div>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search the pool" aria-label="Search the sealed pool" />
      </div>
      <div className="pool-grid">
        {pulls.map((pull) => <CardArt key={pull.uid} card={cardsById.get(pull.cardId)!} pull={pull} compact onZoom={() => onZoom(pull)} />)}
      </div>
    </section>
  );
}

function groupedPulls(pulls: CardPull[], cardsById: Map<string, CardDefinition>) {
  const groups = new Map<string, CardPull[]>();
  for (const pull of pulls) {
    const card = cardsById.get(pull.cardId);
    if (!card) continue;
    const key = card.mechanicalId;
    groups.set(key, [...(groups.get(key) || []), pull]);
  }
  return [...groups.values()].sort((a, b) => {
    const cardA = cardsById.get(a[0].cardId)!;
    const cardB = cardsById.get(b[0].cardId)!;
    return (cardA.energy ?? 99) - (cardB.energy ?? 99) || cardA.name.localeCompare(cardB.name);
  });
}

function DeckBuilder({
  session,
  cards,
  cardsById,
  onZoom,
}: {
  session: KitSession;
  cards: CardDefinition[];
  cardsById: Map<string, CardDefinition>;
  onZoom: (pull: CardPull) => void;
}) {
  const pullsByUid = useMemo(() => pullMap(session), [session]);
  const [deck, setDeck] = useState<DeckConfiguration>(() => autoBuildDeck(session, cards));
  const validation = useMemo(() => validateDeck(session, cards, deck), [cards, deck, session]);
  const openedLegends = session.pool.filter((pull) => cardsById.get(pull.cardId)?.types.includes("legend"));
  const openedChampions = session.pool.filter((pull) => cardsById.get(pull.cardId)?.isChampion);
  const openedBattlefields = session.pool.filter((pull) => cardsById.get(pull.cardId)?.types.includes("battlefield"));
  const mainSet = new Set(deck.mainUids);
  const sideboard = session.pool.filter((pull) => !mainSet.has(pull.uid) && !cardsById.get(pull.cardId)?.types.includes("rune") && !cardsById.get(pull.cardId)?.types.includes("token"));
  const mainGroups = groupedPulls(deck.mainUids.map((uid) => pullsByUid.get(uid)!).filter(Boolean), cardsById);
  const sideGroups = groupedPulls(sideboard, cardsById);

  const updateMain = useCallback((mainUids: string[], domains = deck.domains) => {
    setDeck((current) => ({
      ...current,
      domains,
      mainUids,
      runes: allocateRunes(domains, mainUids, pullsByUid, cardsById),
      championUid: current.championUid && mainUids.includes(current.championUid) ? current.championUid : null,
    }));
  }, [cardsById, deck.domains, pullsByUid]);

  const toggleDomain = (domain: Domain) => {
    const next = deck.domains.includes(domain)
      ? deck.domains.filter((item) => item !== domain)
      : deck.domains.length < 3 ? [...deck.domains, domain] : deck.domains;
    updateMain(deck.mainUids, next);
  };
  const remove = (uid: string) => updateMain(deck.mainUids.filter((item) => item !== uid));
  const add = (pull: CardPull) => {
    const card = cardsById.get(pull.cardId)!;
    if (!isMainCard(card) || !isWithinDomains(card, deck.domains)) return;
    updateMain([...deck.mainUids, pull.uid]);
  };
  const chooseChampion = (uid: string) => {
    if (!uid) return setDeck((current) => ({ ...current, championUid: null }));
    const nextMain = deck.mainUids.includes(uid) ? deck.mainUids : [...deck.mainUids, uid];
    setDeck((current) => ({ ...current, championUid: uid, mainUids: nextMain, runes: allocateRunes(current.domains, nextMain, pullsByUid, cardsById) }));
  };
  const changeRune = (domain: Domain, amount: number) => setDeck((current) => ({
    ...current,
    runes: { ...current.runes, [domain]: Math.max(0, current.runes[domain] + amount) },
  }));
  const bestBuild = () => setDeck(autoBuildDeck(session, cards));
  const curveMax = Math.max(1, ...Object.values(validation.metrics.curve));

  return (
    <section className="builder-view">
      <div className="builder-heading">
        <div><p className="eyebrow">Deck forge</p><h1>Your strongest line through the rift.</h1><p>{session.theme.summary}</p></div>
        <button className="secondary-button" onClick={bestBuild} type="button">Rebuild best deck</button>
      </div>
      <div className="builder-layout">
        <aside className="builder-controls">
          <section className="control-card legality-card">
            <div className="legality-title"><span className={`legality-light ${validation.valid ? "legal" : "illegal"}`} /><div><p>{validation.valid ? "Pre-Rift legal" : "Needs attention"}</p><small>{validation.metrics.mainCount}/25+ Main Deck · {validation.metrics.bonusDraw ? "+1 first-turn draw" : "full configuration"}</small></div></div>
            {validation.errors.length || validation.warnings.length ? <ul className="message-list">{validation.errors.map((error) => <li className="error" key={error}>{error}</li>)}{validation.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : <p className="quiet-success">No deck-building issues detected.</p>}
          </section>
          <section className="control-card">
            <p className="control-label">Domain identity · up to 3</p>
            <div className="domain-picker">{DOMAINS.map((domain) => <button type="button" key={domain} className={`domain-${domain}${deck.domains.includes(domain) ? " selected" : ""}`} onClick={() => toggleDomain(domain)}>{DOMAIN_LABELS[domain]}</button>)}</div>
          </section>
          <section className="control-card setup-grid">
            <label>Legend <select value={deck.legendUid || ""} onChange={(event) => setDeck((current) => ({ ...current, legendUid: event.target.value || null }))}><option value="">None · bonus draw</option>{openedLegends.map((pull) => <option key={pull.uid} value={pull.uid}>{cardsById.get(pull.cardId)!.name}</option>)}</select></label>
            <label>Chosen Champion <select value={deck.championUid || ""} onChange={(event) => chooseChampion(event.target.value)}><option value="">None · bonus draw</option>{openedChampions.map((pull) => <option key={pull.uid} value={pull.uid}>{cardsById.get(pull.cardId)!.name}</option>)}</select></label>
          </section>
          <section className="control-card">
            <p className="control-label">Rune Deck · 12 basics</p>
            <div className="rune-list">{DOMAINS.map((domain) => deck.runes[domain] || deck.domains.includes(domain) ? <div key={domain}><span>{DOMAIN_LABELS[domain]}</span><span><button type="button" onClick={() => changeRune(domain, -1)}>−</button><strong>{deck.runes[domain]}</strong><button type="button" onClick={() => changeRune(domain, 1)}>+</button></span></div> : null)}</div>
          </section>
          <section className="control-card">
            <p className="control-label">Battlefield options</p>
            <div className="battlefield-list">{deck.battlefields.map((battlefield, index) => <select key={index} value={battlefield} onChange={(event) => setDeck((current) => ({ ...current, battlefields: current.battlefields.map((value, itemIndex) => itemIndex === index ? event.target.value : value) }))}><option value={`blank-${index + 1}`}>Blank substitute</option>{openedBattlefields.map((pull) => <option key={pull.uid} value={pull.uid}>{cardsById.get(pull.cardId)!.name}</option>)}</select>)}</div>
          </section>
          <section className="control-card metrics-card">
            <div className="metric-row"><span>Units</span><strong>{validation.metrics.units}<small>/ 15 rec.</small></strong></div>
            <div className="metric-row"><span>2-Energy Units</span><strong>{validation.metrics.twoDrops}<small>/ 5 rec.</small></strong></div>
            <div className="metric-row"><span>Average Energy</span><strong>{validation.metrics.averageEnergy.toFixed(1)}</strong></div>
            <div className="curve" aria-label="Energy curve">{["0", "1", "2", "3", "4", "5", "6", "7+"].map((cost) => <div key={cost}><i style={{ height: `${Math.max(4, ((validation.metrics.curve[cost] || 0) / curveMax) * 54)}px` }} /><span>{cost}</span><small>{validation.metrics.curve[cost] || 0}</small></div>)}</div>
          </section>
        </aside>
        <div className="deck-columns">
          <section className="deck-column">
            <div className="column-heading"><div><p className="eyebrow">Main Deck</p><h2>{deck.mainUids.length} cards</h2></div><span>Click − to sideboard</span></div>
            <div className="deck-list">{mainGroups.map((group) => { const card = cardsById.get(group[0].cardId)!; return <article key={card.mechanicalId} className="deck-row"><button className="row-art" onClick={() => onZoom(group[0])} type="button"><Image src={card.imagePath} alt="" width={74} height={103} /></button><div><strong>{card.name}</strong><span>{card.energy ?? "—"} Energy · {card.types.map(titleCase).join(" · ")}</span></div><em>{group.length}×</em><button type="button" onClick={() => remove(group[group.length - 1].uid)} aria-label={`Remove ${card.name}`}>−</button></article>; })}</div>
          </section>
          <section className="deck-column side-column">
            <div className="column-heading"><div><p className="eyebrow">Sideboard</p><h2>{sideboard.length} unused</h2></div><span>All unopened choices stay here</span></div>
            <div className="deck-list">{sideGroups.map((group) => { const card = cardsById.get(group[0].cardId)!; const eligible = isMainCard(card) && isWithinDomains(card, deck.domains); return <article key={card.mechanicalId} className={`deck-row${eligible ? "" : " ineligible"}`}><button className="row-art" onClick={() => onZoom(group[0])} type="button"><Image src={card.imagePath} alt="" width={74} height={103} /></button><div><strong>{card.name}</strong><span>{card.energy ?? "—"} Energy · {card.types.map(titleCase).join(" · ")}</span></div><em>{group.length}×</em><button type="button" disabled={!eligible} onClick={() => add(group[0])} aria-label={`Add ${card.name}`}>+</button></article>; })}</div>
          </section>
        </div>
      </div>
    </section>
  );
}

export function Simulator({
  cards,
  initialSeed,
  sourceUpdatedAt,
}: {
  cards: CardDefinition[];
  initialSeed: string;
  sourceUpdatedAt: string;
}) {
  const [seed, setSeed] = useState(initialSeed);
  const [phase, setPhase] = useState<Phase>("intro");
  const [packIndex, setPackIndex] = useState(0);
  const [revealed, setRevealed] = useState(0);
  const [zoomed, setZoomed] = useState<{ pull?: CardPull; card: CardDefinition; promo?: boolean } | null>(null);
  const [methodOpen, setMethodOpen] = useState(false);
  const [shareLabel, setShareLabel] = useState("Share seed");
  const pointerStart = useRef<number | null>(null);
  const cardsById = useMemo(() => cardMap(cards), [cards]);
  const session = useMemo(() => generateKit(cards, seed), [cards, seed]);

  useEffect(() => {
    window.localStorage.setItem("vendetta-pre-rift-seed", seed);
    const url = new URL(window.location.href);
    url.searchParams.set("seed", seed);
    window.history.replaceState({}, "", url);
  }, [seed]);

  const primary = useCallback(() => {
    if (phase === "intro") { setSeed(randomSeed()); setPhase("seeded"); setPackIndex(0); setRevealed(0); return; }
    if (phase === "seeded") { if (!revealed) setRevealed(session.seededPack.length); else { setPhase("pack"); setPackIndex(0); setRevealed(0); } return; }
    if (phase === "pack") { const pulls = session.packs[packIndex]; if (revealed < pulls.length) setRevealed((value) => value + 1); else if (packIndex < 4) { setPackIndex((value) => value + 1); setRevealed(0); } else { setPhase("pool"); setRevealed(0); } return; }
    if (phase === "pool") setPhase("builder");
  }, [packIndex, phase, revealed, session.packs, session.seededPack.length]);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (methodOpen || zoomed || ["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(target.tagName)) return;
      if ((event.key === "Enter" || event.key === " ") && phase !== "builder") { event.preventDefault(); primary(); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [methodOpen, phase, primary, zoomed]);

  const newKit = () => { setSeed(randomSeed()); setPhase("intro"); setPackIndex(0); setRevealed(0); };
  const share = async () => {
    const url = new URL(window.location.href); url.searchParams.set("seed", seed);
    try { await navigator.clipboard.writeText(url.toString()); setShareLabel("Copied"); }
    catch { window.prompt("Copy this reproducible opening URL", url.toString()); }
    window.setTimeout(() => setShareLabel("Share seed"), 1500);
  };
  const zoomPull = (pull: CardPull) => { const card = cardsById.get(pull.cardId); if (card) setZoomed({ pull, card }); };
  const currentPulls = phase === "seeded" ? session.seededPack : phase === "pack" ? session.packs[packIndex] : [];
  const stageComplete = (phase === "seeded" || phase === "pack") && revealed === currentPulls.length;
  const buttonLabel = phase === "intro" ? "Break the seal" : phase === "seeded" ? stageComplete ? "Start booster one" : "Reveal random champion" : phase === "pack" ? stageComplete ? packIndex < 4 ? `Open booster ${packIndex + 2}` : "Review sealed pool" : `Reveal card ${revealed + 1}` : phase === "pool" ? "Forge my 25-card deck" : "";

  return (
    <main
      className={`app-shell phase-${phase}`}
      onPointerDown={(event) => { pointerStart.current = event.clientX; }}
      onPointerUp={(event) => { if (pointerStart.current !== null && Math.abs(event.clientX - pointerStart.current) > 55 && phase !== "builder") primary(); pointerStart.current = null; }}
    >
      <div className="ambient ambient-one" /><div className="ambient ambient-two" />
      <header className="site-header">
        <button className="wordmark" type="button" onClick={() => setPhase("intro")}><span className="wordmark-rune">V</span><span>Vendetta<small>Pre-Rift simulator</small></span></button>
        <Progress phase={phase} packIndex={packIndex} />
        <nav>
          <span className="seed-chip">Seed · {seed}</span>
          <button type="button" onClick={share}>{shareLabel}</button>
          <button type="button" onClick={() => setMethodOpen(true)}>Odds</button>
          <button type="button" onClick={newKit}>New kit</button>
        </nav>
      </header>

      {phase === "intro" ? (
        <section className="intro-stage">
          <div className="intro-copy"><p className="eyebrow">Vendetta · Pre-Rift</p><h1>Crack the kit.<br /><em>Build what survives.</em></h1><p>One random champion path. Five independently randomized boosters. Then a legal 25-card deck forged from exactly what you opened.</p><div className="intro-actions"><button className="primary-button" onClick={primary} type="button">Break the seal <span>→</span></button><button className="text-button" onClick={() => setMethodOpen(true)} type="button">See the modeled odds</button></div><div className="kit-contents"><span><strong>09</strong> Champions</span><span><strong>15</strong> Seeded cards</span><span><strong>05</strong> Boosters</span><span><strong>25</strong> Card deck</span></div></div>
          <div className="kit-visual" aria-hidden="true"><div className="box-back"><span>Riftbound</span></div><div className="box-front"><i>Pre-Rift</i><strong>Vendetta</strong><small>Sealed kit simulator</small></div><div className="box-card card-one" /><div className="box-card card-two" /></div>
        </section>
      ) : null}

      {phase === "seeded" ? <OpeningStage kicker="1 of 9 random champion packs" title={revealed ? `${session.theme.champion} answers the call.` : "Your champion waits."} copy={revealed ? `${session.theme.summary} The complete preset 15-card pack has been added to your sealed pool.` : "Reveal the randomly selected Champion once. Its Legend, Battlefield, and 12 preset support cards are added automatically—no card-by-card review."} pulls={session.seededPack} revealed={revealed} cardsById={cardsById} onZoom={zoomPull} featuredPull={session.seededPack[1]} singleReveal /> : null}
      {phase === "pack" ? <OpeningStage kicker={`Vendetta booster · ${packIndex + 1} of 5`} title={revealed ? stageComplete ? "The rift is spent." : "Turn the next card." : "Tear into Vendetta."} copy={stageComplete ? "Every slot is revealed. The rare, foil, and showcase chances were saved for the final turns." : "Open the real Akali booster, then reveal its randomized cards one by one."} pulls={session.packs[packIndex]} revealed={revealed} cardsById={cardsById} onZoom={zoomPull} sealedImage="/vendetta-booster-pack.webp" onSealedClick={primary} /> : null}
      {phase === "pool" ? <PoolView session={session} cardsById={cardsById} onZoom={zoomPull} /> : null}
      {phase === "builder" ? <DeckBuilder key={session.seed} session={session} cards={cards} cardsById={cardsById} onZoom={zoomPull} /> : null}

      {phase !== "intro" && phase !== "builder" ? <div className="action-dock"><span>{phase === "pool" ? "Review the 85 playable/collectible cards from this kit." : phase === "seeded" ? "The Champion is one random result from nine equally modeled packs." : "Each booster is independently randomized; click, swipe, or press Enter / Space."}</span><div>{phase === "pack" && !stageComplete ? <button className="secondary-button" onClick={() => setRevealed(currentPulls.length)} type="button">Reveal all</button> : null}<button className="primary-button" onClick={primary} type="button">{buttonLabel} <span>→</span></button></div></div> : null}

      <footer><p>Unofficial, noncommercial fan simulator. Riftbound and all card art are property of Riot Games.</p><div><a href="https://playriftbound.com/en-us/card-gallery/" target="_blank" rel="noreferrer">Official card gallery ↗</a><a href="https://playriftbound.com/en-us/news/announcements/preparing-for-the-vendetta-pre-rift/" target="_blank" rel="noreferrer">Pre-Rift guide ↗</a><a href="https://playriftbound.com/en-us/news/announcements/the-vendetta-overview/" target="_blank" rel="noreferrer">Vendetta overview ↗</a></div></footer>
      {methodOpen ? <Methodology onClose={() => setMethodOpen(false)} updatedAt={sourceUpdatedAt} /> : null}
      {zoomed ? <CardModal {...zoomed} onClose={() => setZoomed(null)} /> : null}
    </main>
  );
}
