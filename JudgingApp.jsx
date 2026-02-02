import { useState, useCallback } from "react";

// ============================================================
// CONFIGURATION — edit these values for your contest
// ============================================================

// 1. GOOGLE SHEET URL
const GOOGLE_SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ1AbQ9LAKbKBaA-929jQu1bcbdwMtk2XFpMJuj4vKaxzvMOg6ZLBxr3jJPKYKmr9l8sYA9svKTVglr/pub?gid=0&single=true&output=csv";

// 2. JUDGE CREDENTIALS
const JUDGE_CREDENTIALS = {
  judge1: "alpha",
  judge2: "beta",
  judge3: "gamma",
  judge4: "delta",
};

// 3. APPS SCRIPT SUBMIT URL
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbygHMA5SXNX0UYqbBgV78dkfjkQF7VxXxReEaqRvExANvg8WFh25Lr2V873KfGbTQtv8g/exec";


// ============================================================
// PLACEHOLDER DATA
// ============================================================
const PLACEHOLDER_CATEGORIES = [
  { id: "animal",       name: "Animal",                        count: 5  },
  { id: "feature",      name: "Feature",                       count: 8  },
  { id: "fire",         name: "Fire",                          count: 4  },
  { id: "general_news", name: "General News",                  count: 12 },
  { id: "multicamera",  name: "Multicamera",                   count: 6  },
  { id: "sports",       name: "Sports",                        count: 26 },
  { id: "spot_news",    name: "Spot News",                     count: 9  },
  { id: "storyteller",  name: "Video Storyteller of the Year", count: 7  },
];

const FAKE_NAMES = [
  "Maria Vasquez","Ren Takahashi","Amara Osei","James Whitfield","Yuki Mori",
  "Sofia Reyes","Erik Lindqvist","Lena Park","Tomás Almeida","Chen Wei",
  "Fatima Al-Hassan","David Okonkwo","Nina Petrov","Miguel Santos","Hana Kobayashi",
  "Aisha Rahman","Lucas Bergström","Mei-Ling Zhao","Samuel Adeyemi","Ingrid Holst",
  "Kenji Watanabe","Rosa Flores","Ahmed Patel","Linnea Ström","Omar Khalil","Bea Hartmann",
];
const FAKE_TITLES = [
  "The Last Corridor","Quiet Grief","Dust Season","Sunday Ritual","Hands That Remember",
  "Neon Ancestors","Thaw","The Kelp Forest","Burning Season","Still Water",
  "Midnight Watch","The Crossing","Red Tide","Field Day","Frozen Light",
  "The Long Road","Storm Season","Paper Trails","On the Wire","Daybreak",
  "Open Season","The Return","Final Whistle","Undercover","Between the Lines","One Last Frame",
];
const FAKE_DESCS = [
  "A haunting look at displacement, following three families over six months as they navigate an uncertain future.",
  "Inside a processing center, one woman's story becomes a window into the invisible toll of bureaucratic limbo.",
  "Documenting the humanitarian corridor during the dry season, when water becomes the most contested resource.",
  "A quiet meditation on community and the generations of faith and resilience held within its walls.",
  "An aging master teaches their granddaughter the art — and the grief — of keeping a tradition alive.",
  "Through neon-lit streets, a performer traces the lineage of culture back through generations of resistance.",
  "Stunning footage follows the retreat of a glacier over two years, told through the eyes of local hunters.",
  "A deep-dive into the marine biologists racing to restore a fragile ecosystem before it disappears.",
  "Indigenous communities fight illegal fires while the rest of the world mostly looks away.",
  "A single rain puddle becomes a mirror for an entire village's quiet daily rhythm.",
];

function makePlaceholderEntries(catId, count) {
  return Array.from({ length: count }, (_, i) => ({
    id: `${catId}_${String(i + 1).padStart(2, "0")}`,
    title: FAKE_TITLES[i % FAKE_TITLES.length] + (i >= FAKE_TITLES.length ? " II" : ""),
    filmmaker: FAKE_NAMES[i % FAKE_NAMES.length],
    description: FAKE_DESCS[i % FAKE_DESCS.length],
    videoUrl: null,
  }));
}


