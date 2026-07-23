import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const GALLERY_URL = "https://playriftbound.com/en-us/card-gallery/";
const PRERIFT_URL =
  "https://playriftbound.com/en-us/news/announcements/preparing-for-the-vendetta-pre-rift/";
const DATA_DIR = path.join(ROOT, "data");
const CARD_DIR = path.join(ROOT, "public", "cards");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "VendettaPreRiftSimulator/1.0 (+unofficial fan project)",
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (!response.ok) throw new Error(`Failed ${response.status}: ${url}`);
  return response.text();
}

function nextDataFromHtml(html) {
  const match = html.match(
    /<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  if (!match) throw new Error("Official page did not expose __NEXT_DATA__.");
  return JSON.parse(match[1]);
}

function stripHtml(value = "") {
  return value
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function treatmentFor(card) {
  const code = card.publicCode || "";
  if (/^VEN-R/i.test(code)) return "rune";
  if (/^VEN-T/i.test(code)) return "token";
  if (/^VEN-SP/i.test(code)) return "special-alt";
  if (/^VEN-\d{3}a\/166$/i.test(code)) return "alt";
  if (/^VEN-\d{3}\/166$/i.test(code) && card.collectorNumber > 166)
    return "overnumber";
  return "base";
}

function numberValue(input) {
  const value = input?.value?.label ?? input?.value ?? input?.label ?? input;
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalize(card) {
  const types = (card.cardType?.type || []).map((item) => item.id);
  const superTypes = (card.cardType?.superType || []).map((item) => item.id);
  const domains = (card.domain?.values || []).map((item) => item.id);
  const text = stripHtml(card.text?.richText?.body || "");
  const lower = text.toLowerCase();
  const keywords = [
    "accelerate",
    "ambush",
    "assault",
    "burn",
    "deflect",
    "empower",
    "flow",
    "ganking",
    "hidden",
    "shield",
    "tank",
    "vision",
    "weaponmaster",
  ].filter((keyword) => lower.includes(keyword));
  const id = card.id.toLowerCase();

  return {
    id,
    mechanicalId: id,
    collectorNumber: card.collectorNumber,
    publicCode: card.publicCode,
    name: card.name,
    rarity: card.rarity?.value?.id || "common",
    treatment: treatmentFor(card),
    domains,
    types,
    superTypes,
    tags: card.tags?.tags || [],
    energy: numberValue(card.energy),
    might: numberValue(card.might),
    text,
    keywords,
    isChampion: superTypes.includes("champion"),
    isSignature: superTypes.includes("signature"),
    imagePath: `/cards/${id}.webp`,
    sourceImageUrl: card.cardImage?.url,
    accessibilityText: card.cardImage?.accessibilityText || card.name,
  };
}

function attachMechanicalIds(cards) {
  const baseByNumber = new Map(
    cards
      .filter((card) => card.treatment === "base")
      .map((card) => [card.collectorNumber, card.id]),
  );
  const baseByName = new Map(
    cards
      .filter((card) => card.treatment === "base")
      .map((card) => [card.name.toLowerCase(), card.id]),
  );

  return cards.map((card) => ({
    ...card,
    mechanicalId:
      card.treatment === "alt"
        ? baseByNumber.get(card.collectorNumber) || card.id
        : card.treatment === "special-alt" || card.treatment === "overnumber"
          ? baseByName.get(card.name.toLowerCase()) || card.id
          : card.id,
  }));
}

function collectImages(value, output = []) {
  if (!value || typeof value !== "object") return output;
  if (
    value.type === "image" &&
    typeof value.url === "string" &&
    value.url.includes("cmsassets.rgpub.io")
  ) {
    output.push(value);
  }
  for (const child of Object.values(value)) collectImages(child, output);
  return output;
}

async function downloadImage(sourceUrl, targetPath) {
  if (!sourceUrl) throw new Error(`Missing image URL for ${targetPath}`);
  if (existsSync(targetPath)) return "cached";
  const url = new URL(sourceUrl);
  url.searchParams.set("accountingTag", "RB");
  url.searchParams.set("auto", "format");
  url.searchParams.set("fit", "fill");
  url.searchParams.set("q", "86");
  url.searchParams.set("w", "744");

  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "VendettaPreRiftSimulator/1.0",
          Accept: "image/webp,image/avif,image/*",
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length < 5_000) throw new Error("Image response was too small");
      await writeFile(targetPath, bytes);
      return "downloaded";
    } catch (error) {
      lastError = error;
      await sleep(350 * (attempt + 1));
    }
  }
  throw new Error(`${targetPath}: ${lastError?.message || lastError}`);
}

