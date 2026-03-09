const STORAGE_KEY = "nk-jurisdiction-assessment-v13";
const RULES_BASE = "./rules/";

const SCALE = [
  { score: 0, label: "0 - Not in place", text: "Absent or unknown." },
  { score: 1, label: "1 — Ad hoc", text: "Informal and inconsistent." },
  { score: 2, label: "2 — Emerging", text: "Basic but incomplete." },
  { score: 3, label: "3 — Managed", text: "Documented and repeatable." },
  { score: 4, label: "4 — Strong", text: "Operational, evidenced, and maintained." }
];

const DEFAULT_DATA_CATEGORIES = [
  { id: "personal", label: "Personal data" },
  { id: "sensitive", label: "Sensitive / special category data" },
  { id: "children", label: "Children's data" },
  { id: "employee", label: "Employee / HR data" },
  { id: "financial", label: "Financial data" },
  { id: "health", label: "Health data" },
  { id: "biometric", label: "Biometric data" },
  { id: "tracking", label: "Tracking / behavioral data" }
];

const state = {
  catalog: null,
  stage: "loading",
  coreIndex: 0,
  overlayIndex: 0,
  answers: loadState().answers || {},
  overlayAnswers: loadState().overlayAnswers || {},
  profile: loadState().profile || defaultProfile()
};

const $ = (id) => document.getElementById(id);
const els = {
  loadingState: $("loadingState"),
  loadingMessage: $("loadingMessage"),
  progressFill: $("progressFill"),
  progressText: $("progressText"),
  stepList: $("stepList"),
  introState: $("introState"),
  setupState: $("setupState"),
  residencyState: $("residencyState"),
  questionsState: $("questionsState"),
  overlayState: $("overlayState"),
  reportState: $("reportState"),
  questionMount: $("questionMount"),
  overlayMount: $("overlayMount"),
  countrySelector: $("countrySelector"),
  dataCategorySelector: $("dataCategorySelector"),
  originSelector: $("originSelector"),
  storageSelector: $("storageSelector"),
  processorSelector: $("processorSelector"),
  clientNameInput: $("clientNameInput"),
  assessmentNameInput: $("assessmentNameInput"),
  consultantNotesInput: $("consultantNotesInput"),
  knownUnknownsInput: $("knownUnknownsInput"),
  assumptionsInput: $("assumptionsInput"),
  transferNotesInput: $("transferNotesInput"),
  sectorInput: $("sectorInput"),
  sizeInput: $("sizeInput"),
  processesPersonalDataInput: $("processesPersonalDataInput"),
  crossBorderTransfersInput: $("crossBorderTransfersInput"),
  offersToEUInput: $("offersToEUInput"),
  offersToUKInput: $("offersToUKInput"),
  regulatedFinancialEntityInput: $("regulatedFinancialEntityInput"),
  essentialEntityInput: $("essentialEntityInput"),
  usesAIInput: $("usesAIInput"),
  overallScore: $("overallScore"),
  profileSummary: $("profileSummary"),
  profileChip: $("profileChip"),
  scoreRing: $("scoreRing"),
  reportNarrative: $("reportNarrative"),
  reportNextStep: $("reportNextStep"),
  reportTitle: $("reportTitle"),
  riskSummary: $("riskSummary"),
  breakdownTable: $("breakdownTable"),
  jurisdictionCards: $("jurisdictionCards"),
  lawsTable: $("lawsTable"),
  actionsTable: $("actionsTable"),
  recommendationsGrid: $("recommendationsGrid"),
  shareStatus: $("shareStatus"),
  originSummary: $("originSummary"),
  storageSummary: $("storageSummary"),
  processorSummary: $("processorSummary"),
  transferNotesSummary: $("transferNotesSummary"),
  assumptionsSummary: $("assumptionsSummary"),
  unknownsSummary: $("unknownsSummary")
};

function defaultProfile() {
  return {
    clientName: "",
    assessmentName: "",
    consultantNotes: "",
    selectedCountries: [],
    sector: "general",
    size: "small",
    processesPersonalData: false,
    crossBorderTransfers: false,
    offersToEU: false,
    offersToUK: false,
    regulatedFinancialEntity: false,
    essentialEntity: false,
    usesAI: false,
    dataCategories: [],
    dataOrigin: [],
    storageLocations: [],
    processorLocations: [],
    transferNotes: "",
    assumptions: "",
    knownUnknowns: ""
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    answers: state.answers,
    overlayAnswers: state.overlayAnswers,
    profile: state.profile
  }));
}
function byIdMap(list) {
  const out = {};
  list.forEach(item => { out[item.id] = item; });
  return out;
}
function countriesMap() { return byIdMap(state.catalog.countries || []); }
function sectorsMap() { return byIdMap(state.catalog.sectors || []); }
function coreSections() { return state.catalog.coreSections || []; }
function lawsMap() { return byIdMap(state.catalog.laws || []); }
function sectorOverlaysMap() { return byIdMap(state.catalog.sectorOverlays || []); }

