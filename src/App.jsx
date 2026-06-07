import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LineChart, Line, AreaChart, Area,
} from "recharts";
import {
  Plus, Trash2, Pencil, X, Award, Sparkles, Footprints, TrendingUp,
  BookOpen, Target, MapPin, Camera, Settings, Download, Upload,
  Star, ExternalLink,
} from "lucide-react";
import { cloudStorage, pullFromCloud, setHousehold, clearHousehold, hasHousehold, getHousehold } from "./firebase.js";

// ── Storage: cloud-backed (Firestore) with a localStorage mirror ──────────────
// cloudStorage reads instantly from a local cache and writes through to the
// cloud so data survives browser clears and syncs across devices. If no Firebase
// config / household code is set, it transparently behaves as local-only storage.
if (typeof window !== "undefined") {
  window.storage = cloudStorage;
}
// ──────────────────────────────────────────────────────────────────────────

/* ================================================================== */
/*  PALETTE — Kobo planner: warm cream paper, sage, terracotta, gold   */
/* ================================================================== */
const PAPER = "#f3ede1";
const CARD = "#fbf7ee";
const CARD2 = "#f0e8d8";
const INK = "#3a3730";
const MUTE = "#8c8475";
const LINE = "#e0d6c2";
const SAGE = "#7d9471";
const SAGE_D = "#5f7556";
const CLAY = "#c47b56";
const GOLD = "#d6a445";
const PLUM = "#9b7aa0";

const SERIF = "'Hoefler Text', 'Georgia', serif";
const SANS = "'Avenir Next', 'Segoe UI', system-ui, sans-serif";

/* ================================================================== */
/*  EXERCISE + REWARD CONFIG                                           */
/* ================================================================== */
const EXERCISES = [
  { id: "run", label: "Run", icon: "🏃", distance: true },
  { id: "walk", label: "Walk", icon: "🚶", distance: true },
  { id: "cycle", label: "Cycle", icon: "🚴", distance: true },
  { id: "swim", label: "Swim", icon: "🏊", distance: true },
  { id: "hike", label: "Hike", icon: "🥾", distance: true },
  { id: "canoe", label: "Canoe/Kayak", icon: "🛶", distance: true },
  { id: "strength", label: "Strength", icon: "🏋️", distance: false },
  { id: "yoga", label: "Yoga", icon: "🧘", distance: false },
  { id: "pilates", label: "Pilates", icon: "🤸", distance: false },
  { id: "other", label: "Other", icon: "✨", distance: false },
];
const exMeta = (id) => EXERCISES.find((e) => e.id === id) || EXERCISES[EXERCISES.length - 1];

// Friendly titles for the per-activity badges (earned at 5 workouts each)
const ACTIVITY_BADGE = {
  run: { label: "Road Runner" }, walk: { label: "Strider" }, cycle: { label: "Wheel Deal" },
  swim: { label: "Fish Out of Water" }, hike: { label: "Peak Seeker" }, canoe: { label: "Paddler" },
  strength: { label: "Iron Will" }, yoga: { label: "Zen Master" }, pilates: { label: "Core Crusher" },
  other: { label: "All-Rounder" },
};

// Muscle groups for strength logging
const MUSCLE_GROUPS = ["Legs", "Chest", "Back", "Shoulders", "Arms", "Core", "Glutes", "Full Body", "Other"];

const TAXA = ["Plantae", "Aves", "Mammalia", "Amphibia", "Reptilia", "Insecta", "Fungi", "Mollusca", "Arachnida"];
const TAXA_LABEL = {
  Plantae: "Plant", Aves: "Bird", Mammalia: "Mammal", Amphibia: "Amphibian",
  Reptilia: "Reptile", Insecta: "Insect", Fungi: "Fungi", Mollusca: "Mollusc", Arachnida: "Arachnid",
};
const TAXA_ICON = {
  Plantae: "🌿", Aves: "🐦", Mammalia: "🦊", Amphibia: "🐸", Reptilia: "🦎",
  Insecta: "🦋", Fungi: "🍄", Mollusca: "🐌", Arachnida: "🕷️",
};

const RARITY = {
  common:    { label: "Common",    color: SAGE,      stars: 1 },
  uncommon:  { label: "Uncommon",  color: "#5b8fb0", stars: 2 },
  rare:      { label: "Rare",      color: PLUM,      stars: 3 },
  legendary: { label: "Legendary", color: GOLD,      stars: 4 },
};

const rnd = (n) => Math.floor(Math.random() * n);

function rollRarity(minutes, streak) {
  // Effort nudges the odds toward rarer finds, but never guarantees them, so
  // there's real variety. Base roll is random; effort shifts the distribution.
  let score = 0;
  if (minutes >= 75) score += 2;
  else if (minutes >= 45) score += 1.2;
  else if (minutes >= 25) score += 0.6;
  score += Math.min(2, streak * 0.2); // streaks help, capped
  const roll = Math.random() * 10 + score; // 0–10 base + up to ~4 bonus
  if (roll >= 12.5) return "legendary"; // rare even with max effort
  if (roll >= 9.5) return "rare";
  if (roll >= 6) return "uncommon";
  return "common";
}
// Badge rewards scale with how big the milestone is (parsed from the badge id/label).
function badgeRarity(b) {
  const n = Number(String(b.id).match(/(\d+)/)?.[1] || 0);
  if (n >= 100) return "legendary";
  if (n >= 25) return "rare";
  if (n >= 5) return "uncommon";
  return "common";
}
function rarityToQuery(rarity) {
  switch (rarity) {
    case "legendary": return { order_by: "observed_on", page: rnd(40) + 10 };
    case "rare":      return { order_by: "created_at", page: rnd(30) + 8 };
    case "uncommon":  return { order_by: "votes", page: rnd(15) + 3 };
    default:          return { order_by: "votes", page: rnd(8) + 1 };
  }
}

/* ── Fallback pool. Instead of hardcoding fragile Wikimedia file URLs
   (which rot and break), each entry carries a stable Wikipedia page
   title. At reward time we resolve a CURRENT image + fact from the
   Wikipedia REST summary API, then verify the image actually loads. ── */
const FALLBACK = [
  { sci: "Vulpes vulpes", common: "Red Fox", group: "Mammalia", wiki: "Red_fox", emoji: "🦊", bg: "#e8b07a",
    fact: "The red fox is the largest of the true foxes and one of the most widely distributed carnivores in the world." },
  { sci: "Cardinalis cardinalis", common: "Northern Cardinal", group: "Aves", wiki: "Northern_cardinal", emoji: "🐦", bg: "#d9685f",
    fact: "Only male cardinals are bright red; females are a warm tan. They keep their color and territory all year round." },
  { sci: "Danaus plexippus", common: "Monarch Butterfly", group: "Insecta", wiki: "Monarch_butterfly", emoji: "🦋", bg: "#e6913c",
    fact: "Monarchs migrate thousands of miles, and it takes several generations to complete the full round trip each year." },
  { sci: "Sciurus carolinensis", common: "Eastern Gray Squirrel", group: "Mammalia", wiki: "Eastern_gray_squirrel", emoji: "🐿️", bg: "#a9a39a",
    fact: "Gray squirrels accidentally plant thousands of trees by forgetting where they bury their acorns." },
  { sci: "Lithobates catesbeianus", common: "American Bullfrog", group: "Amphibia", wiki: "American_bullfrog", emoji: "🐸", bg: "#7fa05a",
    fact: "A bullfrog's deep call can carry for nearly a kilometer across still water on a quiet night." },
  { sci: "Trachemys scripta elegans", common: "Red-eared Slider", group: "Reptilia", wiki: "Red-eared_slider", emoji: "🐢", bg: "#6f9a6a",
    fact: "Red-eared sliders bask in the sun for hours to regulate their temperature and keep their shells healthy." },
  { sci: "Helianthus annuus", common: "Common Sunflower", group: "Plantae", wiki: "Common_sunflower", emoji: "🌻", bg: "#e6b93c",
    fact: "Young sunflowers track the sun across the sky each day, a movement called heliotropism." },
  { sci: "Amanita muscaria", common: "Fly Agaric", group: "Fungi", wiki: "Amanita_muscaria", emoji: "🍄", bg: "#d05a4f",
    fact: "The iconic red-and-white fly agaric trades nutrients with tree roots through an underground partnership." },
  { sci: "Cornu aspersum", common: "Garden Snail", group: "Mollusca", wiki: "Cornu_aspersum", emoji: "🐌", bg: "#c2a06a",
    fact: "A garden snail can have over 14,000 microscopic teeth on its tongue-like radula." },
  { sci: "Argiope aurantia", common: "Yellow Garden Spider", group: "Arachnida", wiki: "Argiope_aurantia", emoji: "🕷️", bg: "#c9a83c",
    fact: "This garden spider weaves a distinctive zig-zag of silk, called a stabilimentum, into the center of its web." },
  { sci: "Cyanocitta cristata", common: "Blue Jay", group: "Aves", wiki: "Blue_jay", emoji: "🐦", bg: "#5b8fc4",
    fact: "Blue jays can mimic the calls of hawks, sometimes to scare other birds away from a food source." },
  { sci: "Odocoileus virginianus", common: "White-tailed Deer", group: "Mammalia", wiki: "White-tailed_deer", emoji: "🦌", bg: "#c89a6a",
    fact: "A white-tailed deer raises its tail like a white flag to warn the herd of danger." },
  { sci: "Bombus", common: "Bumblebee", group: "Insecta", wiki: "Bumblebee", emoji: "🐝", bg: "#e6c23c",
    fact: "Bumblebees buzz their flight muscles to shake pollen loose — a trick called buzz pollination." },
  { sci: "Sturnus vulgaris", common: "European Starling", group: "Aves", wiki: "Common_starling", emoji: "🐦", bg: "#6a7a8c",
    fact: "Starlings gather in shape-shifting flocks called murmurations that can number in the thousands." },
  { sci: "Quercus", common: "Oak", group: "Plantae", wiki: "Oak", emoji: "🌳", bg: "#7a9a5a",
    fact: "A single mature oak can drop thousands of acorns in a good year and support hundreds of species." },
  { sci: "Procyon lotor", common: "Raccoon", group: "Mammalia", wiki: "Raccoon", emoji: "🦝", bg: "#9a9488",
    fact: "Raccoons have remarkably dexterous front paws and often handle their food in water before eating." },
];

const speciesKey = (sci) => (sci || "").trim().toLowerCase();

/* Build an inline SVG "illustrated card" as a data URI — needs zero
   network, so a reward can ALWAYS be shown even fully offline. */
