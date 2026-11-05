// NewMusic AI — frontend. Talks only to our own Netlify Functions under /api/*,
// which hold the SunoAPI.org key server-side.

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const POLL_MS = 5000;
const JOB_TIMEOUT_MS = 15 * 60 * 1000;
const RETENTION_MS = 14 * 24 * 60 * 60 * 1000; // Suno keeps files for 14 days

const IDEAS = [
  ["Summer pop", "An upbeat summer pop anthem about road-tripping with friends, catchy chorus"],
  ["Lo-fi study", "Chill lo-fi hip hop beat for studying, vinyl crackle, mellow piano"],
  ["Epic trailer", "Epic cinematic orchestral trailer music with huge drums and choir"],
  ["Heartbreak ballad", "A soulful R&B ballad about missing someone, emotional female vocals"],
  ["Country story", "A heartfelt country song about growing up in a small town"],
  ["Synthwave night", "80s synthwave track about driving through a neon city at midnight"],
];
const STYLES = ["Pop", "Hip-hop", "R&B", "Rock", "EDM", "Lo-fi", "Jazz", "Country", "Afrobeats", "Cinematic", "Acoustic", "Synthwave", "Latin", "Metal", "Gospel"];
const VARIETY_LABELS = ["Off", "Normal", "High", "Extra", "Max"];
const STATUS_TEXT = {
  PENDING: "Queued",
  TEXT_SUCCESS: "Writing lyrics",
  FIRST_SUCCESS: "First track ready",
  SUCCESS: "Done",
};
const STATUS_PROGRESS = { PENDING: 15, TEXT_SUCCESS: 40, FIRST_SUCCESS: 75, SUCCESS: 100 };

/* ---------------- storage ---------------- */
const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  },
};

const state = {
  mode: "simple",
  vocal: "",
  tracks: store.get("nm.tracks", []).filter((t) => Date.now() - (t.addedAt || 0) < RETENTION_MS),
  jobs: store.get("nm.jobs", []),
  accessCode: store.get("nm.access", ""),
  queue: [],
  currentId: null,
  search: "",
};
const saveTracks = () => store.set("nm.tracks", state.tracks);
const saveJobs = () => store.set("nm.jobs", state.jobs);

/* ---------------- api ---------------- */
async function api(path, { method = "GET", body } = {}) {
  const headers = { Accept: "application/json" };
  if (body) headers["Content-Type"] = "application/json";
  if (state.accessCode) headers["x-access-code"] = state.accessCode;
  let res;
  try {
    res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw Object.assign(new Error("Network error — check your connection."), { status: 0 });
  }
  let data = {};
  try { data = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok || data.ok === false) {
    if (data.needAccessCode) $("#accessWrap").hidden = false;
    throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status });
  }
  return data;
}

/* ---------------- helpers ---------------- */
const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtTime = (s) => {
  if (!Number.isFinite(s) || s <= 0) return "0:00";
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 3200);
}
function showError(el, msg) {
  el.textContent = msg;
  el.hidden = !msg;
}

/* ---------------- form setup ---------------- */
function setMode(mode) {
  state.mode = mode;
  $$(".seg-btn[data-mode]").forEach((b) => {
    const on = b.dataset.mode === mode;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", on);
  });
  $$(".mode-simple").forEach((el) => (el.hidden = mode !== "simple"));
  $$(".mode-custom").forEach((el) => (el.hidden = mode !== "custom"));
  $$(".simple-only").forEach((el) => (el.hidden = mode !== "simple"));
  syncInstrumental();
}

function syncInstrumental() {
  const instr = $("#instrumental").checked;
  const lyr = $(".lyrics-field");
  if (lyr) lyr.style.opacity = instr ? 0.45 : 1;
  $("#lyrics").disabled = instr;
}

function renderChips() {
  $("#ideaChips").innerHTML = IDEAS.map(([label], i) => `<button type="button" class="chip" data-idea="${i}">${esc(label)}</button>`).join("");
  $("#styleChips").innerHTML = STYLES.map((s) => `<button type="button" class="chip" data-style="${esc(s)}">${esc(s)}</button>`).join("");
  syncStyleChips();
}

