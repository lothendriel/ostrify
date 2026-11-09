<div align="center">
  <img src="public/ostrify-logo.png" alt="Ostrify logo" width="112" />
  <h1>Ostrify</h1>
  <p><strong>Your open music library, powered by Nostr.</strong></p>
  <p>Discover music, podcasts, and audiobooks. Build a library that travels with your Nostr identity.</p>
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

Ostrify is a music and audio discovery app built around [Nostr](https://nostr.com/), an open, decentralized protocol. It brings audio published across Nostr relays into one player, while also making it easy to explore independent music catalogs, podcasts, live streams, and free audiobooks.

No Ostrify account server is needed: sign in with a Nostr-compatible signer, choose your relays, and your Nostr libraries can be read by other compatible clients.

## What you can do

| Discover | Listen | Make it yours |
| --- | --- | --- |
| Music from Nostr relays and the Wavlake catalog | Persistent audio player, queue, playback history, and resume | Like tracks and publish playlists to Nostr |
| Podcasts from Nostr, Fountain, and Podcast Index | Browse TuneStr live streams and recordings | Follow artists and people with Nostr lists |
| LibriVox and Gutenberg Open Audiobooks | Play audiobook chapters in sequence | Send private friend invites with NIP-17-compatible signers |
| LibriVox and Gutenberg Open Audiobooks | Play audiobook chapters in sequence | Save audiobooks and organize local collections |
| Browse by genre, search, artists, and albums | Optional public listening status | Choose profile visibility and directory participation |

Features depend on relay availability, the formats used by publishers, and any external services being reachable.

## How Ostrify uses Nostr

Ostrify reads supported Nostr audio events from your enabled read relays and uses standard Nostr events for user libraries wherever possible. It does not define new event kinds; Ostrify-specific conventions use existing NIPs with documented tags. See **[NIP.md](NIP.md)** for the event kinds, tags, and extensions in detail.

Some key behaviors:

- **Sign-in and publishing:** actions such as following, liking, and saving a playlist are signed through your chosen Nostr signer.
- **Relay selection:** read and write relay choices apply to Ostrify; the app does not overwrite your NIP-65 relay list.
- **Public libraries:** Nostr playlists, followed artists, followed people, and directory listings are public relay data. Profile privacy settings tell Ostrify which sections to hide; they do not erase existing events or prevent other clients from reading them.
- **Listening status:** optional, off by default, and controlled per device. When enabled, Ostrify publishes a public NIP-38 status while audio is playing. Relay copies may persist after a status expires or is cleared.
- **Local data:** audiobook favorites and collections, player volume, queue, playback position, history, and notification state are stored in the browser. Those items do not automatically sync to another device.
- **External catalogs:** Wavlake, LibriVox, Project Gutenberg/Internet Archive, Fountain, and Podcast Index provide catalog or media data. Their availability and terms are independent of Ostrify.

## Run locally

### Requirements

- Node.js 22 or later is recommended (the project CI uses Node 22).
- npm.

### Start the app

```bash
npm install
npm run dev
```

Vite starts the development server at `http://localhost:8080`.

### Validate changes

```bash
npm run test
```

The test script runs TypeScript checking, ESLint, Vitest, and a production build.

## Podcast Index Worker (optional deployment service)

The web app can use a Cloudflare Worker as a small API proxy for Podcast Index. The default URL is configured in `src/hooks/usePodcasts.ts`. To point a build at a different Worker, set `VITE_PODCAST_INDEX_WORKER_URL` in the build environment.

The Worker needs Podcast Index credentials configured as Cloudflare secrets:

```bash
npx wrangler secret put PODCAST_INDEX_API_KEY
npx wrangler secret put PODCAST_INDEX_API_SECRET
```

The Worker is configured by `wrangler.jsonc` and serves the built site as well as its API routes. To build and deploy it, configure Wrangler for your Cloudflare account, then run:

```bash
npm run deploy:cloudflare
```

Without a configured Worker and credentials, Podcast Index-backed features may be unavailable. The app's Nostr, Wavlake, audiobook, and other sources have their own availability and configuration requirements.

## Built with

- React 19 and TypeScript
- Vite and Tailwind CSS 4
- Nostrify and `nostr-tools`
- TanStack Query
- Radix UI / shadcn-style accessible components
- Cloudflare Workers for optional API proxy routes

## Repository guide

- `src/pages/` — application pages and discovery experiences
- `src/components/music/` — player, library, navigation, and music components
- `src/hooks/` — Nostr queries, playback, and external catalog integration
- `src/lib/` — track parsing, categories, sanitization, and shared helpers
- `worker.ts` — optional Cloudflare Worker API proxy
- `NIP.md` — Nostr event formats and Ostrify-specific conventions
- `CODE_AUDIT.md` — a read-only code audit and improvement suggestions

## Contributing

Issues and pull requests are welcome. Before opening a pull request, run `npm run test` and include a clear description of the user-facing change. For changes to Nostr event formats or Ostrify-specific tags, update `NIP.md` as well.

---

<div align="center">
  <sub>Open protocols. Independent music. Your library.</sub>
  <br />
  <sub><a href="https://shakespeare.diy">Vibed with Shakespeare</a></sub>
</div>