function svgCard(emoji, bg) {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='300'>` +
    `<defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'>` +
    `<stop offset='0' stop-color='${bg}'/><stop offset='1' stop-color='#3a3730'/></linearGradient></defs>` +
    `<rect width='400' height='300' fill='url(#g)'/>` +
    `<circle cx='200' cy='140' r='86' fill='rgba(255,255,255,0.18)'/>` +
    `<text x='200' y='178' font-size='110' text-anchor='middle'>${emoji}</text>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/* Verify an image URL truly loads before we ever show it. Resolves to
   the url on success, or null on error/timeout. */
function verifyImage(url, timeoutMs = 4000) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const img = new Image();
    let done = false;
    const finish = (ok) => { if (!done) { done = true; resolve(ok ? url : null); } };
    const timer = setTimeout(() => finish(false), timeoutMs);
    img.onload = () => { clearTimeout(timer); finish(img.naturalWidth > 0); };
    img.onerror = () => { clearTimeout(timer); finish(false); };
    img.src = url;
  });
}

/* Resolve a Wikipedia page -> { img, fact, source } using the REST summary API. */
async function wikiLookup(title) {
  try {
    const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
    if (!r.ok) return null;
    const d = await r.json();
    const img = d.thumbnail?.source || d.originalimage?.source || "";
    let fact = (d.extract || "").split(". ").slice(0, 2).join(". ").trim();
    if (fact && !fact.endsWith(".")) fact += ".";
    const factUrl = d.content_urls?.desktop?.page
      || `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`;
    return { img, fact, factUrl };
  } catch { return null; }
}

/* ── Fetch a reward, skipping owned species and verifying the image. ── */
async function fetchReward(rarity, ownedKeys, diag) {
  const note = (m) => { if (diag) diag.steps.push(m); };
  // 1) Try iNaturalist a few times
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const taxon = TAXA[rnd(TAXA.length)];
      const { order_by, page } = rarityToQuery(rarity);
      const url =
        `https://api.inaturalist.org/v1/observations?iconic_taxa=${taxon}` +
        `&photos=true&quality_grade=research&per_page=30&page=${page}` +
        `&order_by=${order_by}&license=cc0,cc-by,cc-by-nc`;
      const res = await fetch(url);
      if (!res.ok) { note(`iNat HTTP ${res.status}`); throw new Error("bad status"); }
      const data = await res.json();
      note(`iNat ok: ${(data.results || []).length} results (${taxon})`);
      const candidates = (data.results || [])
        .filter((o) => o.photos?.length && o.taxon)
        .filter((o) => !ownedKeys.has(speciesKey(o.taxon.name)));
      // try a few candidates, verifying each image actually loads
      for (const pick of candidates.slice(0, 6)) {
        const t = pick.taxon;
        const imgUrl = pick.photos[0].url.replace("square", "medium");
        const ok = await verifyImage(imgUrl);
        if (!ok) { note("img blocked"); continue; }
        let fact = "";
        let factUrl = "";
        try {
          const tr = await fetch(`https://api.inaturalist.org/v1/taxa/${t.id}`);
          const td = await tr.json();
          const tr0 = td.results?.[0] || {};
          const summary = tr0.wikipedia_summary || "";
          fact = summary.replace(/<[^>]+>/g, "").split(". ").slice(0, 2).join(". ").trim();
          if (fact && !fact.endsWith(".")) fact += ".";
          factUrl = tr0.wikipedia_url || "";
        } catch {}
        // iNat species page is always a good citation/landing link
        const inatUrl = `https://www.inaturalist.org/taxa/${t.id}`;
        // Geo: observations carry coordinates; derive a continent for the field guide + badges
        let lat = null, lng = null;
        const coords = pick.geojson?.coordinates;
        if (Array.isArray(coords) && coords.length === 2) { lng = coords[0]; lat = coords[1]; }
        else if (typeof pick.latitude === "number") { lat = pick.latitude; lng = pick.longitude; }
        const continent = continentFromLatLng(lat, lng);
        return mkReward({
          img: ok, common: t.preferred_common_name || t.name, sci: t.name,
          group: taxon, place: pick.place_guess || "", fact,
          factUrl: factUrl || inatUrl, inatUrl, rarity, source: "inat",
          lat, lng, continent,
        });
      }
    } catch (e) { note(`iNat fail: ${e.message || e}`); }
  }

  // 2) Fallback via Wikipedia — ONLY un-owned species (never repeat)
  const avail = FALLBACK.filter((f) => !ownedKeys.has(speciesKey(f.sci)));
  const pool = avail.slice().sort(() => Math.random() - 0.5);
  for (const f of pool) {
    const w = await wikiLookup(f.wiki);
    if (!w || !w.img) { note("wiki: no img"); continue; }
    const ok = await verifyImage(w.img);
    if (!ok) { note("wiki img blocked"); continue; }
    note("wiki ok");
    return mkReward({ img: ok, common: f.common, sci: f.sci, group: f.group, place: "", fact: w.fact, factUrl: w.factUrl, rarity, source: "wiki", diag });
  }

  // 3) GUARANTEED offline tier — an inline illustrated card, still only un-owned species.
  if (pool.length) {
    note("using offline card");
    const f = pool[0];
    return mkReward({
      img: svgCard(f.emoji, f.bg), common: f.common, sci: f.sci, group: f.group,
      place: "", fact: f.fact, factUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(f.wiki)}`,
      rarity, source: "offline", diag,
    });
  }

  // 4) Nothing new available from any source right now — signal "no duplicate" rather than repeat.
  return null;
}
function mkReward(o) {
  return {
    id: `${o.source}-${Date.now()}-${rnd(9999)}`,
    img: o.img, common: o.common, sci: o.sci, group: o.group,
    place: o.place || "", fact: o.fact || "", factUrl: o.factUrl || "", inatUrl: o.inatUrl || "",
    rarity: o.rarity, nickname: "", favorite: false, date: new Date().toISOString(), photos: [],
    source: o.source, diag: o.diag ? o.diag.steps.slice(-4) : null,
    lat: o.lat ?? null, lng: o.lng ?? null, continent: o.continent || null,
  };
}

// Approximate continent from latitude/longitude using simple bounding boxes.
// Coarse but plenty accurate for "which continent" badges.
const CONTINENTS = ["Africa", "Asia", "Europe", "North America", "South America", "Oceania", "Antarctica"];
const CONTINENT_ICON = {
  "Africa": "🦁", "Asia": "🐅", "Europe": "🦌", "North America": "🦅",
  "South America": "🦜", "Oceania": "🦘", "Antarctica": "🐧",
};
function continentFromLatLng(lat, lng) {
  if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) return null;
  if (lat < -60) return "Antarctica";
  // Oceania / Australia
  if (lat <= 0 && lng >= 110 && lng <= 180) return "Oceania";
  if (lat >= -50 && lat < -10 && lng >= 110 && lng <= 155) return "Oceania";
  // South America
  if (lat < 13 && lng >= -82 && lng <= -34) return "South America";
  // North America
  if (lat >= 13 && lng >= -170 && lng <= -50) return "North America";
  // Europe
  if (lat >= 36 && lng >= -25 && lng <= 60) return "Europe";
  // Africa
  if (lat >= -35 && lat < 36 && lng >= -20 && lng <= 52) return "Africa";
  // Asia (broad catch for the eastern hemisphere)
  if (lng > 25 && lng <= 180 && lat >= -10) return "Asia";
  return null;
}

/* ================================================================== */
/*  BADGES                                                             */
/* ================================================================== */
// ── Tier definitions ──
// Show the threshold count as a small suffix on tiered badge titles, e.g. "Birder ×10"
const romanish = (n) => `×${n}`;
const PLURAL = {
  Plantae: "plants", Aves: "birds", Mammalia: "mammals", Amphibia: "amphibians",
  Reptilia: "reptiles", Insecta: "insects", Fungi: "fungi", Mollusca: "molluscs", Arachnida: "arachnids",
};
const pluralLabel = (g) => PLURAL[g] || `${TAXA_LABEL[g].toLowerCase()}s`;
const DIST_TIERS = [1, 5, 10, 25, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
const DIST_NAMES = {
  1: "First Mile", 5: "Getting Started", 10: "10-Mile Club", 25: "Quarter Hundred",
  50: "Half Century", 100: "Century", 200: "Double Century", 300: "Triple Century",
  400: "Long Hauler", 500: "Five Hundred", 600: "Road Warrior", 700: "Endurance",
  800: "Iron Legs", 900: "Almost There", 1000: "Globetrotter",
};
const DIST_ICONS = {
  1: "👣", 5: "🥾", 10: "👟", 25: "🏃", 50: "🏅", 100: "💯", 200: "🎽", 300: "🗺️",
  400: "🌄", 500: "⛰️", 600: "🧭", 700: "🚩", 800: "🦿", 900: "🌠", 1000: "🌐",
};

// Per-group collection: a badge at each threshold up to 50 (capped at how many a group can realistically hold)
const GROUP_TIERS = [1, 5, 10, 15, 20, 25, 30, 40, 50, 100, 200];
const GROUP_TITLE = {
  Plantae: "Botanist", Aves: "Birder", Mammalia: "Mammalogist", Amphibia: "Herpetologist",
  Reptilia: "Reptile Keeper", Insecta: "Entomologist", Fungi: "Mycologist",
  Mollusca: "Malacologist", Arachnida: "Arachnologist",
};

// Per-activity completion thresholds
const ACT_TIERS = [1, 5, 10, 25, 50, 100, 200, 300, 400, 500, 1000];

const BADGES = [
  // ── Overall collection milestones ──
  { id: "first", label: "First Find", desc: "Earn your first species", icon: "🌱", test: (s) => s.collection.length >= 1 },
  { id: "coll10", label: "Naturalist", desc: "Collect 10 species", icon: "📖", test: (s) => s.collection.length >= 10 },
  { id: "coll25", label: "Curator", desc: "Collect 25 species", icon: "🏛️", test: (s) => s.collection.length >= 25 },
  { id: "coll50", label: "Field Scholar", desc: "Collect 50 species", icon: "🔬", test: (s) => s.collection.length >= 50 },
  { id: "coll100", label: "Living Library", desc: "Collect 100 species", icon: "🌍", test: (s) => s.collection.length >= 100 },
  { id: "legend", label: "Lucky Strike", desc: "Find a Legendary species", icon: "✨", test: (s) => s.collection.some((c) => c.rarity === "legendary") },
  { id: "legend5", label: "Fortune's Friend", desc: "Find 5 Legendary species", icon: "🌟", test: (s) => s.collection.filter((c) => c.rarity === "legendary").length >= 5 },
  { id: "alltree", label: "Tree of Life", desc: "Collect from 6 groups", icon: "🌳", test: (s) => Object.values(s.byGroup).filter((n) => n > 0).length >= 6 },
  { id: "allnine", label: "Completionist", desc: "Collect from all 9 groups", icon: "🧬", test: (s) => Object.values(s.byGroup).filter((n) => n > 0).length >= 9 },

  // ── Per-group collection tiers (1→50) ──
  ...TAXA.flatMap((g) => GROUP_TIERS.map((n) => ({
    id: `grp_${g}_${n}`,
    label: `${GROUP_TITLE[g]} ${romanish(n)}`,
    desc: `Collect ${n} ${n === 1 ? TAXA_LABEL[g].toLowerCase() : pluralLabel(g)}`,
    icon: TAXA_ICON[g],
    cat: "group",
    test: (s) => (s.byGroup[g] || 0) >= n,
  }))),

  // ── Total distance tiers (1→1000 miles) ──
  ...DIST_TIERS.map((n) => ({
    id: `dist_${n}`,
    label: DIST_NAMES[n],
    desc: `Travel ${n.toLocaleString()} total ${n === 1 ? "mile" : "miles"}`,
    icon: DIST_ICONS[n],
    cat: "distance",
    test: (s) => s.totalMiles >= n,
  })),

  // ── Per-activity completion tiers (1/5/10/25/50/100 each) ──
  ...EXERCISES.flatMap((e) => ACT_TIERS.map((n) => ({
    id: `act_${e.id}_${n}`,
    label: `${ACTIVITY_BADGE[e.id]?.label || e.label} ${romanish(n)}`,
    desc: `Complete ${n} ${e.label.toLowerCase()} ${n === 1 ? "workout" : "workouts"}`,
    icon: e.icon,
    cat: "activity",
    test: (s) => (s.countByType[e.id] || 0) >= n,
  }))),

  // ── Geo-tag continent badges: one per continent + collect-from-all ──
  ...CONTINENTS.map((c) => ({
    id: `cont_${c.replace(/\s+/g, "")}`,
    label: c,
    desc: `Earn 10 species observed in ${c}`,
    icon: CONTINENT_ICON[c],
    cat: "continent",
    test: (s) => (s.continents?.[c] || 0) >= 10,
  })),
  { id: "cont_all", label: "Globetrotter", desc: "Earn species from all 7 continents", icon: "🌎", cat: "continent",
    test: (s) => (s.continentCount || 0) >= 7 },

  // ── Sightings ──
  { id: "spotter", label: "Spotter", desc: "Log 5 wild sightings", icon: "📸", test: (s) => s.sightings.length >= 5 },
  { id: "spotter25", label: "Keen Eye", desc: "Log 25 wild sightings", icon: "🔭", test: (s) => s.sightings.length >= 25 },

  // ── Consistency ──
  { id: "sessions20", label: "Devoted", desc: "Log 20 workouts", icon: "📅", test: (s) => s.sessions.length >= 20 },
  { id: "sessions100", label: "Centurion", desc: "Log 100 workouts", icon: "🗓️", test: (s) => s.sessions.length >= 100 },
  { id: "streak7", label: "On Fire", desc: "Reach a 7-day streak", icon: "🔥", test: (s) => s.bestStreak >= 7 },
  { id: "streak30", label: "Unstoppable", desc: "Reach a 30-day streak", icon: "⚡", test: (s) => s.bestStreak >= 30 },
  { id: "goalgetter", label: "Goal-Getter", desc: "Complete a goal", icon: "🎯", test: (s) => s.completedGoals >= 1 },
];

/* ================================================================== */
/*  PERSISTENCE + HELPERS                                              */
/* ================================================================== */
const save = async (k, v, setter) => { setter(v); try { await window.storage.set(k, JSON.stringify(v)); } catch {} };
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

// Normalize any strength session into a list of {name, muscle, sets}.
// Handles the new multi-exercise model AND legacy single-exercise entries.
function getExercises(s) {
  if (Array.isArray(s.exercises) && s.exercises.length) return s.exercises;
  if (s.exercise || s.muscle || (s.sets && s.sets.length)) {
    return [{ name: s.exercise || "", muscle: s.muscle || "", sets: s.sets || [] }];
  }
  return [];
}
const exTotalSets = (s) => getExercises(s).reduce((a, ex) => a + (ex.sets?.length || 0), 0);
const parseDate = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const fmtDate = (s) => parseDate(s).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const fmtDur = (sec) => {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), ss = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return ss ? `${m}m ${ss}s` : `${m}m`;
  return `${ss}s`;
};
// Compact large numbers so stat cards never overflow (1234 -> 1.2k, 1500000 -> 1.5M)
const compact = (n) => {
  const num = Number(n) || 0;
  if (Math.abs(num) >= 1e6) return (num / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (Math.abs(num) >= 1e4) return (num / 1e3).toFixed(1).replace(/\.0$/, "") + "k";
  return num.toLocaleString();
};
// Hours-minutes for big time totals (avoids "3h 15m" growing unbounded — caps at compact hours)
const fmtBigTime = (sec) => {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  if (h >= 1000) return `${compact(h)}h`;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

function computeStreak(sessions) {
  if (!sessions.length) return { current: 0, best: 0 };
  const days = [...new Set(sessions.map((s) => s.date))].sort();
  let best = 1, run = 1;
  for (let i = 1; i < days.length; i++) {
    const diff = (parseDate(days[i]) - parseDate(days[i - 1])) / 86400000;
    if (diff === 1) run++; else if (diff > 1) run = 1;
    best = Math.max(best, run);
  }
  let cur = 0; const set = new Set(days);
  let d = new Date(); d.setHours(0, 0, 0, 0);
  const iso = (x) => x.toISOString().slice(0, 10);
  if (!set.has(iso(d))) d.setDate(d.getDate() - 1);
  while (set.has(iso(d))) { cur++; d.setDate(d.getDate() - 1); }
  return { current: cur, best };
}

// read a File -> data URL (for sighting photos)
const fileToDataURL = (file) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result);
  r.onerror = rej;
  r.readAsDataURL(file);
});

/* ================================================================== */
export default function WildFit() {
  const [tab, setTab] = useState("home");
  const [sessions, setSessions] = useState([]);
  const [collection, setCollection] = useState([]);
  const [sightings, setSightings] = useState([]);
  const [goals, setGoals] = useState([]);
  const [earnedBadges, setEarnedBadges] = useState([]);
  const [rewardLog, setRewardLog] = useState({}); // { 'YYYY-MM-DD': true } days already rewarded
  const [lastUsed, setLastUsed] = useState({}); // { activityType: {h,m,s,miles} }
  const [loaded, setLoaded] = useState(false);

  // ── Profiles ──
  const [profiles, setProfiles] = useState([]);      // [{id, name, emoji}]
  const [activeProfile, setActiveProfile] = useState(null); // id
  const [profilesReady, setProfilesReady] = useState(false);
  const [profileSwitchOpen, setProfileSwitchOpen] = useState(false);

  const [logOpen, setLogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [goalOpen, setGoalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [sightOpen, setSightOpen] = useState(false);
  const [editingSighting, setEditingSighting] = useState(null);
  const [editingSpecies, setEditingSpecies] = useState(null);
  const [viewSpecies, setViewSpecies] = useState(null);
  const [reward, setReward] = useState(null);
  const [rewardState, setRewardState] = useState("idle");
  const [rewardQueue, setRewardQueue] = useState([]); // pending earned organisms to reveal in sequence
  const [naming, setNaming] = useState(null);
  const [badgePopup, setBadgePopup] = useState(null);
  const [goalDone, setGoalDone] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const pkey = (k) => `wf:p:${activeProfile}:${k}`;

  // 1) Load profile list + active profile once (after pulling latest from cloud)
  useEffect(() => {
    (async () => {
      // Hydrate the local mirror from the cloud first, so a fresh device or a
      // just-cleared browser gets the synced data before we read anything.
      try { if (hasHousehold()) await pullFromCloud(); } catch {}
      let list = [], active = null;
      try { const r = await window.storage.get("wf:profiles"); if (r?.value) list = JSON.parse(r.value); } catch {}
      try { const r = await window.storage.get("wf:activeProfile"); if (r?.value) active = JSON.parse(r.value); } catch {}
      if (!list.length) {
        // migrate any pre-profile data into a default profile
        const def = { id: "p" + Date.now(), name: "Me", emoji: "🌿" };
        list = [def]; active = def.id;
        try { await window.storage.set("wf:profiles", JSON.stringify(list)); } catch {}
        try { await window.storage.set("wf:activeProfile", JSON.stringify(active)); } catch {}
        // best-effort migration of legacy keys
        for (const k of ["sessions", "collection", "sightings", "goals", "badges", "rewardlog"]) {
          try { const r = await window.storage.get(`wf:${k}`); if (r?.value) await window.storage.set(`wf:p:${def.id}:${k}`, r.value); } catch {}
        }
      }
      if (!active || !list.some((p) => p.id === active)) active = list[0].id;
      setProfiles(list); setActiveProfile(active); setProfilesReady(true);
    })();
  }, []);

  const saveProfiles = (v) => save("wf:profiles", v, setProfiles);
  const switchProfile = (id) => { setLoaded(false); setActiveProfile(id); save("wf:activeProfile", id, setActiveProfile); setProfileSwitchOpen(false); setTab("home"); };

  // Delete a profile AND erase all of its stored data (workouts, guide, badges, goals, etc.).
  async function deleteProfile(id) {
    if (profiles.length <= 1) return; // always keep at least one profile
    const PROFILE_KEYS = ["sessions", "collection", "sightings", "goals", "badges", "rewardlog", "lastused"];
    for (const k of PROFILE_KEYS) {
      try { await window.storage.delete(`wf:p:${id}:${k}`); } catch {}
    }
    const remaining = profiles.filter((p) => p.id !== id);
    saveProfiles(remaining);
    // If we deleted the active profile, switch to another one (reloads its data).
    if (id === activeProfile) switchProfile(remaining[0].id);
  }

  // 2) Load this profile's data whenever the active profile changes
  useEffect(() => {
    if (!profilesReady || !activeProfile) return;
    setLoaded(false);
    (async () => {
      const g = async (k, set, fallback) => { try { const r = await window.storage.get(pkey(k)); set(r?.value ? JSON.parse(r.value) : fallback); } catch { set(fallback); } };
      await g("sessions", setSessions, []);
      // Collection: de-duplicate by species (keep the first/newest of each), repairing any legacy dupes
      try {
        const r = await window.storage.get(pkey("collection"));
        const raw = r?.value ? JSON.parse(r.value) : [];
        const seen = new Set(); const deduped = [];
        for (const c of raw) {
          const key = speciesKey(c.sci) || speciesKey(c.common);
          if (key && seen.has(key)) continue;
          if (key) seen.add(key);
          deduped.push(c);
        }
        setCollection(deduped);
        if (deduped.length !== raw.length) { try { await window.storage.set(pkey("collection"), JSON.stringify(deduped)); } catch {} }
      } catch { setCollection([]); }
      await g("sightings", setSightings, []);
      await g("goals", setGoals, []);
      await g("badges", setEarnedBadges, []);
      await g("rewardlog", setRewardLog, {});
      await g("lastused", setLastUsed, {});
      setLoaded(true);
    })();
  }, [activeProfile, profilesReady]); // eslint-disable-line

  const saveSessions = (v) => save(pkey("sessions"), v, setSessions);
  const saveCollection = (v) => save(pkey("collection"), v, setCollection);
  const saveSightings = (v) => save(pkey("sightings"), v, setSightings);
  const saveGoals = (v) => save(pkey("goals"), v, setGoals);
  const saveBadges = (v) => save(pkey("badges"), v, setEarnedBadges);
  const saveRewardLog = (v) => save(pkey("rewardlog"), v, setRewardLog);
  const saveLastUsed = (v) => save(pkey("lastused"), v, setLastUsed);

  const streak = useMemo(() => computeStreak(sessions), [sessions]);

  // goal progress is needed both for display and for completion-reward detection
  const totalMilesByType = useMemo(() => {
    const m = {};
    sessions.forEach((s) => { if (s.miles) m[s.type] = (m[s.type] || 0) + s.miles; });
    return m;
  }, [sessions]);
  const totalMiles = Object.values(totalMilesByType).reduce((a, b) => a + b, 0);
  const totalSec = sessions.reduce((a, s) => a + (s.seconds || 0), 0);

  function goalProgress(g) {
    // Helpers: this week's window = Monday 00:00 through end of today (no future dates)
    const weekStart = () => { const now = new Date(); const day = (now.getDay() + 6) % 7; const m = new Date(now); m.setDate(now.getDate() - day); m.setHours(0, 0, 0, 0); return m; };
    const endOfToday = () => { const e = new Date(); e.setHours(23, 59, 59, 999); return e; };
    const inThisWeek = (s) => { const d = parseDate(s.date); return d >= weekStart() && d <= endOfToday(); };
    if (g.kind === "frequency") {
      const count = sessions.filter(inThisWeek).length;
      return { value: count, target: g.target, unit: "workouts", label: "this week", weekly: true };
    }
    if (g.kind === "weekly_miles") {
      const mi = sessions.filter(inThisWeek)
        .filter((s) => g.exType === "any" || s.type === g.exType)
        .reduce((a, s) => a + (s.miles || 0), 0);
      return { value: +mi.toFixed(1), target: g.target, unit: "mi", label: `${exMeta(g.exType).label} · this week`, weekly: true };
    }
    if (g.kind === "distance") {
      const mi = g.exType === "any" ? totalMiles : (totalMilesByType[g.exType] || 0);
      return { value: +mi.toFixed(1), target: g.target, unit: "mi", label: `${exMeta(g.exType).label} · all-time` };
    }
    if (g.kind === "single_distance") {
      // Best single-workout distance for this activity (e.g. "run 10 mi in one go")
      const best = sessions
        .filter((s) => g.exType === "any" || s.type === g.exType)
        .reduce((mx, s) => Math.max(mx, s.miles || 0), 0);
      return { value: +best.toFixed(1), target: g.target, unit: "mi", label: `${exMeta(g.exType).label} · single workout` };
    }
    if (g.kind === "event") {
      const days = Math.max(0, Math.ceil((parseDate(g.date) - new Date()) / 86400000));
      const total = g.totalDays || days || 1;
      return { value: total - days, target: total, unit: "days", label: g.name, daysLeft: days };
    }
    return { value: 0, target: 1, unit: "" };
  }

  const completedGoals = useMemo(
    () => goals.filter((g) => (g.kind === "distance" || g.kind === "single_distance") && goalProgress(g).value >= goalProgress(g).target).length,
    [goals, sessions, totalMiles] // eslint-disable-line
  );

  const stats = useMemo(() => {
    const byGroup = {}; TAXA.forEach((t) => (byGroup[t] = 0));
    collection.forEach((c) => { byGroup[c.group] = (byGroup[c.group] || 0) + 1; });
    const countByType = {};
    sessions.forEach((s) => { countByType[s.type] = (countByType[s.type] || 0) + 1; });
    // Continents represented in the field guide (from reward geo-tags)
    const continents = {};
    collection.forEach((c) => { if (c.continent) continents[c.continent] = (continents[c.continent] || 0) + 1; });
    const continentCount = Object.keys(continents).length;
    return { collection, sessions, sightings, byGroup, countByType, continents, continentCount,
      milesByType: totalMilesByType, totalMiles, bestStreak: streak.best, completedGoals };
  }, [collection, sessions, sightings, totalMilesByType, totalMiles, streak, completedGoals]);

  // goal-completion reward: when a non-event goal newly completes, celebrate + bonus species
  const prevCompleted = useRef(0);
  useEffect(() => {
    if (!loaded) return;
    if (completedGoals > prevCompleted.current && prevCompleted.current !== 0) {
      setGoalDone(true);
    }
    prevCompleted.current = completedGoals;
  }, [completedGoals, loaded]);

  const ownedKeys = useMemo(() => new Set(collection.map((c) => speciesKey(c.sci))), [collection]);
  const ownedKeysRef = useRef(ownedKeys);
  useEffect(() => { ownedKeysRef.current = ownedKeys; }, [ownedKeys]);

  // Fetch N distinct rewards in sequence, growing the owned-set as we go so they don't collide.
  // fetchReward returns null when no NEW species is available — we skip those (never duplicate).
  async function fetchManyRewards(specs) {
    const owned = new Set(ownedKeysRef.current);
    const out = [];
    for (const spec of specs) {
      try {
        const r = await fetchReward(spec.rarity, owned, { steps: [] });
        if (!r) continue; // nothing new to grant for this slot
        r.reason = spec.reason || "";
        owned.add(speciesKey(r.sci));
        out.push(r);
      } catch { /* skip on failure */ }
    }
    return out;
  }

  // Reveal a list of earned organisms one at a time. First shows immediately;
  // the rest queue up and appear when the user taps "Done".
  function enqueueRewards(rewards) {
    if (!rewards.length) return;
    setCollection((prev) => {
      const merged = [...rewards, ...prev];
      save(pkey("collection"), merged, setCollection);
      return merged;
    });
    setReward(rewards[0]);
    setRewardState("done");
    setRewardQueue(rewards.slice(1));
    setTab("home");
  }

  function advanceReward() {
    if (rewardQueue.length) {
      setReward(rewardQueue[0]);
      setRewardQueue(rewardQueue.slice(1));
      setRewardState("done");
    } else {
      setReward(null); setRewardState("idle");
    }
  }

  // badge auto-check — each newly earned badge grants its own organism
  const pendingBadgeRewards = useRef(null); // holds a Promise<rewards[]>
  useEffect(() => {
    if (!loaded) return;
    const newly = BADGES.filter((b) => !earnedBadges.includes(b.id) && b.test(stats));
    if (!newly.length) return;
    saveBadges([...earnedBadges, ...newly.map((b) => b.id)]);
    setBadgePopup(newly); // summary popup (handles single or multiple)
    // Kick off the fetch immediately and stash the PROMISE, so reveal can await it.
    // Badge rarity scales with the tier: bigger milestones → rarer rewards.
    pendingBadgeRewards.current = fetchManyRewards(
      newly.map((b) => ({ rarity: badgeRarity(b), reason: `Badge: ${b.label}` }))
    );
  }, [stats, loaded]); // eslint-disable-line

  async function revealBadgeRewards() {
    setBadgePopup(null);
    const p = pendingBadgeRewards.current;
    pendingBadgeRewards.current = null;
    if (!p) return;
    // If the fetch is still running, show the loading spinner until it lands.
    setRewardState("loading"); setReward(null); setTab("home");
    try {
      const rewards = await p;
      if (rewards.length) enqueueRewards(rewards);
      else { setRewardState("idle"); }
    } catch { setRewardState("idle"); }
  }

  async function grantReward(minutes, sessionsForStreak, isBonus, dateToMark) {
    setTab("home");
    setRewardState("loading"); setReward(null);
    const liveStreak = computeStreak(sessionsForStreak).current;
    const rarity = isBonus ? "rare" : rollRarity(minutes, liveStreak);
    try {
      const diag = { steps: [] };
      const r = await fetchReward(rarity, ownedKeysRef.current, diag);
      if (!r) {
        // No NEW species available right now — never grant a duplicate.
        setRewardState("nonew");
        if (dateToMark) saveRewardLog({ ...rewardLog, [dateToMark]: true });
        return;
      }
      r.bonus = !!isBonus;
      if (isBonus) r.reason = "Goal complete";
      setReward(r); setRewardState("done");
      saveCollection([r, ...collection]);
      if (dateToMark) saveRewardLog({ ...rewardLog, [dateToMark]: true });
    } catch { setRewardState("error"); }
  }

  async function addSession(form) {
    const seconds = (Number(form.h) || 0) * 3600 + (Number(form.m) || 0) * 60 + (Number(form.s) || 0);
    const minutes = seconds / 60;
    const session = {
      id: "s" + Date.now(), type: form.type, date: form.date,
      seconds, miles: form.miles ? Number(form.miles) : null, note: form.note || "",
      exercises: form.exercises && form.exercises.length ? form.exercises : null, // strength: [{name,muscle,sets}]
    };
    const next = [session, ...sessions];
    saveSessions(next);
    setLogOpen(false);
    // remember last-used time & distance (and last strength exercise list) for this activity type
    saveLastUsed({ ...lastUsed, [form.type]: { h: form.h || "", m: form.m || "", s: form.s || "", miles: form.miles || "", exercises: form.exercises || null } });

    // Daily reward: 15+ min AND no reward already granted for this date
    const alreadyRewarded = !!rewardLog[form.date];
    if (minutes >= 15 && !alreadyRewarded) {
      grantReward(minutes, next, false, form.date);
    }
  }
  function updateSession(id, patch) { saveSessions(sessions.map((s) => (s.id === id ? { ...s, ...patch } : s))); setEditing(null); }
  function deleteSession(id) { saveSessions(sessions.filter((s) => s.id !== id)); setEditing(null); }
  function saveNickname(id, nickname) {
    saveCollection(collection.map((c) => (c.id === id ? { ...c, nickname } : c)));
    setNaming(null);
    setViewSpecies((v) => (v && v.id === id ? { ...v, nickname } : v));
  }
  function addPhotosToSpecies(id, dataUrls) {
    const upd = collection.map((c) => (c.id === id ? { ...c, photos: [...(c.photos || []), ...dataUrls] } : c));
    saveCollection(upd);
    setViewSpecies(upd.find((c) => c.id === id));
  }
  function toggleFavorite(id) {
    const upd = collection.map((c) => (c.id === id ? { ...c, favorite: !c.favorite } : c));
    saveCollection(upd);
    setViewSpecies((v) => (v && v.id === id ? { ...v, favorite: !v.favorite } : v));
  }
  function updateSpecies(id, patch) {
    const upd = collection.map((c) => (c.id === id ? { ...c, ...patch } : c));
    saveCollection(upd);
    setViewSpecies((v) => (v && v.id === id ? { ...v, ...patch } : v));
    setEditingSpecies(null);
  }
  function addGoal(g) { saveGoals([...goals, { id: "g" + Date.now(), startedAt: todayStr(), ...g }]); setGoalOpen(false); }
  function updateGoal(id, patch) { saveGoals(goals.map((g) => (g.id === id ? { ...g, ...patch } : g))); setEditingGoal(null); }
  function deleteGoal(id) { saveGoals(goals.filter((g) => g.id !== id)); setEditingGoal(null); }

  async function addSighting(s) { saveSightings([{ id: "v" + Date.now(), ...s }, ...sightings]); setSightOpen(false); }
  function updateSighting(id, patch) { saveSightings(sightings.map((s) => (s.id === id ? { ...s, ...patch } : s))); setEditingSighting(null); }
  function deleteSighting(id) { saveSightings(sightings.filter((s) => s.id !== id)); setEditingSighting(null); }

  // ── Export / Import: full snapshot of the ACTIVE profile (everything in the guide) ──
  function exportData() {
    const payload = { app: "WildFit", version: 2, exportedAt: new Date().toISOString(),
      profile: profiles.find((p) => p.id === activeProfile) || null,
      sessions, collection, sightings, goals, earnedBadges, rewardLog, lastUsed };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const who = (profiles.find((p) => p.id === activeProfile)?.name || "profile").replace(/\s+/g, "-").toLowerCase();
    a.href = url; a.download = `wildfit-${who}-${todayStr()}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  function importData(text) {
    try {
      const p = JSON.parse(text);
      // Restore every part of the guide, preserving all stored fields (photos, facts, nicknames, etc.)
      if (Array.isArray(p.sessions)) saveSessions(p.sessions);
      if (Array.isArray(p.collection)) saveCollection(p.collection);
      if (Array.isArray(p.sightings)) saveSightings(p.sightings);
      if (Array.isArray(p.goals)) saveGoals(p.goals);
      if (Array.isArray(p.earnedBadges)) saveBadges(p.earnedBadges);
      if (p.rewardLog && typeof p.rewardLog === "object") saveRewardLog(p.rewardLog);
      if (p.lastUsed && typeof p.lastUsed === "object") saveLastUsed(p.lastUsed);
      setSettingsOpen(false);
      return true;
    } catch { return false; }
  }

  if (!profilesReady || !loaded) return <div style={{ background: PAPER, minHeight: "100vh" }} />;

  const todayRewarded = !!rewardLog[todayStr()];
  const activeProfileObj = profiles.find((p) => p.id === activeProfile);

  return (
    <div style={{ background: PAPER, minHeight: "100vh", color: INK, fontFamily: SANS, paddingBottom: 78,
      backgroundImage: "radial-gradient(circle at 15% 0%, rgba(125,148,113,0.06), transparent 45%), radial-gradient(circle at 90% 5%, rgba(196,123,86,0.05), transparent 40%)" }}>
      <style>{`
        @keyframes slideUp { from{transform:translateY(40px);opacity:0} to{transform:translateY(0);opacity:1} }
        @keyframes pop { 0%{transform:scale(.7);opacity:0} 60%{transform:scale(1.06)} 100%{transform:scale(1);opacity:1} }
        @keyframes spin { to{transform:rotate(360deg)} }
        @keyframes floatBadge { from{transform:translateY(-20px) scale(.8);opacity:0} to{transform:translateY(0) scale(1);opacity:1} }
        * { box-sizing: border-box; }
        .pop { animation: pop .4s cubic-bezier(.2,.8,.3,1.2) both; }
        .tap { transition: transform .12s, background .15s; }
        .tap:active { transform: scale(.96); }
      `}</style>

      <header style={{ padding: "16px 16px 12px", textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
          <button onClick={() => setProfileSwitchOpen(true)} style={{
            background: CARD, border: `1px solid ${LINE}`, borderRadius: 20, padding: "6px 14px 6px 8px", cursor: "pointer", color: INK,
            display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, fontFamily: SANS, maxWidth: "70%", flexShrink: 1 }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>{activeProfileObj?.emoji || "🌿"}</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{activeProfileObj?.name || "Me"}</span>
          </button>
          <button onClick={() => setSettingsOpen(true)} style={{
            background: CARD, border: `1px solid ${LINE}`, borderRadius: 10, padding: 8, cursor: "pointer", color: MUTE, flexShrink: 0 }}>
            <Settings size={18} />
          </button>
        </div>
        <div style={{ fontSize: 11, letterSpacing: 5, color: SAGE_D, textTransform: "uppercase", fontWeight: 600 }}>Move &amp; Discover</div>
        <h1 style={{ margin: "4px 0 0", fontFamily: SERIF, fontSize: 38, fontWeight: 600, color: INK, letterSpacing: 0.5, fontStyle: "italic" }}>WildFit</h1>
        <div style={{ width: 46, height: 3, background: GOLD, margin: "10px auto 0", borderRadius: 2 }} />
      </header>

      <div style={{ display: "flex", gap: 8, padding: "0 16px 16px", maxWidth: 480, margin: "0 auto" }}>
        {[["🔥", compact(streak.current), "day streak"], ["🦋", compact(collection.length), "species"], ["🏅", compact(earnedBadges.length), "badges"]].map(([icon, v, k]) => (
          <div key={k} style={{ flex: 1, background: CARD, border: `1px solid ${LINE}`, borderRadius: 16, padding: "12px 6px", textAlign: "center" }}>
            <div style={{ fontSize: 18 }}>{icon}</div>
            <div style={{ fontFamily: SERIF, fontSize: 24, fontWeight: 600, color: CLAY, lineHeight: 1.1 }}>{v}</div>
            <div style={{ fontSize: 10, color: MUTE, letterSpacing: 0.5 }}>{k}</div>
          </div>
        ))}
      </div>

      <main style={{ padding: "0 16px", maxWidth: 480, margin: "0 auto" }}>
        {tab === "home" && (
          <HomeTab sessions={sessions} reward={reward} rewardState={rewardState} onName={setNaming}
            onLog={() => setLogOpen(true)} onClearReward={advanceReward} queueCount={rewardQueue.length}
            todayRewarded={todayRewarded} />
        )}
        {tab === "guide" && (
          <GuideTab collection={collection} sightings={sightings} byGroup={stats.byGroup}
            onOpen={setViewSpecies} onAddSighting={() => setSightOpen(true)} onEditSighting={setEditingSighting}
            onToggleFavorite={toggleFavorite}
            onToggleSightingFavorite={(id) => updateSighting(id, { favorite: !sightings.find((s) => s.id === id)?.favorite })} />
        )}
        {tab === "badges" && <BadgesTab earned={earnedBadges} />}
        {tab === "trends" && <TrendsTab sessions={sessions} totalMiles={totalMiles} totalSec={totalSec} onEdit={setEditing} />}
        {tab === "goals" && <GoalsTab goals={goals} progressFn={goalProgress} onAdd={() => setGoalOpen(true)} onEdit={setEditingGoal} onDelete={deleteGoal} />}
      </main>

      {tab !== "home" && (
        <button className="tap" onClick={() => setLogOpen(true)} style={{ position: "fixed", right: 18, bottom: 90, zIndex: 20,
          width: 56, height: 56, borderRadius: "50%", background: SAGE, color: "#fff", border: "none",
          boxShadow: "0 4px 14px rgba(95,117,86,0.4)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Plus size={26} />
        </button>
      )}

      <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "rgba(251,247,238,0.97)", backdropFilter: "blur(8px)",
        borderTop: `1px solid ${LINE}`, display: "flex", padding: "8px 0 10px", zIndex: 15 }}>
        {[["home", Footprints, "Move"], ["guide", BookOpen, "Guide"], ["badges", Award, "Badges"], ["trends", TrendingUp, "Trends"], ["goals", Target, "Goals"]].map(([id, Icon, label]) => (
          <button key={id} className="tap" onClick={() => setTab(id)} style={{ flex: 1, background: "none", border: "none", cursor: "pointer",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 3, color: tab === id ? SAGE_D : MUTE }}>
            <Icon size={21} strokeWidth={tab === id ? 2.4 : 1.8} />
            <span style={{ fontSize: 10.5, fontWeight: tab === id ? 700 : 500 }}>{label}</span>
          </button>
        ))}
      </nav>

      {logOpen && <LogModal onClose={() => setLogOpen(false)} onSave={addSession} todayRewarded={todayRewarded} lastUsed={lastUsed} />}
      {editing && <EditModal session={editing} onClose={() => setEditing(null)} onSave={(p) => updateSession(editing.id, p)} onDelete={() => deleteSession(editing.id)} />}
      {goalOpen && <GoalModal onClose={() => setGoalOpen(false)} onSave={addGoal} />}
      {editingGoal && <GoalModal goal={editingGoal} onClose={() => setEditingGoal(null)} onSave={(g) => updateGoal(editingGoal.id, g)} onDelete={() => deleteGoal(editingGoal.id)} />}
      {sightOpen && <SightingModal onClose={() => setSightOpen(false)} onSave={addSighting} />}
      {editingSighting && <SightingModal sighting={editingSighting} onClose={() => setEditingSighting(null)} onSave={(s) => updateSighting(editingSighting.id, s)} onDelete={() => deleteSighting(editingSighting.id)} />}
      {viewSpecies && <SpeciesModal item={viewSpecies} onClose={() => setViewSpecies(null)} onName={() => setNaming(viewSpecies)} onEdit={() => setEditingSpecies(viewSpecies)} onAddPhotos={addPhotosToSpecies} onToggleFavorite={toggleFavorite} />}
      {editingSpecies && <SpeciesEditModal item={editingSpecies} onClose={() => setEditingSpecies(null)} onSave={(patch) => updateSpecies(editingSpecies.id, patch)} />}
      {naming && <NameModal item={naming} onClose={() => setNaming(null)} onSave={(n) => saveNickname(naming.id, n)} />}
      {badgePopup && <BadgePopup badges={badgePopup} onClose={revealBadgeRewards} />}
      {goalDone && <GoalDonePopup onClose={() => setGoalDone(null)} onClaim={() => { setGoalDone(null); grantReward(30, sessions, true); }} todayRewarded={todayRewarded} />}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} onExport={exportData} onImport={importData}
        counts={{ sessions: sessions.length, species: collection.length, sightings: sightings.length }}
        profiles={profiles} activeProfile={activeProfile} onSwitch={switchProfile} onSaveProfiles={saveProfiles} onDeleteProfile={deleteProfile} />}
      {profileSwitchOpen && <ProfileSwitcher profiles={profiles} activeProfile={activeProfile} onSwitch={switchProfile}
        onClose={() => setProfileSwitchOpen(false)} onManage={() => { setProfileSwitchOpen(false); setSettingsOpen(true); }} />}
    </div>
  );
}

/* ================================ HOME ============================= */
function HomeTab({ sessions, reward, rewardState, onLog, onName, onClearReward, queueCount, todayRewarded }) {
  return (
    <div>
      {rewardState === "loading" && (
        <div style={card("center")}>
          <div style={{ width: 40, height: 40, border: `3px solid ${LINE}`, borderTopColor: SAGE, borderRadius: "50%", margin: "18px auto", animation: "spin 1s linear infinite" }} />
          <div style={{ color: MUTE, fontStyle: "italic", fontFamily: SERIF }}>Searching the wild for your reward…</div>
        </div>
      )}
      {rewardState === "error" && (
        <div style={card("center")}>
          <div style={{ color: CLAY, padding: 10 }}>Couldn't fetch a species this time. Your workout still counts!</div>
          <button className="tap" style={btn(SAGE)} onClick={onClearReward}>OK</button>
        </div>
      )}
      {rewardState === "nonew" && (
        <div style={card("center")}>
          <div style={{ fontSize: 36, marginTop: 6 }}>🏆</div>
          <div style={{ fontFamily: SERIF, fontSize: 19, fontStyle: "italic", margin: "6px 0 4px" }}>You've collected them all!</div>
          <div style={{ color: MUTE, fontSize: 13, padding: "0 10px 6px" }}>No new species to add right now — every available one is already in your guide. Your workout still counts toward streaks, goals, and badges.</div>
          <button className="tap" style={btn(SAGE)} onClick={onClearReward}>OK</button>
        </div>
      )}
      {rewardState === "done" && reward && (
        <div className="pop" style={{ ...card(), padding: 0, overflow: "hidden", marginBottom: 18 }}>
          <div style={{ background: RARITY[reward.rarity].color, color: "#fff", padding: "8px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 700, fontSize: 12, letterSpacing: 1, textTransform: "uppercase" }}>{"★".repeat(RARITY[reward.rarity].stars)} {RARITY[reward.rarity].label}</span>
            <span style={{ fontSize: 11, fontWeight: 700 }}>{reward.reason || (reward.bonus ? "GOAL BONUS" : "")} <Sparkles size={14} style={{ verticalAlign: "middle" }} /></span>
          </div>
          <img src={reward.img} alt={reward.common} style={{ width: "100%", height: 250, objectFit: "cover", display: "block" }} />
          <div style={{ padding: "16px 16px 18px" }}>
            <div style={{ fontSize: 11, color: SAGE_D, letterSpacing: 1, textTransform: "uppercase", fontWeight: 700 }}>{TAXA_ICON[reward.group]} New {TAXA_LABEL[reward.group]}</div>
            <div style={{ fontFamily: SERIF, fontSize: 25, fontWeight: 600, color: INK, marginTop: 2 }}>{reward.common}</div>
            <div style={{ fontStyle: "italic", color: MUTE, fontFamily: SERIF }}>{reward.sci}</div>
            {reward.fact && <FactBlock fact={reward.fact} url={reward.factUrl} />}
            {(reward.place || reward.continent) && <div style={{ fontSize: 11.5, color: MUTE, marginTop: 8, display: "flex", alignItems: "center", gap: 4 }}><MapPin size={12} /> {reward.place}{reward.place && reward.continent ? " · " : ""}{reward.continent ? `${CONTINENT_ICON[reward.continent] || ""} ${reward.continent}` : ""}</div>}
            {queueCount > 0 && <div style={{ fontSize: 12, color: CLAY, marginTop: 10, fontWeight: 600, textAlign: "center" }}>＋ {queueCount} more {queueCount === 1 ? "reward" : "rewards"} to reveal</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button className="tap" style={{ ...btn(SAGE), flex: 1 }} onClick={() => onName(reward)}>Give it a name</button>
              <button className="tap" style={{ ...btnOutline(), flex: 1 }} onClick={onClearReward}>{queueCount > 0 ? "Next →" : "Done"}</button>
            </div>
          </div>
        </div>
      )}
      {rewardState === "idle" && (
        <div style={{ ...card("center"), padding: "28px 18px" }}>
          <div style={{ fontSize: 40 }}>🌿</div>
          <h2 style={{ fontFamily: SERIF, fontSize: 21, margin: "8px 0 4px", fontStyle: "italic" }}>Move to discover</h2>
          <p style={{ color: MUTE, fontSize: 13.5, lineHeight: 1.5, maxWidth: 290, margin: "0 auto 16px" }}>
            {todayRewarded
              ? "You've earned today's species! Log more activity to keep your streak — tomorrow brings a new discovery."
              : "Log 15 minutes of any activity today to earn a wild species for your field guide. Longer sessions and streaks unlock rarer finds."}
          </p>
          <button className="tap" style={btn(SAGE)} onClick={onLog}>＋ Log a workout</button>
        </div>
      )}
      <SectionLabel>Recent</SectionLabel>
      {sessions.length === 0 ? (
        <div style={{ color: MUTE, fontStyle: "italic", textAlign: "center", padding: 20, fontFamily: SERIF }}>No workouts yet — your story starts with one walk.</div>
      ) : sessions.slice(0, 5).map((s) => <SessionRow key={s.id} s={s} />)}
    </div>
  );
}

function SessionRow({ s }) {
  const m = exMeta(s.type);
  const isStrength = s.type === "strength";
  const exs = isStrength ? getExercises(s) : [];
  const named = exs.filter((e) => e.name);
  // Title: list exercise names if present, else fall back to activity label / note
  let title = m.label;
  if (isStrength && named.length) title = named.map((e) => e.name).join(", ");
  const totalSets = isStrength ? exTotalSets(s) : 0;
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12, background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: "11px 14px", marginBottom: 8 }}>
      <div style={{ fontSize: 22 }}>{m.icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600 }}>{title}{!isStrength && s.note ? <span style={{ color: MUTE, fontWeight: 400 }}> · {s.note}</span> : null}</div>
        <div style={{ fontSize: 12, color: MUTE }}>
          {fmtDate(s.date)} · {fmtDur(s.seconds)}{s.miles ? ` · ${s.miles} mi` : ""}
          {isStrength && exs.length ? ` · ${exs.length} ${exs.length === 1 ? "exercise" : "exercises"}, ${totalSets} sets` : ""}
        </div>
      </div>
      {s.seconds >= 900 && <Sparkles size={15} color={GOLD} style={{ flexShrink: 0, marginTop: 2 }} />}
    </div>
  );
}

/* ================================ GUIDE ============================ */
function GuideTab({ collection, sightings, byGroup, onOpen, onAddSighting, onEditSighting, onToggleFavorite, onToggleSightingFavorite }) {
  const [view, setView] = useState("rewards"); // rewards | sightings
  const [filter, setFilter] = useState("all");  // all | favorites | <group>
  const [sort, setSort] = useState("recent");   // recent | type | name
  const [sFilter, setSFilter] = useState("all"); // sightings filter
  const [sSort, setSSort] = useState("recent");  // sightings sort
  const groups = TAXA.filter((t) => byGroup[t] > 0);
  const favCount = collection.filter((c) => c.favorite).length;
  // Continents present in the collection, with counts
  const contCounts = {};
  collection.forEach((c) => { if (c.continent) contCounts[c.continent] = (contCounts[c.continent] || 0) + 1; });
  const continentsPresent = CONTINENTS.filter((c) => contCounts[c] > 0);

  let shown = collection.slice();
  if (filter === "favorites") shown = shown.filter((c) => c.favorite);
  else if (filter.startsWith("cont:")) { const c = filter.slice(5); shown = shown.filter((x) => x.continent === c); }
  else if (filter !== "all") shown = shown.filter((c) => c.group === filter);

  if (sort === "type") {
    const order = Object.fromEntries(TAXA.map((t, i) => [t, i]));
    shown.sort((a, b) => (order[a.group] - order[b.group]) || a.common.localeCompare(b.common));
  } else if (sort === "name") {
    shown.sort((a, b) => a.common.localeCompare(b.common));
  } // "recent" keeps newest-first (collection is already prepended)

  return (
    <div>
      <div style={{ display: "flex", gap: 6, background: CARD2, borderRadius: 10, padding: 4, margin: "8px 0 4px" }}>
        {[["rewards", `Earned (${collection.length})`], ["sightings", `Sightings (${sightings.length})`]].map(([id, lbl]) => (
          <button key={id} className="tap" onClick={() => setView(id)} style={{ flex: 1, border: "none", borderRadius: 7, padding: "9px", cursor: "pointer",
            fontWeight: 700, fontSize: 12.5, background: view === id ? SAGE : "transparent", color: view === id ? "#fff" : MUTE }}>{lbl}</button>
        ))}
      </div>

      {view === "rewards" && (
        <>
          <SectionLabel>Field Guide · {collection.length} species</SectionLabel>
          {collection.length === 0 ? (
            <Empty>Your guide is empty. Earn your first species by logging 15 minutes of movement.</Empty>
          ) : (
            <>
              <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 10 }}>
                <Chip active={filter === "all"} onClick={() => setFilter("all")}>All</Chip>
                <Chip active={filter === "favorites"} onClick={() => setFilter("favorites")}>★ Favorites{favCount ? ` ${favCount}` : ""}</Chip>
                {groups.map((g) => <Chip key={g} active={filter === g} onClick={() => setFilter(g)}>{TAXA_ICON[g]} {byGroup[g]}</Chip>)}
                {continentsPresent.map((c) => <Chip key={c} active={filter === `cont:${c}`} onClick={() => setFilter(`cont:${c}`)}>{CONTINENT_ICON[c]} {c} {contCounts[c]}</Chip>)}
              </div>
              <div style={{ display: "flex", gap: 6, background: CARD2, borderRadius: 10, padding: 4, marginBottom: 12 }}>
                {[["recent", "Recent"], ["type", "By type"], ["name", "A–Z"]].map(([id, lbl]) => (
                  <button key={id} className="tap" onClick={() => setSort(id)} style={{ flex: 1, border: "none", borderRadius: 7, padding: "8px", cursor: "pointer",
                    fontWeight: 700, fontSize: 12, background: sort === id ? SAGE : "transparent", color: sort === id ? "#fff" : MUTE }}>{lbl}</button>
                ))}
              </div>
              {shown.length === 0 ? (
                <Empty>No favorites yet. Tap the star on any species to add it here.</Empty>
              ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {shown.map((c) => (
                  <div key={c.id} className="tap" onClick={() => onOpen(c)} style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, overflow: "hidden", cursor: "pointer" }}>
                    <div style={{ position: "relative" }}>
                      <img src={c.img} alt={c.common} style={{ width: "100%", height: 120, objectFit: "cover", display: "block" }} />
                      <div style={{ position: "absolute", top: 6, right: 6, background: RARITY[c.rarity].color, color: "#fff", fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 6 }}>{"★".repeat(RARITY[c.rarity].stars)}</div>
                      <button onClick={(e) => { e.stopPropagation(); onToggleFavorite(c.id); }} aria-label="Favorite"
                        style={{ position: "absolute", top: 4, left: 4, background: "rgba(58,55,48,0.55)", border: "none", borderRadius: "50%", width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                        <Star size={16} color={c.favorite ? GOLD : "#fff"} fill={c.favorite ? GOLD : "none"} />
                      </button>
                      {c.photos?.length > 0 && (
                        <div style={{ position: "absolute", bottom: 6, left: 6, background: "rgba(58,55,48,0.8)", color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 6, display: "flex", alignItems: "center", gap: 3 }}>
                          <Camera size={10} /> {c.photos.length}
                        </div>
                      )}
                    </div>
                    <div style={{ padding: "9px 11px 11px" }}>
                      {c.nickname && <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 15, color: CLAY, lineHeight: 1.1 }}>"{c.nickname}"</div>}
                      <div style={{ fontWeight: 600, fontSize: 13.5, color: INK, lineHeight: 1.15, marginTop: c.nickname ? 2 : 0 }}>{c.common}</div>
                      <div style={{ fontStyle: "italic", fontSize: 11, color: MUTE }}>{c.sci}</div>
                    </div>
                  </div>
                ))}
              </div>
              )}
              <p style={{ textAlign: "center", color: MUTE, fontSize: 12, marginTop: 14, fontStyle: "italic", fontFamily: SERIF }}>Tap a card to open it · tap the star to favorite.</p>
            </>
          )}
        </>
      )}

      {view === "sightings" && (
        <>
          <SectionLabel>My Sightings · {sightings.length}</SectionLabel>
          <button className="tap" onClick={onAddSighting} style={{ ...btnOutline(), width: "100%", marginBottom: 14 }}>＋ Log a sighting</button>
          {sightings.length === 0 ? (
            <Empty>Spot an animal or plant on a walk? Log it here with your own photos — it becomes part of your shared guide.</Empty>
          ) : (() => {
            // Filter + sort sightings
            const sFavCount = sightings.filter((s) => s.favorite).length;
            const sGroups = TAXA.filter((t) => sightings.some((s) => s.group === t));
            let sShown = sightings.slice();
            if (sFilter === "favorites") sShown = sShown.filter((s) => s.favorite);
            else if (sFilter !== "all") sShown = sShown.filter((s) => s.group === sFilter);
            if (sSort === "type") {
              const order = Object.fromEntries(TAXA.map((t, i) => [t, i]));
              sShown.sort((a, b) => ((order[a.group] ?? 99) - (order[b.group] ?? 99)) || a.name.localeCompare(b.name));
            } else if (sSort === "name") sShown.sort((a, b) => a.name.localeCompare(b.name));
            return (
            <>
              <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 10 }}>
                <Chip active={sFilter === "all"} onClick={() => setSFilter("all")}>All</Chip>
                <Chip active={sFilter === "favorites"} onClick={() => setSFilter("favorites")}>★ Favorites{sFavCount ? ` ${sFavCount}` : ""}</Chip>
                {sGroups.map((g) => <Chip key={g} active={sFilter === g} onClick={() => setSFilter(g)}>{TAXA_ICON[g]} {sightings.filter((s) => s.group === g).length}</Chip>)}
              </div>
              <div style={{ display: "flex", gap: 6, background: CARD2, borderRadius: 10, padding: 4, marginBottom: 12 }}>
                {[["recent", "Recent"], ["type", "By type"], ["name", "A–Z"]].map(([id, lbl]) => (
                  <button key={id} className="tap" onClick={() => setSSort(id)} style={{ flex: 1, border: "none", borderRadius: 7, padding: "8px", cursor: "pointer",
                    fontWeight: 700, fontSize: 12, background: sSort === id ? SAGE : "transparent", color: sSort === id ? "#fff" : MUTE }}>{lbl}</button>
                ))}
              </div>
              {sShown.length === 0 ? (
                <Empty>No favorites yet. Tap the star on any sighting to add it here.</Empty>
              ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {sShown.map((s) => (
                <div key={s.id} className="tap" onClick={() => onEditSighting(s)} style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, overflow: "hidden", position: "relative", cursor: "pointer" }}>
                  <div style={{ position: "relative" }}>
                    {s.photos?.[0]
                      ? <img src={s.photos[0]} alt={s.name} style={{ width: "100%", height: 120, objectFit: "cover", display: "block" }} />
                      : <div style={{ width: "100%", height: 120, background: CARD2, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30 }}>{s.group ? TAXA_ICON[s.group] : "🔭"}</div>}
                    <button onClick={(e) => { e.stopPropagation(); onToggleSightingFavorite(s.id); }} aria-label="Favorite"
                      style={{ position: "absolute", top: 4, left: 4, background: "rgba(58,55,48,0.55)", border: "none", borderRadius: "50%", width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                      <Star size={16} color={s.favorite ? GOLD : "#fff"} fill={s.favorite ? GOLD : "none"} />
                    </button>
                    {s.photos?.length > 1 && <div style={{ position: "absolute", top: 6, right: 6, background: "rgba(58,55,48,0.8)", color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 6 }}>+{s.photos.length - 1}</div>}
                  </div>
                  <div style={{ padding: "9px 11px 11px" }}>
                    {s.nickname && <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 14, color: CLAY, lineHeight: 1.1 }}>"{s.nickname}"</div>}
                    <div style={{ fontWeight: 600, fontSize: 13.5, color: INK }}>{s.name}</div>
                    {s.sci && <div style={{ fontStyle: "italic", fontSize: 11, color: MUTE }}>{s.sci}</div>}
                    {s.group && <div style={{ fontSize: 11, color: SAGE_D, marginTop: 2, fontWeight: 600 }}>{TAXA_ICON[s.group]} {TAXA_LABEL[s.group]}</div>}
                    <div style={{ fontSize: 11, color: MUTE, marginTop: 2 }}>{fmtDate(s.date)}{s.place ? ` · ${s.place}` : ""}{s.country ? ` · ${s.country}` : ""}</div>
                    {s.note && <div style={{ fontSize: 11.5, color: MUTE, marginTop: 4, fontStyle: "italic" }}>{s.note}</div>}
                    <div style={{ fontSize: 11, color: SAGE_D, marginTop: 6, display: "flex", alignItems: "center", gap: 3, fontWeight: 600 }}>
                      <Pencil size={11} /> Tap to edit
                    </div>
                  </div>
                </div>
                ))}
              </div>
              )}
            </>
            );
          })()}
        </>
      )}
    </div>
  );
}

