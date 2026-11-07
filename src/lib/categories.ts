import type { Track } from "./music";

/** A curated set of genre/mood categories to surface on Home & Search. */
export const CATEGORIES: { id: string; label: string; match: string[] }[] = [
  { id: "rock", label: "Rock", match: ["rock", "metal", "punk", "grunge"] },
  { id: "electronic", label: "Electronic", match: ["electronic", "edm", "techno", "house", "synth", "dnb"] },
  { id: "hiphop", label: "Hip-Hop", match: ["hiphop", "hip-hop", "rap", "trap"] },
  { id: "jazz", label: "Jazz & Blues", match: ["jazz", "blues", "soul", "funk"] },
  { id: "classical", label: "Classical", match: ["classical", "orchestra", "piano", "instrumental"] },
  { id: "folk", label: "Folk & Acoustic", match: ["folk", "acoustic", "country", "bluegrass"] },
  { id: "pop", label: "Pop", match: ["pop", "indie", "dance"] },
  { id: "ambient", label: "Ambient & Chill", match: ["ambient", "chill", "lofi", "lo-fi", "relax"] },
  { id: "bitcoin", label: "Bitcoin & Nostr", match: ["bitcoin", "nostr", "value4value", "v4v"] },
];

/** Return the tracks that match any of the category's topic keywords. */
export function tracksInCategory(tracks: Track[], categoryId: string): Track[] {
  const category = CATEGORIES.find((c) => c.id === categoryId);
  if (!category) return [];
  return tracks.filter((t) => t.topics.some((topic) => category.match.includes(topic)));
}

/** Gradient color for a category chip, derived from its id. */
export function categoryColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  const h = hash % 360;
  return `linear-gradient(135deg, hsl(${h} 65% 45%), hsl(${(h + 40) % 360} 70% 30%))`;
}
