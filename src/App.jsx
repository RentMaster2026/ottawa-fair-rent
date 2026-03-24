import { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import NeighbourhoodPage from "./NeighbourhoodPage";
import { OTTAWA_HOODS, OTTAWA_CITY } from "./hoodData";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// ─── Config ───────────────────────────────────────────────────────────────────

const CITY            = "ottawa";
const CITY_NAME       = "Ottawa";
const PROVINCE        = "Ontario";
const COOLDOWN_KEY    = "ottawa_fair_rent_last_submit";
const COOLDOWN_MS     = 60_000;
const ACCENT          = "#1a5c34";
const ACCENT_BG       = "#f0f7f2";
const SHARE_URL       = "https://ottawafairrent.ca";
const RENT_CONTROLLED = true;
const INFLATION       = 0.038;

const BASES = { bachelor:1550, "1br":2026, "2br":2530, "3br":3100, "3plus":3600 };
const HOODS = {
  "Alta Vista":0.95,"Barrhaven":0.92,"Bayshore / Britannia":0.96,
  "Beacon Hill":0.93,"Blackburn Hamlet":0.91,"Byward Market":1.18,
  "Carlington":0.88,"Centretown":1.08,"Chinatown / Lebreton":1.02,
  "Downtown Core":1.15,"Elmvale Acres":0.90,"Findlay Creek":0.89,
  "Gatineau (QC side)":0.82,"Glebe":1.20,"Greenboro":0.88,
  "Hintonburg":1.10,"Kanata":0.97,"Little Italy":1.07,
  "Lowertown":1.00,"Manor Park":1.06,"Manotick":0.94,
  "Nepean":0.93,"New Edinburgh":1.16,"Old Ottawa South":1.05,
  "Orleans":0.90,"Overbrook":0.90,"Queensway Terrace":0.94,
  "Rideau-Vanier":0.87,"Riverside South":0.91,"Rockcliffe Park":1.28,
  "Sandy Hill":1.04,"Stittsville":0.89,"Vanier":0.85,
  "Wellington Village":1.12,"Westboro":1.18,
};
const ADDONS = { parking:250, utilities:120 };
const GUIDELINES = {
  2010:0.021,2011:0.009,2012:0.031,2013:0.025,2014:0.008,
  2015:0.016,2016:0.020,2017:0.015,2018:0.018,2019:0.018,
  2020:0.022,2021:0.000,2022:0.012,2023:0.025,2024:0.025,
  2025:0.025,2026:0.021,
};
const UNITS = [
  { key:"bachelor", label:"Bachelor / Studio" },
  { key:"1br",      label:"1 Bedroom"         },
  { key:"2br",      label:"2 Bedroom"         },
  { key:"3br",      label:"3 Bedroom"         },
  { key:"3plus",    label:"3+ Bedroom"        },
];
const NEIGHBORHOODS = Object.keys(HOODS).sort((a,b) => a.localeCompare(b));
const MARKET_SNAPSHOT = [
  { label:"1-bedroom median",        val:"$1,945" },
  { label:"2-bedroom median",        val:"$2,490" },
  { label:"Vacancy rate (2025)",     val:"3.1%"   },
  { label:"Rent control guideline",  val:"2.1% (2026)" },
  { label:"Highest area",            val:"Rockcliffe Park" },
  { label:"Most affordable area",    val:"Vanier" },
];

// Median $/sq ft by unit type (Ottawa, estimated from CMHC + Rentals.ca 2025)
const MEDIAN_PSF = { bachelor:3.60, "1br":3.10, "2br":2.80, "3br":2.60, "3plus":2.40 };

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = v => Number(v).toLocaleString("en-CA", { style:"currency", currency:"CAD", maximumFractionDigits:0 });

function calcGuidelineCap(moveInRent, moveInYear) {
  const cur = new Date().getFullYear(); let r = moveInRent;
  for (let yr = moveInYear + 1; yr <= cur; yr++) r *= 1 + (GUIDELINES[yr] ?? 0.025);
  return Math.round(r);
}

function buildBreakdown(hood, unit, parking, utilities, smartBench, communityN) {
  const base         = BASES[unit] ?? BASES["1br"];
  const hoodMult     = HOODS[hood] ?? 1;
  const hoodAdj      = Math.round(base * hoodMult) - base;
  const afterHood    = Math.round(base * hoodMult);
  const parkingAdj   = parking   ? ADDONS.parking   : 0;
  const utilitiesAdj = utilities ? ADDONS.utilities : 0;
  const afterAmenity = afterHood + parkingAdj + utilitiesAdj;
  const w = communityN<5?0:communityN<10?0.2:communityN<20?0.4:communityN<50?0.6:0.8;
  const communityAdj = (smartBench != null && w > 0) ? Math.round((smartBench - afterHood) * w) : 0;
  const finalBench   = afterAmenity + communityAdj;
  return { base, hoodMult, hoodAdj, afterHood, parkingAdj, utilitiesAdj, communityAdj, communityN, w, finalBench };
}

function getRange(bench, confLabel, unit = "1br") {
  const spreads = { bachelor:0.09,"1br":0.10,"2br":0.11,"3br":0.13,"3plus":0.15 };
  const spread  = confLabel==="High" ? 0.07 : confLabel==="Medium" ? 0.10 : (spreads[unit]??0.11);
  return { low:Math.round(bench*(1-spread)/50)*50, high:Math.round(bench*(1+spread)/50)*50 };
}

function getConf(n) {
  if (n>=20) return { label:"High",   dot:"#1a5c34", textColor:"#1a5c34", bg:"#f0f7f2", border:"#a8d5b5", desc:`${n} local submissions blended with CMHC data.` };
  if (n>=8)  return { label:"Medium", dot:"#7a4f00", textColor:"#7a4f00", bg:"#fdf8f0", border:"#e8c97a", desc:`${n} local submissions blended with CMHC data.` };
  return           { label:"Low",    dot:"#8b1a1a", textColor:"#8b1a1a", bg:"#fdf0f0", border:"#e8a8a8", desc:"Based primarily on CMHC public data. Fewer than 8 local submissions." };
}

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a,b)=>a-b), m = Math.floor(s.length/2);
  return s.length%2 ? s[m] : (s[m-1]+s[m])/2;
}
function communityWeight(n) { return n<5?0:n<10?0.2:n<20?0.4:n<50?0.6:0.8; }

// ─── Fair Rent Canada Score ──────────────────────────────────────────────────

