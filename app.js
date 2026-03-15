/**
 * Nishanth Konsultancy - Digital Sovereignty Assessment
 * app.js  ·  ES Module
 *
 * Architecture:
 *  1. loadCatalog()     : fetches manifest + country/sector JSON files
 *  2. buildCtx()        : assembles context object from current UI state
 *  3. matchRule()       : evaluates applicability predicates
 *  4. getMatched()      : returns {rules, overlays} that apply / may apply
 *  5. renderRuleQs()    : builds Step 3 question blocks
 *  6. generateReport()  : scores, narrates, builds report DOM
 *  7. localStorage      : persists state across page refreshes
 */

/* ═══════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════ */
const STORAGE_KEY  = "nk-sovereignty-v14";
const RULES_BASE   = "./rules/";

const COUNTRY_PILLS = [
  { id: "AU", label: "🇦🇺 Australia" },
  { id: "BR", label: "🇧🇷 Brazil" },
  { id: "CA", label: "🇨🇦 Canada" },
  { id: "EU", label: "🇪🇺 European Union" },
  { id: "IN", label: "🇮🇳 India" },
  { id: "JP", label: "🇯🇵 Japan" },
  { id: "SA", label: "🇸🇦 Saudi Arabia" },
  { id: "SG", label: "🇸🇬 Singapore" },
  { id: "ZA", label: "🇿🇦 South Africa" },
  { id: "UK", label: "🇬🇧 United Kingdom" },
  { id: "US", label: "🇺🇸 United States" },
];

const ORIGIN_PILLS = [
  { id: "EU",   label: "EU / EEA" },
  { id: "UK",   label: "United Kingdom" },
  { id: "IN",   label: "India" },
  { id: "AU",   label: "Australia" },
  { id: "BR",   label: "Brazil" },
  { id: "CA",   label: "Canada" },
  { id: "JP",   label: "Japan" },
  { id: "SA",   label: "Saudi Arabia" },
  { id: "SG",   label: "Singapore" },
  { id: "ZA",   label: "South Africa" },
  { id: "US",   label: "United States" },
  { id: "APAC", label: "APAC (other)" },
];

const STORAGE_PILLS    = [
  { id: "EU", label: "EU" }, { id: "UK", label: "UK" }, { id: "US", label: "US" },
  { id: "IN", label: "India" }, { id: "SG", label: "Singapore" }, { id: "AU", label: "Australia" },
];
const PROCESSOR_PILLS  = [
  { id: "US", label: "United States" }, { id: "EU", label: "EU / EEA" },
  { id: "UK", label: "United Kingdom" }, { id: "IN", label: "India" },
  { id: "SG", label: "Singapore" }, { id: "CA", label: "Canada" }, { id: "AU", label: "Australia" },
];

const DEFAULT_DATA_CATS = [
  { id: "personal",   label: "Personal data" },
  { id: "sensitive",  label: "Sensitive / special category" },
  { id: "children",   label: "Children's data" },
  { id: "employee",   label: "Employee / HR data" },
  { id: "financial",  label: "Financial data" },
  { id: "health",     label: "Health data" },
  { id: "biometric",  label: "Biometric data" },
  { id: "tracking",   label: "Tracking / behavioral data" },
];

const STEP_NAMES = ["", "Profile", "Data Flows", "Rule Questions", "Evidence", "Review & Report"];

/* ═══════════════════════════════════════
   STATE
   ═══════════════════════════════════════ */
function defaultState() {
  return {
    currentStep:        1,
    selectedCountries:  [],
    dataCategories:     [],
    dataOrigins:        [],
    storageLocations:   [],
    processorLocations: [],
    answers:            {},          // keyed: `ruleId_questionIndex` → "yes"|"partial"|"no"|"na"
    evidenceIds:        [],          // checked evidence item ids
    orgName:            "",
    assessmentName:     "",
    consultantNotes1:   "",
    consultantNotes:    "",
    sector:             "general",
    entitySize:         "Small",
    processesPersonalData:    false,
    crossBorderTransfers:     false,
    offersToEU:               false,
    offersToUK:               false,
    regulatedFinancialEntity: false,
    essentialEntity:          false,
    usesAI:                   false,
    cloudProvider:      "",
    transferNotes:      "",
    unknowns:           "",
    assumptions:        "",
  };
}

let state = loadPersistedState();
let catalog = null;   // populated after fetch

/* ═══════════════════════════════════════
   PERSISTENCE
   ═══════════════════════════════════════ */
function loadPersistedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      return Object.assign(defaultState(), saved);
    }
  } catch (_) { /* ignore */ }
  return defaultState();
}

function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) { /* ignore */ }
}

/* ═══════════════════════════════════════
   CATALOG LOADING
   ═══════════════════════════════════════ */
