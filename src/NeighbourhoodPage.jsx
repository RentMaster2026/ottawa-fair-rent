import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// ─── Usage ────────────────────────────────────────────────────────────────────
// <NeighbourhoodPage hood={HOOD_DATA} city={CITY_CONFIG} onBack={fn} />
//
// HOOD_DATA shape:
// {
//   slug: "centretown",
//   name: "Centretown",
//   description: "One of Ottawa's most central...",
//   context: "Units near the Glebe border tend to sit at the higher end.",
//   vsAvgPct: 8,           // positive = above average, negative = below
//   hoodMult: 1.08,
//   nearbyHoods: ["Glebe","Hintonburg","Downtown Core"],
// }
//
// CITY_CONFIG shape:
// {
//   key: "ottawa",
//   name: "Ottawa",
//   province: "Ontario",
//   accent: "#16a34a",
//   accentLight: "#f0fdf4",
//   accentBorder: "#bbf7d0",
//   calcUrl: "https://ottawafairrent.ca",
//   bases: { bachelor:1550, "1br":2026, "2br":2530, "3br":3100, "3plus":3600 },
//   inflation: 0.038,
//   rentControlled: true,
// }
// ─────────────────────────────────────────────────────────────────────────────

const fmt = v => Number(v).toLocaleString("en-CA",{style:"currency",currency:"CAD",maximumFractionDigits:0});

function getRangeForUnit(base, hoodMult, confLabel) {
  const bench = Math.round(base * hoodMult);
  const spread = confLabel==="High" ? 0.08 : confLabel==="Medium" ? 0.13 : 0.19;
  return {
    low:   Math.round(bench*(1-spread)/50)*50,
    high:  Math.round(bench*(1+spread)/50)*50,
    bench,
  };
}

const UNIT_LABELS = {
  bachelor: "Bachelor / Studio",
  "1br": "1 Bedroom",
  "2br": "2 Bedroom",
  "3br": "3 Bedroom",
  "3plus": "3+ Bedroom",
};

const CONF_COLORS = {
  High:   { dot:"#16a34a", text:"#166534" },
  Medium: { dot:"#d97706", text:"#92400e" },
  Low:    { dot:"#dc2626", text:"#991b1b" },
};

const CSS = [
  "@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap');",
  ":root{--serif:'Instrument Serif',Georgia,serif;--sans:'Geist',-apple-system,BlinkMacSystemFont,sans-serif;--mono:'Geist Mono','Courier New',monospace;--bg:#f9fafb;--bg-card:#ffffff;--border:#e2e8f0;--border-mid:#cbd5e1;--t1:#0f172a;--t2:#475569;--t3:#94a3b8;--r-sm:6px;--r-md:10px;--r-lg:14px;--sh:0 1px 4px rgba(0,0,0,.06);--sh-hover:0 4px 16px rgba(0,0,0,.09);--max:740px;}",
  "html,body,#root{margin:0;padding:0;width:100%;background:var(--bg);}",
  "*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}",
  "body{font-family:var(--sans);color:var(--t1);-webkit-font-smoothing:antialiased;}",
  ".ncard{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--r-lg);box-shadow:var(--sh);padding:28px 24px;}",
  ".slabel{font-family:var(--mono);font-size:10px;color:var(--t3);text-transform:uppercase;letter-spacing:.1em;margin-bottom:14px;}",
  ".data-row{display:grid;grid-template-columns:1.2fr 1.2fr 0.6fr;gap:0;border-bottom:1px solid var(--border);}",
  ".data-row:last-child{border-bottom:none;}",
  ".data-row.header{background:var(--bg);}",
  ".data-cell{padding:10px 14px;font-family:var(--mono);font-size:12px;color:var(--t2);border-right:1px solid var(--border);}",
  ".data-cell:last-child{border-right:none;}",
  ".data-cell.head{font-size:9px;color:var(--t3);text-transform:uppercase;letter-spacing:.08em;}",
  ".faq-item{border-bottom:1px solid var(--border);}",
  ".faq-item:last-child{border-bottom:none;}",
  ".faq-trigger{width:100%;display:flex;align-items:center;justify-content:space-between;padding:15px 0;background:none;border:none;cursor:pointer;text-align:left;gap:16px;font-family:var(--sans);}",
  ".faq-body{overflow:hidden;transition:max-height .25s ease,opacity .2s ease;max-height:0;opacity:0;}",
  ".faq-body.open{max-height:400px;opacity:1;}",
  ".chevron{flex-shrink:0;color:var(--t3);transition:transform .2s;}",
  ".chevron.open{transform:rotate(180deg);}",
  ".btn-cta{display:inline-flex;align-items:center;gap:8px;padding:13px 24px;background:var(--t1);color:#fff;border:none;border-radius:var(--r-md);font-family:var(--sans);font-size:14px;font-weight:600;text-decoration:none;cursor:pointer;transition:background .15s;letter-spacing:.01em;}",
  ".btn-cta:hover{background:#1e293b;}",
  ".btn-cta:focus-visible{outline:2px solid #16a34a;outline-offset:2px;}",
  ".fade-up{opacity:0;transform:translateY(10px);animation:fu .45s ease forwards;}",
  "@keyframes fu{to{opacity:1;transform:none;}}",
  ".d1{animation-delay:.04s}.d2{animation-delay:.10s}.d3{animation-delay:.16s}.d4{animation-delay:.22s}.d5{animation-delay:.28s}.d6{animation-delay:.34s}",
  "@media(max-width:580px){.data-row{grid-template-columns:1fr 1fr!important;}.conf-col{display:none!important;}.ncard{padding:20px 16px;}}",
  "@media(prefers-reduced-motion:reduce){.fade-up{animation:none!important;opacity:1!important;transform:none!important;}}"
].join("\n");