function styleList() {
  return $("#style").value.split(",").map((s) => s.trim()).filter(Boolean);
}
function syncStyleChips() {
  const current = styleList().map((s) => s.toLowerCase());
  $$("#styleChips .chip").forEach((c) => c.classList.toggle("on", current.includes(c.dataset.style.toLowerCase())));
}

function bindCounters() {
  $$(".counter").forEach((c) => {
    const input = document.getElementById(c.dataset.for);
    const update = () => (c.textContent = `${input.value.length} / ${input.maxLength}`);
    input.addEventListener("input", update);
    update();
  });
}

function bindRanges() {
  const bind = (id, outId, fmt) => {
    const r = $(id), o = $(outId);
    const u = () => (o.textContent = fmt(Number(r.value)));
    r.addEventListener("input", u);
    u();
  };
  bind("#styleWeight", "#styleWeightOut", (v) => v.toFixed(2));
  bind("#weirdness", "#weirdnessOut", (v) => v.toFixed(2));
  bind("#variety", "#varietyOut", (v) => VARIETY_LABELS[v]);
  bind("#duration", "#durationOut", (v) => (v === 0 ? "Auto" : fmtTime(Math.max(10, v))));
}

function buildPayload() {
  const instrumental = $("#instrumental").checked;
  const base = { customMode: state.mode === "custom", instrumental, model: $("#model").value, style: $("#style").value.trim() };
  if (state.mode === "simple") {
    const prompt = $("#prompt").value.trim();
    if (!prompt && !base.style) throw new Error("Describe the song you want to create.");
    return { ...base, prompt };
  }
  const lyrics = instrumental ? "" : $("#lyrics").value.trim();
  const negativeTags = $("#negativeTags").value.trim();
  if (!base.style && !lyrics && !negativeTags) throw new Error("Add a style of music or some lyrics.");
  const payload = {
    ...base,
    title: $("#title").value.trim(),
    lyrics,
    negativeTags,
    styleWeight: Number($("#styleWeight").value),
    weirdnessConstraint: Number($("#weirdness").value),
    variety: Number($("#variety").value),
  };
  if (state.vocal && !instrumental) payload.vocalGender = state.vocal;
  const dur = Number($("#duration").value);
  if (dur > 0) payload.duration = Math.max(10, dur);
  return payload;
}

async function onSubmit(e) {
  e.preventDefault();
  const errEl = $("#formError");
  showError(errEl, "");
  if (!$("#accessWrap").hidden) {
    state.accessCode = $("#accessCode").value.trim();
    store.set("nm.access", state.accessCode);
  }

  let payload;
  try { payload = buildPayload(); } catch (err) { return showError(errEl, err.message); }

  const btn = $("#createBtn");
  btn.disabled = true;
  btn.querySelector("span").textContent = "Starting…";
  try {
    const { taskId } = await api("/api/generate", { method: "POST", body: payload });
    const label = payload.title || payload.prompt || payload.style || "New song";
    const job = { taskId, label: label.slice(0, 90), status: "PENDING", startedAt: Date.now(), input: payload };
    state.jobs.unshift(job);
    saveJobs();
    renderJobs();
    toast("Song started — it'll appear in your library shortly.");
    pollJob(job);
  } catch (err) {
    showError(errEl, err.message);
  } finally {
    btn.disabled = false;
    btn.querySelector("span").textContent = "Create";
  }
}

/* ---------------- jobs / polling ---------------- */
const polling = new Set();

