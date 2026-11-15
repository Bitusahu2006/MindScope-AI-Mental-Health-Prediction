"use strict";

const API_BASE = "https://mindscope-ai-mental-health-prediction.onrender.com";
const API_URL = "https://mindscope-ai-mental-health-prediction.onrender.com/predict";

/* Field definitions: names match the FastAPI StudentData model exactly. */
const FIELDS = [
  { name: "age", label: "Age", kind: "int", min: 10, max: 100 },
  { name: "gender", label: "Gender", kind: "select" },
  { name: "country", label: "Country", kind: "text" },
  { name: "academic_level", label: "Academic level", kind: "select" },
  { name: "most_used_platform", label: "Most used platform", kind: "select" },
  { name: "purpose_of_use", label: "Purpose of use", kind: "select" },
  { name: "avg_daily_usage_hours", label: "Daily usage hours", kind: "float", min: 0, max: 24 },
  { name: "daily_unlocks", label: "Daily phone unlocks", kind: "int", min: 0 },
  { name: "study_hours", label: "Study hours", kind: "float", min: 0, max: 24 },
  { name: "physical_activity_hours", label: "Physical activity hours", kind: "float", min: 0, max: 24 },
  { name: "sleep_hours_per_night", label: "Sleep hours", kind: "float", min: 0, max: 24 },
  { name: "stress_level", label: "Stress level", kind: "select" },
];

const SAMPLE = {
  age: 20, gender: "Female", country: "India", academic_level: "Undergraduate",
  most_used_platform: "Instagram", purpose_of_use: "Entertainment",
  avg_daily_usage_hours: 5.5, daily_unlocks: 70, study_hours: 4,
  physical_activity_hours: 1, sleep_hours_per_night: 6.5, stress_level: "Medium",
};

const $ = (id) => document.getElementById(id);
const form = $("predict-form");
const submitBtn = $("submit-btn");
const submitLabel = $("submit-label");
const formAlert = $("form-alert");
const resultCard = $("result-card");
const scoreEl = $("score-value");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- Form helpers ---------- */
function fillForm(values) {
  FIELDS.forEach(({ name }) => { $(name).value = values ? values[name] : ""; });
  clearErrors();
}

function setFieldError(name, message) {
  const field = $(name).closest(".field");
  $(`${name}-error`).textContent = message || "";
  field.classList.toggle("invalid", Boolean(message));
  $(name).setAttribute("aria-invalid", message ? "true" : "false");
}

function clearErrors() {
  FIELDS.forEach(({ name }) => setFieldError(name, ""));
  hideAlert();
}

function showAlert(title, details = []) {
  formAlert.innerHTML = "";
  const strong = document.createElement("strong");
  strong.textContent = title;
  formAlert.appendChild(strong);
  if (details.length) {
    const ul = document.createElement("ul");
    details.forEach((d) => { const li = document.createElement("li"); li.textContent = d; ul.appendChild(li); });
    formAlert.appendChild(ul);
  }
  formAlert.hidden = false;
}
function hideAlert() { formAlert.hidden = true; formAlert.textContent = ""; }

/* ---------- Validation ---------- */
function validateField(def) {
  const raw = $(def.name).value.trim();
  if (raw === "") return def.kind === "select" ? `Select ${def.label.toLowerCase()}.` : `${def.label} is required.`;
  if (def.kind === "int" || def.kind === "float") {
    const n = Number(raw);
    if (!Number.isFinite(n)) return "Enter a valid number.";
    if (def.kind === "int" && !Number.isInteger(n)) return "Enter a whole number.";
    if (def.min !== undefined && n < def.min) return `Must be at least ${def.min}.`;
    if (def.max !== undefined && n > def.max) return `Must be at most ${def.max}.`;
  }
  return "";
}

function validateAll() {
  let firstInvalid = null;
  FIELDS.forEach((def) => {
    const message = validateField(def);
    setFieldError(def.name, message);
    if (message && !firstInvalid) firstInvalid = def.name;
  });
  return firstInvalid;
}

function buildPayload() {
  const payload = {};
  FIELDS.forEach(({ name, kind }) => {
    const raw = $(name).value.trim();
    payload[name] = kind === "int" || kind === "float" ? Number(raw) : raw;
  });
  return payload;
}

/* ---------- Result display ---------- */
function setResultState(state) { resultCard.dataset.state = state; }