function calcMarketScore(rentNum, rangeLow, rangeHigh) {
  const span = rangeHigh - rangeLow;
  if (span <= 0) return 5.0;
  const pct = (rentNum - rangeLow) / span;
  if (pct < -0.5) return 10.0;
  if (pct <= 0.0) return 8.0 + ((-pct) / 0.5) * 2.0;
  if (pct <= 0.5) return 6.5 + ((0.5 - pct) / 0.5) * 1.5;
  if (pct <= 1.0) return 5.0 + ((1.0 - pct) / 0.5) * 1.5;
  if (pct <= 1.5) return 2.5 + ((1.5 - pct) / 0.5) * 2.5;
  return 1.0;
}

function calcPsfScore(userPsf, medianPsf) {
  if (!medianPsf || medianPsf <= 0) return null;
  const ratio = userPsf / medianPsf;
  if (ratio < 0.75) return 10.0;
  if (ratio <= 0.90) return 8.0 + ((0.90 - ratio) / 0.15) * 2.0;
  if (ratio <= 1.05) return 6.0 + ((1.05 - ratio) / 0.15) * 2.0;
  if (ratio <= 1.20) return 4.0 + ((1.20 - ratio) / 0.15) * 2.0;
  if (ratio <= 1.40) return 2.0 + ((1.40 - ratio) / 0.20) * 2.0;
  return 1.0;
}

function calcRentControlBonus(isRentControlled, guidelineCap, rentNum, sameYear) {
  if (sameYear) return 5.0;
  if (!RENT_CONTROLLED) return 5.0;
  if (!isRentControlled) return 2.0;
  if (!guidelineCap) return 5.0;
  const overPct = (rentNum - guidelineCap) / guidelineCap;
  if (overPct <= 0) return 10.0;
  if (overPct <= 0.10) return 6.0;
  return 3.0;
}

function calcFairRentScore(rentNum, range, sqftNum, unitType, isRentControlled, guidelineCap, sameYear) {
  const marketScore = calcMarketScore(rentNum, range.low, range.high);
  const rcBonus = calcRentControlBonus(isRentControlled, guidelineCap, rentNum, sameYear);

  let psfScore = null;
  let userPsf = null;
  let medPsf = null;

  if (sqftNum && sqftNum >= 100) {
    // Subtract parking/utility addons before computing $/sq ft
    userPsf = rentNum / sqftNum;
    medPsf = MEDIAN_PSF[unitType] ?? MEDIAN_PSF["1br"];
    psfScore = calcPsfScore(userPsf, medPsf);
  }

  let finalScore;
  if (psfScore !== null) {
    finalScore = (marketScore * 0.60) + (psfScore * 0.25) + (rcBonus * 0.15);
  } else {
    finalScore = (marketScore * 0.75) + (rcBonus * 0.25);
  }

  finalScore = Math.max(1.0, Math.min(10.0, finalScore));
  finalScore = Math.round(finalScore * 10) / 10;

  return { finalScore, marketScore, psfScore, rcBonus, userPsf, medPsf };
}

function getScoreLabel(score) {
  if (score >= 9.0) return { label:"Excellent", color:"#1a5c34", bg:"#f0f7f2", border:"#a8d5b5" };
  if (score >= 7.5) return { label:"Good",      color:"#1a5c34", bg:"#f0f7f2", border:"#a8d5b5" };
  if (score >= 6.0) return { label:"Fair",       color:"#7a4f00", bg:"#fdf8f0", border:"#e8c97a" };
  if (score >= 4.5) return { label:"Above Market", color:"#b45309", bg:"#fffbeb", border:"#fde68a" };
  if (score >= 3.0) return { label:"High",       color:"#8b1a1a", bg:"#fdf0f0", border:"#e8a8a8" };
  return             { label:"Very High", color:"#8b1a1a", bg:"#fdf0f0", border:"#e8a8a8" };
}

// ─── Misc ────────────────────────────────────────────────────────────────────

function useCountUp(target, dur=800) {
  const [val,set] = useState(0), raf = useRef(null), prev = useRef(0);
  useEffect(() => {
    if (!target) return;
    const from = prev.current; prev.current = target; let t0 = null;
    const tick = ts => { if(!t0)t0=ts; const p=Math.min((ts-t0)/dur,1); set(Math.round(from+(target-from)*p)); if(p<1)raf.current=requestAnimationFrame(tick); };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target]);
  return val;
}

// ─── CSS ─────────────────────────────────────────────────────────────────────

