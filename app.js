const STORAGE_KEY = "nk-jurisdiction-assessment-v11";
const RULES_BASE = "./rules/";

const state = {
  catalog: null,
  stage: "loading",
  coreIndex: 0,
  overlayIndex: 0,
  answers: loadState().answers || {},
  overlayAnswers: loadState().overlayAnswers || {},
  profile: loadState().profile || defaultProfile()
};

const els = {
  loadingState: document.getElementById("loadingState"),
  loadingMessage: document.getElementById("loadingMessage"),
  progressFill: document.getElementById("progressFill"),
  progressText: document.getElementById("progressText"),
  stepList: document.getElementById("stepList"),
  introState: document.getElementById("introState"),
  setupState: document.getElementById("setupState"),
  residencyState: document.getElementById("residencyState"),
  questionsState: document.getElementById("questionsState"),
  overlayState: document.getElementById("overlayState"),
  reportState: document.getElementById("reportState"),
  questionMount: document.getElementById("questionMount"),
  overlayMount: document.getElementById("overlayMount"),
  countrySelector: document.getElementById("countrySelector"),
  originSelector: document.getElementById("originSelector"),
  storageSelector: document.getElementById("storageSelector"),
  processorSelector: document.getElementById("processorSelector"),
  transferNotesInput: document.getElementById("transferNotesInput"),
  sectorInput: document.getElementById("sectorInput"),
  sizeInput: document.getElementById("sizeInput"),
  processesPersonalDataInput: document.getElementById("processesPersonalDataInput"),
  crossBorderTransfersInput: document.getElementById("crossBorderTransfersInput"),
  offersToEUInput: document.getElementById("offersToEUInput"),
  offersToUKInput: document.getElementById("offersToUKInput"),
  regulatedFinancialEntityInput: document.getElementById("regulatedFinancialEntityInput"),
  essentialEntityInput: document.getElementById("essentialEntityInput"),
  overallScore: document.getElementById("overallScore"),
  profileSummary: document.getElementById("profileSummary"),
  profileChip: document.getElementById("profileChip"),
  scoreRing: document.getElementById("scoreRing"),
  reportNarrative: document.getElementById("reportNarrative"),
  reportNextStep: document.getElementById("reportNextStep"),
  breakdownTable: document.getElementById("breakdownTable"),
  jurisdictionCards: document.getElementById("jurisdictionCards"),
  lawsTable: document.getElementById("lawsTable"),
  overlayTable: document.getElementById("overlayTable"),
  recommendationsGrid: document.getElementById("recommendationsGrid"),
  shareStatus: document.getElementById("shareStatus"),
  originSummary: document.getElementById("originSummary"),
  storageSummary: document.getElementById("storageSummary"),
  processorSummary: document.getElementById("processorSummary"),
  transferNotesSummary: document.getElementById("transferNotesSummary")
};

function defaultProfile() {
  return {
    selectedCountries: [],
    sector: "general",
    size: "small",
    processesPersonalData: false,
    crossBorderTransfers: false,
    offersToEU: false,
    offersToUK: false,
    regulatedFinancialEntity: false,
    essentialEntity: false,
    dataOrigin: [],
    storageLocations: [],
    processorLocations: [],
    transferNotes: ""
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
    sectorOverlays
  };
}

function evaluatePredicate(predicate, profile) {
  switch (predicate.type) {
    case "boolean": return Boolean(profile[predicate.field]) === Boolean(predicate.equals);
    case "includes": return Array.isArray(profile[predicate.field]) && profile[predicate.field].includes(predicate.value);
    case "equals": return profile[predicate.field] === predicate.value;
    default: return false;
  }
}

function evaluateRule(applicability, profile) {
  const applies = (applicability.appliesIf || []).every(rule => evaluatePredicate(rule, profile));
  const maybe = !applies && (applicability.mayApplyIf || []).some(rule => evaluatePredicate(rule, profile));

  if (applies) {
    return { status: "Likely applies", reason: applicability.reasonLikely || "The current profile strongly indicates applicability." };
  }
  if (maybe) {
    return { status: "May apply", reason: applicability.reasonMaybe || "The current profile suggests possible applicability that needs review." };
  }
  return { status: "Unlikely based on answers", reason: "Current answers do not strongly indicate applicability." };
}

function selectedLawIds() {
  const lawMap = lawsMap();
  const selected = new Set();

  state.profile.selectedCountries.forEach(countryId => {
    const country = countriesMap()[countryId];
    (country?.rules || []).forEach(ruleId => {
      const rule = lawMap[ruleId];
      if (!rule) return;
      const result = evaluateRule(rule.applicability, state.profile);
      if (result.status === "Likely applies" || result.status === "May apply") selected.add(ruleId);
    });
  });

  return Array.from(selected);
}