async function fetchJson(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json();
}

async function loadCatalog() {
  setStage("loading");
  const manifest = await fetchJson(`${RULES_BASE}manifest.json`);
  const core = await fetchJson(`${RULES_BASE}${manifest.core}`);
  const countryFiles = await Promise.all((manifest.countries || []).map(file => fetchJson(`${RULES_BASE}${file}`)));
  const sectorFiles = await Promise.all((manifest.sectors || []).map(file => fetchJson(`${RULES_BASE}${file}`)));

  const countries = [];
  const laws = [];
  countryFiles.forEach(file => {
    if (file.country) countries.push(file.country);
    if (Array.isArray(file.rules)) laws.push(...file.rules);
  });

  const sectors = [];
  const sectorOverlays = [];
  sectorFiles.forEach(file => {
    if (file.sector) sectors.push(file.sector);
    if (Array.isArray(file.overlays)) sectorOverlays.push(...file.overlays);
  });

  state.catalog = {
    countries,
    sectors,
    coreSections: core.coreSections || [],
    laws,
    sectorOverlays,
    remediationLibrary: core.remediationLibrary || [],
    dataCategories: core.dataCategories || DEFAULT_DATA_CATEGORIES
  };
}

function evaluatePredicate(predicate, profile) {
  switch (predicate.type) {
    case "boolean": return Boolean(profile[predicate.field]) === Boolean(predicate.equals);
    case "includes": return Array.isArray(profile[predicate.field]) && profile[predicate.field].includes(predicate.value);
    case "equals": return profile[predicate.field] === predicate.value;
    case "notEmpty": return Boolean(profile[predicate.field] && String(profile[predicate.field]).trim());
    default: return false;
  }
}
function evaluateRule(applicability, profile) {
  const applies = (applicability?.appliesIf || []).length
    ? (applicability.appliesIf || []).every(rule => evaluatePredicate(rule, profile))
    : false;
  const maybe = !applies && (applicability?.mayApplyIf || []).some(rule => evaluatePredicate(rule, profile));
  if (applies) return { status: "Likely applies", reason: applicability.reasonLikely || "Profile strongly indicates applicability." };
  if (maybe) return { status: "May apply", reason: applicability.reasonMaybe || "Profile suggests applicability that needs validation." };
  return { status: "Unlikely based on answers", reason: "Current answers do not strongly indicate applicability." };
}

function selectedLawIds() {
  const selected = new Set();
  state.profile.selectedCountries.forEach(countryId => {
    const country = countriesMap()[countryId];
    (country?.rules || []).forEach(ruleId => {
      const rule = lawsMap()[ruleId];
      if (!rule) return;
      const result = evaluateRule(rule.applicability, state.profile);
      if (result.status !== "Unlikely based on answers") selected.add(ruleId);
    });
  });
  return Array.from(selected);
}
function selectedSectorOverlayIds() {
  const selected = new Set();
  const sector = sectorsMap()[state.profile.sector];
  (sector?.overlays || []).forEach(id => {
    const overlay = sectorOverlaysMap()[id];
    if (!overlay) return;
    const result = evaluateRule(overlay.applicability, state.profile);
    if (result.status !== "Unlikely based on answers") selected.add(id);
  });
  return Array.from(selected);
}
function selectedOverlays() {
  const lawOverlays = selectedLawIds().map(id => ({
    kind: "law",
    id,
    item: lawsMap()[id],
    applicability: evaluateRule(lawsMap()[id].applicability, state.profile)
  }));
  const sectorOverlays = selectedSectorOverlayIds().map(id => ({
    kind: "sector",
    id,
    item: sectorOverlaysMap()[id],
    applicability: evaluateRule(sectorOverlaysMap()[id].applicability, state.profile)
  }));
  return [...lawOverlays, ...sectorOverlays];
}

