const STORAGE_KEY = "nk-jurisdiction-assessment-v13";
const RULES_BASE = "./rules/";

const SCALE = [
  { score: 0, label: "0 — Not in place", text: "Absent or unknown." },
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

function countriesMap() { return byIdMap(state.catalog?.countries || []); }
function sectorsMap() { return byIdMap(state.catalog?.sectors || []); }
function coreSections() { return state.catalog?.coreSections || []; }
function lawsMap() { return byIdMap(state.catalog?.laws || []); }
function sectorOverlaysMap() { return byIdMap(state.catalog?.sectorOverlays || []); }

async function fetchJson(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json();
}

async function loadCatalog() {
  const manifest = await fetchJson(`${RULES_BASE}manifest.json`);
  const core = await fetchJson(`${RULES_BASE}${manifest.core}`);

  const countryFiles = await Promise.all(
    (manifest.countries || []).map(file => fetchJson(`${RULES_BASE}${file}`))
  );

  const sectorFiles = await Promise.all(
    (manifest.sectors || []).map(file => fetchJson(`${RULES_BASE}${file}`))
  );

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
    case "boolean":
      return Boolean(profile[predicate.field]) === Boolean(predicate.equals);
    case "includes":
      return Array.isArray(profile[predicate.field]) && profile[predicate.field].includes(predicate.value);
    case "equals":
      return profile[predicate.field] === predicate.value;
    case "notEmpty":
      return Boolean(profile[predicate.field] && String(profile[predicate.field]).trim());
    default:
      return false;
  }
}

function evaluateRule(applicability, profile) {
  const applies = (applicability?.appliesIf || []).length
    ? (applicability.appliesIf || []).every(rule => evaluatePredicate(rule, profile))
    : false;

  const maybe = !applies && (applicability?.mayApplyIf || []).some(rule => evaluatePredicate(rule, profile));

  if (applies) {
    return {
      status: "Likely applies",
      reason: applicability.reasonLikely || "Profile strongly indicates applicability."
    };
  }

  if (maybe) {
    return {
      status: "May apply",
      reason: applicability.reasonMaybe || "Profile suggests applicability that needs validation."
    };
  }

  return {
    status: "Unlikely based on answers",
    reason: "Current answers do not strongly indicate applicability."
  };
}

