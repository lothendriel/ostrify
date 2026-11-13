import { useState } from 'react';
import { ChevronDown, ChevronUp, Clock3, ListMusic, ListPlus, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatDuration, type Track } from '@/lib/music';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePlayer } from '@/hooks/usePlayer';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { isSupportedPlaylistTrackId, usePlaylists, usePlaylistActions } from '@/hooks/usePlaylists';
import { useToast } from '@/hooks/useToast';
import { CreatePlaylistDialog } from './CreatePlaylistDialog';
import { TrackArtwork } from './TrackArtwork';
import { ArtistLink } from './ArtistLink';

export function QueuePanel() {
  const player = usePlayer();
  const { user } = useCurrentUser();
  const { data: playlists } = usePlaylists();
  const { addTracksToPlaylist } = usePlaylistActions();
  const { toast } = useToast();
  const current = player.current;
  const upcoming = player.index >= 0 ? player.queue.slice(player.index + 1) : player.queue;
  const [chooserOpen, setChooserOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const regularPlaylists = (playlists ?? []).filter(playlist => !playlist.isLiked);
  const queueTrackIds = player.queue.map(track => track.id);
  const uniqueQueueTrackIds = [...new Set(queueTrackIds)];
  const supportedTrackIds = uniqueQueueTrackIds.filter(isSupportedPlaylistTrackId);
  const unsupportedCount = uniqueQueueTrackIds.length - supportedTrackIds.length;
  const supportedCount = supportedTrackIds.length;

  const addQueueToPlaylist = (playlistId: string) => {
    addTracksToPlaylist.mutate({ playlistId, trackIds: queueTrackIds }, {
      onSuccess: result => {
        const details = [
          result.alreadyPresentCount ? `${result.alreadyPresentCount} already in playlist.` : '',
          result.unsupportedCount ? `${result.unsupportedCount} unsupported item(s) skipped.` : '',
        ].filter(Boolean).join(' ');
        toast({
          title: result.addedCount ? `Added ${result.addedCount} ${result.addedCount === 1 ? 'track' : 'tracks'} to playlist` : 'No new tracks added',
          description: details || (result.addedCount ? undefined : 'All supported queue tracks are already in this playlist.'),
        });
        setChooserOpen(false);
      },
      onError: () => toast({ title: 'Could not add queue to playlist', description: 'Check your relay connection and try again.', variant: 'destructive' }),
    });
  };

  return <Sheet>
    <SheetTriggerButton queueLength={upcoming.length} />
    <SheetContent side="right" className="w-[min(420px,90vw)] gap-0 p-0 sm:max-w-[420px]">
      <Tabs defaultValue="queue" className="flex min-h-0 flex-1 flex-col gap-0">
        <SheetHeader className="border-b px-5 py-5 pr-14">
          <SheetTitle className="flex items-center gap-2 text-lg"><ListMusic className="size-5" /> Player</SheetTitle>
          <TabsList className="mt-3 grid w-full grid-cols-2">
            <TabsTrigger value="queue">Queue ({upcoming.length})</TabsTrigger>
            <TabsTrigger value="history">Recently played</TabsTrigger>
          </TabsList>
          <SheetDescription className="sr-only">Manage upcoming tracks or browse recently played audio.</SheetDescription>
        </SheetHeader>
        <TabsContent value="queue" className="min-h-0 flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="space-y-5 p-4">
              {user && player.queue.length > 0 && <section className="space-y-2 border-b pb-4">
                <Button type="button" variant="outline" className="w-full justify-start" onClick={() => setChooserOpen(true)} disabled={supportedCount === 0 || addTracksToPlaylist.isPending}>
                  <ListPlus className="size-4" /> Add queue to playlist
                </Button>
                {unsupportedCount > 0 && <p className="px-1 text-xs text-muted-foreground">{unsupportedCount} unsupported queue item(s) will be skipped.</p>}
              </section>}
              <section aria-labelledby="queue-now-playing" className="space-y-2">
                <h2 id="queue-now-playing" className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Now playing</h2>
                {current ? <QueueTrack track={current} active onRemove={() => player.removeQueueItem(player.index)} /> : <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nothing is playing.</p>}
              </section>
              <section aria-labelledby="queue-up-next" className="space-y-2">
                <div className="flex items-center justify-between gap-3 px-1">
                  <h2 id="queue-up-next" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Up next</h2>
                  <Button type="button" variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground hover:text-destructive" onClick={() => { player.clearUpcomingQueue(); toast({ title: 'Queue cleared', description: current ? 'Now playing was kept.' : undefined }); }} disabled={upcoming.length === 0} aria-label="Clear upcoming queue">
                    <Trash2 className="size-3.5" /> Clear queue
                  </Button>
                </div>
                {upcoming.length ? upcoming.map((track, offset) => {
                  const queueIndex = player.index + 1 + offset;
                  return <QueueTrack
                    key={`${track.id}-${queueIndex}`}
                    track={track}
                    onRemove={() => player.removeQueueItem(queueIndex)}
                    onMoveUp={queueIndex > player.index + 1 ? () => player.moveQueueItem(queueIndex, queueIndex - 1) : undefined}
                    onMoveDown={queueIndex < player.queue.length - 1 ? () => player.moveQueueItem(queueIndex, queueIndex + 1) : undefined}
                  />;
                }) : <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Add a song, podcast episode, or audiobook chapter to build your queue.</p>}
              </section>
            </div>
          </ScrollArea>
        </TabsContent>
        <TabsContent value="history" className="min-h-0 flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="space-y-2 p-4">
              {player.history.length ? player.history.map((track, index) => <QueueTrack key={`${track.id}-${index}`} track={track} active={current?.id === track.id} onPlay={() => player.playQueue([track])} />) : <div className="rounded-lg border border-dashed p-8 text-center"><Clock3 className="mx-auto mb-3 size-8 text-muted-foreground" /><p className="text-sm text-muted-foreground">Tracks you start playing will appear here.</p></div>}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </SheetContent>
    <Dialog open={chooserOpen} onOpenChange={setChooserOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add queue to playlist</DialogTitle>
          <DialogDescription>Choose a playlist for {player.queue.length} queued {player.queue.length === 1 ? 'track' : 'tracks'}. Existing tracks won’t be added again.</DialogDescription>
        </DialogHeader>
        <div className="max-h-72 space-y-2 overflow-y-auto">
          {regularPlaylists.map(playlist => <Button
            key={playlist.id}
            type="button"
            variant="outline"
            className="w-full justify-start"
            disabled={addTracksToPlaylist.isPending || supportedCount === 0}
            onClick={() => addQueueToPlaylist(playlist.id)}
          >
            <ListMusic className="size-4 shrink-0" />
            <span className="truncate">{playlist.title}</span>
          </Button>)}
          {regularPlaylists.length === 0 && <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">You don’t have any playlists yet. Create one to save this queue.</p>}
          <Button type="button" variant="secondary" className="w-full justify-start" onClick={() => { setChooserOpen(false); setCreateOpen(true); }}>
            <Plus className="size-4" /> New playlist
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    <CreatePlaylistDialog
      open={createOpen}
      onOpenChange={setCreateOpen}
      initialTrackIds={queueTrackIds}
      onCreated={() => {
        const addedCount = supportedTrackIds.length;
        toast({ title: `Playlist created with ${addedCount} ${addedCount === 1 ? 'track' : 'tracks'}`, description: unsupportedCount ? `${unsupportedCount} unsupported queue item(s) skipped.` : undefined });
      }}
    />
  </Sheet>;
}

function SheetTriggerButton({ queueLength }: { queueLength: number }) {
  return <SheetTrigger asChild>
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={`Open queue${queueLength ? `, ${queueLength} upcoming` : ''}`}
      title="Open queue"
      className="relative size-8 rounded-full text-muted-foreground hover:text-foreground"
    >
      <ListMusic className="size-4" />
      {queueLength > 0 && <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">{queueLength > 9 ? '9+' : queueLength}</span>}
    </Button>
  </SheetTrigger>;
}

function QueueTrack({ track, active = false, onPlay, onRemove, onMoveUp, onMoveDown }: {
  track: Track;
  active?: boolean;
  onPlay?: () => void;
  onRemove?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  return <div className={`grid w-full min-w-0 grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-2 overflow-hidden rounded-lg p-2 ${active ? 'bg-primary/10' : 'hover:bg-accent/40'}`}>
    <TrackArtwork track={track} className="size-11" />
    <div className="min-w-0 overflow-hidden">
      {onPlay ? <button type="button" className={`block w-full truncate text-left text-sm font-medium hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${active ? 'text-primary' : ''}`} title={`Play ${track.title}`} onClick={onPlay}>{track.title}</button> : <p className={`truncate text-sm font-medium ${active ? 'text-primary' : ''}`} title={track.title}>{track.title}</p>}
      <p className="truncate text-xs text-muted-foreground"><ArtistLink pubkey={track.pubkey} artistId={track.artistId} artistPubkey={track.artistPubkey} fallbackName={track.artist ?? track.album ?? (track.kind === 'audiobook' ? 'Audiobook' : track.kind === 'podcast' ? 'Podcast episode' : 'Unknown artist')} />{track.duration ? ` · ${formatDuration(track.duration)}` : ''}</p>
    </div>
    <div className="flex w-max shrink-0 items-center justify-self-end">
      {active && <span className="mr-1 text-xs font-medium text-primary">Playing</span>}
      {onMoveUp && <Button type="button" variant="ghost" size="icon" aria-label={`Move ${track.title} earlier`} onClick={onMoveUp} className="size-8 shrink-0"><ChevronUp className="size-4" /></Button>}
      {onMoveDown && <Button type="button" variant="ghost" size="icon" aria-label={`Move ${track.title} later`} onClick={onMoveDown} className="size-8 shrink-0"><ChevronDown className="size-4" /></Button>}
      {onRemove && <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${track.title} from queue`} onClick={onRemove} className="size-8 shrink-0 text-muted-foreground hover:text-destructive"><X className="size-4" /></Button>}
    </div>
  </div>;
}