function selectedSectorOverlayIds() {
  const sector = sectorsMap()[state.profile.sector];
  const overlayMap = sectorOverlaysMap();
  const selected = new Set();

  (sector?.overlays || []).forEach(id => {
    const overlay = overlayMap[id];
    if (!overlay) return;
    const result = evaluateRule(overlay.applicability, state.profile);
    if (result.status === "Likely applies" || result.status === "May apply") selected.add(id);
  });

  return Array.from(selected);
}

function selectedOverlays() {
  const lawMap = lawsMap();
  const sectorMap = sectorOverlaysMap();

  const lawOverlays = selectedLawIds().map(id => ({
    kind: "law",
    id,
    item: lawMap[id],
    applicability: evaluateRule(lawMap[id].applicability, state.profile)
  }));

  const sectorOverlays = selectedSectorOverlayIds().map(id => ({
    kind: "sector",
    id,
    item: sectorMap[id],
    applicability: evaluateRule(sectorMap[id].applicability, state.profile)
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
  const items = [
    "Intro",
    "Country & profile",
    "Residency map",
    ...coreSections().map(s => s.title),
    ...selectedOverlays().map(o => o.item.title),
    "Report"
  ];

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

  if (stageName === "loading") els.loadingState.classList.add("active");
  if (stageName === "intro") els.introState.classList.add("active");
  if (stageName === "setup") els.setupState.classList.add("active");
  if (stageName === "residency") els.residencyState.classList.add("active");
  if (stageName === "core") els.questionsState.classList.add("active");
  if (stageName === "overlay") els.overlayState.classList.add("active");
  if (stageName === "report") els.reportState.classList.add("active");

  renderProgress();
  renderStepList();
}

function renderCheckboxGroup(container, options, selectedValues, onChange) {
  container.innerHTML = "";
  options.forEach(option => {
    const label = document.createElement("label");
    label.className = "checkline";
    label.innerHTML = `<input type="checkbox" value="${option.id}" ${selectedValues.includes(option.id) ? "checked" : ""} /><span>${option.label}</span>`;
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

  els.sectorInput.innerHTML = "";
  (state.catalog.sectors || []).forEach(sector => {
    const opt = document.createElement("option");
    opt.value = sector.id;
    opt.textContent = sector.label;
    els.sectorInput.appendChild(opt);
  });
}

function syncProfileInputs() {
  els.sectorInput.value = state.profile.sector;
  els.sizeInput.value = state.profile.size;
  els.processesPersonalDataInput.checked = state.profile.processesPersonalData;
  els.crossBorderTransfersInput.checked = state.profile.crossBorderTransfers;
  els.offersToEUInput.checked = state.profile.offersToEU;
  els.offersToUKInput.checked = state.profile.offersToUK;
  els.regulatedFinancialEntityInput.checked = state.profile.regulatedFinancialEntity;
  els.essentialEntityInput.checked = state.profile.essentialEntity;
  els.transferNotesInput.value = state.profile.transferNotes;
}

function bindProfileInputs() {
  els.sectorInput.addEventListener("change", e => { state.profile.sector = e.target.value; saveState(); renderStepList(); renderProgress(); });
  els.sizeInput.addEventListener("change", e => { state.profile.size = e.target.value; saveState(); });
  els.processesPersonalDataInput.addEventListener("change", e => { state.profile.processesPersonalData = e.target.checked; saveState(); renderStepList(); renderProgress(); });
  els.crossBorderTransfersInput.addEventListener("change", e => { state.profile.crossBorderTransfers = e.target.checked; saveState(); renderStepList(); renderProgress(); });
  els.offersToEUInput.addEventListener("change", e => { state.profile.offersToEU = e.target.checked; saveState(); renderStepList(); renderProgress(); });
  els.offersToUKInput.addEventListener("change", e => { state.profile.offersToUK = e.target.checked; saveState(); renderStepList(); renderProgress(); });
  els.regulatedFinancialEntityInput.addEventListener("change", e => { state.profile.regulatedFinancialEntity = e.target.checked; saveState(); renderStepList(); renderProgress(); });
  els.essentialEntityInput.addEventListener("change", e => { state.profile.essentialEntity = e.target.checked; saveState(); renderStepList(); renderProgress(); });
  els.transferNotesInput.addEventListener("input", e => { state.profile.transferNotes = e.target.value; saveState(); });
}

function renderCoreQuestions() {
  const section = coreSections()[state.coreIndex];
  els.questionMount.innerHTML = `<p class="section-label">Step ${currentStepNumber()}</p><h2 class="section-heading">${section.title}</h2><p class="section-copy">Answer the following prompts using the maturity scale from 0 to 4.</p>`;

  section.questions.forEach((q, qIdx) => {
    const key = `${section.id}:${qIdx}`;
    const current = state.answers[key];
    const card = document.createElement("article");
    card.className = "question-card";
    card.innerHTML = `
      <div class="question-index">Question ${state.coreIndex * section.questions.length + qIdx + 1}</div>
      <h3 class="question-title">${q.title}</h3>
      <p class="question-help">${q.help}</p>
      <div class="options">
        ${q.scale.map(option => `
          <label class="option">
            <input type="radio" name="${key}" value="${option.score}" ${current === option.score ? "checked" : ""} />
            <div><strong>${option.label}</strong><span>${option.text}</span></div>
          </label>
        `).join("")}
      </div>
    `;
    card.querySelectorAll(`input[name="${key}"]`).forEach(input => {
      input.addEventListener("change", e => {
        state.answers[key] = Number(e.target.value);
        saveState();
      });
    });
    els.questionMount.appendChild(card);
  });
}

function renderOfficialSources(item) {
  if (!Array.isArray(item.officialSources) || !item.officialSources.length) {
    return `<p class="catalog-hint">No official sources linked for this rule yet.</p>`;
  }
  return `
    <div class="catalog-hint">
      <strong style="color: var(--text);">Official sources:</strong>
      <ul style="margin:8px 0 0 18px;">
        ${item.officialSources.map(src => `<li><a href="${src.url}" target="_blank" rel="noopener noreferrer">${src.label}</a></li>`).join("")}
      </ul>
      <p style="margin:8px 0 0;">
        <strong style="color: var(--text);">Source jurisdiction:</strong> ${item.sourceJurisdiction || "—"}<br/>
        <strong style="color: var(--text);">Source type:</strong> ${item.officialSourceType || "—"}<br/>
        <strong style="color: var(--text);">Last reviewed:</strong> ${item.lastReviewed || "—"}<br/>
        <strong style="color: var(--text);">Review notes:</strong> ${item.reviewNotes || "—"}
      </p>
    </div>
  `;
}

function renderOverlayQuestions() {
  const overlay = selectedOverlays()[state.overlayIndex];
  els.overlayMount.innerHTML = `
    <p class="section-label">Step ${currentStepNumber()}</p>
    <div class="overlay-card">
      <span class="overlay-type-badge">${overlay.kind === "law" ? "Law overlay" : "Sector overlay"}</span>
      <span class="overlay-type-badge">${overlay.item.layerLabel || overlay.item.sectorLabel || ""}</span>
      <h3>${overlay.item.title}</h3>
      <p class="overlay-meta"><strong style="color: var(--text);">Focus:</strong> ${overlay.item.focus}</p>
      <p class="overlay-help"><strong style="color: var(--text);">Applicability:</strong> ${overlay.applicability.status} — ${overlay.applicability.reason}</p>
      ${renderOfficialSources(overlay.item)}
    </div>
  `;

  overlay.item.questions.forEach((q, qIdx) => {
    const key = `${overlay.kind}:${overlay.item.id}:${qIdx}`;
    const current = state.overlayAnswers[key];
    const card = document.createElement("article");
    card.className = "question-card";
    card.innerHTML = `
      <div class="question-index">Overlay question ${qIdx + 1} of ${overlay.item.questions.length}</div>
      <h3 class="question-title">${q.title}</h3>
      <p class="question-help">${q.help}</p>
      <div class="options">
        ${q.scale.map(option => `
          <label class="option">
            <input type="radio" name="${key}" value="${option.score}" ${current === option.score ? "checked" : ""} />
            <div><strong>${option.label}</strong><span>${option.text}</span></div>
          </label>
        `).join("")}
      </div>
    `;
    card.querySelectorAll(`input[name="${key}"]`).forEach(input => {
      input.addEventListener("change", e => {
        state.overlayAnswers[key] = Number(e.target.value);
        saveState();
      });
    });
    els.overlayMount.appendChild(card);
  });
}

function averageFromKeys(keys, source) {
  const values = keys.map(k => source[k]).filter(v => v !== undefined);
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function coreAverage(section) {
  return averageFromKeys(section.questions.map((_, idx) => `${section.id}:${idx}`), state.answers);
}

function overlayAverage(overlay) {
  return averageFromKeys(overlay.item.questions.map((_, idx) => `${overlay.kind}:${overlay.item.id}:${idx}`), state.overlayAnswers);
}

function overallAverage() {
  const values = [...Object.values(state.answers), ...Object.values(state.overlayAnswers)];
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function maturityBand(score) {
  if (score < 1.5) return { label: "High exposure / low maturity", cls: "chip-bad", summary: "Your answers suggest concentrated dependency, limited control, and a higher chance of legal or operational gaps." };
  if (score < 2.75) return { label: "Developing posture", cls: "chip-warn", summary: "You have some meaningful controls, but there are still notable gaps in evidence, transfers, governance, or fallback readiness." };
  return { label: "Relatively strong posture", cls: "chip-good", summary: "You appear to have a stronger control environment, though jurisdiction-specific validation is still important." };
}

function priorityLabel(score) {
  if (score < 1.5) return "Immediate";
  if (score < 2.75) return "Planned";
  return "Maintain";
}

function reportNarrativeFor(score) {
  if (score < 1.5) return "Your operating model likely needs a foundational review of data handling, cross-border transfers, incident readiness, provider dependency, and legal layering before jurisdiction-specific claims can be made with confidence.";
  if (score < 2.75) return "You have partial maturity, but some obligations may still be under-evidenced or incompletely operationalized in the countries and sectors you selected.";
  return "Your answers suggest a stronger operating posture, but country-by-country and sector-by-sector validation is still warranted.";
}

function nextStepFor(score) {
  if (score < 1.5) return "Start with a country-by-country data-flow, provider-dependency, and legal-layer review, then align incident handling and evidence collection.";
  if (score < 2.75) return "Prioritize the lowest-scoring control areas and overlays, then validate the items marked Likely applies against real workflows and contracts.";
  return "Move into evidence validation, tabletop reviews, and country-specific legal confirmation for higher-risk jurisdictions and sectors.";
}

function summarizeCodes(arr) {
  if (!arr.length) return "None selected";
  return arr.map(id => countriesMap()[id]?.label || id).join(", ");
}

function formatSourcesCell(rule) {
  if (!Array.isArray(rule.officialSources) || !rule.officialSources.length) return "—";
  return rule.officialSources.map(src => `<a href="${src.url}" target="_blank" rel="noopener noreferrer">${src.label}</a>`).join("<br/>");
}

function renderReport() {
  const overall = overallAverage();
  const band = maturityBand(overall);

  els.overallScore.textContent = overall.toFixed(1);
  els.profileSummary.textContent = band.summary;
  els.profileChip.className = `level-chip ${band.cls}`;
  els.profileChip.textContent = band.label;
  els.reportNarrative.textContent = reportNarrativeFor(overall);
  els.reportNextStep.textContent = nextStepFor(overall);

  const deg = (overall / 4) * 360;
  els.scoreRing.style.background = `conic-gradient(var(--brand) 0deg, var(--brand-2) ${deg}deg, rgba(255,255,255,0.08) ${deg}deg 360deg)`;

  els.originSummary.textContent = summarizeCodes(state.profile.dataOrigin);
  els.storageSummary.textContent = summarizeCodes(state.profile.storageLocations);
  els.processorSummary.textContent = summarizeCodes(state.profile.processorLocations);
  els.transferNotesSummary.textContent = state.profile.transferNotes.trim() || "No notes provided";

  els.breakdownTable.innerHTML = "";
  coreSections().forEach(section => {
    const score = coreAverage(section);
    const tr = document.createElement("tr");
    tr.innerHTML = `<td><strong>${section.title}</strong></td><td>${score.toFixed(1)} / 4.0</td><td>${maturityBand(score).label}</td><td>${priorityLabel(score)}</td>`;
    els.breakdownTable.appendChild(tr);
  });

  const countryMap = countriesMap();
  const lawMap = lawsMap();

  els.jurisdictionCards.innerHTML = "";
  state.profile.selectedCountries.forEach(countryId => {
    const country = countryMap[countryId];
    const rows = (country.rules || []).map(ruleId => evaluateRule(lawMap[ruleId].applicability, state.profile));
    const likely = rows.filter(r => r.status === "Likely applies").length;
    const maybe = rows.filter(r => r.status === "May apply").length;

    const card = document.createElement("article");
    card.className = "jurisdiction-card";
    card.innerHTML = `
      <h4>${country.label}</h4>
      <p><strong style="color: var(--text);">Likely applies:</strong> ${likely}</p>
      <p><strong style="color: var(--text);">May apply:</strong> ${maybe}</p>
      <p><strong style="color: var(--text);">Data connection:</strong> ${[
        state.profile.dataOrigin.includes(countryId) ? "origin" : null,
        state.profile.storageLocations.includes(countryId) ? "storage" : null,
        state.profile.processorLocations.includes(countryId) ? "processor" : null
      ].filter(Boolean).join(", ") || "selected country only"}</p>
    `;
    els.jurisdictionCards.appendChild(card);
  });

  els.lawsTable.innerHTML = "";
  state.profile.selectedCountries.forEach(countryId => {
    const country = countryMap[countryId];
    (country.rules || []).forEach(ruleId => {
      const rule = lawMap[ruleId];
      const result = evaluateRule(rule.applicability, state.profile);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${country.label}</td>
        <td>${rule.layerLabel}</td>
        <td>${rule.title}<div style="margin-top:6px;font-size:.84rem;">${formatSourcesCell(rule)}</div></td>
        <td>${result.status}</td>
        <td>${result.reason}</td>
        <td>${rule.sourceJurisdiction || "—"}</td>
        <td>${rule.officialSourceType || "—"}</td>
        <td>${rule.lastReviewed || "—"}</td>
        <td>${rule.reviewNotes || "—"}</td>
      `;
      els.lawsTable.appendChild(tr);
    });
  });

  els.overlayTable.innerHTML = "";
  selectedOverlays().forEach(overlay => {
    const score = overlayAverage(overlay);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${overlay.item.title}</td>
      <td>${overlay.kind === "law" ? "Law" : "Sector"}</td>
      <td>${overlay.item.layerLabel || "Sector"}</td>
      <td>${score.toFixed(1)} / 4.0</td>
      <td>${priorityLabel(score)}</td>
      <td>${overlay.item.focus}</td>
    `;
    els.overlayTable.appendChild(tr);
  });

  const recs = [];
  coreSections().forEach(section => {
    const score = coreAverage(section);
    recs.push({
      title: section.title,
      score,
      body: score < 1.5 ? section.recommendations.low : score < 2.75 ? section.recommendations.mid : section.recommendations.high
    });
  });

  selectedOverlays().forEach(overlay => {
    const score = overlayAverage(overlay);
    recs.push({
      title: overlay.item.title,
      score,
      body: score < 1.5
        ? `Prioritize ${overlay.item.title} controls around ${overlay.item.focus.toLowerCase()}.`
        : score < 2.75
          ? `Formalize and document ${overlay.item.title} controls, evidence, and ownership.`
          : `Maintain and periodically validate ${overlay.item.title} readiness.`
    });
  });

  els.recommendationsGrid.innerHTML = "";
  recs.sort((a, b) => a.score - b.score).slice(0, 8).forEach(rec => {
    const card = document.createElement("article");
    card.className = "reco-card";
    card.innerHTML = `<h4>${rec.title}</h4><p><strong style="color: var(--text);">Current score:</strong> ${rec.score.toFixed(1)} / 4.0</p><p style="margin-top:8px;">${rec.body}</p>`;
    els.recommendationsGrid.appendChild(card);
  });
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

async function shareResults() {
  const payload = encodeURIComponent(JSON.stringify({
    profile: state.profile,
    answers: state.answers,
    overlayAnswers: state.overlayAnswers
  }));
  const shareUrl = `${location.origin}${location.pathname}#results=${payload}`;
  try {
    await navigator.clipboard.writeText(shareUrl);
    els.shareStatus.textContent = "Share link copied to clipboard.";
  } catch {
    els.shareStatus.textContent = "Could not copy automatically. Please copy the current URL manually.";
  }
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
  document.getElementById("startAssessmentBtn").addEventListener("click", goSetup);
  document.getElementById("startAssessmentBtn2").addEventListener("click", goSetup);
  document.getElementById("backToIntroBtn").addEventListener("click", goIntro);
  document.getElementById("toResidencyBtn").addEventListener("click", () => {
    if (!state.profile.selectedCountries.length) {
      alert("Please select at least one country or region.");
      return;
    }
    goResidency();
  });
  document.getElementById("backToSetupBtn").addEventListener("click", goSetup);
  document.getElementById("toCoreBtn").addEventListener("click", () => goCore(0));
  document.getElementById("prevBtn").addEventListener("click", prevFromCore);
  document.getElementById("nextBtn").addEventListener("click", nextFromCore);
  document.getElementById("overlayPrevBtn").addEventListener("click", prevFromOverlay);
  document.getElementById("overlayNextBtn").addEventListener("click", nextFromOverlay);
  document.getElementById("retakeBtn").addEventListener("click", retakeAssessment);
  document.getElementById("shareBtn").addEventListener("click", shareResults);
  document.getElementById("printBtn").addEventListener("click", () => window.print());
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
