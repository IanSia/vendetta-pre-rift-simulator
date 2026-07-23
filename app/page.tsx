import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
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
  return (
    <Simulator
      cards={manifest.cards as CardDefinition[]}
      initialSeed={params.seed?.slice(0, 80) || randomUUID().slice(0, 12)}
      sourceUpdatedAt={sourceMetadata.sourceUpdatedAt}
    />
  );
}
