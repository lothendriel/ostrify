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

export interface Subgenre {
  id: string;
  label: string;
  match: string[];
}

/** Explicit tag groups for browsing within the existing broad genre categories. */
export const SUBGENRES: Record<string, Subgenre[]> = {
  rock: [
    { id: 'alternative', label: 'Alternative & Indie', match: ['alternative', 'alternative rock', 'altrock', 'indie', 'indie rock', 'britpop', 'artrock'] },
    { id: 'classic-rock', label: 'Classic Rock', match: ['classicrock', 'rocknroll', 'rockandroll', 'arenarock', 'glamrock'] },
    { id: 'hard-rock', label: 'Hard Rock', match: ['hardrock', 'stonerrock', 'southernrock', 'garagerock', 'spacerock'] },
    { id: 'punk', label: 'Punk', match: ['punk', 'punkrock', 'poppunk', 'hardcore', 'hardcorepunk', 'posthardcore', 'skatepunk', 'skapunk', 'metalpunk'] },
    { id: 'metal', label: 'Metal', match: ['metal', 'heavymetal', 'metalcore', 'deathcore', 'deathmetal', 'blackmetal', 'thrashmetal', 'doommetal', 'stonermetal', 'numetal', 'industrialmetal', 'gothicmetal', 'christianmetal', 'grindcore', 'powermetal', 'symphonicmetal', 'folkmetal', 'vikingmetal', 'sludgemetal', 'postmetal', 'progressivemetal'] },
    { id: 'grunge', label: 'Grunge', match: ['grunge', 'postgrunge'] },
    { id: 'progressive', label: 'Progressive & Post-Rock', match: ['progressiverock', 'progrock', 'postrock', 'mathrock'] },
    { id: 'psychedelic', label: 'Psychedelic Rock', match: ['psychedelicrock', 'psychrock'] },
    { id: 'gothic', label: 'Gothic & Post-Punk', match: ['gothicrock', 'postpunk', 'coldwave', 'darkwave', 'newwave'] },
    { id: 'shoegaze', label: 'Shoegaze & Dream Pop', match: ['shoegaze', 'dreampop', 'noiserock'] },
    { id: 'roots-rock', label: 'Roots & Acoustic Rock', match: ['bluesrock', 'countryrock', 'folkrock', 'acousticrock', 'softrock', 'surfrock'] },
    { id: 'industrial', label: 'Industrial', match: ['industrial', 'industrialmusic', 'industrialrock'] },
    { id: 'emo', label: 'Emo & Screamo', match: ['emo', 'screamo'] },
    { id: 'christian-rock', label: 'Christian Rock', match: ['christianrock'] },
  ],
  electronic: [
    { id: 'house', label: 'House', match: ['house', 'deephouse', 'techhouse', 'progressivehouse', 'electrohouse', 'garagehouse', 'technohouse'] },
    { id: 'techno', label: 'Techno', match: ['techno', 'minimaltechno', 'hardcoretechno'] },
    { id: 'trance', label: 'Trance', match: ['trance', 'trancemusic', 'psytrance', 'progressivetrance', 'vocaltrance', 'hardtrance'] },
    { id: 'drum-and-bass', label: 'Drum & Bass / Jungle', match: ['dnb', 'drumandbass', 'jungle', 'junglemusic', 'liquiddnb', 'neurofunk'] },
    { id: 'dubstep', label: 'Dubstep & Bass', match: ['dubstep', 'brostep', 'futurebass', 'bassmusic', 'ukbass', 'bassline'] },
    { id: 'garage', label: 'UK Garage', match: ['garage', 'ukgarage', 'ukg', 'speedgarage', '2step'] },
    { id: 'synthwave', label: 'Synthwave & Retrowave', match: ['synthwave', 'retrowave', 'vaporwave', 'vaporwavemusic'] },
    { id: 'synthpop', label: 'Synthpop & Electropop', match: ['synthpop', 'electropop', 'electroclash', 'italodisco'] },
    { id: 'downtempo', label: 'Downtempo & Trip-Hop', match: ['downtempo', 'triphop'] },
    { id: 'experimental', label: 'Experimental & IDM', match: ['idm', 'glitch', 'leftfield', 'experimentalelectronic', 'chiptune'] },
    { id: 'dance', label: 'Dance & EDM', match: ['edm', 'dance', 'dancemusic', 'danceedm', 'electronicdancemusic', 'rave', 'hardstyle', 'breakbeat', 'bigbeat'] },
  ],
  hiphop: [
    { id: 'trap', label: 'Trap & Drill', match: ['trap', 'drill', 'cloudrap', 'mumblerap', 'phonk'] },
    { id: 'boom-bap', label: 'Boom Bap & Old School', match: ['boombap', 'oldschoolhiphop'] },
    { id: 'conscious', label: 'Conscious & Underground', match: ['consciousrap', 'undergroundhiphop', 'alternativehiphop'] },
    { id: 'regional', label: 'Regional Hip-Hop', match: ['southernhiphop', 'latinhiphop', 'gangstarap', 'grime', 'jerseyclub'] },
    { id: 'jazz-rap', label: 'Jazz Rap & R&B', match: ['jazzrap', 'rnb rap'] },
    { id: 'spoken-word', label: 'Spoken Word & Freestyle', match: ['spokenword', 'freestyle', 'battlerap'] },
  ],
  jazz: [
    { id: 'jazz', label: 'Jazz', match: ['jazz', 'smoothjazz', 'bebop', 'swing', 'bigband', 'fusion', 'jazzfusion', 'freejazz', 'acidjazz'] },
    { id: 'blues', label: 'Blues', match: ['blues', 'deltablues', 'chicagoblues', 'countryblues', 'electricblues', 'bluesrock', 'jazzblues'] },
    { id: 'soul', label: 'Soul & R&B', match: ['soul', 'rnb', 'r&b', 'rhythmandblues', 'neosoul', 'motown'] },
    { id: 'funk', label: 'Funk & Afrobeat', match: ['funk', 'afrobeat', 'afrobeats'] },
    { id: 'gospel', label: 'Gospel', match: ['gospel'] },
  ],
  classical: [
    { id: 'orchestral', label: 'Orchestral & Symphony', match: ['orchestra', 'orchestral', 'symphony'] },
    { id: 'chamber', label: 'Chamber Music', match: ['chambermusic'] },
    { id: 'opera', label: 'Opera & Choral', match: ['opera', 'operatic', 'choral', 'choralmusic', 'sacredclassical'] },
    { id: 'baroque', label: 'Baroque', match: ['baroque'] },
    { id: 'romantic', label: 'Romantic', match: ['romanticclassical'] },
    { id: 'contemporary', label: 'Contemporary & Neoclassical', match: ['contemporaryclassical', 'neoclassical', 'minimalism'] },
    { id: 'piano', label: 'Classical Piano', match: ['pianoclassical', 'classicalpiano'] },
    { id: 'soundtrack', label: 'Classical Soundtrack', match: ['soundtrackclassical'] },
  ],
  folk: [
    { id: 'folk', label: 'Folk', match: ['folk', 'folkmusic', 'indiefolk', 'contemporaryfolk', 'freakfolk', 'countryfolk', 'protestsong'] },
    { id: 'acoustic', label: 'Acoustic', match: ['acoustic', 'acousticmusic', 'unplugged'] },
    { id: 'country', label: 'Country', match: ['country', 'countrymusic', 'altcountry', 'outlawcountry', 'western'] },
    { id: 'bluegrass', label: 'Bluegrass & Americana', match: ['bluegrass', 'americana', 'rootsmusic', 'oldtime', 'oldtimemusic'] },
    { id: 'singer-songwriter', label: 'Singer-Songwriter', match: ['singer-songwriter', 'singersongwriter'] },
    { id: 'celtic', label: 'Celtic & Traditional', match: ['celtic', 'irishfolk', 'traditionalmusic'] },
  ],
  pop: [
    { id: 'indie-pop', label: 'Indie & Alternative Pop', match: ['indiepop', 'altpop', 'bedroompop', 'artpop', 'chamberpop', 'baroquepop', 'dreampop'] },
    { id: 'synthpop', label: 'Synthpop & Electropop', match: ['synthpop', 'electropop'] },
    { id: 'dance-pop', label: 'Dance Pop', match: ['dancepop', 'europop', 'hyperpop'] },
    { id: 'pop-rock', label: 'Pop Rock & Punk', match: ['poprock', 'poppunk', 'punkpop', 'powerpop'] },
    { id: 'asian-pop', label: 'Asian Pop', match: ['kpop', 'jpop', 'mandopop', 'cantopop'] },
    { id: 'latin-pop', label: 'Latin Pop', match: ['latinpop'] },
    { id: 'vocal-pop', label: 'Vocal & Contemporary Pop', match: ['teenpop', 'adultcontemporary', 'vocalpop'] },
  ],
  ambient: [
    { id: 'ambient', label: 'Ambient', match: ['ambient', 'ambientmusic', 'drone', 'droneambient', 'darkambient', 'spaceambient', 'soundscape', 'soundscapes'] },
    { id: 'lofi', label: 'Lo-Fi & Chillhop', match: ['lofi', 'lofimusic', 'chillhop', 'studybeats', 'studymusic'] },
    { id: 'chillout', label: 'Chillout & Downtempo', match: ['chill', 'chillout', 'downtempo'] },
    { id: 'meditation', label: 'Meditation & Relaxation', match: ['meditation', 'relaxation', 'relaxingmusic', 'healingmusic', 'sleepmusic', 'naturesounds'] },
    { id: 'new-age', label: 'New Age', match: ['newage'] },
  ],
};

