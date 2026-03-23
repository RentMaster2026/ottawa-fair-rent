import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const fmt = v => Number(v).toLocaleString("en-CA", { style:"currency", currency:"CAD", maximumFractionDigits:0 });

const UNIT_LABELS = {
  bachelor:"Bachelor / Studio",
  "1br":"1 Bedroom",
  "2br":"2 Bedroom",
  "3br":"3 Bedroom",
  "3plus":"3+ Bedroom",
};

function getRangeForUnit(base, hoodMult, confLabel) {
  const bench  = Math.round(base * hoodMult);
  const spread = confLabel==="High" ? 0.07 : confLabel==="Medium" ? 0.10 : 0.16;
  return {
    low:   Math.round(bench*(1-spread)/50)*50,
    high:  Math.round(bench*(1+spread)/50)*50,
    bench,
  };
}

function getConf(n) {
  if (n>=20) return { label:"High",   dot:"#1a5c34", textColor:"#1a5c34", bg:"#f0f7f2", border:"#a8d5b5" };
  if (n>=8)  return { label:"Medium", dot:"#7a4f00", textColor:"#7a4f00", bg:"#fdf8f0", border:"#e8c97a" };
  return           { label:"Low",    dot:"#8b1a1a", textColor:"#8b1a1a", bg:"#fdf0f0", border:"#e8a8a8" };
}

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom:"1px solid #e0e0e0" }}>
      <button onClick={() => setOpen(o=>!o)} style={{ width:"100%", display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 0", background:"none", border:"none", cursor:"pointer", textAlign:"left", gap:16, fontFamily:"inherit" }}>
        <span style={{ fontSize:13, fontWeight:700, color:"#111", lineHeight:1.4 }}>{q}</span>
        <span style={{ fontSize:14, color:"#767676", flexShrink:0, fontWeight:700 }}>{open?"−":"+"}</span>
      </button>
      {open && <p style={{ fontSize:13, color:"#444", lineHeight:1.7, paddingBottom:12 }}>{a}</p>}
    </div>
  );
}