function totalSteps() {
  return 3 + coreSections().length + selectedOverlays().length + 1;
}
function currentStepNumber() {
  if (state.stage === "loading" || state.stage === "intro") return 1;
  if (state.stage === "setup") return 2;
  if (state.stage === "residency") return 3;
  if (state.stage === "core") return 4 + state.coreIndex;
  if (state.stage === "overlay") return 4 + coreSections().length + state.overlayIndex;
  return totalSteps();
}
function renderProgress() {
  const denom = Math.max(1, totalSteps() - 1);
  const pct = Math.round(((currentStepNumber() - 1) / denom) * 100);
  els.progressFill.style.width = `${pct}%`;
  els.progressText.textContent = `${pct}%`;
}
function renderStepList() {
  if (!state.catalog) return;
  const items = ["Intro", "Profile", "Data flow", ...coreSections().map(s => s.title), ...selectedOverlays().map(o => o.item.title), "Report"];
  els.stepList.innerHTML = "";
  items.forEach((label, idx) => {
    const stepNo = idx + 1;
    const active = stepNo === currentStepNumber() ? "active" : "";
    const done = stepNo < currentStepNumber() ? "done" : "";
    const pill = document.createElement("div");
    pill.className = `dimension-pill ${active} ${done}`.trim();
    pill.innerHTML = `<span>${stepNo}. ${label}</span><strong>${stepNo === currentStepNumber() ? "Current" : stepNo < currentStepNumber() ? "Done" : ""}</strong>`;
    els.stepList.appendChild(pill);
  });
}
function setStage(stageName) {
  state.stage = stageName;
  [els.loadingState, els.introState, els.setupState, els.residencyState, els.questionsState, els.overlayState, els.reportState]
    .forEach(el => el.classList.remove("active"));
  const map = {
    loading: els.loadingState,
    intro: els.introState,
    setup: els.setupState,
    residency: els.residencyState,
    core: els.questionsState,
    overlay: els.overlayState,
    report: els.reportState
  };
  map[stageName]?.classList.add("active");
  renderProgress();
  renderStepList();
}

function renderCheckboxGroup(container, options, selectedValues, onChange) {
  container.innerHTML = "";
  options.forEach(option => {
    const label = document.createElement("label");
    label.className = "checkline";
    label.innerHTML = `<input type="checkbox" value="${option.id}" ${selectedValues.includes(option.id) ? "checked" : ""}><span>${option.label}</span>`;
    label.querySelector("input").addEventListener("change", e => onChange(option.id, e.target.checked));
    container.appendChild(label);
  });
}
function updateArrayField(field, value, checked) {
  if (checked) {
    if (!state.profile[field].includes(value)) state.profile[field].push(value);
  } else {
    state.profile[field] = state.profile[field].filter(v => v !== value);
  }
  saveState();
  renderProgress();
  renderStepList();
}

function renderSelectors() {
  const countries = state.catalog.countries || [];
  renderCheckboxGroup(els.countrySelector, countries, state.profile.selectedCountries, (id, checked) => updateArrayField("selectedCountries", id, checked));
  renderCheckboxGroup(els.originSelector, countries, state.profile.dataOrigin, (id, checked) => updateArrayField("dataOrigin", id, checked));
  renderCheckboxGroup(els.storageSelector, countries, state.profile.storageLocations, (id, checked) => updateArrayField("storageLocations", id, checked));
  renderCheckboxGroup(els.processorSelector, countries, state.profile.processorLocations, (id, checked) => updateArrayField("processorLocations", id, checked));
  renderCheckboxGroup(els.dataCategorySelector, state.catalog.dataCategories, state.profile.dataCategories, (id, checked) => updateArrayField("dataCategories", id, checked));

  els.sectorInput.innerHTML = "";
  (state.catalog.sectors || []).forEach(sector => {
    const opt = document.createElement("option");
    opt.value = sector.id;
    opt.textContent = sector.label;
    els.sectorInput.appendChild(opt);
  });
}
function syncProfileInputs() {
  els.clientNameInput.value = state.profile.clientName;
  els.assessmentNameInput.value = state.profile.assessmentName;
  els.consultantNotesInput.value = state.profile.consultantNotes;
  els.sectorInput.value = state.profile.sector;
  els.sizeInput.value = state.profile.size;
  els.processesPersonalDataInput.checked = state.profile.processesPersonalData;
  els.crossBorderTransfersInput.checked = state.profile.crossBorderTransfers;
  els.offersToEUInput.checked = state.profile.offersToEU;
  els.offersToUKInput.checked = state.profile.offersToUK;
  els.regulatedFinancialEntityInput.checked = state.profile.regulatedFinancialEntity;
  els.essentialEntityInput.checked = state.profile.essentialEntity;
  els.usesAIInput.checked = state.profile.usesAI;
  els.transferNotesInput.value = state.profile.transferNotes;
  els.assumptionsInput.value = state.profile.assumptions;
  els.knownUnknownsInput.value = state.profile.knownUnknowns;
}
function bindProfileInputs() {
  const binds = [
    ["clientNameInput", "clientName"],
    ["assessmentNameInput", "assessmentName"],
    ["consultantNotesInput", "consultantNotes"],
    ["transferNotesInput", "transferNotes"],
    ["assumptionsInput", "assumptions"],
    ["knownUnknownsInput", "knownUnknowns"]
  ];
  binds.forEach(([elId, field]) => {
    els[elId].addEventListener("input", e => { state.profile[field] = e.target.value; saveState(); });
  });
  els.sectorInput.addEventListener("change", e => { state.profile.sector = e.target.value; saveState(); renderStepList(); renderProgress(); });
  els.sizeInput.addEventListener("change", e => { state.profile.size = e.target.value; saveState(); });
  ["processesPersonalData","crossBorderTransfers","offersToEU","offersToUK","regulatedFinancialEntity","essentialEntity","usesAI"].forEach(field => {
    const el = els[`${field}Input`];
    el.addEventListener("change", e => { state.profile[field] = e.target.checked; saveState(); renderStepList(); renderProgress(); });
  });
}

