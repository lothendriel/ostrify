import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowDown, ArrowUp, CheckCircle2, LoaderCircle, Plus, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePublishMusicEvent, type MusicVisibility } from "@/hooks/usePublishMusicEvent";
import { useRepublishMusicToDrops } from "@/hooks/useRepublishMusicToDrops";
import { DROPS_MUSIC_RELAY } from "@/lib/sources";
import { useUploadFile } from "@/hooks/useUploadFile";
import { Link } from "react-router-dom";
import { sanitizeUrl } from "@/lib/sanitize";
import { AUDIO_EXT_RE, type Track } from "@/lib/music";
import { groupIntoAlbums, useArtistTracks } from "@/hooks/useArtistTracks";
import { CATEGORIES } from "@/lib/categories";

type ReleaseTrack = { id: string; file?: File; title: string; url: string; trackNumber?: number; existing?: Track; visibility?: MusicVisibility };
type AlbumTarget = { id: string; title: string; image?: string };

function albumTargetId(id: string, title: string | undefined): string {
  return id.startsWith("id:") ? id.slice(3) : `legacy-${encodeURIComponent((title ?? "").normalize("NFKC").trim().toLocaleLowerCase())}`;
}

function newId(): string {
  return crypto.randomUUID();
}

function uploadUrl(tags: string[][]): string | undefined {
  return tags.find(([name]) => name === "url")?.[1];
}

// Use recognized individual tags rather than the combined display labels (e.g. Jazz & Blues).
const GENRE_OPTIONS = CATEGORIES.filter(category => category.id !== "bitcoin" && category.id !== "general").map(category => ({
  id: category.id,
  label: category.label,
  tag: category.match[0],
}));
const GENRE_INPUT_LIMIT = 80;