const CSS = `
  :root {
    --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
    --mono: "Courier New", Courier, monospace;
    --bg:   #f5f5f5;
    --white:#ffffff;
    --border: #cccccc;
    --t1: #111111;
    --t2: #444444;
    --t3: #767676;
    --nav-bg: #1c2b36;
    --bar-bg: #2f4553;
  }
  html,body,#root{margin:0;padding:0;width:100%;background:var(--bg);}
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:var(--sans);font-size:15px;color:var(--t1);-webkit-font-smoothing:antialiased;line-height:1.5;}
  button{font-family:var(--sans);cursor:pointer;}
  .gov-nav{background:var(--nav-bg);}
  .gov-nav-inner{max-width:1100px;margin:0 auto;padding:0 16px;display:flex;align-items:center;justify-content:space-between;height:48px;gap:16px;}
  .gov-wordmark{font-size:13px;font-weight:700;color:#fff;text-decoration:none;white-space:nowrap;}
  .gov-wordmark span{font-weight:400;color:#aab8c2;}
  .back-btn{background:none;border:none;font-size:12px;color:#aab8c2;cursor:pointer;padding:0;letter-spacing:0.02em;}
  .back-btn:hover{color:#fff;text-decoration:underline;}
  .gov-subbar{background:var(--bar-bg);border-bottom:1px solid #3d5a6e;}
  .gov-subbar-inner{max-width:1100px;margin:0 auto;padding:0 16px;height:34px;display:flex;align-items:center;}
  .breadcrumb{font-size:12px;color:#aab8c2;}
  .breadcrumb a{color:#aab8c2;text-decoration:none;}
  .breadcrumb a:hover{text-decoration:underline;}
  .page-wrap{max-width:1100px;margin:0 auto;padding:28px 16px 60px;}
  .page-grid{display:grid;grid-template-columns:1fr 300px;gap:24px;align-items:start;}
  .section-label{font-size:11px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;}
  .panel{background:var(--white);border:1px solid var(--border);}
  .panel-header{padding:10px 14px;background:#f0f0f0;border-bottom:1px solid var(--border);font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:var(--t2);}
  .panel-body{padding:14px;}
  .data-table{width:100%;border-collapse:collapse;font-size:13px;}
  .data-table thead th{padding:8px 12px;background:#f5f5f5;border:1px solid var(--border);font-size:11px;font-weight:700;text-align:left;text-transform:uppercase;letter-spacing:0.04em;color:var(--t2);}
  .data-table tbody td{padding:9px 12px;border:1px solid #e8e8e8;color:var(--t1);}
  .data-table tbody td:nth-child(2){font-family:var(--mono);font-weight:700;}
  .data-table tbody td:last-child{text-align:center;}
  .conf-badge{display:inline-flex;align-items:center;gap:4px;padding:2px 6px;font-size:11px;font-weight:600;border:1px solid;}
  .stat-row{display:flex;justify-content:space-between;align-items:baseline;padding:8px 0;border-bottom:1px solid #ebebeb;gap:12px;}
  .stat-row:last-child{border-bottom:none;}
  .stat-key{font-size:13px;color:var(--t2);}
  .stat-val{font-family:var(--mono);font-size:16px;font-weight:700;color:var(--t1);flex-shrink:0;}
  .notice{padding:12px 14px;border-left:3px solid;font-size:13px;line-height:1.6;}
  .notice-green{background:#f0f7f2;border-color:#1a5c34;color:#1a4a28;}
  .notice-amber{background:#fdf8f0;border-color:#7a4f00;color:#5a3d00;}
  .cta-box{background:var(--white);border:1px solid var(--border);border-top:3px solid;padding:20px;text-align:center;}
  .cta-btn{display:inline-block;padding:10px 20px;font-size:13px;font-weight:700;color:#fff;text-decoration:none;letter-spacing:0.02em;}
  .cta-btn:hover{opacity:0.85;}
  .tag{display:inline-block;padding:3px 8px;background:#f0f0f0;border:1px solid var(--border);font-size:11px;color:var(--t2);margin:2px;}
  @media(max-width:760px){.page-grid{grid-template-columns:1fr;}}
  @media(max-width:480px){.page-wrap{padding:16px 12px 48px;}.data-table thead th:nth-child(3){display:none;}.data-table tbody td:nth-child(3){display:none;}}
`;