/* ================================ BADGES =========================== */
function BadgesTab({ earned }) {
  const earnedSet = new Set(earned);
  const got = (b) => earnedSet.has(b.id);

  // Split badges by category
  const groupBadges = BADGES.filter((b) => b.cat === "group");
  const distBadges = BADGES.filter((b) => b.cat === "distance");
  const actBadges = BADGES.filter((b) => b.cat === "activity");
  const contBadges = BADGES.filter((b) => b.cat === "continent");
  const otherBadges = BADGES.filter((b) => !b.cat);

  const card = (b) => (
    <div key={b.id} style={{ background: got(b) ? CARD : CARD2, border: `1px solid ${got(b) ? GOLD : LINE}`, borderRadius: 14, padding: "14px 10px", textAlign: "center", opacity: got(b) ? 1 : 0.5, boxShadow: got(b) ? "0 2px 8px rgba(214,164,69,0.18)" : "none" }}>
      <div style={{ fontSize: 28, filter: got(b) ? "none" : "grayscale(1)" }}>{b.icon}</div>
      <div style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 13.5, marginTop: 5, color: got(b) ? INK : MUTE, lineHeight: 1.15 }}>{b.label}</div>
      <div style={{ fontSize: 11, color: MUTE, marginTop: 2, lineHeight: 1.25 }}>{b.desc}</div>
      {got(b) && <div style={{ marginTop: 5, fontSize: 9.5, color: GOLD, fontWeight: 700, letterSpacing: 1 }}>EARNED</div>}
    </div>
  );

  // A compact progress row for a tiered set (group/activity), with a small dot per tier
  const TierRow = ({ icon, label, tiers }) => {
    const earnedCount = tiers.filter(got).length;
    const next = tiers.find((b) => !got(b));
    return (
      <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: "12px 14px", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 24 }}>{icon}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{label}</div>
            <div style={{ fontSize: 11.5, color: MUTE }}>
              {earnedCount}/{tiers.length} tiers{next ? ` · next: ${next.desc.replace(/^Collect |^Complete |^Travel /, "")}` : " · all done ✓"}
            </div>
          </div>
          <span style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 600, color: earnedCount ? GOLD : MUTE }}>{earnedCount}</span>
        </div>
        <div style={{ display: "flex", gap: 4, marginTop: 10, flexWrap: "wrap" }}>
          {tiers.map((b) => (
            <div key={b.id} title={b.label} style={{ width: 22, height: 22, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 9, fontWeight: 700, background: got(b) ? GOLD : CARD2, color: got(b) ? "#fff" : MUTE, border: `1px solid ${got(b) ? GOLD : LINE}` }}>
              {b.id.split("_").pop()}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div>
      <SectionLabel>Badges · {earned.length}/{BADGES.length}</SectionLabel>

      <div style={{ fontSize: 12, color: SAGE_D, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", margin: "4px 2px 10px" }}>Milestones</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
        {otherBadges.map(card)}
      </div>

      <div style={{ fontSize: 12, color: SAGE_D, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", margin: "4px 2px 10px" }}>Distance</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 18 }}>
        {distBadges.map(card)}
      </div>

      <div style={{ fontSize: 12, color: SAGE_D, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", margin: "4px 2px 10px" }}>Collection by group</div>
      {TAXA.map((g) => (
        <TierRow key={g} icon={TAXA_ICON[g]} label={GROUP_TITLE[g]} tiers={groupBadges.filter((b) => b.id.startsWith(`grp_${g}_`))} />
      ))}

      <div style={{ fontSize: 12, color: SAGE_D, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", margin: "18px 2px 10px" }}>Continents</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
        {contBadges.map(card)}
      </div>
    </div>
  );
}

/* ================================ TRENDS =========================== */
function WeekTooltip({ active, payload, metricLabel, metric }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 10, padding: "8px 11px", fontSize: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
      <div style={{ fontWeight: 700, color: INK }}>{d.range}</div>
      <div style={{ color: SAGE_D, marginTop: 2 }}>{compact(d[metric])} {metricLabel.toLowerCase()}</div>
    </div>
  );
}

function TrendsTab({ sessions, totalMiles, totalSec, onEdit }) {
  const [metric, setMetric] = useState("minutes");
  const [listFilter, setListFilter] = useState("all"); // activity-type filter for the workout list
  const [range, setRange] = useState("3M"); // 1M | 3M | 6M | 1Y | All
  const totalMin = Math.round(totalSec / 60);

  // Bucket sessions by week or month depending on range, so the x-axis never crowds.
  const chartData = useMemo(() => {
    const RANGE_DAYS = { "1M": 31, "3M": 92, "6M": 183, "1Y": 366, "All": Infinity };
    const cutoff = RANGE_DAYS[range];
    const now = new Date(); now.setHours(0, 0, 0, 0);
    // Long ranges aggregate by month; short ranges by week.
    const byMonth = range === "1Y" || range === "All";
    const map = {};
    sessions.forEach((s) => {
      const d = parseDate(s.date);
      if (cutoff !== Infinity && (now - d) / 86400000 > cutoff) return;
      let key, label, range2, sortKey;
      if (byMonth) {
        const m = new Date(d.getFullYear(), d.getMonth(), 1);
        sortKey = m.toISOString().slice(0, 7);
        key = sortKey;
        label = m.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
        range2 = m.toLocaleDateString("en-US", { month: "long", year: "numeric" });
      } else {
        const day = (d.getDay() + 6) % 7;
        const mon = new Date(d); mon.setDate(d.getDate() - day);
        sortKey = mon.toISOString().slice(0, 10);
        key = sortKey;
        label = fmtDate(sortKey);
        const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
        const fmt = (dt, wy) => dt.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(wy ? { year: "numeric" } : {}) });
        range2 = mon.getFullYear() === sun.getFullYear() ? `${fmt(mon, false)} – ${fmt(sun, true)}` : `${fmt(mon, true)} – ${fmt(sun, true)}`;
      }
      if (!map[key]) map[key] = { minutes: 0, miles: 0, count: 0, name: label, range: range2, sortKey };
      map[key].minutes += (s.seconds || 0) / 60; map[key].miles += s.miles || 0; map[key].count += 1;
    });
    return Object.values(map).sort((a, b) => a.sortKey.localeCompare(b.sortKey))
      .map((v) => ({ name: v.name, range: v.range, minutes: Math.round(v.minutes), miles: +v.miles.toFixed(1), count: v.count }));
  }, [sessions, range]);

  // Shared range filter (same windows as the chart selector)
  const inRange = useMemo(() => {
    const RANGE_DAYS = { "1M": 31, "3M": 92, "6M": 183, "1Y": 366, "All": Infinity };
    const cutoff = RANGE_DAYS[range];
    const now = new Date(); now.setHours(0, 0, 0, 0);
    return (s) => cutoff === Infinity || (now - parseDate(s.date)) / 86400000 <= cutoff;
  }, [range]);

  const byType = useMemo(() => {
    const m = {}; sessions.filter(inRange).forEach((s) => { m[s.type] = (m[s.type] || 0) + 1; });
    return EXERCISES.filter((e) => m[e.id]).map((e) => ({ id: e.id, name: e.label, value: m[e.id], icon: e.icon }));
  }, [sessions, inRange]);

  const metricLabel = { minutes: "Minutes", miles: "Miles", count: "Workouts" }[metric];
  const bucketLabel = (range === "1Y" || range === "All") ? "Monthly" : "Weekly";
  const usedTypes = useMemo(() => [...new Set(sessions.map((s) => s.type))], [sessions]);
  const listShown = listFilter === "all" ? sessions : sessions.filter((s) => s.type === listFilter);
  const manyPoints = chartData.length > 16; // hide dots when dense

  return (
    <div>
      <SectionLabel>Trends</SectionLabel>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {[["Total time", fmtBigTime(totalSec)], ["Distance", `${compact(+totalMiles.toFixed(1))} mi`], ["Workouts", compact(sessions.length)]].map(([k, v]) => (
          <div key={k} style={{ flex: 1, minWidth: 0, background: CARD, border: `1px solid ${LINE}`, borderRadius: 12, padding: "10px 6px", textAlign: "center" }}>
            <div style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 600, color: CLAY, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v}</div>
            <div style={{ fontSize: 10, color: MUTE }}>{k}</div>
          </div>
        ))}
      </div>
      {sessions.length === 0 ? <Empty>Log workouts to see your trends bloom here.</Empty> : (
        <>
          <div style={{ display: "flex", gap: 6, background: CARD2, borderRadius: 10, padding: 4, marginBottom: 12 }}>
            {[["minutes", "Minutes"], ["miles", "Miles"], ["count", "Workouts"]].map(([id, lbl]) => (
              <button key={id} className="tap" onClick={() => setMetric(id)} style={{ flex: 1, border: "none", borderRadius: 7, padding: "8px", cursor: "pointer", fontWeight: 700, fontSize: 12, background: metric === id ? SAGE : "transparent", color: metric === id ? "#fff" : MUTE }}>{lbl}</button>
            ))}
          </div>
          {/* Time-range selector keeps the x-axis readable as data grows */}
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            {["1M", "3M", "6M", "1Y", "All"].map((r) => (
              <button key={r} className="tap" onClick={() => setRange(r)} style={{ flex: 1, border: `1px solid ${range === r ? SAGE : LINE}`, borderRadius: 8, padding: "7px 0", cursor: "pointer", fontWeight: 700, fontSize: 12, background: range === r ? SAGE : CARD, color: range === r ? "#fff" : MUTE }}>{r}</button>
            ))}
          </div>
          <div style={card()}>
            <div style={{ fontSize: 12, color: MUTE, marginBottom: 8, fontWeight: 600 }}>{bucketLabel} {metricLabel.toLowerCase()}</div>
            {chartData.length === 0 ? (
              <div style={{ color: MUTE, fontStyle: "italic", textAlign: "center", padding: "30px 10px", fontFamily: SERIF }}>No activity in this range.</div>
            ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="fillMetric" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={SAGE} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={SAGE} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={LINE} vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: MUTE }} axisLine={{ stroke: LINE }} tickLine={false} minTickGap={28} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: MUTE }} axisLine={false} tickLine={false} width={34} tickFormatter={compact} />
                <Tooltip content={<WeekTooltip metricLabel={metricLabel} metric={metric} />} />
                <Area type="monotone" dataKey={metric} stroke={SAGE} strokeWidth={2.5} fill="url(#fillMetric)"
                  dot={manyPoints ? false : { r: 3, fill: SAGE, stroke: PAPER, strokeWidth: 1.5 }} activeDot={{ r: 5 }} connectNulls />
              </AreaChart>
            </ResponsiveContainer>
            )}
            <div style={{ fontSize: 11, color: MUTE, textAlign: "center", marginTop: 4, fontStyle: "italic" }}>Tap a point for its {bucketLabel === "Monthly" ? "month" : "week"} &amp; total.</div>
          </div>
          <div style={{ ...card(), marginTop: 12 }}>
            <div style={{ fontSize: 12, color: MUTE, marginBottom: 10, fontWeight: 600, display: "flex", justifyContent: "space-between" }}>
              <span>By activity</span>
              <span style={{ color: SAGE_D }}>{range === "All" ? "all time" : `last ${range}`}</span>
            </div>
            {byType.length === 0 ? (
              <div style={{ color: MUTE, fontStyle: "italic", fontSize: 13, fontFamily: SERIF }}>No activity in this range.</div>
            ) : byType.map((t) => {
              const max = Math.max(...byType.map((x) => x.value));
              return (
                <div key={t.name} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <span style={{ width: 96, fontSize: 13 }}>{t.icon} {t.name}</span>
                  <div style={{ flex: 1, height: 10, background: CARD2, borderRadius: 5, overflow: "hidden" }}>
                    <div style={{ width: `${(t.value / max) * 100}%`, height: "100%", background: CLAY, borderRadius: 5 }} />
                  </div>
                  <span style={{ fontSize: 12, color: MUTE, width: 26, textAlign: "right" }}>{compact(t.value)}</span>
                </div>
              );
            })}
          </div>

          <SectionLabel>All workouts</SectionLabel>
          {/* Activity-type filter for the workout list */}
          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 10 }}>
            <Chip active={listFilter === "all"} onClick={() => setListFilter("all")}>All</Chip>
            {EXERCISES.filter((e) => usedTypes.includes(e.id)).map((e) => (
              <Chip key={e.id} active={listFilter === e.id} onClick={() => setListFilter(e.id)}>{e.icon} {e.label}</Chip>
            ))}
          </div>
          {listShown.map((s) => {
            const isStr = s.type === "strength";
            const exs = isStr ? getExercises(s) : [];
            const named = exs.filter((e) => e.name);
            const title = isStr && named.length ? named.map((e) => e.name).join(", ") : exMeta(s.type).label;
            return (
            <div key={s.id} className="tap" onClick={() => onEdit(s)} style={{ display: "flex", alignItems: "flex-start", gap: 12, background: CARD, border: `1px solid ${LINE}`, borderRadius: 12, padding: "10px 14px", marginBottom: 8, cursor: "pointer" }}>
              <span style={{ fontSize: 20 }}>{exMeta(s.type).icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{title}</div>
                <div style={{ fontSize: 11.5, color: MUTE }}>
                  {fmtDate(s.date)} · {fmtDur(s.seconds)}{s.miles ? ` · ${s.miles} mi` : ""}
                  {isStr && exs.length ? ` · ${exs.length} ${exs.length === 1 ? "exercise" : "exercises"}, ${exTotalSets(s)} sets` : ""}
                </div>
              </div>
              <Pencil size={15} color={MUTE} style={{ flexShrink: 0, marginTop: 2 }} />
            </div>
          );})}
        </>
      )}
    </div>
  );
}

