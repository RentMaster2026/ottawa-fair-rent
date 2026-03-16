export const OTTAWA_HOODS = {
  centretown: {
    slug: "centretown", name: "Centretown",
    hoodMult: 1.08, vsAvgPct: 8,
    description: "Centretown is one of Ottawa's most central and walkable neighbourhoods, bordered by the Glebe, Chinatown, and the downtown core. It has a dense mix of older apartment buildings, converted houses, and newer purpose-built rentals.",
    context: "Units near the Glebe border tend to sit at the higher end of this range.",
    nearbyHoods: ["Glebe", "Hintonburg", "Downtown Core"],
  },
  glebe: {
    slug: "glebe", name: "Glebe",
    hoodMult: 1.20, vsAvgPct: 20,
    description: "The Glebe is one of Ottawa's most sought-after neighbourhoods, known for its Victorian homes, canal access, and walkable main street along Bank Street.",
    context: "Units facing the canal or on quieter side streets command the highest premiums.",
    nearbyHoods: ["Centretown", "Old Ottawa South", "Dow's Lake"],
  },
  westboro: {
    slug: "westboro", name: "Westboro",
    hoodMult: 1.18, vsAvgPct: 18,
    description: "Westboro is a high-demand neighbourhood in Ottawa's west end, known for its independent shops, restaurants, and proximity to the Ottawa River.",
    context: "Purpose-built rentals near the Westboro LRT station tend toward the higher end.",
    nearbyHoods: ["Hintonburg", "Carlington", "Bayshore"],
  },
};

export const OTTAWA_CITY = {
  key: "ottawa", name: "Ottawa", province: "Ontario",
  accent: "#16a34a", accentLight: "#f0fdf4", accentBorder: "#bbf7d0",
  calcUrl: "https://ottawafairrent.ca",
  bases: { bachelor:1550, "1br":2026, "2br":2530, "3br":3100, "3plus":3600 },
  inflation: 0.038, rentControlled: true,
};
