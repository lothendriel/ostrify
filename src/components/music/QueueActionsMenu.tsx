import { ListEnd, ListMusic, ListPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { usePlayer } from '@/hooks/usePlayer';
import type { Track } from '@/lib/music';

export function QueueActionsMenu({ track }: { track: Track }) {
  const player = usePlayer();
  const alreadyQueued = player.queue.slice(player.index + 1).some(item => item.id === track.id);

  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Queue actions for ${track.title}`}
        title="Queue actions"
        className="rounded-full text-muted-foreground hover:text-foreground"
        onClick={event => event.stopPropagation()}
      >
        <ListMusic className="size-4" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" data-queue-action="true" onClick={event => event.stopPropagation()}>
      <DropdownMenuItem
        data-queue-action="true"
        onClick={event => event.stopPropagation()}
        onSelect={() => player.playNext([track])}
      >
        <ListEnd className="size-4" /> Play next
      </DropdownMenuItem>
      <DropdownMenuItem
        data-queue-action="true"
        onClick={event => event.stopPropagation()}
        onSelect={() => player.addToQueue([track])}
      >
        <ListPlus className="size-4" /> {alreadyQueued ? 'Add again to queue' : 'Add to queue'}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}