async function pollJob(job) {
  if (polling.has(job.taskId)) return;
  polling.add(job.taskId);
  let delay = POLL_MS;
  try {
    while (true) {
      if (Date.now() - job.startedAt > JOB_TIMEOUT_MS) {
        job.status = "TIMEOUT";
        job.error = "This is taking longer than expected. It may still finish — try refreshing later.";
        break;
      }
      await sleep(delay);
      let res;
      try {
        res = await api(`/api/status?taskId=${encodeURIComponent(job.taskId)}`);
        delay = POLL_MS;
      } catch (err) {
        if (err.status === 401) { job.status = "FAILED"; job.error = err.message; break; }
        delay = Math.min(delay * 1.6, 30000); // back off on rate limits / transient errors
        continue;
      }
      job.status = res.status;
      if (res.tracks?.length) upsertTracks(res.tracks, job, res.done);
      renderJobs();
      if (res.failed) { job.error = res.error || "Generation failed. Try a different prompt."; break; }
      if (res.done) {
        removeJob(job.taskId);
        toast(`“${res.tracks?.[0]?.title || "Your song"}” is ready`);
        loadCredits();
        return;
      }
      saveJobs();
    }
  } finally {
    polling.delete(job.taskId);
  }
  saveJobs();
  renderJobs();
}

function removeJob(taskId) {
  state.jobs = state.jobs.filter((j) => j.taskId !== taskId);
  saveJobs();
  renderJobs();
}

function upsertTracks(incoming, job, final) {
  let changed = false;
  incoming.forEach((t, i) => {
    if (!t.id || !(t.audioUrl || t.streamUrl)) return;
    const existing = state.tracks.find((x) => x.id === t.id);
    const merged = {
      ...(existing || {}),
      ...Object.fromEntries(Object.entries(t).filter(([, v]) => v !== "" && v !== 0)),
      taskId: job.taskId,
      addedAt: existing?.addedAt || Date.now() + (incoming.length - i),
      final: Boolean(final && t.audioUrl),
      instrumental: job.input?.instrumental,
    };
    if (!merged.title) merged.title = job.input?.title || "Untitled";
    if (existing) Object.assign(existing, merged);
    else state.tracks.unshift(merged);
    changed = true;
  });
  if (changed) {
    state.tracks.sort((a, b) => b.addedAt - a.addedAt);
    saveTracks();
    renderTracks();
  }
}

function renderJobs() {
  const html = state.jobs.map((j) => {
    const failed = ["FAILED", "TIMEOUT", "CREATE_TASK_FAILED", "GENERATE_AUDIO_FAILED", "CALLBACK_EXCEPTION", "SENSITIVE_WORD_ERROR"].includes(j.status) || j.error;
    const pct = STATUS_PROGRESS[j.status] ?? 10;
    const steps = ["TEXT_SUCCESS", "FIRST_SUCCESS", "SUCCESS"];
    const reached = steps.indexOf(j.status);
    return `
      <div class="job ${failed ? "failed" : ""}" data-task="${esc(j.taskId)}">
        <div class="job-top">
          <div class="job-title">${esc(j.label)}</div>
          <div class="job-status">
            ${failed
              ? `<span>${esc(j.error || "Failed")}</span> <button class="job-x" data-dismiss="${esc(j.taskId)}">Dismiss</button>`
              : `<span class="eq"><i></i><i></i><i></i></span> ${esc(STATUS_TEXT[j.status] || "Generating")}`}
          </div>
        </div>
        ${failed ? "" : `
        <div class="progress"><span style="width:${pct}%"></span></div>
        <div class="job-steps">
          <span class="${reached >= 0 ? "on" : ""}">Lyrics</span>
          <span class="${reached >= 1 ? "on" : ""}">Streaming</span>
          <span class="${reached >= 2 ? "on" : ""}">Final audio</span>
        </div>`}
      </div>`;
  }).join("");
  $("#jobs").innerHTML = html;
  updateEmpty();
}

/* ---------------- tracks ---------------- */
function visibleTracks() {
  const q = state.search.toLowerCase();
  if (!q) return state.tracks;
  return state.tracks.filter((t) => `${t.title} ${t.tags} ${t.lyrics}`.toLowerCase().includes(q));
}

