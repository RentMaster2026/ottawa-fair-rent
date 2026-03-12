import { useMemo, useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

// ─── Supabase ─────────────────────────────────────────────────────────────────

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const COOLDOWN_KEY = "ottawa_fair_rent_last_submit";
const COOLDOWN_MS  = 60 * 1000;

// ─── Data ─────────────────────────────────────────────────────────────────────
// Base averages sourced from CMHC Rental Market Survey (Ottawa CMA, Oct 2024),
// Rentals.ca Monthly Rent Report (Feb 2025), and Numbeo Ottawa 2025.
// 1BR: ~$2,026 (CMHC/Rentals.ca avg), 2BR: ~$2,530, bachelor: ~$1,550 (CMHC)
// 3BR estimated from CMHC trend data. These are CMA-wide averages before
// neighbourhood multipliers are applied.

const BASE_AVERAGES = {
  bachelor: 1550,
  "1br":    2026,
  "2br":    2530,
  "3br":    3100,
  "3plus":  3600,
};

// Neighbourhood multipliers derived from Rentals.ca, Zumper, Apartments.com,
// and CMHC zone data for Ottawa 2024–2025. Multiplier of 1.00 = CMA average.
// All neighbourhoods sorted alphabetically in the UI dropdown.
const HOOD_MULTIPLIERS = {
  "Alta Vista":           0.95,
  "Barrhaven":            0.92,
  "Bayshore / Britannia": 0.96,
  "Beacon Hill":          0.93,
  "Blackburn Hamlet":     0.91,
  "Byward Market":        1.18,
  "Carlington":           0.88,
  "Centretown":           1.08,
  "Chinatown / Lebreton": 1.02,
  "Downtown Core":        1.15,
  "Elmvale Acres":        0.90,
  "Findlay Creek":        0.89,
  "Gatineau (QC side)":   0.82,
  "Glebe":                1.20,
  "Greenboro":            0.88,
  "Hintonburg":           1.10,
  "Kanata":               0.97,
  "Lowertown":            1.00,
  "Manor Park":           1.06,
  "Manotick":             0.94,
  "New Edinburgh":        1.16,
  "Nepean":               0.93,
  "Old Ottawa South":     1.05,
  "Orléans":              0.90,
  "Overbrook":            0.90,
  "Queensway Terrace":    0.94,
  "Rideau-Vanier":        0.87,
  "Riverside South":      0.91,
  "Rockcliffe Park":      1.28,
  "Sandy Hill":           1.04,
  "Stittsville":          0.89,
  "Vanier":               0.85,
  "Wellington Village":   1.12,
  "Westboro":             1.18,
  "Little Italy":         1.07,
};

const UNIT_TYPES = [
  { label: "Bachelor / Studio", key: "bachelor" },
  { label: "1 Bedroom",         key: "1br"      },
  { label: "2 Bedroom",         key: "2br"      },
  { label: "3 Bedroom",         key: "3br"      },
  { label: "3+ Bedroom",        key: "3plus"    },
];

const ADDON_COSTS    = { parking: 250, utilities: 120 };
const YEARLY_INFLATION = 0.038; // Ottawa rent growth avg ~3.5–4% per CMHC

// Sorted neighbourhood list for dropdown
const NEIGHBORHOODS = Object.keys(HOOD_MULTIPLIERS).sort((a, b) => a.localeCompare(b));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const currency = (v) =>
  v.toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

const pctDiff = (actual, bench) =>
  !bench ? 0 : Math.round(((actual - bench) / bench) * 100);

function getMarket(neighborhood, unitType, moveInYear, parking, utilities) {
  const base     = BASE_AVERAGES[unitType] || 2026;
  const mult     = HOOD_MULTIPLIERS[neighborhood] || 1;
  const curYear  = new Date().getFullYear();
  const yearsAgo = Math.max(0, curYear - (moveInYear || curYear));
  const addons   = (parking ? ADDON_COSTS.parking : 0) + (utilities ? ADDON_COSTS.utilities : 0);
  return {
    today:  Math.round(base * mult) + addons,
    movein: Math.round(base * mult * Math.pow(1 - YEARLY_INFLATION, yearsAgo)) + addons,
  };
}

function getVerdict(pct) {
  if (pct >  20) return { label: "Well Above Market", ink: "#b91c1c", bg: "#fef2f2", rule: "#fca5a5" };
  if (pct >   5) return { label: "Above Market",      ink: "#c2410c", bg: "#fff7ed", rule: "#fdba74" };
  if (pct >=  -5) return { label: "At Market Rate",   ink: "#15803d", bg: "#f0fdf4", rule: "#86efac" };
  if (pct >= -15) return { label: "Below Market",     ink: "#1d4ed8", bg: "#eff6ff", rule: "#93c5fd" };
  return              { label: "Well Below Market",   ink: "#6d28d9", bg: "#faf5ff", rule: "#c4b5fd" };
}

function getInsight(pct, moveInYear) {
  const age = new Date().getFullYear() - (moveInYear || new Date().getFullYear());
  if (pct > 20)   return { head: "You may be significantly overpaying.", body: "Annual rent increases in Ontario are capped by the provincial rent increase guideline (2.5% for 2024, 2.5% for 2025). If your landlord has increased your rent beyond the guideline without an above-guideline application, you may have grounds to challenge it at the Landlord and Tenant Board.", link: { t: "Ontario Rent Increase Guidelines", u: "https://www.ontario.ca/page/rent-increase-guideline" } };
  if (pct > 5)    return { head: "Slightly above market.", body: "Premium amenities, included parking or utilities, newer construction, or a particularly walkable location can justify above-market rents. Review what's included in your lease before drawing conclusions.", link: null };
  if (pct >= -5)  return { head: "You're right at market rate.", body: "Your rent aligns well with Ottawa averages for this unit type and neighbourhood. This is a useful baseline heading into your next lease renewal conversation.", link: null };
  if (pct >= -15) return { head: age > 3 ? "A solid deal — likely thanks to tenancy protections." : "You're paying below market.", body: "Long-term Ontario tenants benefit from rent increases capped below market inflation. This advantage compounds over time — know your rights before your next renewal.", link: { t: "Tenant Rights in Ontario", u: "https://www.ontario.ca/page/renting-ontario-your-rights" } };
  return { head: "You have a notably strong deal.", body: "You're well below today's Ottawa market. Protect this tenancy — be cautious about voluntary moves, and understand that any new lease would be priced at current market rates.", link: { t: "Before You Move: Know Your Rights", u: "https://www.ontario.ca/page/renting-ontario-your-rights" } };
}

// ─── Animated counter ─────────────────────────────────────────────────────────

function useCountUp(target, duration = 1100) {
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

// ─── Sub-components ───────────────────────────────────────────────────────────

function Field({ label, error, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink-muted)" }}>
        {label}
      </label>
      {children}
      {error && <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#b91c1c" }}>{error}</span>}
    </div>
  );
}

const selStyle = (err) => ({
  padding: "10px 36px 10px 12px",
  border: `1.5px solid ${err ? "#b91c1c" : "var(--rule)"}`,
  borderRadius: 6, fontSize: 15,
  fontFamily: "'Source Serif 4', serif",
  background: "var(--paper)", color: "var(--ink)", width: "100%",
  appearance: "none",
  backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='7' viewBox='0 0 10 7'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23888' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E\")",
  backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center",
  cursor: "pointer", transition: "border-color .18s, box-shadow .18s",
});

const inpStyle = (err) => ({
  padding: "10px 12px",
  border: `1.5px solid ${err ? "#b91c1c" : "var(--rule)"}`,
  borderRadius: 6, fontSize: 15,
  fontFamily: "'Source Serif 4', serif",
  background: "var(--paper)", color: "var(--ink)", width: "100%",
  transition: "border-color .18s, box-shadow .18s",
});

function ToggleChip({ label, sub, checked, onChange }) {
  return (
    <label style={{
      display: "flex", alignItems: "center", gap: 10, padding: "11px 14px",
      border: `1.5px solid ${checked ? "var(--accent-rule)" : "var(--rule)"}`,
      borderRadius: 8, cursor: "pointer", userSelect: "none",
      background: checked ? "var(--accent-bg)" : "var(--paper-tint)",
      transition: "all .18s",
    }}>
      <div style={{
        width: 36, height: 20, borderRadius: 20, position: "relative", flexShrink: 0,
        background: checked ? "var(--accent)" : "#d1d5db", transition: "background .18s",
      }}>
        <div style={{
          position: "absolute", top: 3, left: checked ? 19 : 3,
          width: 14, height: 14, borderRadius: "50%",
          background: "white", boxShadow: "0 1px 4px rgba(0,0,0,.2)",
          transition: "left .18s",
        }} />
        <input type="checkbox" checked={checked} onChange={onChange}
          style={{ position: "absolute", opacity: 0, width: 0, height: 0 }} />
      </div>
      <div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ink)" }}>{label}</div>
        <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 12, color: "var(--ink-muted)", marginTop: 1 }}>{sub}</div>
      </div>
    </label>
  );
}