async function runPool(items, concurrency, worker) {
  let cursor = 0;
  const results = [];
  async function next() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, next));
  return results;
}

async function main() {
  await mkdir(DATA_DIR, { recursive: true });
  await mkdir(CARD_DIR, { recursive: true });

  const [galleryHtml, preRiftHtml] = await Promise.all([
    fetchText(GALLERY_URL),
    fetchText(PRERIFT_URL),
  ]);
  const galleryData = nextDataFromHtml(galleryHtml);
  const preRiftData = nextDataFromHtml(preRiftHtml);
  const gallery = galleryData.props.pageProps.page.blades.find(
    (blade) => blade.type === "riftboundCardGallery",
  );
  if (!gallery) throw new Error("Official card gallery blade was not found.");

  const officialCards = gallery.cards.items.filter(
    (card) => card.set?.value?.id === "VEN",
  );
  if (officialCards.length !== 228) {
    throw new Error(
      `Expected 228 Vendetta gallery records, found ${officialCards.length}.`,
    );
  }
  const cards = attachMechanicalIds(officialCards.map(normalize)).sort((a, b) =>
    a.publicCode.localeCompare(b.publicCode, "en", { numeric: true }),
  );

  const officialImages = collectImages(preRiftData);
  const promoCandidate = officialImages.find((image) =>
    `${image.accessibilityText || ""} ${image.alt || ""}`
      .toLowerCase()
      .includes("riven"),
  );
  const baseRiven = cards.find(
    (card) => card.name === "Riven, Shattered" && card.treatment === "base",
  );
  const promoSource = promoCandidate?.url || baseRiven?.sourceImageUrl;

  const manifest = {
    source: GALLERY_URL,
    preRiftSource: PRERIFT_URL,
    sourceUpdatedAt:
      gallery.cards.async?.metadata?.resultsUpdatedAt || new Date().toISOString(),
    syncedAt: new Date().toISOString(),
    officialRecordCount: cards.length,
    promoSource,
    cards,
  };
  await writeFile(
    path.join(DATA_DIR, "vendetta-cards.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  const jobs = cards.map((card) => ({
    url: card.sourceImageUrl,
    target: path.join(CARD_DIR, `${card.id}.webp`),
  }));
  jobs.push({
    url: promoSource,
    target: path.join(CARD_DIR, "riven-prerift-promo.webp"),
  });
  const results = await runPool(jobs, 8, (job) =>
    downloadImage(job.url, job.target),
  );

  const counts = results.reduce(
    (acc, result) => ({ ...acc, [result]: (acc[result] || 0) + 1 }),
    {},
  );
  const metadata = {
    source: manifest.source,
    preRiftSource: manifest.preRiftSource,
    sourceUpdatedAt: manifest.sourceUpdatedAt,
    syncedAt: manifest.syncedAt,
    officialRecordCount: manifest.officialRecordCount,
    promoSource: manifest.promoSource,
    assetCounts: counts,
  };
  await writeFile(
    path.join(DATA_DIR, "source-metadata.json"),
    `${JSON.stringify(metadata, null, 2)}\n`,
  );
  console.log(`Synced ${cards.length} official Vendetta cards.`, counts);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