/* ================================ GOALS ============================ */
function GoalsTab({ goals, progressFn, onAdd, onEdit, onDelete }) {
  return (
    <div>
      <SectionLabel>Goals</SectionLabel>
      <p style={{ fontSize: 12.5, color: MUTE, margin: "0 2px 12px", fontStyle: "italic", fontFamily: SERIF }}>
        Complete a goal to earn a bonus species ✨
      </p>
      {goals.length === 0 ? (
        <Empty>Set a goal — exercise 3× a week, run 10 miles this week, walk 100 miles total, or train for an event.</Empty>
      ) : goals.map((g) => {
        const p = progressFn(g);
        const pct = Math.min(100, (p.value / p.target) * 100);
        const done = p.value >= p.target;
        return (
          <div key={g.id} className="tap" onClick={() => onEdit(g)} style={{ ...card(), marginBottom: 12, cursor: "pointer" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 600, fontStyle: "italic" }}>
                  {g.kind === "frequency" && `${g.target}× per week`}
                  {g.kind === "weekly_miles" && `${g.target} mi / week · ${exMeta(g.exType).label}`}
                  {g.kind === "distance" && `${g.target} mi total · ${exMeta(g.exType).label}`}
                  {g.kind === "single_distance" && `${g.target} mi in one ${exMeta(g.exType).label.toLowerCase()}`}
                  {g.kind === "event" && g.name}
                </div>
                <div style={{ fontSize: 12, color: MUTE }}>{g.kind === "event" && p.daysLeft != null ? `${p.daysLeft} days to go` : p.label}</div>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <Pencil size={15} color={MUTE} />
                <button className="tap" onClick={(e) => { e.stopPropagation(); onDelete(g.id); }} style={{ background: "none", border: "none", color: MUTE, cursor: "pointer", padding: 0 }}><Trash2 size={15} /></button>
              </div>
            </div>
            <div style={{ height: 10, background: CARD2, borderRadius: 5, overflow: "hidden", marginTop: 12 }}>
              <div style={{ width: `${pct}%`, height: "100%", background: done ? GOLD : SAGE, borderRadius: 5, transition: "width .6s ease" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 12, color: MUTE }}>
              <span>{compact(p.value)} / {compact(p.target)} {p.unit}{p.weekly ? " this week" : ""}</span>
              <span style={{ color: done ? GOLD : MUTE, fontWeight: done ? 700 : 400 }}>{done ? "✓ Complete" : `${Math.round(pct)}%`}</span>
            </div>
          </div>
        );
      })}
      <button className="tap" onClick={onAdd} style={{ ...btnOutline(), width: "100%", marginTop: 6 }}>＋ New goal</button>
    </div>
  );
}