function renderQuestionBlock(title, help, key, currentValue, source) {
  return `
    <article class="question-card">
      <div class="question-index">${source}</div>
      <h3 class="question-title">${title}</h3>
      <p class="question-help">${help || ""}</p>
      <div class="options">
        ${SCALE.map(option => `
          <label class="option">
            <input type="radio" name="${key}" value="${option.score}" ${currentValue === option.score ? "checked" : ""}>
            <div><strong>${option.label}</strong><span>${option.text}</span></div>
          </label>
        `).join("")}
      </div>
    </article>`;
}
function wireScoreInputs(root, keyPrefix, target) {
  root.querySelectorAll(`input[name="${keyPrefix}"]`).forEach(input => {
    input.addEventListener("change", e => {
      target[keyPrefix] = Number(e.target.value);
      saveState();
    });
  });
}

function renderCoreQuestions() {
  const section = coreSections()[state.coreIndex];
  els.questionMount.innerHTML = `<p class="section-label">Step ${currentStepNumber()}</p><h2 class="section-heading">${section.title}</h2><p class="section-copy">${section.description || "Answer using the maturity scale."}</p>`;
  section.questions.forEach((q, idx) => {
    const key = `${section.id}:${idx}`;
    const wrap = document.createElement("div");
    wrap.innerHTML = renderQuestionBlock(q.title, q.help, key, state.answers[key], `Core question ${idx + 1}`);
    els.questionMount.appendChild(wrap.firstElementChild);
    wireScoreInputs(els.questionMount, key, state.answers);
  });
}

