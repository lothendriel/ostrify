<div align="center">
  <img src="public/ostrify-logo.png" alt="Ostrify logo" width="112" />
  <h1>Ostrify</h1>
  <p><strong>An open music and audiobook library, powered by Nostr.</strong></p>
  <p>Discover and listen to independent music, podcasts, live streams, and audiobooks. Save your library with your Nostr identity.</p>
  <p>
    <a href="https://ostrify.shakespeare.wtf">Open Ostrify</a>
    ·
    <a href="NIP.md">Nostr event formats</a>
  </p>
  <p>
    <a href="https://shakespeare.diy/clone?url=https%3A%2F%2Fgithub.com%2Flothendriel%2Fostrify.git">
      <img src="https://shakespeare.diy/badge.svg" alt="Edit with Shakespeare" />
    </a>
  </p>
</div>

---

Ostrify is an audio discovery and listening app built on [Nostr](https://nostr.com/), an open, decentralized protocol. It brings music and podcast events from Nostr relays into one player and adds discovery from independent catalogs and open audiobook collections.

There is no Ostrify account server. Sign in with a Nostr-compatible signer to publish and sync your own libraries. Your account is your Nostr identity; relay and catalog availability is independent of Ostrify.

## Features

- **Music:** discover Nostr-published audio and browse or search the Wavlake catalog. Explore artists, albums, genres, and tracks.
- **Podcasts:** browse podcast events from Nostr, Fountain shows and episodes, and the Podcast Index directory.
- **Audiobooks:** find volunteer-read LibriVox recordings and titles in the Project Gutenberg Open Audiobook Collection. Playback continues through a book’s available recordings in sequence.
- **One player:** persistent playback, queue controls, playback history, and resume support.
- **Personal libraries:** like tracks, publish playlists, follow artists and people, save podcasts, and create audiobook favorites and collections.
- **Private audiobook sync:** audiobook favorites and collections sync between devices as NIP-44-encrypted NIP-78 data. Use the same Nostr account on each device, a signer that supports NIP-44, and configured read and write relays. Existing browser-only audiobook saves are retained and merged during first sync.
- **Friends and listening activity:** follow people on Ostrify, send private NIP-17 invites, and optionally share a public NIP-38 music status.
- **Profile controls:** manage which Ostrify library sections are shown on your public profile and optionally opt in to the public Ostrify directory.

Features depend on relay availability, the event formats used by publishers, signer capabilities, and external catalog services.

## Get started

1. Open [Ostrify](https://ostrify.shakespeare.wtf) and sign in with a Nostr-compatible signer.
2. In **Settings → Relays**, choose which relays Ostrify can read from and publish to. These choices are app-specific and do not replace your NIP-65 relay list.
3. Browse music, podcasts, or audiobooks. Use the save and playlist actions to build your libraries.
4. To sync saved audiobooks on another device, sign in with the same Nostr identity and use a NIP-44-capable signer. Your library is encrypted before it is published; read and write relays must be enabled.

### Privacy and storage

- **Public Nostr data:** music playlists, liked tracks, followed artists and people, profile privacy preferences, and directory listings are relay events visible to other Nostr clients. Profile privacy controls affect Ostrify’s profile display; they do not make published events private or remove relay copies.
- **Private audiobook sync:** Ostrify encrypts audiobook library contents to your own public key with NIP-44 before publishing the kind `30078` event. Relays store the encrypted payload. Your signer must support NIP-44 to decrypt it on each device. Use relays you trust to retain your application data.
- **Optional public status:** listening status is off by default. When enabled, it publishes your current music status publicly. Ostrify sends a clearing status when possible, but relays may keep older copies.
- **Local browser data:** playback queue, volume, position, history, notification state, and other playback preferences stay in that browser and do not automatically sync. Audiobook library data is cached per account on-device as well as synced to relays.
- **No private-key access by Ostrify:** signing and encryption are requested through your selected Nostr signer.

For the event kinds, tags, and Ostrify conventions, see **[NIP.md](NIP.md)**.

## Run locally

### Requirements

- Node.js 22 or later (the project CI uses Node 22)
- npm

### Install and start

```bash
npm install
npm run dev
```

Vite starts the development server at `http://localhost:8080`.

### Validate changes

```bash
npm run test
```

This script runs TypeScript checking, ESLint, Vitest, and a production build.

## Podcast Index and Fountain service

Podcast Index requires API credentials and a server-side proxy. Ostrify includes a Cloudflare Worker in `worker.ts` that provides Podcast Index and Fountain API routes and serves the built site. The default Podcast Index Worker URL is set in `src/hooks/usePodcasts.ts`; set `VITE_PODCAST_INDEX_WORKER_URL` in the build environment to use another Worker.

Configure the credentials as Cloudflare secrets:

```bash
npx wrangler secret put PODCAST_INDEX_API_KEY
npx wrangler secret put PODCAST_INDEX_API_SECRET
```

Configure Wrangler for your Cloudflare account, then build and deploy:

```bash
npm run deploy:cloudflare
```

Without configured Podcast Index credentials and a reachable Worker, Podcast Index-backed search and catalog features may not work. Fountain uses the included Worker routes and can also be affected by upstream availability. Nostr, Wavlake, LibriVox, Project Gutenberg, and Internet Archive have their own availability and terms.

## Built with

- React 19 and TypeScript
- Vite and Tailwind CSS 4
- Nostrify and `nostr-tools`
- TanStack Query
- Radix UI and shadcn-style accessible components
- Cloudflare Workers for optional API routes and static hosting

## Repository guide

- `src/pages/` — discovery, player, profile, and library pages
- `src/components/music/` — player, navigation, and music components
- `src/hooks/` — Nostr queries, playback, and external catalog integration
- `src/lib/` — track parsing, categories, sanitization, and shared helpers
- `worker.ts` — optional Cloudflare Worker API proxy and asset handler
- `public/service-worker.js` — app-shell caching and update support
- `NIP.md` — Nostr event formats and Ostrify-specific conventions

## Contributing

Issues and pull requests are welcome. Before opening a pull request, run `npm run test` and include a clear description of the user-facing change. If you change Nostr event formats or Ostrify-specific tags, update `NIP.md` as well.

---

<div align="center">
  <sub>Open protocols. Independent audio. Your library.</sub>
  <br />
  <sub><a href="https://shakespeare.diy">Vibed with Shakespeare</a></sub>
</div>