/* ================================ MODALS =========================== */
function Modal({ title, onClose, children }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(58,55,48,0.45)", backdropFilter: "blur(3px)", zIndex: 50, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, background: PAPER, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: "18px 18px 28px", maxHeight: "90vh", overflowY: "auto", animation: "slideUp .25s ease both" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ fontFamily: SERIF, fontSize: 22, margin: 0, fontStyle: "italic" }}>{title}</h3>
          <button onClick={onClose} style={{ background: CARD2, border: "none", borderRadius: 8, padding: 6, cursor: "pointer", color: MUTE }}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function TimeInputs({ h, m, s, setH, setM, setS }) {
  return (
    <Field label="Duration">
      <div style={{ display: "flex", gap: 8 }}>
        {[["Hr", h, setH, 23], ["Min", m, setM, 59], ["Sec", s, setS, 59]].map(([lbl, val, set, max]) => (
          <div key={lbl} style={{ flex: 1 }}>
            <input type="number" inputMode="numeric" min="0" max={max} value={val} onChange={(e) => set(e.target.value)} placeholder="0" style={{ ...inputStyle, textAlign: "center" }} />
            <div style={{ textAlign: "center", fontSize: 10.5, color: MUTE, marginTop: 3, letterSpacing: 0.5 }}>{lbl}</div>
          </div>
        ))}
      </div>
    </Field>
  );
}

function SetsEditor({ sets, setSets }) {
  const update = (i, j, val) => { const next = sets.map((row, ri) => ri === i ? row.map((c, ci) => ci === j ? val : c) : row); setSets(next); };
  const addRow = () => setSets([...sets, sets.length ? [...sets[sets.length - 1]] : ["", ""]]);
  const removeRow = (i) => setSets(sets.filter((_, ri) => ri !== i));
  return (
    <Field label="Sets (weight × reps)">
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {sets.map((row, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: MUTE, width: 20 }}>{i + 1}</span>
            <input type="number" inputMode="decimal" value={row[0]} onChange={(e) => update(i, 0, e.target.value)} placeholder="lbs" style={{ ...inputStyle, textAlign: "center" }} />
            <span style={{ color: MUTE }}>×</span>
            <input type="number" inputMode="numeric" value={row[1]} onChange={(e) => update(i, 1, e.target.value)} placeholder="reps" style={{ ...inputStyle, textAlign: "center" }} />
            <button onClick={() => removeRow(i)} style={{ background: "none", border: "none", color: MUTE, cursor: "pointer", padding: 4 }}><X size={16} /></button>
          </div>
        ))}
      </div>
      <button className="tap" onClick={addRow} style={{ ...btnOutline(), width: "100%", marginTop: 8, padding: "10px" }}>＋ Add set</button>
    </Field>
  );
}