const CSS = `
  :root {
    --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
    --mono: "Courier New", Courier, monospace;
    --bg:   #f5f5f5;
    --white:#ffffff;
    --border:#cccccc;
    --border-dark:#999999;
    --t1:#111111; --t2:#444444; --t3:#767676;
    --accent:${ACCENT}; --accent-bg:${ACCENT_BG};
    --nav-bg:#1c2b36; --bar-bg:#2f4553;
  }
  html,body,#root{margin:0;padding:0;width:100%;background:var(--bg);}
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:var(--sans);font-size:15px;color:var(--t1);-webkit-font-smoothing:antialiased;line-height:1.5;}
  input,select,button,textarea{font-family:var(--sans);font-size:15px;}
  input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;}
  a{color:inherit;}

  .gov-nav{background:var(--nav-bg);border-bottom:3px solid var(--accent);}
  .gov-nav-inner{max-width:1100px;margin:0 auto;padding:0 16px;height:48px;display:flex;align-items:center;justify-content:space-between;gap:12px;}
  .gov-wordmark{font-size:13px;font-weight:700;color:#fff;text-decoration:none;white-space:nowrap;flex-shrink:0;}
  .gov-wordmark span{font-weight:400;color:#aab8c2;}
  .gov-count{font-family:var(--mono);font-size:11px;color:#aab8c2;white-space:nowrap;}
  .gov-subbar{background:var(--bar-bg);border-bottom:1px solid #3d5a6e;}
  .gov-subbar-inner{max-width:1100px;margin:0 auto;padding:0 16px;height:36px;display:flex;align-items:center;gap:20px;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;}
  .gov-subbar-inner::-webkit-scrollbar{display:none;}
  .gov-subbar a{font-size:12px;color:#aab8c2;text-decoration:none;white-space:nowrap;flex-shrink:0;}
  .gov-subbar a:hover{color:#fff;text-decoration:underline;}

  .page-wrap{max-width:1100px;margin:0 auto;padding:24px 20px 60px;}
  .page-heading{margin-bottom:20px;padding-bottom:14px;border-bottom:1px solid var(--border);}
  .page-heading h1{font-size:clamp(18px,2.5vw,24px);font-weight:700;color:var(--t1);margin-bottom:6px;line-height:1.2;}
  .page-heading p{font-size:13px;color:var(--t2);line-height:1.6;max-width:560px;}

  .hood-section{margin-bottom:20px;}
  .hood-label{font-size:11px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;}
  .hood-pills{display:flex;flex-wrap:wrap;gap:6px;}
  .hood-pill{padding:4px 10px;border:1px solid var(--border-dark);background:var(--white);font-size:12px;color:var(--t2);cursor:pointer;}
  .hood-pill:hover{background:var(--accent-bg);border-color:var(--accent);color:var(--accent);}

  .page-grid{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,0.95fr);gap:20px;align-items:start;}
  .left-col{display:flex;flex-direction:column;gap:16px;}
  .right-col{position:sticky;top:90px;}

  .form-panel{background:var(--white);border:1px solid var(--border);border-top:3px solid var(--accent);}
  .form-panel-header{padding:12px 16px 10px;border-bottom:1px solid var(--border);background:#fafafa;}
  .form-panel-title{font-size:14px;font-weight:700;color:var(--t1);}
  .form-panel-sub{font-size:11px;color:var(--t3);margin-top:2px;}
  .form-body{padding:14px;display:flex;flex-direction:column;gap:13px;}
  .field-label{display:block;font-size:11px;font-weight:700;color:var(--t2);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.04em;}
  .field-note{font-size:11px;color:var(--t3);margin-top:3px;line-height:1.4;}
  .field-error{font-size:11px;color:#8b1a1a;margin-top:3px;}
  .f-row{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
  .f-input{width:100%;padding:8px 10px;border:1px solid var(--border-dark);background:var(--white);color:var(--t1);font-size:14px;border-radius:0;appearance:none;}
  .f-input:focus{outline:2px solid var(--accent);outline-offset:0;border-color:var(--accent);}
  .f-select{width:100%;padding:8px 30px 8px 10px;border:1px solid var(--border-dark);background:var(--white) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23444'/%3E%3C/svg%3E") no-repeat right 10px center;color:var(--t1);font-size:14px;border-radius:0;appearance:none;cursor:pointer;}
  .f-select:focus{outline:2px solid var(--accent);outline-offset:0;}
  .yn-pair{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
  .yn-btn{padding:8px 10px;border:1px solid var(--border-dark);background:var(--white);color:var(--t2);font-size:13px;font-weight:600;cursor:pointer;text-align:center;}
  .yn-btn:hover{background:#f0f0f0;}
  .yn-btn.on{border-color:var(--accent);background:var(--accent-bg);color:var(--accent);}
  .toggle-pair{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
  .toggle-item{display:flex;align-items:flex-start;gap:8px;padding:8px 10px;border:1px solid var(--border-dark);background:var(--white);cursor:pointer;}
  .toggle-item.on{border-color:var(--accent);background:var(--accent-bg);}
  .toggle-item input[type=checkbox]{margin-top:2px;accent-color:var(--accent);width:14px;height:14px;flex-shrink:0;cursor:pointer;}
  .toggle-item-text{font-size:13px;color:var(--t1);line-height:1.3;}
  .toggle-item-sub{font-size:11px;color:var(--t3);}
  .bench-preview{padding:10px 12px;background:var(--accent-bg);border:1px solid #a8d5b5;border-left:3px solid var(--accent);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;}
  .bench-val{font-family:var(--mono);font-size:17px;font-weight:700;color:var(--accent);}
  .bench-label{font-size:11px;color:var(--t3);text-transform:uppercase;letter-spacing:0.04em;}
  .bench-source{font-size:11px;color:var(--t3);font-style:italic;}
  .btn-submit{width:100%;padding:11px 16px;background:var(--accent);color:#fff;border:none;font-size:14px;font-weight:700;cursor:pointer;letter-spacing:0.02em;}
  .btn-submit:hover:not(:disabled){background:#144d2b;}
  .btn-submit:disabled{background:#888;cursor:not-allowed;}
  .btn-anon{text-align:center;font-size:11px;color:var(--t3);margin-top:6px;}

  .snapshot{background:var(--white);border:1px solid var(--border);}
  .snapshot-header{padding:9px 14px;background:#fafafa;border-bottom:1px solid var(--border);font-size:12px;font-weight:700;color:var(--t2);text-transform:uppercase;letter-spacing:0.05em;}
  .snapshot-row{display:flex;justify-content:space-between;align-items:baseline;padding:7px 14px;border-bottom:1px solid #ebebeb;gap:12px;}
  .snapshot-row:last-child{border-bottom:none;}
  .snapshot-key{font-size:13px;color:var(--t2);flex:1;min-width:0;}
  .snapshot-val{font-family:var(--mono);font-size:13px;font-weight:700;color:var(--t1);flex-shrink:0;}

  .result-panel{background:var(--white);border:1px solid var(--border);}
  .result-placeholder{padding:28px 16px;text-align:center;}
  .result-placeholder-icon{width:44px;height:44px;border:2px solid var(--border);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;}
  .result-placeholder p{font-size:13px;color:var(--t3);line-height:1.6;max-width:240px;margin:0 auto 16px;}
  .result-header{padding:12px 14px;border-bottom:1px solid var(--border);background:#fafafa;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;}
  .result-header-meta{font-size:11px;color:var(--t3);margin-top:2px;}
  .result-verdict-badge{font-size:11px;font-weight:700;padding:3px 8px;letter-spacing:0.04em;white-space:nowrap;}
  .result-body{padding:14px;display:flex;flex-direction:column;gap:14px;}
  .range-bar-track{height:8px;background:#e0e0e0;position:relative;}
  .range-bar-fill{position:absolute;top:0;height:100%;}
  .range-bar-tick{position:absolute;top:50%;transform:translate(-50%,-50%);width:2px;height:14px;border-radius:1px;}
  .range-bar-dot{position:absolute;top:50%;transform:translate(-50%,-50%);width:12px;height:12px;border-radius:50%;border:2px solid;}
  .range-bar-foot{display:flex;justify-content:space-between;font-size:11px;color:var(--t3);margin-top:5px;font-family:var(--mono);}
  .range-bar-your{text-align:center;font-size:11px;font-weight:700;margin-top:3px;font-family:var(--mono);}
  .conf-badge{display:inline-flex;align-items:center;gap:5px;padding:3px 8px;font-size:11px;font-weight:600;border:1px solid;}
  .section-label{font-size:11px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:7px;}
  .data-table{width:100%;border-collapse:collapse;font-size:13px;}
  .data-table tr{border-bottom:1px solid var(--border);}
  .data-table tr:last-child{border-bottom:none;}
  .data-table td{padding:7px 0;vertical-align:top;}
  .data-table td:last-child{text-align:right;font-family:var(--mono);font-weight:700;white-space:nowrap;}
  .data-table td.sign-pos{color:#1a5c34;}
  .data-table tfoot td{font-weight:700;padding-top:9px;border-top:2px solid var(--t1);}
  .notice{padding:11px 13px;border-left:3px solid;font-size:13px;line-height:1.6;}
  .notice a{color:inherit;font-weight:600;}
  .notice-green{background:#f0f7f2;border-color:var(--accent);color:#1a4a28;}
  .notice-amber{background:#fdf8f0;border-color:#b37a00;color:#5a3d00;}
  .action-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
  .btn-secondary{padding:9px 12px;background:var(--white);border:1px solid var(--border-dark);color:var(--t2);font-size:13px;font-weight:600;cursor:pointer;text-align:center;}
  .btn-secondary:hover{background:#f0f0f0;}
  .share-row{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;}
  .share-btn{padding:8px 4px;font-size:11px;font-weight:700;text-decoration:none;text-align:center;cursor:pointer;border:none;}
  .sources{font-size:11px;color:var(--t3);line-height:1.6;padding-top:14px;border-top:1px solid var(--border);margin-top:20px;}
  .sources a{color:var(--t3);text-decoration:underline;}

  /* Score display */
  .score-hero{text-align:center;padding:20px 14px;border-bottom:1px solid var(--border);}
  .score-number{font-family:var(--mono);font-size:48px;font-weight:700;line-height:1;}
  .score-of-ten{font-family:var(--mono);font-size:18px;font-weight:400;color:var(--t3);}
  .score-label-badge{display:inline-block;padding:3px 10px;font-size:12px;font-weight:700;margin-top:8px;letter-spacing:0.04em;}
  .score-summary{font-size:13px;color:var(--t2);margin-top:8px;line-height:1.5;}
  .score-breakdown{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:12px;}
  .score-breakdown-item{text-align:center;padding:8px 6px;background:#f9f9f9;border:1px solid var(--border);}
  .score-breakdown-val{font-family:var(--mono);font-size:16px;font-weight:700;color:var(--t1);}
  .score-breakdown-label{font-size:10px;color:var(--t3);margin-top:2px;text-transform:uppercase;letter-spacing:0.04em;}

  .psf-section{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:#f9f9f9;border:1px solid var(--border);flex-wrap:wrap;gap:8px;}
  .psf-val{font-family:var(--mono);font-size:15px;font-weight:700;}
  .psf-label{font-size:11px;color:var(--t3);}
  .psf-compare{font-size:11px;color:var(--t2);}

  @media(max-width:768px){
    .page-grid{grid-template-columns:1fr;}
    .right-col{position:static;}
    .page-wrap{padding:16px 14px 48px;}
    .score-breakdown{grid-template-columns:1fr;}
  }
  @media(max-width:480px){
    .f-row{grid-template-columns:1fr;}
    .toggle-pair{grid-template-columns:1fr;}
    .share-row{grid-template-columns:1fr 1fr;}
    .gov-count{display:none;}
    .score-number{font-size:40px;}
  }
`;