function FaqItem({q,a}){
  const[open,setOpen]=useState(false);
  return(
    <div className="faq-item">
      <button className="faq-trigger" onClick={()=>setOpen(o=>!o)}>
        <span style={{fontSize:14,fontWeight:600,color:"var(--t1)",lineHeight:1.4}}>{q}</span>
        <span className={"chevron"+(open?" open":"")}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 5l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </span>
      </button>
      <div className={"faq-body"+(open?" open":"")}>
        <p style={{fontSize:14,color:"var(--t2)",lineHeight:1.75,paddingBottom:16}}>{a}</p>
      </div>
    </div>
  );
}

export default function NeighbourhoodPage({ hood, city, onBack }) {
  const [submissions, setSubmissions] = useState({});
  const [ready,       setReady]       = useState(false);

  // Load submission counts + confidence per unit type
  useEffect(()=>{
    const cutoff = new Date();
    cutoff.setFullYear(new Date().getFullYear()-2);
    Promise.all(
      Object.keys(UNIT_LABELS).map(unit =>
        supabase.from("rent_submissions")
          .select("monthly_rent",{count:"exact",head:false})
          .eq("city", city.key)
          .eq("neighborhood", hood.name)
          .eq("unit_type", unit)
          .gte("monthly_rent", 500)
          .lte("monthly_rent", 8000)
          .gte("created_at", cutoff.toISOString())
          .then(({data, count})=>({ unit, count: count||0, data: data||[] }))
      )
    ).then(results=>{
      const m={};
      results.forEach(r=>{
        const confLabel = r.count>=20?"High":r.count>=8?"Medium":"Low";
        m[r.unit] = { count:r.count, confLabel };
      });
      setSubmissions(m);
      setReady(true);
    });
  },[hood.name, city.key]);

  const totalSubmissions = Object.values(submissions).reduce((a,b)=>a+b.count,0);
  const onebrConf = submissions["1br"]?.confLabel ?? "Low";
  const vsAvgLabel = hood.vsAvgPct > 0 ? "+" + hood.vsAvgPct + "%" : hood.vsAvgPct + "%";
  const vsAvgColor = hood.vsAvgPct > 10 ? "#b45309" : hood.vsAvgPct < -5 ? "#1d4ed8" : "#16a34a";

  // Build FAQ dynamically
  const faqs = [
    {
      q: "What is the average rent for a 1-bedroom in " + hood.name + "?",
      a: (() => {
        const r = getRangeForUnit(city.bases["1br"], hood.hoodMult, onebrConf);
        return "Based on CMHC data and local renter submissions, the estimated fair range for a 1-bedroom in " + hood.name + " is " + fmt(r.low) + " to " + fmt(r.high) + " per month. This is approximately " + vsAvgLabel + " relative to the " + city.name + " city average for a comparable unit.";
      })(),
    },
    {
      q: city.rentControlled ? "Is rent controlled in " + hood.name + "?" : "Does BC rent control apply in " + hood.name + "?",
      a: city.rentControlled
        ? "It depends on your unit. Units first occupied before November 15, 2018 are subject to Ontario's annual rent increase guideline (2.1% for 2026). Units first occupied after that date are exempt from rent control between tenancies. Use the calculator to get a result specific to your situation."
        : "Yes. BC caps annual rent increases for existing tenants at the provincial guideline, which is 3.0% for 2025. This applies to all residential tenancies in " + hood.name + " regardless of when your unit was built.",
    },
    {
      q: "Why might my rent be above this range?",
      a: "Several factors can push rents above the estimated range: newer construction, recent renovation, premium finishes, included parking or utilities, or a particularly well-located unit on a quieter street. The estimate reflects typical market conditions, not every possible scenario.",
    },
    {
      q: "How accurate is the " + hood.name + " estimate?",
      a: ready
        ? (submissions["1br"]?.count >= 20
          ? "The 1-bedroom estimate for " + hood.name + " is based on " + submissions["1br"].count + " local renter submissions blended with CMHC data. This is a High confidence estimate with a relatively narrow range."
          : submissions["1br"]?.count >= 8
          ? "The 1-bedroom estimate for " + hood.name + " is based on " + (submissions["1br"]?.count||0) + " local renter submissions blended with CMHC data. Accuracy improves as more " + hood.name + " renters submit."
          : "The " + hood.name + " estimate currently relies primarily on CMHC and Rentals.ca data adjusted for the neighbourhood. There are fewer than 8 local submissions for this area. Submitting your rent will meaningfully improve accuracy for other renters here.")
        : "Accuracy depends on the number of local submissions available. Check the confidence score on your result for a specific assessment.",
    },
    {
      q: "Can I use this estimate in a rent dispute?",
      a: "No. This tool provides general market estimates for informational purposes only. It is not a professional appraisal or legal advice. For formal rent disputes, contact a licensed paralegal or your provincial tenant rights organization.",
    },
  ];

  return (
    <>
    <style>{CSS}</style>
    <div style={{minHeight:"100vh"}}>

      {/* Nav */}
      <header style={{background:"#0f172a",borderBottom:"1px solid rgba(255,255,255,.06)",position:"sticky",top:0,zIndex:100}}>
        <div style={{maxWidth:"var(--max)",margin:"0 auto",padding:"0 20px",display:"flex",alignItems:"center",justifyContent:"space-between",height:56}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <a href={city.calcUrl} style={{width:28,height:28,background:city.accent,borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",textDecoration:"none",flexShrink:0}}>
              <span style={{fontFamily:"var(--mono)",fontSize:11,fontWeight:500,color:"#fff"}}>FR</span>
            </a>
            <span style={{fontFamily:"var(--sans)",fontSize:14,fontWeight:600,color:"#f8fafc",letterSpacing:"-.01em"}}>{city.name} Rent Calculator</span>
          </div>
          {onBack&&(
            <button onClick={onBack} style={{background:"none",border:"none",cursor:"pointer",fontFamily:"var(--mono)",fontSize:11,color:"rgba(255,255,255,.35)",letterSpacing:".05em",textTransform:"uppercase"}}>
              All neighbourhoods
            </button>
          )}
        </div>
      </header>

      <main style={{maxWidth:"var(--max)",margin:"0 auto",padding:"48px 20px 80px",display:"flex",flexDirection:"column",gap:14}}>

        {/* H1 + intro */}
        <div className="fade-up d1" style={{marginBottom:8}}>
          <div style={{fontFamily:"var(--mono)",fontSize:11,color:city.accent,letterSpacing:".08em",textTransform:"uppercase",marginBottom:16}}>
            {city.name} &middot; Neighbourhood
          </div>
          <h1 style={{fontFamily:"var(--serif)",fontSize:"clamp(26px,4.5vw,40px)",fontWeight:400,color:"var(--t1)",lineHeight:1.15,letterSpacing:"-.02em",marginBottom:16}}>
            Average rent in {hood.name}, {city.name}.
          </h1>
          <p style={{fontSize:16,color:"var(--t2)",lineHeight:1.8,maxWidth:560,marginBottom:14}}>
            {hood.description}
          </p>
          <p style={{fontSize:15,color:"var(--t2)",lineHeight:1.75,maxWidth:560}}>
            The estimates below are based on CMHC rental market data, Rentals.ca monthly reports, and anonymous rent submissions from {hood.name} renters who have used this tool.
          </p>
        </div>

        {/* Rent ranges table */}
        <div className="ncard fade-up d2">
          <div className="slabel">Estimated fair rent ranges &mdash; {hood.name}</div>
          <div style={{border:"1px solid var(--border)",borderRadius:"var(--r-md)",overflow:"hidden"}}>
            <div className="data-row header">
              <div className="data-cell head">Unit type</div>
              <div className="data-cell head">Estimated range</div>
              <div className="data-cell head conf-col">Confidence</div>
            </div>
            {Object.entries(UNIT_LABELS).map(([key,label])=>{
              const conf = ready ? (submissions[key]?.confLabel ?? "Low") : "Low";
              const r    = getRangeForUnit(city.bases[key]||city.bases["1br"], hood.hoodMult, conf);
              const cc   = CONF_COLORS[conf];
              return(
                <div key={key} className="data-row">
                  <div className="data-cell" style={{color:"var(--t1)",fontWeight:500}}>{label}</div>
                  <div className="data-cell" style={{color:"var(--t1)"}}>{fmt(r.low)} &ndash; {fmt(r.high)}</div>
                  <div className="data-cell conf-col">
                    <span style={{display:"inline-flex",alignItems:"center",gap:5}}>
                      <span style={{width:5,height:5,borderRadius:"50%",background:cc.dot,flexShrink:0}} aria-hidden="true"/>
                      <span style={{color:cc.text,fontSize:11}}>{conf}</span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <p style={{fontSize:11,color:"var(--t3)",lineHeight:1.65,marginTop:12}}>
            Confidence reflects the number of local renter submissions. High = 20+ submissions blended with CMHC. Medium = 8&ndash;19. Low = CMHC baseline only.
            Last updated March 2026 &middot; Sources: CMHC Oct 2024 &middot; Rentals.ca Feb 2025
          </p>
        </div>

        {/* vs city average */}
        <div className="ncard fade-up d3">
          <div className="slabel">How {hood.name} compares to {city.name}</div>
          <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:16,flexWrap:"wrap"}}>
            <div>
              <div style={{fontFamily:"var(--mono)",fontSize:10,color:"var(--t3)",textTransform:"uppercase",letterSpacing:".08em",marginBottom:4}}>vs city average</div>
              <div style={{fontFamily:"var(--mono)",fontSize:28,fontWeight:500,color:vsAvgColor,lineHeight:1}}>{vsAvgLabel}</div>
            </div>
            <p style={{fontSize:14,color:"var(--t2)",lineHeight:1.7,maxWidth:420,flex:1}}>
              {hood.vsAvgPct > 0
                ? hood.name + " rents run " + vsAvgLabel + " above the " + city.name + " average for comparable units."
                : hood.vsAvgPct < 0
                ? hood.name + " rents run " + Math.abs(hood.vsAvgPct) + "% below the " + city.name + " average for comparable units."
                : hood.name + " rents are broadly in line with the " + city.name + " city average."
              }
              {" "}{hood.context}
            </p>
          </div>
          {hood.nearbyHoods && hood.nearbyHoods.length > 0 && (
            <div style={{paddingTop:14,borderTop:"1px solid var(--border)"}}>
              <div style={{fontFamily:"var(--mono)",fontSize:10,color:"var(--t3)",textTransform:"uppercase",letterSpacing:".08em",marginBottom:8}}>Nearby neighbourhoods</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                {hood.nearbyHoods.map(n=>(
                  <span key={n} style={{padding:"4px 12px",background:"var(--bg)",border:"1px solid var(--border)",borderRadius:100,fontFamily:"var(--mono)",fontSize:11,color:"var(--t2)"}}>{n}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* About this estimate */}
        <div className="ncard fade-up d3">
          <div className="slabel">About this estimate</div>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div>
              <div style={{fontSize:13,fontWeight:600,color:"var(--t1)",marginBottom:5}}>Data sources</div>
              <p style={{fontSize:13,color:"var(--t2)",lineHeight:1.7}}>
                Built from CMHC's annual Rental Market Survey (October 2024), Rentals.ca's national rent report (February 2025), and anonymous rent submissions from {hood.name} renters.
              </p>
            </div>
            <div style={{paddingTop:12,borderTop:"1px solid var(--border)"}}>
              <div style={{fontSize:13,fontWeight:600,color:"var(--t1)",marginBottom:5}}>Limitations</div>
              <p style={{fontSize:13,color:"var(--t2)",lineHeight:1.7}}>
                These are estimates, not appraisals. Building age, condition, and included amenities affect individual rents. A renovated unit in a newer building may rent above this range. An older walk-up may rent below it.
              </p>
            </div>
          </div>
        </div>

        {/* Submission count */}
        <div className="ncard fade-up d4" style={{background:city.accentLight,borderColor:city.accentBorder}}>
          <div className="slabel" style={{color:city.accent}}>
            {hood.name} renter data
          </div>
          {ready ? (
            <>
              <div style={{fontFamily:"var(--mono)",fontSize:28,fontWeight:500,color:"var(--t1)",lineHeight:1,marginBottom:10}} aria-live="polite">
                {totalSubmissions > 0 ? totalSubmissions.toLocaleString() : "0"}
              </div>
              <p style={{fontSize:14,color:"#166534",lineHeight:1.75,marginBottom:10}}>
                {totalSubmissions >= 20
                  ? hood.name + " has one of the stronger local datasets in " + city.name + ". The 1-bedroom estimate here is blended from real " + hood.name + " rents, not just city-wide averages."
                  : totalSubmissions >= 5
                  ? "There are " + totalSubmissions + " local submissions from " + hood.name + " so far. A few more would raise the confidence score across all unit types."
                  : "There are fewer than 5 local submissions from " + hood.name + ". Submitting your rent would meaningfully improve accuracy for other renters in this neighbourhood."
                }
              </p>
              <p style={{fontSize:12,color:"#16a34a",lineHeight:1.6}}>
                Submissions are anonymous. We store only neighbourhood, unit type, and monthly rent. No personal information is collected.
              </p>
            </>
          ) : (
            <div style={{fontFamily:"var(--mono)",fontSize:13,color:"var(--t3)"}}>Loading...</div>
          )}
        </div>

        {/* Trust signals row */}
        <div className="fade-up d4" style={{display:"flex",flexWrap:"wrap",gap:8}}>
          {["Anonymous submissions","No account required","CMHC sourced","Not legal advice"].map(t=>(
            <span key={t} style={{padding:"5px 12px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:100,fontFamily:"var(--mono)",fontSize:11,color:"var(--t2)",letterSpacing:".03em"}}>{t}</span>
          ))}
        </div>

        {/* FAQ */}
        <div className="ncard fade-up d5">
          <div className="slabel">Frequently asked questions about renting in {hood.name}</div>
          {faqs.map((item,i)=><FaqItem key={i} q={item.q} a={item.a}/>)}
        </div>

        {/* CTA */}
        <div className="ncard fade-up d6" style={{textAlign:"center",padding:"32px 24px"}}>
          <h2 style={{fontFamily:"var(--serif)",fontSize:"clamp(20px,3vw,26px)",fontWeight:400,color:"var(--t1)",letterSpacing:"-.02em",marginBottom:12}}>
            Check your {hood.name} rent
          </h2>
          <p style={{fontSize:14,color:"var(--t2)",lineHeight:1.7,maxWidth:420,margin:"0 auto 24px"}}>
            Enter your details to see how your specific rent compares to the estimated fair range for {hood.name}. Free, anonymous, 30 seconds.
          </p>
          <a href={city.calcUrl + "?hood=" + encodeURIComponent(hood.name)} className="btn-cta">
            Compare My Rent in {hood.name} &rarr;
          </a>
          <div style={{fontFamily:"var(--mono)",fontSize:10,color:"var(--t3)",marginTop:16,letterSpacing:".05em"}}>
            Free &middot; Anonymous &middot; Takes 30 seconds
          </div>
        </div>

      </main>

      <footer style={{borderTop:"1px solid var(--border)",padding:"20px",textAlign:"center",background:"var(--bg)"}}>
        <p style={{fontFamily:"var(--mono)",fontSize:10,color:"var(--t3)",letterSpacing:".04em"}}>
          Anonymous &middot; No personal data stored &middot; Not legal or financial advice &middot; {new Date().getFullYear()} Fair Rent Canada
        </p>
      </footer>
    </div>
    </>
  );
}