// A full strength session: a list of exercises, each with name + muscle + sets.
// The whole thing is ONE workout (counts once toward badges/streaks).
function StrengthEditor({ exercises, setExercises }) {
  const updateEx = (i, patch) => setExercises(exercises.map((ex, ri) => ri === i ? { ...ex, ...patch } : ex));
  const addEx = () => setExercises([...exercises, { name: "", muscle: "Legs", sets: [["", ""]] }]);
  const removeEx = (i) => setExercises(exercises.filter((_, ri) => ri !== i));
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, color: MUTE, letterSpacing: 0.5, textTransform: "uppercase", fontWeight: 600, marginBottom: 8 }}>Exercises</div>
      {exercises.map((ex, i) => (
        <div key={i} style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: "12px 12px 6px", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 15, color: SAGE_D }}>Exercise {i + 1}</span>
            {exercises.length > 1 && <button onClick={() => removeEx(i)} style={{ background: "none", border: "none", color: MUTE, cursor: "pointer", display: "flex", alignItems: "center", gap: 3, fontSize: 12 }}><Trash2 size={13} /> Remove</button>}
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <input value={ex.name} onChange={(e) => updateEx(i, { name: e.target.value })} placeholder="e.g. Leg Press" style={{ ...inputStyle, flex: 1.4 }} />
            <select value={ex.muscle} onChange={(e) => updateEx(i, { muscle: e.target.value })} style={{ ...inputStyle, flex: 1 }}>
              {MUSCLE_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <SetsEditor sets={ex.sets} setSets={(next) => updateEx(i, { sets: typeof next === "function" ? next(ex.sets) : next })} />
        </div>
      ))}
      <button className="tap" onClick={addEx} style={{ ...btn(SAGE), width: "100%" }}>＋ Add another exercise</button>
    </div>
  );
}

function LogModal({ onClose, onSave, todayRewarded, lastUsed }) {
  const [type, setType] = useState("run");
  const [h, setH] = useState(""); const [m, setM] = useState(""); const [s, setS] = useState("");
  const [miles, setMiles] = useState("");
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState("");
  const [exercises, setExercises] = useState([{ name: "", muscle: "Legs", sets: [["", ""]] }]);
  const isStrength = type === "strength";
  const hasDist = exMeta(type).distance;

  // Auto-populate time/distance (and last strength exercise list) from the last session of this type.
  useEffect(() => {
    const lu = lastUsed?.[type];
    if (lu) {
      setH(lu.h || ""); setM(lu.m || ""); setS(lu.s || ""); setMiles(lu.miles || "");
      if (type === "strength" && Array.isArray(lu.exercises) && lu.exercises.length) {
        setExercises(lu.exercises.map((ex) => ({ name: ex.name || "", muscle: ex.muscle || "Legs", sets: (ex.sets && ex.sets.length ? ex.sets.map((r) => [r[0], r[1]]) : [["", ""]]) })));
      } else if (type === "strength") {
        setExercises([{ name: "", muscle: "Legs", sets: [["", ""]] }]);
      }
    } else { setH(""); setM(""); setS(""); setMiles(""); setExercises([{ name: "", muscle: "Legs", sets: [["", ""]] }]); }
  }, [type]); // eslint-disable-line

  const totalMin = ((Number(h) || 0) * 60) + (Number(m) || 0) + ((Number(s) || 0) / 60);
  const valid = totalMin > 0;
  const willReward = totalMin >= 15 && date === todayStr() && !todayRewarded;

  function submit() {
    const cleanExercises = isStrength
      ? exercises
          .map((ex) => ({ name: ex.name.trim(), muscle: ex.muscle, sets: ex.sets.map((r) => [Number(r[0]) || 0, Number(r[1]) || 0]).filter((r) => r[0] || r[1]) }))
          .filter((ex) => ex.name || ex.sets.length)
      : null;
    onSave({ type, h, m, s, miles, date, note, exercises: cleanExercises });
  }

  return (
    <Modal title="Log a workout" onClose={onClose}>
      <Field label="Activity">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 7 }}>
          {EXERCISES.map((e) => (
            <button key={e.id} className="tap" onClick={() => setType(e.id)} style={{ background: type === e.id ? SAGE : CARD, color: type === e.id ? "#fff" : INK, border: `1px solid ${type === e.id ? SAGE : LINE}`, borderRadius: 11, padding: "10px 2px", cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: SANS, lineHeight: 1.15 }}>
              <div style={{ fontSize: 19 }}>{e.icon}</div>{e.label}
            </button>
          ))}
        </div>
      </Field>
      {lastUsed?.[type] && <div style={{ fontSize: 11.5, color: SAGE_D, margin: "-6px 2px 10px", fontStyle: "italic" }}>Pre-filled from your last {exMeta(type).label.toLowerCase()} — edit as needed.</div>}
      {isStrength && <div style={{ fontSize: 11.5, color: MUTE, margin: "0 2px 10px", fontStyle: "italic" }}>Add every exercise from this session below — it all counts as one workout.</div>}
      <TimeInputs h={h} m={m} s={s} setH={setH} setM={setM} setS={setS} />
      {hasDist && <Field label="Miles (optional)"><input type="number" inputMode="decimal" value={miles} onChange={(e) => setMiles(e.target.value)} placeholder="3.1" style={inputStyle} /></Field>}
      {isStrength && <StrengthEditor exercises={exercises} setExercises={setExercises} />}
      <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} /></Field>
      <Field label="Note (optional)"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Morning loop by the river" style={inputStyle} /></Field>
      {valid && totalMin < 15 && <div style={{ fontSize: 12, color: CLAY, marginBottom: 8 }}>ⓘ 15+ minutes earns a species. This one will still be logged.</div>}
      {totalMin >= 15 && todayRewarded && date === todayStr() && <div style={{ fontSize: 12, color: MUTE, marginBottom: 8 }}>ⓘ You've already earned today's species — this still counts toward streaks & goals.</div>}
      <button className="tap" disabled={!valid} onClick={submit} style={{ ...btn(SAGE), width: "100%", opacity: valid ? 1 : 0.5 }}>{willReward ? "Log & discover ✨" : "Log workout"}</button>
    </Modal>
  );
}

