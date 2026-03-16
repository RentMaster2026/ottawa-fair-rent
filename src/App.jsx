import { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const CITY         = "ottawa";
const COOLDOWN_KEY = "ottawa_fair_rent_last_submit";
const COOLDOWN_MS  = 60_000;
const ACCENT       = "#16a34a";
const ACCENT_LIGHT = "#f0fdf4";
const ACCENT_BORDER= "#bbf7d0";
const INFLATION    = 0.038;
const SHARE_URL    = "https://ottawafairrent.ca";

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
const NEIGHBORHOODS = Object.keys(HOODS).sort((a,b)=>a.localeCompare(b));

// ─── Pure functions ───────────────────────────────────────────────────────────

const fmt = v => Number(v).toLocaleString("en-CA",{style:"currency",currency:"CAD",maximumFractionDigits:0});

function calcGuidelineCap(moveInRent, moveInYear) {
  const cur = new Date().getFullYear();
  let r = moveInRent;
  for(let yr=moveInYear+1; yr<=cur; yr++) r *= 1+(GUIDELINES[yr]??0.025);
  return Math.round(r);
}

function buildBreakdown(hood, unit, parking, utilities, smartBench, communityN) {
  const base      = BASES[unit] ?? BASES["1br"];
  const hoodMult  = HOODS[hood] ?? 1;
  const hoodAdj   = Math.round(base * hoodMult) - base;
  const afterHood = Math.round(base * hoodMult);
  const parkingAdj   = parking   ? ADDONS.parking   : 0;
  const utilitiesAdj = utilities ? ADDONS.utilities : 0;
  const afterAmenity = afterHood + parkingAdj + utilitiesAdj;
  const w = communityN < 5  ? 0
          : communityN < 10 ? 0.2
          : communityN < 20 ? 0.4
          : communityN < 50 ? 0.6 : 0.8;
  const communityAdj = (smartBench != null && w > 0)
    ? Math.round((smartBench - afterHood) * w)
    : 0;
  const finalBench = afterAmenity + communityAdj;
  return { base, hoodMult, hoodAdj, afterHood, parkingAdj, utilitiesAdj, afterAmenity, communityAdj, communityN, w, finalBench };
}

function getRange(bench, confLabel) {
  const spread = confLabel==="High" ? 0.08 : confLabel==="Medium" ? 0.13 : 0.19;
  return {
    low:  Math.round(bench*(1-spread)/50)*50,
    high: Math.round(bench*(1+spread)/50)*50,
  };
}

function getConf(n) {
  if(n>=20) return { label:"High",   dot:"#16a34a", textColor:"#166534", bg:"#f0fdf4", border:"#bbf7d0", desc:"Based on " + n + " local submissions blended with CMHC data." };
  if(n>=8)  return { label:"Medium", dot:"#d97706", textColor:"#92400e", bg:"#fffbeb", border:"#fde68a", desc:"Based on " + n + " local submissions blended with CMHC data." };
  return           { label:"Low",    dot:"#dc2626", textColor:"#991b1b", bg:"#fef2f2", border:"#fecaca", desc:"Based primarily on CMHC data. Submit your rent to improve accuracy for this area." };
}

function median(arr) {
  if(!arr.length) return null;
  const s=[...arr].sort((a,b)=>a-b), m=Math.floor(s.length/2);
  return s.length%2 ? s[m] : (s[m-1]+s[m])/2;
}

function communityWeight(n) {
  if(n<5) return 0; if(n<10) return 0.2; if(n<20) return 0.4; if(n<50) return 0.6; return 0.8;
}

function useCountUp(target, dur=1000) {
  const[val,set]=useState(0), raf=useRef(null), prev=useRef(0);
  useEffect(()=>{
    if(!target)return; const from=prev.current; prev.current=target; let t0=null;
    const tick=ts=>{ if(!t0)t0=ts; const p=Math.min((ts-t0)/dur,1); set(Math.round(from+(target-from)*(1-Math.pow(1-p,3)))); if(p<1)raf.current=requestAnimationFrame(tick); };
    raf.current=requestAnimationFrame(tick); return()=>cancelAnimationFrame(raf.current);
  },[target]); return val;
}

// ─── CSS ─────────────────────────────────────────────────────────────────────

const CSS = [
  "@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap');",
  ":root{--serif:'Instrument Serif',Georgia,serif;--sans:'Geist',-apple-system,BlinkMacSystemFont,sans-serif;--mono:'Geist Mono','Courier New',monospace;--bg:#f9fafb;--bg-card:#ffffff;--border:#e2e8f0;--border-mid:#cbd5e1;--t1:#0f172a;--t2:#475569;--t3:#94a3b8;--green:#16a34a;--green-lt:#f0fdf4;--green-bd:#bbf7d0;--nav:#0f172a;--r-sm:6px;--r-md:10px;--r-lg:14px;--sh:0 1px 4px rgba(0,0,0,.06);--sh-hover:0 4px 16px rgba(0,0,0,.09);--max:700px;}",
  "html,body,#root{margin:0;padding:0;width:100%;background:var(--bg);}",
  "*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}",
  "body{font-family:var(--sans);color:var(--t1);-webkit-font-smoothing:antialiased;}",
  "input,select,button{font-family:var(--sans);}",
  "input:focus,select:focus{outline:none;border-color:#16a34a!important;box-shadow:0 0 0 3px rgba(22,163,74,.15)!important;}",
  "input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;}",
  ".card{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--r-lg);box-shadow:var(--sh);}",
  ".slabel{font-family:var(--mono);font-size:10px;color:var(--t3);text-transform:uppercase;letter-spacing:.1em;margin-bottom:14px;}",
  ".inp{width:100%;padding:11px 14px;background:var(--bg-card);border:1.5px solid var(--border);border-radius:var(--r-md);color:var(--t1);font-size:15px;transition:border-color .15s,box-shadow .15s;appearance:none;}",
  ".inp::placeholder{color:var(--t3);}",
  ".sel{background-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%2394a3b8' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E\");background-repeat:no-repeat;background-position:right 13px center;padding-right:36px;cursor:pointer;}",
  ".sel option{background:#fff;color:#0f172a;}",
  ".toggle-btn{display:flex;align-items:center;gap:12px;padding:12px 14px;background:var(--bg-card);border:1.5px solid var(--border);border-radius:var(--r-md);cursor:pointer;text-align:left;transition:border-color .15s,background .15s;}",
  ".toggle-btn.on{border-color:#bbf7d0;background:#f0fdf4;}",
  ".opt-btn{flex:1;padding:10px 14px;background:var(--bg-card);border:1.5px solid var(--border);border-radius:var(--r-md);color:var(--t2);font-size:13px;font-weight:500;cursor:pointer;transition:all .15s;}",
  ".opt-btn.on{border-color:#bbf7d0;background:#f0fdf4;color:#16a34a;font-weight:600;}",
  ".btn-primary{width:100%;padding:13px;background:var(--t1);color:#fff;border:none;border-radius:var(--r-md);font-size:14px;font-weight:600;cursor:pointer;transition:background .15s;letter-spacing:.01em;}",
  ".btn-primary:hover:not(:disabled){background:#1e293b;}",
  ".btn-primary:disabled{opacity:.4;cursor:not-allowed;}",
  ".btn-ghost{padding:11px 20px;background:transparent;border:1.5px solid var(--border);border-radius:var(--r-md);color:var(--t2);font-size:13px;font-weight:600;cursor:pointer;transition:border-color .15s,color .15s;}",
  ".btn-ghost:hover{border-color:var(--border-mid);color:var(--t1);}",
  ".share-btn{display:flex;align-items:center;justify-content:center;padding:9px 12px;border-radius:var(--r-sm);font-family:var(--mono);font-size:11px;font-weight:500;text-decoration:none;cursor:pointer;border:none;letter-spacing:.03em;transition:opacity .15s;}",
  ".share-btn:hover{opacity:.8;}",
  ".breakdown-row{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:11px 0;border-bottom:1px solid var(--border);}",
  ".breakdown-row:last-child{border-bottom:none;}",
  ".range-bar-track{height:6px;border-radius:6px;background:var(--border);position:relative;margin:10px 0 6px;}",
  ".live-dot{width:6px;height:6px;border-radius:50%;background:#16a34a;flex-shrink:0;animation:blink 2.4s ease-in-out infinite;}",
  "@keyframes blink{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(1.5)}}",
  ".err-msg{font-size:11px;color:#dc2626;margin-top:4px;}",
  ".fade-up{opacity:0;transform:translateY(10px);animation:fu .4s ease forwards;}",
  "@keyframes fu{to{opacity:1;transform:none;}}",
  ".d1{animation-delay:.04s}.d2{animation-delay:.09s}.d3{animation-delay:.14s}.d4{animation-delay:.19s}.d5{animation-delay:.24s}.d6{animation-delay:.29s}.d7{animation-delay:.34s}",
  "@media(max-width:580px){.g2{grid-template-columns:1fr!important}.g3{grid-template-columns:1fr 1fr!important}.gcta{grid-template-columns:1fr!important}.gshare{grid-template-columns:1fr 1fr!important}}"
].join("\n");

// ─── Result page ─────────────────────────────────────────────────────────────

function ResultPage({ result, hood, unitType, onReset }) {
  const [shareOpen, setShareOpen] = useState(false);
  const [copied,    setCopied]    = useState(false);
  const [showCard,  setShowCard]  = useState(false);
  const copyRef = useRef(null);

  const unitLabel = UNITS.find(u=>u.key===unitType)?.label ?? unitType;
  const bd        = result.breakdown;
  const conf      = result.conf;
  const posCopy   = result.posCopy;
  const pos       = result.pos;

  function copyLink() {
    navigator.clipboard?.writeText(SHARE_URL);
    setCopied(true);
    clearTimeout(copyRef.current);
    copyRef.current = setTimeout(()=>setCopied(false), 2000);
  }

  function shareText() {
    const posLabel = pos==="below" ? "below" : pos==="above" ? "above" : "within";
    return "My " + unitLabel.toLowerCase() + " in " + hood + " is " + posLabel + " the estimated fair rent range. Estimated range: " + fmt(result.range.low) + "-" + fmt(result.range.high) + "/mo. Check yours at " + SHARE_URL;
  }

  // Range bar math
  const barMin  = Math.round(result.range.low  * 0.85 / 50) * 50;
  const barMax  = Math.round(result.range.high * 1.15 / 50) * 50;
  const barSpan = barMax - barMin;
  const lowPct  = ((result.range.low  - barMin) / barSpan) * 100;
  const highPct = ((result.range.high - barMin) / barSpan) * 100;
  const rentPct = Math.max(2, Math.min(98, ((result.rent - barMin) / barSpan) * 100));

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>

      {/* 1 ── POSITION + RANGE BAR ────────────────────────────────────────── */}
      <div className="card fade-up d1" style={{padding:"28px 24px",background:posCopy.bg,borderColor:posCopy.border}}>

        <div style={{fontFamily:"var(--mono)",fontSize:10,color:posCopy.color,letterSpacing:".1em",textTransform:"uppercase",marginBottom:12,opacity:.8}}>
          Ottawa &middot; {hood} &middot; {unitLabel}
        </div>

        <h2 style={{fontFamily:"var(--serif)",fontSize:"clamp(20px,3.5vw,28px)",fontWeight:400,color:"var(--t1)",lineHeight:1.2,marginBottom:8}}>
          {posCopy.headline}
        </h2>
        <p style={{fontSize:14,color:"var(--t2)",lineHeight:1.7,marginBottom:24}}>{posCopy.sub}</p>

        {/* Range bar */}
        <div style={{marginBottom:20}}>
          <div style={{display:"flex",justifyContent:"space-between",fontFamily:"var(--mono)",fontSize:11,color:"var(--t3)",marginBottom:6}}>
            <span>Estimated fair range</span>
            <span style={{color:"var(--t2)",fontWeight:500}}>{fmt(result.range.low)} to {fmt(result.range.high)}/mo</span>
          </div>
          <div className="range-bar-track">
            {/* Filled zone */}
            <div style={{position:"absolute",top:0,height:6,borderRadius:6,left:lowPct+"%",width:(highPct-lowPct)+"%",background:posCopy.color,opacity:.22}}/>
            {/* Low tick */}
            <div style={{position:"absolute",top:"50%",left:lowPct+"%",transform:"translate(-50%,-50%)",width:2,height:10,background:posCopy.color,borderRadius:1,opacity:.5}}/>
            {/* High tick */}
            <div style={{position:"absolute",top:"50%",left:highPct+"%",transform:"translate(-50%,-50%)",width:2,height:10,background:posCopy.color,borderRadius:1,opacity:.5}}/>
            {/* Rent dot */}
            <div style={{position:"absolute",top:"50%",left:rentPct+"%",transform:"translate(-50%,-50%)",width:12,height:12,borderRadius:"50%",background:pos==="within"?posCopy.color:"var(--bg-card)",border:"2px solid "+posCopy.color,boxShadow:"0 0 0 2px "+posCopy.color+"30"}}/>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",fontFamily:"var(--mono)",fontSize:10,color:"var(--t3)"}}>
            <span>{fmt(barMin)}</span>
            <span style={{color:posCopy.color,fontWeight:500}}>Your rent: {fmt(result.rent)}</span>
            <span>{fmt(barMax)}</span>
          </div>
        </div>

        {/* Confidence */}
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          <span style={{fontFamily:"var(--mono)",fontSize:9,color:"var(--t3)",letterSpacing:".08em",textTransform:"uppercase"}}>Confidence</span>
          <span style={{display:"inline-flex",alignItems:"center",gap:5,padding:"3px 10px",background:conf.bg,border:"1px solid "+conf.border,borderRadius:100,fontFamily:"var(--mono)",fontSize:10,letterSpacing:".06em"}}>
            <span style={{width:5,height:5,borderRadius:"50%",background:conf.dot}}/>
            <span style={{color:conf.textColor}}>{conf.label}</span>
          </span>
          <span style={{fontSize:11,color:"var(--t3)"}}>{conf.desc}</span>
        </div>
      </div>

      {/* 2 ── HOW THIS WAS BUILT ───────────────────────────────────────────── */}
      <div className="card fade-up d2" style={{padding:"24px"}}>
        <div className="slabel">How this estimate was built</div>
        <p style={{fontSize:13,color:"var(--t2)",lineHeight:1.7,marginBottom:20}}>
          We start with a city-wide average for your unit type, then apply adjustments for your neighbourhood, included amenities, and local renter data. Here is each step.
        </p>

        <div>
          {/* City baseline */}
          <div className="breakdown-row">
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:600,color:"var(--t1)"}}>City baseline</div>
              <div style={{fontSize:12,color:"var(--t3)",marginTop:2}}>Ottawa average for a {unitLabel.toLowerCase()} — CMHC + Rentals.ca</div>
            </div>
            <div style={{fontFamily:"var(--mono)",fontSize:14,fontWeight:500,color:"var(--t1)",flexShrink:0}}>{fmt(bd.base)}</div>
          </div>

          {/* Neighbourhood */}
          <div className="breakdown-row">
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:600,color:"var(--t1)"}}>Neighbourhood: {hood}</div>
              <div style={{fontSize:12,color:"var(--t3)",marginTop:2}}>
                {bd.hoodMult > 1 ? "Rents in this area run higher than the city average" : bd.hoodMult < 1 ? "Rents in this area run lower than the city average" : "Rents in this area match the city average"}
                {" "}({((bd.hoodMult - 1) * 100).toFixed(0)}% {bd.hoodMult >= 1 ? "premium" : "discount"})
              </div>
            </div>
            <div style={{fontFamily:"var(--mono)",fontSize:14,fontWeight:500,color:bd.hoodAdj>=0?"var(--t1)":"#16a34a",flexShrink:0}}>
              {bd.hoodAdj >= 0 ? "+" : ""}{fmt(bd.hoodAdj)}
            </div>
          </div>

          {/* Amenities — only show if applicable */}
          {(bd.parkingAdj > 0 || bd.utilitiesAdj > 0) && (
            <div className="breakdown-row">
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:600,color:"var(--t1)"}}>Included amenities</div>
                <div style={{fontSize:12,color:"var(--t3)",marginTop:2}}>
                  {[bd.parkingAdj > 0 && "Parking (+$250)", bd.utilitiesAdj > 0 && "Utilities (+$120)"].filter(Boolean).join(" and ")}
                </div>
              </div>
              <div style={{fontFamily:"var(--mono)",fontSize:14,fontWeight:500,color:"var(--t1)",flexShrink:0}}>
                +{fmt(bd.parkingAdj + bd.utilitiesAdj)}
              </div>
            </div>
          )}

          {/* No amenities — show zero row for clarity */}
          {bd.parkingAdj === 0 && bd.utilitiesAdj === 0 && (
            <div className="breakdown-row">
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:600,color:"var(--t1)"}}>Amenities</div>
                <div style={{fontSize:12,color:"var(--t3)",marginTop:2}}>No parking or utilities included in this rent</div>
              </div>
              <div style={{fontFamily:"var(--mono)",fontSize:14,fontWeight:500,color:"var(--t3)",flexShrink:0}}>—</div>
            </div>
          )}

          {/* Local data */}
          <div className="breakdown-row">
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:600,color:"var(--t1)"}}>Local renter data</div>
              <div style={{fontSize:12,color:"var(--t3)",marginTop:2}}>
                {bd.communityN < 5
                  ? "Not enough local submissions yet. Using public data only."
                  : bd.communityN + " anonymous submissions from this neighbourhood (" + Math.round(bd.w * 100) + "% weight applied)"
                }
              </div>
            </div>
            <div style={{fontFamily:"var(--mono)",fontSize:14,fontWeight:500,color:bd.communityAdj===0?"var(--t3)":bd.communityAdj>0?"var(--t1)":"#16a34a",flexShrink:0}}>
              {bd.communityAdj === 0 ? "—" : (bd.communityAdj > 0 ? "+" : "") + fmt(bd.communityAdj)}
            </div>
          </div>

          {/* Total */}
          <div className="breakdown-row" style={{borderTop:"2px solid var(--border)",paddingTop:14,marginTop:2,borderBottom:"none"}}>
            <div style={{flex:1}}>
              <div style={{fontSize:14,fontWeight:700,color:"var(--t1)"}}>Benchmark</div>
              <div style={{fontSize:12,color:"var(--t3)",marginTop:2}}>Mid-point of the estimated fair range</div>
            </div>
            <div style={{fontFamily:"var(--mono)",fontSize:17,fontWeight:700,color:"var(--t1)",flexShrink:0}}>{fmt(bd.finalBench)}/mo</div>
          </div>
        </div>

        {/* Range summary */}
        <div style={{marginTop:16,padding:"12px 16px",background:"var(--bg)",border:"1px solid var(--border)",borderRadius:"var(--r-md)",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
          <div>
            <div style={{fontFamily:"var(--mono)",fontSize:9,color:"var(--t3)",textTransform:"uppercase",letterSpacing:".08em",marginBottom:3}}>Estimated fair range</div>
            <div style={{fontFamily:"var(--mono)",fontSize:16,fontWeight:500,color:"var(--t1)"}}>{fmt(result.range.low)} to {fmt(result.range.high)}/mo</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontFamily:"var(--mono)",fontSize:9,color:"var(--t3)",textTransform:"uppercase",letterSpacing:".08em",marginBottom:3}}>Confidence</div>
            <div style={{display:"inline-flex",alignItems:"center",gap:5}}>
              <span style={{width:6,height:6,borderRadius:"50%",background:conf.dot}}/>
              <span style={{fontFamily:"var(--mono)",fontSize:12,color:conf.textColor,fontWeight:500}}>{conf.label}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3 ── RENT CONTROL ────────────────────────────────────────────────── */}
      {!result.sameYear && (
        <div className="card fade-up d3" style={{padding:"22px 24px",background:result.isRentControlled?"#f0fdf4":"#fffbeb",borderColor:result.isRentControlled?"#bbf7d0":"#fde68a"}}>
          <div className="slabel" style={{color:result.isRentControlled?"#16a34a":"#b45309"}}>
            {result.isRentControlled ? "Rent controlled unit" : "No rent control"}
          </div>
          {result.isRentControlled ? (
            <>
              <p style={{fontSize:13,color:"var(--t2)",lineHeight:1.75,marginBottom:10}}>
                Ontario caps annual rent increases for this unit at the provincial guideline, which is <strong style={{color:"var(--t1)"}}>2.1% for 2026</strong>. Based on your move-in rent, the legal maximum your landlord could charge today is approximately <strong style={{color:"#16a34a"}}>{fmt(result.guidelineCap)}/mo</strong>.
                {result.rent > result.guidelineCap
                  ? <span style={{color:"#dc2626"}}> Your current rent of {fmt(result.rent)} appears to exceed this. You may have grounds to file with the Landlord and Tenant Board.</span>
                  : <span style={{color:"#16a34a"}}> Your rent of {fmt(result.rent)} is within the legal cap.</span>
                }
              </p>
              <a href="https://www.ontario.ca/page/residential-rent-increases" target="_blank" rel="noopener noreferrer" style={{fontFamily:"var(--mono)",fontSize:11,color:"#16a34a",textDecoration:"none",letterSpacing:".04em"}}>Ontario rent increase guidelines &rarr;</a>
            </>
          ) : (
            <>
              <p style={{fontSize:13,color:"var(--t2)",lineHeight:1.75,marginBottom:10}}>
                Your unit was first occupied after November 15, 2018, so it is exempt from Ontario rent control. Your landlord can increase rent to any amount between tenancies, but must give 90 days written notice for increases while you are living there.
              </p>
              <a href="https://www.ontario.ca/page/renting-ontario-your-rights" target="_blank" rel="noopener noreferrer" style={{fontFamily:"var(--mono)",fontSize:11,color:"#b45309",textDecoration:"none",letterSpacing:".04em"}}>Know your tenant rights &rarr;</a>
            </>
          )}
        </div>
      )}

      {/* 4 ── TRUST NOTE ──────────────────────────────────────────────────── */}
      <div className="card fade-up d4" style={{padding:"22px 24px"}}>
        <div className="slabel">About this estimate</div>
        <p style={{fontSize:13,color:"var(--t2)",lineHeight:1.75,marginBottom:14}}>
          This is a market estimate, not a precise measurement. Rents for comparable units in the same neighbourhood vary based on building age, floor level, finishes, natural light, and how individual landlords price their units. Use this as a reference point, not a definitive answer.
        </p>
        <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
          {["CMHC Rental Market Survey (Oct 2024)","Rentals.ca Monthly Report (Feb 2025)","Anonymous local submissions"].map(s=>(
            <span key={s} style={{padding:"3px 10px",background:"var(--bg)",border:"1px solid var(--border)",borderRadius:100,fontFamily:"var(--mono)",fontSize:9,color:"var(--t3)",letterSpacing:".04em"}}>{s}</span>
          ))}
        </div>
      </div>

      {/* 5 ── HELP IMPROVE ────────────────────────────────────────────────── */}
      {result.communityN < 20 && (
        <div className="card fade-up d5" style={{padding:"20px 22px",background:ACCENT_LIGHT,borderColor:ACCENT_BORDER}}>
          <div className="slabel" style={{color:ACCENT}}>Help improve this estimate</div>
          <p style={{fontSize:13,color:"#166534",lineHeight:1.75}}>
            {result.communityN < 5
              ? "There are fewer than 5 renter submissions for " + hood + ". Your data has already been counted and will meaningfully improve accuracy for others in this neighbourhood."
              : "There are " + result.communityN + " submissions for " + hood + " so far. A few more would raise the confidence score for everyone here."
            }
          </p>
          <p style={{fontSize:12,color:"#16a34a",lineHeight:1.6,marginTop:6}}>
            Share this tool with a neighbour or friend who rents in Ottawa.
          </p>
        </div>
      )}

      {/* 6 ── SHAREABLE SUMMARY CARD ──────────────────────────────────────── */}
      {showCard && (
        <div className="card fade-up" style={{padding:"24px",background:"var(--t1)",border:"1px solid #1e293b"}}>
          <div style={{fontFamily:"var(--mono)",fontSize:9,color:"rgba(255,255,255,.28)",letterSpacing:".1em",textTransform:"uppercase",marginBottom:14}}>Your result summary</div>
          <div style={{fontFamily:"var(--serif)",fontSize:"clamp(17px,3vw,22px)",color:"#f1f5f9",lineHeight:1.3,marginBottom:18}}>
            {posCopy.headline}
          </div>
          <div className="g3" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:16}}>
            {[
              {label:"Your rent",       val:fmt(result.rent)},
              {label:"Fair range",      val:fmt(result.range.low)+"–"+fmt(result.range.high)},
              {label:"Confidence",      val:conf.label},
            ].map(({label,val})=>(
              <div key={label} style={{background:"rgba(255,255,255,.06)",borderRadius:"var(--r-sm)",padding:"12px 10px"}}>
                <div style={{fontFamily:"var(--mono)",fontSize:9,color:"rgba(255,255,255,.28)",textTransform:"uppercase",letterSpacing:".08em",marginBottom:5}}>{label}</div>
                <div style={{fontFamily:"var(--mono)",fontSize:13,fontWeight:500,color:"#f1f5f9"}}>{val}</div>
              </div>
            ))}
          </div>
          <div style={{fontFamily:"var(--mono)",fontSize:10,color:"rgba(255,255,255,.2)",letterSpacing:".06em"}}>
            Ottawa &middot; {hood} &middot; {unitLabel} &middot; ottawafairrent.ca
          </div>
        </div>
      )}

      {/* 7 ── CTA ROW ─────────────────────────────────────────────────────── */}
      <div className="gcta fade-up d6" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <button className="btn-ghost" onClick={onReset}>Back to form</button>
        <button className="btn-ghost" onClick={()=>setShareOpen(s=>!s)}>Share result {shareOpen?"↑":"↗"}</button>
      </div>

      {/* Share panel */}
      {shareOpen && (
        <div className="card fade-up" style={{padding:"18px 20px"}}>
          <div className="slabel">Share your result</div>
          <div style={{marginBottom:14}}>
            <button onClick={()=>setShowCard(s=>!s)} style={{background:"none",border:"none",cursor:"pointer",fontFamily:"var(--mono)",fontSize:11,color:showCard?ACCENT:"var(--t3)",letterSpacing:".05em",textTransform:"uppercase",padding:0,textDecoration:"underline",textUnderlineOffset:3}}>
              {showCard ? "Hide summary card" : "Show shareable summary card"}
            </button>
          </div>
          <div className="gshare" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
            <a className="share-btn" href={"https://www.reddit.com/submit?url="+SHARE_URL+"&title="+encodeURIComponent(shareText())} target="_blank" rel="noopener noreferrer" style={{background:"#ff4500",color:"#fff"}}>Reddit</a>
            <a className="share-btn" href={"https://twitter.com/intent/tweet?text="+encodeURIComponent(shareText())} target="_blank" rel="noopener noreferrer" style={{background:"#000",color:"#fff"}}>X</a>
            <a className="share-btn" href={"https://www.threads.net/intent/post?text="+encodeURIComponent(shareText())} target="_blank" rel="noopener noreferrer" style={{background:"#000",color:"#fff"}}>Threads</a>
            {navigator.share
              ? <button className="share-btn" onClick={()=>navigator.share({title:"Ottawa Rent Calculator",text:shareText(),url:SHARE_URL}).catch(()=>{})} style={{background:"var(--bg)",border:"1px solid var(--border)",color:"var(--t2)"}}>More</button>
              : <button className="share-btn" onClick={copyLink} style={{background:copied?ACCENT_LIGHT:"var(--bg)",border:"1px solid "+(copied?ACCENT_BORDER:"var(--border)"),color:copied?ACCENT:"var(--t2)"}}>{copied?"Copied":"Copy"}</button>
            }
          </div>
        </div>
      )}

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

  useEffect(()=>{
    supabase.from("rent_submissions").select("*",{count:"exact",head:true}).eq("city",CITY)
      .then(({count})=>{ setRawCount(count??0); setCountLoaded(true); });
  },[]);

  useEffect(()=>{
    if(!hood||!unitType){ setSmartBench(null); setCommunityN(0); setBenchReady(false); return; }
    setBenchReady(false);
    const cutoff=new Date(); cutoff.setFullYear(curYear-2);
    supabase.from("rent_submissions").select("monthly_rent")
      .eq("city",CITY).eq("neighborhood",hood).eq("unit_type",unitType)
      .gte("monthly_rent",500).lte("monthly_rent",8000)
      .gte("created_at",cutoff.toISOString())
      .then(({data})=>{
        const base = Math.round((BASES[unitType]??BASES["1br"])*(HOODS[hood]??1));
        if(!data?.length){ setSmartBench(base); setCommunityN(0); setBenchReady(true); return; }
        const rents=data.map(r=>r.monthly_rent), n=rents.length;
        const w=communityWeight(n), med=median(rents);
        setCommunityN(n);
        setSmartBench(w===0 ? base : Math.round(base*(1-w)+med*w));
        setBenchReady(true);
      });
  },[hood,unitType]);

  function validate() {
    const e={};
    if(!hood)                                e.hood="Select a neighbourhood";
    if(!unitType)                            e.unitType="Select a unit type";
    if(!rent||isNaN(+rent)||+rent<300)       e.rent="Enter a valid monthly rent";
    const yr=+moveInYear;
    if(!moveInYear||yr<1980||yr>curYear)     e.moveInYear="Enter a year between 1980 and "+curYear;
    if(preNov2018===null)                    e.preNov2018="Please select one";
    return e;
  }

  async function handleCalc() {
    const e=validate();
    if(Object.keys(e).length){ setErrors(e); return; }
    setErrors({}); setSaveWarning(""); setSubmitting(true);

    const rentNum=+rent, yr=+moveInYear;
    const sameYear = yr===curYear;

    const bd    = buildBreakdown(hood, unitType, parking, utilities, smartBench, communityN);
    const bench = bd.finalBench;
    const conf  = getConf(communityN);
    const range = getRange(bench, conf.label);

    // Position
    const pos = rentNum < range.low ? "below" : rentNum > range.high ? "above" : "within";
    const diff = pos==="below" ? fmt(range.low-rentNum) : pos==="above" ? fmt(rentNum-range.high) : null;
    const posCopy = pos==="below"
      ? { headline:"Your rent is below the estimated fair range.", sub:"You are paying approximately "+diff+"/mo less than the lower end of comparable units in this area. This is a good position to be in.", color:"#1d4ed8", bg:"#eff6ff", border:"#bfdbfe" }
      : pos==="above"
      ? { headline:"Your rent is above the estimated fair range.", sub:"You are paying approximately "+diff+"/mo more than the upper end of comparable units in this area. It may be worth reviewing what is included in your rent.", color:"#b45309", bg:"#fffbeb", border:"#fde68a" }
      : { headline:"Your rent is within the estimated fair range.", sub:"Your rent falls within the range we estimate for comparable units in "+hood+". This suggests your rent is broadly in line with the local market.", color:"#16a34a", bg:"#f0fdf4", border:"#bbf7d0" };

    const yearsAgo    = Math.max(0, curYear-yr);
    const moveinBench = Math.round(bench * Math.pow(1-INFLATION, yearsAgo));
    const guidelineCap = (!sameYear && preNov2018) ? calcGuidelineCap(moveinBench, yr) : null;

    setResult({ rent:rentNum, bench, range, conf, pos, posCopy, breakdown:bd,
      moveinBench, guidelineCap, isRentControlled:preNov2018===true,
      sameYear, moveInYear:yr, communityN });

    try {
      const last=Number(localStorage.getItem(COOLDOWN_KEY)??0);
      if(Date.now()-last>=COOLDOWN_MS){
        const{error}=await supabase.from("rent_submissions").insert({
          neighborhood:hood, unit_type:unitType, monthly_rent:rentNum,
          move_in_year:yr, includes_parking:parking, includes_utilities:utilities, city:CITY,
        });
        if(!error){ localStorage.setItem(COOLDOWN_KEY,String(Date.now())); setRawCount(p=>p+1); }
        else setSaveWarning("Result shown. Submission was not saved.");
      }
    } catch{ setSaveWarning("Result shown. Submission was not saved."); }
    finally{ setSubmitting(false); }
  }

  function handleReset(){
    setResult(null); setHood(""); setUnitType(""); setRent(""); setMoveInYear("");
    setParking(false); setUtilities(false); setPreNov2018(null);
    setErrors({}); setSaveWarning("");
  }

  const previewBench = benchReady && smartBench!=null
    ? Math.round(smartBench)+(parking?ADDONS.parking:0)+(utilities?ADDONS.utilities:0)
    : null;
  const benchLabel = communityN>=20 ? "Community data ("+communityN+" submissions)"
    : communityN>=5 ? "Blended — "+communityN+" submissions + CMHC"
    : "CMHC baseline";

  return (
    <><style>{CSS}</style>
    <div style={{minHeight:"100vh"}}>

      <header style={{background:"var(--nav)",borderBottom:"1px solid rgba(255,255,255,.06)",position:"sticky",top:0,zIndex:100}}>
        <div style={{maxWidth:"var(--max)",margin:"0 auto",padding:"0 20px",display:"flex",alignItems:"center",justifyContent:"space-between",height:56}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <a href="https://fairrent.ca" style={{width:28,height:28,background:ACCENT,borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",textDecoration:"none",flexShrink:0}}>
              <span style={{fontFamily:"var(--mono)",fontSize:11,fontWeight:500,color:"#fff"}}>FR</span>
            </a>
            <span style={{fontFamily:"var(--sans)",fontSize:14,fontWeight:600,color:"#f8fafc",letterSpacing:"-.01em"}}>Ottawa Rent Calculator</span>
          </div>
          {countLoaded&&(
            <div style={{display:"flex",alignItems:"center",gap:7}}>
              <div className="live-dot"/>
              <span style={{fontFamily:"var(--mono)",fontSize:11,color:"rgba(255,255,255,.35)",letterSpacing:".04em"}}>{displayCount.toLocaleString()} submissions</span>
            </div>
          )}
        </div>
      </header>

      <main style={{maxWidth:"var(--max)",margin:"0 auto",padding:"40px 20px 80px"}}>
        {!result ? (
          <>
            <div style={{marginBottom:32}}>
              <h1 style={{fontFamily:"var(--serif)",fontSize:"clamp(26px,4.5vw,40px)",fontWeight:400,lineHeight:1.15,letterSpacing:"-.02em",marginBottom:12,color:"var(--t1)"}}>
                Is your Ottawa rent<br/><span style={{fontStyle:"italic",color:ACCENT}}>actually fair?</span>
              </h1>
              <p style={{fontSize:15,color:"var(--t2)",lineHeight:1.7,maxWidth:440}}>
                Compare your rent to neighbourhood-level market data from CMHC and local renter data. Anonymous. Takes 30 seconds.
              </p>
            </div>

            <div className="card" style={{padding:"28px 24px",display:"flex",flexDirection:"column",gap:20}}>

              <div className="g2" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  <label style={{fontFamily:"var(--mono)",fontSize:10,color:"var(--t3)",letterSpacing:".08em",textTransform:"uppercase"}}>Neighbourhood</label>
                  <select className="inp sel" value={hood} onChange={e=>setHood(e.target.value)} style={{borderColor:errors.hood?"#dc2626":undefined}}>
                    <option value="">Select...</option>
                    {NEIGHBORHOODS.map(n=><option key={n} value={n}>{n}</option>)}
                  </select>
                  {errors.hood&&<span className="err-msg">{errors.hood}</span>}
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  <label style={{fontFamily:"var(--mono)",fontSize:10,color:"var(--t3)",letterSpacing:".08em",textTransform:"uppercase"}}>Unit Type</label>
                  <select className="inp sel" value={unitType} onChange={e=>setUnitType(e.target.value)} style={{borderColor:errors.unitType?"#dc2626":undefined}}>
                    <option value="">Select...</option>
                    {UNITS.map(u=><option key={u.key} value={u.key}>{u.label}</option>)}
                  </select>
                  {errors.unitType&&<span className="err-msg">{errors.unitType}</span>}
                </div>
              </div>

              <div className="g2" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  <label style={{fontFamily:"var(--mono)",fontSize:10,color:"var(--t3)",letterSpacing:".08em",textTransform:"uppercase"}}>Monthly Rent</label>
                  <input className="inp" type="number" placeholder="e.g. 2200" value={rent} onChange={e=>setRent(e.target.value)} style={{borderColor:errors.rent?"#dc2626":undefined}}/>
                  {errors.rent&&<span className="err-msg">{errors.rent}</span>}
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  <label style={{fontFamily:"var(--mono)",fontSize:10,color:"var(--t3)",letterSpacing:".08em",textTransform:"uppercase"}}>Year Moved In</label>
                  <input className="inp" type="number" placeholder={String(curYear)} value={moveInYear} onChange={e=>setMoveInYear(e.target.value)} style={{borderColor:errors.moveInYear?"#dc2626":undefined}}/>
                  {errors.moveInYear&&<span className="err-msg">{errors.moveInYear}</span>}
                </div>
              </div>

              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                <label style={{fontFamily:"var(--mono)",fontSize:10,color:"var(--t3)",letterSpacing:".08em",textTransform:"uppercase"}}>Was your unit first occupied before Nov 15, 2018?</label>
                <div style={{display:"flex",gap:10}}>
                  <button type="button" className={"opt-btn"+(preNov2018===true?" on":"")} onClick={()=>setPreNov2018(true)}>Yes — rent controlled</button>
                  <button type="button" className={"opt-btn"+(preNov2018===false?" on":"")} onClick={()=>setPreNov2018(false)}>No — not controlled</button>
                </div>
                {errors.preNov2018&&<span className="err-msg">{errors.preNov2018}</span>}
                <p style={{fontSize:11,color:"var(--t3)",lineHeight:1.6}}>Units first occupied before Nov 15, 2018 are subject to Ontario's annual rent increase guideline (2.1% in 2026). Units after that date are exempt between tenancies.</p>
              </div>

              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                <label style={{fontFamily:"var(--mono)",fontSize:10,color:"var(--t3)",letterSpacing:".08em",textTransform:"uppercase"}}>Rent includes</label>
                <div className="g2" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  <button type="button" className={"toggle-btn"+(parking?" on":"")} onClick={()=>setParking(v=>!v)}>
                    <div style={{width:34,height:18,borderRadius:18,background:parking?ACCENT:"#e2e8f0",position:"relative",flexShrink:0,transition:"background .15s"}}>
                      <div style={{position:"absolute",top:2,left:parking?18:2,width:14,height:14,borderRadius:"50%",background:"#fff",boxShadow:"0 1px 3px rgba(0,0,0,.2)",transition:"left .15s"}}/>
                    </div>
                    <div>
                      <div style={{fontSize:13,fontWeight:600,color:"var(--t1)"}}>Parking</div>
                      <div style={{fontFamily:"var(--mono)",fontSize:10,color:"var(--t3)",marginTop:1}}>+$250/mo to benchmark</div>
                    </div>
                  </button>
                  <button type="button" className={"toggle-btn"+(utilities?" on":"")} onClick={()=>setUtilities(v=>!v)}>
                    <div style={{width:34,height:18,borderRadius:18,background:utilities?ACCENT:"#e2e8f0",position:"relative",flexShrink:0,transition:"background .15s"}}>
                      <div style={{position:"absolute",top:2,left:utilities?18:2,width:14,height:14,borderRadius:"50%",background:"#fff",boxShadow:"0 1px 3px rgba(0,0,0,.2)",transition:"left .15s"}}/>
                    </div>
                    <div>
                      <div style={{fontSize:13,fontWeight:600,color:"var(--t1)"}}>Utilities</div>
                      <div style={{fontFamily:"var(--mono)",fontSize:10,color:"var(--t3)",marginTop:1}}>+$120/mo to benchmark</div>
                    </div>
                  </button>
                </div>
              </div>

              {hood&&unitType&&benchReady&&previewBench!=null&&(
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10,padding:"12px 16px",background:ACCENT_LIGHT,border:"1px solid "+ACCENT_BORDER,borderRadius:"var(--r-md)"}}>
                  <div>
                    <div style={{fontFamily:"var(--mono)",fontSize:10,color:"var(--t3)",textTransform:"uppercase",letterSpacing:".07em",marginBottom:3}}>Ottawa benchmark — {hood}</div>
                    <div style={{fontFamily:"var(--mono)",fontSize:16,fontWeight:500,color:"var(--t1)"}}>{fmt(previewBench)}/mo</div>
                  </div>
                  <span style={{padding:"3px 10px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:100,fontFamily:"var(--mono)",fontSize:9,color:communityN>=5?ACCENT:"var(--t3)",letterSpacing:".07em",textTransform:"uppercase"}}>
                    {benchLabel}
                  </span>
                </div>
              )}

              <button className="btn-primary" onClick={handleCalc} disabled={submitting}>
                {submitting?"Saving...":"Compare My Rent"}
              </button>
              <p style={{textAlign:"center",fontFamily:"var(--mono)",fontSize:10,color:"var(--t3)",letterSpacing:".05em"}}>
                Anonymous &middot; no account &middot; no personal data stored
              </p>
            </div>
          </>
        ) : (
          <ResultPage result={result} hood={hood} unitType={unitType} onReset={handleReset}/>
        )}

        {saveWarning&&(
          <div style={{marginTop:12,fontSize:12,color:"#92400e",background:"#fffbeb",border:"1px solid #fde68a",borderRadius:"var(--r-md)",padding:"12px 16px"}}>{saveWarning}</div>
        )}

        <div style={{marginTop:40,paddingTop:22,borderTop:"1px solid var(--border)"}}>
          <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:10}}>
            {["CMHC Rental Market Survey (Oct 2024)","Rentals.ca Monthly Report (Feb 2025)","Local renter data"].map(s=>(
              <span key={s} style={{padding:"3px 10px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:100,fontFamily:"var(--mono)",fontSize:9,color:"var(--t3)"}}>{s}</span>
            ))}
          </div>
          <p style={{fontSize:11,color:"var(--t3)",lineHeight:1.7}}>Ontario guideline history used for rent-controlled calculations. Not legal or financial advice.</p>
        </div>
      </main>
    </div>
    </>
  );
}
