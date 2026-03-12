import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const COOLDOWN_KEY = "ottawa_fair_rent_last_submit";
const COOLDOWN_MS  = 60 * 1000;
const CITY         = "ottawa";
const MIN_RENT     = 500;
const MAX_RENT     = 8000;
const CUTOFF_YEARS = 2;

// ─── Data ─────────────────────────────────────────────────────────────────────
const BASE_AVERAGES = {
    "bachelor": 1550,
    "1br": 2026,
    "2br": 2530,
    "3br": 3100,
    "3plus": 3600
};

const HOOD_MULTIPLIERS = {
    "Alta Vista": 0.95,
    "Barrhaven": 0.92,
    "Bayshore / Britannia": 0.96,
    "Beacon Hill": 0.93,
    "Blackburn Hamlet": 0.91,
    "Byward Market": 1.18,
    "Carlington": 0.88,
    "Centretown": 1.08,
    "Chinatown / Lebreton": 1.02,
    "Downtown Core": 1.15,
    "Elmvale Acres": 0.9,
    "Findlay Creek": 0.89,
    "Gatineau (QC side)": 0.82,
    "Glebe": 1.2,
    "Greenboro": 0.88,
    "Hintonburg": 1.1,
    "Kanata": 0.97,
    "Little Italy": 1.07,
    "Lowertown": 1,
    "Manor Park": 1.06,
    "Manotick": 0.94,
    "Nepean": 0.93,
    "New Edinburgh": 1.16,
    "Old Ottawa South": 1.05,
    "Orléans": 0.9,
    "Overbrook": 0.9,
    "Queensway Terrace": 0.94,
    "Rideau-Vanier": 0.87,
    "Riverside South": 0.91,
    "Rockcliffe Park": 1.28,
    "Sandy Hill": 1.04,
    "Stittsville": 0.89,
    "Vanier": 0.85,
    "Wellington Village": 1.12,
    "Westboro": 1.18
};

const UNIT_TYPES = [
  { label: "Bachelor / Studio", key: "bachelor" },
  { label: "1 Bedroom",         key: "1br"      },
  { label: "2 Bedroom",         key: "2br"      },
  { label: "3 Bedroom",         key: "3br"      },
  { label: "3+ Bedroom",        key: "3plus"    },
];

const ADDON_COSTS      = { parking: 250, utilities: 120 };
const YEARLY_INFLATION = 0.038;
const NEIGHBORHOODS    = Object.keys(HOOD_MULTIPLIERS).sort((a, b) => a.localeCompare(b));

// ─── Historical rent model ────────────────────────────────────────────────────
// Returns what the market rate WAS in a given year for a neighbourhood/unit.
// Uses compound deflation from today's baseline back to moveInYear.
// This gives an accurate historical context for long-term tenants.
function getHistoricalMarket(neighborhood, unitType, moveInYear, parking, utilities) {
  const curYear  = new Date().getFullYear();
  const base     = BASE_AVERAGES[unitType] || BASE_AVERAGES["1br"];
  const mult     = HOOD_MULTIPLIERS[neighborhood] || 1;
  const addons   = (parking ? ADDON_COSTS.parking : 0) + (utilities ? ADDON_COSTS.utilities : 0);
  const yearsAgo = Math.max(0, curYear - moveInYear);

  const todayBaseline  = Math.round(base * mult) + addons;
  const moveinBaseline = Math.round(base * mult * Math.pow(1 - YEARLY_INFLATION, yearsAgo)) + addons;

  // Expected rent today if inflation-tracked perfectly from move-in
  const inflationTracked = Math.round(moveinBaseline * Math.pow(1 + YEARLY_INFLATION, yearsAgo));

  return { today: todayBaseline, movein: moveinBaseline, inflationTracked };
}