function renderEvidenceBlock(item) {
  const list = item.evidenceChecklist || [];
  const artifacts = item.artifactsRequired || [];
  return `
    <div class="catalog-hint">
      <strong style="color: var(--text);">Evidence checklist:</strong>
      <ul>${list.map(x => `<li>${x}</li>`).join("") || "<li>None listed.</li>"}</ul>
      <strong style="color: var(--text);">Artifacts required:</strong>
      <ul>${artifacts.map(x => `<li>${x}</li>`).join("") || "<li>None listed.</li>"}</ul>
    </div>`;
}
function formatChangeLog(item) {
  if (!Array.isArray(item.changeLog) || !item.changeLog.length) return "—";
  return item.changeLog.map(entry => `${entry.date}: ${entry.note}`).join("<br/>");
}
function renderSourcesBlock(item) {
  const src = (item.officialSources || []).map(s => `<li><a href="${s.url}" target="_blank" rel="noopener noreferrer">${s.label}</a></li>`).join("") || "<li>None listed.</li>";
  return `
    <div class="catalog-hint">
      <strong style="color: var(--text);">Official sources:</strong>
      <ul>${src}</ul>
      <p>
        <strong style="color: var(--text);">Jurisdiction:</strong> ${item.sourceJurisdiction || "—"}<br>
        <strong style="color: var(--text);">Type:</strong> ${item.officialSourceType || "—"}<br>
        <strong style="color: var(--text);">Version:</strong> ${item.version || "—"}<br>
        <strong style="color: var(--text);">Status:</strong> ${item.maintenanceStatus || "—"}<br>
        <strong style="color: var(--text);">Cadence:</strong> ${item.reviewCadence || "—"}<br>
        <strong style="color: var(--text);">Next review:</strong> ${item.nextReviewDue || "—"}<br>
        <strong style="color: var(--text);">Owner:</strong> ${item.reviewOwner || "—"}<br>
        <strong style="color: var(--text);">Last reviewed:</strong> ${item.lastReviewed || "—"}<br>
        <strong style="color: var(--text);">Notes:</strong> ${item.reviewNotes || "—"}<br>
        <strong style="color: var(--text);">Change log:</strong><br>${formatChangeLog(item)}
      </p>
    </div>`;
}
function renderOverlayQuestions() {
  const overlay = selectedOverlays()[state.overlayIndex];
  const item = overlay.item;
  els.overlayMount.innerHTML = `
    <p class="section-label">Step ${currentStepNumber()}</p>
    <div class="overlay-card">
      <span class="overlay-type-badge">${overlay.kind === "law" ? "Law overlay" : "Sector overlay"}</span>
      <span class="overlay-type-badge">${item.layerLabel || item.sectorLabel || ""}</span>
      <h3>${item.title}</h3>
      <p class="catalog-hint"><strong style="color: var(--text);">Applicability:</strong> ${overlay.applicability.status} — ${overlay.applicability.reason}</p>
      <p class="catalog-hint"><strong style="color: var(--text);">Focus:</strong> ${item.focus || "—"}</p>
      <p class="catalog-hint"><strong style="color: var(--text);">Risk tags:</strong> ${(item.riskTags || []).join(", ") || "—"}</p>
      ${renderSourcesBlock(item)}
      ${renderEvidenceBlock(item)}
    </div>
  `;
  (item.questions || []).forEach((q, idx) => {
    const key = `${overlay.kind}:${item.id}:${idx}`;
    const wrap = document.createElement("div");
    wrap.innerHTML = renderQuestionBlock(q.title, q.help, key, state.overlayAnswers[key], `Overlay question ${idx + 1}`);
    els.overlayMount.appendChild(wrap.firstElementChild);
    wireScoreInputs(els.overlayMount, key, state.overlayAnswers);
  });
}

function averageFromKeys(keys, source) {
  const values = keys.map(k => source[k]).filter(v => v !== undefined);
  return values.length ? values.reduce((a,b) => a+b, 0) / values.length : 0;
}
function coreAverage(section) { return averageFromKeys(section.questions.map((_, idx) => `${section.id}:${idx}`), state.answers); }
function overlayAverage(overlay) { return averageFromKeys(overlay.item.questions.map((_, idx) => `${overlay.kind}:${overlay.item.id}:${idx}`), state.overlayAnswers); }
function overallAverage() {
  const values = [...Object.values(state.answers), ...Object.values(state.overlayAnswers)];
  return values.length ? values.reduce((a,b)=>a+b,0) / values.length : 0;
}
function maturityBand(score) {
  if (score < 1.5) return { label: "High exposure / low maturity", cls: "chip-bad" };
  if (score < 2.75) return { label: "Developing posture", cls: "chip-warn" };
  return { label: "Relatively strong posture", cls: "chip-good" };
}
function priorityLabel(score) {
  if (score < 1.5) return "Immediate";
  if (score < 2.75) return "Planned";
  return "Maintain";
}
function summarizeCodes(arr) { return arr.length ? arr.map(id => countriesMap()[id]?.label || id).join(", ") : "None selected"; }

function calcRuleRisk(rule, applicabilityStatus, maturityScore) {
  const impact = rule.impactWeight ?? 3;
  const likelihood = rule.likelihoodWeight ?? 3;
  const enforcement = rule.enforcementSensitivity ?? 2;
  const crossBorder = rule.crossBorderSensitivity ?? 2;
  const sector = rule.sectorSensitivity ?? 2;
  const appliesBoost = applicabilityStatus === "Likely applies" ? 1.0 : applicabilityStatus === "May apply" ? 0.7 : 0.25;
  const maturityPenalty = 5 - Math.max(0, maturityScore);
  return (((impact + likelihood + enforcement + crossBorder + sector) / 5) * appliesBoost * maturityPenalty).toFixed(1);
}
function buildActionItem(title, type, priority, owner, timeline, tags, detail) {
  return { title, type, priority, owner, timeline, tags, detail };
}
function topRemediationFor(score, item) {
  const recs = item.remediations || [];
  if (!recs.length) return null;
  if (score < 1.5) return recs.find(r => r.priority === "immediate") || recs[0];
  if (score < 2.75) return recs.find(r => r.priority === "planned") || recs[0];
  return recs.find(r => r.priority === "maintain") || recs[recs.length - 1];
}