const ICONS = {
  play: '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>',
  lyrics: '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M4 5h16v2H4zm0 4h16v2H4zm0 4h10v2H4zm0 4h7v2H4z"/></svg>',
  download: '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M11 3h2v9.6l3.3-3.3 1.4 1.4L12 16.4l-5.7-5.7 1.4-1.4 3.3 3.3zM5 19h14v2H5z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M9 3h6l1 2h4v2H4V5h4zm-3 6h12l-1 12H7z"/></svg>',
};

function renderTracks() {
  const list = visibleTracks();
  const audio = $("#audio");
  const isPlaying = !audio.paused;
  $("#tracks").innerHTML = list.map((t) => {
    const current = t.id === state.currentId;
    return `
      <li class="track ${current ? "playing" : ""}" data-id="${esc(t.id)}">
        <button class="cover" data-act="play" aria-label="Play ${esc(t.title)}">
          ${t.imageUrl ? `<img src="${esc(t.imageUrl)}" alt="" loading="lazy" />` : ""}
          <span class="ov">${current && isPlaying ? ICONS.pause : ICONS.play}</span>
        </button>
        <div class="t-main">
          <div class="t-title">${esc(t.title || "Untitled")}</div>
          <div class="t-tags">${esc(t.tags || "")}</div>
          <div class="t-meta">
            ${t.final ? "" : '<span class="badge live">STREAMING</span>'}
            ${t.duration ? `<span>${fmtTime(t.duration)}</span>` : ""}
            ${t.model ? `<span class="badge">${esc(t.model)}</span>` : ""}
          </div>
        </div>
        <div class="t-actions">
          <button class="icon-btn hide-sm" data-act="lyrics" title="Lyrics & details" aria-label="Lyrics">${ICONS.lyrics}</button>
          <button class="icon-btn" data-act="download" title="${t.audioUrl ? "Download MP3" : "Download available when finished"}" aria-label="Download" ${t.audioUrl ? "" : "disabled"}>${ICONS.download}</button>
          <button class="icon-btn hide-sm" data-act="delete" title="Remove from library" aria-label="Remove">${ICONS.trash}</button>
        </div>
      </li>`;
  }).join("");
  updateEmpty();
}

function updateEmpty() {
  $("#empty").hidden = state.tracks.length > 0 || state.jobs.length > 0;
}

async function downloadTrack(t) {
  const name = `${(t.title || "song").replace(/[^\w\s-]+/g, "").trim() || "song"}.mp3`;
  try {
    const res = await fetch(t.audioUrl);
    if (!res.ok) throw new Error();
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch {
    // Cross-origin downloads may be blocked; open the file directly instead.
    window.open(t.audioUrl, "_blank", "noopener");
  }
}

function openLyricsView(t) {
  $("#viewTitle").textContent = t.title || "Untitled";
  $("#viewTags").textContent = t.tags || "";
  $("#viewLyrics").textContent = t.instrumental ? "Instrumental — no lyrics." : t.lyrics || "No lyrics available.";
  $("#viewReuse").onclick = () => {
    setMode("custom");
    $("#title").value = t.title || "";
    $("#style").value = t.tags || "";
    if (!t.instrumental && t.lyrics) $("#lyrics").value = t.lyrics;
    $("#lyrics").dispatchEvent(new Event("input"));
    syncStyleChips();
    $("#viewDialog").close();
    $("#createTitle").scrollIntoView({ behavior: "smooth" });
  };
  $("#viewDialog").showModal();
}

function onTrackClick(e) {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const id = btn.closest(".track").dataset.id;
  const t = state.tracks.find((x) => x.id === id);
  if (!t) return;
  switch (btn.dataset.act) {
    case "play":
      if (state.currentId === id) togglePlay();
      else playTrack(id);
      break;
    case "lyrics": openLyricsView(t); break;
    case "download": downloadTrack(t); break;
    case "delete":
      if (!confirm(`Remove “${t.title}” from your library?`)) return;
      state.tracks = state.tracks.filter((x) => x.id !== id);
      saveTracks();
      if (state.currentId === id) { $("#audio").pause(); state.currentId = null; $("#player").hidden = true; document.body.classList.remove("has-player"); }
      renderTracks();
      break;
  }
}

/* ---------------- player ---------------- */
function playTrack(id) {
  const t = state.tracks.find((x) => x.id === id);
  if (!t) return;
  const audio = $("#audio");
  state.queue = visibleTracks().map((x) => x.id);
  state.currentId = id;
  audio.src = t.audioUrl || t.streamUrl;
  audio.play().catch(() => toast("Couldn't play this track yet — try again in a moment."));
  $("#plTitle").textContent = t.title || "Untitled";
  $("#plTags").textContent = t.tags || "";
  const cover = $("#plCover");
  if (t.imageUrl) cover.src = t.imageUrl; else cover.removeAttribute("src");
  $("#player").hidden = false;
  document.body.classList.add("has-player");
  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: t.title || "Untitled", artist: "NewMusic AI", album: t.tags || "",
      artwork: t.imageUrl ? [{ src: t.imageUrl, sizes: "512x512" }] : [],
    });
  }
  renderTracks();
}

