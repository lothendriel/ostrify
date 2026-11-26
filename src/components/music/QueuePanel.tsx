import { useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Clock3, GripVertical, ListMusic, ListPlus, Play, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatDuration, type Track } from '@/lib/music';
import { Link } from 'react-router-dom';
import { audioDetailPath } from '@/lib/audioDetail';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SheetHeader } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePlayer } from '@/hooks/usePlayer';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { isSupportedPlaylistTrackId, usePlaylists, usePlaylistActions } from '@/hooks/usePlaylists';
import { useToast } from '@/hooks/useToast';
import { CreatePlaylistDialog } from './CreatePlaylistDialog';
import { TrackArtwork } from './TrackArtwork';
import { ArtistLink } from './ArtistLink';

export function QueuePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const player = usePlayer();
  const { user } = useCurrentUser();
  const { data: playlists } = usePlaylists();
  const { addTracksToPlaylist } = usePlaylistActions();
  const { toast } = useToast();
  const current = player.current;
  const upcoming = player.index >= 0 ? player.queue.slice(player.index + 1) : player.queue;
  const [chooserOpen, setChooserOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const draggingIndexRef = useRef<number | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [queueFilter, setQueueFilter] = useState<'all' | 'music' | 'spoken'>('all');
  const regularPlaylists = (playlists ?? []).filter(playlist => !playlist.isLiked && !playlist.isTunestrFavorites);
  const queueTrackIds = player.queue.map(track => track.id);
  const uniqueQueueTrackIds = [...new Set(queueTrackIds)];
  const supportedTrackIds = uniqueQueueTrackIds.filter(isSupportedPlaylistTrackId);
  const unsupportedCount = uniqueQueueTrackIds.length - supportedTrackIds.length;
  const supportedCount = supportedTrackIds.length;
  const filteredUpcoming = upcoming
    .map((track, offset) => ({ track, queueIndex: player.index + 1 + offset }))
    .filter(({ track }) => queueFilter === 'all' || (queueFilter === 'music' ? track.kind === 'music' : track.kind !== 'music'));

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
      onError: error => toast({ title: 'Could not add queue to playlist', description: error.message, variant: 'destructive' }),
    });
  };

  const queuePanelContent = <section className="flex h-full min-w-0 flex-col overflow-hidden bg-card md:rounded-lg md:border md:border-border/70" aria-label="Player queue">
      <Tabs defaultValue="queue" className="flex min-h-0 flex-1 flex-col gap-0">
        <SheetHeader className="shrink-0 border-b px-4 py-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-lg font-semibold"><ListMusic className="size-5" /> Player</h2>
              <p className="sr-only">Manage upcoming tracks or browse recently played audio.</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="Close queue" onClick={onClose}><X className="size-4" /></Button>
            </div>
          </div>
          <TabsList className="mt-3 grid w-full grid-cols-2">
            <TabsTrigger value="queue">Queue ({upcoming.length})</TabsTrigger>
            <TabsTrigger value="history">Recently played</TabsTrigger>
          </TabsList>
        </SheetHeader>
        <TabsContent value="queue" className="min-h-0 flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="space-y-5 p-4">
              {user && player.queue.length > 0 && <section className="space-y-2 border-b pb-4">
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant="outline" className="justify-start" onClick={() => setChooserOpen(true)} disabled={supportedCount === 0 || addTracksToPlaylist.isPending}>
                    <ListPlus className="size-4" /> Add to playlist
                  </Button>
                  <Button type="button" variant="outline" className="justify-start" onClick={() => setCreateOpen(true)} disabled={supportedCount === 0}>
                    <Plus className="size-4" /> Save as playlist
                  </Button>
                </div>
                {unsupportedCount > 0 && <p className="px-1 text-xs text-muted-foreground">{unsupportedCount} unsupported queue item(s) will be skipped.</p>}
              </section>}
              <section aria-labelledby="queue-now-playing" className="space-y-2">
                <h2 id="queue-now-playing" className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Now playing</h2>
                {current ? <QueueTrack track={current} active onRemove={() => player.removeQueueItem(player.index)} /> : <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nothing is playing.</p>}
              </section>
              <section aria-labelledby="queue-up-next" className="space-y-2">
                <div className="flex items-center justify-between gap-3 px-1">
                  <h2 id="queue-up-next" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Up next</h2>
                  <div className="flex items-center gap-1">
                    {player.current?.kind === 'music' && player.current.source !== 'radio-browser' && <Button type="button" variant="ghost" size="icon" onClick={() => player.setAutoplay(!player.autoplay)} aria-label="Autoplay similar music" aria-pressed={player.autoplay} title="Autoplay similar music when the queue ends" className={player.autoplay ? 'size-8 text-primary' : 'size-8 text-muted-foreground'}><Sparkles className="size-4" /></Button>}
                    <Button type="button" variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground hover:text-destructive" onClick={() => { player.clearUpcomingQueue(); toast({ title: 'Queue cleared', description: current ? 'Now playing was kept.' : undefined }); }} disabled={upcoming.length === 0} aria-label="Clear upcoming queue">
                      <Trash2 className="size-3.5" /> Clear queue
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 px-1" role="group" aria-label="Filter upcoming queue">
                  {([
                    ['all', 'All'],
                    ['music', 'Music'],
                    ['spoken', 'Spoken'],
                  ] as const).map(([filter, label]) => <Button
                    key={filter}
                    type="button"
                    size="sm"
                    variant={queueFilter === filter ? 'secondary' : 'ghost'}
                    aria-pressed={queueFilter === filter}
                    onClick={() => setQueueFilter(filter)}
                    className="h-7 rounded-full px-3 text-xs"
                  >{label}{filter !== 'all' ? ` · ${upcoming.filter(track => filter === 'music' ? track.kind === 'music' : track.kind !== 'music').length}` : ''}</Button>)}
                </div>
                {upcoming.length ? filteredUpcoming.length ? filteredUpcoming.map(({ track, queueIndex }) => {
                  return <QueueTrack
                    key={`${track.id}-${queueIndex}`}
                    track={track}
                    onRemove={() => player.removeQueueItem(queueIndex)}
                    onMoveUp={queueIndex > player.index + 1 ? () => player.moveQueueItem(queueIndex, queueIndex - 1) : undefined}
                    onMoveDown={queueIndex < player.queue.length - 1 ? () => player.moveQueueItem(queueIndex, queueIndex + 1) : undefined}
                    draggable
                    onDragStart={event => {
                      event.dataTransfer.effectAllowed = 'move';
                      event.dataTransfer.setData('text/plain', String(queueIndex));
                      draggingIndexRef.current = queueIndex;
                      setDraggingIndex(queueIndex);
                    }}
                    onDragEnd={() => {
                      draggingIndexRef.current = null;
                      setDraggingIndex(null);
                    }}
                    onDragOver={event => event.preventDefault()}
                    onDrop={event => {
                      event.preventDefault();
                      const fromIndex = draggingIndexRef.current;
                      if (fromIndex !== null) player.moveQueueItem(fromIndex, queueIndex);
                      draggingIndexRef.current = null;
                      setDraggingIndex(null);
                    }}
                    isDragging={draggingIndex === queueIndex}
                  />;
                }) : <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No {queueFilter === 'music' ? 'music' : 'spoken audio'} is up next. Choose another queue view or add something to play.</p> : <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Add a song, podcast episode, or audiobook chapter to build your queue.</p>}
              </section>
            </div>
          </ScrollArea>
        </TabsContent>
        <TabsContent value="history" className="min-h-0 flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="space-y-2 p-4">
              {player.history.length ? player.history.map((track, index) => <QueueTrack key={`${track.id}-${index}`} track={track} active={current?.id === track.id} onPlay={() => track.source === 'radio-browser' ? player.playStation(track) : player.playQueue([track])} />) : <div className="rounded-lg border border-dashed p-8 text-center"><Clock3 className="mx-auto mb-3 size-8 text-muted-foreground" /><p className="text-sm text-muted-foreground">Tracks you start playing will appear here.</p></div>}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </section>;

  return <>
    {open && <div className="flex h-full min-w-0 flex-col">{queuePanelContent}</div>}
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
  </>;
}