function renderReport() {
  const overall = overallAverage();
  const band = maturityBand(overall);

  els.overallScore.textContent = overall.toFixed(1);
  els.profileChip.className = `level-chip ${band.cls}`;
  els.profileChip.textContent = band.label;
  els.reportTitle.textContent = state.profile.assessmentName || "Operating profile";
  els.profileSummary.textContent = state.profile.clientName
    ? `${state.profile.clientName} — ${band.label}. Sector: ${sectorsMap()[state.profile.sector]?.label || state.profile.sector}.`
    : `${band.label}. Sector: ${sectorsMap()[state.profile.sector]?.label || state.profile.sector}.`;
  els.reportNarrative.textContent =
    overall < 1.5
      ? "Your answers indicate meaningful exposure across data movement, governance, and evidence maturity. Several selected jurisdictions are likely to need structured remediation before strong compliance claims are supportable."
      : overall < 2.75
      ? "You have some meaningful controls, but there are still notable gaps in documentation, evidence, and jurisdiction-specific operational readiness."
      : "You appear to have a stronger control posture, but country-specific validation and evidence refresh are still advisable.";
  els.reportNextStep.textContent =
    overall < 1.5
      ? "Start with data-flow validation, evidence collection, and immediate remediation of the highest-risk applicable rules."
      : overall < 2.75
      ? "Prioritize the lowest-scoring control areas, evidence gaps, and rules with the highest weighted risk."
      : "Move into periodic refresh, evidence maintenance, and deeper country-by-country counsel validation where needed.";

  const deg = (overall / 4) * 360;
  els.scoreRing.style.background = `conic-gradient(var(--brand) 0deg, var(--brand-2) ${deg}deg, rgba(255,255,255,.08) ${deg}deg 360deg)`;

  els.originSummary.textContent = summarizeCodes(state.profile.dataOrigin);
  els.storageSummary.textContent = summarizeCodes(state.profile.storageLocations);
  els.processorSummary.textContent = summarizeCodes(state.profile.processorLocations);
  els.transferNotesSummary.textContent = state.profile.transferNotes || "None provided";
  els.assumptionsSummary.textContent = state.profile.assumptions || "None recorded";
  els.unknownsSummary.textContent = state.profile.knownUnknowns || "None recorded";

  const applicableLawRows = [];
  const actions = [];

  els.breakdownTable.innerHTML = "";
  coreSections().forEach(section => {
    const score = coreAverage(section);
    const rec = score < 1.5 ? section.recommendations.low : score < 2.75 ? section.recommendations.mid : section.recommendations.high;
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${section.title}</td><td>${score.toFixed(1)} / 4.0</td><td>${priorityLabel(score)}</td><td>${rec}</td>`;
    els.breakdownTable.appendChild(tr);
    actions.push(buildActionItem(section.title, "Core control", priorityLabel(score), "Client / Control Owner", score < 1.5 ? "0-30 days" : score < 2.75 ? "30-90 days" : "Ongoing", ["core"], rec));
  });

  els.jurisdictionCards.innerHTML = "";
  state.profile.selectedCountries.forEach(countryId => {
    const country = countriesMap()[countryId];
    const countryRules = (country.rules || []).map(ruleId => lawsMap()[ruleId]).filter(Boolean);
    const results = countryRules.map(rule => ({
      rule,
      applicability: evaluateRule(rule.applicability, state.profile)
    }));
    const likely = results.filter(r => r.applicability.status === "Likely applies").length;
    const maybe = results.filter(r => r.applicability.status === "May apply").length;

    const countryRiskValues = results.map(r => {
      const ov = selectedOverlays().find(x => x.kind === "law" && x.item.id === r.rule.id);
      const m = ov ? overlayAverage(ov) : 0;
      return Number(calcRuleRisk(r.rule, r.applicability.status, m));
    });
    const avgCountryRisk = countryRiskValues.length ? (countryRiskValues.reduce((a,b)=>a+b,0) / countryRiskValues.length).toFixed(1) : "0.0";

    const card = document.createElement("article");
    card.className = "jurisdiction-card";
    card.innerHTML = `
      <h4>${country.label}</h4>
      <p><strong style="color: var(--text);">Likely applies:</strong> ${likely}</p>
      <p><strong style="color: var(--text);">May apply:</strong> ${maybe}</p>
      <p><strong style="color: var(--text);">Avg weighted risk:</strong> ${avgCountryRisk}</p>
      <p><strong style="color: var(--text);">Data connection:</strong> ${[
        state.profile.dataOrigin.includes(countryId) ? "origin" : null,
        state.profile.storageLocations.includes(countryId) ? "storage" : null,
        state.profile.processorLocations.includes(countryId) ? "processor" : null
      ].filter(Boolean).join(", ") || "selected country only"}</p>
    `;
    els.jurisdictionCards.appendChild(card);
  });

  els.lawsTable.innerHTML = "";
  selectedOverlays().filter(o => o.kind === "law").forEach(overlay => {
    const item = overlay.item;
    const score = overlayAverage(overlay);
    const ruleRisk = calcRuleRisk(item, overlay.applicability.status, score);
    const evidenceState = score < 1.5 ? "Weak evidence posture" : score < 2.75 ? "Partial evidence posture" : "Relatively stronger evidence posture";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${item.countryLabel || item.sourceJurisdiction || "—"}</td>
      <td>${item.title}</td>
      <td>${overlay.applicability.status}</td>
      <td>${ruleRisk}</td>
      <td>${evidenceState}<div style="margin-top:6px;font-size:.84rem;">${(item.evidenceChecklist || []).slice(0,3).join("; ") || "No checklist items listed."}</div></td>
      <td>${item.reviewOwner || "—"}</td>
      <td>${item.maintenanceStatus || "—"} / ${item.reviewCadence || "—"}<div style="margin-top:6px;font-size:.84rem;">${item.lastReviewed || "—"} → ${item.nextReviewDue || "—"}</div></td>
    `;
    els.lawsTable.appendChild(tr);

    applicableLawRows.push({
      country: item.countryLabel || "",
      rule: item.title,
      status: overlay.applicability.status,
      risk: ruleRisk,
      evidence: evidenceState,
      owner: item.reviewOwner || "",
      maintenance: item.maintenanceStatus || ""
    });

    const rem = topRemediationFor(score, item);
    if (rem) {
      actions.push(buildActionItem(item.title, "Law overlay", rem.priority || priorityLabel(score), rem.owner || "Legal / Security / Product", rem.timeline || "30-90 days", item.riskTags || [], rem.action));
    }
  });

  selectedOverlays().filter(o => o.kind === "sector").forEach(overlay => {
    const score = overlayAverage(overlay);
    const rem = topRemediationFor(score, overlay.item);
    if (rem) actions.push(buildActionItem(overlay.item.title, "Sector overlay", rem.priority || priorityLabel(score), rem.owner || "Business owner", rem.timeline || "30-90 days", overlay.item.riskTags || [], rem.action));
  });

  els.actionsTable.innerHTML = "";
  actions.slice(0, 20).forEach(action => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${action.title}<div style="margin-top:6px;font-size:.84rem;">${action.detail}</div></td><td>${action.type}</td><td>${action.priority}</td><td>${action.owner}</td><td>${action.timeline}</td><td>${(action.tags || []).join(", ")}</td>`;
    els.actionsTable.appendChild(tr);
  });

  els.recommendationsGrid.innerHTML = "";
  actions.slice(0, 8).forEach(action => {
    const card = document.createElement("article");
    card.className = "reco-card";
    card.innerHTML = `<h4>${action.title}</h4><p><strong style="color:var(--text);">${action.priority}</strong> • ${action.timeline}</p><p>${action.detail}</p>`;
    els.recommendationsGrid.appendChild(card);
  });

  const avgRisk = applicableLawRows.length ? (applicableLawRows.reduce((a,b)=>a+Number(b.risk),0) / applicableLawRows.length).toFixed(1) : "0.0";
  els.riskSummary.textContent = `Weighted jurisdiction risk score: ${avgRisk}. Data categories selected: ${state.profile.dataCategories.map(id => state.catalog.dataCategories.find(x => x.id === id)?.label || id).join(", ") || "none"}.`;
}

function goIntro() { setStage("intro"); }
function goSetup() { setStage("setup"); }
function goResidency() { setStage("residency"); }
function goCore(index = 0) { state.coreIndex = index; setStage("core"); renderCoreQuestions(); }
function goOverlay(index = 0) { state.overlayIndex = index; setStage("overlay"); renderOverlayQuestions(); }
function goReport() { setStage("report"); renderReport(); history.replaceState(null, "", "#report"); }

function nextFromCore() {
  if (state.coreIndex < coreSections().length - 1) return goCore(state.coreIndex + 1);
  if (selectedOverlays().length) return goOverlay(0);
  goReport();
}
function prevFromCore() {
  if (state.coreIndex === 0) return goResidency();
  goCore(state.coreIndex - 1);
}
function nextFromOverlay() {
  if (state.overlayIndex < selectedOverlays().length - 1) return goOverlay(state.overlayIndex + 1);
  goReport();
}
function prevFromOverlay() {
  if (state.overlayIndex === 0) return goCore(coreSections().length - 1);
  goOverlay(state.overlayIndex - 1);
}

function buildExportPayload() {
  return {
    profile: state.profile,
    answers: state.answers,
    overlayAnswers: state.overlayAnswers,
    generatedAt: new Date().toISOString(),
    selectedCountries: state.profile.selectedCountries.map(id => countriesMap()[id]?.label || id),
    selectedDataCategories: state.profile.dataCategories.map(id => state.catalog.dataCategories.find(x => x.id === id)?.label || id)
  };
}
function downloadText(filename, text, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
async function shareResults() {
  const payload = encodeURIComponent(JSON.stringify(buildExportPayload()));
  const shareUrl = `${location.origin}${location.pathname}#results=${payload}`;
  try {
    await navigator.clipboard.writeText(shareUrl);
    els.shareStatus.textContent = "Share link copied to clipboard.";
  } catch {
    els.shareStatus.textContent = "Could not copy automatically.";
  }
}
function exportJson() {
  downloadText("nk-assessment.json", JSON.stringify(buildExportPayload(), null, 2), "application/json;charset=utf-8");
}
function exportCsv() {
  const rows = [["Item","Type","Priority","Owner","Timeline","Tags","Detail"]];
  document.querySelectorAll("#actionsTable tr").forEach(tr => {
    const cols = [...tr.children].map(td => `"${td.innerText.replace(/"/g,'""')}"`);
    rows.push(cols);
  });
  downloadText("nk-action-register.csv", rows.map(r => r.join(",")).join("\n"), "text/csv;charset=utf-8");
}
function exportMarkdown() {
  const payload = buildExportPayload();
  const md = `# ${payload.profile.assessmentName || "Assessment Report"}\n\n` +
    `**Client:** ${payload.profile.clientName || "N/A"}\n\n` +
    `**Countries:** ${payload.selectedCountries.join(", ") || "None"}\n\n` +
    `**Data categories:** ${payload.selectedDataCategories.join(", ") || "None"}\n\n` +
    `## Assumptions\n${payload.profile.assumptions || "None"}\n\n` +
    `## Known unknowns\n${payload.profile.knownUnknowns || "None"}\n`;
  downloadText("nk-assessment.md", md, "text/markdown;charset=utf-8");
}
function retakeAssessment() {
  state.answers = {};
  state.overlayAnswers = {};
  state.profile = defaultProfile();
  saveState();
  renderSelectors();
  syncProfileInputs();
  els.shareStatus.textContent = "";
  goIntro();
}
function restoreFromHash() {
  const hash = location.hash || "";
  if (!hash.startsWith("#results=")) return false;
  try {
    const raw = decodeURIComponent(hash.replace("#results=", ""));
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      state.answers = parsed.answers || {};
      state.overlayAnswers = parsed.overlayAnswers || {};
      state.profile = parsed.profile || defaultProfile();
      saveState();
      renderSelectors();
      syncProfileInputs();
      goReport();
      return true;
    }
  } catch {}
  return false;
}

