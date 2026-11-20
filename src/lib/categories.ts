import type { Track } from "./music";

/** Curated genre hashtag aliases used for strict, tag-driven shelf membership. */
export const CATEGORIES: { id: string; label: string; match: string[]; wavlakeGenres?: string[] }[] = [
  {
    id: "rock",
    label: "Rock",
    wavlakeGenres: ["Rock", "Alternative"],
    match: [
      "rock", "alternative", "altrock", "indierock", "classicrock", "hardrock", "softrock", "bluesrock", "southernrock", "countryrock", "folkrock", "psychedelicrock", "psychrock", "progressiverock", "progrock", "postrock", "mathrock", "stonerrock", "spacerock", "garagerock", "surfrock", "glamrock", "artrock", "noiserock", "postgrunge", "grunge", "punk", "punkrock", "poppunk", "hardcore", "hardcorepunk", "posthardcore", "emo", "screamo", "metal", "heavymetal", "metalcore", "deathcore", "deathmetal", "blackmetal", "thrashmetal", "doommetal", "stonermetal", "numetal", "industrialrock", "industrialmetal", "gothicrock", "gothicmetal", "shoegaze", "britpop", "indie", "rocknroll", "rockandroll", "acousticrock", "arenarock", "christianrock", "christianmetal", "grindcore", "power metal", "powermetal", "symphonicmetal", "folkmetal", "vikingmetal", "sludge metal", "sludgemetal", "postmetal", "metalpunk", "skatepunk", "ska punk", "skapunk", "noise rock", "indie rock", "hard rock", "classic rock", "industrial metal", "alternative rock", "progressive metal", "progressivemetal", "death metal", "deathmetal", "black metal", "blackmetal", "thrash metal", "thrashmetal", "doom metal", "doommetal", "post punk", "postpunk", "new wave", "newwave", "coldwave", "darkwave", "dream pop", "dreampop", "industrial", "industrial music", "industrialmusic",
    ],
  },
  {
    id: "electronic",
    label: "Electronic",
    wavlakeGenres: ["Electronic", "Dance/EDM"],
    match: [
      "electronic", "electronica", "electro", "edm", "dance", "dance music", "danceedm", "techno", "house", "deep house", "deephouse", "techhouse", "progressivehouse", "minimaltechno", "trance", "psytrance", "trance music", "dnb", "drumandbass", "jungle", "dubstep", "brostep", "garage", "ukgarage", "ukg", "breakbeat", "bigbeat", "hardstyle", "hardcoretechno", "rave", "synth", "synthpop", "synthwave", "retrowave", "electropop", "idm", "glitch", "downtempo", "trip hop", "triphop", "futurebass", "bassmusic", "chiptune", "electronicmusic", "electrohouse", "electroclash", "technohouse", "progressivetrance", "vocaltrance", "hardtrance", "liquid dnb", "liquiddnb", "neurofunk", "jungle music", "ukbass", "bassline", "speedgarage", "2step", "garagehouse", "italodisco", "synth wave", "electronic dance music", "leftfield", "experimental electronic", "vaporwave", "vaporwave music",
    ],
  },
  {
    id: "hiphop",
    label: "Hip-Hop",
    wavlakeGenres: ["Hip-Hop/Rap"],
    match: ["hiphop", "hip-hop", "hip hop", "rap", "rapper", "trap", "drill", "grime", "boom bap", "boombap", "consciousrap", "gangstarap", "oldschoolhiphop", "undergroundhiphop", "southernhiphop", "cloudrap", "mumble rap", "freestyle", "battle rap", "spokenword", "rnb rap", "hiphopmusic", "conscious rap", "gangsta rap", "old school hip hop", "underground hip hop", "cloud rap", "spoken word", "jazz rap", "jazzrap", "latin hip hop", "latinhiphop", "alternative hip hop", "alternativehiphop", "phonk", "jersey club", "jerseyclub"],
  },
  {
    id: "jazz",
    label: "Jazz & Blues",
    wavlakeGenres: ["Jazz", "Blues", "R&B/Soul"],
    match: ["jazz", "blues", "soul", "rnb", "r&b", "funk", "neo-soul", "neosoul", "rhythm and blues", "rhythmandblues", "smoothjazz", "bebop", "swing", "bigband", "fusion", "jazzfusion", "freejazz", "acidjazz", "gospel", "motown", "delta blues", "deltablues", "chicagoblues", "countryblues", "electricblues", "bluesrock", "jazzblues", "afrobeat", "afrobeats", "neo soul", "smooth jazz", "big band", "jazz fusion", "free jazz", "acid jazz", "chicago blues", "country blues", "electric blues", "jazz blues"],
  },
  {
    id: "classical",
    label: "Classical",
    wavlakeGenres: ["Classical"],
    match: ["classical", "orchestra", "orchestral", "symphony", "chambermusic", "operatic", "opera", "baroque", "romanticclassical", "contemporaryclassical", "neoclassical", "minimalism", "piano classical", "classicalpiano", "choral", "choral music", "sacredclassical", "soundtrackclassical", "artmusic"],
  },
  {
    id: "folk",
    label: "Folk & Acoustic",
    wavlakeGenres: ["Singer/Songwriter", "Country"],
    match: ["folk", "folk music", "acoustic", "acousticmusic", "country", "bluegrass", "americana", "singer-songwriter", "singersongwriter", "unplugged", "traditionalmusic", "indiefolk", "contemporaryfolk", "freakfolk", "altcountry", "outlawcountry", "countryfolk", "rootsmusic", "oldtime", "oldtimemusic", "celtic", "irishfolk", "protest song", "protestsong", "western", "countrymusic"],
  },
  {
    id: "pop",
    label: "Pop",
    wavlakeGenres: ["Pop"],
    match: ["pop", "popmusic", "indiepop", "synthpop", "electropop", "dancepop", "kpop", "jpop", "latinpop", "artpop", "chamberpop", "powerpop", "dream pop", "dreampop", "teenpop", "bedroompop", "baroque pop", "baroquepop", "adultcontemporary", "europop", "mandopop", "cantopop", "hyperpop", "altpop", "poprock", "vocalpop", "poppunk", "pop punk", "punkpop", "punk pop"],
  },
  {
    id: "ambient",
    label: "Ambient & Chill",
    wavlakeGenres: ["New Age"],
    match: ["ambient", "ambientmusic", "chill", "chillout", "lofi", "lo-fi", "lofimusic", "downtempo", "relaxation", "meditation", "sleep music", "sleepmusic", "soundscape", "soundscapes", "newage", "drone", "droneambient", "darkambient", "spaceambient", "nature sounds", "naturesounds", "chillhop", "studybeats", "study music", "studymusic", "relaxingmusic", "healingmusic"],
  },
  {
    id: "bitcoin",
    label: "Bitcoin & Nostr",
    match: ["bitcoin", "btc", "nostr", "value4value", "v4v", "wavlake", "zap", "sats", "satoshi", "freedom"],
  },
  {
    id: "general",
    label: "General",
    match: [],
  },
];