export function QueuePanelButton({ queueLength, open, onClick }: { queueLength: number; open: boolean; onClick: () => void }) {
  return <Button
    type="button"
    variant="ghost"
    size="icon"
    aria-label={`${open ? 'Close' : 'Open'} queue${queueLength ? `, ${queueLength} upcoming` : ''}`}
    aria-pressed={open}
    title={open ? 'Close queue' : 'Open queue'}
    className={`relative size-8 rounded-full text-muted-foreground hover:text-foreground ${open ? 'bg-accent text-foreground' : ''}`}
    onClick={onClick}
  >
    <ListMusic className="size-4" />
    {queueLength > 0 && <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">{queueLength > 9 ? '9+' : queueLength}</span>}
  </Button>;
}

function QueueTrack({ track, active = false, onPlay, onRemove, onMoveUp, onMoveDown, draggable = false, onDragStart, onDragEnd, onDragOver, onDrop, isDragging = false }: {
  track: Track;
  active?: boolean;
  onPlay?: () => void;
  onRemove?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  draggable?: boolean;
  onDragStart?: React.DragEventHandler<HTMLDivElement>;
  onDragEnd?: React.DragEventHandler<HTMLDivElement>;
  onDragOver?: React.DragEventHandler<HTMLDivElement>;
  onDrop?: React.DragEventHandler<HTMLDivElement>;
  isDragging?: boolean;
}) {
  return <div
    draggable={draggable}
    onDragStart={onDragStart}
    onDragEnd={onDragEnd}
    onDragOver={onDragOver}
    onDrop={onDrop}
    onClick={event => {
      if (event.target instanceof Element && event.target.closest("button, a")) return;
      onPlay?.();
    }}
    onKeyDown={event => {
      if (event.target === event.currentTarget && onPlay && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        onPlay();
      }
    }}
    role={onPlay ? "button" : undefined}
    tabIndex={onPlay ? 0 : undefined}
    className={`group grid w-full min-w-0 ${onPlay ? 'cursor-pointer' : ''} ${draggable ? 'grid-cols-[1.5rem_2.75rem_minmax(0,1fr)_auto] gap-1' : 'grid-cols-[2.75rem_minmax(0,1fr)_auto] gap-2'} items-center overflow-hidden rounded-lg p-2 transition-opacity ${active ? 'bg-primary/10' : 'hover:bg-accent/40'} ${isDragging ? 'opacity-40' : ''}`}
  >
    {draggable && <span className="grid size-6 cursor-grab touch-none place-items-center text-muted-foreground active:cursor-grabbing" aria-label={`Drag ${track.title} to reorder`} title="Drag to reorder"><GripVertical className="size-4" /></span>}
      {onPlay ? <button type="button" onClick={event => { event.stopPropagation(); onPlay(); }} aria-label={`Play ${track.title}`} className="relative size-11 rounded focus-visible:outline-2 focus-visible:outline-primary"><TrackArtwork track={track} className="size-11" /><span className="absolute inset-0 hidden items-center justify-center rounded bg-black/55 text-white group-hover:flex group-focus-within:flex"><Play className="size-4 fill-current" /></span></button> : <TrackArtwork track={track} className="size-11" />}
    <div className="min-w-0 overflow-hidden">
      {onPlay ? <Link to={track.source === 'radio-browser' ? '/radio' : audioDetailPath(track)} onClick={event => event.stopPropagation()} className={`block truncate text-sm font-medium hover:underline ${active ? 'text-primary' : ''}`} title={`View details for ${track.title}`}>{track.title}</Link> : <p className={`truncate text-sm font-medium ${active ? 'text-primary' : ''}`} title={track.title}>{track.title}</p>}
      <p className="truncate text-xs text-muted-foreground">{track.source === 'radio-browser' ? (track.artist || 'Live radio') : <ArtistLink pubkey={track.pubkey} artistId={track.artistId} artistPubkey={track.artistPubkey} fallbackName={track.artist ?? track.album ?? (track.kind === 'audiobook' ? 'Audiobook' : track.kind === 'podcast' ? 'Podcast episode' : 'Unknown artist')} />}{track.duration ? ` · ${formatDuration(track.duration)}` : ''}</p>
    </div>
    <div className="flex w-max shrink-0 items-center justify-self-end">
      {active && <span className="mr-1 text-xs font-medium text-primary">Playing</span>}
      {onMoveUp && <Button type="button" variant="ghost" size="icon" aria-label={`Move ${track.title} earlier`} onClick={onMoveUp} className="size-8 shrink-0"><ChevronUp className="size-4" /></Button>}
      {onMoveDown && <Button type="button" variant="ghost" size="icon" aria-label={`Move ${track.title} later`} onClick={onMoveDown} className="size-8 shrink-0"><ChevronDown className="size-4" /></Button>}
      {onRemove && <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${track.title} from queue`} onClick={onRemove} className="size-8 shrink-0 text-muted-foreground hover:text-destructive"><X className="size-4" /></Button>}
    </div>
  </div>;
}