// ============================================================
// CSV PARSER
// ============================================================
function parseCSV(csv) {
  const lines = csv.trim().split("\n");
  const parseLine = (line) => {
    const cols = [];
    let cur = "", inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === "," && !inQ) { cols.push(cur); cur = ""; continue; }
      cur += ch;
    }
    cols.push(cur);
    return cols.map((c) => c.trim());
  };

  const headers = parseLine(lines[0]);
  const colIdx = (name) => headers.findIndex((h) => h.toLowerCase() === name.toLowerCase());

  const catIdx   = colIdx("category");
  const idIdx    = colIdx("entryid");
  const titleIdx = colIdx("title");
  const fmIdx    = colIdx("filmmaker");
  const descIdx  = colIdx("description");
  const vidIdx   = colIdx("videourl");

  const catMap = new Map();
  lines.slice(1).forEach((line) => {
    if (!line.trim()) return;
    const cols = parseLine(line);
    const catName = cols[catIdx];
    if (!catName) return;
    if (!catMap.has(catName)) catMap.set(catName, []);
    catMap.get(catName).push({
      id:          cols[idIdx]    || "",
      title:       cols[titleIdx] || "",
      filmmaker:   cols[fmIdx]    || "",
      description: cols[descIdx]  || "",
      videoUrl:    cols[vidIdx]   || null,
    });
  });

  return Array.from(catMap.entries()).map(([name, entries]) => ({
    id:      name.toLowerCase().replace(/[^a-z0-9]/g, "_"),
    name,
    entries,
  }));
}


// ============================================================
// CONSTANTS
// ============================================================
const PLACE_LABELS = { 1: "1st Place", 2: "2nd Place", 3: "3rd Place" };
const PLACE_COLORS = {
  1: { bg: "#d4a017", text: "#1a1a1a", border: "#b8860b" },
  2: { bg: "#a8a8a8", text: "#1a1a1a", border: "#8a8a8a" },
  3: { bg: "#c87533", text: "#fff",    border: "#a0622a" },
};