/** Normalize hashtags and genre values so punctuation/case variants share a mapping. */
function normalizeGenreTag(value: string): string {
  const normalized = value.trim().replace(/^#+/, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return normalized;
}

const GENRE_CATEGORY_IDS = new Set(["rock", "electronic", "hiphop", "jazz", "classical", "folk", "pop", "ambient", "bitcoin"]);
const CATEGORY_IDS = new Set(CATEGORIES.filter(category => category.id !== "general").map(category => category.id));

/** All genre/topic categories assigned by the track's explicit Nostr topic tags. */
export function categoriesForTrack(track: Track): string[] {
  const topics = new Set(track.topics.map(normalizeGenreTag).filter(Boolean));
  const matched = CATEGORIES
    .filter(category => category.id !== "general" && category.match.some(tag => topics.has(normalizeGenreTag(tag))))
    .map(category => category.id);
  if (!matched.some(categoryId => GENRE_CATEGORY_IDS.has(categoryId))) matched.push("general");
  return matched;
}

/** Build searchable text for recommendation heuristics, not genre shelf assignment. */
function trackText(track: Track): string {
  return [track.title, track.artist ?? "", track.topics.join(" "), track.event?.content ?? ""]
    .join(" ")
    .toLowerCase();
}

/** True if any keyword appears as a whole word (or hashtag) in recommendation text. */
function matchesKeywords(text: string, keywords: string[]): boolean {
  return keywords.some((kw) => {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^|[^a-z0-9])#?${escaped}([^a-z0-9]|$)`, "i");
    return re.test(text);
  });
}

/** Strict shelf membership: explicit genre/category tags only; matches may overlap. */
export function tracksInCategory(tracks: Track[], categoryId: string): Track[] {
  if (categoryId === "general") return tracks.filter(track => track.kind === "music" && categoriesForTrack(track).includes("general"));
  if (!CATEGORY_IDS.has(categoryId)) return [];
  return tracks.filter(track => track.kind === "music" && categoriesForTrack(track).includes(categoryId));
}

/** Infer the first matching explicit category for recommendation heuristics. */
export function inferCategory(track: Track): string | undefined {
  const explicit = categoriesForTrack(track).find(categoryId => categoryId !== "general");
  if (explicit) return explicit;

  // Text inference is retained for local recommendation similarity only; it does
  // not affect which genre shelf a track appears in.
  const text = trackText(track);
  for (const category of CATEGORIES) {
    if (category.id === "general") continue;
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