/** Match only explicit tags, never infer a subgenre from titles or artist names. */
export function trackMatchesSubgenre(track: Track, subgenre: Subgenre): boolean {
  const tags = new Set(subgenre.match.map(normalizeGenreTag));
  return track.topics.some(topic => tags.has(normalizeGenreTag(topic)));
}

/** Normalize hashtags and genre values so punctuation/case variants share a mapping. */
function normalizeGenreTag(value: string): string {
  const normalized = value.trim().replace(/^#+/, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return normalized;
}

const GENRE_CATEGORY_IDS = new Set(["rock", "electronic", "hiphop", "jazz", "classical", "folk", "pop", "ambient", "bitcoin"]);
const CATEGORY_IDS = new Set(CATEGORIES.filter(category => category.id !== "general").map(category => category.id));
const CATEGORY_MATCHES = CATEGORIES
  .filter(category => category.id !== "general")
  .map(category => ({ id: category.id, tags: new Set(category.match.map(normalizeGenreTag).filter(Boolean)) }));
const CATEGORY_IDS_BY_TAG = new Map<string, string[]>();
for (const category of CATEGORY_MATCHES) {
  for (const tag of category.tags) {
    const categories = CATEGORY_IDS_BY_TAG.get(tag) ?? [];
    categories.push(category.id);
    CATEGORY_IDS_BY_TAG.set(tag, categories);
  }
}

/** All genre/topic categories assigned by the track's explicit Nostr topic tags. */
export function categoriesForTrack(track: Track): string[] {
  const matched = new Set<string>();
  for (const topic of track.topics) {
    for (const categoryId of CATEGORY_IDS_BY_TAG.get(normalizeGenreTag(topic)) ?? []) matched.add(categoryId);
  }
  const orderedMatches = CATEGORY_MATCHES.filter(category => matched.has(category.id)).map(category => category.id);
  if (!orderedMatches.some(categoryId => GENRE_CATEGORY_IDS.has(categoryId))) orderedMatches.push("general");
  return orderedMatches;
}

/** Categorize a collection in one pass, preserving input order and duplicates. */
export function groupTracksByCategory(tracks: Track[]): Map<string, Track[]> {
  const grouped = new Map<string, Track[]>(CATEGORIES.map(category => [category.id, []]));
  for (const track of tracks) {
    if (track.kind !== "music") continue;
    for (const categoryId of categoriesForTrack(track)) {
      grouped.get(categoryId)?.push(track);
    }
  }
  return grouped;
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
