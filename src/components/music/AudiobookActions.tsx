import { useState } from 'react';
import { Check, Heart, ListPlus, Plus } from 'lucide-react';
import type { SavedAudiobook } from '@/hooks/useAudiobookLibrary';
import { useAudiobookLibrary } from '@/hooks/useAudiobookLibrary';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export function AudiobookActions({ book, compact = false }: { book: SavedAudiobook; compact?: boolean }) {
  const library = useAudiobookLibrary();
  const [createOpen, setCreateOpen] = useState(false);
  const [collectionTitle, setCollectionTitle] = useState('');
  const favorite = library.isFavorite(book.id);
  const savedBook: SavedAudiobook = {
    id: book.id,
    source: book.source ?? 'librivox',
    catalogId: book.catalogId ?? book.id,
    title: book.title,
    author: book.author,
    covers: book.covers,
    language: book.language,
    duration: book.duration,
    sectionCount: book.sectionCount,
  };

  const createCollection = () => {
    const title = collectionTitle.trim();
    if (!title) return;
    const id = library.createCollection(title);
    library.toggleInCollection(id, savedBook);
    setCollectionTitle('');
    setCreateOpen(false);
  };

  return <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant={compact ? 'secondary' : 'outline'} size={compact ? 'icon' : 'default'} aria-label={`Save ${book.title}`} title="Save audiobook">
          {compact ? <ListPlus className="size-4" /> : <><ListPlus className="size-4" /> Save audiobook</>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Save audiobook</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => library.toggleFavorite(savedBook)}>
          <Heart className={`size-4 ${favorite ? 'fill-current text-primary' : ''}`} />
          <span className="flex-1">{favorite ? 'Remove from favorites' : 'Favorite audiobook'}</span>
          {favorite && <Check className="size-4 text-primary" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Collections</DropdownMenuLabel>
        {library.collections.length ? library.collections.map(collection => {
          const isInCollection = library.isInCollection(collection.id, savedBook.id);
          return <DropdownMenuItem key={collection.id} onSelect={() => library.toggleInCollection(collection.id, savedBook)}>
            <span className="truncate flex-1">{collection.title}</span>
            {isInCollection && <Check className="size-4 text-primary" />}
          </DropdownMenuItem>;
        }) : <div className="px-2 py-2 text-sm text-muted-foreground">No collections yet</div>}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => setCreateOpen(true)}><Plus className="size-4" /> New collection</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <Dialog open={createOpen} onOpenChange={setCreateOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create audiobook collection</DialogTitle>
          <DialogDescription>Collections are saved in this browser and include this book.</DialogDescription>
        </DialogHeader>
        <form onSubmit={event => { event.preventDefault(); createCollection(); }} className="space-y-4">
          <Input autoFocus value={collectionTitle} onChange={event => setCollectionTitle(event.target.value)} placeholder="Collection name" aria-label="Collection name" maxLength={80} required />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={!collectionTitle.trim()}>Create and add book</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}