function EditModal({ session, onClose, onSave, onDelete }) {
  const init = session.seconds || 0;
  const [h, setH] = useState(Math.floor(init / 3600) || "");
  const [m, setM] = useState(Math.floor((init % 3600) / 60) || "");
  const [s, setS] = useState(init % 60 || "");
  const [miles, setMiles] = useState(session.miles || "");
  const [date, setDate] = useState(session.date);
  const [note, setNote] = useState(session.note || "");
  const isStrength = session.type === "strength";
  const [exercises, setExercises] = useState(() => {
    const ex = getExercises(session);
    return ex.length ? ex.map((e) => ({ name: e.name || "", muscle: e.muscle || "Legs", sets: (e.sets && e.sets.length ? e.sets.map((r) => [r[0], r[1]]) : [["", ""]]) }))
      : [{ name: "", muscle: "Legs", sets: [["", ""]] }];
  });
  const hasDist = exMeta(session.type).distance;
  function submit() {
    const seconds = (Number(h) || 0) * 3600 + (Number(m) || 0) * 60 + (Number(s) || 0);
    const cleanExercises = isStrength
      ? exercises.map((ex) => ({ name: ex.name.trim(), muscle: ex.muscle, sets: ex.sets.map((r) => [Number(r[0]) || 0, Number(r[1]) || 0]).filter((r) => r[0] || r[1]) })).filter((ex) => ex.name || ex.sets.length)
      : null;
    // Clear any legacy single-exercise fields so they don't shadow the new array
    onSave({ seconds, miles: miles ? Number(miles) : null, date, note, exercises: cleanExercises, exercise: null, muscle: null, sets: null });
  }
  return (
    <Modal title={`Edit ${exMeta(session.type).label}`} onClose={onClose}>
      <TimeInputs h={h} m={m} s={s} setH={setH} setM={setM} setS={setS} />
      {hasDist && <Field label="Miles"><input type="number" value={miles} onChange={(e) => setMiles(e.target.value)} style={inputStyle} /></Field>}
      {isStrength && <StrengthEditor exercises={exercises} setExercises={setExercises} />}
      <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} /></Field>
      <Field label="Note"><input value={note} onChange={(e) => setNote(e.target.value)} style={inputStyle} /></Field>
      <div style={{ display: "flex", gap: 10 }}>
        <button className="tap" onClick={submit} style={{ ...btn(SAGE), flex: 2 }}>Save changes</button>
        <button className="tap" onClick={onDelete} style={{ ...btn("#c0533f"), flex: 1 }}>Delete</button>
      </div>
    </Modal>
  );
}

function GoalModal({ goal, onClose, onSave, onDelete }) {
  const editing = !!goal;
  const [kind, setKind] = useState(goal?.kind || "frequency");
  const [target, setTarget] = useState(goal ? String(goal.target ?? "") : "3");
  const [exType, setExType] = useState(goal?.exType || "any");
  const [name, setName] = useState(goal?.name || "");
  const [date, setDate] = useState(goal?.date || "");
  function submit() {
    if (kind === "frequency") onSave({ kind, target: Number(target) });
    else if (kind === "weekly_miles") onSave({ kind, target: Number(target), exType });
    else if (kind === "distance") onSave({ kind, target: Number(target), exType });
    else if (kind === "single_distance") onSave({ kind, target: Number(target), exType });
    else { const days = Math.max(1, Math.ceil((parseDate(date) - new Date()) / 86400000)); onSave({ kind, name: name || "My event", date, totalDays: days }); }
  }
  const milesKind = kind === "weekly_miles" || kind === "distance" || kind === "single_distance";
  const milesLabel = kind === "weekly_miles" ? "Miles per week"
    : kind === "single_distance" ? "Miles in one workout" : "Total target miles";
  return (
    <Modal title={editing ? "Edit goal" : "New goal"} onClose={onClose}>
      <Field label="Goal type">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {[["frequency", "Weekly count"], ["weekly_miles", "Weekly miles"], ["distance", "Total distance"], ["single_distance", "Single-workout distance"], ["event", "Event"]].map(([id, lbl]) => (
            <button key={id} className="tap" onClick={() => setKind(id)} style={{ border: `1px solid ${kind === id ? SAGE : LINE}`, borderRadius: 10, padding: "10px", background: kind === id ? SAGE : CARD, color: kind === id ? "#fff" : INK, cursor: "pointer", fontWeight: 600, fontSize: 12.5 }}>{lbl}</button>
          ))}
        </div>
      </Field>
      {kind === "frequency" && <Field label="Workouts per week"><input type="number" value={target} onChange={(e) => setTarget(e.target.value)} style={inputStyle} /></Field>}
      {milesKind && (
        <>
          <Field label={milesLabel}><input type="number" value={target} onChange={(e) => setTarget(e.target.value)} placeholder={kind === "weekly_miles" ? "10" : kind === "single_distance" ? "13.1" : "100"} style={inputStyle} /></Field>
          <Field label="Activity">
            <select value={exType} onChange={(e) => setExType(e.target.value)} style={inputStyle}>
              <option value="any">Any distance activity</option>
              {EXERCISES.filter((e) => e.distance).map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
            </select>
          </Field>
        </>
      )}
      {kind === "event" && (
        <>
          <Field label="Event name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Spring 10K" style={inputStyle} /></Field>
          <Field label="Event date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} /></Field>
        </>
      )}
      {(kind === "frequency" || kind === "weekly_miles") && (
        <div style={{ fontSize: 11.5, color: MUTE, marginBottom: 10, fontStyle: "italic" }}>Weekly goals reset every Monday.</div>
      )}
      <div style={{ display: "flex", gap: 10 }}>
        <button className="tap" onClick={submit} style={{ ...btn(SAGE), flex: 2 }}>{editing ? "Save changes" : "Create goal"}</button>
        {editing && <button className="tap" onClick={onDelete} style={{ ...btn("#c0533f"), flex: 1 }}>Delete</button>}
      </div>
    </Modal>
  );
}

function SightingModal({ sighting, onClose, onSave, onDelete }) {
  const editing = !!sighting;
  const [name, setName] = useState(sighting?.name || "");
  const [nickname, setNickname] = useState(sighting?.nickname || "");
  const [sci, setSci] = useState(sighting?.sci || "");
  const [group, setGroup] = useState(sighting?.group || "");
  const [country, setCountry] = useState(sighting?.country || "");
  const [date, setDate] = useState(sighting?.date || todayStr());
  const [place, setPlace] = useState(sighting?.place || "");
  const [note, setNote] = useState(sighting?.note || "");
  const [photos, setPhotos] = useState(sighting?.photos || []);
  const [favorite, setFavorite] = useState(!!sighting?.favorite);
  const fileRef = useRef(null);
  async function onFiles(e) {
    const files = Array.from(e.target.files || []);
    const urls = await Promise.all(files.map(fileToDataURL));
    setPhotos((p) => [...p, ...urls]);
  }
  return (
    <Modal title={editing ? "Edit sighting" : "Log a sighting"} onClose={onClose}>
      <Field label="What did you see? (common name)"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Great blue heron" style={inputStyle} autoFocus /></Field>
      <div style={{ display: "flex", gap: 10 }}>
        <Field label="Nickname (optional)" flex><input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="Big Blue" style={inputStyle} /></Field>
        <Field label="Scientific name (optional)" flex><input value={sci} onChange={(e) => setSci(e.target.value)} placeholder="Ardea herodias" style={{ ...inputStyle, fontStyle: "italic" }} /></Field>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <Field label="Type (optional)" flex>
          <select value={group} onChange={(e) => setGroup(e.target.value)} style={inputStyle}>
            <option value="">— Choose —</option>
            {TAXA.map((t) => <option key={t} value={t}>{TAXA_ICON[t]} {TAXA_LABEL[t]}</option>)}
          </select>
        </Field>
        <Field label="Country (optional)" flex><input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="USA" style={inputStyle} /></Field>
      </div>
      <Field label="Photos (you can add several)">
        <input ref={fileRef} type="file" accept="image/*" multiple onChange={onFiles} style={{ display: "none" }} />
        <button className="tap" onClick={() => fileRef.current?.click()} style={{ ...btnOutline(), width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <Camera size={18} /> Add photos
        </button>
        {photos.length > 0 && (
          <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
            {photos.map((p, i) => (
              <div key={i} style={{ position: "relative" }}>
                <img src={p} alt="" style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 8 }} />
                <button onClick={() => setPhotos(photos.filter((_, j) => j !== i))} style={{ position: "absolute", top: -6, right: -6, background: CLAY, color: "#fff", border: "none", borderRadius: "50%", width: 20, height: 20, cursor: "pointer", fontSize: 12, lineHeight: 1 }}>×</button>
              </div>
            ))}
          </div>
        )}
      </Field>
      <div style={{ display: "flex", gap: 10 }}>
        <Field label="Date" flex><input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} /></Field>
        <Field label="Place (optional)" flex><input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="River trail" style={inputStyle} /></Field>
      </div>
      <Field label="Note (optional)"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Standing in the shallows at dusk" style={inputStyle} /></Field>
      <button className="tap" onClick={() => setFavorite((f) => !f)} style={{ ...btnOutline(), width: "100%", marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: favorite ? GOLD : MUTE, borderColor: favorite ? GOLD : LINE }}>
        <Star size={18} color={favorite ? GOLD : MUTE} fill={favorite ? GOLD : "none"} /> {favorite ? "Favorited" : "Mark as favorite"}
      </button>
      <div style={{ display: "flex", gap: 10 }}>
        <button className="tap" disabled={!name.trim()} onClick={() => onSave({ name: name.trim(), nickname: nickname.trim(), sci: sci.trim(), group, country: country.trim(), date, place, note, photos, favorite })} style={{ ...btn(SAGE), flex: 2, opacity: name.trim() ? 1 : 0.5 }}>{editing ? "Save changes" : "Save sighting"}</button>
        {editing && <button className="tap" onClick={onDelete} style={{ ...btn("#c0533f"), flex: 1 }}>Delete</button>}
      </div>
    </Modal>
  );
}

function SpeciesModal({ item, onClose, onName, onEdit, onAddPhotos, onToggleFavorite }) {
  const fileRef = useRef(null);
  async function onFiles(e) {
    const files = Array.from(e.target.files || []);
    const urls = await Promise.all(files.map(fileToDataURL));
    if (urls.length) onAddPhotos(item.id, urls);
  }
  return (
    <Modal title={item.nickname || item.common} onClose={onClose}>
      <div style={{ position: "relative" }}>
        <img src={item.img} alt={item.common} style={{ width: "100%", height: 220, objectFit: "cover", borderRadius: 14 }} />
        <button onClick={() => onToggleFavorite(item.id)} aria-label="Favorite"
          style={{ position: "absolute", top: 10, left: 10, background: "rgba(58,55,48,0.55)", border: "none", borderRadius: "50%", width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <Star size={20} color={item.favorite ? GOLD : "#fff"} fill={item.favorite ? GOLD : "none"} />
        </button>
      </div>
      <div style={{ marginTop: 12 }}>
        <span style={{ background: RARITY[item.rarity].color, color: "#fff", fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 6 }}>{"★".repeat(RARITY[item.rarity].stars)} {RARITY[item.rarity].label}</span>
        <span style={{ marginLeft: 8, fontSize: 12, color: SAGE_D, fontWeight: 700 }}>{TAXA_ICON[item.group]} {TAXA_LABEL[item.group]}</span>
      </div>
      <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 600, marginTop: 8 }}>{item.common}</div>
      <div style={{ fontStyle: "italic", color: MUTE, fontFamily: SERIF }}>{item.sci}</div>
      {item.nickname && <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 16, color: CLAY, marginTop: 4 }}>"{item.nickname}"</div>}
      {item.fact && <FactBlock fact={item.fact} url={item.factUrl} />}
      {(item.place || item.continent) && <div style={{ fontSize: 12, color: MUTE, marginTop: 10, display: "flex", alignItems: "center", gap: 5 }}><MapPin size={13} /> {item.place}{item.place && item.continent ? " · " : ""}{item.continent ? `${CONTINENT_ICON[item.continent] || ""} ${item.continent}` : ""}</div>}

      <div style={{ marginTop: 14, fontSize: 12, color: MUTE, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }}>Your photos</div>
      <input ref={fileRef} type="file" accept="image/*" multiple onChange={onFiles} style={{ display: "none" }} />
      {item.photos?.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          {item.photos.map((p, i) => <img key={i} src={p} alt="" style={{ width: 76, height: 76, objectFit: "cover", borderRadius: 10 }} />)}
        </div>
      )}
      <p style={{ fontSize: 12, color: MUTE, marginTop: 6, fontStyle: "italic" }}>
        Spotted this one in the wild yourself? Add your own photos to its page.
      </p>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button className="tap" onClick={() => fileRef.current?.click()} style={{ ...btnOutline(), flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><Camera size={16} /> Photos</button>
        <button className="tap" onClick={onName} style={{ ...btnOutline(), flex: 1 }}>Rename</button>
        <button className="tap" onClick={onEdit} style={{ ...btn(SAGE), flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><Pencil size={15} /> Edit</button>
      </div>
    </Modal>
  );
}

function SpeciesEditModal({ item, onClose, onSave }) {
  const [common, setCommon] = useState(item.common || "");
  const [sci, setSci] = useState(item.sci || "");
  const [group, setGroup] = useState(item.group || "Mammalia");
  const [fact, setFact] = useState(item.fact || "");
  const [factUrl, setFactUrl] = useState(item.factUrl || "");
  return (
    <Modal title="Edit species card" onClose={onClose}>
      <p style={{ fontSize: 12.5, color: MUTE, marginTop: -6, marginBottom: 14, fontStyle: "italic" }}>
        Correct anything that looks wrong — name, classification, fact, or source link.
      </p>
      <Field label="Common name"><input value={common} onChange={(e) => setCommon(e.target.value)} style={inputStyle} /></Field>
      <Field label="Scientific name"><input value={sci} onChange={(e) => setSci(e.target.value)} style={{ ...inputStyle, fontStyle: "italic" }} /></Field>
      <Field label="Group">
        <select value={group} onChange={(e) => setGroup(e.target.value)} style={inputStyle}>
          {TAXA.map((t) => <option key={t} value={t}>{TAXA_ICON[t]} {TAXA_LABEL[t]}</option>)}
        </select>
      </Field>
      <Field label="Fun fact"><textarea value={fact} onChange={(e) => setFact(e.target.value)} style={{ ...inputStyle, height: 80, resize: "vertical" }} /></Field>
      <Field label="Source / fact-check link"><input value={factUrl} onChange={(e) => setFactUrl(e.target.value)} placeholder="https://en.wikipedia.org/wiki/..." style={inputStyle} /></Field>
      <button className="tap" disabled={!common.trim()} onClick={() => onSave({ common: common.trim(), sci: sci.trim(), group, fact: fact.trim(), factUrl: factUrl.trim() })} style={{ ...btn(SAGE), width: "100%", opacity: common.trim() ? 1 : 0.5 }}>Save changes</button>
    </Modal>
  );
}

function ProfileSwitcher({ profiles, activeProfile, onSwitch, onClose, onManage }) {
  return (
    <Modal title="Switch profile" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {profiles.map((p) => (
          <button key={p.id} className="tap" onClick={() => onSwitch(p.id)} style={{
            display: "flex", alignItems: "center", gap: 12, background: p.id === activeProfile ? SAGE : CARD,
            color: p.id === activeProfile ? "#fff" : INK, border: `1px solid ${p.id === activeProfile ? SAGE : LINE}`,
            borderRadius: 14, padding: "14px 16px", cursor: "pointer", fontFamily: SANS, fontWeight: 600, fontSize: 16 }}>
            <span style={{ fontSize: 26 }}>{p.emoji}</span>
            <span style={{ flex: 1, textAlign: "left" }}>{p.name}</span>
            {p.id === activeProfile && <span style={{ fontSize: 12, fontWeight: 700 }}>Active</span>}
          </button>
        ))}
      </div>
      <button className="tap" onClick={onManage} style={{ ...btnOutline(), width: "100%", marginTop: 14 }}>Manage profiles</button>
    </Modal>
  );
}

function NameModal({ item, onClose, onSave }) {
  const [name, setName] = useState(item.nickname || "");
  return (
    <Modal title="Name your companion" onClose={onClose}>
      <img src={item.img} alt={item.common} style={{ width: "100%", height: 180, objectFit: "cover", borderRadius: 14, marginBottom: 12 }} />
      <div style={{ textAlign: "center", marginBottom: 12 }}>
        <div style={{ fontWeight: 600 }}>{item.common}</div>
        <div style={{ fontStyle: "italic", fontSize: 12, color: MUTE, fontFamily: SERIF }}>{item.sci}</div>
      </div>
      <Field label="Nickname"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sir Hops-a-lot" style={inputStyle} autoFocus /></Field>
      <button className="tap" onClick={() => onSave(name)} style={{ ...btn(SAGE), width: "100%" }}>Save name</button>
    </Modal>
  );
}

function BadgePopup({ badges, onClose }) {
  const list = Array.isArray(badges) ? badges : [badges];
  const multi = list.length > 1;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(58,55,48,0.5)", backdropFilter: "blur(4px)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 30 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: PAPER, borderRadius: 22, padding: "28px 24px", textAlign: "center", maxWidth: 340, width: "100%", maxHeight: "82vh", overflowY: "auto", animation: "floatBadge .5s cubic-bezier(.2,.8,.3,1.3) both", border: `2px solid ${GOLD}` }}>
        <div style={{ fontSize: 13, color: GOLD, letterSpacing: 3, fontWeight: 700, textTransform: "uppercase" }}>
          {multi ? `${list.length} badges earned` : "Badge earned"}
        </div>

        {!multi ? (
          <>
            <div style={{ fontSize: 64, margin: "12px 0" }}>{list[0].icon}</div>
            <div style={{ fontFamily: SERIF, fontSize: 24, fontWeight: 600, fontStyle: "italic" }}>{list[0].label}</div>
            <div style={{ color: MUTE, fontSize: 13.5, marginTop: 4 }}>{list[0].desc}</div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 40, margin: "8px 0 4px" }}>🎉</div>
            <div style={{ fontFamily: SERIF, fontSize: 19, fontWeight: 600, fontStyle: "italic", marginBottom: 4 }}>
              You unlocked {list.length} badges at once!
            </div>
            <div style={{ color: MUTE, fontSize: 13, marginBottom: 14 }}>
              {list.map((b) => b.label).join(", ")}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, textAlign: "left" }}>
              {list.map((b) => (
                <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 12, background: CARD, border: `1px solid ${GOLD}`, borderRadius: 12, padding: "10px 12px" }}>
                  <span style={{ fontSize: 28 }}>{b.icon}</span>
                  <div>
                    <div style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 15 }}>{b.label}</div>
                    <div style={{ fontSize: 11.5, color: MUTE }}>{b.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <button className="tap" onClick={onClose} style={{ ...btn(GOLD), marginTop: 18, width: "100%" }}>Wonderful!</button>
      </div>
    </div>
  );
}

