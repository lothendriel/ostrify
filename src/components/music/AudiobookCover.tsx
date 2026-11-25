import { BookOpen } from "lucide-react";
import { useMemo, useState } from "react";
import type { SavedAudiobook } from "@/hooks/useAudiobookLibrary";
import { cn } from "@/lib/utils";
import { sanitizeUrl } from "@/lib/sanitize";

const COVER_PALETTES = [
  "from-emerald-950 via-teal-900 to-amber-950",
  "from-indigo-950 via-violet-900 to-rose-950",
  "from-amber-950 via-orange-900 to-stone-950",
  "from-slate-950 via-blue-900 to-cyan-950",
  "from-rose-950 via-red-900 to-orange-950",
  "from-green-950 via-lime-900 to-stone-950",
] as const;

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function isGenericArchiveThumbnail(image: HTMLImageElement): boolean {
  try {
    const source = new URL(image.currentSrc || image.src);
    if (source.origin !== "https://archive.org" || !source.pathname.startsWith("/services/img/")) return false;
    const { naturalWidth: width, naturalHeight: height } = image;
    if (!width || !height) return false;
    const aspectRatio = width / height;
    return (width === 160 && height === 110)
      || (width === 180 && height === 45)
      || aspectRatio > 2.5
      || aspectRatio < 0.4;
  } catch {
    return false;
  }
}

interface AudiobookCoverProps {
  book: Pick<SavedAudiobook, "id" | "title" | "author" | "covers">;
  className: string;
}

export function AudiobookCover({ book, className }: AudiobookCoverProps) {
  const [failedIndex, setFailedIndex] = useState(0);
  const covers = useMemo(() => book.covers.map(sanitizeUrl).filter((cover): cover is string => !!cover), [book.covers]);
  const cover = covers[failedIndex];
  const palette = COVER_PALETTES[hashString(book.id) % COVER_PALETTES.length];
  const source = "OSTRIFY COVER";

  const advanceCover = () => setFailedIndex(index => index + 1);

  return (
    <div className={cn("relative isolate flex items-center justify-center overflow-hidden", className)}>
      {cover && (
        <img
          src={cover}
          alt={`${book.title} cover`}
          loading="lazy"
          onError={advanceCover}
          onLoad={event => {
            if (isGenericArchiveThumbnail(event.currentTarget)) advanceCover();
          }}
          className="absolute inset-0 size-full object-cover"
        />
      )}
      {!cover && (
        <div aria-hidden="true" className={cn("absolute inset-0 flex flex-col items-center justify-center gap-1 overflow-hidden bg-gradient-to-br px-2 py-2 text-center text-white", palette)}>
          <span className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-35" style={{ backgroundImage: "url('/browse-texture.webp')" }} />
          <span className="pointer-events-none absolute -right-1/4 -top-1/4 size-3/4 rounded-full border border-white/15" />
          <span className="pointer-events-none absolute -bottom-1/3 -left-1/4 size-3/4 rounded-full border border-white/10" />
          <BookOpen className="relative size-4 shrink-0 text-amber-100/90 sm:size-5" />
          <span className="relative line-clamp-3 max-w-full font-serif text-[0.65rem] font-bold leading-tight sm:text-xs">{book.title}</span>
          <span className="relative line-clamp-1 max-w-full text-[0.55rem] leading-tight text-white/80 sm:text-[0.65rem]">{book.author}</span>
          <span className="relative whitespace-nowrap text-[0.35rem] font-semibold tracking-[0.12em] text-amber-100/80">{source}</span>
        </div>
      )}
    </div>
  );
}
