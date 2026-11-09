import { ChevronDown, ChevronUp, Clock3, ListMusic, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDuration, type Track } from '@/lib/music';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePlayer } from '@/hooks/usePlayer';
import { TrackArtwork } from './TrackArtwork';
import { ArtistLink } from './ArtistLink';

export function QueuePanel() {
  const player = usePlayer();
  const current = player.current;
  const upcoming = player.index >= 0 ? player.queue.slice(player.index + 1) : player.queue;

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
              <section aria-labelledby="queue-now-playing" className="space-y-2">
                <h2 id="queue-now-playing" className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Now playing</h2>
                {current ? <QueueTrack track={current} active onRemove={() => player.removeQueueItem(player.index)} /> : <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nothing is playing.</p>}
              </section>
              <section aria-labelledby="queue-up-next" className="space-y-2">
                <h2 id="queue-up-next" className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Up next</h2>
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
              {player.history.length ? player.history.map((track, index) => <QueueTrack key={`${track.id}-${index}`} track={track} active={current?.id === track.id} />) : <div className="rounded-lg border border-dashed p-8 text-center"><Clock3 className="mx-auto mb-3 size-8 text-muted-foreground" /><p className="text-sm text-muted-foreground">Tracks you start playing will appear here.</p></div>}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </SheetContent>
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

function QueueTrack({ track, active = false, onRemove, onMoveUp, onMoveDown }: {
  track: Track;
  active?: boolean;
  onRemove?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  return <div className={`grid w-full min-w-0 grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-2 overflow-hidden rounded-lg p-2 ${active ? 'bg-primary/10' : 'hover:bg-accent/40'}`}>
    <TrackArtwork track={track} className="size-11" />
    <div className="min-w-0 overflow-hidden">
      <p className={`truncate text-sm font-medium ${active ? 'text-primary' : ''}`} title={track.title}>{track.title}</p>
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
