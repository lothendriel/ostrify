import type { Track } from "./music";

/** A curated set of genre/mood categories to surface on Home & Search. */
export const CATEGORIES: { id: string; label: string; match: string[] }[] = [
  {
    id: "rock",
    label: "Rock",
    match: ["rock", "metal", "punk", "grunge", "guitar", "band", "alternative", "hardcore"],
  },
  {
    id: "electronic",
    label: "Electronic",
    match: ["electronic", "electro", "edm", "techno", "house", "synth", "dnb", "trance", "dubstep", "beat", "beats", "remix"],
  },
  {
    id: "hiphop",
    label: "Hip-Hop",
    match: ["hiphop", "hip-hop", "hip hop", "rap", "rapper", "trap", "freestyle", "bars"],
  },
  {
    id: "jazz",
    label: "Jazz & Blues",
    match: ["jazz", "blues", "soul", "funk", "saxophone", "swing"],
  },
  {
    id: "classical",
    label: "Classical",
    match: ["classical", "orchestra", "orchestral", "piano", "violin", "symphony", "cello", "instrumental"],
  },
  {
    id: "folk",
    label: "Folk & Acoustic",
    match: ["folk", "acoustic", "country", "bluegrass", "singer-songwriter", "unplugged"],
  },
  {
    id: "pop",
    label: "Pop",
    match: ["pop", "indie", "dance", "song", "single", "vocal", "cover"],
  },
  {
    id: "ambient",
    label: "Ambient & Chill",
    match: ["ambient", "chill", "chillout", "lofi", "lo-fi", "relax", "meditation", "sleep", "soundscape", "nature"],
  },
  {
    id: "bitcoin",
    label: "Bitcoin & Nostr",
    match: ["bitcoin", "btc", "nostr", "value4value", "v4v", "wavlake", "zap", "sats", "satoshi", "freedom"],
  },
];

/** Build searchable text for a track: title + artist + topics + note content. */
function trackText(track: Track): string {
  return [track.title, track.artist ?? "", track.topics.join(" "), track.event?.content ?? ""]
    .join(" ")
    .toLowerCase();
}

/** True if any keyword appears as a whole word (or hashtag) in the text. */
function matchesKeywords(text: string, keywords: string[]): boolean {
  return keywords.some((kw) => {
    // Escape regex special chars; allow an optional leading # and word boundaries.
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^|[^a-z0-9])#?${escaped}([^a-z0-9]|$)`, "i");
    return re.test(text);
  });
}

/**
 * Return the tracks that belong to a category. A track matches when any of the
 * category's keywords appear in its topic tags, title, artist, or note content.
 */
export function tracksInCategory(tracks: Track[], categoryId: string): Track[] {
  const category = CATEGORIES.find((c) => c.id === categoryId);
  if (!category) return [];
  return tracks.filter((t) => {
    // Fast path: exact topic-tag match.
    if (t.topics.some((topic) => category.match.includes(topic))) return true;
    // Fallback: keyword search across all of the track's text.
    return matchesKeywords(trackText(t), category.match);
  });
}

/** Infer the best-fitting category id for a track, or undefined. */
export function inferCategory(track: Track): string | undefined {
  const text = trackText(track);
  for (const category of CATEGORIES) {
    if (track.topics.some((topic) => category.match.includes(topic))) return category.id;
    if (matchesKeywords(text, category.match)) return category.id;
  }
  return undefined;
}

/** Gradient color for a category chip, derived from its id. */
export function categoryColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  const h = hash % 360;
  return `linear-gradient(135deg, hsl(${h} 65% 45%), hsl(${(h + 40) % 360} 70% 30%))`;
}
