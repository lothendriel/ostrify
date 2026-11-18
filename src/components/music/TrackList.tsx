import { useState } from "react";
import type { Track } from "@/lib/music";
import { TrackRow } from "./TrackRow";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Clock, ListPlus } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { usePlayer } from "@/hooks/usePlayer";
import type { ReactNode } from "react";

export const TRACKS_PER_PAGE = 20;

interface TrackListProps {
  tracks: Track[];
  isLoading?: boolean;
  onCreatePlaylist?: () => void;
  onRemove?: (track: Track) => void;
  emptyMessage?: string;
  onReorder?: (tracks: Track[]) => void;
  bulkSelect?: boolean;
  selectionLabel?: string;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: (requiredTrackCount: number) => Promise<boolean>;
  page?: number;
  onPageChange?: (page: number) => void;
  pageSize?: number;
  renderTrailingAction?: (track: Track) => ReactNode;
}

export function TrackList({ tracks, isLoading, onCreatePlaylist, onRemove, emptyMessage, onReorder, bulkSelect = true, selectionLabel = 'tracks', hasMore = false, isLoadingMore = false, onLoadMore, page: controlledPage, onPageChange, pageSize = TRACKS_PER_PAGE, renderTrailingAction }: TrackListProps) {
  const player = usePlayer();
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const tracksKey = tracks.map(track => track.id).join('|');
  const [paginationState, setPaginationState] = useState({ tracksKey, page: 1 });
  const localPage = paginationState.tracksKey === tracksKey ? paginationState.page : 1;
  const page = controlledPage ?? localPage;
  const pageCount = Math.max(1, Math.ceil(tracks.length / pageSize));
  const pageLimit = pageCount + (hasMore && onLoadMore ? 1 : 0);
  const displayedPage = Math.min(page, pageLimit);
  const setPage = (update: (current: number) => number) => {
    const nextPage = Math.max(1, Math.min(pageLimit, update(page)));
    if (onPageChange) onPageChange(nextPage);
    else setPaginationState({ tracksKey, page: nextPage });
  };
  const pageStart = (displayedPage - 1) * pageSize;
  const visibleTracks = tracks.slice(pageStart, pageStart + pageSize);
  const selectedTracks = tracks.filter(track => selectedIds.includes(track.id));
  const allSelected = tracks.length > 0 && selectedTracks.length === tracks.length;
  const setTrackSelected = (trackId: string, selected: boolean) => setSelectedIds(ids => selected ? [...new Set([...ids, trackId])] : ids.filter(id => id !== trackId));
  const canLoadMore = hasMore && !!onLoadMore;
  const nextPageAvailable = displayedPage < pageCount || displayedPage === pageCount && canLoadMore;
  const next = async () => {
    if (isLoadingMore || !nextPageAvailable) return;
    if (displayedPage < pageCount) {
      setPage(current => current + 1);
      return;
    }
    if (onLoadMore) {
      const loaded = await onLoadMore((displayedPage + 1) * pageSize);
      if (loaded) setPage(current => current + 1);
    }
  };
  const reorder = (from: number, to: number) => {
    if (!onReorder || from === to || from < 0 || to < 0 || from >= tracks.length || to >= tracks.length) return;
    const next = [...tracks];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onReorder(next);
    setDraggedIndex(null);
  };
  if (isLoading && tracks.length === 0) {
    return (
      <div className="space-y-1">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-2">
            <Skeleton className="size-4" />
            <Skeleton className="size-10 rounded-md" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/4" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const pagination = (position: 'top' | 'bottom') => tracks.length > pageSize || page < pageCount || hasMore && !!onLoadMore ? <nav aria-label={`Track pagination (${position})`} className={`${position === 'top' ? 'mb-4' : 'mt-4'} flex flex-wrap items-center justify-between gap-3 border-y py-3`}>
    <Button type="button" variant="outline" onClick={() => setPage(current => Math.max(1, current - 1))} disabled={displayedPage <= 1 || isLoadingMore}><ChevronLeft className="size-4" /> Previous</Button>
    <p aria-live="polite" className="text-sm text-muted-foreground">Page {displayedPage}{!hasMore && <span> of {pageCount}</span>} <span className="hidden sm:inline">· {tracks.length} tracks {canLoadMore ? 'loaded' : 'total'}</span></p>
    <Button type="button" variant="outline" onClick={() => void next()} disabled={isLoadingMore || !nextPageAvailable}>{isLoadingMore ? 'Loading…' : 'Next'} <ChevronRight className="size-4" /></Button>
  </nav> : null;

  if (tracks.length === 0) {
    return (
      <div className="space-y-4">
        {canLoadMore && pagination('top')}
        <div className="border border-dashed border-border rounded-lg py-12 px-8 text-center">
          <p className="text-muted-foreground max-w-sm mx-auto">
            {emptyMessage ?? "No tracks here yet."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {pagination('top')}
      {bulkSelect && <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-border/60 bg-card/50 px-3 py-2">
        <Checkbox checked={allSelected ? true : selectedTracks.length > 0 ? "indeterminate" : false} aria-label={`Select all ${selectionLabel}`} onCheckedChange={checked => setSelectedIds(checked === true ? tracks.map(track => track.id) : [])} />
        <span className="min-w-0 flex-1 text-sm">{selectedTracks.length ? `${selectedTracks.length} of ${tracks.length} ${selectionLabel} selected` : `Select all ${tracks.length} ${selectionLabel}`}</span>
        {selectedTracks.length > 0 && <Button type="button" size="sm" variant="outline" onClick={() => { player.addToQueue(selectedTracks); setSelectedIds([]); }}><ListPlus className="size-4" /> Add selected to queue</Button>}
      </div>}
      {/* Header row */}
      <div className={`grid ${bulkSelect ? 'grid-cols-[1.25rem_2rem_minmax(0,1fr)_auto] md:grid-cols-[1.25rem_2rem_minmax(0,1fr)_minmax(0,14rem)_auto]' : 'grid-cols-[2rem_1fr_auto] md:grid-cols-[2rem_1fr_minmax(0,14rem)_auto]'} items-center gap-3 px-3 py-2 border-b border-border/50 text-xs uppercase tracking-wider text-muted-foreground`}>
        {bulkSelect && <span aria-hidden="true" />}
        <span className="text-center">#</span>
        <span>Title</span>
        <span className="hidden md:block">Category</span>
        <span className="flex justify-end pr-14">
          <Clock className="size-4" />
        </span>
      </div>
      <div className="mt-1">
        {visibleTracks.map((track, i) => {
          const index = pageStart + i;
          return <TrackRow
            key={track.id}
            track={track}
            index={index}
            selectable={bulkSelect}
            selected={selectedIds.includes(track.id)}
            onSelectedChange={selected => setTrackSelected(track.id, selected)}
            onCreatePlaylist={onCreatePlaylist}
            onRemove={onRemove ? () => onRemove(track) : undefined}
             draggable={!!onReorder}
             trailingAction={renderTrailingAction?.(track)}
             onMoveUp={onReorder && index > 0 ? () => reorder(index, index - 1) : undefined}
            onMoveDown={onReorder && index < tracks.length - 1 ? () => reorder(index, index + 1) : undefined}
            onDragStart={onReorder ? event => { setDraggedIndex(index); event.dataTransfer.effectAllowed = "move"; } : undefined}
            onDragOver={onReorder ? event => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } : undefined}
            onDrop={onReorder ? event => { event.preventDefault(); if (draggedIndex !== null) reorder(draggedIndex, index); setDraggedIndex(null); } : undefined}
            onDragEnd={onReorder ? () => setDraggedIndex(null) : undefined}
          />;
        })}
      </div>
      {pagination('bottom')}
    </div>
  );
}
