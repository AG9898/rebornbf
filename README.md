# Brave Frontier: Reborn

A free, non-commercial, browser-based tribute to the retired mobile RPG *Brave Frontier*. It
recreates the Omni/UBB-era battle system (tap-to-attack, Brave Bursts, sparking, crystals, the
element wheel) with original characters, art, and story.

- Play: <https://rebornbf.com>
- Player docs: <https://rebornbf.com/product/docs>

> **Unaffiliated tribute.** Brave Frontier: Reborn is not affiliated with or endorsed by the owners
> of *Brave Frontier*. No original game assets are used. See [`NOTICE`](NOTICE).

## This repository

This is a **read-only mirror** of the project's code, synced automatically from a private
repository. Its history is squashed sync commits.

**Pull requests are not accepted here.** Issues are welcome; any fix is ported by hand.

## Layout

```
apps/web/        Next.js app: menus, Phaser battle scene, Supabase sign-in, public site
packages/engine/ Pure, deterministic battle engine (same seed + inputs = same result)
packages/data/   zod schemas and game content JSON (units, enemies, stages, banners)
supabase/        Postgres migrations, row-level security, RPC functions, pgTAP tests, content seed
```

## Run it locally

Requirements: Node.js 22+, pnpm (the version pinned in `package.json`), and Docker for the local
Supabase stack.

```bash
pnpm install
pnpm check                    # lint, typecheck, unit tests, content validation
pnpm --filter @bfr/web dev    # web app on http://localhost:3000
```

The offline battle demo at `/battle` needs no configuration. For sign-in and saved progress, run
Supabase locally and fill in `.env.local` from `.env.example`:

```bash
cp .env.example .env.local
supabase start                # local Postgres + Auth; prints the URL and keys
supabase test db              # database tests
```

## License

The **code** is released under the [MIT License](LICENSE). **Art, audio, and written game
content** (character names, story, and descriptions) are **all rights reserved**; see
[`NOTICE`](NOTICE).