async function fetchJson(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${path} (${res.status})`);
  return res.json();
}

async function loadCatalog() {
  const manifest = await fetchJson(`${RULES_BASE}manifest.json`);
  const core     = await fetchJson(`${RULES_BASE}${manifest.core}`);

  const [countryFiles, sectorFiles] = await Promise.all([
    Promise.all((manifest.countries || []).map(f => fetchJson(`${RULES_BASE}${f}`))),
    Promise.all((manifest.sectors   || []).map(f => fetchJson(`${RULES_BASE}${f}`))),
  ]);

  const rules    = [];
  const overlays = [];

  countryFiles.forEach(file => {
    (file.rules || []).forEach(r => {
      rules.push({
        ...r,
        _countryId:    file.country?.id    || "",
        _countryLabel: file.country?.label || "",
      });
    });
  });

  sectorFiles.forEach(file => {
    (file.overlays || []).forEach(o => {
      overlays.push({
        ...o,
        _sectorId:    file.sector?.id    || "",
        _sectorLabel: file.sector?.label || "",
        layer:        o.layer        || "sector",
        layerLabel:   o.layerLabel   || "Sector Overlay",
        maintenanceStatus: o.maintenanceStatus || "reviewed",
        version:      o.version      || "1.0.0",
        officialSources: o.officialSources || [],
      });
    });
  });

  catalog = {
    rules,
    overlays,
    dataCategories: core.dataCategories || DEFAULT_DATA_CATS,
  };
}

/* ═══════════════════════════════════════
   RULE ENGINE
   ═══════════════════════════════════════ */
function buildCtx() {
  return {
    processesPersonalData:    state.processesPersonalData,
    crossBorderTransfers:     state.crossBorderTransfers,
    offersToEU:               state.offersToEU,
    offersToUK:               state.offersToUK,
    regulatedFinancialEntity: state.regulatedFinancialEntity,
    essentialEntity:          state.essentialEntity,
    usesAI:                   state.usesAI,
    sector:                   state.sector,
    selectedCountries:        state.selectedCountries,
    dataCategories:           state.dataCategories,
    dataOrigin:               state.dataOrigins,
    storageLocations:         state.storageLocations,
    processorLocations:       state.processorLocations,
  };
}

function evalPredicate(pred, ctx) {
  switch (pred.type) {
    case "boolean":  return Boolean(ctx[pred.field]) === Boolean(pred.equals);
    case "includes": return Array.isArray(ctx[pred.field]) && ctx[pred.field].includes(pred.value);
    case "equals":   return ctx[pred.field] === pred.value;
    case "notEmpty": return Boolean(ctx[pred.field] && String(ctx[pred.field]).trim());
    default:         return false;
  }
}

function matchRule(rule, ctx) {
  const ai = rule.applicability?.appliesIf  || [];
  const mi = rule.applicability?.mayApplyIf || [];
  const applies  = ai.length > 0 && ai.every(p => evalPredicate(p, ctx));
  const mayApply = !applies && mi.length > 0 && mi.some(p => evalPredicate(p, ctx));
  return { applies, mayApply };
}

function getMatched() {
  if (!catalog) return { rules: [], overlays: [] };
  const ctx = buildCtx();
  const rules    = catalog.rules.map(r => ({ ...r, _m: matchRule(r, ctx) })).filter(r => r._m.applies || r._m.mayApply);
  const overlays = catalog.overlays.map(o => ({ ...o, _m: matchRule(o, ctx) })).filter(o => o._m.applies || o._m.mayApply);
  return { rules, overlays };
}

/* ═══════════════════════════════════════
   SIDEBAR & PROGRESS
   ═══════════════════════════════════════ */
function renderSidebar() {
  const el = document.getElementById("sbSteps");
  if (!el) return;
  let h = "";
  for (let i = 1; i <= 5; i++) {
    const done = i < state.currentStep;
    const cur  = i === state.currentStep;
    const cls  = done ? "si done" : cur ? "si cur" : "si";
    const dot  = done ? "✓" : i;
    const badge = done ? `<div class="si-badge b-done">Done</div>`
                : cur  ? `<div class="si-badge b-cur">Current</div>` : "";
    h += `<div class="${cls}" data-step="${i}">
      <div class="si-left"><div class="si-dot">${dot}</div><div class="si-name">${STEP_NAMES[i]}</div></div>${badge}
    </div>`;
  }
  el.innerHTML = h;
  el.querySelectorAll(".si[data-step]").forEach(el => {
    el.addEventListener("click", () => {
      const n = parseInt(el.dataset.step, 10);
      if (n <= state.currentStep) goStep(n);
    });
  });
  const pct = Math.round(((state.currentStep - 1) / 5) * 100);
  const fill = document.getElementById("progFill");
  const pctEl = document.getElementById("progPct");
  if (fill)  fill.style.width = pct + "%";
  if (pctEl) pctEl.textContent = pct + "% complete";
}

function updateRulesBadge() {
  const badge  = document.getElementById("rulesBadge");
  const count  = document.getElementById("rulesCount");
  const meta   = document.getElementById("sbRulesMeta");
  if (!catalog) {
    if (badge) { badge.className = "rules-badge rb-err"; badge.textContent = "✗ Rules failed to load"; }
    return;
  }
  const rc = catalog.rules.length;
  const oc = catalog.overlays.length;
  if (badge) { badge.className = "rules-badge rb-ok"; badge.textContent = `✓ ${rc} rules · ${oc} overlays loaded`; }
  if (count) count.textContent = `${rc} jurisdiction rules · ${oc} sector overlays`;
  const reviewed = catalog.rules.filter(r => r.maintenanceStatus === "reviewed").length;
  const owners   = [...new Set(catalog.rules.map(r => r.reviewOwner).filter(Boolean))].join(", ");
  if (meta) meta.textContent = `${reviewed}/${rc} reviewed · ${owners}`;
}

/* ═══════════════════════════════════════
   NAVIGATION
   ═══════════════════════════════════════ */
function goStep(n) {
  document.querySelectorAll(".sp").forEach(p => p.classList.remove("active"));
  const target = document.getElementById("step" + n);
  if (target) target.classList.add("active");
  state.currentStep = n;
  persist();
  renderSidebar();
  document.getElementById("assessment")?.scrollIntoView({ behavior: "smooth" });
}

function goToRules() {
  renderRuleQs();
  goStep(3);
}

function goToReview() {
  renderReview();
  goStep(5);
}

/* ═══════════════════════════════════════
   PILLS
   ═══════════════════════════════════════ */
const GROUP_MAP = {
  country:    "selectedCountries",
  origin:     "dataOrigins",
  storage:    "storageLocations",
  processor:  "processorLocations",
  datacat:    "dataCategories",
};

function renderPillGroup(containerId, items, group) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = items.map(item => {
    const sel = state[GROUP_MAP[group]]?.includes(item.id) ? " sel" : "";
    return `<div class="pill${sel}" data-group="${group}" data-id="${item.id}">${item.label}</div>`;
  }).join("");
  el.querySelectorAll(".pill").forEach(pill => {
    pill.addEventListener("click", () => {
      pill.classList.toggle("sel");
      const arr = state[GROUP_MAP[group]];
      const id  = pill.dataset.id;
      const idx = arr.indexOf(id);
      idx >= 0 ? arr.splice(idx, 1) : arr.push(id);
      persist();
    });
  });
}

function renderAllPills() {
  renderPillGroup("pillCountries", COUNTRY_PILLS, "country");
  renderPillGroup("pillOrigin",    ORIGIN_PILLS,  "origin");
  renderPillGroup("pillStorage",   STORAGE_PILLS, "storage");
  renderPillGroup("pillProcessors",PROCESSOR_PILLS,"processor");
  const cats = catalog?.dataCategories || DEFAULT_DATA_CATS;
  renderPillGroup("pillDataCats",  cats, "datacat");
}

/* ═══════════════════════════════════════
   FORM SYNC
   ═══════════════════════════════════════ */
function syncFormToState() {
  // Text/select fields → state
  const textFields = [
    ["orgName",            "orgName"],
    ["assessmentName",     "assessmentName"],
    ["consultantNotesStep1","consultantNotes1"],
    ["consultantNotes",    "consultantNotes"],
    ["cloudProvider",      "cloudProvider"],
    ["transferNotes",      "transferNotes"],
    ["unknowns",           "unknowns"],
    ["assumptions",        "assumptions"],
    ["sector",             "sector"],
    ["entitySize",         "entitySize"],
  ];
  textFields.forEach(([elId, field]) => {
    const el = document.getElementById(elId);
    if (el && state[field] !== undefined) el.value = state[field];
  });
  // Checkboxes
  const chkMap = {
    chk_personal:   "processesPersonalData",
    chk_crossborder:"crossBorderTransfers",
    chk_eu:         "offersToEU",
    chk_uk:         "offersToUK",
    chk_fin:        "regulatedFinancialEntity",
    chk_critical:   "essentialEntity",
    chk_ai:         "usesAI",
  };
  Object.entries(chkMap).forEach(([elId, field]) => {
    const el = document.getElementById(elId);
    if (el) el.checked = !!state[field];
  });
  // Evidence checkboxes
  document.querySelectorAll(".evid").forEach(el => {
    el.checked = state.evidenceIds.includes(el.id);
  });
  // Cloud risk callout
  checkCloudRisk();
}

function bindFormEvents() {
  // Text / textarea inputs
  const textFields = [
    ["orgName",            "orgName"],
    ["assessmentName",     "assessmentName"],
    ["consultantNotesStep1","consultantNotes1"],
    ["consultantNotes",    "consultantNotes"],
    ["transferNotes",      "transferNotes"],
    ["unknowns",           "unknowns"],
    ["assumptions",        "assumptions"],
  ];
  textFields.forEach(([elId, field]) => {
    document.getElementById(elId)?.addEventListener("input", e => {
      state[field] = e.target.value;
      persist();
    });
  });

  // Selects
  document.getElementById("sector")?.addEventListener("change", e => {
    state.sector = e.target.value;
    persist();
  });
  document.getElementById("entitySize")?.addEventListener("change", e => {
    state.entitySize = e.target.value;
    persist();
  });
  document.getElementById("cloudProvider")?.addEventListener("change", e => {
    state.cloudProvider = e.target.value;
    persist();
    checkCloudRisk();
  });

  // Checkboxes
  const chkMap = {
    chk_personal:    "processesPersonalData",
    chk_crossborder: "crossBorderTransfers",
    chk_eu:          "offersToEU",
    chk_uk:          "offersToUK",
    chk_fin:         "regulatedFinancialEntity",
    chk_critical:    "essentialEntity",
    chk_ai:          "usesAI",
  };
  Object.entries(chkMap).forEach(([elId, field]) => {
    document.getElementById(elId)?.addEventListener("change", e => {
      state[field] = e.target.checked;
      persist();
    });
  });

  // Evidence checkboxes
  document.querySelectorAll(".evid").forEach(el => {
    el.addEventListener("change", e => {
      if (e.target.checked) {
        if (!state.evidenceIds.includes(e.target.id)) state.evidenceIds.push(e.target.id);
      } else {
        state.evidenceIds = state.evidenceIds.filter(id => id !== e.target.id);
      }
      persist();
    });
  });
}

function checkCloudRisk() {
  const v  = document.getElementById("cloudProvider")?.value || "";
  const el = document.getElementById("cloudRisk");
  if (el) el.style.display = (v.includes("us") || v === "mixed") ? "block" : "none";
}

/* ═══════════════════════════════════════
   RULE QUESTIONS (STEP 3)
   ═══════════════════════════════════════ */
const LAYER_CLS = {
  privacy:   "rb-privacy",
  cyber:     "rb-cyber",
  transfer:  "rb-transfer",
  sector:    "rb-sector",
  marketing: "rb-marketing",
  sectoral:  "rb-sectoral",
  ai:        "rb-ai",
};

function layerBadge(layer, label) {
  return `<span class="rbadge ${LAYER_CLS[layer] || "rb-privacy"}">${label}</span>`;
}
function statusBadge(s) {
  return s === "reviewed"
    ? `<span class="rbadge rb-reviewed">✓ Reviewed</span>`
    : `<span class="rbadge rb-provisional">⚠ Provisional</span>`;
}

function renderRuleQs() {
  const { rules, overlays } = getMatched();
  const all = [...rules, ...overlays];
  const el  = document.getElementById("ruleQs");
  if (!el) return;

  if (!all.length) {
    el.innerHTML = `<div class="empty"><div class="empty-icon">🌐</div>No rules matched your profile.<br>Select countries or check activity boxes in Steps 1–2.</div>`;
    return;
  }

  let h = "";
  all.forEach(rule => {
    const isMay = !rule._m.applies && rule._m.mayApply;
    const loc   = rule._countryLabel || rule._sectorLabel || "";
    const qs    = rule.questions || [];
    const meta  = [
      rule.version       ? `v${rule.version}` : "",
      rule.lastReviewed  ? `Reviewed ${rule.lastReviewed}` : "",
      rule.nextReviewDue ? `Next ${rule.nextReviewDue}` : "",
      rule.reviewOwner   ? rule.reviewOwner : "",
    ].filter(Boolean).join(" · ");

    h += `<div class="rqw">
      <div class="rq-head">
        <div>
          ${isMay ? `<div class="may-badge">⚠ May Apply — review with counsel</div>` : ""}
          <div class="rq-title">${rule.title}${loc ? " — " + loc : ""}</div>
          <div class="rq-focus">${rule.focus || ""}</div>
          <div class="rq-meta">${layerBadge(rule.layer, rule.layerLabel || rule.layer)}${statusBadge(rule.maintenanceStatus)}</div>
        </div>
        <div class="rv">${meta}</div>
      </div>
      <div class="rq-body">`;

    qs.forEach((q, qi) => {
      const key = `${rule.id}_${qi}`;
      const cur = state.answers[key] || "";
      h += `<div class="qitem">
        <div class="q-text">${q.title}</div>
        <div class="q-help">${q.help || ""}</div>
        <div class="ans-row" data-key="${key}">
          ${["yes", "partial", "no", "na"].map(a =>
            `<button class="ans-btn${cur === a ? " s-" + a : ""}" data-val="${a}">${a === "na" ? "N/A" : a[0].toUpperCase() + a.slice(1)}</button>`
          ).join("")}
        </div>
      </div>`;
    });

    if (!qs.length) {
      h += `<div style="font-size:11px;color:var(--text3);font-style:italic">No questions defined for this rule.</div>`;
    }
    h += `</div></div>`;
  });

  el.innerHTML = h;

  // Bind answer buttons
  el.querySelectorAll(".ans-row").forEach(row => {
    row.querySelectorAll(".ans-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const key = row.dataset.key;
        const val = btn.dataset.val;
        state.answers[key] = val;
        persist();
        row.querySelectorAll(".ans-btn").forEach(b => b.className = "ans-btn");
        btn.classList.add("s-" + val);
      });
    });
  });
}

/* ═══════════════════════════════════════
   REVIEW (STEP 5)
   ═══════════════════════════════════════ */
function renderReview() {
  const { rules, overlays } = getMatched();
  const evid = state.evidenceIds.length;
  const items = [
    { l: "Organisation",    v: state.orgName       || "Not provided" },
    { l: "Assessment",      v: state.assessmentName || "Not named" },
    { l: "Sector",          v: state.sector         || "General" },
    { l: "Entity size",     v: state.entitySize },
    { l: "Jurisdictions",   v: state.selectedCountries.join(", ") || "None selected" },
    { l: "Rules matched",   v: `${rules.length} jurisdiction · ${overlays.length} sector` },
    { l: "Answers recorded",v: `${Object.keys(state.answers).length} responses` },
    { l: "Evidence items",  v: `${evid} of 9 checked` },
    { l: "Cloud / hosting", v: state.cloudProvider || "Not specified" },
    { l: "Data origins",    v: state.dataOrigins.join(", ") || "Not specified" },
  ];
  const el = document.getElementById("revGrid");
  if (el) {
    el.innerHTML = items.map(i =>
      `<div class="rev-card"><div class="rev-lbl">${i.l}</div><div class="rev-val">${i.v}</div></div>`
    ).join("");
  }
}

/* ═══════════════════════════════════════
   SCORING
   ═══════════════════════════════════════ */
function scoreRule(ruleId, qCount) {
  let yes = 0, partial = 0, na = 0;
  for (let i = 0; i < qCount; i++) {
    const a = state.answers[`${ruleId}_${i}`] || "";
    if (a === "yes") yes++;
    else if (a === "partial") partial++;
    else if (a === "na") na++;
  }
  const answered = qCount - na;
  return answered > 0 ? (yes + partial * 0.5) / answered : null;
}

function col(s)  { return s >= 0.65 ? "green" : s >= 0.35 ? "amber" : "red"; }
function ragLbl(s) { return s >= 0.65 ? "Adequate" : s >= 0.35 ? "Partial" : "Material Gap"; }

/* ═══════════════════════════════════════
   GENERATE REPORT
   ═══════════════════════════════════════ */
function generateReport() {
  const now     = new Date();
  const org     = state.orgName     || "Your Organisation";
  const sector  = state.sector      || "general";
  const size    = state.entitySize;
  const cloud   = state.cloudProvider;
  const evids   = state.evidenceIds.length;

  const dateStr = now.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const timeStr = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZoneName: "short" });

  setText("rptTitle", `${org} — Digital Sovereignty Assessment`);
  setText("rptOrg",   org);
  setText("rptDate",  dateStr);
  setText("rptTs",    `Generated ${dateStr} at ${timeStr}`);

  const { rules, overlays } = getMatched();
  const all = [...rules, ...overlays];

  const scored = all.map(rule => ({
    rule,
    s: scoreRule(rule.id, (rule.questions || []).length),
  }));

  // Weighted overall
  const assessed = scored.filter(x => x.s !== null);
  let overallRaw = 0.5;
  if (assessed.length) {
    const tot = assessed.reduce((acc, { rule, s }) => {
      const w = (rule.impactWeight || 3) * (rule.likelihoodWeight || 3);
      acc.sum += s * w; acc.w += w; return acc;
    }, { sum: 0, w: 0 });
    overallRaw = tot.w > 0 ? tot.sum / tot.w : 0.5;
  }
  const overall = (overallRaw * 10).toFixed(1);
  const oc = col(overallRaw);

  // Domain scores
  const domainScore = layers => {
    const xs = scored.filter(x => layers.includes(x.rule.layer) && x.s !== null);
    return xs.length ? xs.reduce((s, x) => s + x.s, 0) / xs.length : null;
  };
  const pS   = domainScore(["privacy"]);
  const cS   = domainScore(["cyber"]);
  const xS   = domainScore(["transfer", "sectoral", "marketing"]);
  const evS  = evids / 9;

  // Score cards
  const scoreCardsEl = document.getElementById("scoreCards");
  if (scoreCardsEl) {
    scoreCardsEl.innerHTML = [
      { l: "Overall Maturity",    v: overall,                              sub: "/ 10.0", c: oc },
      { l: "Privacy Controls",    v: pS !== null ? (pS*10).toFixed(1) : "—", sub: "/ 10.0", c: pS !== null ? col(pS) : "amber" },
      { l: "Cyber / Incident",    v: cS !== null ? (cS*10).toFixed(1) : "—", sub: "/ 10.0", c: cS !== null ? col(cS) : "amber" },
      { l: "Transfer Safeguards", v: xS !== null ? (xS*10).toFixed(1) : "—", sub: "/ 10.0", c: xS !== null ? col(xS) : "amber" },
      { l: "Evidence Readiness",  v: (evS*10).toFixed(1),                  sub: "/ 10.0", c: col(evS) },
    ].map(c => `<div class="sc">
      <div class="sc-lbl">${c.l}</div>
      <div class="sc-val ${c.c}">${c.v}</div>
      <div class="sc-sub">${c.sub}</div>
    </div>`).join("");
  }

  // Narrative
  const hasUS = cloud.includes("us") || cloud === "mixed";
  const hasEU = state.selectedCountries.includes("EU");
  const hasIN = state.selectedCountries.includes("IN");
  const hasSA = state.selectedCountries.includes("SA");
  let narr = `<strong style="color:#fff">${org}</strong> is a ${size.toLowerCase()} entity in the <strong style="color:#fff">${sector}</strong> sector`;
  if (state.selectedCountries.length) {
    narr += `, operating across <strong style="color:#fff">${state.selectedCountries.length} jurisdiction${state.selectedCountries.length > 1 ? "s" : ""}</strong> (${state.selectedCountries.join(", ")})`;
  }
  narr += `. <strong style="color:#fff">${rules.length} jurisdiction rules</strong> and <strong style="color:#fff">${overlays.length} sector overlays</strong> were matched.`;
  narr += ` The overall Digital Sovereignty Maturity Score is <strong style="color:var(--${oc})">${overall} / 10.0</strong>. `;
  if (overallRaw >= 0.65) {
    narr += "This represents a reasonable baseline. Targeted gaps should be closed before the next regulatory cycle.";
  } else if (overallRaw >= 0.35) {
    narr += "<strong style=\"color:var(--amber)\">Partial coverage with material gaps carrying active enforcement risk.</strong> Immediate action is recommended on the items flagged below.";
  } else {
    narr += "<strong style=\"color:var(--red)\">Significant legal exposure across multiple dimensions.</strong> This organisation would struggle to demonstrate adequacy to a regulator or acquirer without urgent remediation.";
  }
  if (hasEU && hasUS) narr += " The combination of EU data subjects and US-based infrastructure creates a <strong style=\"color:#fff\">Schrems II transfer risk</strong> — SCCs alone are insufficient without a Transfer Impact Assessment.";
  if (hasIN) narr += " India operations trigger both <strong style=\"color:#fff\">DPDP Act</strong> and <strong style=\"color:#fff\">CERT-In</strong> obligations — monitoring MeitY rule notifications is essential.";
  if (hasSA) narr += " Saudi Arabia operations require SDAIA-specific data governance and cross-border transfer review.";

  const narrEl = document.getElementById("rptNarr");
  if (narrEl) narrEl.innerHTML = narr;

  // Topline cards
  const toplineEl = document.getElementById("rptTopline");
  if (toplineEl) {
    toplineEl.innerHTML = [
      { l: "Sector",        v: sector },
      { l: "Entity Size",   v: size },
      { l: "Jurisdictions", v: state.selectedCountries.join(" · ") || "None" },
      { l: "Rules Matched", v: `${rules.length} jurisdiction · ${overlays.length} sector` },
      { l: "Cloud / Hosting", v: cloud || "Not specified" },
      { l: "Data Origins",  v: state.dataOrigins.join(" · ") || "Not specified" },
    ].map(i => `<div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--r);padding:11px 13px">
      <div style="font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:var(--text3);font-weight:700;margin-bottom:3px">${i.l}</div>
      <div style="font-size:12px;color:var(--text);font-weight:600">${i.v}</div>
    </div>`).join("");
  }

  // Rule cards
  let rh = "";
  scored.forEach(({ rule, s }) => {
    const isMay = !rule._m.applies && rule._m.mayApply;
    const qs    = rule.questions || [];
    const rc    = s !== null ? col(s) : "amber";
    const rl    = s !== null ? ragLbl(s) : "Not assessed";
    const srcs  = rule.officialSources   || [];
    const evid  = rule.evidenceChecklist || [];
    const arts  = rule.artifactsRequired || [];
    const rems  = rule.remediations      || [];
    const cid   = "rc_" + rule.id;
    const loc   = rule._countryLabel || rule._sectorLabel || "";
    const meta  = [
      rule.version       ? `v${rule.version}` : "",
      rule.lastReviewed  ? `Reviewed ${rule.lastReviewed}` : "",
      rule.nextReviewDue ? `Next ${rule.nextReviewDue}` : "",
      rule.reviewOwner   ? rule.reviewOwner : "",
    ].filter(Boolean).join(" · ");

    rh += `<div class="rrc">
      <div class="rrc-head">
        <div>
          <div class="rrc-title">${rule.title}${loc ? " — " + loc : ""}</div>
          <div style="margin-top:5px;display:flex;gap:5px;flex-wrap:wrap">
            ${layerBadge(rule.layer, rule.layerLabel || rule.layer)}
            ${statusBadge(rule.maintenanceStatus)}
            ${isMay ? `<span class="rbadge rb-provisional">May Apply</span>` : ""}
            <span class="rag ${rc}">${rl}</span>
          </div>
          <div class="rrc-meta">
            ${meta ? `<span>${meta}</span>` : ""}
            ${srcs.map(src => `<a href="${src.url}" target="_blank" rel="noopener">↗ ${src.label}</a>`).join("")}
          </div>
        </div>
        <div style="text-align:right">
          ${s !== null
            ? `<div style="font-size:26px;font-weight:900;color:var(--${rc})">${(s * 10).toFixed(1)}</div><div style="font-size:10px;color:var(--text3)">/ 10.0</div>`
            : `<div style="font-size:11px;color:var(--text3)">Not assessed</div>`}
        </div>
      </div>
      <div class="tabs" id="${cid}_tabs">
        <button class="tab active" data-tab="qa"   data-cid="${cid}">Answers</button>
        <button class="tab"        data-tab="evid"  data-cid="${cid}">Evidence (${evid.length + arts.length})</button>
        <button class="tab"        data-tab="rem"   data-cid="${cid}">Remediation (${rems.length})</button>
        <button class="tab"        data-tab="src"   data-cid="${cid}">Sources (${srcs.length})</button>
      </div>`;

    // QA tab
    rh += `<div class="tab-pane active" id="${cid}_qa" data-pane="answers">`;
    qs.forEach((q, qi) => {
      const key = `${rule.id}_${qi}`;
      const ans = state.answers[key] || "";
      const ac  = ans === "yes" ? "green" : ans === "partial" ? "amber" : ans === "no" ? "red" : null;
      rh += `<div class="qa-item"><div class="qa-text">${q.title}</div>${ac ? `<span class="rag ${ac}">${ans}</span>` : `<span style="font-size:10px;color:var(--text3)">—</span>`}</div>`;
    });
    if (!qs.length) rh += `<p style="font-size:11px;color:var(--text3)">No questions defined.</p>`;
    rh += `</div>`;

    // Evidence tab
    rh += `<div class="tab-pane" id="${cid}_evid" data-pane="evidence"><div class="evid-list">`;
    evid.forEach(e => rh += `<div class="evid-item"><div class="evid-dot" style="background:var(--rp);color:var(--red)">✗</div>${e}</div>`);
    arts.forEach(a => rh += `<div class="evid-item" style="border-left:2px solid var(--purple)"><div class="evid-dot ed-art">📄</div>Artifact required: ${a}</div>`);
    if (!evid.length && !arts.length) rh += `<p style="font-size:11px;color:var(--text3)">No evidence checklist defined.</p>`;
    rh += `</div></div>`;

    // Remediation tab
    rh += `<div class="tab-pane" id="${cid}_rem" data-pane="remediation"><div class="rem-list">`;
    rems.forEach(r => {
      const pc = r.priority === "immediate" ? "rp-imm" : r.priority === "planned" ? "rp-pln" : "rp-mnt";
      rh += `<div class="rem-item">
        <div class="rem-p ${pc}">${r.priority}</div>
        <div class="rem-act">${r.action}<br><span style="font-size:9px;color:var(--text3)">⏱ ${r.timeline}</span></div>
        <div class="rem-own">${r.owner}</div>
      </div>`;
    });
    if (!rems.length) rh += `<p style="font-size:11px;color:var(--text3)">No remediations defined.</p>`;
    rh += `</div></div>`;

    // Sources tab
    rh += `<div class="tab-pane" id="${cid}_src" data-pane="sources"><div class="src-list">`;
    srcs.forEach(src => {
      rh += `<div class="src-item"><a href="${src.url}" target="_blank" rel="noopener">↗ ${src.label}</a>`;
      if (rule.officialSourceType) rh += `<span class="src-meta">${rule.officialSourceType}</span>`;
      rh += `</div>`;
    });
    if (!srcs.length) rh += `<p style="font-size:11px;color:var(--text3)">No official sources listed.</p>`;
    rh += `</div></div></div>`;
  });

  const ruleCardsEl = document.getElementById("rptRuleCards");
  if (ruleCardsEl) {
    ruleCardsEl.innerHTML = rh || `<div class="empty"><div class="empty-icon">🌐</div>No rules matched this profile.</div>`;
    // Bind tabs (delegated after innerHTML)
    ruleCardsEl.querySelectorAll(".tab[data-tab]").forEach(tab => {
      tab.addEventListener("click", () => switchTab(tab.dataset.cid, tab.dataset.tab));
    });
  }

  // Action register
  const ORDER = { immediate: 0, planned: 1, maintain: 2 };
  const ACL   = { immediate: "an-h", planned: "an-m", maintain: "an-l" };
  const allRems = [];
  scored.forEach(({ rule }) => {
    (rule.remediations || []).forEach(r => allRems.push({ ...r, _rule: rule.title, _loc: rule._countryLabel || rule._sectorLabel || "" }));
  });
  allRems.sort((a, b) => (ORDER[a.priority] ?? 1) - (ORDER[b.priority] ?? 1));
  const actEl = document.getElementById("rptActions");
  if (actEl) {
    actEl.innerHTML = allRems.length
      ? allRems.map((r, i) => `<div class="act-item">
          <div class="act-num ${ACL[r.priority] || "an-m"}">${i + 1}</div>
          <div><div class="act-title">${r.action}</div><div class="act-desc">${r._rule}${r._loc ? " · " + r._loc : ""}</div></div>
          <div class="act-meta">⏱ ${r.timeline}<br><span style="color:var(--text3)">${r.owner}</span></div>
        </div>`).join("")
      : `<div class="empty">No actions generated. Select countries and answer rule questions first.</div>`;
  }

  // Show report
  const reportEl = document.getElementById("report");
  if (reportEl) {
    reportEl.classList.add("visible");
    setTimeout(() => reportEl.scrollIntoView({ behavior: "smooth" }), 100);
  }
}

/* ═══════════════════════════════════════
   TABS
   ═══════════════════════════════════════ */
function switchTab(cid, tab) {
  const TABS = ["qa", "evid", "rem", "src"];
  TABS.forEach(p => {
    const pane = document.getElementById(`${cid}_${p}`);
    if (pane) pane.classList.toggle("active", p === tab);
  });
  const tabBar = document.getElementById(`${cid}_tabs`);
  if (tabBar) {
    tabBar.querySelectorAll(".tab").forEach(t => {
      t.classList.toggle("active", t.dataset.tab === tab);
    });
  }
}

/* ═══════════════════════════════════════
   EXPORTS
   ═══════════════════════════════════════ */
function buildExportPayload() {
  const { rules, overlays } = getMatched();
  return {
    generated:    new Date().toISOString(),
    tool:         "Nishanth Konsultancy — Digital Sovereignty Assessment",
    organisation: state.orgName,
    assessmentName: state.assessmentName,
    sector:       state.sector,
    entitySize:   state.entitySize,
    selectedCountries: state.selectedCountries,
    dataCategories:    state.dataCategories,
    dataOrigins:       state.dataOrigins,
    storageLocations:  state.storageLocations,
    processorLocations:state.processorLocations,
    cloudProvider:     state.cloudProvider,
    matchedRules:      rules.map(r => ({ id: r.id, title: r.title, version: r.version, lastReviewed: r.lastReviewed })),
    matchedOverlays:   overlays.map(o => ({ id: o.id, title: o.title })),
    answers:           state.answers,
    evidenceReady:     state.evidenceIds,
    consultantNotes:   state.consultantNotes,
    transferNotes:     state.transferNotes,
    assumptions:       state.assumptions,
    unknowns:          state.unknowns,
  };
}

function exportJSON() {
  dl(JSON.stringify(buildExportPayload(), null, 2), "application/json", `sovereignty-${today()}.json`);
}

function exportCSV() {
  const { rules, overlays } = getMatched();
  const rows = [["Rule ID", "Title", "Country/Sector", "Layer", "Version", "Last Reviewed", "Question", "Answer"]];
  [...rules, ...overlays].forEach(rule => {
    (rule.questions || []).forEach((q, i) => {
      const ans = state.answers[`${rule.id}_${i}`] || "";
      rows.push([rule.id, rule.title, rule._countryLabel || rule._sectorLabel || "", rule.layer, rule.version || "", rule.lastReviewed || "", q.title, ans]);
    });
  });
  dl(rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n"), "text/csv", `sovereignty-${today()}.csv`);
}

function dl(content, type, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name; a.click();
  URL.revokeObjectURL(a.href);
}

function today() { return new Date().toISOString().slice(0, 10); }

async function copyLink() {
  try {
    await navigator.clipboard.writeText(window.location.href);
    alert("Link copied to clipboard.");
  } catch {
    alert("Could not copy automatically — please copy the URL manually.");
  }
}

/* ═══════════════════════════════════════
   RESET
   ═══════════════════════════════════════ */
function resetAssessment() {
  state = defaultState();
  persist();
  const reportEl = document.getElementById("report");
  if (reportEl) reportEl.classList.remove("visible");
  document.querySelectorAll(".pill.sel").forEach(p => p.classList.remove("sel"));
  document.querySelectorAll("input[type=checkbox]").forEach(c => c.checked = false);
  document.querySelectorAll("input[type=text], textarea").forEach(i => i.value = "");
  const cloud = document.getElementById("cloudProvider");
  if (cloud) cloud.value = "";
  checkCloudRisk();
  renderAllPills();
  goStep(1);
}

/* ═══════════════════════════════════════
   HELPER
   ═══════════════════════════════════════ */
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

/* ═══════════════════════════════════════
   INIT
   ═══════════════════════════════════════ */
async function init() {
  // Show loading state in badge
  const badge = document.getElementById("rulesBadge");
  if (badge) { badge.className = "rules-badge rb-loading"; badge.textContent = "⟳ Loading rules…"; }

  try {
    await loadCatalog();
    updateRulesBadge();
  } catch (err) {
    console.error("Rule load error:", err);
    if (badge) { badge.className = "rules-badge rb-err"; badge.textContent = "✗ Rules failed to load"; }
    const meta = document.getElementById("sbRulesMeta");
    if (meta) meta.textContent = "Check that the /rules/ directory is accessible.";
  }

  // Render dynamic pills (data cats may come from catalog)
  renderAllPills();

  // Restore form state from localStorage
  syncFormToState();

  // Bind all form events
  bindFormEvents();

  // Navigation buttons
  document.getElementById("heroStartBtn")?.addEventListener("click", () => {
    document.getElementById("assessment")?.scrollIntoView({ behavior: "smooth" });
  });
  document.getElementById("step1NextBtn")?.addEventListener("click", () => goStep(2));
  document.getElementById("step2BackBtn")?.addEventListener("click", () => goStep(1));
  document.getElementById("step2NextBtn")?.addEventListener("click", goToRules);
  document.getElementById("step3BackBtn")?.addEventListener("click", () => goStep(2));
  document.getElementById("step3NextBtn")?.addEventListener("click", () => goStep(4));
  document.getElementById("step4BackBtn")?.addEventListener("click", () => goStep(3));
  document.getElementById("step4NextBtn")?.addEventListener("click", goToReview);
  document.getElementById("step5BackBtn")?.addEventListener("click", () => goStep(4));
  document.getElementById("generateBtn")?.addEventListener("click", generateReport);

  // Report buttons
  document.getElementById("expPdfBtn")?.addEventListener("click",  () => window.print());
  document.getElementById("expJsonBtn")?.addEventListener("click", exportJSON);
  document.getElementById("expCsvBtn")?.addEventListener("click",  exportCSV);
  document.getElementById("expLinkBtn")?.addEventListener("click", copyLink);
  document.getElementById("retakeBtn")?.addEventListener("click",  resetAssessment);
  document.getElementById("ctaContactBtn")?.addEventListener("click", () => {
    alert("Contact: hello@nishanthkonsultancy.com");
  });

  // Restore current step from persisted state
  renderSidebar();
  // If we're past step 1, activate the correct step panel
  if (state.currentStep > 1) {
    document.querySelectorAll(".sp").forEach(p => p.classList.remove("active"));
    const target = document.getElementById("step" + state.currentStep);
    if (target) target.classList.add("active");
    if (state.currentStep === 3) renderRuleQs();
    if (state.currentStep === 5) renderReview();
  }
}

init();