// ─── Smart weighted benchmark ─────────────────────────────────────────────────
// Blends CMHC baseline with community median.
// Weight on community data scales with submission count.
// Never exceeds 80% community (baseline always anchors).
function communityWeight(n) {
  if (n < 5)  return 0.00;
  if (n < 10) return 0.20;
  if (n < 20) return 0.40;
  if (n < 50) return 0.60;
  return 0.80;
}

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const currency = (v) =>
  v.toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

const pctDiff = (actual, bench) =>
  !bench ? 0 : Math.round(((actual - bench) / bench) * 100);

function getVerdict(pct) {
  if (pct >  20) return { label: "Well Above Market", color: "#dc2626", bg: "#fef2f2", border: "#fecaca", pill: "#fee2e2" };
  if (pct >   5) return { label: "Above Market",      color: "#ea580c", bg: "#fff7ed", border: "#fed7aa", pill: "#ffedd5" };
  if (pct >= -5) return { label: "At Market Rate",    color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0", pill: "#dcfce7" };
  if (pct >= -15) return { label: "Below Market",     color: "#2563eb", bg: "#eff6ff", border: "#bfdbfe", pill: "#dbeafe" };
  return               { label: "Well Below Market",  color: "#7c3aed", bg: "#faf5ff", border: "#ddd6fe", pill: "#ede9fe" };
}

function getInsight(pct, moveInYear) {
  const age = new Date().getFullYear() - (moveInYear || new Date().getFullYear());
  if (pct > 20)   return { head: "You may be significantly overpaying.", body: "Ontario caps annual rent increases (2.5% for 2024–2025). If your landlord exceeded this without an above-guideline application, you may have grounds to challenge it.", link: { t: "Ontario Rent Increase Guidelines →", u: "https://www.ontario.ca/page/rent-increase-guideline" } };
  if (pct > 5)    return { head: "Slightly above market.", body: "Included parking, utilities, newer construction, or a premium location can justify higher rents. Review what's included before drawing conclusions.", link: null };
  if (pct >= -5)  return { head: "You're at market rate.", body: "Your rent aligns with Ottawa averages for this unit and neighbourhood — a useful baseline heading into your next renewal conversation.", link: null };
  if (pct >= -15) return { head: age > 3 ? "A solid deal, likely thanks to rent protections." : "You're paying below market.", body: "Ontario tenants benefit from rent increase caps. This advantage compounds over time — know your rights before your next renewal.", link: { t: "Tenant Rights in Ontario →", u: "https://www.ontario.ca/page/renting-ontario-your-rights" } };
  return { head: "You have a strong deal.", body: "You're well below today's Ottawa market. Protect this tenancy — voluntary moves reset your rent to current market rates.", link: { t: "Before You Move: Know Your Rights →", u: "https://www.ontario.ca/page/renting-ontario-your-rights" } };
}

function useCountUp(target, duration = 1000) {
  const [val, setVal] = useState(0);
  const raf  = useRef(null);
  const prev = useRef(0);
  useEffect(() => {
    if (target === 0) return;
    const from = prev.current;
    prev.current = target;
    let start = null;
    const step = (ts) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      const e = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(from + (target - from) * e));
      if (p < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]);
  return val;
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const curYear = new Date().getFullYear();

  const [form,           setForm]           = useState({ neighborhood: "", unitType: "", rent: "", moveInYear: "" });
  const [parking,        setParking]        = useState(false);
  const [utilities,      setUtilities]      = useState(false);
  const [errors,         setErrors]         = useState({});
  const [result,         setResult]         = useState(null);
  const [submitting,     setSubmitting]     = useState(false);
  const [saveWarning,    setSaveWarning]    = useState("");
  const [realCount,      setRealCount]      = useState(0);
  const [countLoaded,    setCountLoaded]    = useState(false);
  const [shareOpen,      setShareOpen]      = useState(false);
  const [copied,         setCopied]         = useState(false);
  const [revealed,       setRevealed]       = useState(false);
  // Smart benchmark state
  const [smartBenchmark, setSmartBenchmark] = useState(null);
  const [benchSource,    setBenchSource]    = useState("baseline");
  const [communityCount, setCommunityCount] = useState(0);
  const copyRef = useRef(null);

  const displayCount = useCountUp(countLoaded ? realCount : 0);

  // Fetch total submission count for this city
  useEffect(() => {
    supabase
      .from("rent_submissions")
      .select("*", { count: "exact", head: true })
      .eq("city", CITY)
      .then(({ count, error }) => {
        if (!error) setRealCount(count || 0);
        setCountLoaded(true);
      });
  }, []);

  // Fetch community submissions for smart blending
  // Runs whenever neighborhood or unitType changes
  useEffect(() => {
    const { neighborhood, unitType } = form;
    if (!neighborhood || !unitType) {
      setSmartBenchmark(null);
      setBenchSource("baseline");
      setCommunityCount(0);
      return;
    }

    const curYear = new Date().getFullYear();
    const cutoff  = new Date();
    cutoff.setFullYear(curYear - CUTOFF_YEARS);

    supabase
      .from("rent_submissions")
      .select("monthly_rent")
      .eq("city", CITY)
      .eq("neighborhood", neighborhood)
      .eq("unit_type", unitType)
      .gte("monthly_rent", MIN_RENT)
      .lte("monthly_rent", MAX_RENT)
      .gte("created_at", cutoff.toISOString())
      .then(({ data, error }) => {
        const baseline = Math.round((BASE_AVERAGES[unitType] || BASE_AVERAGES["1br"]) * (HOOD_MULTIPLIERS[neighborhood] || 1));
        if (error || !data || data.length === 0) {
          setSmartBenchmark(baseline);
          setBenchSource("baseline");
          setCommunityCount(0);
          return;
        }
        const rents = data.map(r => r.monthly_rent);
        const med   = median(rents);
        const n     = rents.length;
        const w     = communityWeight(n);
        setCommunityCount(n);
        if (w === 0) {
          setSmartBenchmark(baseline);
          setBenchSource("baseline");
        } else {
          const blended = Math.round(baseline * (1 - w) + med * w);
          setSmartBenchmark(blended);
          setBenchSource(w >= 0.6 ? "community" : "blended");
        }
      });
  }, [form.neighborhood, form.unitType]);

  useEffect(() => {
    if (result) setTimeout(() => setRevealed(true), 40);
    else setRevealed(false);
  }, [result]);

  function validate() {
    const e = {};
    if (!form.neighborhood) e.neighborhood = "Select a neighbourhood";
    if (!form.unitType)     e.unitType     = "Select a unit type";
    if (!form.rent || isNaN(+form.rent) || +form.rent < 300) e.rent = "Enter a valid monthly rent";
    const yr = +form.moveInYear;
    if (!form.moveInYear || yr < 1980 || yr > curYear) e.moveInYear = `Enter a year between 1980–${curYear}`;
    return e;
  }

  async function handleCalculate() {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setErrors({});
    setSaveWarning("");
    setSubmitting(true);
    setShareOpen(false);

    const rent       = +form.rent;
    const moveInYear = +form.moveInYear;
    const addons     = (parking ? ADDON_COSTS.parking : 0) + (utilities ? ADDON_COSTS.utilities : 0);
    const { today: todayBaseline, movein, inflationTracked } = getHistoricalMarket(form.neighborhood, form.unitType, moveInYear, parking, utilities);
    const sameYear = moveInYear === curYear;

    // Use smart blended benchmark for today comparison (add addons back)
    const todayBench  = smartBenchmark != null ? (smartBenchmark + addons) : todayBaseline;
    const moveinBench = sameYear ? todayBench : movein;

    setResult({
      rent,
      todayBench,
      moveinBench,
      inflationTracked,
      sameYear,
      todayPct:        pctDiff(rent, todayBench),
      moveinPct:       pctDiff(rent, moveinBench),
      todayDiff:       rent - todayBench,
      moveinDiff:      rent - moveinBench,
      benchSource,
      communityCount,
      moveInYear,
    });

    try {
      const lastSubmit = Number(localStorage.getItem(COOLDOWN_KEY) || 0);
      if (Date.now() - lastSubmit >= COOLDOWN_MS) {
        const { error } = await supabase.from("rent_submissions").insert({
          neighborhood: form.neighborhood, unit_type: form.unitType,
          monthly_rent: rent, move_in_year: moveInYear,
          includes_parking: parking, includes_utilities: utilities,
          city: CITY,
        });
        if (!error) {
          localStorage.setItem(COOLDOWN_KEY, String(Date.now()));
          setRealCount(prev => prev + 1);
        } else setSaveWarning("Result shown — submission not saved.");
      }
    } catch { setSaveWarning("Result shown — submission not saved."); }
    finally  { setSubmitting(false); }
  }

  function handleReset() {
    setResult(null);
    setForm({ neighborhood: "", unitType: "", rent: "", moveInYear: "" });
    setParking(false); setUtilities(false);
    setErrors({}); setSaveWarning(""); setShareOpen(false);
  }

  function getShareText() {
    const unit = UNIT_TYPES.find(u => u.key === form.unitType)?.label?.toLowerCase() || "unit";
    return `Ottawa Rent Calculator: I'm paying ${result.todayPct > 0 ? "+" : ""}${result.todayPct}% vs market for a ${unit} in ${form.neighborhood}. https://ottawafairrent.ca`;
  }

  function copyLink() {
    navigator.clipboard?.writeText("https://ottawafairrent.ca");
    setCopied(true);
    clearTimeout(copyRef.current);
    copyRef.current = setTimeout(() => setCopied(false), 2000);
  }

  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));
  const verdict = result ? getVerdict(result.todayPct) : null;
  const insight = result ? getInsight(result.todayPct, +form.moveInYear) : null;

  const benchLabel = benchSource === "community"
    ? `Community data · ${communityCount} submissions`
    : benchSource === "blended"
    ? `Blended · ${communityCount} submissions + CMHC`
    : "CMHC baseline";

  const inp = (err) => ({
    width: "100%", padding: "11px 14px",
    border: `1.5px solid ${err ? "#ef4444" : "#e2e8f0"}`,
    borderRadius: 8, fontSize: 15, fontFamily: "inherit",
    background: "#fff", color: "#0f172a",
    outline: "none", transition: "border-color .15s, box-shadow .15s",
    appearance: "none",
  });

  const sel = (err) => ({
    ...inp(err),
    paddingRight: 36,
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%2394a3b8' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
    backgroundRepeat: "no-repeat", backgroundPosition: "right 13px center",
    cursor: "pointer",
  });

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", color: "#0f172a" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
        html, body, #root { width: 100%; margin: 0; padding: 0; }
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        input, select { font-family: inherit; }
        input:focus, select:focus { border-color: #3b82f6 !important; box-shadow: 0 0 0 3px rgba(59,130,246,.15) !important; outline: none; }
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }

        .fade-in { opacity: 0; transform: translateY(10px); animation: fadeUp .4s ease forwards; }
        @keyframes fadeUp { to { opacity: 1; transform: none; } }
        .d1 { animation-delay: .05s; } .d2 { animation-delay: .1s; }
        .d3 { animation-delay: .15s; } .d4 { animation-delay: .2s; }
        .d5 { animation-delay: .25s; }

        .btn-primary { width: 100%; padding: 13px; background: #0f172a; color: #fff; border: none; border-radius: 8px; font-family: inherit; font-size: 14px; font-weight: 600; letter-spacing: .02em; cursor: pointer; transition: background .15s, transform .1s; }
        .btn-primary:hover:not(:disabled) { background: #1e293b; }
        .btn-primary:active { transform: scale(.99); }
        .btn-primary:disabled { opacity: .5; cursor: not-allowed; }

        .btn-outline { padding: 11px 18px; background: #fff; color: #0f172a; border: 1.5px solid #e2e8f0; border-radius: 8px; font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer; transition: border-color .15s, background .15s; }
        .btn-outline:hover { border-color: #94a3b8; background: #f8fafc; }

        .toggle { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border: 1.5px solid #e2e8f0; border-radius: 8px; cursor: pointer; user-select: none; transition: border-color .15s, background .15s; }
        .toggle.on { border-color: #bfdbfe; background: #eff6ff; }
        .toggle-track { width: 34px; height: 18px; border-radius: 18px; position: relative; flex-shrink: 0; transition: background .15s; }
        .toggle-thumb { position: absolute; top: 2px; width: 14px; height: 14px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.2); transition: left .15s; }

        .share-btn { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 10px; border-radius: 7px; font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 500; text-decoration: none; cursor: pointer; border: none; transition: opacity .15s, transform .1s; }
        .share-btn:hover { opacity: .88; transform: translateY(-1px); }

        .stat-card { text-align: center; padding: 16px 12px; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; }

        @media (max-width: 600px) {
          .grid-2, .grid-3, .grid-share { grid-template-columns: 1fr !important; }
          .cta-row { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* ── Header ── */}
      <header style={{ background: "#0f172a", borderBottom: "1px solid #1e293b" }}>
        <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 0", gap: 16 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                <a href="https://fairrent.ca" style={{ textDecoration: "none" }}>
                  <div style={{ width: 28, height: 28, background: "#22c55e", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: "#0f172a" }}>FR</span>
                  </div>
                </a>
                <span style={{ fontSize: 18, fontWeight: 800, color: "#fff", letterSpacing: "-.02em" }}>
                  Ottawa Rent Calculator
                </span>
              </div>
              <p style={{ fontSize: 12, color: "#64748b", margin: 0 }}>
                See if your Ottawa rent is fair — free, anonymous, no account needed
              </p>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 22, fontWeight: 500, color: "#22c55e", lineHeight: 1 }}>
                {countLoaded ? displayCount.toLocaleString() : "—"}
              </div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#475569", marginTop: 3, letterSpacing: ".06em", textTransform: "uppercase" }}>
                submissions
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ── Main ── */}
      <main style={{ maxWidth: 680, margin: "0 auto", padding: "32px 20px 80px" }}>

        {!result ? (
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,.06)", overflow: "hidden" }}>

            <div style={{ padding: "22px 24px 20px", borderBottom: "1px solid #f1f5f9" }}>
              <h1 style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", letterSpacing: "-.02em", marginBottom: 6 }}>
                Compare your Ottawa rent to market rates
              </h1>
              <p style={{ fontSize: 13, color: "#64748b", lineHeight: 1.6 }}>
                Based on CMHC and Rentals.ca data for Ottawa. Your submission improves accuracy for everyone.
              </p>
            </div>

            <div style={{ padding: "22px 24px 24px", display: "flex", flexDirection: "column", gap: 18 }}>

              <div className="grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#475569", letterSpacing: ".04em", textTransform: "uppercase" }}>Neighbourhood</label>
                  <select value={form.neighborhood} onChange={set("neighborhood")} style={sel(errors.neighborhood)}>
                    <option value="">Select…</option>
                    {NEIGHBORHOODS.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                  {errors.neighborhood && <span style={{ fontSize: 11, color: "#ef4444" }}>{errors.neighborhood}</span>}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#475569", letterSpacing: ".04em", textTransform: "uppercase" }}>Unit Type</label>
                  <select value={form.unitType} onChange={set("unitType")} style={sel(errors.unitType)}>
                    <option value="">Select…</option>
                    {UNIT_TYPES.map(u => <option key={u.key} value={u.key}>{u.label}</option>)}
                  </select>
                  {errors.unitType && <span style={{ fontSize: 11, color: "#ef4444" }}>{errors.unitType}</span>}
                </div>
              </div>

              {/* Smart benchmark preview — shows once neighbourhood + unit selected */}
              {form.neighborhood && form.unitType && smartBenchmark != null && (
                <div style={{ padding: "10px 14px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#64748b" }}>
                    Current benchmark
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 500, color: "#0f172a" }}>
                      {currency(smartBenchmark + (parking ? ADDON_COSTS.parking : 0) + (utilities ? ADDON_COSTS.utilities : 0))}/mo
                    </span>
                    <span style={{ padding: "2px 8px", background: benchSource === "baseline" ? "#f1f5f9" : "#22c55e20", border: `1px solid ${benchSource === "baseline" ? "#e2e8f0" : "#22c55e50"}`, borderRadius: 100, fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: benchSource === "baseline" ? "#94a3b8" : "#16a34a", textTransform: "uppercase", letterSpacing: ".06em" }}>
                      {benchLabel}
                    </span>
                  </div>
                </div>
              )}

              <div className="grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#475569", letterSpacing: ".04em", textTransform: "uppercase" }}>Monthly Rent (CAD)</label>
                  <input type="number" placeholder="e.g. 2200" value={form.rent} onChange={set("rent")} style={inp(errors.rent)} />
                  {errors.rent && <span style={{ fontSize: 11, color: "#ef4444" }}>{errors.rent}</span>}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#475569", letterSpacing: ".04em", textTransform: "uppercase" }}>Year Moved In</label>
                  <input type="number" placeholder={String(curYear)} value={form.moveInYear} onChange={set("moveInYear")} style={inp(errors.moveInYear)} />
                  {errors.moveInYear && <span style={{ fontSize: 11, color: "#ef4444" }}>{errors.moveInYear}</span>}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#475569", letterSpacing: ".04em", textTransform: "uppercase", marginBottom: 8 }}>Rent includes</div>
                <div className="grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {[
                    { label: "Parking", sub: "+$250/mo to benchmark", key: "parking", val: parking, set: setParking },
                    { label: "Utilities", sub: "+$120/mo to benchmark", key: "util", val: utilities, set: setUtilities },
                  ].map(({ label, sub, key, val, set: setter }) => (
                    <label key={key} className={`toggle ${val ? "on" : ""}`} onClick={() => setter(v => !v)}>
                      <div className="toggle-track" style={{ background: val ? "#3b82f6" : "#e2e8f0" }}>
                        <div className="toggle-thumb" style={{ left: val ? 18 : 2 }} />
                        <input type="checkbox" checked={val} onChange={() => {}} style={{ position: "absolute", opacity: 0, width: 0, height: 0 }} />
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{label}</div>
                        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>{sub}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <button className="btn-primary" onClick={handleCalculate} disabled={submitting}>
                {submitting ? "Saving…" : "Compare My Rent →"}
              </button>

              <p style={{ textAlign: "center", fontSize: 11, color: "#94a3b8", lineHeight: 1.7 }}>
                Anonymous · No account required · No personal data collected
              </p>
            </div>
          </div>

        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {/* ── Verdict banner ── */}
            <div className={revealed ? "fade-in d1" : ""} style={{ background: verdict.bg, border: `1.5px solid ${verdict.border}`, borderRadius: 12, padding: "28px 24px 22px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: verdict.color, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 8, opacity: .8 }}>
                    vs today's market · {form.neighborhood}
                  </div>
                  <div style={{ fontSize: "clamp(52px,12vw,80px)", fontWeight: 800, lineHeight: 1, color: verdict.color, letterSpacing: "-.03em" }}>
                    {result.todayPct > 0 ? "+" : ""}{result.todayPct}%
                  </div>
                </div>
                <div style={{ display: "inline-flex", alignItems: "center", padding: "7px 14px", background: verdict.pill, border: `1px solid ${verdict.border}`, borderRadius: 100, fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 500, color: verdict.color, letterSpacing: ".02em", alignSelf: "flex-start", marginTop: 4 }}>
                  {verdict.label}
                </div>
              </div>

              {/* Spectrum bar */}
              <div style={{ marginTop: 20 }}>
                <div style={{ position: "relative", height: 5, borderRadius: 5, background: "linear-gradient(to right, #7c3aed, #2563eb, #16a34a, #ea580c, #dc2626)" }}>
                  <div style={{
                    position: "absolute", top: "50%",
                    left: `${((Math.max(-50, Math.min(50, result.todayPct)) + 50) / 100) * 100}%`,
                    transform: "translate(-50%, -50%)",
                    width: 16, height: 16, borderRadius: "50%",
                    background: verdict.color, border: "2.5px solid #fff",
                    boxShadow: `0 0 0 2px ${verdict.color}40`,
                    transition: "left .8s cubic-bezier(.34,1.3,.64,1)",
                  }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#94a3b8" }}>
                  <span>−50%</span><span>Market</span><span>+50%</span>
                </div>
              </div>

              {/* Benchmark source pill */}
              <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#94a3b8" }}>Benchmark: </span>
                <span style={{ padding: "2px 8px", background: result.benchSource === "baseline" ? "#f1f5f9" : "#22c55e20", border: `1px solid ${result.benchSource === "baseline" ? "#e2e8f0" : "#22c55e50"}`, borderRadius: 100, fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: result.benchSource === "baseline" ? "#94a3b8" : "#16a34a", textTransform: "uppercase", letterSpacing: ".06em" }}>
                  {result.benchSource === "community" ? `Community data · ${result.communityCount} submissions` : result.benchSource === "blended" ? `Blended · ${result.communityCount} submissions + CMHC` : "CMHC baseline"}
                </span>
              </div>
            </div>

            {/* ── Stats row ── */}
            <div className={`grid-3 ${revealed ? "fade-in d2" : ""}`} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              {[
                { label: "Your Rent", value: currency(result.rent), highlight: true },
                { label: result.sameYear ? "Market (Now)" : "Move-in Market", value: currency(result.moveinBench) },
                { label: "Today's Market", value: currency(result.todayBench) },
              ].map(({ label, value, highlight }) => (
                <div key={label} className="stat-card">
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>{label}</div>
                  <div style={{ fontSize: highlight ? 22 : 18, fontWeight: 800, color: highlight ? "#0f172a" : "#475569", letterSpacing: "-.02em" }}>{value}</div>
                </div>
              ))}
            </div>

            {/* ── Breakdown ── */}
            <div className={revealed ? "fade-in d3" : ""} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "16px 20px" }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10 }}>Breakdown</div>
              <div style={{ fontSize: 14, color: "#334155", lineHeight: 1.8 }}>
                {result.sameYear ? (
                  <>You moved in this year. Your rent is <strong style={{ color: "#0f172a" }}>{currency(Math.abs(result.todayDiff))}/month {result.todayDiff >= 0 ? "above" : "below"} today's market.</strong></>
                ) : (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f1f5f9" }}>
                      <span style={{ color: "#64748b" }}>When you moved in ({result.moveInYear})</span>
                      <span style={{ fontWeight: 600, color: result.moveinDiff > 0 ? "#ea580c" : "#16a34a" }}>{result.moveinPct > 0 ? "+" : ""}{result.moveinPct}% · {currency(Math.abs(result.moveinDiff))}/mo {result.moveinDiff >= 0 ? "above" : "below"}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f1f5f9" }}>
                      <span style={{ color: "#64748b" }}>Today's market</span>
                      <span style={{ fontWeight: 600, color: result.todayDiff > 0 ? "#ea580c" : "#16a34a" }}>{result.todayPct > 0 ? "+" : ""}{result.todayPct}% · {currency(Math.abs(result.todayDiff))}/mo {result.todayDiff >= 0 ? "above" : "below"}</span>
                    </div>
                    {!result.sameYear && (
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
                        <span style={{ color: "#64748b" }}>If inflation-tracked from move-in</span>
                        <span style={{ fontWeight: 600, color: "#475569" }}>{currency(result.inflationTracked)}/mo expected</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* ── Insight ── */}
            <div className={revealed ? "fade-in d4" : ""} style={{ background: "#fff", borderLeft: `3px solid ${verdict.color}`, border: `1px solid ${verdict.border}`, borderLeftWidth: 3, borderRadius: 10, padding: "16px 20px" }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a", marginBottom: 6 }}>{insight.head}</div>
              <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.7 }}>{insight.body}</div>
              {insight.link && (
                <a href={insight.link.u} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", marginTop: 10, fontSize: 12, fontWeight: 600, color: verdict.color, textDecoration: "none" }}>
                  {insight.link.t}
                </a>
              )}
            </div>

            {saveWarning && (
              <div style={{ fontSize: 12, color: "#92400e", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 14px" }}>⚠ {saveWarning}</div>
            )}

            {/* ── CTA row ── */}
            <div className={`cta-row ${revealed ? "fade-in d5" : ""}`} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button className="btn-outline" onClick={handleReset}>← Check Another</button>
              <button
                className="btn-outline"
                onClick={() => setShareOpen(s => !s)}
                style={{ background: shareOpen ? "#0f172a" : "#fff", color: shareOpen ? "#fff" : "#0f172a", borderColor: shareOpen ? "#0f172a" : "#e2e8f0" }}
              >
                Share Result {shareOpen ? "↑" : "↗"}
              </button>
            </div>

            {/* ── Share panel ── */}
            {shareOpen && (
              <div className="fade-in" style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "16px 18px" }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 12 }}>Share your result</div>
                <div className="grid-share" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
                  <a className="share-btn" href={`https://www.reddit.com/submit?url=https://ottawafairrent.ca&title=${encodeURIComponent(getShareText())}`} target="_blank" rel="noopener noreferrer" style={{ background: "#ff4500", color: "#fff" }}>Reddit</a>
                  <a className="share-btn" href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(getShareText())}`} target="_blank" rel="noopener noreferrer" style={{ background: "#000", color: "#fff" }}>X</a>
                  <a className="share-btn" href={`https://www.threads.net/intent/post?text=${encodeURIComponent(getShareText())}`} target="_blank" rel="noopener noreferrer" style={{ background: "#000", color: "#fff" }}>Threads</a>
                  {navigator.share ? (
                    <button className="share-btn" onClick={() => navigator.share({ title: "Ottawa Rent Calculator", text: getShareText(), url: "https://ottawafairrent.ca" }).catch(() => {})} style={{ background: "#0f172a", color: "#fff" }}>More ↗</button>
                  ) : (
                    <button className="share-btn" onClick={copyLink} style={{ background: copied ? "#16a34a" : "#0f172a", color: "#fff" }}>{copied ? "Copied ✓" : "Copy"}</button>
                  )}
                </div>
              </div>
            )}

          </div>
        )}

        {/* ── Data sources footer ── */}
        <div style={{ marginTop: 36, padding: "20px 0", borderTop: "1px solid #e2e8f0" }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 12 }}>Data Sources</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {["CMHC Rental Market Survey (Oct 2024)", "Rentals.ca Monthly Report (Feb 2025)", "Community Submissions"].map(s => (
              <span key={s} style={{ display: "inline-block", padding: "4px 10px", background: "#f1f5f9", borderRadius: 100, fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#64748b" }}>{s}</span>
            ))}
          </div>
          <p style={{ marginTop: 12, fontSize: 11, color: "#94a3b8", lineHeight: 1.7 }}>
            Benchmarks blend CMHC/Rentals.ca baselines with anonymous community submissions from the past 2 years.
            Historical figures use a 3.8%/year inflation model from today's baseline.
            Accuracy improves as community submissions grow. Not legal or financial advice.
          </p>
        </div>
      </main>
    </div>
  );
}
