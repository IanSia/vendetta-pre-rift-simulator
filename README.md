# Vendetta Pre-Rift Simulator

An unofficial, noncommercial simulator for opening a Vendetta Pre-Rift kit and building a legal 25-card sealed deck from the result.

## Run locally

```bash
npm install
npm run dev
```

## Verify

```bash
npm test
npm run build
```

## Refresh official card data

```bash
npm run sync:cards
```

The sync script pins the official Vendetta gallery records and downloads 744px Riot-hosted WebP images to `public/cards`. The simulation clearly separates official slot structure from estimated rarity/treatment rates and estimated mini-precon support cards.

## Deploy

Import this repository into Vercel. It uses the standard Next.js App Router and needs no database or environment variables.

Riftbound, Vendetta, and all card artwork are property of Riot Games.