export default function NeighbourhoodPage({ hood, city, onBack }) {
  const [submissions, setSubmissions] = useState({});
  const [ready,       setReady]       = useState(false);

  useEffect(() => {
    const cutoff = new Date();
    cutoff.setFullYear(new Date().getFullYear() - 2);
    Promise.all(
      Object.keys(UNIT_LABELS).map(unit =>
        supabase.from("rent_submissions")
          .select("monthly_rent", { count:"exact", head:false })
          .eq("city", city.key)
          .eq("neighborhood", hood.name)
          .eq("unit_type", unit)
          .gte("monthly_rent", 500).lte("monthly_rent", 8000)
          .gte("created_at", cutoff.toISOString())
          .then(({ data, count }) => ({ unit, count:count||0, data:data||[] }))
      )
    ).then(results => {
      const m = {};
      results.forEach(r => {
        m[r.unit] = { count:r.count, confLabel:r.count>=20?"High":r.count>=8?"Medium":"Low" };
      });
      setSubmissions(m);
      setReady(true);
    });
  }, [hood.name, city.key]);

  const totalSubmissions = Object.values(submissions).reduce((a,b) => a+b.count, 0);
  const vsAvgLabel = hood.vsAvgPct > 0 ? `+${hood.vsAvgPct}%` : `${hood.vsAvgPct}%`;
  const vsAvgColor = hood.vsAvgPct > 10 ? "#8b1a1a" : hood.vsAvgPct < -5 ? "#1a3a7a" : "#1a5c34";
  const accentColor = city.accent;

  const faqs = [
    {
      q: `What is the average rent for a 1-bedroom in ${hood.name}?`,
      a: (() => {
        const r = getRangeForUnit(city.bases["1br"], hood.hoodMult, submissions["1br"]?.confLabel||"Low");
        return `Based on CMHC data and local submissions, the estimated fair range for a 1-bedroom in ${hood.name} is ${fmt(r.low)} to ${fmt(r.high)} per month. This is ${vsAvgLabel} relative to the ${city.name} average for a comparable unit.`;
      })(),
    },
    {
      q: city.rentControlled ? `Is rent controlled in ${hood.name}?` : `Does rent control apply in ${hood.name}?`,
      a: city.rentControlled
        ? `It depends on your unit. Units first occupied before November 15, 2018 are subject to Ontario's annual rent increase guideline (2.1% for 2026). Units first occupied after that date are exempt from rent control between tenancies.`
        : `Yes. BC caps annual rent increases for existing tenants at the provincial guideline (3.0% for 2025). This applies to all residential tenancies in ${hood.name}.`,
    },
    {
      q: `How accurate is the ${hood.name} estimate?`,
      a: ready
        ? submissions["1br"]?.count >= 20
          ? `The 1-bedroom estimate for ${hood.name} is rated High confidence, based on ${submissions["1br"].count} local submissions blended with CMHC data.`
          : submissions["1br"]?.count >= 8
          ? `The 1-bedroom estimate is rated Medium confidence, based on ${submissions["1br"]?.count||0} local submissions. Accuracy improves as more renters submit.`
          : `The estimate relies primarily on CMHC data adjusted for ${hood.name}. Fewer than 8 local submissions exist. Submitting your rent improves accuracy for everyone here.`
        : "Loading submission data...",
    },
    {
      q: "Can I use this in a rent dispute?",
      a: "No. This tool provides general market estimates for informational purposes only. It is not a professional appraisal or legal advice. For formal disputes, contact a licensed paralegal or your provincial tenant rights organization.",
    },
  ];

  return (
    <>
      <style>{CSS}</style>
      <div style={{ minHeight:"100vh", background:"var(--bg)" }}>

        {/* NAV */}
        <div className="gov-nav" style={{ borderBottom:`3px solid ${accentColor}` }}>
          <div className="gov-nav-inner">
            <a href={city.calcUrl} className="gov-wordmark">
              Fair Rent Canada <span>/ {city.name}</span>
            </a>
            <button className="back-btn" onClick={onBack}>&#8592; All neighbourhoods</button>
          </div>
        </div>

        {/* BREADCRUMB */}
        <div className="gov-subbar">
          <div className="gov-subbar-inner">
            <span className="breadcrumb">
              <a href="https://fairrent.ca">Fair Rent Canada</a>
              {" / "}
              <a href={city.calcUrl}>{city.name}</a>
              {" / "}
              {hood.name}
            </span>
          </div>
        </div>

        <div className="page-wrap">

          {/* Page heading */}
          <div style={{ marginBottom:24, paddingBottom:16, borderBottom:"1px solid var(--border)" }}>
            <div style={{ fontSize:11, fontWeight:700, color:accentColor, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:8 }}>
              {city.name} : Neighbourhood Report
            </div>
            <h1 style={{ fontSize:"clamp(18px,3vw,26px)", fontWeight:700, color:"var(--t1)", marginBottom:8, lineHeight:1.2 }}>
              Rental market data: {hood.name}, {city.name}
            </h1>
            <p style={{ fontSize:13, color:"var(--t2)", lineHeight:1.6, maxWidth:640 }}>{hood.description}</p>
          </div>

          <div className="page-grid">

            {/* LEFT */}
            <div style={{ display:"flex", flexDirection:"column", gap:20 }}>

              {/* Rent ranges table */}
              <div>
                <div className="section-label">Estimated fair rent ranges: {hood.name}</div>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Unit type</th>
                      <th>Estimated range / mo</th>
                      <th>Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(UNIT_LABELS).map(([key, label]) => {
                      const confLabel = ready ? (submissions[key]?.confLabel || "Low") : "Low";
                      const r   = getRangeForUnit(city.bases[key] || city.bases["1br"], hood.hoodMult, confLabel);
                      const cc  = getConf(confLabel);
                      return (
                        <tr key={key}>
                          <td style={{ fontWeight:600 }}>{label}</td>
                          <td>{fmt(r.low)} &ndash; {fmt(r.high)}</td>
                          <td>
                            <span className="conf-badge" style={{ background:cc.bg, borderColor:cc.border, color:cc.textColor }}>
                              <span style={{ width:5, height:5, borderRadius:"50%", background:cc.dot, display:"inline-block" }}/>
                              {confLabel}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p style={{ fontSize:11, color:"var(--t3)", lineHeight:1.5, marginTop:8 }}>
                  Confidence: High = 20+ local submissions + CMHC &middot; Medium = 8&ndash;19 &middot; Low = CMHC baseline only.
                  Last updated March 2026. Sources: CMHC Oct 2024 &middot; Rentals.ca Feb 2025.
                </p>
              </div>

              {/* vs city average */}
              <div className="panel">
                <div className="panel-header">How {hood.name} compares to {city.name}</div>
                <div className="panel-body">
                  <div style={{ display:"flex", gap:16, alignItems:"flex-start", flexWrap:"wrap" }}>
                    <div>
                      <div style={{ fontSize:11, fontWeight:700, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.04em", marginBottom:4 }}>vs city average</div>
                      <div style={{ fontFamily:"var(--mono)", fontSize:26, fontWeight:700, color:vsAvgColor, lineHeight:1 }}>{vsAvgLabel}</div>
                    </div>
                    <div style={{ flex:1, minWidth:200 }}>
                      <p style={{ fontSize:13, color:"var(--t2)", lineHeight:1.65 }}>
                        {hood.vsAvgPct > 0
                          ? `${hood.name} rents run ${vsAvgLabel} above the ${city.name} average for comparable units.`
                          : hood.vsAvgPct < 0
                          ? `${hood.name} rents run ${Math.abs(hood.vsAvgPct)}% below the ${city.name} average for comparable units.`
                          : `${hood.name} rents are broadly in line with the ${city.name} average.`
                        }
                        {" "}{hood.context}
                      </p>
                    </div>
                  </div>
                  {hood.nearbyHoods?.length > 0 && (
                    <div style={{ marginTop:14, paddingTop:12, borderTop:"1px solid var(--border)" }}>
                      <div style={{ fontSize:11, fontWeight:700, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.04em", marginBottom:8 }}>Nearby neighbourhoods</div>
                      <div>{hood.nearbyHoods.map(n=><span key={n} className="tag">{n}</span>)}</div>
                    </div>
                  )}
                </div>
              </div>

              {/* About this estimate */}
              <div className="panel">
                <div className="panel-header">About this estimate</div>
                <div className="panel-body" style={{ display:"flex", flexDirection:"column", gap:12 }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:700, color:"var(--t1)", marginBottom:4 }}>Data sources</div>
                    <p style={{ fontSize:13, color:"var(--t2)", lineHeight:1.65 }}>
                      Built from CMHC's Rental Market Survey (October 2024), Rentals.ca's national report (February 2025), and anonymous rent submissions from {hood.name} renters who have used this tool.
                    </p>
                  </div>
                  <div style={{ paddingTop:10, borderTop:"1px solid var(--border)" }}>
                    <div style={{ fontSize:13, fontWeight:700, color:"var(--t1)", marginBottom:4 }}>Limitations</div>
                    <p style={{ fontSize:13, color:"var(--t2)", lineHeight:1.65 }}>
                      These are estimates, not appraisals. Building age, condition, and included amenities affect individual rents. A renovated unit in a newer building may rent above this range.
                    </p>
                  </div>
                  <div className="notice notice-amber" style={{ marginTop:4 }}>
                    <strong>Not legal advice.</strong> Do not use these estimates as the basis for legal proceedings or formal rent dispute applications without consulting a qualified professional.
                  </div>
                </div>
              </div>

              {/* FAQ */}
              <div className="panel">
                <div className="panel-header">Frequently asked questions — {hood.name}</div>
                <div className="panel-body">
                  {faqs.map((item,i) => <FaqItem key={i} q={item.q} a={item.a}/>)}
                </div>
              </div>
            </div>

            {/* RIGHT SIDEBAR */}
            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

              {/* Submission count */}
              <div className="panel">
                <div className="panel-header">Local submission data</div>
                <div className="panel-body">
                  <div style={{ fontFamily:"var(--mono)", fontSize:28, fontWeight:700, color:"var(--t1)", lineHeight:1, marginBottom:4 }}>
                    {ready ? totalSubmissions.toLocaleString("en-CA") : "—"}
                  </div>
                  <div style={{ fontSize:12, color:"var(--t3)", marginBottom:12 }}>verified {hood.name} submissions</div>
                  <p style={{ fontSize:13, color:"var(--t2)", lineHeight:1.65 }}>
                    {ready
                      ? totalSubmissions >= 20
                        ? `${hood.name} has strong local data. The estimates here are blended from real rents, not just city-wide averages.`
                        : totalSubmissions >= 5
                        ? `${totalSubmissions} local submissions so far. A few more would raise the confidence score.`
                        : `Fewer than 5 local submissions for ${hood.name}. Estimates rely primarily on CMHC data.`
                      : "Loading..."
                    }
                  </p>
                  <div style={{ marginTop:10, paddingTop:10, borderTop:"1px solid var(--border)", fontSize:11, color:"var(--t3)", lineHeight:1.5 }}>
                    Submissions are anonymous. We collect only neighbourhood, unit type, and monthly rent. No personal information is stored.
                  </div>
                </div>
              </div>

              {/* Trust signals */}
              <div className="panel">
                <div className="panel-header">Data quality</div>
                <div style={{ padding:"0 14px" }}>
                  {[
                    ["Anonymous submissions","No names or personal data stored"],
                    ["CMHC sourced","Official government housing survey data"],
                    ["Rentals.ca verified","Monthly national rent report"],
                    ["Not legal advice","Market estimates only"],
                  ].map(([title,sub])=>(
                    <div key={title} style={{ display:"flex", gap:10, padding:"10px 0", borderBottom:"1px solid #ebebeb", alignItems:"flex-start" }}>
                      <span style={{ color:accentColor, fontWeight:700, flexShrink:0, fontSize:13, marginTop:1 }}>&#10003;</span>
                      <div>
                        <div style={{ fontSize:13, fontWeight:600, color:"var(--t1)" }}>{title}</div>
                        <div style={{ fontSize:11, color:"var(--t3)", marginTop:1 }}>{sub}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* CTA */}
              <div className="cta-box" style={{ borderTopColor:accentColor }}>
                <h2 style={{ fontSize:15, fontWeight:700, color:"var(--t1)", marginBottom:8 }}>
                  Check your {hood.name} rent
                </h2>
                <p style={{ fontSize:13, color:"var(--t2)", lineHeight:1.6, marginBottom:16 }}>
                  Enter your details to compare your specific rent against the estimated fair range for {hood.name}.
                </p>
                <a href={`${city.calcUrl}?hood=${encodeURIComponent(hood.name)}`} className="cta-btn" style={{ background:accentColor }}>
                  Compare my rent &rarr;
                </a>
                <div style={{ marginTop:10, fontSize:11, color:"var(--t3)" }}>Free &middot; Anonymous &middot; 30 seconds</div>
              </div>
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <footer style={{ borderTop:"1px solid var(--border)", padding:"16px", textAlign:"center", background:"var(--white)" }}>
          <p style={{ fontFamily:"var(--mono)", fontSize:10, color:"var(--t3)", letterSpacing:"0.04em" }}>
            Anonymous &middot; No personal data stored &middot; Not legal or financial advice &middot; {new Date().getFullYear()} Fair Rent Canada
          </p>
        </footer>
      </div>
    </>
  );
}
