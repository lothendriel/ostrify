import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';
import { AudioLines, CircleAlert, Mic2, Radio, Rss, ShieldCheck, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppContext } from '@/hooks/useAppContext';
import { useUploadFile } from '@/hooks/useUploadFile';
import { getUserDataReadRelays, normalizeRelayAddress } from '@/lib/appRelays';
import { newestEventForCoordinate, nextLibraryTimestamp, queryLibraryEvents, readLibraryForWrite, recentLibraryEvent, rememberLibraryWrite, withLibraryWrite } from '@/lib/libraryQuery';
import { sanitizeUrl } from '@/lib/sanitize';

type Show = { title: string; description: string; image: string; website: string };
type Episode = { id: string; title: string; description: string; audio: string; mime: string; image: string };
type Feed = { url: string; show: Show; episodes: Episode[]; skipped: number };
const FEED_BYTE_LIMIT = 25_000_000;
const EPISODES_PER_PAGE = 50;
const emptyShow: Show = { title: '', description: '', image: '', website: '' };

/** Count decoded response bytes while streaming, even when Content-Length is absent or compressed. */
async function readFeedResponse(response: Response, onProgress: (bytes: number) => void): Promise<string> {
  // Content-Length can describe compressed bytes and is not a reliable limit
  // for the decoded response body, so enforce the limit on streamed chunks.
  if (!response.body) throw new Error('This browser cannot stream the feed safely. Try a browser with streaming support.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  let lastUpdate = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > FEED_BYTE_LIMIT) {
        void reader.cancel().catch(() => {});
        throw new Error('This feed exceeds the 25 MB preview limit.');
      }
      chunks.push(value);
      if (received - lastUpdate >= 500_000) { lastUpdate = received; onProgress(received); }
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  // XML feeds may declare a non-UTF-8 encoding. Decode with the declared encoding
  // (or a UTF-16 BOM), rather than silently corrupting titles and descriptions.
  const bom = bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le' : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : undefined;
  const header = new TextDecoder(bom ?? 'utf-8').decode(bytes.subarray(0, Math.min(bytes.length, 512)));
  const encoding = bom ?? /^\s*<\?xml\s+[^?]*encoding\s*=\s*['"]([^'"]+)['"]/i.exec(header)?.[1] ?? 'utf-8';
  try { return new TextDecoder(encoding, { fatal: true }).decode(bytes).replace(/^\uFEFF/, ''); }
  catch { throw new Error('The feed uses an unsupported or invalid text encoding.'); }
}
const tag = (event: NostrEvent | undefined, name: string) => event?.tags.find(([key]) => key === name)?.[1] ?? '';
const showFromEvent = (event?: NostrEvent): Show => ({ title: tag(event, 'title'), description: tag(event, 'description'), image: sanitizeUrl(tag(event, 'image')) ?? '', website: sanitizeUrl(tag(event, 'website')) ?? '' });
const messageOf = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong.';

function direct(parent: Element, name: string): Element | undefined {
  return Array.from(parent.children).find(child => child.localName.toLowerCase() === name.toLowerCase());
}
function value(parent: Element, name: string): string { return direct(parent, name)?.textContent?.trim() ?? ''; }
function image(parent: Element): string {
  const images = Array.from(parent.children).filter(child => child.localName.toLowerCase() === 'image');
  return images.map(item => sanitizeUrl(item.getAttribute('href') ?? direct(item, 'url')?.textContent)).find(Boolean) ?? '';
}
function parseFeed(xml: string, url: string): Feed {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const channel = doc.querySelector('channel');
  if (doc.querySelector('parsererror') || !channel) throw new Error('This is not a readable RSS podcast feed.');
  const show = { title: value(channel, 'title').slice(0, 200), description: value(channel, 'description').slice(0, 5000), image: image(channel), website: sanitizeUrl(value(channel, 'link')) ?? '' };
  if (!show.title) throw new Error('The feed has no show title.');
  const items = Array.from(channel.children).filter(child => child.localName.toLowerCase() === 'item');
  const seen = new Set<string>();
  const episodes = items.flatMap(item => {
    const audio = sanitizeUrl(direct(item, 'enclosure')?.getAttribute('url'));
    const title = value(item, 'title').slice(0, 200);
    const id = (value(item, 'guid') || audio || '').slice(0, 2048);
    if (!audio || !title || !id || seen.has(id)) return [];
    seen.add(id);
    return [{ id, title, audio, description: value(item, 'description').slice(0, 5000), mime: (direct(item, 'enclosure')?.getAttribute('type') ?? '').slice(0, 100), image: image(item) }];
  });
  return { url, show, episodes, skipped: items.length - episodes.length };
}
async function importIdentity(feed: string, id: string): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify([feed, id]));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return `ostrify:rss:sha256:${Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('')}`;
}