// ─── Result Panel ─────────────────────────────────────────────────────────────

function ResultPanel({ result, hood, unitType, onReset }) {
  const [shareOpen, setShareOpen] = useState(false);
  const [copied,    setCopied]    = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const copyRef = useRef(null);

  const unitLabel = UNITS.find(u => u.key === unitType)?.label ?? unitType;
  const { breakdown:bd, conf, posCopy, pos, range, rent, communityN, score } = result;
  const sl = getScoreLabel(score.finalScore);

  const barMin  = Math.round(range.low  * 0.85 / 50) * 50;
  const barMax  = Math.round(range.high * 1.15 / 50) * 50;
  const barSpan = barMax - barMin;
  const lowPct  = ((range.low  - barMin) / barSpan) * 100;
  const highPct = ((range.high - barMin) / barSpan) * 100;
  const rentPct = Math.max(2, Math.min(98, ((rent - barMin) / barSpan) * 100));

  const badgeStyle = {
    above: { background:"#fdf0f0", color:"#8b1a1a", border:"1px solid #e8a8a8" },
    below: { background:"#f0f4fd", color:"#1a3a8b", border:"1px solid #a8b8e8" },
    within:{ background:"#f0f7f2", color:"#1a5c34", border:"1px solid #a8d5b5" },
  };

  function copyLink() {
    navigator.clipboard?.writeText(SHARE_URL);
    setCopied(true); clearTimeout(copyRef.current);
    copyRef.current = setTimeout(() => setCopied(false), 2000);
  }

  const shareText = () => {
    return `My ${unitLabel.toLowerCase()} in ${hood} scored ${score.finalScore}/10 on Fair Rent Canada. Check yours at ${SHARE_URL}`;
  };

  return (
    <div className="result-panel">
      {/* Score Hero */}
      <div className="score-hero" style={{ background:sl.bg, borderBottom:`1px solid ${sl.border}` }}>
        <div style={{ fontFamily:"var(--mono)", fontSize:10, color:"var(--t3)", textTransform:"uppercase", letterSpacing:".08em", marginBottom:8 }}>Fair Rent Canada Score</div>
        <div>
          <span className="score-number" style={{ color:sl.color }}>{score.finalScore}</span>
          <span className="score-of-ten"> / 10</span>
        </div>
        <div className="score-label-badge" style={{ background:sl.color, color:"#fff" }}>
          {sl.label}
        </div>
        <div className="score-summary">
          {score.finalScore >= 7.5 ? `Your rent is a good deal for ${hood}.`
           : score.finalScore >= 6.0 ? `Your rent is in line with comparable units in ${hood}.`
           : score.finalScore >= 4.5 ? `Your rent is above the typical range for ${hood}.`
           : `Your rent is significantly above market for ${hood}.`}
        </div>
        <div style={{ fontFamily:"var(--mono)", fontSize:10, color:"var(--t3)", marginTop:6 }}>
          {CITY_NAME} &middot; {hood} &middot; {unitLabel}
        </div>

        {/* Score component breakdown */}
        <div className="score-breakdown">
          <div className="score-breakdown-item">
            <div className="score-breakdown-val">{score.marketScore.toFixed(1)}</div>
            <div className="score-breakdown-label">Market Position</div>
          </div>
          {score.psfScore !== null ? (
            <div className="score-breakdown-item">
              <div className="score-breakdown-val">{score.psfScore.toFixed(1)}</div>
              <div className="score-breakdown-label">$/sq ft</div>
            </div>
          ) : (
            <div className="score-breakdown-item">
              <div className="score-breakdown-val" style={{ color:"var(--t3)" }}>N/A</div>
              <div className="score-breakdown-label">$/sq ft</div>
            </div>
          )}
          <div className="score-breakdown-item">
            <div className="score-breakdown-val">{score.rcBonus.toFixed(1)}</div>
            <div className="score-breakdown-label">Rent Control</div>
          </div>
        </div>

        {conf.label === "Low" && (
          <div style={{ fontSize:11, color:"var(--t3)", marginTop:8, fontStyle:"italic" }}>
            Score estimated with limited local data.
          </div>
        )}
      </div>

      <div className="result-body">
        {/* Price per sq ft */}
        {score.userPsf && (
          <div className="psf-section">
            <div>
              <div className="psf-label">Your price per sq ft</div>
              <div className="psf-val">${score.userPsf.toFixed(2)}/mo</div>
            </div>
            <div style={{ textAlign:"right" }}>
              <div className="psf-label">{hood} median</div>
              <div className="psf-val">${score.medPsf.toFixed(2)}/mo</div>
            </div>
            <div style={{ width:"100%", fontSize:11, color:"var(--t2)" }}>
              {score.userPsf <= score.medPsf
                ? `You are paying ${Math.round((1 - score.userPsf/score.medPsf)*100)}% less per sq ft than the local median.`
                : `You are paying ${Math.round((score.userPsf/score.medPsf - 1)*100)}% more per sq ft than the local median.`}
            </div>
          </div>
        )}

        {/* Range bar */}
        <div>
          <div className="section-label">Estimated fair rent range</div>
          <div style={{ fontSize:20, fontWeight:700, fontFamily:"var(--mono)", color:"var(--t1)", marginBottom:4 }}>
            {fmt(range.low)} &ndash; {fmt(range.high)}<span style={{ fontSize:13, fontWeight:400, color:"var(--t3)" }}> /mo</span>
          </div>
          <div style={{ position:"relative" }}>
            <div className="range-bar-track">
              <div className="range-bar-fill" style={{ left:lowPct+"%", width:Math.max(5, highPct-lowPct)+"%", background:posCopy.color }}/>
              <div className="range-bar-tick" style={{ left:lowPct+"%", background:posCopy.color, opacity:.6 }}/>
              <div className="range-bar-tick" style={{ left:highPct+"%", background:posCopy.color, opacity:.6 }}/>
              <div className="range-bar-dot"  style={{ left:rentPct+"%", borderColor:posCopy.color, background:pos==="within"?posCopy.color:"var(--white)" }}/>
            </div>
            <div className="range-bar-foot">
              <span>{fmt(barMin)}</span>
              <span>{fmt(barMax)}</span>
            </div>
            <div className="range-bar-your" style={{ color:posCopy.color }}>Your rent: {fmt(rent)}</div>
          </div>
          <div style={{ marginTop:8, display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
            <span style={{ fontSize:12, color:"var(--t3)" }}>Data confidence:</span>
            <span className="conf-badge" style={{ background:conf.bg, borderColor:conf.border, color:conf.textColor }}>
              <span style={{ width:6, height:6, borderRadius:"50%", background:conf.dot, display:"inline-block" }}/>
              {conf.label}
            </span>
            <span style={{ fontSize:11, color:"var(--t3)" }}>{conf.desc}</span>
          </div>
        </div>

        {/* Verdict sub-text */}
        <p style={{ fontSize:13, color:"var(--t2)", lineHeight:1.65, borderLeft:"3px solid var(--border)", paddingLeft:10 }}>{posCopy.sub}</p>

        {/* Expandable breakdown */}
        <div>
          <button onClick={()=>setShowBreakdown(b=>!b)} style={{ background:"none", border:"none", cursor:"pointer", fontFamily:"var(--sans)", fontSize:13, fontWeight:600, color:"var(--accent)", padding:0 }}>
            {showBreakdown ? "Hide calculation details" : "How this estimate was built"} {showBreakdown ? "▲" : "▼"}
          </button>
          {showBreakdown && (
            <table className="data-table" style={{ marginTop:8 }}>
              <tbody>
                <tr>
                  <td style={{ color:"var(--t2)" }}>City baseline ({unitLabel.toLowerCase()})</td>
                  <td>{fmt(bd.base)}</td>
                </tr>
                <tr>
                  <td style={{ color:"var(--t2)" }}>
                    Neighbourhood adjustment<br/>
                    <span style={{ fontSize:11, color:"var(--t3)" }}>{hood}: {bd.hoodMult>=1 ? "above" : "below"} city average ({((bd.hoodMult-1)*100).toFixed(0)}%)</span>
                  </td>
                  <td className={bd.hoodAdj>=0?"sign-pos":"sign-neg"}>
                    {bd.hoodAdj>=0?"+":""}{fmt(bd.hoodAdj)}
                  </td>
                </tr>
                {(bd.parkingAdj>0||bd.utilitiesAdj>0) && (
                  <tr>
                    <td style={{ color:"var(--t2)" }}>
                      Amenities included<br/>
                      <span style={{ fontSize:11, color:"var(--t3)" }}>
                        {[bd.parkingAdj>0&&"Parking (+$250)", bd.utilitiesAdj>0&&"Utilities (+$120)"].filter(Boolean).join(", ")}
                      </span>
                    </td>
                    <td>+{fmt(bd.parkingAdj+bd.utilitiesAdj)}</td>
                  </tr>
                )}
                <tr>
                  <td style={{ color:"var(--t2)" }}>
                    Local renter data<br/>
                    <span style={{ fontSize:11, color:"var(--t3)" }}>
                      {bd.communityN<5 ? "Fewer than 5 submissions, not enough to adjust" : `${bd.communityN} submissions (${Math.round(bd.w*100)}% weight)`}
                    </span>
                  </td>
                  <td className={bd.communityAdj===0?"":bd.communityAdj>0?"sign-pos":"sign-neg"}>
                    {bd.communityAdj===0?"\u2014":(bd.communityAdj>0?"+":"")+fmt(bd.communityAdj)}
                  </td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <td style={{ color:"var(--t1)" }}>Benchmark (midpoint)</td>
                  <td>{fmt(bd.finalBench)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        {/* Rent control */}
        {RENT_CONTROLLED && !result.sameYear && (
          <div>
            <div className="section-label">Ontario rent control</div>
            {result.isRentControlled ? (
              <div className="notice notice-green">
                <strong>Rent controlled unit.</strong> Ontario caps annual increases at 2.1% for 2026. Based on your move-in rent, the estimated legal maximum today is <strong>{fmt(result.guidelineCap)}/mo</strong>.
                {result.rent > result.guidelineCap
                  ? <span style={{ display:"block", marginTop:6, color:"#8b1a1a", fontWeight:600 }}>Your current rent of {fmt(result.rent)} may exceed this cap. Consider filing with the Landlord and Tenant Board.</span>
                  : <span style={{ display:"block", marginTop:4 }}>Your rent of {fmt(result.rent)} is within the legal cap.</span>
                }
                <a href="https://www.ontario.ca/page/residential-rent-increases" target="_blank" rel="noopener noreferrer" style={{ display:"inline-block", marginTop:8, fontSize:12 }}>Ontario rent increase guidelines &rarr;</a>
              </div>
            ) : (
              <div className="notice notice-amber">
                <strong>Not rent controlled.</strong> Your unit was first occupied after November 15, 2018. Your landlord can raise rent to any amount between tenancies, but must give 90 days written notice while you are living there.
                <a href="https://www.ontario.ca/page/renting-ontario-your-rights" target="_blank" rel="noopener noreferrer" style={{ display:"inline-block", marginTop:8, fontSize:12 }}>Tenant rights in Ontario &rarr;</a>
              </div>
            )}
          </div>
        )}

        {/* Data note */}
        <div style={{ fontSize:12, color:"var(--t3)", lineHeight:1.6, borderTop:"1px solid var(--border)", paddingTop:12 }}>
          This is a market estimate, not a legal determination. Results vary by building age, condition, floor, and included features.
          Sources: CMHC Rental Market Survey (Oct 2024) &middot; Rentals.ca (Feb 2025) &middot; Anonymous submissions.
        </div>

        {/* Actions */}
        <div className="action-row">
          <button className="btn-secondary" onClick={onReset}>Start over</button>
          <button className="btn-secondary" onClick={() => setShareOpen(s=>!s)}>Share result</button>
        </div>

        {shareOpen && (
          <div>
            <div className="section-label" style={{ marginBottom:6 }}>Share</div>
            <div className="share-row">
              <a className="share-btn" href={"https://www.reddit.com/submit?url="+SHARE_URL+"&title="+encodeURIComponent(shareText())} target="_blank" rel="noopener noreferrer" style={{ background:"#ff4500", color:"#fff" }}>Reddit</a>
              <a className="share-btn" href={"https://twitter.com/intent/tweet?text="+encodeURIComponent(shareText())} target="_blank" rel="noopener noreferrer" style={{ background:"#000", color:"#fff" }}>X</a>
              <a className="share-btn" href={"https://www.threads.net/intent/post?text="+encodeURIComponent(shareText())} target="_blank" rel="noopener noreferrer" style={{ background:"#111", color:"#fff" }}>Threads</a>
              <button className="share-btn" onClick={copyLink} style={{ background:copied?"#f0f7f2":"#f5f5f5", border:"1px solid #ccc", color:copied?"#1a5c34":"var(--t2)" }}>{copied?"Copied":"Copy link"}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  const curYear = new Date().getFullYear();

  const [hood,       setHood]       = useState("");
  const [unitType,   setUnitType]   = useState("");
  const [rent,       setRent]       = useState("");
  const [moveInYear, setMoveInYear] = useState("");
  const [sqft,       setSqft]       = useState("");
  const [parking,    setParking]    = useState(false);
  const [utilities,  setUtilities]  = useState(false);
  const [preNov2018, setPreNov2018] = useState(null);
  const [errors,     setErrors]     = useState({});

  const [result,      setResult]      = useState(null);
  const [submitting,  setSubmitting]  = useState(false);
  const [saveWarning, setSaveWarning] = useState("");

  const [smartBench,  setSmartBench]  = useState(null);
  const [communityN,  setCommunityN]  = useState(0);
  const [benchReady,  setBenchReady]  = useState(false);

  const [rawCount,    setRawCount]    = useState(0);
  const [countLoaded, setCountLoaded] = useState(false);
  const displayCount = useCountUp(countLoaded ? rawCount : 0);
  const [showHood,    setShowHood]    = useState(null);

  useEffect(() => {
    const KEY = CITY+"_count_cache";
    try { const {count,ts}=JSON.parse(localStorage.getItem(KEY)||"{}"); if(Date.now()-ts<5*60*1000){setRawCount(count);setCountLoaded(true);} } catch{}
    supabase.from("rent_submissions").select("*",{count:"exact",head:true}).eq("city",CITY)
      .then(({count})=>{ const n=count??0; setRawCount(n); setCountLoaded(true); try{localStorage.setItem(KEY,JSON.stringify({count:n,ts:Date.now()}));}catch{} });
  }, []);

  useEffect(() => {
    if (!hood||!unitType){ setSmartBench(null); setCommunityN(0); setBenchReady(false); return; }
    setBenchReady(false);
    const cutoff=new Date(); cutoff.setFullYear(curYear-2);
    supabase.from("rent_submissions").select("monthly_rent")
      .eq("city",CITY).eq("neighborhood",hood).eq("unit_type",unitType)
      .gte("monthly_rent",500).lte("monthly_rent",8000).gte("created_at",cutoff.toISOString())
      .then(({data})=>{
        const base=Math.round((BASES[unitType]??BASES["1br"])*(HOODS[hood]??1));
        if(!data?.length){setSmartBench(base);setCommunityN(0);setBenchReady(true);return;}
        const n=data.length,w=communityWeight(n),med=median(data.map(r=>r.monthly_rent));
        setCommunityN(n); setSmartBench(w===0?base:Math.round(base*(1-w)+med*w)); setBenchReady(true);
      });
  }, [hood, unitType]);

  function validate() {
    const e={};
    if(!hood)                              e.hood="Select a neighbourhood";
    if(!unitType)                          e.unitType="Select a unit type";
    if(!rent||isNaN(+rent)||+rent<300)     e.rent="Enter a valid monthly rent";
    const yr=+moveInYear;
    if(!moveInYear||yr<1980||yr>curYear)   e.moveInYear=`Enter a year between 1980 and ${curYear}`;
    if(RENT_CONTROLLED&&preNov2018===null) e.preNov2018="Please select one";
    // sqft is optional, but validate if provided
    if(sqft && (isNaN(+sqft) || +sqft < 100 || +sqft > 10000)) e.sqft="Enter a size between 100 and 10,000 sq ft";
    return e;
  }

  async function handleCalc() {
    const e=validate();
    if(Object.keys(e).length){setErrors(e);return;}
    setErrors({}); setSaveWarning(""); setSubmitting(true);

    const rentNum=+rent, yr=+moveInYear, sameYear=yr===curYear;
    const sqftNum = sqft ? +sqft : null;
    const bd    = buildBreakdown(hood,unitType,parking,utilities,smartBench,communityN);
    const conf  = getConf(communityN);
    const range = getRange(bd.finalBench,conf.label,unitType);
    const pos   = rentNum<range.low?"below":rentNum>range.high?"above":"within";
    const posCopy = pos==="below"
      ? { headline:"Your rent is below the estimated fair range for this area.", sub:`Your rent is ${fmt(range.low-rentNum)}/mo below the lower end of comparable units in ${hood}. This is a favourable position.`, color:"#1a3a8b" }
      : pos==="above"
      ? { headline:"Your rent is above the estimated fair range for this area.", sub:`Your rent is ${fmt(rentNum-range.high)}/mo above the upper end of comparable units in ${hood}. It may be worth reviewing what is included.`, color:"#8b1a1a" }
      : { headline:"Your rent is within the estimated fair range for this area.", sub:`Your rent falls within the range we estimate for comparable units in ${hood}. This suggests it is broadly in line with the local market.`, color:"#1a5c34" };

    const yearsAgo    = Math.max(0,curYear-yr);
    const moveinBench = Math.round(bd.finalBench*Math.pow(1-INFLATION,yearsAgo));
    const guidelineCap= (!sameYear&&RENT_CONTROLLED&&preNov2018)?calcGuidelineCap(moveinBench,yr):null;

    // Calculate Fair Rent Canada Score
    const scoreData = calcFairRentScore(rentNum, range, sqftNum, unitType, preNov2018===true, guidelineCap, sameYear);

    setResult({rent:rentNum,range,conf,pos,posCopy,breakdown:bd,moveinBench,guidelineCap,isRentControlled:preNov2018===true,sameYear,moveInYear:yr,communityN,score:scoreData});

    try {
      const last=Number(localStorage.getItem(COOLDOWN_KEY)??0);
      if(Date.now()-last>=COOLDOWN_MS){
        const{error}=await supabase.from("rent_submissions").insert({
          neighborhood:hood,unit_type:unitType,monthly_rent:rentNum,
          move_in_year:yr,includes_parking:parking,includes_utilities:utilities,city:CITY,
        });
        if(!error){localStorage.setItem(COOLDOWN_KEY,String(Date.now()));setRawCount(p=>p+1);}
        else setSaveWarning("Result shown. Your submission was not saved due to a server error.");
      }
    } catch { setSaveWarning("Result shown. Your submission was not saved."); }
    finally { setSubmitting(false); }
  }

  function handleReset() {
    setResult(null); setHood(""); setUnitType(""); setRent(""); setMoveInYear(""); setSqft("");
    setParking(false); setUtilities(false); setPreNov2018(null); setErrors({}); setSaveWarning("");
    window.scrollTo(0,0);
  }

  const previewBench = benchReady&&smartBench!=null
    ? Math.round(smartBench)+(parking?ADDONS.parking:0)+(utilities?ADDONS.utilities:0)
    : null;
  const benchLabel = communityN>=20?`${communityN} local submissions`:communityN>=5?`${communityN} submissions + CMHC`:"CMHC baseline";

  if (showHood) return (
    <NeighbourhoodPage
      hood={OTTAWA_HOODS[showHood]}
      city={OTTAWA_CITY}
      onBack={() => { setShowHood(null); window.scrollTo(0,0); }}
    />
  );

  return (
    <>
      <style>{CSS}</style>
      <div style={{ minHeight:"100vh", background:"var(--bg)" }}>

        {/* NAV */}
        <div className="gov-nav">
          <div className="gov-nav-inner">
            <a href="https://fairrent.ca" className="gov-wordmark">
              Fair Rent Canada <span>/ {CITY_NAME}</span>
            </a>
            {countLoaded && (
              <div className="gov-count">{displayCount.toLocaleString("en-CA")} submissions</div>
            )}
          </div>
        </div>

        {/* SUB-NAV */}
        <div className="gov-subbar">
          <div className="gov-subbar-inner">
            <a href="https://fairrent.ca">All cities</a>
            <a href="https://fairrent.ca/methodology">Methodology</a>
            <a href="https://fairrent.ca/about">About</a>
            <a href="https://fairrent.ca/faq">FAQ</a>
          </div>
        </div>

        {/* PAGE */}
        <div className="page-wrap">

          {/* Page heading */}
          <div style={{ marginBottom:20, paddingBottom:16, borderBottom:"1px solid var(--border)" }}>
            <h1 style={{ fontSize:"clamp(18px,3vw,24px)", fontWeight:700, color:"var(--t1)", marginBottom:4, lineHeight:1.2 }}>
              {CITY_NAME} Rent Calculator: Check If Your Rent Is Fair
            </h1>
            <p style={{ fontSize:13, color:"var(--t2)", lineHeight:1.5 }}>
              Find out if your {CITY_NAME} rent is fair. Compare what you pay to real market data from CMHC and local renter submissions.
              Free. Anonymous. No account required.
            </p>
          </div>

          {/* Neighbourhood browse */}
          <div className="hood-section">
            <div className="hood-label">Browse by neighbourhood</div>
            <div className="hood-pills">
              {Object.keys(OTTAWA_HOODS).map(slug => (
                <button key={slug} className="hood-pill" onClick={() => setShowHood(slug)}>
                  {OTTAWA_HOODS[slug].name}
                </button>
              ))}
            </div>
          </div>

          {/* Two-column grid */}
          <div className="page-grid">

            {/* LEFT: Form */}
            <div className="left-col">
              <div className="form-panel">
                <div className="form-panel-header">
                  <div className="form-panel-title">Enter your rental details</div>
                  <div className="form-panel-sub">All fields required unless marked optional</div>
                </div>
                <div className="form-body">

                  {/* Neighbourhood + Unit */}
                  <div className="f-row">
                    <div>
                      <label className="field-label">Neighbourhood</label>
                      <select className="f-select" value={hood} onChange={e=>setHood(e.target.value)} style={{ borderColor:errors.hood?"#8b1a1a":undefined }}>
                        <option value="">Select...</option>
                        {NEIGHBORHOODS.map(n=><option key={n} value={n}>{n}</option>)}
                      </select>
                      {errors.hood&&<div className="field-error">{errors.hood}</div>}
                    </div>
                    <div>
                      <label className="field-label">Unit type</label>
                      <select className="f-select" value={unitType} onChange={e=>setUnitType(e.target.value)} style={{ borderColor:errors.unitType?"#8b1a1a":undefined }}>
                        <option value="">Select...</option>
                        {UNITS.map(u=><option key={u.key} value={u.key}>{u.label}</option>)}
                      </select>
                      {errors.unitType&&<div className="field-error">{errors.unitType}</div>}
                    </div>
                  </div>

                  {/* Rent + Year */}
                  <div className="f-row">
                    <div>
                      <label className="field-label">Monthly rent (CAD)</label>
                      <input className="f-input" type="number" placeholder="e.g. 2200" value={rent} onChange={e=>setRent(e.target.value)} style={{ borderColor:errors.rent?"#8b1a1a":undefined }}/>
                      {errors.rent&&<div className="field-error">{errors.rent}</div>}
                    </div>
                    <div>
                      <label className="field-label">Year moved in</label>
                      <input className="f-input" type="number" placeholder={String(curYear)} value={moveInYear} onChange={e=>setMoveInYear(e.target.value)} style={{ borderColor:errors.moveInYear?"#8b1a1a":undefined }}/>
                      {errors.moveInYear&&<div className="field-error">{errors.moveInYear}</div>}
                    </div>
                  </div>

                  {/* Square footage (optional) */}
                  <div>
                    <label className="field-label">Unit size in sq ft <span style={{ fontWeight:400, textTransform:"none" }}>(optional)</span></label>
                    <input className="f-input" type="number" placeholder="e.g. 650" value={sqft} onChange={e=>setSqft(e.target.value)} style={{ maxWidth:200, borderColor:errors.sqft?"#8b1a1a":undefined }}/>
                    {errors.sqft&&<div className="field-error">{errors.sqft}</div>}
                    <div className="field-note">Adding your unit size improves your score accuracy. We compare your price per square foot to the neighbourhood median.</div>
                  </div>

                  {/* Rent control */}
                  {RENT_CONTROLLED && (
                    <div>
                      <label className="field-label">Was your unit first occupied before Nov. 15, 2018?</label>
                      <div className="yn-pair">
                        <button type="button" className={"yn-btn"+(preNov2018===true?" on":"")} onClick={()=>setPreNov2018(true)}>Yes, rent controlled</button>
                        <button type="button" className={"yn-btn"+(preNov2018===false?" on":"")} onClick={()=>setPreNov2018(false)}>No, not controlled</button>
                      </div>
                      {errors.preNov2018&&<div className="field-error">{errors.preNov2018}</div>}
                      <div className="field-note">Units first occupied before Nov. 15, 2018 are subject to Ontario's annual rent increase guideline (2.1% for 2026).</div>
                    </div>
                  )}

                  {/* Toggles */}
                  <div>
                    <label className="field-label">Rent includes</label>
                    <div className="toggle-pair">
                      <label className={"toggle-item"+(parking?" on":"")}>
                        <input type="checkbox" checked={parking} onChange={e=>setParking(e.target.checked)}/>
                        <div>
                          <div className="toggle-item-text">Parking</div>
                          <div className="toggle-item-sub">+$250/mo added to benchmark</div>
                        </div>
                      </label>
                      <label className={"toggle-item"+(utilities?" on":"")}>
                        <input type="checkbox" checked={utilities} onChange={e=>setUtilities(e.target.checked)}/>
                        <div>
                          <div className="toggle-item-text">Utilities</div>
                          <div className="toggle-item-sub">+$120/mo added to benchmark</div>
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* Benchmark preview */}
                  {hood&&unitType&&benchReady&&previewBench!=null&&(
                    <div className="bench-preview">
                      <div>
                        <div className="bench-label">{CITY_NAME} benchmark: {hood}</div>
                        <div className="bench-val">{fmt(previewBench)}<span style={{ fontSize:12, fontWeight:400, color:"var(--t3)" }}>/mo</span></div>
                      </div>
                      <div className="bench-source">{benchLabel}</div>
                    </div>
                  )}

                  <button className="btn-submit" onClick={handleCalc} disabled={submitting}>
                    {submitting?"Processing...":"Compare my rent"}
                  </button>
                  <div className="btn-anon">Anonymous &middot; No account required &middot; No personal data stored</div>
                </div>
              </div>

              {/* Market snapshot */}
              <div className="snapshot">
                <div className="snapshot-header">{CITY_NAME} rental market: 2025</div>
                {MARKET_SNAPSHOT.map(({label,val}) => (
                  <div key={label} className="snapshot-row">
                    <span className="snapshot-key">{label}</span>
                    <span className="snapshot-val">{val}</span>
                  </div>
                ))}
                <div style={{ padding:"8px 14px", fontSize:11, color:"var(--t3)", borderTop:"1px solid var(--border)" }}>
                  Source: CMHC 2025 Rental Market Report &middot; Rentals.ca Feb 2025
                </div>
              </div>

              {saveWarning&&(
                <div className="notice notice-amber">{saveWarning}</div>
              )}
            </div>

            {/* RIGHT: Result */}
            <div className="right-col">
              {result ? (
                <ResultPanel result={result} hood={hood} unitType={unitType} onReset={handleReset}/>
              ) : (
                <div className="result-panel">
                  <div className="result-placeholder">
                    <div className="result-placeholder-icon">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="1.5" strokeLinecap="round"><path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
                    </div>
                    <p>Your result will appear here after you fill in your rental details and click <strong>Compare my rent</strong>.</p>
                    <div style={{ marginTop:20, textAlign:"left", border:"1px solid var(--border)", padding:"12px 14px" }}>
                      <div className="section-label" style={{ marginBottom:8 }}>What you will receive</div>
                      {["Fair Rent Canada Score (1 to 10)","Estimated fair rent range for your neighbourhood","Price per square foot comparison (if size provided)","Ontario rent control status and estimated legal maximum"].map(item=>(
                        <div key={item} style={{ display:"flex", gap:8, alignItems:"flex-start", marginBottom:6 }}>
                          <span style={{ color:"var(--accent)", fontWeight:700, flexShrink:0, marginTop:1 }}>&#10003;</span>
                          <span style={{ fontSize:13, color:"var(--t2)", lineHeight:1.4 }}>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Sources */}
          <div className="sources">
            Data sources: CMHC Rental Market Survey (October 2024) &middot; Rentals.ca National Rent Report (February 2025) &middot; Anonymous community submissions. &nbsp;
            Results are market estimates for general reference only. Not legal or financial advice. &nbsp;
            <a href="https://fairrent.ca/methodology" style={{ color:"var(--t3)" }}>Methodology</a> &middot;
            <a href="https://fairrent.ca/privacy" style={{ color:"var(--t3)", marginLeft:6 }}>Privacy</a>
          </div>
        </div>
      </div>
    </>
  );
}
