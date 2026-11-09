import { Link, useParams } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { BookOpen, Heart, ListMusic, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { audiobookPath, useAudiobookLibrary, type SavedAudiobook } from '@/hooks/useAudiobookLibrary';

function AudiobookTile({ book, onRemove, removeLabel }: { book: SavedAudiobook; onRemove?: () => void; removeLabel?: string }) {
  return <article className="group flex min-w-0 items-center gap-3 rounded-xl border border-border/60 bg-secondary/30 p-3 hover:bg-secondary/60">
    <Link to={audiobookPath(book)} className="flex min-w-0 flex-1 items-center gap-3 focus-visible:outline-2 focus-visible:outline-primary">
      <div className="size-14 shrink-0 overflow-hidden rounded-md bg-secondary">
        {book.covers[0] ? <img src={book.covers[0]} alt="" className="size-full object-cover" /> : <div className="flex size-full items-center justify-center"><BookOpen className="size-6 text-muted-foreground" /></div>}
      </div>
      <div className="min-w-0"><h3 className="truncate font-semibold group-hover:underline">{book.title}</h3><p className="truncate text-sm text-muted-foreground">{book.author}</p><p className="text-xs text-muted-foreground">{book.sectionCount} chapters{book.language ? ` · ${book.language}` : ''}</p></div>
    </Link>
    {onRemove && <Button type="button" variant="ghost" size="icon" onClick={onRemove} aria-label={removeLabel ?? `Remove ${book.title}`}><Trash2 className="size-4" /></Button>}
  </article>;
}

export default function AudiobookLibraryPage() {
  const { id } = useParams<{ id: string }>();
  const library = useAudiobookLibrary();
  const collection = library.collections.find(item => item.id === id);
  const collectionBooks = id ? library.booksInCollection(id) : [];
  const favoriteIds = new Set(library.favoriteBooks.map(book => book.id));
  const favoriteSection = (id ? collectionBooks : library.favoriteBooks).filter(book => favoriteIds.has(book.id));
  const savedSection = (id ? collectionBooks : []).filter(book => !favoriteIds.has(book.id));

  useSeoMeta({ title: id ? `${collection?.title ?? 'Audiobook Collection'} — Ostrify` : 'Saved Audiobooks — Ostrify' });

  if (id && !collection) return <div className="p-6"><h1 className="text-2xl font-bold">Collection not found</h1><Link to="/audiobook-library" className="mt-3 inline-block text-primary underline">Back to saved audiobooks</Link></div>;

  return <div className="space-y-8 p-4 sm:p-6">
    <header className="rounded-xl bg-gradient-to-br from-rose-950 via-violet-950 to-card p-6 sm:p-8">
      <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-rose-200"><Heart className="size-4" /> Your audiobook library</p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{collection?.title ?? 'Saved Audiobooks'}</h1>
      <p className="mt-2 text-muted-foreground">{collection ? `${collectionBooks.length} books in this collection` : 'Favorites and collections saved in this browser.'}</p>
      {collection && <Link to="/audiobook-library" className="mt-4 inline-block text-sm text-primary underline">← All saved audiobooks</Link>}
    </header>

    {!id && <section className="space-y-3"><h2 className="flex items-center gap-2 text-2xl font-bold"><ListMusic className="size-5" /> Collections</h2>
      {library.collections.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{library.collections.map(item => <div key={item.id} className="flex items-center gap-3 rounded-xl border border-border/60 bg-secondary/30 p-4">
        <Link to={`/audiobook-library/${encodeURIComponent(item.id)}`} className="min-w-0 flex-1 focus-visible:outline-2 focus-visible:outline-primary"><h3 className="truncate font-semibold hover:underline">{item.title}</h3><p className="text-sm text-muted-foreground">{item.audiobookIds.length} books</p></Link>
        <Button type="button" variant="ghost" size="icon" aria-label={`Delete ${item.title}`} onClick={() => library.deleteCollection(item.id)}><Trash2 className="size-4" /></Button>
      </div>)}</div> : <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">Create a collection from an audiobook’s Save menu to organize books here.</p>}
    </section>}

    <section className="space-y-3"><h2 className="flex items-center gap-2 text-2xl font-bold"><Heart className="size-5" />{collection ? 'Favorites in this collection' : 'Favorite Audiobooks'}</h2>
      {favoriteSection.length ? <div className="grid gap-2 sm:grid-cols-2">{favoriteSection.map(book => <AudiobookTile key={book.id} book={book} onRemove={() => library.toggleFavorite(book)} removeLabel={`Remove ${book.title} from favorites`} />)}</div> : <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">{collection ? 'No favorites from this collection yet.' : 'Favorite an audiobook from its Save menu and it will appear here.'}</p>}
    </section>

    {collection && <section className="space-y-3"><h2 className="flex items-center gap-2 text-2xl font-bold"><BookOpen className="size-5" />Other books in this collection</h2>
      {savedSection.length ? <div className="grid gap-2 sm:grid-cols-2">{savedSection.map(book => <AudiobookTile key={book.id} book={book} onRemove={() => library.removeFromCollection(collection.id, book.id)} removeLabel={`Remove ${book.title} from collection`} />)}</div> : <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">No other books in this collection yet.</p>}
    </section>}

    {!id && <section className="space-y-3"><h2 className="flex items-center gap-2 text-2xl font-bold"><BookOpen className="size-5" />Recently saved audiobooks</h2>
      {library.savedBooks.length ? <div className="grid gap-2 sm:grid-cols-2">{library.savedBooks.map(book => <AudiobookTile key={book.id} book={book} />)}</div> : <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">Audiobooks you favorite or add to a collection will also be easy to reopen here.</p>}
    </section>}
  </div>;
}