function togglePlay() {
  const a = $("#audio");
  if (!a.src) return;
  a.paused ? a.play() : a.pause();
}

function step(dir) {
  if (!state.queue.length) return;
  const i = state.queue.indexOf(state.currentId);
  const next = state.queue[(i + dir + state.queue.length) % state.queue.length];
  if (next) playTrack(next);
}

function bindPlayer() {
  const a = $("#audio");
  const seek = $("#plSeek");
  let seeking = false;
  $("#plPlay").addEventListener("click", togglePlay);
  $("#plPrev").addEventListener("click", () => (a.currentTime > 3 ? (a.currentTime = 0) : step(-1)));
  $("#plNext").addEventListener("click", () => step(1));
  a.addEventListener("play", () => { $("#player").classList.add("is-playing"); renderTracks(); });
  a.addEventListener("pause", () => { $("#player").classList.remove("is-playing"); renderTracks(); });
  a.addEventListener("ended", () => step(1));
  a.addEventListener("timeupdate", () => {
    $("#plCur").textContent = fmtTime(a.currentTime);
    const d = a.duration;
    if (Number.isFinite(d) && d > 0) {
      $("#plDur").textContent = fmtTime(d);
      if (!seeking) seek.value = Math.round((a.currentTime / d) * 1000);
    } else {
      const t = state.tracks.find((x) => x.id === state.currentId);
      $("#plDur").textContent = t?.duration ? fmtTime(t.duration) : "--:--";
    }
  });
  seek.addEventListener("input", () => (seeking = true));
  seek.addEventListener("change", () => {
    if (Number.isFinite(a.duration)) a.currentTime = (seek.value / 1000) * a.duration;
    seeking = false;
  });
  document.addEventListener("keydown", (e) => {
    if (e.code !== "Space" || /INPUT|TEXTAREA|SELECT|BUTTON/.test(document.activeElement.tagName)) return;
    if ($("#player").hidden) return;
    e.preventDefault();
    togglePlay();
  });
  if ("mediaSession" in navigator) {
    navigator.mediaSession.setActionHandler("previoustrack", () => step(-1));
    navigator.mediaSession.setActionHandler("nexttrack", () => step(1));
  }
}

