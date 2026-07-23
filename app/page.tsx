import type { Metadata } from "next";
import { randomInt, randomUUID } from "node:crypto";
import manifest from "@/data/vendetta-cards.json";
import sourceMetadata from "@/data/source-metadata.json";
import { Simulator } from "./simulator";
import type { CardDefinition } from "@/lib/types";

export const metadata: Metadata = {
  title: "Vendetta Pre-Rift Simulator",
  description:
    "Open a simulated Vendetta Pre-Rift kit, then build and validate a legal 25-card sealed deck.",
};

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ seed?: string }>;
}) {
  const params = await searchParams;
  const cards = manifest.cards as CardDefinition[];
  const overnumbers = cards.filter((card) => card.treatment === "overnumber");
  const firstShowcaseIndex = randomInt(overnumbers.length);
  const secondShowcaseOffset = randomInt(overnumbers.length - 1);
  const secondShowcaseIndex = secondShowcaseOffset >= firstShowcaseIndex
    ? secondShowcaseOffset + 1
    : secondShowcaseOffset;

  return (
    <Simulator
      cards={cards}
      initialSeed={params.seed?.slice(0, 80) || randomUUID().slice(0, 12)}
      landingShowcaseIds={[
        overnumbers[firstShowcaseIndex].id,
        overnumbers[secondShowcaseIndex].id,
      ]}
      sourceUpdatedAt={sourceMetadata.sourceUpdatedAt}
    />
  );
}