function Meter({ pct }) {
  const clamped = Math.max(-50, Math.min(50, pct));
  const pos = ((clamped + 50) / 100) * 100;
  const { ink } = getVerdict(pct);
  return (
    <div style={{ margin: "22px 0 10px" }}>
      <div style={{ position: "relative", height: 6, borderRadius: 6, background: "linear-gradient(to right,#6d28d9,#1d4ed8,#15803d,#c2410c,#b91c1c)" }}>
        <div style={{
          position: "absolute", top: "50%", left: `${pos}%`,
          transform: "translate(-50%,-50%)",
          width: 20, height: 20, borderRadius: "50%",
          background: ink, border: "3px solid white",
          boxShadow: `0 2px 10px ${ink}55`,
          transition: "left .85s cubic-bezier(.34,1.56,.64,1)",
        }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "'DM Mono', monospace", fontSize: 10, color: "var(--ink-muted)", marginTop: 7 }}>
        <span>−50%</span><span>Market Rate</span><span>+50%</span>
      </div>
    </div>
  );
}

function Toast({ visible }) {
  return (
    <div style={{
      position: "fixed", bottom: 28, left: "50%",
      transform: `translateX(-50%) translateY(${visible ? 0 : 14}px)`,
      opacity: visible ? 1 : 0, transition: "all .3s cubic-bezier(.34,1.56,.64,1)",
      background: "var(--ink)", color: "var(--paper)",
      padding: "11px 22px", borderRadius: 100,
      fontFamily: "'DM Mono', monospace", fontSize: 12, letterSpacing: ".06em",
      boxShadow: "0 8px 30px rgba(0,0,0,.22)", pointerEvents: "none", zIndex: 9999,
    }}>
      ✓ &nbsp;Copied to clipboard
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const curYear = new Date().getFullYear();

  const [form,        setForm]        = useState({ neighborhood: "", unitType: "", rent: "", moveInYear: "" });
  const [parking,     setParking]     = useState(false);
  const [utilities,   setUtilities]   = useState(false);
  const [errors,      setErrors]      = useState({});
  const [result,      setResult]      = useState(null);
  const [revealed,    setRevealed]    = useState(false);
  const [toast,       setToast]       = useState(false);
  const [submitting,  setSubmitting]  = useState(false);
  const [saveWarning, setSaveWarning] = useState("");
  const [realCount,   setRealCount]   = useState(0);
  const [countLoaded, setCountLoaded] = useState(false);

  const displayCount = useCountUp(countLoaded ? realCount : 0, 1200);
  const toastRef = useRef(null);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    supabase
      .from("rent_submissions")
      .select("*", { count: "exact", head: true })
      .eq("city", "ottawa")
      .then(({ count, error }) => {
        if (!error) setRealCount(count || 0);
        setCountLoaded(true);
      });
  }, []);

  useEffect(() => {
    if (result) setTimeout(() => setRevealed(true), 60);
    else setRevealed(false);
  }, [result]);

  function validate() {
    const e = {};
    if (!form.neighborhood) e.neighborhood = "Required";
    if (!form.unitType)     e.unitType     = "Required";
    if (!form.rent || isNaN(+form.rent) || +form.rent < 300) e.rent = "Enter a valid monthly rent (min $300)";
    const yr = +form.moveInYear;
    if (!form.moveInYear || yr < 1980 || yr > curYear) e.moveInYear = `Enter a year 1980–${curYear}`;
    return e;
  }

  async function handleCalculate() {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setErrors({});
    setSaveWarning("");
    setSubmitting(true);

    const rent       = +form.rent;
    const moveInYear = +form.moveInYear;
    const { today, movein } = getMarket(form.neighborhood, form.unitType, moveInYear, parking, utilities);
    const sameYear = moveInYear === curYear;

    setResult({
      rent, today, movein, sameYear,
      todayPct:   pctDiff(rent, today),
      moveinPct:  pctDiff(rent, sameYear ? today : movein),
      todayDiff:  rent - today,
      moveinDiff: rent - (sameYear ? today : movein),
    });

    try {
      const lastSubmit = Number(localStorage.getItem(COOLDOWN_KEY) || 0);
      const onCooldown = Date.now() - lastSubmit < COOLDOWN_MS;

      if (!onCooldown) {
        const { error } = await supabase.from("rent_submissions").insert({
          neighborhood:       form.neighborhood,
          unit_type:          form.unitType,
          monthly_rent:       rent,
          move_in_year:       moveInYear,
          includes_parking:   parking,
          includes_utilities: utilities,
          city:               "ottawa",
        });

        if (!error) {
          localStorage.setItem(COOLDOWN_KEY, String(Date.now()));
          setRealCount(prev => prev + 1);
        } else {
          setSaveWarning("Result shown, but your submission wasn't saved.");
        }
      }
    } catch {
      setSaveWarning("Result shown, but your submission wasn't saved.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    setResult(null);
    setForm({ neighborhood: "", unitType: "", rent: "", moveInYear: "" });
    setParking(false); setUtilities(false);
    setErrors({}); setSaveWarning("");
  }

  function getShareText() {
    const unit = UNIT_TYPES.find(u => u.key === form.unitType)?.label?.toLowerCase() || "unit";
    return `Ottawa Fair Rent: I'm paying ${result.todayPct > 0 ? "+" : ""}${result.todayPct}% vs today's market for a ${unit} in ${form.neighborhood}. ottawafairrent.ca`;
  }

  function copyLink() {
    navigator.clipboard?.writeText('https://ottawafairrent.ca');
    setToast(true);
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(false), 2800);
  }

  function nativeShare() {
    const unit = UNIT_TYPES.find(u => u.key === form.unitType)?.label?.toLowerCase() || "unit";
    if (navigator.share) {
      navigator.share({
        title: 'Ottawa Fair Rent',
        text: getShareText(),
        url: 'https://ottawafairrent.ca',
      }).catch(() => {});
    }
  }

  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));
  const verdict = result ? getVerdict(result.todayPct) : null;
  const insight = result ? getInsight(result.todayPct, +form.moveInYear) : null;

  return (
    <div style={{ minHeight: "100vh", width: "100%", background: "var(--bg)", fontFamily: "'Source Serif 4', serif", overflowX: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Playfair+Display:ital,wght@0,700;0,900;1,700;1,900&family=Source+Serif+4:opsz,wght@8..60,300;8..60,400;8..60,600&display=swap');

        html, body, #root { width: 100%; margin: 0; padding: 0; box-sizing: border-box; }

        :root {
          --ink:        #1a1a2e;
          --ink-muted:  #6b7280;
          --paper:      #fdfcf8;
          --paper-tint: #f7f5ef;
          --bg:         #ede9df;
          --rule:       #dddfe8;
          --accent:     #2e5c30;
          --accent-bg:  #f0fdf4;
          --accent-rule:#86efac;
        }

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        select, input { outline: none; }
        select:focus, input:focus {
          border-color: var(--accent) !important;
          box-shadow: 0 0 0 3px rgba(46,92,48,.13) !important;
        }

        .btn-primary {
          width: 100%; padding: 15px; background: var(--ink); color: var(--paper);
          border: none; border-radius: 6px;
          font-family: 'DM Mono', monospace; font-size: 13px;
          letter-spacing: .1em; text-transform: uppercase;
          cursor: pointer; transition: all .2s;
        }
        .btn-primary:hover  { background: #2a2a40; transform: translateY(-1px); }
        .btn-primary:active { transform: scale(.99); }
        .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }

        .btn-ghost {
          padding: 13px; background: transparent; color: var(--ink);
          border: 1.5px solid var(--rule); border-radius: 6px;
          font-family: 'DM Mono', monospace; font-size: 12px;
          letter-spacing: .08em; text-transform: uppercase;
          cursor: pointer; transition: all .2s;
        }
        .btn-ghost:hover { border-color: var(--ink); transform: translateY(-1px); }

        .btn-dark {
          padding: 13px; background: var(--ink); color: var(--paper); border: none;
          border-radius: 6px; font-family: 'DM Mono', monospace; font-size: 12px;
          letter-spacing: .08em; text-transform: uppercase;
          cursor: pointer; transition: all .2s;
        }
        .btn-dark:hover { opacity: .88; transform: translateY(-1px); }

        .reveal { opacity: 0; transform: translateY(12px); animation: revUp .5s cubic-bezier(.34,1.2,.64,1) forwards; }
        @keyframes revUp { to { opacity: 1; transform: translateY(0); } }
        .d1 { animation-delay: .04s; }
        .d2 { animation-delay: .11s; }
        .d3 { animation-delay: .18s; }
        .d4 { animation-delay: .25s; }
        .d5 { animation-delay: .32s; }

        @media (max-width: 580px) {
          .g2, .dg, .cta { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <Toast visible={toast} />

      {/* ── Masthead ── */}
      <header style={{ background: "var(--ink)", color: "var(--paper)", borderBottom: "4px solid var(--accent)", width: "100%" }}>
        <div style={{ borderBottom: "1px solid rgba(255,255,255,.1)", padding: "9px 28px", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 4 }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "rgba(255,255,255,.35)" }}>
            Ottawa · Ontario · Canada
          </div>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "rgba(255,255,255,.35)", letterSpacing: ".06em" }}>
            {new Date().toLocaleDateString("en-CA", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </div>
        </div>
        <div style={{ padding: "20px 28px 18px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(26px, 5vw, 42px)", fontWeight: 900, lineHeight: 1, letterSpacing: "-.01em" }}>
              Ottawa Fair Rent
            </div>
            <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 14, color: "rgba(255,255,255,.5)", marginTop: 6, fontStyle: "italic" }}>
              A community rent transparency tool for Ottawa renters
            </div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 30, fontWeight: 700, color: "#86efac", lineHeight: 1 }}>
              {countLoaded ? displayCount.toLocaleString() : "—"}
            </div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "rgba(255,255,255,.38)", letterSpacing: ".1em", textTransform: "uppercase", marginTop: 3 }}>
              submissions
            </div>
          </div>
        </div>
      </header>

      {/* ── Main ── */}
      <main style={{ maxWidth: 700, margin: "0 auto", padding: "32px 20px 72px" }}>

        {!result ? (
          <div style={{ background: "var(--paper)", borderRadius: 10, boxShadow: "0 2px 28px rgba(0,0,0,.08)", overflow: "hidden" }}>
            <div style={{ padding: "22px 26px 18px", borderBottom: "1px solid var(--rule)" }}>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, color: "var(--ink)" }}>Compare your rent</h2>
              <p style={{ fontFamily: "'Source Serif 4', serif", fontSize: 14, color: "var(--ink-muted)", marginTop: 5, lineHeight: 1.65 }}>
                Enter your details for an instant comparison against Ottawa market rates.
                Benchmarks are based on CMHC and Rentals.ca data, and improve as community submissions grow.
              </p>
            </div>

            <div style={{ padding: "22px 26px 26px", display: "flex", flexDirection: "column", gap: 16 }}>

              <div className="g2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Field label="Neighbourhood" error={errors.neighborhood}>
                  <select value={form.neighborhood} onChange={set("neighborhood")} style={selStyle(errors.neighborhood)}>
                    <option value="">Select…</option>
                    {NEIGHBORHOODS.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </Field>
                <Field label="Unit Type" error={errors.unitType}>
                  <select value={form.unitType} onChange={set("unitType")} style={selStyle(errors.unitType)}>
                    <option value="">Select…</option>
                    {UNIT_TYPES.map(u => <option key={u.key} value={u.key}>{u.label}</option>)}
                  </select>
                </Field>
              </div>

              <div className="g2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Field label="Monthly Rent (CAD)" error={errors.rent}>
                  <input type="number" placeholder="e.g. 2026" value={form.rent} onChange={set("rent")} style={inpStyle(errors.rent)} />
                </Field>
                <Field label="Year Moved In" error={errors.moveInYear}>
                  <input type="number" placeholder={String(curYear)} value={form.moveInYear} onChange={set("moveInYear")} style={inpStyle(errors.moveInYear)} />
                </Field>
              </div>

              <div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink-muted)", marginBottom: 9 }}>
                  Does your rent include…
                </div>
                <div className="g2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <ToggleChip label="Parking"   sub="+$250/mo to benchmark" checked={parking}   onChange={e => setParking(e.target.checked)}   />
                  <ToggleChip label="Utilities" sub="+$120/mo to benchmark" checked={utilities} onChange={e => setUtilities(e.target.checked)} />
                </div>
              </div>

              <button className="btn-primary" onClick={handleCalculate} disabled={submitting} style={{ marginTop: 4 }}>
                {submitting ? "Saving…" : "Compare My Rent →"}
              </button>

              <p style={{ textAlign: "center", fontFamily: "'DM Mono', monospace", fontSize: 10, color: "var(--ink-muted)", letterSpacing: ".06em", lineHeight: 1.8 }}>
                Anonymous · No account required · No personal data collected
              </p>
            </div>
          </div>

        ) : (
          <div style={{ background: "var(--paper)", borderRadius: 10, boxShadow: "0 2px 28px rgba(0,0,0,.08)", overflow: "hidden" }}>

            <div className={revealed ? "reveal d1" : ""} style={{ background: verdict.bg, borderBottom: `3px solid ${verdict.rule}`, padding: "26px 26px 20px" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 18, flexWrap: "wrap" }}>
                <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 900, fontSize: "clamp(48px,10vw,72px)", lineHeight: 1, color: verdict.ink, letterSpacing: "-.02em" }}>
                  {result.todayPct > 0 ? "+" : ""}{result.todayPct}%
                </div>
                <div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: verdict.ink, opacity: .65, marginBottom: 5 }}>
                    vs today's market
                  </div>
                  <div style={{
                    display: "inline-flex", alignItems: "center", gap: 7,
                    background: `${verdict.ink}14`, border: `1.5px solid ${verdict.rule}`,
                    borderRadius: 100, padding: "5px 14px",
                    fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 600, color: verdict.ink,
                    letterSpacing: ".04em",
                  }}>
                    {verdict.label}
                  </div>
                </div>
              </div>
              <Meter pct={result.todayPct} />
            </div>

            <div style={{ padding: "22px 26px 26px", display: "flex", flexDirection: "column", gap: 18 }}>

              <div className={`dg ${revealed ? "reveal d2" : ""}`} style={{
                display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
                border: "1px solid var(--rule)", borderRadius: 8, overflow: "hidden",
              }}>
                {[
                  { label: "Your Rent",      value: currency(result.rent)   },
                  { label: result.sameYear ? "Market (Now)" : "Move-in Market", value: currency(result.movein) },
                  { label: "Today's Market", value: currency(result.today)  },
                ].map(({ label, value }, i) => (
                  <div key={label} style={{
                    textAlign: "center", padding: "12px 8px",
                    borderRight: i < 2 ? "1px solid var(--rule)" : "none",
                  }}>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "var(--ink-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 5 }}>{label}</div>
                    <div style={{ fontFamily: "'Playfair Display', serif", fontSize: i === 0 ? 22 : 18, fontWeight: 700, color: "var(--ink)" }}>{value}</div>
                  </div>
                ))}
              </div>

              <div className={revealed ? "reveal d3" : ""} style={{ background: "var(--paper-tint)", border: "1px solid var(--rule)", borderRadius: 8, padding: "15px 18px" }}>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--ink-muted)", marginBottom: 9 }}>
                  Two comparisons
                </div>
                <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 14, color: "var(--ink)", lineHeight: 1.85 }}>
                  {result.sameYear ? (
                    <>You moved in this year, so the market reference is the same. Your rent is{" "}
                      <strong>{currency(Math.abs(result.todayDiff))}/month {result.todayDiff >= 0 ? "above" : "below"} today's market.</strong>
                    </>
                  ) : (
                    <>
                      <strong>When you moved in:</strong>{" "}
                      {result.moveinPct > 0 ? "+" : ""}{result.moveinPct}% vs market
                      {" · "}{currency(Math.abs(result.moveinDiff))}/month {result.moveinDiff >= 0 ? "above" : "below"} the move-in market.
                      <br />
                      <strong>Today:</strong>{" "}
                      {result.todayPct > 0 ? "+" : ""}{result.todayPct}% vs market
                      {" · "}{currency(Math.abs(result.todayDiff))}/month {result.todayDiff >= 0 ? "above" : "below"} today's market.
                    </>
                  )}
                </div>
              </div>

              <div className={revealed ? "reveal d4" : ""} style={{
                background: verdict.bg, border: `1px solid ${verdict.rule}`,
                borderLeft: `4px solid ${verdict.ink}`,
                borderRadius: 8, padding: "15px 18px",
              }}>
                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 16, fontWeight: 700, fontStyle: "italic", color: verdict.ink, marginBottom: 7 }}>
                  {insight.head}
                </div>
                <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 14, color: "#374151", lineHeight: 1.75 }}>
                  {insight.body}
                </div>
                {insight.link && (
                  <a href={insight.link.u} target="_blank" rel="noopener noreferrer" style={{
                    display: "inline-block", marginTop: 10,
                    fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: ".05em",
                    color: verdict.ink, textDecoration: "none",
                    borderBottom: `1px solid ${verdict.ink}40`, paddingBottom: 1,
                  }}>
                    {insight.link.t} →
                  </a>
                )}
              </div>

              {saveWarning && (
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#92400e", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 14px" }}>
                  ⚠ {saveWarning}
                </div>
              )}

              <div className={`cta ${revealed ? "reveal d5" : ""}`} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <button className="btn-ghost" onClick={handleReset}>← Check Another</button>
                <button className="btn-dark" onClick={() => setShareOpen(s => !s)}>Share Result ↗</button>
              </div>

              {shareOpen && (
                <div style={{ background: "var(--paper-tint)", border: "1px solid var(--rule)", borderRadius: 10, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink-muted)", marginBottom: 2 }}>Share your result</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <a href={`https://www.reddit.com/submit?url=https://ottawafairrent.ca&title=${encodeURIComponent(getShareText())}`} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "10px", background: "#ff4500", color: "white", borderRadius: 7, fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 600, textDecoration: "none", letterSpacing: ".04em" }}>
                      Reddit
                    </a>
                    <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(getShareText())}`} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "10px", background: "#000", color: "white", borderRadius: 7, fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 600, textDecoration: "none", letterSpacing: ".04em" }}>
                      X / Twitter
                    </a>
                    <a href={`https://www.threads.net/intent/post?text=${encodeURIComponent(getShareText())}`} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "10px", background: "#000", color: "white", borderRadius: 7, fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 600, textDecoration: "none", letterSpacing: ".04em" }}>
                      Threads
                    </a>
                    {navigator.share ? (
                      <button onClick={nativeShare} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "10px", background: "var(--ink)", color: "white", border: "none", borderRadius: 7, fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 600, cursor: "pointer", letterSpacing: ".04em" }}>
                        More ↗
                      </button>
                    ) : (
                      <button onClick={copyLink} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "10px", background: "var(--ink)", color: "white", border: "none", borderRadius: 7, fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 600, cursor: "pointer", letterSpacing: ".04em" }}>
                        Copy Link
                      </button>
                    )}
                  </div>
                </div>
              )}

            </div>
          </div>
        )}

        <p style={{ textAlign: "center", marginTop: 24, fontFamily: "'DM Mono', monospace", fontSize: 10, color: "var(--ink-muted)", letterSpacing: ".06em", lineHeight: 1.9 }}>
          Benchmarks based on CMHC Rental Market Survey, Rentals.ca, and Numbeo Ottawa data (2024–2025).
          <br />Accuracy improves as community submissions grow · Anonymous · Not legal or financial advice.
        </p>
      </main>
    </div>
  );
}