function animateScore(target) {
  const decimals = 2;
  if (reducedMotion) { scoreEl.textContent = target.toFixed(decimals); return; }
  const duration = 1200;
  const start = performance.now();
  const tick = (now) => {
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    scoreEl.textContent = (target * eased).toFixed(decimals);
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function showResult(score) {
  setResultState("success");
  animateScore(score);
}

function showResultError(message) {
  scoreEl.textContent = "–";
  setResultState("error");
  $("result-error-text").textContent = message;
}

/* ---------- API call ---------- */
function describeApiError(status, body) {
  if (status === 422 && body && Array.isArray(body.detail)) {
    return {
      title: "The server rejected some values.",
      details: body.detail.map((d) => `${(d.loc || []).slice(1).join(".") || "input"}: ${d.msg}`),
    };
  }
  const detail = body && typeof body.detail === "string" ? body.detail : "";
  return { title: `The API returned an error (HTTP ${status}).`, details: detail ? [detail] : [] };
}

async function requestPrediction(payload) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  let body = null;
  try { body = await response.json(); } catch { /* non-JSON response */ }
  if (!response.ok) {
    const err = new Error("API error");
    err.apiInfo = describeApiError(response.status, body);
    throw err;
  }
  const score = body && body.predicted_mental_health_score;
  if (typeof score !== "number" || !Number.isFinite(score)) {
    const err = new Error("Bad response");
    err.apiInfo = { title: "The API response was missing predicted_mental_health_score.", details: [] };
    throw err;
  }
  return score;
}

function setLoading(isLoading) {
  submitBtn.disabled = isLoading;
  submitBtn.classList.toggle("is-loading", isLoading);
  submitBtn.setAttribute("aria-busy", String(isLoading));
  submitLabel.textContent = isLoading ? "Generating…" : "Generate Prediction";
}

async function handleSubmit(event) {
  event.preventDefault();
  hideAlert();

  const firstInvalid = validateAll();
  if (firstInvalid) {
    showAlert("Please fix the highlighted fields before generating a prediction.");
    $(firstInvalid).focus();
    return;
  }

  setLoading(true);
  setResultState("loading");
  if (window.matchMedia("(max-width: 1020px)").matches) $("result").scrollIntoView({ behavior: "smooth", block: "start" });

  try {
    const score = await requestPrediction(buildPayload());
    showResult(score);
    setStatus("online");
  } catch (error) {
    if (error.apiInfo) {
      showAlert(error.apiInfo.title, error.apiInfo.details);
      showResultError("The backend could not produce a prediction.");
    } else {
      showAlert("Could not reach the prediction API.", [
        `Make sure the FastAPI server is running at ${API_BASE}.`,
        "Check the terminal for errors, then try again.",
      ]);
      showResultError("The backend is not reachable.");
      setStatus("offline");
    }
  } finally {
    setLoading(false);
  }
}

/* ---------- Backend status ---------- */
function setStatus(state) {
  const el = $("status");
  el.dataset.state = state;
  $("status-text").textContent = { online: "API connected", offline: "API offline", checking: "Checking API…" }[state];
}

async function checkBackend() {
  try {
    // no-cors: any response means the server is reachable; a network failure throws.
    await fetch(`${API_BASE}/docs`, { mode: "no-cors", cache: "no-store" });
    setStatus("online");
  } catch {
    setStatus("offline");
  }
}

/* ---------- Init ---------- */
function init() {
  fillForm(SAMPLE);

  form.addEventListener("submit", handleSubmit);
  $("sample-btn").addEventListener("click", () => { fillForm(SAMPLE); setResultState("idle"); scoreEl.textContent = "–"; });
  $("reset-btn").addEventListener("click", () => {
    fillForm(null);
    setResultState("idle");
    scoreEl.textContent = "–";
    $("age").focus();
  });

  // Validate a field as soon as the user leaves it; clear its error on edit.
  FIELDS.forEach((def) => {
    const el = $(def.name);
    el.addEventListener("blur", () => { if (el.value !== "" || el.closest(".field").classList.contains("invalid")) setFieldError(def.name, validateField(def)); });
    el.addEventListener("input", () => { if (el.closest(".field").classList.contains("invalid")) setFieldError(def.name, validateField(def)); });
  });

  const toggle = $("nav-toggle");
  const links = $("nav-links");
  toggle.addEventListener("click", () => {
    const open = links.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
  });
  links.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => {
    links.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
  }));

  checkBackend();
  setInterval(checkBackend, 15000);
}

document.addEventListener("DOMContentLoaded", init);