function selectedLawIds() {
  const selected = new Set();

  state.profile.selectedCountries.forEach(countryId => {
    const country = countriesMap()[countryId];
    (country?.rules || []).forEach(ruleId => {
      const rule = lawsMap()[ruleId];
      if (!rule) return;
      const result = evaluateRule(rule.applicability, state.profile);
      if (result.status !== "Unlikely based on answers") {
        selected.add(ruleId);
      }
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
    if (result.status !== "Unlikely based on answers") {
      selected.add(id);
    }
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
  if (els.progressFill) els.progressFill.style.width = `${pct}%`;
  if (els.progressText) els.progressText.textContent = `${pct}%`;
}

function renderStepList() {
  if (!state.catalog || !els.stepList) return;

  const items = [
    "Intro",
    "Profile",
    "Data flow",
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

  [
    els.loadingState,
    els.introState,
    els.setupState,
    els.residencyState,
    els.questionsState,
    els.overlayState,
    els.reportState
  ].forEach(el => el?.classList.remove("active"));

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
  if (!container) return;
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
    if (!state.profile[field].includes(value)) {
      state.profile[field].push(value);
    }
  } else {
    state.profile[field] = state.profile[field].filter(v => v !== value);
  }

  saveState();
  renderProgress();
  renderStepList();
}

function renderSelectors() {
  const countries = state.catalog?.countries || [];

  renderCheckboxGroup(els.countrySelector, countries, state.profile.selectedCountries, (id, checked) => updateArrayField("selectedCountries", id, checked));
  renderCheckboxGroup(els.originSelector, countries, state.profile.dataOrigin, (id, checked) => updateArrayField("dataOrigin", id, checked));
  renderCheckboxGroup(els.storageSelector, countries, state.profile.storageLocations, (id, checked) => updateArrayField("storageLocations", id, checked));
  renderCheckboxGroup(els.processorSelector, countries, state.profile.processorLocations, (id, checked) => updateArrayField("processorLocations", id, checked));
  renderCheckboxGroup(els.dataCategorySelector, state.catalog?.dataCategories || DEFAULT_DATA_CATEGORIES, state.profile.dataCategories, (id, checked) => updateArrayField("dataCategories", id, checked));

  if (els.sectorInput) {
    els.sectorInput.innerHTML = "";
    (state.catalog?.sectors || []).forEach(sector => {
      const opt = document.createElement("option");
      opt.value = sector.id;
      opt.textContent = sector.label;
      els.sectorInput.appendChild(opt);
    });
  }
}

function syncProfileInputs() {
  if (els.clientNameInput) els.clientNameInput.value = state.profile.clientName;
  if (els.assessmentNameInput) els.assessmentNameInput.value = state.profile.assessmentName;
  if (els.consultantNotesInput) els.consultantNotesInput.value = state.profile.consultantNotes;
  if (els.sectorInput) els.sectorInput.value = state.profile.sector;
  if (els.sizeInput) els.sizeInput.value = state.profile.size;
  if (els.processesPersonalDataInput) els.processesPersonalDataInput.checked = state.profile.processesPersonalData;
  if (els.crossBorderTransfersInput) els.crossBorderTransfersInput.checked = state.profile.crossBorderTransfers;
  if (els.offersToEUInput) els.offersToEUInput.checked = state.profile.offersToEU;
  if (els.offersToUKInput) els.offersToUKInput.checked = state.profile.offersToUK;
  if (els.regulatedFinancialEntityInput) els.regulatedFinancialEntityInput.checked = state.profile.regulatedFinancialEntity;
  if (els.essentialEntityInput) els.essentialEntityInput.checked = state.profile.essentialEntity;
  if (els.usesAIInput) els.usesAIInput.checked = state.profile.usesAI;
  if (els.transferNotesInput) els.transferNotesInput.value = state.profile.transferNotes;
  if (els.assumptionsInput) els.assumptionsInput.value = state.profile.assumptions;
  if (els.knownUnknownsInput) els.knownUnknownsInput.value = state.profile.knownUnknowns;
}

function bindProfileInputs() {
  const textBinds = [
    ["clientNameInput", "clientName"],
    ["assessmentNameInput", "assessmentName"],
    ["consultantNotesInput", "consultantNotes"],
    ["transferNotesInput", "transferNotes"],
    ["assumptionsInput", "assumptions"],
    ["knownUnknownsInput", "knownUnknowns"]
  ];

  textBinds.forEach(([elKey, field]) => {
    if (els[elKey]) {
      els[elKey].addEventListener("input", e => {
        state.profile[field] = e.target.value;
        saveState();
      });
    }
  });

  if (els.sectorInput) {
    els.sectorInput.addEventListener("change", e => {
      state.profile.sector = e.target.value;
      saveState();
      renderStepList();
      renderProgress();
    });
  }

  if (els.sizeInput) {
    els.sizeInput.addEventListener("change", e => {
      state.profile.size = e.target.value;
      saveState();
    });
  }

  [
    "processesPersonalData",
    "crossBorderTransfers",
    "offersToEU",
    "offersToUK",
    "regulatedFinancialEntity",
    "essentialEntity",
    "usesAI"
  ].forEach(field => {
    const el = els[`${field}Input`];
    if (el) {
      el.addEventListener("change", e => {
        state.profile[field] = e.target.checked;
        saveState();
        renderStepList();
        renderProgress();
      });
    }
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
    </article>
  `;
}

function renderCoreQuestions() {
  const section = coreSections()[state.coreIndex];
  if (!section || !els.questionMount) return;

  els.questionMount.innerHTML = `
    <p class="section-label">Step ${currentStepNumber()}</p>
    <h2 class="section-heading">${section.title}</h2>
    <p class="section-copy">${section.description || "Answer using the maturity scale."}</p>
  `;

  section.questions.forEach((q, idx) => {
    const key = `${section.id}:${idx}`;
    const wrap = document.createElement("div");
    wrap.innerHTML = renderQuestionBlock(q.title, q.help, key, state.answers[key], `Core question ${idx + 1}`);
    const card = wrap.firstElementChild;
    els.questionMount.appendChild(card);

    card.querySelectorAll(`input[name="${key}"]`).forEach(input => {
      input.addEventListener("change", e => {
        state.answers[key] = Number(e.target.value);
        saveState();
      });
    });
  });
}

function renderOverlayQuestions() {
  const overlay = selectedOverlays()[state.overlayIndex];
  if (!overlay || !els.overlayMount) return;

  const item = overlay.item;

  els.overlayMount.innerHTML = `
    <p class="section-label">Step ${currentStepNumber()}</p>
    <div class="overlay-card">
      <span class="overlay-type-badge">${overlay.kind === "law" ? "Law overlay" : "Sector overlay"}</span>
      <span class="overlay-type-badge">${item.layerLabel || item.sectorLabel || ""}</span>
      <h3>${item.title}</h3>
      <p class="catalog-hint"><strong style="color: var(--text);">Applicability:</strong> ${overlay.applicability.status} — ${overlay.applicability.reason}</p>
      <p class="catalog-hint"><strong style="color: var(--text);">Focus:</strong> ${item.focus || "—"}</p>
    </div>
  `;

  (item.questions || []).forEach((q, idx) => {
    const key = `${overlay.kind}:${item.id}:${idx}`;
    const wrap = document.createElement("div");
    wrap.innerHTML = renderQuestionBlock(q.title, q.help, key, state.overlayAnswers[key], `Overlay question ${idx + 1}`);
    const card = wrap.firstElementChild;
    els.overlayMount.appendChild(card);

    card.querySelectorAll(`input[name="${key}"]`).forEach(input => {
      input.addEventListener("change", e => {
        state.overlayAnswers[key] = Number(e.target.value);
        saveState();
      });
    });
  });
}

function averageFromKeys(keys, source) {
  const values = keys.map(k => source[k]).filter(v => v !== undefined);
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function coreAverage(section) {
  return averageFromKeys(section.questions.map((_, idx) => `${section.id}:${idx}`), state.answers);
}

function overlayAverage(overlay) {
  return averageFromKeys((overlay.item.questions || []).map((_, idx) => `${overlay.kind}:${overlay.item.id}:${idx}`), state.overlayAnswers);
}

function overallAverage() {
  const values = [...Object.values(state.answers), ...Object.values(state.overlayAnswers)];
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function maturityBand(score) {
  if (score < 1.5) return { label: "High exposure / low maturity", cls: "chip-bad" };
  if (score < 2.75) return { label: "Developing posture", cls: "chip-warn" };
  return { label: "Relatively strong posture", cls: "chip-good" };
}

function summarizeCodes(arr) {
  return arr.length ? arr.map(id => countriesMap()[id]?.label || id).join(", ") : "None selected";
}

function renderReport() {
  if (!els.reportState) return;

  const overall = overallAverage();
  const band = maturityBand(overall);

  if (els.overallScore) els.overallScore.textContent = overall.toFixed(1);
  if (els.profileChip) {
    els.profileChip.className = `level-chip ${band.cls}`;
    els.profileChip.textContent = band.label;
  }
  if (els.reportTitle) els.reportTitle.textContent = state.profile.assessmentName || "Operating profile";
  if (els.profileSummary) {
    els.profileSummary.textContent = state.profile.clientName
      ? `${state.profile.clientName} — ${band.label}. Sector: ${sectorsMap()[state.profile.sector]?.label || state.profile.sector}.`
      : `${band.label}. Sector: ${sectorsMap()[state.profile.sector]?.label || state.profile.sector}.`;
  }
  if (els.reportNarrative) {
    els.reportNarrative.textContent =
      overall < 1.5
        ? "Your answers indicate meaningful exposure across data movement, governance, and evidence maturity."
        : overall < 2.75
          ? "You have some meaningful controls, but there are still notable gaps in documentation and readiness."
          : "You appear to have a stronger control posture, though validation is still advisable.";
  }
  if (els.reportNextStep) {
    els.reportNextStep.textContent =
      overall < 1.5
        ? "Start with data-flow validation and immediate remediation of high-risk areas."
        : overall < 2.75
          ? "Prioritize the lowest-scoring control areas and evidence gaps."
          : "Move into periodic refresh and deeper country-specific validation.";
  }

  const deg = (overall / 4) * 360;
  if (els.scoreRing) {
    els.scoreRing.style.background = `conic-gradient(var(--brand) 0deg, var(--brand-2) ${deg}deg, rgba(255,255,255,.08) ${deg}deg 360deg)`;
  }

  if (els.originSummary) els.originSummary.textContent = summarizeCodes(state.profile.dataOrigin);
  if (els.storageSummary) els.storageSummary.textContent = summarizeCodes(state.profile.storageLocations);
  if (els.processorSummary) els.processorSummary.textContent = summarizeCodes(state.profile.processorLocations);
  if (els.transferNotesSummary) els.transferNotesSummary.textContent = state.profile.transferNotes || "None provided";
  if (els.assumptionsSummary) els.assumptionsSummary.textContent = state.profile.assumptions || "None recorded";
  if (els.unknownsSummary) els.unknownsSummary.textContent = state.profile.knownUnknowns || "None recorded";

  if (els.breakdownTable) {
    els.breakdownTable.innerHTML = "";
    coreSections().forEach(section => {
      const score = coreAverage(section);
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${section.title}</td><td>${score.toFixed(1)} / 4.0</td><td>${score < 1.5 ? "Immediate" : score < 2.75 ? "Planned" : "Maintain"}</td><td>Review and improve this control area.</td>`;
      els.breakdownTable.appendChild(tr);
    });
  }

  if (els.jurisdictionCards) {
    els.jurisdictionCards.innerHTML = "";
    state.profile.selectedCountries.forEach(countryId => {
      const country = countriesMap()[countryId];
      if (!country) return;
      const card = document.createElement("article");
      card.className = "jurisdiction-card";
      card.innerHTML = `
        <h4>${country.label}</h4>
        <p><strong style="color: var(--text);">Rules mapped:</strong> ${(country.rules || []).length}</p>
        <p><strong style="color: var(--text);">Data connection:</strong> ${[
          state.profile.dataOrigin.includes(countryId) ? "origin" : null,
          state.profile.storageLocations.includes(countryId) ? "storage" : null,
          state.profile.processorLocations.includes(countryId) ? "processor" : null
        ].filter(Boolean).join(", ") || "selected country only"}</p>
      `;
      els.jurisdictionCards.appendChild(card);
    });
  }

  if (els.lawsTable) {
    els.lawsTable.innerHTML = "";
    selectedOverlays().filter(o => o.kind === "law").forEach(overlay => {
      const item = overlay.item;
      const score = overlayAverage(overlay);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${item.countryLabel || item.sourceJurisdiction || "—"}</td>
        <td>${item.title}</td>
        <td>${overlay.applicability.status}</td>
        <td>${(5 - score).toFixed(1)}</td>
        <td>${score < 1.5 ? "Weak evidence posture" : score < 2.75 ? "Partial evidence posture" : "Relatively stronger evidence posture"}</td>
        <td>${item.reviewOwner || "—"}</td>
        <td>${item.maintenanceStatus || "—"}</td>
      `;
      els.lawsTable.appendChild(tr);
    });
  }

  if (els.actionsTable) {
    els.actionsTable.innerHTML = "";
  }

  if (els.recommendationsGrid) {
    els.recommendationsGrid.innerHTML = "";
    coreSections().slice(0, 4).forEach(section => {
      const score = coreAverage(section);
      const card = document.createElement("article");
      card.className = "reco-card";
      card.innerHTML = `
        <h4>${section.title}</h4>
        <p><strong style="color:var(--text);">${score < 1.5 ? "Immediate" : score < 2.75 ? "Planned" : "Maintain"}</strong></p>
        <p>${score < 1.5 ? section.recommendations?.low : score < 2.75 ? section.recommendations?.mid : section.recommendations?.high}</p>
      `;
      els.recommendationsGrid.appendChild(card);
    });
  }

  if (els.riskSummary) {
    els.riskSummary.textContent = `Data categories selected: ${state.profile.dataCategories.map(id => (state.catalog?.dataCategories || DEFAULT_DATA_CATEGORIES).find(x => x.id === id)?.label || id).join(", ") || "none"}.`;
  }
}

function goIntro() { setStage("intro"); }
function goSetup() { setStage("setup"); }
function goResidency() { setStage("residency"); }
function goCore(index = 0) {
  state.coreIndex = index;
  setStage("core");
  renderCoreQuestions();
}
function goOverlay(index = 0) {
  state.overlayIndex = index;
  setStage("overlay");
  renderOverlayQuestions();
}
function goReport() {
  setStage("report");
  renderReport();
  history.replaceState(null, "", "#report");
}

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
    generatedAt: new Date().toISOString()
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
    if (els.shareStatus) els.shareStatus.textContent = "Share link copied to clipboard.";
  } catch {
    if (els.shareStatus) els.shareStatus.textContent = "Could not copy automatically.";
  }
}

function exportJson() {
  downloadText("nk-assessment.json", JSON.stringify(buildExportPayload(), null, 2), "application/json;charset=utf-8");
}

function exportCsv() {
  downloadText("nk-action-register.csv", "Item,Type,Priority,Owner,Timeline,Tags,Detail\n", "text/csv;charset=utf-8");
}

function exportMarkdown() {
  const payload = buildExportPayload();
  const md = `# ${payload.profile.assessmentName || "Assessment Report"}\n\n**Client:** ${payload.profile.clientName || "N/A"}\n`;
  downloadText("nk-assessment.md", md, "text/markdown;charset=utf-8");
}

function retakeAssessment() {
  state.answers = {};
  state.overlayAnswers = {};
  state.profile = defaultProfile();
  saveState();
  renderSelectors();
  syncProfileInputs();
  if (els.shareStatus) els.shareStatus.textContent = "";
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
  $("startAssessmentBtn")?.addEventListener("click", goSetup);
  $("startAssessmentBtn2")?.addEventListener("click", goSetup);
  $("backToIntroBtn")?.addEventListener("click", goIntro);

  $("toResidencyBtn")?.addEventListener("click", () => {
    if (!state.profile.selectedCountries.length) {
      alert("Select at least one country.");
      return;
    }
    goResidency();
  });

  $("backToSetupBtn")?.addEventListener("click", goSetup);
  $("toCoreBtn")?.addEventListener("click", () => goCore(0));
  $("prevBtn")?.addEventListener("click", prevFromCore);
  $("nextBtn")?.addEventListener("click", nextFromCore);
  $("overlayPrevBtn")?.addEventListener("click", prevFromOverlay);
  $("overlayNextBtn")?.addEventListener("click", nextFromOverlay);
  $("retakeBtn")?.addEventListener("click", retakeAssessment);
  $("shareBtn")?.addEventListener("click", shareResults);
  $("printBtn")?.addEventListener("click", () => window.print());
  $("exportJsonBtn")?.addEventListener("click", exportJson);
  $("exportCsvBtn")?.addEventListener("click", exportCsv);
  $("exportMdBtn")?.addEventListener("click", exportMarkdown);
}

async function init() {
  try {
    await loadCatalog();
    renderSelectors();
    syncProfileInputs();
    bindProfileInputs();
    bindNavigation();

    if (!restoreFromHash()) {
      goIntro();
    }
  } catch (err) {
    if (els.loadingMessage) {
      els.loadingMessage.textContent = err.message;
    }
    console.error(err);
  }
}

init();