function GoalDonePopup({ onClose, onClaim, todayRewarded }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(58,55,48,0.5)", backdropFilter: "blur(4px)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 30 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: PAPER, borderRadius: 22, padding: "30px 26px", textAlign: "center", maxWidth: 330, animation: "floatBadge .5s cubic-bezier(.2,.8,.3,1.3) both", border: `2px solid ${GOLD}` }}>
        <div style={{ fontSize: 13, color: GOLD, letterSpacing: 3, fontWeight: 700, textTransform: "uppercase" }}>Goal complete</div>
        <div style={{ fontSize: 64, margin: "12px 0" }}>🎯</div>
        <div style={{ fontFamily: SERIF, fontSize: 23, fontWeight: 600, fontStyle: "italic" }}>You did it!</div>
        <div style={{ color: MUTE, fontSize: 13.5, marginTop: 4 }}>Claim a bonus Rare species as your reward.</div>
        <button className="tap" onClick={onClaim} style={{ ...btn(GOLD), marginTop: 18, width: "100%" }}>Claim reward ✨</button>
        <button className="tap" onClick={onClose} style={{ ...btnOutline(), marginTop: 8, width: "100%" }}>Later</button>
      </div>
    </div>
  );
}

function SettingsModal({ onClose, onExport, onImport, counts, profiles, activeProfile, onSwitch, onSaveProfiles, onDeleteProfile }) {
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const [newName, setNewName] = useState("");
  const [newEmoji, setNewEmoji] = useState("🦊");
  const [code, setCode] = useState(getHousehold() || "");
  const [synced, setSynced] = useState(hasHousehold());
  const [syncMsg, setSyncMsg] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null); // profile id awaiting confirmation
  const fileRef = useRef(null);
  const EMOJIS = ["🦊", "🌿", "🦋", "🐦", "🐢", "🍄", "🐝", "🦌", "🌻", "🐳", "🦅", "🐙"];
  async function onFile(e) {
    const f = e.target.files?.[0]; if (!f) return;
    const t = await f.text();
    setText(t);
    setMsg(onImport(t) ? "Restored ✓" : "Couldn't read that file.");
  }
  async function connectSync() {
    if (code.trim().length < 6) { setSyncMsg("Use at least 6 characters."); return; }
    setSyncMsg("Connecting…");
    setHousehold(code.trim());
    const ok = await pullFromCloud();
    setSynced(true);
    setSyncMsg(ok ? "Synced ✓ Reloading…" : "Connected. Reloading…");
    setTimeout(() => window.location.reload(), 800);
  }
  function disconnectSync() {
    clearHousehold(); setSynced(false); setSyncMsg("Disconnected. This device is now local-only.");
  }
  function addProfile() {
    if (!newName.trim()) return;
    const p = { id: "p" + Date.now(), name: newName.trim(), emoji: newEmoji };
    onSaveProfiles([...profiles, p]);
    setNewName("");
  }
  function renameProfile(id, name) { onSaveProfiles(profiles.map((p) => (p.id === id ? { ...p, name } : p))); }
  return (
    <Modal title="Settings" onClose={onClose}>
      {/* ── Cloud sync ── */}
      <div style={{ fontSize: 12, color: SAGE_D, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", margin: "0 2px 10px" }}>Cloud sync &amp; backup</div>
      <div style={{ background: CARD, border: `1px solid ${synced ? SAGE : LINE}`, borderRadius: 14, padding: 14, marginBottom: 18 }}>
        {synced ? (
          <>
            <div style={{ fontSize: 13, color: INK, marginBottom: 4 }}>☁️ Synced to household <b>{code}</b></div>
            <div style={{ fontSize: 11.5, color: MUTE, marginBottom: 10, lineHeight: 1.5 }}>Your data is backed up to the cloud and shared with anyone using this same code. It survives clearing your browser and syncs across your devices.</div>
            <button className="tap" onClick={disconnectSync} style={{ ...btnOutline(), width: "100%" }}>Disconnect this device</button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 11.5, color: MUTE, marginBottom: 10, lineHeight: 1.5 }}>Enter a shared household code on both phones to sync data and back it up to the cloud. Pick something long and private — treat it like a password.</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. otter-river-4821" style={inputStyle} />
              <button className="tap" onClick={connectSync} style={{ ...btn(SAGE), whiteSpace: "nowrap" }}>Connect</button>
            </div>
          </>
        )}
        {syncMsg && <div style={{ fontSize: 12, color: syncMsg.includes("✓") || syncMsg.includes("Synced") ? SAGE_D : CLAY, marginTop: 8 }}>{syncMsg}</div>}
      </div>

      {/* ── Profiles ── */}
      <div style={{ fontSize: 12, color: SAGE_D, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", margin: "0 2px 10px" }}>Profiles</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
        {profiles.map((p) => (
          <div key={p.id} style={{ background: CARD, border: `1px solid ${p.id === activeProfile ? SAGE : LINE}`, borderRadius: 12, padding: "8px 10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 22 }}>{p.emoji}</span>
              <input value={p.name} onChange={(e) => renameProfile(p.id, e.target.value)} style={{ ...inputStyle, flex: 1, padding: "8px 10px" }} />
              {p.id === activeProfile
                ? <span style={{ fontSize: 11, color: SAGE_D, fontWeight: 700 }}>Active</span>
                : <button className="tap" onClick={() => onSwitch(p.id)} style={{ ...btnOutline(), padding: "6px 10px", fontSize: 12 }}>Use</button>}
              {profiles.length > 1 && <button onClick={() => setConfirmDelete(confirmDelete === p.id ? null : p.id)} style={{ background: "none", border: "none", color: confirmDelete === p.id ? CLAY : MUTE, cursor: "pointer" }}><Trash2 size={15} /></button>}
            </div>
            {confirmDelete === p.id && (
              <div style={{ marginTop: 10, padding: "10px 12px", background: "#f7ece6", border: `1px solid ${CLAY}`, borderRadius: 10 }}>
                <div style={{ fontSize: 12.5, color: INK, marginBottom: 10, lineHeight: 1.5 }}>
                  Delete <b>{p.name}</b> and <b>permanently erase</b> all of its workouts, field guide, badges, and goals? This can't be undone.
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="tap" onClick={() => { onDeleteProfile(p.id); setConfirmDelete(null); }} style={{ ...btn("#c0533f"), flex: 1, padding: "9px" }}>Delete everything</button>
                  <button className="tap" onClick={() => setConfirmDelete(null)} style={{ ...btnOutline(), flex: 1, padding: "9px" }}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 12, padding: 12, marginBottom: 18 }}>
        <div style={{ fontSize: 12, color: MUTE, marginBottom: 8, fontWeight: 600 }}>Add a profile</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          {EMOJIS.map((e) => (
            <button key={e} className="tap" onClick={() => setNewEmoji(e)} style={{ fontSize: 18, width: 36, height: 36, borderRadius: 9, cursor: "pointer", background: newEmoji === e ? SAGE : CARD2, border: `1px solid ${newEmoji === e ? SAGE : LINE}` }}>{e}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name" style={inputStyle} />
          <button className="tap" onClick={addProfile} disabled={!newName.trim()} style={{ ...btn(SAGE), opacity: newName.trim() ? 1 : 0.5, whiteSpace: "nowrap" }}>Add</button>
        </div>
        <p style={{ fontSize: 11, color: MUTE, marginTop: 8, fontStyle: "italic" }}>Each profile keeps its own workouts, guide, badges, and goals.</p>
      </div>

      {/* ── Backup ── */}
      <div style={{ fontSize: 12, color: SAGE_D, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", margin: "0 2px 10px" }}>Backup &amp; restore (this profile)</div>
      <div style={{ ...card(), marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: MUTE }}>This profile holds <b style={{ color: INK }}>{counts.species}</b> species, <b style={{ color: INK }}>{counts.sightings}</b> sightings, and <b style={{ color: INK }}>{counts.sessions}</b> workouts.</div>
      </div>
      <button className="tap" onClick={onExport} style={{ ...btn(SAGE), width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 10 }}>
        <Download size={18} /> Export backup (.json)
      </button>
      <input ref={fileRef} type="file" accept="application/json,.json" onChange={onFile} style={{ display: "none" }} />
      <button className="tap" onClick={() => fileRef.current?.click()} style={{ ...btnOutline(), width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <Upload size={18} /> Import from file
      </button>
      <Field label="…or paste backup text"><textarea value={text} onChange={(e) => setText(e.target.value)} placeholder='{"app":"WildFit",...}' style={{ ...inputStyle, height: 80, fontFamily: "monospace", fontSize: 11, resize: "vertical" }} /></Field>
      {msg && <div style={{ color: msg.includes("✓") ? SAGE_D : CLAY, fontSize: 12, marginBottom: 8 }}>{msg}</div>}
      <button className="tap" onClick={() => setMsg(onImport(text) ? "Restored ✓" : "That text isn't valid backup data.")} disabled={!text.trim()} style={{ ...btn(SAGE), width: "100%", opacity: text.trim() ? 1 : 0.5 }}>Restore from text</button>
      <p style={{ fontSize: 11.5, color: MUTE, marginTop: 12, lineHeight: 1.5, fontStyle: "italic" }}>Importing replaces the current profile's data — including every creature and photo in the guide. Export first if you want to keep a copy.</p>
    </Modal>
  );
}

/* ============================ PRIMITIVES =========================== */
function FactBlock({ fact, url }) {
  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${LINE}` }}>
      <p style={{ fontSize: 13.5, lineHeight: 1.55, color: INK, margin: 0 }}>
        <span style={{ fontWeight: 700, color: SAGE_D }}>Did you know? </span>{fact}
      </p>
      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer"
          style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 6, fontSize: 11.5,
            color: SAGE_D, fontWeight: 600, textDecoration: "none" }}>
          <ExternalLink size={12} /> Source &amp; fact-check
        </a>
      )}
    </div>
  );
}
function SectionLabel({ children }) {
  return <div style={{ fontFamily: SERIF, fontSize: 16, fontStyle: "italic", color: SAGE_D, margin: "20px 2px 12px", borderBottom: `1px solid ${LINE}`, paddingBottom: 6 }}>{children}</div>;
}
function Empty({ children }) {
  return <div style={{ color: MUTE, fontStyle: "italic", textAlign: "center", padding: "24px 16px", fontFamily: SERIF, lineHeight: 1.5, background: CARD, border: `1px dashed ${LINE}`, borderRadius: 14 }}>{children}</div>;
}
function Field({ label, children, flex }) {
  return (
    <div style={{ marginBottom: 14, flex: flex ? 1 : undefined }}>
      <div style={{ fontSize: 11, color: MUTE, letterSpacing: 0.5, textTransform: "uppercase", fontWeight: 600, marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  );
}
function Chip({ active, onClick, children }) {
  return <button className="tap" onClick={onClick} style={{ whiteSpace: "nowrap", border: `1px solid ${active ? SAGE : LINE}`, background: active ? SAGE : CARD, color: active ? "#fff" : INK, borderRadius: 20, padding: "7px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>{children}</button>;
}
const card = (align) => ({ background: CARD, border: `1px solid ${LINE}`, borderRadius: 18, padding: 18, textAlign: align === "center" ? "center" : "left", boxShadow: "0 1px 3px rgba(0,0,0,0.03)" });
const btn = (bg) => ({ background: bg, color: "#fff", border: "none", borderRadius: 12, padding: "13px 20px", fontSize: 14.5, fontWeight: 700, cursor: "pointer", fontFamily: SANS });
const btnOutline = () => ({ background: "transparent", color: SAGE_D, border: `1px solid ${SAGE}`, borderRadius: 12, padding: "13px 20px", fontSize: 14.5, fontWeight: 700, cursor: "pointer", fontFamily: SANS });
const inputStyle = { width: "100%", background: CARD, border: `1px solid ${LINE}`, borderRadius: 10, padding: "11px 12px", fontSize: 15, color: INK, fontFamily: SANS, outline: "none" };
