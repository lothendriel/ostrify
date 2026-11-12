import { useEffect, useMemo, useState } from "react";
import { useSeoMeta } from "@unhead/react";
import { Activity, BookOpen, Clock3, Headphones, Heart, Library, Mic2, Music2, Radio, RotateCcw, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { usePlayer } from "@/hooks/usePlayer";
import { usePlaylists } from "@/hooks/usePlaylists";
import { useFollowedArtists } from "@/hooks/useFollowedArtists";
import { usePodcastFavorites } from "@/hooks/usePodcasts";
import { useAudiobookLibrary } from "@/hooks/useAudiobookLibrary";
import { useNetworkPulse } from "@/hooks/useNetworkPulse";
import { clearListeningRecords, readListeningRecords, type ListeningRecord } from "@/lib/listeningAnalytics";

function formatListeningTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours} hr ${remainingMinutes} min` : `${hours} hr`;
}

function StatCard({ icon: Icon, label, value, detail }: { icon: typeof Music2; label: string; value: string | number; detail: string }) {
  return <article className="rounded-xl border border-border/60 bg-card p-4 sm:p-5">
    <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground"><span>{label}</span><Icon className="size-4 shrink-0 text-primary" aria-hidden="true" /></div>
    <p className="mt-3 text-2xl font-bold tracking-tight">{value}</p>
    <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
  </article>;
}

function recordTotals(records: ListeningRecord[]) {
  return records.reduce((totals, record) => ({
    seconds: totals.seconds + record.seconds,
    plays: totals.plays + record.plays,
    music: totals.music + (record.kind === "music" ? record.plays : 0),
    podcasts: totals.podcasts + (record.kind === "podcast" ? record.plays : 0),
    audiobooks: totals.audiobooks + (record.kind === "audiobook" ? record.plays : 0),
  }), { seconds: 0, plays: 0, music: 0, podcasts: 0, audiobooks: 0 });
}

export default function AnalyticsPage() {
  useSeoMeta({ title: "Analytics — Ostrify", description: "Personal listening insights and live Nostr audio discovery stats." });
  const { user } = useCurrentUser();
  const player = usePlayer();
  const playlists = usePlaylists();
  const followedArtists = useFollowedArtists();
  const podcastFavorites = usePodcastFavorites();
  const audiobookLibrary = useAudiobookLibrary();
  const network = useNetworkPulse();
  const [records, setRecords] = useState(readListeningRecords);

  useEffect(() => {
    const refresh = () => setRecords(readListeningRecords());
    window.addEventListener("ostrify-analytics-update", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("ostrify-analytics-update", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const totals = useMemo(() => recordTotals(records), [records]);
  const recentRecords = useMemo(() => records.filter(record => {
    const date = new Date(`${record.date}T00:00:00`);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 6);
    cutoff.setHours(0, 0, 0, 0);
    return date >= cutoff;
  }), [records]);
  const weeklyTotals = useMemo(() => {
    const byDate = new Map<string, number>();
    for (const record of recentRecords) byDate.set(record.date, (byDate.get(record.date) ?? 0) + record.seconds);
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - index));
      const key = date.toISOString().slice(0, 10);
      return { key, label: date.toLocaleDateString(undefined, { weekday: "short" }), seconds: byDate.get(key) ?? 0 };
    });
  }, [recentRecords]);
  const maxDay = Math.max(60, ...weeklyTotals.map(day => day.seconds));
  const topTracks = useMemo(() => {
    const aggregate = new Map<string, { title: string; artist: string; seconds: number; plays: number }>();
    for (const record of records) {
      const current = aggregate.get(record.trackId) ?? { title: record.title, artist: record.artist, seconds: 0, plays: 0 };
      current.seconds += record.seconds;
      current.plays += record.plays;
      aggregate.set(record.trackId, current);
    }
    return [...aggregate.values()].sort((a, b) => b.seconds - a.seconds || b.plays - a.plays).slice(0, 5);
  }, [records]);
  const libraryCounts = useMemo(() => {
    const all = playlists.data ?? [];
    const liked = all.find(playlist => playlist.isLiked)?.trackIds.length ?? 0;
    return { liked, playlists: all.filter(playlist => !playlist.isLiked).length };
  }, [playlists.data]);
  const savedShows = podcastFavorites.data.filter(item => !item.episode).length;
  const savedEpisodes = podcastFavorites.data.filter(item => item.episode).length;

  return <main className="space-y-7 p-4 sm:p-6">
    <header className="relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br from-violet-950 via-indigo-950 to-card p-6 text-white sm:p-8">
      <div className="absolute -right-10 -top-16 size-64 rounded-full bg-violet-500/20 blur-3xl" aria-hidden="true" />
      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div><p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-violet-200"><Activity className="size-4" /> Your Ostrify</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Listening, in perspective.</h1>
          <p className="mt-2 max-w-xl text-sm text-white/70">A private look at your listening habits, alongside a live pulse of audio appearing across your Nostr relays.</p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-xs text-white/75"><Radio className="size-4 text-violet-200" /> {network.data ? `Relay snapshot · ${new Date(network.data.sampledAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Relay snapshot"}</div>
      </div>
    </header>

    <section aria-labelledby="personal-analytics-heading" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 id="personal-analytics-heading" className="text-xl font-bold">Your listening</h2><p className="mt-1 text-sm text-muted-foreground">Stored only in this browser. Listening insights are never published to Nostr.</p></div>
        <Button type="button" variant="ghost" size="sm" onClick={() => { clearListeningRecords(); setRecords([]); }} disabled={records.length === 0} className="text-muted-foreground"><RotateCcw className="mr-2 size-4" /> Clear listening data</Button>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={Clock3} label="Listening time" value={formatListeningTime(totals.seconds)} detail="Across this browser · last 180 days" />
        <StatCard icon={Headphones} label="Play sessions" value={totals.plays} detail="Tracks started on this device" />
        <StatCard icon={Music2} label="Unique tracks" value={new Set(records.map(record => record.trackId)).size} detail="Audio items played" />
        <StatCard icon={player.isPlaying ? Headphones : Clock3} label={player.isPlaying ? "Now playing" : "Recently played"} value={player.current?.title ?? player.history[0]?.title ?? "Nothing yet"} detail={player.current?.artist ?? player.history[0]?.artist ?? "Start listening to build your stats"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <article className="rounded-xl border border-border/60 bg-card p-4 sm:p-5">
          <div className="flex items-center justify-between"><div><h3 className="font-semibold">Last 7 days</h3><p className="text-xs text-muted-foreground">Time spent listening each day</p></div><span className="text-sm font-semibold text-primary">{formatListeningTime(recentRecords.reduce((sum, record) => sum + record.seconds, 0))}</span></div>
          <div className="mt-6 grid h-36 grid-cols-7 items-end gap-2" role="img" aria-label="Listening time by day for the last seven days">
            {weeklyTotals.map(day => <div key={day.key} className="flex h-full flex-col items-center justify-end gap-2"><span className="text-[10px] text-muted-foreground">{day.seconds >= 60 ? `${Math.round(day.seconds / 60)}m` : ""}</span><div className="flex h-24 w-full items-end rounded-md bg-secondary/60"><div className="w-full rounded-md bg-gradient-to-t from-violet-700 to-fuchsia-400 transition-[height]" style={{ height: `${day.seconds > 0 ? Math.max(8, day.seconds / maxDay * 100) : 0}%` }} /></div><span className="text-[10px] text-muted-foreground">{day.label}</span></div>)}
          </div>
        </article>
        <article className="rounded-xl border border-border/60 bg-card p-4 sm:p-5">
          <h3 className="font-semibold">By format</h3><p className="text-xs text-muted-foreground">Play sessions by audio type</p>
          <div className="mt-5 space-y-4">{[
            { label: "Music", value: totals.music, icon: Music2, color: "bg-violet-500" },
            { label: "Podcasts", value: totals.podcasts, icon: Mic2, color: "bg-fuchsia-500" },
            { label: "Audiobooks", value: totals.audiobooks, icon: BookOpen, color: "bg-rose-500" },
          ].map(item => <div key={item.label}><div className="mb-1.5 flex items-center justify-between text-sm"><span className="flex items-center gap-2"><item.icon className="size-4 text-muted-foreground" />{item.label}</span><span className="font-medium">{item.value}</span></div><div className="h-2 overflow-hidden rounded-full bg-secondary"><div className={`h-full rounded-full ${item.color}`} style={{ width: `${totals.plays ? Math.max(item.value ? 2 : 0, item.value / totals.plays * 100) : 0}%` }} /></div></div>)}
          </div>
        </article>
      </div>

      <article className="rounded-xl border border-border/60 bg-card p-4 sm:p-5"><div className="mb-4 flex items-center justify-between"><div><h3 className="font-semibold">Most listened</h3><p className="text-xs text-muted-foreground">Ranked by time played in this browser</p></div></div>
        {topTracks.length ? <ol className="divide-y divide-border/60">{topTracks.map((track, index) => <li key={`${track.title}-${index}`} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"><span className="w-5 text-center text-sm font-semibold text-muted-foreground">{index + 1}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{track.title}</p><p className="truncate text-xs text-muted-foreground">{track.artist} · {track.plays} {track.plays === 1 ? "play" : "plays"}</p></div><span className="shrink-0 text-sm text-muted-foreground">{formatListeningTime(track.seconds)}</span></li>)}</ol> : <div className="rounded-lg border border-dashed p-6 text-center"><Headphones className="mx-auto size-7 text-muted-foreground" /><p className="mt-2 text-sm text-muted-foreground">Start listening and your personal chart will take shape here.</p></div>}
      </article>
    </section>

    <section aria-labelledby="network-analytics-heading" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 id="network-analytics-heading" className="text-xl font-bold">Nostr network pulse</h2><p className="mt-1 text-sm text-muted-foreground">A sample of audio events discoverable on your enabled read relays. Counts are not global totals.</p></div><Button type="button" variant="outline" size="sm" onClick={() => void network.refetch()} disabled={network.isFetching}><RotateCcw className={`mr-2 size-4 ${network.isFetching ? "animate-spin" : ""}`} /> Refresh snapshot</Button></div>
      {network.isLoading ? <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-28 rounded-xl" />)}</div> : network.isError ? <div className="rounded-xl border border-destructive/40 p-5 text-sm" role="alert"><p>Could not read the current relay snapshot.</p><Button type="button" variant="link" className="px-0" onClick={() => void network.refetch()}>Try again</Button></div> : !network.data?.relays ? <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">Enable a read relay in Settings to see audio discovery stats.</div> : <>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard icon={Radio} label="Playable events found" value={network.data.tracks.toLocaleString()} detail="Recent sample · last 7 days" />
          <StatCard icon={Activity} label="Found in last 24h" value={network.data.lastDay.toLocaleString()} detail="In this relay query sample" />
          <StatCard icon={Users} label="Distinct publishers" value={network.data.creators.toLocaleString()} detail="Authors in sampled events" />
          <StatCard icon={Library} label="Read relays" value={network.data.relays} detail="Included in this snapshot" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><StatCard icon={Music2} label="Music events" value={network.data.music.toLocaleString()} detail="Playable tracks found" /><StatCard icon={Mic2} label="Podcast episodes" value={network.data.podcasts.toLocaleString()} detail="Playable episodes found" /><StatCard icon={BookOpen} label="Audiobook items" value={network.data.audiobooks.toLocaleString()} detail="Playable recordings found" /></div>
        {network.data.tracks === 0 && <p className="text-sm text-muted-foreground">No playable audio surfaced in this sample. Results depend on relay coverage and event formats.</p>}
      </>}
    </section>

    <section aria-labelledby="library-analytics-heading" className="space-y-3">
      <div><h2 id="library-analytics-heading" className="text-xl font-bold">Your library</h2><p className="mt-1 text-sm text-muted-foreground">A quick snapshot of your saved Ostrify collections.</p></div>
      {!user ? <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">Sign in to show your Nostr-synced music library stats. Listening insights above remain local to this browser.</div> : <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={Heart} label="Liked tracks" value={libraryCounts.liked} detail={playlists.isLoading ? "Loading your library…" : "Saved to your liked list"} />
        <StatCard icon={Library} label="Playlists" value={libraryCounts.playlists} detail="Your Ostrify playlists" />
        <StatCard icon={Users} label="Followed artists" value={followedArtists.data?.length ?? 0} detail={followedArtists.isLoading ? "Loading your library…" : "Artists in your follow set"} />
        <StatCard icon={BookOpen} label="Audiobooks" value={audiobookLibrary.favoriteBooks.length} detail={`${audiobookLibrary.collections.length} collections · saved locally / synced privately`} />
        <StatCard icon={Mic2} label="Podcast saves" value={savedShows + savedEpisodes} detail={`${savedShows} shows · ${savedEpisodes} episodes`} />
      </div>}
    </section>
    <p className="text-xs text-muted-foreground">Personal play counts and time are estimates from this browser’s audio player. Inline streams and other devices aren’t included. Network counts are sampled from enabled relays and may overlap.</p>
  </main>;
}