function genreKey(value: string): string {
  return value.trim().replace(/^#+/, "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function parseGenres(value: string): string[] {
  const seen = new Set<string>();
  return value.split(",").map(genre => genre.trim().replace(/^#+/, "").trim().toLowerCase()).filter(genre => {
    const key = genreKey(genre);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function addGenreTags(tags: string[][], value: string): void {
  const existing = new Set(tags.filter(([name]) => name === "t").map(([, tag]) => genreKey(tag ?? "")));
  for (const genre of parseGenres(value)) {
    const key = genreKey(genre);
    if (!existing.has(key)) {
      tags.push(["t", genre]);
      existing.add(key);
    }
  }
}

function GenreField({ id, value, onChange, album = false }: { id: string; value: string; onChange: (value: string) => void; album?: boolean }) {
  const selected = new Set(parseGenres(value).map(genreKey));
  return <div className="min-w-0 space-y-2">
    <label htmlFor={id} className="text-sm font-medium">Genre (optional)</label>
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
      <Input id={id} value={value} onChange={event => onChange(event.target.value)} maxLength={GENRE_INPUT_LIMIT} placeholder="Ambient, folk, rock…" aria-describedby={`${id}-help`} className="min-w-0 lg:flex-1" />
      <div className="flex min-w-0 flex-wrap gap-2 lg:flex-1" role="group" aria-label="Quick add main genres">
        {GENRE_OPTIONS.map(option => {
          const isSelected = selected.has(genreKey(option.tag));
          const current = value.replace(/[\s,]+$/, "");
          const next = current ? `${current}, ${option.tag}` : option.tag;
          const tooLong = next.length > GENRE_INPUT_LIMIT;
          return <Button key={option.id} type="button" size="sm" variant={isSelected ? "secondary" : "outline"} aria-pressed={isSelected} disabled={!isSelected && tooLong} onClick={() => {
            if (isSelected) onChange(value.split(",").filter(genre => genreKey(genre) !== genreKey(option.tag)).map(genre => genre.trim()).filter(Boolean).join(", "));
            else onChange(next);
          }}>{option.label}</Button>;
        })}
      </div>
    </div>
    <p id={`${id}-help`} className="text-xs text-muted-foreground">Separate genres with commas. {album ? "Genres are added to every included track; existing tags are kept." : "Choose a main genre or enter your own, including sub-genres."}</p>
  </div>;
}

function VisibilityOptions({ name, value, onChange }: { name: string; value: MusicVisibility; onChange: (value: MusicVisibility) => void }) {
  return <fieldset className="space-y-2 sm:col-span-2"><legend className="text-sm font-medium">Ostrify visibility</legend><label className="flex items-start gap-2 text-sm"><input type="radio" name={name} value="public" checked={value === "public"} onChange={() => onChange("public")} className="mt-1 accent-primary" /><span><span className="font-medium">Show on Ostrify</span><span className="block text-xs text-muted-foreground">Visible in Ostrify discovery and sent to DROPS ({DROPS_MUSIC_RELAY}) as well as your configured write relays.</span></span></label><label className="flex items-start gap-2 text-sm"><input type="radio" name={name} value="hidden" checked={value === "hidden"} onChange={() => onChange("hidden")} className="mt-1 accent-primary" /><span><span className="font-medium">Hidden in Ostrify</span><span className="block text-xs text-muted-foreground">Hidden from Ostrify discovery only; the event and audio remain public on your write relays and media host.</span></span></label></fieldset>;
}

export function PublishMusicPanel({ artist, artistPubkey }: { artist: string; artistPubkey: string }) {
  const [tab, setTab] = useState("track");
  const [trackTitle, setTrackTitle] = useState("");
  const [trackUrl, setTrackUrl] = useState("");
  const [trackFile, setTrackFile] = useState<File | undefined>();
  const [trackImage, setTrackImage] = useState<File | undefined>();
  const [trackGenre, setTrackGenre] = useState("");
  const [trackVisibility, setTrackVisibility] = useState<MusicVisibility>("public");
  const [albumTitle, setAlbumTitle] = useState("");
  const [albumId, setAlbumId] = useState(() => newId());
  const [selectedAlbumId, setSelectedAlbumId] = useState("");
  const [albumCover, setAlbumCover] = useState<File | undefined>();
  const [albumGenre, setAlbumGenre] = useState("");
  const [albumVisibility, setAlbumVisibility] = useState<MusicVisibility>("public");
  const [albumTrackVisibility, setAlbumTrackVisibility] = useState<Record<string, MusicVisibility>>({});
  const [albumTracks, setAlbumTracks] = useState<ReleaseTrack[]>([]);
  const [selectedExistingIds, setSelectedExistingIds] = useState<string[]>([]);
  const [existingSearch, setExistingSearch] = useState("");
  const [showHiddenTracks, setShowHiddenTracks] = useState(false);
  const [dropsSentIds, setDropsSentIds] = useState<string[]>([]);
  const [dropsRemovedIds, setDropsRemovedIds] = useState<string[]>([]);
  const [message, setMessage] = useState<{ text: string; error: boolean }>();
  const publish = usePublishMusicEvent();
  const republishDrops = useRepublishMusicToDrops();
  const upload = useUploadFile();
  const queryClient = useQueryClient();
  const existingQuery = useArtistTracks(artistPubkey);
  const existingTracks = (existingQuery.data ?? []).filter(track => track.kind === "music" && track.event?.kind === 36787 && !!track.addressableId && track.pubkey === artistPubkey);
  const hiddenExistingTracks = existingTracks.filter(track => track.visibility === "hidden");
  const albums = groupIntoAlbums(existingTracks.filter(track => track.visibility !== "hidden")).albums;
  const selectedAlbum = albums.find(album => albumTargetId(album.id, album.title) === selectedAlbumId);
  const selectedAlbumMemberIds = new Set(selectedAlbum?.tracks.map(track => track.id) ?? []);
  const selectableExistingTracks = showHiddenTracks ? existingTracks : existingTracks.filter(track => track.visibility !== "hidden");
  const availableExistingTracks = selectableExistingTracks
    .filter(track => !!track.addressableId && !selectedAlbumMemberIds.has(track.id))
    .filter(track => `${track.title} ${track.artist ?? ""} ${track.album ?? ""}`.toLocaleLowerCase().includes(existingSearch.trim().toLocaleLowerCase()));
  const targets: AlbumTarget[] = albums.map(album => ({ id: albumTargetId(album.id, album.title), title: album.title ?? "Untitled album", image: album.image }));
  const busy = publish.isPending || upload.isPending || republishDrops.publish.isPending;

  const chooseTrack = (file: File | undefined) => {
    if (file && !file.type.startsWith("audio/")) {
      setMessage({ text: "Please choose an audio file.", error: true });
      return;
    }
    setMessage(undefined);
    setTrackFile(file);
    if (file && !trackTitle.trim()) setTrackTitle(file.name.replace(/\.[^.]+$/, ""));
  };

  const onAlbumFiles = (files: FileList | null) => {
    if (!files) return;
    const accepted = Array.from(files).filter(file => file.type.startsWith("audio/"));
    setAlbumTracks(previous => {
      const start = previous.reduce((highest, track) => Math.max(highest, track.trackNumber ?? 0), 0);
      const added = accepted.map((file, index) => ({ id: newId(), file, title: file.name.replace(/\.[^.]+$/, ""), url: "", trackNumber: start + index + 1 }));
      return [...previous, ...added];
    });
    if (Array.from(files).some(file => !file.type.startsWith("audio/"))) setMessage({ text: "Some files were skipped because they are not recognized as audio.", error: true });
    else setMessage(undefined);
  };

  const submitTrack = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(undefined);
    try {
      let url = sanitizeUrl(trackUrl);
      let mediaTags: string[][] = [];
      if (trackFile) {
        mediaTags = await upload.mutateAsync(trackFile);
        url = sanitizeUrl(uploadUrl(mediaTags));
        if (!url) throw new Error("The Blossom upload did not return a usable audio URL.");
      }
      if (!url) throw new Error("Choose an audio file to upload or enter a valid HTTPS audio URL.");
      if (!trackFile && !AUDIO_EXT_RE.test(url)) throw new Error("Enter a URL ending in a recognized audio extension, or upload the file through Blossom.");
      let imageUrl: string | undefined;
      if (trackImage) {
        const imageTags = await upload.mutateAsync(trackImage);
        imageUrl = sanitizeUrl(uploadUrl(imageTags));
        if (!imageUrl) throw new Error("The image upload did not return a usable URL.");
      }
      const tags: string[][] = [["d", newId()], ["title", trackTitle.trim()], ["url", url], ["artist", artist], ["artist_pubkey", artistPubkey], ["alt", "Music track"], ...mediaTags.filter(([name]) => name !== "url")];
      if (trackImage && imageUrl) tags.push(["image", imageUrl]);
      addGenreTags(tags, trackGenre);
      const mime = trackFile?.type;
      if (mime?.startsWith("audio/") && !tags.some(([name]) => name === "m")) tags.push(["m", mime]);
      const result = await publish.mutateAsync({ kind: 36787, content: "", tags, visibility: trackVisibility });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["artist-tracks"] }),
        queryClient.invalidateQueries({ queryKey: ["tracks"] }),
        queryClient.invalidateQueries({ queryKey: ["home-tracks"] }),
        queryClient.invalidateQueries({ queryKey: ["fresh-nostr-tracks"] }),
        queryClient.invalidateQueries({ queryKey: ["category-tracks"] }),
      ]);
      setTrackTitle(""); setTrackUrl(""); setTrackFile(undefined); setTrackImage(undefined); setTrackGenre(""); setTrackVisibility("public");
      setMessage({ text: trackVisibility === "hidden" ? "Track published to your configured write relays and hidden in Ostrify." : result.dropsError ? `Track published to your configured write relays, but DROPS could not confirm the shared copy: ${result.dropsError}` : "Track published to your configured write relays and shared to DROPS.", error: false });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Could not publish this track.", error: true });
    }
  };

  const submitAlbum = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(undefined);
    if (!albumTracks.length) { setMessage({ text: "Add at least one audio track to the album.", error: true }); return; }
    if (albumTracks.some(track => !track.title.trim())) { setMessage({ text: "Every album track needs a title.", error: true }); return; }
    if (!albumTitle.trim() && !selectedAlbum) { setMessage({ text: "Enter a new album title or choose an existing album.", error: true }); return; }

    try {
      const targetAlbumTitle = selectedAlbum?.title ?? albumTitle.trim();
      const targetAlbumId = selectedAlbumId.startsWith("legacy-") ? albumId : selectedAlbum ? selectedAlbumId : albumId;
      const targetVisibility: MusicVisibility = selectedAlbum ? selectedAlbum.tracks.every(track => track.visibility === "hidden") ? "hidden" : "public" : albumVisibility;
      let coverUrl: string | undefined = selectedAlbum?.image;
      if (albumCover) {
        const coverTags = await upload.mutateAsync(albumCover);
        coverUrl = sanitizeUrl(uploadUrl(coverTags));
        if (!coverUrl) throw new Error("The cover upload did not return a usable URL.");
      }

      let successful = 0;
      const failedIds = new Set<string>();
      const failures: string[] = [];
      for (const track of albumTracks) {
        try {
          let url = sanitizeUrl(track.url);
          let mediaTags: string[][] = [];
          if (track.file) {
            mediaTags = await upload.mutateAsync(track.file);
            url = sanitizeUrl(uploadUrl(mediaTags));
          }
          if (!url) throw new Error("Upload did not return a usable audio URL.");
          if (!track.existing && !track.file && !AUDIO_EXT_RE.test(url)) throw new Error("Track URL must end with a recognized audio file extension.");
          const visibility = albumTrackVisibility[track.id] ?? track.existing?.visibility ?? targetVisibility;
          if (track.existing && !track.existing.event) throw new Error("The existing track event is unavailable for an update. Reload your tracks and try again.");
          const tags: string[][] = track.existing?.event
            ? track.existing.event.tags.filter(([name]) => !["title", "album", "album_id", "track_number", "image", "client", "ostrify_visibility"].includes(name)).map(tag => [...tag])
            : [["d", track.id], ["url", url], ["artist", artist], ["artist_pubkey", artistPubkey], ["alt", "Music track"], ...mediaTags.filter(([name]) => name !== "url")];
          if (!tags.some(([name]) => name === "d")) throw new Error("This track has no stable addressable ID and can’t be safely updated.");
          if (coverUrl) tags.push(["image", coverUrl]);
          else if (track.existing?.image) tags.push(["image", track.existing.image]);
          tags.push(["title", track.title.trim()], ["album", targetAlbumTitle], ["album_id", targetAlbumId], ["track_number", String(track.trackNumber ?? 1)]);
          addGenreTags(tags, albumGenre);
          if (track.file?.type.startsWith("audio/") && !tags.some(([name]) => name === "m")) tags.push(["m", track.file.type]);
          const result = await publish.mutateAsync({ kind: 36787, content: track.existing?.event?.content ?? "", tags, visibility, removeFromDrops: !!track.existing && visibility === "hidden" && track.existing.visibility !== "hidden" });
          if (result.dropsError) throw new Error(`Published to your write relays, but DROPS may still show this track: ${result.dropsError}`);
          successful += 1;
        } catch (error) {
          failedIds.add(track.id);
          failures.push(`${track.title}: ${error instanceof Error ? error.message : "publish failed"}`);
        }
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["artist-tracks"] }),
        queryClient.invalidateQueries({ queryKey: ["tracks"] }),
        queryClient.invalidateQueries({ queryKey: ["home-tracks"] }),
        queryClient.invalidateQueries({ queryKey: ["fresh-nostr-tracks"] }),
        queryClient.invalidateQueries({ queryKey: ["category-tracks"] }),
      ]);
      if (failures.length) {
        setMessage({ text: `${successful} of ${albumTracks.length} tracks published. Failed tracks remain in the form for retry: ${failures.join("; ")}`, error: true });
        setAlbumTracks(current => current.filter(track => failedIds.has(track.id)));
      } else {
        if (!selectedAlbum) { setAlbumTitle(""); setAlbumId(newId()); }
        setSelectedAlbumId(""); setSelectedExistingIds([]); setExistingSearch(""); setAlbumCover(undefined); setAlbumGenre(""); setAlbumTracks([]); setAlbumTrackVisibility({}); setAlbumVisibility("public");
        setMessage({ text: `Album published: ${successful} track${successful === 1 ? "" : "s"} processed with the selected Ostrify visibility${targetVisibility === "public" ? " and shared to DROPS" : ""}.`, error: false });
      }
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Could not publish the album.", error: true });
    }
  };

  const moveTrack = (index: number, direction: -1 | 1) => setAlbumTracks(current => {
    const destination = index + direction;
    if (destination < 0 || destination >= current.length) return current;
    const next = [...current];
    [next[index], next[destination]] = [next[destination], next[index]];
    return next.map((track, position) => ({ ...track, trackNumber: position + 1 }));
  });

  return <section aria-label="Publish music" className="border-b border-white/10 bg-black/20 px-4 py-5 sm:px-6 lg:px-7">
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <div>
        <h2 className="text-xl font-bold">Publish music</h2>
        <p className="mt-1 text-sm text-muted-foreground">Publish signed kind 36787 track events to your configured Nostr write relays. Public tracks are additionally sent to DROPS ({DROPS_MUSIC_RELAY}) for Ostrify discovery.</p>
        <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm leading-relaxed text-muted-foreground"><span className="font-semibold text-foreground">Visibility note</span><br />“Hidden in Ostrify” only hides a track from Ostrify discovery and other Ostrify profiles; it does not make the public Nostr event or audio URL private. Relay copies may persist even after a hidden revision.</p>
        <aside className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm leading-relaxed text-muted-foreground"><p className="font-semibold text-foreground">For original artists</p><p className="mt-1">If you made the music, you can publish it through Ostrify. Only upload or link audio and artwork that you have the rights to share. Ostrify does not review uploads and is not responsible for copyright infringement or unauthorized material; you are responsible for ensuring your uploads comply with copyright law.</p></aside>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full max-w-sm grid-cols-2"><TabsTrigger value="track">Track</TabsTrigger><TabsTrigger value="album">Album</TabsTrigger></TabsList>
        <TabsContent value="track" className="pt-4">
          <form onSubmit={event => void submitTrack(event)} className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm font-medium sm:col-span-2">Track title<Input required value={trackTitle} onChange={event => setTrackTitle(event.target.value)} maxLength={200} placeholder="Song title" /></label>
            <div className="sm:col-span-2"><GenreField id="track-genres" value={trackGenre} onChange={setTrackGenre} /></div>
            <label className="space-y-2 text-sm font-medium sm:col-span-2">Audio file (Blossom upload)<Input type="file" accept="audio/*,.mp3,.m4a,.flac,.ogg,.opus,.wav" onChange={event => chooseTrack(event.target.files?.[0])} /></label>
            <label className="space-y-2 text-sm font-medium sm:col-span-2">Or existing HTTPS audio URL<Input type="url" value={trackUrl} onChange={event => { setTrackUrl(event.target.value); if (event.target.value) setTrackFile(undefined); }} placeholder="https://…/track.mp3" /></label>
            <label className="space-y-2 text-sm font-medium sm:col-span-2">Track image (optional)<Input type="file" accept="image/*" onChange={event => { const file = event.target.files?.[0]; if (file && !file.type.startsWith("image/")) { setMessage({ text: "Please choose an image file.", error: true }); return; } setMessage(undefined); setTrackImage(file); }} /></label>
            <VisibilityOptions name="track-visibility" value={trackVisibility} onChange={setTrackVisibility} />
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2"><Button type="submit" disabled={busy || !trackTitle.trim()}><Upload className="size-4" />{busy ? "Publishing…" : "Publish track"}</Button>{trackFile && <span className="text-sm text-muted-foreground">{trackFile.name}</span>}</div>
          </form>
        </TabsContent>
        <TabsContent value="album" className="space-y-4 pt-4">
          <form onSubmit={event => void submitAlbum(event)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm font-medium">Add to album<select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={selectedAlbumId} onChange={event => { const value = event.target.value; setSelectedAlbumId(value); setAlbumTrackVisibility({}); setMessage(undefined); const target = albums.find(album => albumTargetId(album.id, album.title) === value); const previousNewTracks = albumTracks.filter(track => !track.existing); const alreadyInTarget = target?.tracks.filter(track => track.addressableId).map(track => ({ id: track.addressableId as string, title: track.title, url: track.url, existing: track, trackNumber: track.trackNumber, visibility: track.visibility })) ?? []; const previouslyChosen = existingTracks.filter(track => selectedExistingIds.includes(track.id) && !target?.tracks.some(member => member.id === track.id)).map(track => ({ id: track.addressableId as string, title: track.title, url: track.url, existing: track, trackNumber: undefined as number | undefined, visibility: track.visibility })); setAlbumTracks([...alreadyInTarget, ...previouslyChosen, ...previousNewTracks].map((track, index) => ({ ...track, trackNumber: track.trackNumber ?? index + 1 }))); setAlbumId(newId()); setAlbumTitle(""); }}><option value="">Create a new album</option>{targets.map(target => <option key={target.id} value={target.id}>{target.title}</option>)}</select></label>
              <label className="space-y-2 text-sm font-medium">Album title<Input required={!selectedAlbum} disabled={!!selectedAlbum} value={selectedAlbum?.title ?? albumTitle} onChange={event => { setAlbumTitle(event.target.value); if (selectedAlbumId.startsWith("legacy-")) setAlbumId(newId()); }} maxLength={200} placeholder="Album title" /></label>
              <div className="sm:col-span-2"><GenreField id="album-genres" value={albumGenre} onChange={setAlbumGenre} album /></div>
              <label className="space-y-2 text-sm font-medium">Cover image (optional){selectedAlbum?.image && !albumCover && <span className="ml-2 text-xs font-normal text-muted-foreground">Existing cover will be kept</span>}<Input type="file" accept="image/*" onChange={event => { const file = event.target.files?.[0]; if (file && !file.type.startsWith("image/")) { setMessage({ text: "Please choose an image file.", error: true }); return; } setAlbumCover(file); setMessage(undefined); }} /></label>
              <label className="space-y-2 text-sm font-medium">Add audio tracks<Input type="file" multiple accept="audio/*,.mp3,.m4a,.flac,.ogg,.opus,.wav" onChange={event => { onAlbumFiles(event.target.files); event.target.value = ""; }} /></label>
            </div>
            {!selectedAlbum && <VisibilityOptions name="album-visibility" value={albumVisibility} onChange={setAlbumVisibility} />}
            <section className="space-y-3 rounded-lg border border-white/10 p-3" aria-label="Add existing tracks">
              <div><h3 className="font-semibold">Add previously published tracks</h3><p className="text-xs text-muted-foreground">Tracks load from your read relays and DROPS. Ostrify updates their existing addressable events, preserving audio and IDs.</p></div>
              <Input aria-label="Search published tracks" placeholder="Search your tracks" value={existingSearch} onChange={event => setExistingSearch(event.target.value)} />
              {hiddenExistingTracks.length > 0 && <label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={showHiddenTracks} onChange={event => setShowHiddenTracks(event.target.checked)} className="accent-primary" />Include tracks hidden in Ostrify ({hiddenExistingTracks.length})</label>}
              {existingQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading your published tracks…</p> : existingQuery.isError ? <p role="alert" className="text-sm text-destructive">Couldn’t load your published tracks from your read relays or DROPS. Check relay settings and retry.</p> : availableExistingTracks.length ? <div className="max-h-52 space-y-1 overflow-y-auto">{availableExistingTracks.map(track => <label key={track.id} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-white/[0.06]"><input type="checkbox" checked={selectedExistingIds.includes(track.id) || albumTracks.some(item => item.existing?.id === track.id)} onChange={event => { const checked = event.target.checked; setSelectedExistingIds(current => checked ? [...new Set([...current, track.id])] : current.filter(id => id !== track.id)); if (checked) { const visibility = track.visibility ?? (selectedAlbum?.tracks.every(item => item.visibility === "hidden") ? "hidden" : "public"); setAlbumTrackVisibility(current => ({ ...current, [track.id]: current[track.id] ?? visibility })); setAlbumTracks(current => [...current, { id: track.addressableId ?? track.id, title: track.title, url: track.url, existing: track, trackNumber: selectedAlbum ? Math.max(0, ...(selectedAlbum.tracks.map(item => item.trackNumber ?? 0)), ...current.map(item => item.trackNumber ?? 0)) + 1 : current.length + 1, visibility }]); } else setAlbumTracks(current => current.filter(item => item.existing?.id !== track.id).map((item, index) => ({ ...item, trackNumber: selectedAlbum && index < (selectedAlbum.tracks.length ?? 0) ? item.trackNumber : index + 1 }))); }} className="size-4 accent-primary" /><span className="min-w-0 flex-1 truncate text-sm">{track.title}</span><span className="truncate text-xs text-muted-foreground">{track.album ? `From ${track.album}` : "Single"}</span><select aria-label={`Ostrify visibility for ${track.title}`} value={albumTrackVisibility[track.id] ?? track.visibility ?? "public"} onChange={event => { const visibility = event.target.value as MusicVisibility; setAlbumTrackVisibility(current => ({ ...current, [track.id]: visibility })); setAlbumTracks(current => current.map(item => item.existing?.id === track.id ? { ...item, visibility } : item)); }} className="rounded border border-input bg-background px-2 py-1 text-xs"><option value="public">Visible</option><option value="hidden">Hidden in Ostrify</option></select></label>)}</div> : <p className="text-sm text-muted-foreground">No more eligible published tracks found.</p>}
            </section>
            {selectedAlbum && <p className="text-xs text-muted-foreground">Existing album tracks are preloaded. Reordering or adding tracks updates their track numbers when you publish.</p>}
            {albumTracks.length > 0 && <ol className="space-y-2" aria-label="Album track order">{albumTracks.map((track, index) => <li key={track.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/10 p-2"><span className="w-7 text-center text-sm tabular-nums text-muted-foreground">{index + 1}</span><Input aria-label={`Track ${index + 1} title`} value={track.title} onChange={event => setAlbumTracks(current => current.map(item => item.id === track.id ? { ...item, title: event.target.value } : item))} /><span className="hidden max-w-48 truncate text-xs text-muted-foreground sm:block">{track.file?.name}</span><Button type="button" variant="ghost" size="icon" aria-label={`Move ${track.title} up`} disabled={index === 0} onClick={() => moveTrack(index, -1)}><ArrowUp className="size-4" /></Button><Button type="button" variant="ghost" size="icon" aria-label={`Move ${track.title} down`} disabled={index === albumTracks.length - 1} onClick={() => moveTrack(index, 1)}><ArrowDown className="size-4" /></Button><Button type="button" variant="ghost" size="icon" aria-label={`Remove ${track.title}`} onClick={() => setAlbumTracks(current => current.filter(item => item.id !== track.id).map((item, position) => ({ ...item, trackNumber: position + 1 })))}><X className="size-4" /></Button></li>)}</ol>}
            {albumTracks.length === 0 && <div className="rounded-lg border border-dashed border-white/15 px-4 py-8 text-center text-sm text-muted-foreground"><Plus className="mx-auto mb-2 size-5" />Choose multiple audio files to start building the album. Reorder tracks before publishing.</div>}
            <Button type="submit" disabled={busy || (!selectedAlbum && !albumTitle.trim()) || albumTracks.length === 0}><Upload className="size-4" />{busy ? <><LoaderCircle className="size-4 animate-spin" /> Publishing album…</> : "Publish album"}</Button>
          </form>
        </TabsContent>
      </Tabs>
      <section className="space-y-3 rounded-lg border border-white/10 p-4" aria-label="Share existing public tracks to DROPS">
        <div><h3 className="font-semibold">Share existing public tracks</h3><p className="mt-1 text-sm text-muted-foreground">Review public tracks on your configured read relays that are not yet found on DROPS. Tracks hidden in Ostrify are excluded.</p></div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" disabled={busy || republishDrops.tracks.isFetching} onClick={() => { setMessage(undefined); setDropsSentIds([]); setDropsRemovedIds([]); void republishDrops.tracks.refetch(); }}>
            {republishDrops.tracks.isFetching ? <><LoaderCircle className="size-4 animate-spin" /> Loading tracks…</> : "Load my public tracks"}
          </Button>
          {republishDrops.tracks.isFetching && <span role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Checking your read relays and DROPS…</span>}
        </div>
        {republishDrops.tracks.isError && <p role="alert" className="text-sm text-destructive">{republishDrops.tracks.error.message}</p>}
        {republishDrops.tracks.data && <div className="space-y-2"><p className="text-xs text-muted-foreground">{republishDrops.tracks.data.filter(track => !dropsRemovedIds.includes(track.id)).length} public track(s) not found on DROPS.</p><div className="max-h-52 space-y-1 overflow-y-auto">{republishDrops.tracks.data.filter(track => !dropsRemovedIds.includes(track.id)).map(track => {
          const sent = dropsSentIds.includes(track.id);
          return <div key={track.id} className="flex items-center gap-3 rounded-md px-2 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate">{track.title}</span>
            {sent ? <span role="status" className="flex shrink-0 items-center gap-1 text-emerald-300"><CheckCircle2 className="size-4" />Sent to DROPS</span> : <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => {
              void republishDrops.publish.mutateAsync({ track }).then(() => {
                setDropsSentIds(current => [...new Set([...current, track.id])]);
                window.setTimeout(() => setDropsRemovedIds(current => [...new Set([...current, track.id])]), 1500);
              }).catch(error => setMessage({ text: error instanceof Error ? error.message : "Could not share this track to DROPS.", error: true }));
            }}>Send to DROPS</Button>}
          </div>;
        })}</div></div>}
      </section>
      <div className="rounded-lg border border-white/10 p-4"><h3 className="font-semibold">Manage your uploads</h3><p className="mt-1 text-sm text-muted-foreground">Review uploaded tracks and albums, paginate through your tracks, and manage their Ostrify visibility.</p><Link to="/my-uploads" className="mt-3 inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">Open My Uploads</Link></div>
      {message && <p role={message.error ? "alert" : "status"} className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${message.error ? "border-destructive/50 text-destructive" : "border-emerald-500/30 text-emerald-300"}`}>{message.error ? <AlertCircle className="mt-0.5 size-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0" />}{message.text}</p>}
      {upload.isError && <p role="alert" className="text-sm text-destructive">{upload.error.message}</p>}
    </div>
  </section>;
}