// ============================================================
// MAIN APP
// ============================================================
export default function JudgingApp() {
  // ── State ──
  const [phase, setPhase]                     = useState("login");
  const [judgeId, setJudgeId]                 = useState("");
  const [judgeToken, setJudgeToken]           = useState("");
  const [loginError, setLoginError]           = useState("");
  const [categories, setCategories]           = useState([]);
  const [dataLoading, setDataLoading]         = useState(false);
  const [dataError, setDataError]             = useState("");
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [votes, setVotes]                     = useState({});
  const [expandedEntry, setExpandedEntry]     = useState(null);
  const [submitLoading, setSubmitLoading]     = useState(false);
  const [submittedCats, setSubmittedCats]     = useState(new Set());
  const [judgeHistory, setJudgeHistory]       = useState(null); // NEW: stores judge's previous votes

  // ── Load Data ──
  const loadData = useCallback(async () => {
    setDataLoading(true);
    setDataError("");
    try {
      if (GOOGLE_SHEET_CSV_URL) {
        const res = await fetch(GOOGLE_SHEET_CSV_URL);
        if (!res.ok) throw new Error("Sheet fetch failed");
        setCategories(parseCSV(await res.text()));
      } else {
        setCategories(
          PLACEHOLDER_CATEGORIES.map((c) => ({
            id: c.id, name: c.name,
            entries: makePlaceholderEntries(c.id, c.count),
          }))
        );
      }
    } catch (e) {
      setDataError("Failed to load contest data. Please refresh and try again.");
      console.error(e);
    }
    setDataLoading(false);
  }, []);

  // ── Load Judge History ──
  const loadJudgeHistory = useCallback(async (jid) => {
    if (!APPS_SCRIPT_URL) {
      console.log("⚠ APPS_SCRIPT_URL is empty, skipping history load");
      return;
    }
    
    console.log("📊 Fetching judge history for:", jid);
    console.log("📊 URL:", `${APPS_SCRIPT_URL}?judgeId=${encodeURIComponent(jid)}`);
    
    try {
      const res = await fetch(`${APPS_SCRIPT_URL}?judgeId=${encodeURIComponent(jid)}`);
      console.log("📊 Response status:", res.status);
      
      const data = await res.json();
      console.log("📊 Response data:", data);
      
      if (data.status === "success" && data.votes) {
        console.log("✓ Judge history loaded:", data.votes);
        setJudgeHistory(data.votes);
        
        // Mark categories as submitted if they have votes
        const completedCats = new Set();
        Object.keys(data.votes).forEach(catName => {
          // Convert category name to ID format (lowercase, underscores)
          const catId = catName.toLowerCase().replace(/[^a-z0-9]/g, "_");
          console.log(`  → Category "${catName}" → ID "${catId}"`);
          completedCats.add(catId);
        });
        console.log("✓ Completed categories:", Array.from(completedCats));
        setSubmittedCats(completedCats);
      } else {
        console.log("⚠ No votes found or invalid response format");
      }
    } catch (e) {
      console.error("❌ Failed to load judge history:", e);
    }
  }, []);

  // ── Login ──
  const handleLogin = async () => {
    if (JUDGE_CREDENTIALS[judgeId] === judgeToken) {
      setLoginError("");
      setPhase("loading"); // Show loading state while we fetch data
      await loadData();
      // Load judge history after categories are loaded
      await loadJudgeHistory(judgeId);
      setPhase("browse");
    } else {
      setLoginError("Invalid judge ID or access code.");
    }
  };

  // ── Voting Logic ──
  const toggleVote = (entryId, place) => {
    setVotes((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => { if (next[k] === place) delete next[k]; });
      if (next[entryId] === place) delete next[entryId];
      else next[entryId] = place;
      return next;
    });
  };

  const isPlaceTaken  = (place)   => Object.values(votes).includes(place);
  const getEntryPlace = (entryId) => votes[entryId] || null;

  // ── Category Selection (with history pre-fill) ──
  const handleCategorySelect = (cat) => {
    setSelectedCategory(cat);
    setExpandedEntry(null);
    
    // Pre-fill votes if this judge already voted on this category
    if (judgeHistory && judgeHistory[cat.name]) {
      const previousVotes = {};
      judgeHistory[cat.name].forEach(v => {
        previousVotes[v.entryId] = v.place;
      });
      setVotes(previousVotes);
    } else {
      setVotes({});
    }
    
    setPhase("judge");
  };

  // ── Submit ──
  const handleSubmit = async () => {
    setSubmitLoading(true);
    const payload = {
      judgeId,
      category:  selectedCategory.name,
      timestamp: new Date().toISOString(),
      votes: Object.entries(votes).map(([entryId, place]) => {
        const entry = selectedCategory.entries.find((e) => e.id === entryId);
        return { entryId, place, title: entry?.title || "", filmmaker: entry?.filmmaker || "" };
      }),
    };
    try {
      if (APPS_SCRIPT_URL) {
        await fetch(APPS_SCRIPT_URL, {
          method: "POST",
          mode: "no-cors",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        await new Promise((r) => setTimeout(r, 1200));
      }
      setSubmittedCats((prev) => new Set([...prev, selectedCategory.id]));
      setPhase("submitted");
    } catch (e) {
      setDataError("Submission failed. Please try again.");
      console.error(e);
    }
    setSubmitLoading(false);
  };


  // ── STYLES ──
  const S = {
    app:        { minHeight: "100vh", background: "#0f0f0f", color: "#e8e4df", fontFamily: "'Georgia', serif", position: "relative" },
    grain:      { position: "fixed", inset: 0, opacity: 0.035, pointerEvents: "none", zIndex: 100, backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")` },
    header:     { borderBottom: "1px solid #2a2a2a", padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, background: "#0f0f0f", zIndex: 50 },
    hTitle:     { fontSize: "11px", letterSpacing: "3px", textTransform: "uppercase", color: "#6b6560" },
    hRight:     { fontSize: "11px", color: "#4a4540", letterSpacing: "1px" },
    hero:       { padding: "56px 24px 40px", maxWidth: 820, margin: "0 auto", textAlign: "center" },
    heroTitle:  { fontSize: "clamp(26px, 4vw, 40px)", fontWeight: 400, letterSpacing: "-0.5px", lineHeight: 1.2, color: "#e8e4df", marginBottom: 8 },
    heroSub:    { fontSize: "14px", color: "#6b6560", lineHeight: 1.7, maxWidth: 460, margin: "0 auto" },
    loginBox:   { maxWidth: 380, margin: "28px auto 0", background: "#181614", border: "1px solid #2a2a2a", borderRadius: 8, padding: "32px 28px" },
    label:      { display: "block", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: "#6b6560", marginBottom: 6, marginTop: 18 },
    input:      { width: "100%", background: "#0f0f0f", border: "1px solid #2a2a2a", borderRadius: 5, padding: "10px 13px", color: "#e8e4df", fontSize: "15px", fontFamily: "'Georgia', serif", outline: "none", boxSizing: "border-box" },
    loginErr:   { color: "#c0504d", fontSize: "13px", marginTop: 12, fontStyle: "italic" },
    btn:        { display: "block", width: "100%", marginTop: 24, padding: "12px", background: "#d4a017", border: "none", borderRadius: 5, color: "#1a1a1a", fontSize: "11px", letterSpacing: "2.5px", textTransform: "uppercase", fontFamily: "'Georgia', serif", fontWeight: 600, cursor: "pointer" },
    catGrid:    { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 10, maxWidth: 820, margin: "0 auto", padding: "0 24px" },
    catCard:    (done) => ({ background: done ? "#1a2518" : "#181614", border: `1px solid ${done ? "#2d4a2d" : "#2a2a2a"}`, borderRadius: 8, padding: "22px 18px", cursor: "pointer", transition: "all 0.2s", position: "relative" }),
    catName:    { fontSize: "15px", fontWeight: 400, color: "#e8e4df", marginBottom: 3 },
    catCount:   { fontSize: "11px", color: "#4a4540", letterSpacing: "0.5px" },
    catDone:    { position: "absolute", top: 10, right: 12, fontSize: "10px", color: "#6aaa6a", letterSpacing: "1px" },
    backNav:    { padding: "24px 24px 0", maxWidth: 820, margin: "0 auto" },
    backBtn:    { background: "none", border: "none", color: "#6b6560", fontSize: "13px", letterSpacing: "1px", cursor: "pointer", fontFamily: "'Georgia', serif", padding: 0, transition: "color 0.2s" },
    judgeWrap:  { maxWidth: 820, margin: "0 auto", padding: "18px 24px 100px" },
    catTitle:   { fontSize: "clamp(20px, 3.2vw, 30px)", fontWeight: 400, color: "#e8e4df", marginBottom: 3 },
    catMeta:    { fontSize: "11px", color: "#4a4540", letterSpacing: "0.5px", marginBottom: 28 },
    card:       (p) => ({ background: "#181614", border: `1px solid ${p ? PLACE_COLORS[p].border : "#2a2a2a"}`, borderRadius: 8, overflow: "hidden", marginBottom: 12, transition: "border-color 0.2s" }),
    thumbWrap:  { width: "100%", aspectRatio: "16/9", background: "#141210", cursor: "pointer", position: "relative", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" },
    playCircle: { width: 44, height: 44, borderRadius: "50%", background: "rgba(212,160,23,0.88)", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", zIndex: 1, boxShadow: "0 3px 16px rgba(0,0,0,0.4)" },
    entryInfo:  { padding: "14px 18px 16px" },
    entryTitle: { fontSize: "16px", fontWeight: 400, color: "#e8e4df", marginBottom: 2 },
    entryFm:    { fontSize: "12px", color: "#6b6560", fontStyle: "italic", marginBottom: 6 },
    entryDesc:  { fontSize: "13px", color: "#7a7570", lineHeight: 1.55 },
    voteRow:    { display: "flex", gap: 7, marginTop: 12, flexWrap: "wrap" },
    voteBtn:    (place, active, disabled) => ({
      flex: "1 1 68px", padding: "8px 8px",
      border: `1px solid ${active ? PLACE_COLORS[place].border : "#2a2a2a"}`,
      borderRadius: 5, background: active ? PLACE_COLORS[place].bg : "transparent",
      color: active ? PLACE_COLORS[place].text : disabled ? "#3a3530" : "#8a8580",
      fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase",
      fontFamily: "'Georgia', serif", fontWeight: active ? 600 : 400,
      cursor: disabled && !active ? "not-allowed" : "pointer",
      opacity: disabled && !active ? 0.3 : 1, transition: "all 0.18s",
    }),
    submitBar:  { position: "fixed", bottom: 0, left: 0, right: 0, background: "rgba(15,15,15,0.93)", backdropFilter: "blur(12px)", borderTop: "1px solid #2a2a2a", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "center", gap: 18, zIndex: 40 },
    submitInfo: { fontSize: "11px", color: "#5a5550", letterSpacing: "0.5px" },
    submitOn:   { padding: "10px 28px", background: "#d4a017", border: "none", borderRadius: 5, color: "#1a1a1a", fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", fontFamily: "'Georgia', serif", fontWeight: 600, cursor: "pointer" },
    submitOff:  { padding: "10px 28px", background: "#222", border: "none", borderRadius: 5, color: "#4a4540", fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", fontFamily: "'Georgia', serif", fontWeight: 600, cursor: "not-allowed" },
    successIcon:  { fontSize: "40px", display: "block", marginBottom: 16 },
    successTitle: { fontSize: "24px", fontWeight: 400, color: "#e8e4df", marginBottom: 6 },
    successSub:   { fontSize: "14px", color: "#6b6560", lineHeight: 1.7, maxWidth: 400, margin: "0 auto" },
    smallBtn:     { display: "inline-block", marginTop: 22, padding: "8px 20px", background: "transparent", border: "1px solid #3a3a3a", borderRadius: 5, color: "#8a8580", fontSize: "11px", letterSpacing: "1.5px", textTransform: "uppercase", fontFamily: "'Georgia', serif", cursor: "pointer", transition: "all 0.2s" },
    center:     { textAlign: "center", padding: "80px 24px", color: "#6b6560", fontSize: "14px" },
  };

  // ── LOGIN ──
  if (phase === "login") {
    return (
      <div style={S.app}>
        <div style={S.grain} />
        <header style={S.header}>
          <span style={S.hTitle}>Photojournalism Awards</span>
          <span style={S.hRight}>2026</span>
        </header>
        <div style={S.hero}>
          <h1 style={S.heroTitle}>Judge Portal</h1>
          <p style={S.heroSub}>Enter your credentials to begin reviewing and scoring entries.</p>
          <div style={S.loginBox}>
            <label style={{ ...S.label, marginTop: 0 }}>Judge ID</label>
            <input style={S.input} value={judgeId} onChange={(e) => setJudgeId(e.target.value)} placeholder="e.g. judge1" onKeyDown={(e) => e.key === "Enter" && handleLogin()} />
            <label style={S.label}>Access Code</label>
            <input style={S.input} type="password" value={judgeToken} onChange={(e) => setJudgeToken(e.target.value)} placeholder="••••••••" onKeyDown={(e) => e.key === "Enter" && handleLogin()} />
            {loginError && <p style={S.loginErr}>{loginError}</p>}
            <button style={S.btn} onClick={handleLogin}>Enter</button>
          </div>
        </div>
      </div>
    );
  }

  // ── BROWSE ──
  if (phase === "browse" || phase === "loading") {
    if (dataLoading || phase === "loading") return (
      <div style={S.app}><div style={S.grain} />
        <header style={S.header}><span style={S.hTitle}>Photojournalism Awards</span></header>
        <div style={S.center}>Loading categories…</div>
      </div>
    );
    if (dataError) return (
      <div style={S.app}><div style={S.grain} />
        <header style={S.header}><span style={S.hTitle}>Photojournalism Awards</span></header>
        <div style={{ ...S.center, color: "#c0504d" }}>{dataError}</div>
      </div>
    );

    return (
      <div style={S.app}>
        <div style={S.grain} />
        <header style={S.header}>
          <span style={S.hTitle}>Photojournalism Awards</span>
          <span style={S.hRight}>Judging as: {judgeId}</span>
        </header>
        <div style={S.hero}>
          <h1 style={S.heroTitle}>Select a Category</h1>
          <p style={S.heroSub}>Review all entries in a category, then assign your top three.</p>
        </div>
        <div style={S.catGrid}>
          {categories.map((cat) => {
            const done = submittedCats.has(cat.id);
            return (
              <div
                key={cat.id}
                style={S.catCard(done)}
                onClick={() => handleCategorySelect(cat)}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = done ? "#4a7a4a" : "#d4a017"; e.currentTarget.style.transform = "translateY(-2px)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = done ? "#2d4a2d" : "#2a2a2a"; e.currentTarget.style.transform = "translateY(0)"; }}
              >
                {done && <span style={S.catDone}>✓ Done</span>}
                <div style={S.catName}>{cat.name}</div>
                <div style={S.catCount}>{cat.entries.length} {cat.entries.length === 1 ? "entry" : "entries"}</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── JUDGING ──
  if (phase === "judge" && selectedCategory) {
    const placesAssigned = Object.keys(votes).length;
    const ready = placesAssigned === 3;

    return (
      <div style={S.app}>
        <div style={S.grain} />
        <header style={S.header}>
          <span style={S.hTitle}>Photojournalism Awards</span>
          <span style={S.hRight}>Judging as: {judgeId}</span>
        </header>

        <div style={S.backNav}>
          <button style={S.backBtn} onMouseEnter={(e) => (e.target.style.color = "#d4a017")} onMouseLeave={(e) => (e.target.style.color = "#6b6560")} onClick={() => { setPhase("browse"); setSelectedCategory(null); }}>
            ← Categories
          </button>
        </div>

        <div style={S.judgeWrap}>
          <h1 style={S.catTitle}>{selectedCategory.name}</h1>
          <div style={S.catMeta}>{selectedCategory.entries.length} entries · Assign 1st, 2nd, and 3rd place</div>

          {selectedCategory.entries.map((entry) => {
            const myPlace   = getEntryPlace(entry.id);
            const isExpanded = expandedEntry === entry.id;

            return (
              <div key={entry.id} style={S.card(myPlace)}>
                {/* Thumbnail / video area */}
                {!isExpanded && (
                  <div style={S.thumbWrap} onClick={() => setExpandedEntry(entry.id)}>
                    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, #1e1c18 0%, #141210 100%)" }} />
                    <div style={S.playCircle}>
                      <span style={{ color: "#1a1a1a", fontSize: 17, marginLeft: 2 }}>▶</span>
                    </div>
                    {myPlace && (
                      <span style={{ position: "absolute", top: 8, left: 8, zIndex: 1, background: PLACE_COLORS[myPlace].bg, color: PLACE_COLORS[myPlace].text, fontSize: "9px", fontWeight: 700, letterSpacing: "1.5px", padding: "3px 8px", borderRadius: 3 }}>
                        {PLACE_LABELS[myPlace].toUpperCase()}
                      </span>
                    )}
                    <span style={{ position: "absolute", bottom: 8, right: 10, zIndex: 1, fontSize: "9px", color: "#777", background: "rgba(0,0,0,0.5)", padding: "2px 6px", borderRadius: 3 }}>
                      ▶ Play
                    </span>
                  </div>
                )}

                {/* Expanded video area */}
                {isExpanded && (
                  <div style={{ background: "#000", position: "relative", aspectRatio: "16/9" }}>
                    {entry.videoUrl ? (
                      <iframe src={entry.videoUrl} style={{ width: "100%", height: "100%", border: "none" }} allow="autoplay; fullscreen" title={entry.title} />
                    ) : (
                      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", border: "1px dashed #333" }}>
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 22, marginBottom: 5 }}>🎬</div>
                          <div style={{ fontSize: "12px", color: "#5a5550" }}>Video embed goes here</div>
                          <div style={{ fontSize: "10px", color: "#3a3530", marginTop: 2 }}>Add a Google Drive embed URL in your Sheet</div>
                        </div>
                      </div>
                    )}
                    {/* Close button overlay */}
                    <button
                      onClick={() => setExpandedEntry(null)}
                      style={{
                        position: "absolute",
                        top: 8,
                        right: 10,
                        background: "rgba(0,0,0,0.7)",
                        border: "1px solid #444",
                        borderRadius: 4,
                        color: "#ccc",
                        fontSize: "11px",
                        padding: "4px 10px",
                        cursor: "pointer",
                        fontFamily: "'Georgia', serif",
                        letterSpacing: "0.5px",
                      }}
                    >
                      ✕ Close
                    </button>
                  </div>
                )}

                <div style={S.entryInfo}>
                  <div style={S.entryTitle}>{entry.title || entry.id}</div>
                  <div style={S.entryFm}>{entry.filmmaker ? `by ${entry.filmmaker}` : ""}</div>
                  {entry.description && <div style={S.entryDesc}>{entry.description}</div>}
                  <div style={S.voteRow}>
                    {[1, 2, 3].map((place) => {
                      const active   = myPlace === place;
                      const disabled = isPlaceTaken(place) && !active;
                      return (
                        <button
                          key={place}
                          style={S.voteBtn(place, active, disabled)}
                          disabled={disabled}
                          onClick={() => toggleVote(entry.id, place)}
                        >
                          {PLACE_LABELS[place]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div style={S.submitBar}>
          <span style={S.submitInfo}>{placesAssigned} of 3 places assigned</span>
          <button
            style={ready && !submitLoading ? S.submitOn : S.submitOff}
            disabled={!ready || submitLoading}
            onClick={handleSubmit}
          >
            {submitLoading ? "Submitting…" : "Submit Votes"}
          </button>
        </div>
      </div>
    );
  }

  // ── SUBMITTED ──
  if (phase === "submitted") {
    return (
      <div style={S.app}>
        <div style={S.grain} />
        <header style={S.header}>
          <span style={S.hTitle}>Photojournalism Awards</span>
          <span style={S.hRight}>Judging as: {judgeId}</span>
        </header>
        <div style={{ ...S.hero, paddingTop: 90, textAlign: "center" }}>
          <span style={S.successIcon}>✓</span>
          <h1 style={S.successTitle}>Votes Submitted</h1>
          <p style={S.successSub}>
            Your rankings for <strong style={{ color: "#e8e4df" }}>{selectedCategory?.name}</strong> have been recorded.
            {submittedCats.size < categories.length
              ? ` You have ${categories.length - submittedCats.size} ${categories.length - submittedCats.size === 1 ? "category" : "categories"} remaining.`
              : " You have completed all categories. Thank you!"}
          </p>
          <button
            style={S.smallBtn}
            onMouseEnter={(e) => { e.target.style.borderColor = "#d4a017"; e.target.style.color = "#d4a017"; }}
            onMouseLeave={(e) => { e.target.style.borderColor = "#3a3a3a"; e.target.style.color = "#8a8580"; }}
            onClick={() => { setPhase("browse"); setSelectedCategory(null); setVotes({}); }}
          >
            ← Back to Categories
          </button>
        </div>
      </div>
    );
  }

  return null;
}
