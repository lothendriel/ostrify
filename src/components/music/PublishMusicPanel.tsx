import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowDown, ArrowUp, CheckCircle2, LoaderCircle, Plus, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNostrPublish } from "@/hooks/useNostrPublish";
import { useUploadFile } from "@/hooks/useUploadFile";
import { sanitizeUrl } from "@/lib/sanitize";
import { AUDIO_EXT_RE } from "@/lib/music";

type ReleaseTrack = { id: string; file?: File; title: string; url: string; trackNumber?: number };

function newId(): string {
  return crypto.randomUUID();
}

function uploadUrl(tags: string[][]): string | undefined {
  return tags.find(([name]) => name === "url")?.[1];
}

export function PublishMusicPanel({ artist, artistPubkey }: { artist: string; artistPubkey: string }) {
  const [tab, setTab] = useState("track");
  const [trackTitle, setTrackTitle] = useState("");
  const [trackUrl, setTrackUrl] = useState("");
  const [trackFile, setTrackFile] = useState<File | undefined>();
  const [trackImage, setTrackImage] = useState<File | undefined>();
  const [trackGenre, setTrackGenre] = useState("");
  const [albumTitle, setAlbumTitle] = useState("");
  const [albumId, setAlbumId] = useState(() => newId());
  const [albumCover, setAlbumCover] = useState<File | undefined>();
  const [albumGenre, setAlbumGenre] = useState("");
  const [albumTracks, setAlbumTracks] = useState<ReleaseTrack[]>([]);
  const [message, setMessage] = useState<{ text: string; error: boolean }>();
  const publish = useNostrPublish();
  const upload = useUploadFile();
  const queryClient = useQueryClient();
  const busy = publish.isPending || upload.isPending;

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
      const added = accepted.map((file, index) => ({
        id: newId(), file, title: file.name.replace(/\.[^.]+$/, ""), url: "", trackNumber: start + index + 1,
      }));
      return [...previous, ...added];
    });
    if (Array.from(files).some(file => !file.type.startsWith("audio/"))) {
      setMessage({ text: "Some files were skipped because they are not recognized as audio.", error: true });
    } else setMessage(undefined);
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
      const tags: string[][] = [
        ["d", newId()], ["title", trackTitle.trim()], ["url", url], ["artist", artist], ["artist_pubkey", artistPubkey],
        ["alt", "Music track"], ...mediaTags.filter(([name]) => name !== "url"),
      ];
      if (trackImage && imageUrl) tags.push(["image", imageUrl]);
      if (trackGenre.trim()) tags.push(["t", trackGenre.trim().toLowerCase()]);
      const mime = trackFile?.type;
      if (mime?.startsWith("audio/") && !tags.some(([name]) => name === "m")) tags.push(["m", mime]);
      await publish.mutateAsync({ kind: 36787, content: "", tags });
      await queryClient.invalidateQueries({ queryKey: ["artist-tracks"] });
      await queryClient.invalidateQueries({ queryKey: ["tracks"] });
      setTrackTitle(""); setTrackUrl(""); setTrackFile(undefined); setTrackImage(undefined); setTrackGenre("");
      setMessage({ text: "Track published to your configured write relays.", error: false });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Could not publish this track.", error: true });
    }
  };

  const submitAlbum = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(undefined);
    if (albumTracks.length === 0) {
      setMessage({ text: "Add at least one audio track to the album.", error: true });
      return;
    }
    if (albumTracks.some(track => !track.title.trim())) {
      setMessage({ text: "Every album track needs a title.", error: true });
      return;
    }

    try {
      let coverUrl: string | undefined;
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
          if (!track.file && !AUDIO_EXT_RE.test(url)) throw new Error("Track URL must end with a recognized audio file extension.");
          const tags: string[][] = [
            ["d", track.id], ["title", track.title.trim()], ["url", url], ["artist", artist], ["artist_pubkey", artistPubkey],
            ["album", albumTitle.trim()], ["album_id", albumId], ["track_number", String(track.trackNumber ?? 1)],
            ["alt", "Music track"], ...mediaTags.filter(([name]) => name !== "url"),
          ];
          if (coverUrl) tags.push(["image", coverUrl]);
          if (albumGenre.trim()) tags.push(["t", albumGenre.trim().toLowerCase()]);
          if (track.file?.type.startsWith("audio/") && !tags.some(([name]) => name === "m")) tags.push(["m", track.file.type]);
          await publish.mutateAsync({ kind: 36787, content: "", tags });
          successful += 1;
        } catch (error) {
          failedIds.add(track.id);
          failures.push(`${track.title}: ${error instanceof Error ? error.message : "publish failed"}`);
        }
      }
      await queryClient.invalidateQueries({ queryKey: ["artist-tracks"] });
      await queryClient.invalidateQueries({ queryKey: ["tracks"] });
      if (failures.length) {
        setMessage({ text: `${successful} of ${albumTracks.length} tracks published. Failed tracks remain in the form for retry: ${failures.join("; ")}`, error: true });
        setAlbumTracks(current => current.filter(track => failedIds.has(track.id)));
      } else {
        setAlbumTitle(""); setAlbumId(newId()); setAlbumCover(undefined); setAlbumGenre(""); setAlbumTracks([]);
        setMessage({ text: `Album published: all ${successful} track${successful === 1 ? "" : "s"} sent to your configured write relays.`, error: false });
      }
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Could not publish the album.", error: true });
    }
  };

  const moveTrack = (index: number, direction: -1 | 1) => {
    setAlbumTracks(current => {
      const destination = index + direction;
      if (destination < 0 || destination >= current.length) return current;
      const next = [...current];
      [next[index], next[destination]] = [next[destination], next[index]];
      return next.map((track, position) => ({ ...track, trackNumber: position + 1 }));
    });
  };

  return <section aria-label="Publish music" className="border-b border-white/10 bg-black/20 px-4 py-5 sm:px-6 lg:px-7">
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <div><h2 className="text-xl font-bold">Publish music</h2><p className="mt-1 text-sm text-muted-foreground">Publish signed kind 36787 track events to your configured Nostr write relays.</p></div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full max-w-sm grid-cols-2"><TabsTrigger value="track">Track</TabsTrigger><TabsTrigger value="album">Album</TabsTrigger></TabsList>
        <TabsContent value="track" className="pt-4">
          <form onSubmit={event => void submitTrack(event)} className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm font-medium">Track title<Input required value={trackTitle} onChange={event => setTrackTitle(event.target.value)} maxLength={200} placeholder="Song title" /></label>
            <label className="space-y-2 text-sm font-medium">Genre (optional)<Input value={trackGenre} onChange={event => setTrackGenre(event.target.value)} maxLength={80} placeholder="Ambient, folk, rock…" /></label>
            <label className="space-y-2 text-sm font-medium sm:col-span-2">Audio file (Blossom upload)<Input type="file" accept="audio/*,.mp3,.m4a,.flac,.ogg,.opus,.wav" onChange={event => chooseTrack(event.target.files?.[0])} /></label>
            <label className="space-y-2 text-sm font-medium sm:col-span-2">Or existing HTTPS audio URL<Input type="url" value={trackUrl} onChange={event => { setTrackUrl(event.target.value); if (event.target.value) setTrackFile(undefined); }} placeholder="https://…/track.mp3" /></label>
            <label className="space-y-2 text-sm font-medium sm:col-span-2">Track image (optional)<Input type="file" accept="image/*" onChange={event => { const file = event.target.files?.[0]; if (file && !file.type.startsWith("image/")) { setMessage({ text: "Please choose an image file.", error: true }); return; } setMessage(undefined); setTrackImage(file); }} /></label>
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2"><Button type="submit" disabled={busy || !trackTitle.trim()}><Upload className="size-4" />{busy ? "Publishing…" : "Publish track"}</Button>{trackFile && <span className="text-sm text-muted-foreground">{trackFile.name}</span>}</div>
          </form>
        </TabsContent>
        <TabsContent value="album" className="space-y-4 pt-4">
          <form onSubmit={event => void submitAlbum(event)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm font-medium">Album title<Input required value={albumTitle} onChange={event => setAlbumTitle(event.target.value)} maxLength={200} placeholder="Album title" /></label>
              <label className="space-y-2 text-sm font-medium">Genre (optional)<Input value={albumGenre} onChange={event => setAlbumGenre(event.target.value)} maxLength={80} placeholder="Ambient, folk, rock…" /></label>
              <label className="space-y-2 text-sm font-medium">Cover image (optional)<Input type="file" accept="image/*" onChange={event => setAlbumCover(event.target.files?.[0])} /></label>
              <label className="space-y-2 text-sm font-medium">Add audio tracks<Input type="file" multiple accept="audio/*,.mp3,.m4a,.flac,.ogg,.opus,.wav" onChange={event => { onAlbumFiles(event.target.files); event.target.value = ""; }} /></label>
            </div>
            {albumTracks.length > 0 && <ol className="space-y-2" aria-label="Album track order">{albumTracks.map((track, index) => <li key={track.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/10 p-2"><span className="w-7 text-center text-sm tabular-nums text-muted-foreground">{index + 1}</span><Input aria-label={`Track ${index + 1} title`} value={track.title} onChange={event => setAlbumTracks(current => current.map(item => item.id === track.id ? { ...item, title: event.target.value } : item))} /><span className="hidden max-w-48 truncate text-xs text-muted-foreground sm:block">{track.file?.name}</span><Button type="button" variant="ghost" size="icon" aria-label={`Move ${track.title} up`} disabled={index === 0} onClick={() => moveTrack(index, -1)}><ArrowUp className="size-4" /></Button><Button type="button" variant="ghost" size="icon" aria-label={`Move ${track.title} down`} disabled={index === albumTracks.length - 1} onClick={() => moveTrack(index, 1)}><ArrowDown className="size-4" /></Button><Button type="button" variant="ghost" size="icon" aria-label={`Remove ${track.title}`} onClick={() => setAlbumTracks(current => current.filter(item => item.id !== track.id).map((item, position) => ({ ...item, trackNumber: position + 1 })))}><X className="size-4" /></Button></li>)}</ol>}
            {albumTracks.length === 0 && <div className="rounded-lg border border-dashed border-white/15 px-4 py-8 text-center text-sm text-muted-foreground"><Plus className="mx-auto mb-2 size-5" />Choose multiple audio files to start building the album. Reorder tracks before publishing.</div>}
            <Button type="submit" disabled={busy || !albumTitle.trim() || albumTracks.length === 0}><Upload className="size-4" />{busy ? <><LoaderCircle className="size-4 animate-spin" /> Publishing album…</> : "Publish album"}</Button>
          </form>
        </TabsContent>
      </Tabs>
      {message && <p role={message.error ? "alert" : "status"} className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${message.error ? "border-destructive/50 text-destructive" : "border-emerald-500/30 text-emerald-300"}`}>{message.error ? <AlertCircle className="mt-0.5 size-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0" />}{message.text}</p>}
      {upload.isError && <p role="alert" className="text-sm text-destructive">{upload.error.message}</p>}
    </div>
  </section>;
}