export function PublishPodcastPanel({ artist, pubkey }: { artist: string; pubkey: string }) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const { config } = useAppContext();
  const client = useQueryClient();
  const upload = useUploadFile();
  const readRelays = getUserDataReadRelays(config.appRelayMetadata, config.userRelayMetadata, config.userRelayPubkey, pubkey, config.excludedUserRelayUrls, config.excludedUserRelayPubkey);
  const relayKey = readRelays.join('|');
  const showQuery = useQuery({
    queryKey: ['publish-podcast-show', pubkey, relayKey],
    queryFn: async ({ signal }) => {
      const result = await queryLibraryEvents(nostr, readRelays, [{ kinds: [10154], authors: [pubkey], limit: 20 }], signal, { waitForAll: true });
      return { ...result, event: newestEventForCoordinate([...result.events, ...(recentLibraryEvent(pubkey, 10154, '') ? [recentLibraryEvent(pubkey, 10154, '') as NostrEvent] : [])], pubkey, 10154) };
    },
    staleTime: 30000,
  });
  const [show, setShow] = useState<Show>(emptyShow);
  const initialized = useRef(false);
  const showEdited = useRef(false);
  useEffect(() => {
    if (!initialized.current && showQuery.data) {
      if (!showEdited.current) setShow(showFromEvent(showQuery.data.event));
      initialized.current = true;
    }
  }, [showQuery.data]);
  const [cover, setCover] = useState<File>();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [audio, setAudio] = useState('');
  const [audioFile, setAudioFile] = useState<File>();
  const [episodeImage, setEpisodeImage] = useState<File>();
  const [fileReset, setFileReset] = useState(0);
  const [coverReset, setCoverReset] = useState(0);
  const [feedUrl, setFeedUrl] = useState('');
  const [feed, setFeed] = useState<Feed>();
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [episodeSearch, setEpisodeSearch] = useState('');
  const [episodePage, setEpisodePage] = useState(0);
  const [previewProgress, setPreviewProgress] = useState('');
  const filteredEpisodes = useMemo(() => {
    const search = episodeSearch.trim().toLocaleLowerCase();
    return search ? (feed?.episodes ?? []).filter(episode => episode.title.toLocaleLowerCase().includes(search)) : feed?.episodes ?? [];
  }, [feed, episodeSearch]);
  const pageCount = Math.max(1, Math.ceil(filteredEpisodes.length / EPISODES_PER_PAGE));
  const currentPage = Math.min(episodePage, pageCount - 1);
  const pageEpisodes = filteredEpisodes.slice(currentPage * EPISODES_PER_PAGE, (currentPage + 1) * EPISODES_PER_PAGE);
  const [showAction, setShowAction] = useState('none');
  const [results, setResults] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error?: boolean }>();
  const [progress, setProgress] = useState('');
  const excluded = new Set(config.excludedUserRelayUrls.map(normalizeRelayAddress));
  const writeRelays = [...new Set(config.relayMetadata.relays.filter(relay => relay.write && !excluded.has(normalizeRelayAddress(relay.url))).map(relay => relay.url))];

  async function send(event: NostrEvent): Promise<string> {
    if (!active.current) throw new Error('Publishing was interrupted because the account or panel changed. Check relays before retrying.');
    if (!writeRelays.length) throw new Error('Enable a write relay in Settings.');
    const outcomes = await Promise.allSettled(writeRelays.map(relay => nostr.relay(relay).event(event, { signal: AbortSignal.timeout(5000) })));
    const accepted = outcomes.filter(outcome => outcome.status === 'fulfilled').length;
    if (!accepted) throw new Error('No relay confirmed delivery. A relay may still have received it; check before retrying.');
    return accepted < writeRelays.length ? `Published; ${accepted}/${writeRelays.length} write relays confirmed.` : 'Published';
  }
  async function sign(kind: number, tags: string[][], content = '', created_at = Math.floor(Date.now() / 1000)) {
    if (!active.current || !user || user.pubkey !== pubkey) throw new Error('Your account changed or the panel closed. Reopen publishing with the correct account.');
    const event = await user.signer.signEvent({ kind, content, tags, created_at });
    if (event.pubkey !== pubkey) throw new Error('The signer returned a different account. Nothing was sent.');
    return event;
  }
  async function uploadFile(file: File, prefix: string): Promise<string> {
    if (!file.type.startsWith(prefix)) throw new Error(`Choose a valid ${prefix === 'audio/' ? 'audio' : 'image'} file.`);
    const tags = await upload.mutateAsync(file);
    const url = sanitizeUrl(tags.find(([name]) => name === 'url')?.[1]);
    if (!url) throw new Error('Blossom did not return a usable HTTPS URL.');
    return url;
  }
  function invalidate() {
    void client.invalidateQueries({ queryKey: ['podcast-shows'] });
    void client.invalidateQueries({ queryKey: ['podcast-episodes'] });
    void client.invalidateQueries({ queryKey: ['podcast-show-episodes'] });
    void client.invalidateQueries({ queryKey: ['publish-podcast-show'] });
  }
  async function publishShow(data: Show) {
    if (!data.title.trim()) throw new Error('Enter a show title.');
    if (data.website && !sanitizeUrl(data.website)) throw new Error('The website must be an HTTPS URL.');
    if (data.image && !sanitizeUrl(data.image)) throw new Error('The cover must be an HTTPS URL.');
    return withLibraryWrite(pubkey, 10154, '', async () => {
      const latest = await readLibraryForWrite(nostr, readRelays, pubkey, 10154, '', showQuery.data?.event);
      if (latest.partial && !window.confirm('Some read relays did not finish checking. An unseen show may be overwritten. Publish anyway?')) throw new Error('Show update cancelled. Retry relay checks before publishing.');
      if (latest.event && !window.confirm('This replaces your existing Nostr show metadata. Continue?')) throw new Error('Show update cancelled.');
      const tags = (latest.event?.tags ?? []).filter(([name]) => !['title', 'description', 'image', 'website', 'client'].includes(name)).map(item => [...item]);
      tags.push(['title', data.title.trim()], ['description', data.description.trim()]);
      if (data.image) tags.push(['image', sanitizeUrl(data.image) as string]);
      if (data.website) tags.push(['website', sanitizeUrl(data.website) as string]);
      const event = await sign(10154, tags, latest.event?.content ?? '', await nextLibraryTimestamp(latest.event?.created_at));
      const status = await send(event);
      rememberLibraryWrite(event, '');
      setShow(data);
      showEdited.current = false;
      invalidate();
      return status;
    });
  }
  function episodeTags(episode: Omit<Episode, 'id'>, showTitle: string, identity?: string): string[][] {
    const tags = [['title', episode.title.trim()], ['description', episode.description.trim()], ['audio', episode.audio, ...(episode.mime ? [episode.mime] : [])], ['t', 'podcast']];
    if (episode.image) tags.push(['image', episode.image]);
    if (showTitle) tags.push(['podcast', showTitle]);
    if (identity) tags.push(['i', identity]);
    return tags;
  }
  async function publishEpisode(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setNotice(undefined);
    try {
      const url = audioFile ? await uploadFile(audioFile, 'audio/') : sanitizeUrl(audio);
      if (!url) throw new Error('Choose an audio file or enter an HTTPS audio URL.');
      const art = episodeImage ? await uploadFile(episodeImage, 'image/') : sanitizeUrl(show.image) ?? '';
      const signed = await sign(54, episodeTags({ title, description, audio: url, mime: audioFile?.type ?? '', image: art }, show.title));
      const status = await send(signed); invalidate();
      setTitle(''); setDescription(''); setAudio(''); setAudioFile(undefined); setEpisodeImage(undefined); setFileReset(value => value + 1);
      setNotice({ text: `${status}. Your episode is available to compatible clients on relays that retained it.` });
    } catch (error) { setNotice({ text: messageOf(error), error: true }); } finally { setBusy(false); }
  }
  async function previewFeed(event: React.FormEvent) {
    event.preventDefault(); setNotice(undefined); setFeed(undefined); setSelected(new Set()); setResults({}); setEpisodeSearch(''); setEpisodePage(0); setPreviewProgress('Connecting to the feed…'); setBusy(true);
    try {
      const url = sanitizeUrl(feedUrl);
      if (!url) throw new Error('Enter a public HTTPS RSS feed URL.');
      const canonical = new URL(url); canonical.hash = '';
      const response = await fetch(canonical.href, { signal: AbortSignal.timeout(60000), credentials: 'omit' });
      if (!response.ok) throw new Error(`Feed server returned HTTP ${response.status}.`);
      const xml = await readFeedResponse(response, bytes => setPreviewProgress(`Downloading feed… ${(bytes / 1_000_000).toFixed(1)} MB received (25 MB limit)`));
      setPreviewProgress('Preparing episode preview…');
      // Let the browser display the progress update before XML parsing begins.
      await new Promise(resolve => setTimeout(resolve, 0));
      const parsed = parseFeed(xml, canonical.href);
      setFeed(parsed); setSelected(new Set(parsed.episodes.map(item => item.id)));
      setNotice({ text: 'Feed loaded. Review the show and select episodes before publishing.' });
    } catch (error) { setNotice({ text: `${messageOf(error)} Feed access can also fail if the host blocks browser cross-origin requests (CORS), is unavailable, or requires a login. Try a public HTTPS feed that permits browser access.`, error: true }); } finally { setPreviewProgress(''); setBusy(false); }
  }
  async function importEpisodes() {
    if (!feed) return;
    setBusy(true); setNotice(undefined); setProgress('Checking relays…');
    try {
      const chosen = feed.episodes.filter(item => selected.has(item.id));
      if (!chosen.length && showAction === 'none') throw new Error('Select episodes or choose to publish the show.');
      if (chosen.length > 100 && !window.confirm(`You selected ${chosen.length} episodes across the whole feed. Importing may take a long time and require many signer approvals. Keep this page open. Continue?`)) throw new Error('Import cancelled. You can select fewer episodes.');
      if (showAction === 'publish' && !window.confirm(`Publish “${feed.show.title}” as the show for the signed-in account using the feed details?`)) throw new Error('Show import cancelled.');
      if (showAction === 'publish') {
        setProgress('Publishing show…');
        await publishShow(feed.show);
        setShowAction('none');
      }
      const identities = await Promise.all(chosen.map(item => importIdentity(feed.url, item.id)));
      const found = new Set<string>();
      let incomplete = false;
      for (let start = 0; start < identities.length; start += 50) {
        setProgress(`Checking for duplicates: ${Math.min(start + 50, identities.length)} of ${identities.length} episodes…`);
        const batch = identities.slice(start, start + 50);
        const result = await queryLibraryEvents(nostr, readRelays, [{ kinds: [54], authors: [pubkey], '#i': batch, limit: 500 }], AbortSignal.timeout(10000), { waitForAll: true });
        if (!result.complete || !result.completedRelays.length || result.events.length >= 500) incomplete = true;
        for (const event of result.events) if (event.pubkey === pubkey && event.kind === 54) for (const [name, value] of event.tags) if (name === 'i' && value) found.add(value);
      }
      if (incomplete && chosen.length && !window.confirm('Duplicate checks were incomplete. Some episodes may already exist on unreachable relays. Continue anyway?')) throw new Error('Import paused. Retry checks when your relays are available.');
      let published = 0;
      for (let index = 0; index < chosen.length; index++) {
        const episode = chosen[index]; const identity = identities[index];
        setProgress(`Processing ${index + 1} of ${chosen.length}: ${episode.title}`);
        if (found.has(identity)) { setResults(current => ({ ...current, [episode.id]: 'Already found on a relay; skipped' })); continue; }
        try {
          const key = `ostrify-podcast-import:${pubkey}:${identity}`;
          let signed: NostrEvent | undefined;
          try {
            const saved: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
            if (saved && typeof saved === 'object') {
              const candidate = saved as NostrEvent;
              const { verifyEvent } = await import('nostr-tools');
              if (candidate.pubkey === pubkey && candidate.kind === 54 && candidate.tags?.some(([name, value]) => name === 'i' && value === identity) && verifyEvent(candidate)) signed = candidate;
            }
          } catch { /* An invalid local record is ignored. */ }
          if (!signed) {
            signed = await sign(54, episodeTags({ ...episode, image: episode.image || feed.show.image || sanitizeUrl(show.image) || '' }, feed.show.title, identity));
            // Persist before sending so a retry reuses the same signed event even after an interruption.
            try { localStorage.setItem(key, JSON.stringify(signed)); } catch { throw new Error('Could not save retry information on this device. Free browser storage before importing.'); }
          }
          const status = await send(signed); published++;
          setResults(current => ({ ...current, [episode.id]: status }));
        } catch (error) { setResults(current => ({ ...current, [episode.id]: `Not confirmed: ${messageOf(error)}` })); }
      }
      invalidate();
      setNotice({ text: `Import finished. ${published} episode(s) sent; review each result. Retry unconfirmed items or return later to check for new episodes.` });
    } catch (error) { setNotice({ text: messageOf(error), error: true }); } finally { setProgress(''); setBusy(false); }
  }

  return <section aria-label="Publish podcasts" className="mx-auto max-w-5xl space-y-5 pt-6">
    <div className="flex items-start gap-3"><span className="publish-studio-icon flex size-10 shrink-0 items-center justify-center rounded-xl"><Mic2 aria-hidden="true" className="size-5" /></span><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-violet">Podcast studio</p><h3 className="mt-1 text-xl font-bold">Your voice, your show.</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">Create a Nostr show, share an episode, or bring your existing feed along.</p></div></div>
    <div className="publish-studio-identity flex items-start gap-3 rounded-xl border p-4 sm:p-5"><span className="publish-studio-icon flex size-10 shrink-0 items-center justify-center rounded-xl"><UserRound aria-hidden="true" className="size-5" /></span><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[0.15em] text-brand-violet">Your publishing identity</p><p className="mt-1 font-semibold">Publishing as {artist}</p><p className="mt-1 break-all text-xs text-muted-foreground">{nip19.npubEncode(pubkey)}</p><p className="mt-2 text-sm font-medium leading-6 text-primary">For an existing show, sign in with that show’s Nostr account. Publishing with another account creates a different show identity.</p></div></div>
    <div className="grid gap-3 sm:grid-cols-2"><div className="publish-studio-note"><ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-violet" /><p><span className="block font-semibold text-foreground">Share responsibly</span>Only publish audio and artwork you have permission to share. Nostr events are public; relays may retain older copies after corrections or deletion requests.</p></div><div className="publish-studio-note"><Radio aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-violet" /><p><span className="block font-semibold text-foreground">About distribution</span>Nostr-native shows do not automatically get an RSS feed or traditional directory listing. Ostrify displays RSS and Nostr listings separately; importing does not link them.</p></div></div>
    <Tabs defaultValue="show" className="publish-studio-card p-4 sm:p-6">
      <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-violet">Your podcast</p><h3 className="mt-1 text-lg font-bold">Make something worth hearing.</h3></div>
      <TabsList className="publish-studio-tabs mt-3 grid h-auto w-full max-w-xl grid-cols-3"><TabsTrigger value="show"><Mic2 aria-hidden="true" className="hidden sm:block" />My Show</TabsTrigger><TabsTrigger value="episode" className="whitespace-normal text-center leading-tight"><AudioLines aria-hidden="true" className="hidden sm:block" />Publish Episode</TabsTrigger><TabsTrigger value="rss"><Rss aria-hidden="true" className="hidden sm:block" />Import RSS</TabsTrigger></TabsList>
      <TabsContent value="show" className="space-y-4 pt-5">
        <p className="text-sm leading-6 text-muted-foreground">One NIP-F4 show per Nostr account. Ostrify discovery currently shows a show when it also finds a playable episode on its read relays.</p>
        <div className="publish-studio-inset flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground"><span className="flex items-center gap-2"><Radio aria-hidden="true" className="size-4 shrink-0 text-brand-violet" />{showQuery.isFetching ? 'Checking your read relays…' : showQuery.data?.complete && showQuery.data.completedRelays.length ? showQuery.data.event ? 'Existing show loaded from available relays.' : 'No show found on checked relays.' : 'Relay checks incomplete. A show may exist elsewhere.'}</span><Button type="button" size="sm" variant="outline" disabled={busy || showQuery.isFetching} onClick={() => { if (showEdited.current && !window.confirm('Reloading will replace your unsaved show edits. Continue?')) return; showEdited.current = false; setCover(undefined); setCoverReset(value => value + 1); initialized.current = false; void showQuery.refetch(); }}>Reload show</Button></div>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); setBusy(true); setNotice(undefined); void (async () => { try { const data = { ...show, image: cover ? await uploadFile(cover, 'image/') : show.image }; const status = await publishShow(data); setCover(undefined); setCoverReset(value => value + 1); setNotice({ text: `${status}. Show metadata saved.` }); } catch (error) { setNotice({ text: messageOf(error), error: true }); } finally { setBusy(false); } })(); }}>
          <label className="space-y-2 text-sm font-medium sm:col-span-2">Show title<Input required maxLength={200} value={show.title} onChange={event => { showEdited.current = true; setShow({ ...show, title: event.target.value }); }} /></label>
          <label className="space-y-2 text-sm font-medium sm:col-span-2">Description<Textarea maxLength={5000} value={show.description} onChange={event => { showEdited.current = true; setShow({ ...show, description: event.target.value }); }} /></label>
          <label className="space-y-2 text-sm font-medium">Cover artwork (Blossom upload)<Input key={coverReset} type="file" accept="image/*" onChange={event => { showEdited.current = true; setCover(event.target.files?.[0]); }} /></label>
          <label className="space-y-2 text-sm font-medium">Or HTTPS cover URL<Input type="url" value={show.image} onChange={event => { showEdited.current = true; setShow({ ...show, image: event.target.value }); }} placeholder="https://…" /></label>
          <label className="space-y-2 text-sm font-medium sm:col-span-2">Website (optional)<Input type="url" value={show.website} onChange={event => { showEdited.current = true; setShow({ ...show, website: event.target.value }); }} placeholder="https://…" /></label>
          <div className="sm:col-span-2"><Button type="submit" disabled={busy || showQuery.isFetching}>{busy ? 'Publishing…' : 'Publish show'}</Button></div>
        </form>
      </TabsContent>
      <TabsContent value="episode" className="pt-5"><form className="grid gap-4 sm:grid-cols-2" onSubmit={event => void publishEpisode(event)}>
        <p className="text-sm text-muted-foreground sm:col-span-2">Episodes are published under the signed-in show account. If no episode artwork is supplied, the show artwork is used.</p>
        <label className="space-y-2 text-sm font-medium sm:col-span-2">Episode title<Input required maxLength={200} value={title} onChange={event => setTitle(event.target.value)} /></label>
        <label className="space-y-2 text-sm font-medium sm:col-span-2">Description<Textarea maxLength={5000} value={description} onChange={event => setDescription(event.target.value)} /></label>
        <label className="space-y-2 text-sm font-medium">Audio file (Blossom upload)<Input key={fileReset} type="file" accept="audio/*" onChange={event => setAudioFile(event.target.files?.[0])} /></label>
        <label className="space-y-2 text-sm font-medium">Or HTTPS audio URL<Input type="url" value={audio} onChange={event => setAudio(event.target.value)} placeholder="https://…" /></label>
        <label className="space-y-2 text-sm font-medium sm:col-span-2">Episode artwork (optional)<Input key={fileReset} type="file" accept="image/*" onChange={event => setEpisodeImage(event.target.files?.[0])} /></label>
        <div className="sm:col-span-2"><Button type="submit" disabled={busy || !title.trim()}>{busy ? 'Publishing…' : 'Publish episode'}</Button></div>
      </form></TabsContent>
      <TabsContent value="rss" className="space-y-4 pt-5">
        <div className="publish-studio-inset flex items-start gap-3"><Rss aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-violet" /><p className="text-sm leading-6 text-muted-foreground"><span className="block font-semibold text-foreground">Bring your feed, on your schedule</span>Manual import only: return here and preview the feed again to check for new episodes. Importing does not change your original RSS feed. Audio stays on its existing host and may stop working if that host changes or removes it.</p></div>
        <p className="flex items-start gap-2 text-sm leading-6 text-muted-foreground"><CircleAlert aria-hidden="true" className="mt-1 size-4 shrink-0" /><span>Your browser fetches the public feed directly. Feeds up to 25 MB are supported; large feeds may take longer to prepare. Hosts that block cross-origin requests (CORS), require login, or are offline cannot be imported here.</span></p>
        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={event => void previewFeed(event)}><label className="flex-1 text-sm font-medium">Public HTTPS RSS feed<Input type="url" required disabled={busy} value={feedUrl} onChange={event => { setFeedUrl(event.target.value); setFeed(undefined); setSelected(new Set()); setEpisodeSearch(''); setEpisodePage(0); setResults({}); }} placeholder="https://example.com/feed.xml" /></label><Button className="sm:self-end" disabled={busy} type="submit">Preview feed</Button></form>
        {previewProgress && <p role="status" className="text-sm text-muted-foreground">{previewProgress}</p>}
        {feed && <div className="publish-studio-inset space-y-4">
          <div className="flex gap-4">{feed.show.image && <img src={feed.show.image} alt="" className="size-20 rounded-lg object-cover" />}<div className="min-w-0"><h3 className="font-semibold">{feed.show.title}</h3><p className="mt-1 line-clamp-3 break-words text-sm text-muted-foreground">{feed.show.description || 'No show description'}</p><p className="mt-1 text-xs text-muted-foreground">{feed.episodes.length} importable episodes{feed.skipped ? ` · ${feed.skipped} skipped (missing title, HTTPS audio or duplicate ID)` : ''}</p></div></div>
          <fieldset className="space-y-2 text-sm"><legend className="font-semibold">Nostr show metadata</legend><label className="flex gap-2"><input type="radio" name="rss-show" disabled={busy} checked={showAction === 'none'} onChange={() => setShowAction('none')} />Keep existing show unchanged</label><label className="flex gap-2"><input type="radio" name="rss-show" disabled={busy} checked={showAction === 'publish'} onChange={() => setShowAction('publish')} />Create or update show from feed details</label></fieldset>
          <label className="block space-y-2 text-sm font-medium">Search episodes<Input type="search" value={episodeSearch} onChange={event => { setEpisodeSearch(event.target.value); setEpisodePage(0); }} placeholder="Search episode titles" /></label>
          <div className="flex flex-wrap items-center gap-2"><Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setSelected(new Set(feed.episodes.map(item => item.id)))}>Select all episodes</Button><Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setSelected(new Set())}>Clear selection</Button><span className="text-xs text-muted-foreground">{selected.size} selected across the entire feed</span></div>
          <div className="max-h-80 space-y-2 overflow-y-auto" aria-label="Feed episodes">{pageEpisodes.map(item => <label key={item.id} className="flex items-start gap-3 rounded-lg border border-border bg-card p-3 text-sm"><input className="mt-1 accent-primary" type="checkbox" disabled={busy} checked={selected.has(item.id)} onChange={event => { const checked = event.target.checked; setSelected(current => { const next = new Set(current); if (checked) next.add(item.id); else next.delete(item.id); return next; }); }} /><span className="min-w-0 flex-1 break-words"><span className="font-medium">{item.title}</span>{results[item.id] && <span className="mt-1 block text-xs text-muted-foreground">{results[item.id]}</span>}</span></label>)}{!pageEpisodes.length && <p className="py-4 text-sm text-muted-foreground">No episodes match your search.</p>}</div>
          {filteredEpisodes.length > 0 && <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span>Showing {currentPage * EPISODES_PER_PAGE + 1}–{Math.min((currentPage + 1) * EPISODES_PER_PAGE, filteredEpisodes.length)} of {filteredEpisodes.length} {episodeSearch.trim() ? 'matching episodes' : 'episodes'}</span><div className="flex gap-2"><Button type="button" size="sm" variant="outline" disabled={currentPage === 0} onClick={() => setEpisodePage(currentPage - 1)}>Previous</Button><Button type="button" size="sm" variant="outline" disabled={currentPage >= pageCount - 1} onClick={() => setEpisodePage(currentPage + 1)}>Next</Button></div></div>}
          {Object.keys(results).length > 0 && <p className="text-xs text-muted-foreground">Results are shown beside episodes on their respective pages. {Object.values(results).filter(result => result.startsWith('Not confirmed:')).length} not confirmed.</p>}
          <p className="text-xs text-muted-foreground">Duplicate detection is best effort, based on this feed URL and episode GUID (or audio URL). Changed identifiers, other clients, incomplete relay checks or interrupted imports can cause duplicates. Unconfirmed sends may have succeeded; retries on this device reuse the same signed event.</p>
          <Button type="button" disabled={busy || (!selected.size && showAction === 'none')} onClick={() => void importEpisodes()}>{busy ? 'Importing…' : `Import selected (${selected.size})`}</Button>
          {progress && <p role="status" className="text-sm">{progress}</p>}
        </div>}
      </TabsContent>
    </Tabs>
    {notice && <p role={notice.error ? 'alert' : 'status'} className={`rounded-lg border px-4 py-3 text-sm ${notice.error ? 'border-destructive/50 text-destructive' : 'border-primary/30 text-foreground'}`}>{notice.text}</p>}
  </section>;
}