/* ---------------- AI lyrics ---------------- */
function bindLyrics() {
  const dlg = $("#lyricsDialog");
  const go = $("#lyricsGo");
  const err = $("#lyricsError");
  const results = $("#lyricsResults");

  $("#aiLyricsBtn").addEventListener("click", () => {
    showError(err, "");
    if (!$("#lyricsTopic").value) $("#lyricsTopic").value = $("#title").value || "";
    dlg.showModal();
    $("#lyricsTopic").focus();
  });
  $("#lyricsCancel").addEventListener("click", () => dlg.close());
  $("#lyricsTopic").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); go.click(); } });

  go.addEventListener("click", async () => {
    const topic = $("#lyricsTopic").value.trim();
    if (!topic) return showError(err, "Tell us what the song is about.");
    showError(err, "");
    go.disabled = true;
    go.innerHTML = '<span class="spinner"></span> Writing…';
    results.innerHTML = "";
    try {
      const { taskId } = await api("/api/lyrics", { method: "POST", body: { prompt: topic } });
      const started = Date.now();
      while (Date.now() - started < 3 * 60 * 1000) {
        await sleep(3000);
        let r;
        try { r = await api(`/api/lyrics?taskId=${encodeURIComponent(taskId)}`); } catch (e) { if (e.status === 401) throw e; continue; }
        if (r.failed) throw new Error(r.error || "Lyrics generation failed.");
        if (r.done && r.lyrics.length) {
          results.innerHTML = r.lyrics.map((l, i) => `<button type="button" class="lyric-opt" data-i="${i}"><strong>${esc(l.title || `Option ${i + 1}`)}</strong>${esc(l.text)}</button>`).join("");
          results.onclick = (e) => {
            const b = e.target.closest(".lyric-opt");
            if (!b) return;
            const pick = r.lyrics[Number(b.dataset.i)];
            $("#lyrics").value = pick.text;
            $("#lyrics").dispatchEvent(new Event("input"));
            if (!$("#title").value && pick.title) $("#title").value = pick.title;
            dlg.close();
            toast("Lyrics added");
          };
          return;
        }
      }
      throw new Error("Lyrics are taking too long. Please try again.");
    } catch (e) {
      showError(err, e.message);
    } finally {
      go.disabled = false;
      go.textContent = "Generate lyrics";
    }
  });
}

/* ---------------- credits ---------------- */
async function loadCredits() {
  try {
    const { credits } = await api("/api/credits");
    $("#creditsVal").textContent = `${Number(credits).toLocaleString()} credits`;
  } catch (err) {
    $("#creditsVal").textContent = err.status === 401 ? "Locked" : "—";
  }
}

/* ---------------- init ---------------- */
function init() {
  renderChips();
  bindCounters();
  bindRanges();
  bindPlayer();
  bindLyrics();

  $$(".seg-btn[data-mode]").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
  $$("#vocalSeg .seg-btn").forEach((b) => b.addEventListener("click", () => {
    state.vocal = b.dataset.v;
    $$("#vocalSeg .seg-btn").forEach((x) => x.classList.toggle("active", x === b));
  }));
  $("#instrumental").addEventListener("change", syncInstrumental);
  $("#ideaChips").addEventListener("click", (e) => {
    const c = e.target.closest("[data-idea]");
    if (!c) return;
    $("#prompt").value = IDEAS[Number(c.dataset.idea)][1];
    $("#prompt").dispatchEvent(new Event("input"));
  });
  $("#styleChips").addEventListener("click", (e) => {
    const c = e.target.closest("[data-style]");
    if (!c) return;
    const list = styleList();
    const idx = list.findIndex((s) => s.toLowerCase() === c.dataset.style.toLowerCase());
    if (idx >= 0) list.splice(idx, 1); else list.push(c.dataset.style);
    $("#style").value = list.join(", ");
    syncStyleChips();
  });
  $("#style").addEventListener("input", syncStyleChips);
  $("#genForm").addEventListener("submit", onSubmit);
  $("#tracks").addEventListener("click", onTrackClick);
  $("#jobs").addEventListener("click", (e) => {
    const d = e.target.closest("[data-dismiss]");
    if (d) removeJob(d.dataset.dismiss);
  });
  $("#search").addEventListener("input", (e) => { state.search = e.target.value; renderTracks(); });
  $("#creditsBtn").addEventListener("click", loadCredits);
  $("#viewClose").addEventListener("click", () => $("#viewDialog").close());
  if (state.accessCode) $("#accessCode").value = state.accessCode;

  setMode("simple");
  renderJobs();
  renderTracks();
  loadCredits();
  // Resume polling for any generations that were in flight before a reload.
  state.jobs.filter((j) => !j.error).forEach(pollJob);
}

init();