function bindNavigation() {
  $("startAssessmentBtn").addEventListener("click", goSetup);
  $("startAssessmentBtn2").addEventListener("click", goSetup);
  $("backToIntroBtn").addEventListener("click", goIntro);
  $("toResidencyBtn").addEventListener("click", () => {
    if (!state.profile.selectedCountries.length) return alert("Select at least one country.");
    goResidency();
  });
  $("backToSetupBtn").addEventListener("click", goSetup);
  $("toCoreBtn").addEventListener("click", () => goCore(0));
  $("prevBtn").addEventListener("click", prevFromCore);
  $("nextBtn").addEventListener("click", nextFromCore);
  $("overlayPrevBtn").addEventListener("click", prevFromOverlay);
  $("overlayNextBtn").addEventListener("click", nextFromOverlay);
  $("retakeBtn").addEventListener("click", retakeAssessment);
  $("shareBtn").addEventListener("click", shareResults);
  $("printBtn").addEventListener("click", () => window.print());
  $("exportJsonBtn").addEventListener("click", exportJson);
  $("exportCsvBtn").addEventListener("click", exportCsv);
  $("exportMdBtn").addEventListener("click", exportMarkdown);
}

async function init() {
  try {
    await loadCatalog();
    renderSelectors();
    syncProfileInputs();
    bindProfileInputs();
    bindNavigation();
    if (!restoreFromHash()) goIntro();
  } catch (err) {
    els.loadingMessage.textContent = err.message;
  }
}
init();
