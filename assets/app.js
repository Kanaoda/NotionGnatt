(function () {
  const STORAGE_KEY = "notiongnatt-prefs-v3";
  const ROLE_KEYS = [
    ["name", "roleName"],
    ["dates", "roleDates"],
    ["phase", "rolePhase"],
    ["type", "roleType"],
    ["project", "roleProject"],
    ["person", "rolePerson"],
    ["duration", "roleDuration"],
    ["parent", "roleParent"],
    ["note", "roleNote"]
  ];
  const I18N = window.TIMELINIFY_I18N || {};

  function detectLang() {
    const prefs = (() => {
      try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      } catch {
        return {};
      }
    })();
    if (prefs.lang && I18N[prefs.lang]) return prefs.lang;
    const nav = (navigator.language || "zh-Hant").toLowerCase();
    if (nav.startsWith("ja")) return "ja";
    if (nav.startsWith("en")) return "en";
    if (nav.startsWith("zh")) return "zh-Hant";
    return "zh-Hant";
  }

  let lang = detectLang();

  function tr(key, vars) {
    const dict = I18N[lang] || I18N["zh-Hant"] || {};
    let s = dict[key] != null ? dict[key] : (I18N["zh-Hant"] && I18N["zh-Hant"][key]) || key;
    if (vars) {
      Object.keys(vars).forEach((k) => {
        s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(vars[k]));
      });
    }
    return s;
  }

  function applyStaticI18n() {
    document.documentElement.lang = lang === "zh-Hant" ? "zh-Hant" : lang;
    document.title = tr("docTitle");
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      if (el.id === "wsTitle" && state.headers.length) return;
      const key = el.getAttribute("data-i18n");
      if (key) el.textContent = tr(key);
    });
    document.querySelectorAll("[data-i18n-title]").forEach((el) => {
      const key = el.getAttribute("data-i18n-title");
      if (key) el.setAttribute("title", tr(key));
    });
    document.querySelectorAll(".lang-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.lang === lang);
    });
    if (state.headers.length) {
      const dated = state.tasks.filter((t) => t.start);
      updateWorkspaceHeader(
        els.filterProject ? visibleTasks(els.clientMode && els.clientMode.checked).filter((t) => t.start) : dated
      );
    }
  }

  function setLang(next) {
    if (!I18N[next]) return;
    lang = next;
    const prefs = loadPrefs();
    prefs.lang = lang;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    applyStaticI18n();
    if (state.headers.length) {
      fillFilters(true);
      renderMapping();
      render();
    }
  }

  // Notion-like soft phase fills (client-delivery look). Named phases first.
  const PHASE_COLORS = {
    Pitching: "#f3c6c6",
    Kickoff: "#f0d0a8",
    "Schematic Design": "#b9d4ea",
    "Detail Design": "#c5c0e8",
    "Program-DEV": "#b8dfc7",
    "Program-SIT": "#9fd4c8",
    "Program-UAT": "#9ecfe0",
    "Program-Deployment": "#88c9b0",
    "Video Prepro": "#d5c0e6",
    "Video Prod": "#c9b3dc",
    Completion: "#d2d2d2",
    Maintenance: "#cfc8be",
    "Fab-Sampling": "#e8c9a0",
    "Fab-Production": "#e0b98a",
    "Fab-Site Work": "#d7ae7c",
    Ungrouped: "#c8d4e0"
  };
  // Fallback categorical palette for unknown phases — vivid but printable
  const PALETTE = [
    "#9ec9e8",
    "#a8d5c2",
    "#f0c9a0",
    "#cbb8e8",
    "#f0b4b4",
    "#b8d4a8",
    "#9fd4d0",
    "#e8c47a",
    "#b0c4de",
    "#d4a8c4",
    "#a8c0e0",
    "#c9d4a0"
  ];
  const phaseColorMap = new Map();

  const state = {
    headers: [],
    rows: [],
    mapping: {},
    tasks: [],
    excluded: new Set(),
    order: { groups: [], tasks: [] },
    colors: {},
    filtersReady: false,
    schemaKey: ""
  };

  const $ = (id) => document.getElementById(id);
  const els = {
    dropzone: $("dropzone"),
    fileInput: $("fileInput"),
    toolbar: $("toolbar"),
    mapping: $("mapping"),
    mapGrid: $("mapGrid"),
    privacy: $("privacy"),
    excludeList: $("excludeList"),
    excludeStat: $("excludeStat"),
    ganttWrap: $("ganttWrap"),
    gantt: $("gantt"),
    empty: $("empty"),
    stat: $("stat"),
    filterProject: $("filterProject"),
    filterType: $("filterType"),
    groupBy: $("groupBy"),
    zoom: $("zoom"),
    hideNoDate: $("hideNoDate"),
    clientMode: $("clientMode"),
    showLeftCol: $("showLeftCol"),
    showToday: $("showToday"),
    showWeekday: $("showWeekday"),
    showWeekendShade: $("showWeekendShade"),
    displayBar: $("displayBar"),
    btnHtml: $("btnHtml"),
    btnPng: $("btnPng"),
    btnPdf: $("btnPdf")
  };

  function toast(msg) {
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }

  function taskKey(t) {
    return `${t.project}::${t.name}`;
  }

  function loadPrefs() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function savePrefs() {
    const show = shownFields();
    const prefs = loadPrefs();
    prefs.global = {
      show,
      showLeftCol: els.showLeftCol.checked,
      showToday: els.showToday.checked,
      showWeekday: els.showWeekday.checked,
      showWeekendShade: els.showWeekendShade.checked,
      groupBy: els.groupBy.value,
      zoom: els.zoom.value,
      hideNoDate: els.hideNoDate.checked,
      clientMode: els.clientMode.checked
    };
    prefs.lang = lang;
    if (state.schemaKey) {
      prefs.schemas = prefs.schemas || {};
      prefs.schemas[state.schemaKey] = {
        mapping: { ...state.mapping },
        filterProject: els.filterProject.value,
        filterType: els.filterType.value,
        excluded: [...state.excluded],
        order: {
          groups: [...state.order.groups],
          tasks: [...state.order.tasks]
        },
        colors: { ...state.colors }
      };
    }
    delete prefs.excludedByName;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  }

  function applyGlobalPrefs() {
    const g = loadPrefs().global;
    if (!g) return;
    if (g.show) {
      document.querySelectorAll("[data-show]").forEach((el) => {
        if (Object.prototype.hasOwnProperty.call(g.show, el.dataset.show)) {
          el.checked = Boolean(g.show[el.dataset.show]);
        }
      });
    }
    if (typeof g.showLeftCol === "boolean") els.showLeftCol.checked = g.showLeftCol;
    if (typeof g.showToday === "boolean") els.showToday.checked = g.showToday;
    if (typeof g.showWeekday === "boolean") els.showWeekday.checked = g.showWeekday;
    if (typeof g.showWeekendShade === "boolean") els.showWeekendShade.checked = g.showWeekendShade;
    if (g.groupBy) els.groupBy.value = g.groupBy;
    if (g.zoom) els.zoom.value = g.zoom;
    if (typeof g.hideNoDate === "boolean") els.hideNoDate.checked = g.hideNoDate;
    if (typeof g.clientMode === "boolean") els.clientMode.checked = g.clientMode;
  }

  function schemaFingerprint(headers) {
    return headers.join("|");
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let i = 0;
    let inQuotes = false;
    const src = text.replace(/^\uFEFF/, "");
    while (i < src.length) {
      const ch = src[i];
      if (inQuotes) {
        if (ch === '"') {
          if (src[i + 1] === '"') {
            cell += '"';
            i += 2;
            continue;
          }
          inQuotes = false;
          i += 1;
          continue;
        }
        cell += ch;
        i += 1;
        continue;
      }
      if (ch === '"') {
        inQuotes = true;
        i += 1;
        continue;
      }
      if (ch === ",") {
        row.push(cell);
        cell = "";
        i += 1;
        continue;
      }
      if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && src[i + 1] === "\n") i += 1;
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
    }
    if (cell.length || row.length) {
      row.push(cell);
      rows.push(row);
    }
    return rows.filter((r) => r.some((c) => String(c).trim() !== ""));
  }

  function cleanLabel(value) {
    return String(value || "")
      .replace(/\s*\(https?:\/\/[^)]+\)/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function parseDateToken(token) {
    const t = String(token || "").trim();
    const m = t.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function parseDateRange(raw) {
    const s = String(raw || "").trim();
    if (!s) return { start: null, end: null };
    const parts = s.split(/\s*(?:→|->|—|–|to|至)\s*/i);
    if (parts.length >= 2) {
      const start = parseDateToken(parts[0]);
      const end = parseDateToken(parts[1]) || start;
      return { start, end };
    }
    const start = parseDateToken(s);
    return { start, end: start };
  }

  function looksLikeDate(value) {
    return Boolean(parseDateRange(value).start);
  }

  function scoreHeader(header, rows, kind) {
    const h = header.toLowerCase();
    const values = rows.map((r) => r[header] || "");
    const nonempty = values.filter((v) => String(v).trim());
    if (kind === "name") return /task\s*name|^name$|^title$|任務/.test(h) ? 100 : 0;
    if (kind === "dates") {
      const hits = nonempty.filter(looksLikeDate).length;
      const ratio = nonempty.length ? hits / nonempty.length : 0;
      let bonus = 0;
      if (/urgent(?!\s*task)|date|timeline|schedule|期間/.test(h) && !/arrange|remark|note/.test(h)) bonus = 20;
      if (/urgent task arrange|remark|note/.test(h)) bonus -= 30;
      return hits * 2 + ratio * 40 + bonus;
    }
    if (kind === "phase" && /phase|階段/.test(h)) return 80;
    if (kind === "type" && /^type$|類型/.test(h)) return 80;
    if (kind === "project" && /project|專案/.test(h)) return 80;
    if (kind === "person") {
      if (/^person$|負責人/.test(h)) return 90;
      if (/assignee|owner/.test(h)) return 60;
      if (/^category$/.test(h)) return 40;
      return 0;
    }
    if (kind === "duration" && /^(day|days|duration|工期)$/.test(h)) return 70;
    if (kind === "parent" && /parent|上層/.test(h)) return 70;
    if (kind === "note" && /remark|note|arrange|備註/.test(h)) return 50;
    return 0;
  }

  function autoMap(headers, rows) {
    const mapping = {};
    const used = new Set();
    for (const [role] of ROLE_KEYS) {
      let best = "";
      let bestScore = 0;
      for (const h of headers) {
        if (used.has(h)) continue;
        const s = scoreHeader(h, rows, role);
        if (s > bestScore) {
          bestScore = s;
          best = h;
        }
      }
      if (best && bestScore > 0) {
        mapping[role] = best;
        used.add(best);
      } else mapping[role] = "";
    }
    const personCols = headers.filter((h) => /person|assignee|owner|category|負責人/i.test(h));
    if (personCols.length) {
      mapping.person = personCols.sort((a, b) => {
        const fillA = rows.filter((r) => String(r[a] || "").trim()).length;
        const fillB = rows.filter((r) => String(r[b] || "").trim()).length;
        return fillB - fillA;
      })[0];
    }
    return mapping;
  }

  function objectsFromCsv(grid) {
    const headers = grid[0].map((h) => h.trim());
    const rows = grid.slice(1).map((line) => {
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = line[i] == null ? "" : line[i];
      });
      return obj;
    });
    return { headers, rows };
  }

  function buildColorMap() {
    phaseColorMap.clear();
    const seen = [];
    for (const t of state.tasks) {
      const key = t.phase || "Ungrouped";
      if (!seen.includes(key)) seen.push(key);
    }
    seen.forEach((phase, i) => {
      const custom = state.colors && state.colors[phase];
      const named = PHASE_COLORS[phase];
      phaseColorMap.set(phase, custom || named || PALETTE[i % PALETTE.length]);
    });
  }

  function colorFor(phase) {
    const key = phase || "Ungrouped";
    if (state.colors && state.colors[key]) return state.colors[key];
    if (phaseColorMap.has(key)) return phaseColorMap.get(key);
    if (PHASE_COLORS[key]) {
      phaseColorMap.set(key, PHASE_COLORS[key]);
      return PHASE_COLORS[key];
    }
    let hash = 0;
    for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    const col = PALETTE[hash % PALETTE.length];
    phaseColorMap.set(key, col);
    return col;
  }

  function shade(hex, amt) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    let r = (n >> 16) & 255;
    let g = (n >> 8) & 255;
    let b = n & 255;
    r = Math.max(0, Math.min(255, Math.round(r + amt)));
    g = Math.max(0, Math.min(255, Math.round(g + amt)));
    b = Math.max(0, Math.min(255, Math.round(b + amt)));
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  }

  function addDays(d, n) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  }
  function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  function dayDiff(a, b) {
    return Math.round((startOfDay(b) - startOfDay(a)) / 86400000);
  }
  function fmt(d) {
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}`;
  }
  function monthKey(d) {
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  function unique(values) {
    return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function safeFile(name) {
    return name.replace(/[\\/:*?"<>|]+/g, "_");
  }

  function buildTasks() {
    const m = state.mapping;
    state.tasks = state.rows
      .map((row, idx) => {
        const name = cleanLabel(row[m.name]);
        const { start, end } = parseDateRange(row[m.dates]);
        const personRaw = row[m.person] || "";
        const person = personRaw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 3)
          .join(", ");
        return {
          id: idx,
          name,
          start,
          end: end || start,
          phase: cleanLabel(row[m.phase]) || "Ungrouped",
          type: cleanLabel(row[m.type]) || "",
          project: cleanLabel(row[m.project]) || "Untitled",
          person,
          duration: (row[m.duration] || "").trim(),
          parent: cleanLabel(row[m.parent]),
          note: (row[m.note] || "").trim()
        };
      })
      .filter((t) => t.name);
    buildColorMap();
  }

  function shownFields() {
    const flags = {};
    document.querySelectorAll("[data-show]").forEach((el) => {
      flags[el.dataset.show] = el.checked;
    });
    return flags;
  }

  function filteredPool() {
    const project = els.filterProject.value;
    const type = els.filterType.value;
    return state.tasks.filter((t) => {
      if (project !== "__all__" && t.project !== project) return false;
      if (type === "__work__" && t.type !== "Milestone" && t.type !== "Task") return false;
      if (type !== "__all__" && type !== "__work__" && t.type !== type) return false;
      if (els.hideNoDate.checked && !t.start) return false;
      return true;
    });
  }

  function visibleTasks(forClient) {
    const pool = filteredPool();
    if (forClient || els.clientMode.checked) {
      return pool.filter((t) => !state.excluded.has(taskKey(t)));
    }
    return pool;
  }

  function fillFilters(preserve) {
    const projects = unique(state.tasks.map((t) => t.project));
    const types = unique(state.tasks.map((t) => t.type));
    const prevProject = els.filterProject.value;
    const prevType = els.filterType.value;
    els.filterProject.innerHTML =
      `<option value="__all__">${escapeHtml(tr("allProjects"))}</option>` +
      projects.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
    const typeOpts = [`<option value="__all__">${escapeHtml(tr("allTypes"))}</option>`];
    if (types.some((ty) => ty === "Milestone" || ty === "Task")) {
      typeOpts.push(`<option value="__work__">${escapeHtml(tr("workTypes"))}</option>`);
    }
    typeOpts.push(...types.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`));
    els.filterType.innerHTML = typeOpts.join("");

    if (!preserve || !state.filtersReady) {
      const prefs = loadPrefs();
      const schema = prefs.schemas && prefs.schemas[state.schemaKey];
      if (schema && schema.filterProject) {
        els.filterProject.value = [...els.filterProject.options].some((o) => o.value === schema.filterProject)
          ? schema.filterProject
          : "__all__";
        els.filterType.value = [...els.filterType.options].some((o) => o.value === schema.filterType)
          ? schema.filterType
          : "__all__";
      } else {
        const tril = projects.find((p) => /trilingua|trillingua/i.test(p));
        els.filterProject.value = tril || "__all__";
        els.filterType.value = [...els.filterType.options].some((o) => o.value === "__work__")
          ? "__work__"
          : "__all__";
      }
      state.filtersReady = true;
      return;
    }
    els.filterProject.value =
      projects.includes(prevProject) || prevProject === "__all__" ? prevProject : "__all__";
    els.filterType.value = [...els.filterType.options].some((o) => o.value === prevType)
      ? prevType
      : "__all__";
  }

  function renderMapping() {
    els.mapGrid.innerHTML = ROLE_KEYS.map(([role, labelKey]) => {
      const opts = [`<option value="">${escapeHtml(tr("unused"))}</option>`]
        .concat(
          state.headers.map(
            (h) =>
              `<option value="${escapeHtml(h)}" ${state.mapping[role] === h ? "selected" : ""}>${escapeHtml(h)}</option>`
          )
        )
        .join("");
      return `<label>${escapeHtml(tr(labelKey))}<select data-role="${role}">${opts}</select></label>`;
    }).join("");
    els.mapGrid.querySelectorAll("select").forEach((sel) => {
      sel.addEventListener("change", () => {
        state.mapping[sel.dataset.role] = sel.value;
        buildTasks();
        fillFilters(true);
        savePrefs();
        render();
        toast(tr("toastMapping"));
      });
    });
  }

  function renderExcludeList() {
    const names = [...state.excluded].sort();
    els.excludeStat.textContent = names.length ? tr("excludeCount", { n: names.length }) : tr("excludeNone");
    els.excludeList.innerHTML = names
      .map((key) => {
        const label = key.includes("::") ? key.split("::").slice(1).join("::") : key;
        return `<span class="exclude-chip"><span class="x-name" title="${escapeHtml(label)}">${escapeHtml(label)}</span><button type="button" data-restore="${escapeHtml(key)}" title="${escapeHtml(tr("restoreOne"))}">×</button></span>`;
      })
      .join("");
    els.excludeList.querySelectorAll("[data-restore]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.excluded.delete(btn.dataset.restore);
        savePrefs();
        render();
      });
    });
  }

  function groupTasks(tasks) {
    const mode = els.groupBy.value;
    // Preserve CSV / Notion export row order by default (not date sort)
    const ordered = tasks.slice().sort((a, b) => a.id - b.id);
    if (mode === "none") {
      const g = { key: "", items: ordered };
      ensureOrderSeed([g]);
      g.items = sortByCustomOrder(g.items, state.order.tasks, (t) => String(t.id));
      return [g];
    }
    const map = new Map();
    for (const t of ordered) {
      const key = mode === "project" ? t.project : t.phase;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(t);
    }
    let groups = [...map.entries()].map(([key, items]) => ({ key, items }));
    ensureOrderSeed(groups);
    groups = sortByCustomOrder(groups, state.order.groups, (g) => g.key);
    for (const g of groups) {
      g.items = sortByCustomOrder(g.items, state.order.tasks, (t) => String(t.id));
    }
    return groups;
  }

  function ensureOrderSeed(groups) {
    if (!state.order) state.order = { groups: [], tasks: [] };
    if (!Array.isArray(state.order.groups)) state.order.groups = [];
    if (!Array.isArray(state.order.tasks)) state.order.tasks = [];

    const keys = groups.map((g) => g.key).filter(Boolean);
    if (!state.order.groups.length) {
      state.order.groups = keys.slice();
    } else {
      for (const k of keys) {
        if (!state.order.groups.includes(k)) state.order.groups.push(k);
      }
      state.order.groups = state.order.groups.filter((k) => keys.includes(k));
    }

    const ids = groups.flatMap((g) => g.items.map((t) => String(t.id)));
    if (!state.order.tasks.length) {
      state.order.tasks = ids.slice();
    } else {
      for (const id of ids) {
        if (!state.order.tasks.includes(id)) state.order.tasks.push(id);
      }
      const idSet = new Set(ids);
      state.order.tasks = state.order.tasks.filter((id) => idSet.has(id));
    }
  }

  function sortByCustomOrder(list, order, keyFn) {
    return list.slice().sort((a, b) => {
      const ia = order.indexOf(keyFn(a));
      const ib = order.indexOf(keyFn(b));
      if (ia === -1 && ib === -1) return 0;
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }

  function moveInOrder(arr, fromKey, toKey) {
    const from = arr.indexOf(fromKey);
    const to = arr.indexOf(toKey);
    if (from < 0 || to < 0 || from === to) return false;
    arr.splice(from, 1);
    arr.splice(to, 0, fromKey);
    return true;
  }

  function pxPerDay() {
    const z = els.zoom.value;
    if (z === "week") return 12;
    if (z === "month") return 5;
    return 24;
  }

  function layoutModel(forClient) {
    const tasks = visibleTasks(forClient);
    const dated = tasks.filter((t) => t.start);
    let min = dated.length ? new Date(Math.min(...dated.map((t) => t.start))) : new Date();
    let max = dated.length ? new Date(Math.max(...dated.map((t) => t.end || t.start))) : addDays(min, 14);
    min = addDays(min, -1);
    max = addDays(max, 2);
    const days = dayDiff(min, max) + 1;
    const unit = pxPerDay();
    const show = shownFields();
    // Adaptive right padding so the longest bar label is never clipped.
    let maxLabel = 0;
    for (const t of tasks) {
      if (!t.start) continue;
      let len = 0;
      if (show.name) len += (t.name || "").length + 2;
      if (show.dates) len += 26;
      if (show.person && t.person) len += t.person.split(",")[0].length + 3;
      if (show.duration && t.duration) len += t.duration.length + 2;
      if (show.phase && t.phase) len += t.phase.length + 2;
      if (show.type && t.type) len += t.type.length + 2;
      if (show.note && t.note) len += Math.min(t.note.length, 24) + 2;
      maxLabel = Math.max(maxLabel, len);
    }
    const labelPad = Math.min(1000, Math.max(360, Math.round(maxLabel * 7.6) + 60));
    const leftW = els.showLeftCol.checked ? 300 : 0;
    const chartW = days * unit + labelPad;
    return {
      tasks,
      dated,
      min,
      max,
      days,
      unit,
      labelPad,
      leftW,
      chartW,
      groups: groupTasks(tasks),
      show
    };
  }

  function labelBits(t, show, range) {
    const bits = [];
    if (show.name) bits.push(`<span class="name">${escapeHtml(t.name)}</span>`);
    if (show.dates) bits.push(`<span class="dates">${escapeHtml(range)}</span>`);
    if (show.person && t.person) bits.push(`<span class="tag">${escapeHtml(t.person.split(",")[0])}</span>`);
    if (show.duration && t.duration) bits.push(`<span class="meta">${escapeHtml(t.duration)}</span>`);
    if (show.phase && t.phase) bits.push(`<span class="meta">${escapeHtml(t.phase)}</span>`);
    if (show.type && t.type) bits.push(`<span class="meta">${escapeHtml(t.type)}</span>`);
    if (show.note && t.note) bits.push(`<span class="meta">${escapeHtml(t.note.split("\n")[0].slice(0, 40))}</span>`);
    return bits.join("");
  }

  function weekdayLetter(d) {
    const letters = tr("weekdayLetters");
    return letters.charAt(d.getDay()) || "";
  }

  function weekendGridHtml(days, min, unit) {
    const parts = [];
    const shadeWeekend = els.showWeekendShade.checked;
    for (let i = 0; i < days; i += 1) {
      const d = addDays(min, i);
      if (shadeWeekend && (d.getDay() === 0 || d.getDay() === 6)) {
        parts.push(`<div class="grid-weekend" style="left:${i * unit}px;width:${unit}px"></div>`);
      }
      if (els.zoom.value === "day" || i % 7 === 0) {
        parts.push(`<div class="grid-line" style="left:${i * unit}px"></div>`);
      }
    }
    return parts.join("");
  }

  function barMarkup(task, min, unit, show) {
    if (!task.start) return "";
    const left = dayDiff(min, task.start) * unit;
    const span = dayDiff(task.start, task.end);
    const dur = Math.max(1, span + 1);
    const col = colorFor(task.phase);
    const isPayment = task.type === "Payment-In" || /payment/i.test(task.type);
    const isMilestone = task.type === "Milestone" && span <= 0;
    const range = task.end && span > 0 ? `${fmt(task.start)} → ${fmt(task.end)}` : fmt(task.start);
    const w = isMilestone ? Math.max(unit * 0.85, 18) : Math.max(dur * unit - 2, 14);
    const cls = ["bar", isMilestone ? "milestone" : "", isPayment ? "payment" : ""].filter(Boolean).join(" ");
    const shape = `<div class="${cls}" style="width:${w}px;background:${col}"></div>`;
    return `<div class="item" style="left:${left}px">
      ${shape}
      <div class="bar-label">${labelBits(task, show, range)}</div>
    </div>`;
  }

  function bindDrag() {
    if (els.clientMode.checked) return;
    const root = els.gantt;

    root.querySelectorAll("[data-drag-handle]").forEach((handle) => {
      handle.addEventListener("dragstart", (e) => {
        const row = handle.closest(".drop-target");
        if (!row) return;
        const kind = handle.dataset.dragHandle;
        if (kind === "group") {
          state.drag = { kind: "group", key: row.dataset.dragGroup };
          e.dataTransfer.setData("text/plain", row.dataset.dragGroup || "");
        } else {
          state.drag = { kind: "task", id: row.dataset.dragTask };
          e.dataTransfer.setData("text/plain", row.dataset.dragTask || "");
        }
        row.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
      });
      handle.addEventListener("dragend", () => {
        state.drag = null;
        root.querySelectorAll(".dragging, .drag-over").forEach((n) => {
          n.classList.remove("dragging", "drag-over");
        });
      });
    });

    root.querySelectorAll(".drop-target[data-drag-group]").forEach((el) => {
      el.addEventListener("dragover", (e) => {
        if (!state.drag || state.drag.kind !== "group") return;
        e.preventDefault();
        el.classList.add("drag-over");
      });
      el.addEventListener("dragleave", () => el.classList.remove("drag-over"));
      el.addEventListener("drop", (e) => {
        e.preventDefault();
        el.classList.remove("drag-over");
        if (!state.drag || state.drag.kind !== "group") return;
        if (moveInOrder(state.order.groups, state.drag.key, el.dataset.dragGroup)) {
          savePrefs();
          render();
        }
      });
    });

    root.querySelectorAll(".drop-target[data-drag-task]").forEach((el) => {
      el.addEventListener("dragover", (e) => {
        if (!state.drag || state.drag.kind !== "task") return;
        e.preventDefault();
        el.classList.add("drag-over");
      });
      el.addEventListener("dragleave", () => el.classList.remove("drag-over"));
      el.addEventListener("drop", (e) => {
        e.preventDefault();
        el.classList.remove("drag-over");
        if (!state.drag || state.drag.kind !== "task") return;
        if (moveInOrder(state.order.tasks, state.drag.id, el.dataset.dragTask)) {
          savePrefs();
          render();
        }
      });
    });
  }

  function phaseLegendHtml(groups) {
    const keys = [];
    const seen = new Set();
    for (const g of groups) {
      for (const t of g.items) {
        const p = t.phase || "Ungrouped";
        if (seen.has(p)) continue;
        seen.add(p);
        keys.push(p);
      }
    }
    if (!keys.length) return "";
    const canEdit = !els.clientMode.checked;
    return `<div class="phase-legend">
      <span class="legend-hint">${escapeHtml(tr(canEdit ? "legendColorHint" : "legendTitle"))}</span>
      ${keys
        .map((key) => {
          const c = colorFor(key);
          if (!canEdit) {
            return `<span class="phase-chip"><i style="background:${c};border-color:${shade(c, -40)}"></i>${escapeHtml(key)}</span>`;
          }
          return `<label class="phase-chip editable" title="${escapeHtml(tr("legendColorPick"))}">
            <input type="color" class="phase-color-input" value="${c}" data-color-key="${escapeHtml(key)}" />
            <i style="background:${c};border-color:${shade(c, -40)}"></i>
            <span>${escapeHtml(key)}</span>
          </label>`;
        })
        .join("")}
      ${canEdit && Object.keys(state.colors).length
        ? `<button type="button" class="link legend-reset" id="btnResetColors">${escapeHtml(tr("resetColors"))}</button>`
        : ""}
    </div>`;
  }

  function bindLegendColors() {
    els.gantt.querySelectorAll(".phase-color-input").forEach((input) => {
      input.addEventListener("input", () => {
        const key = input.dataset.colorKey;
        if (!key) return;
        state.colors[key] = input.value;
        phaseColorMap.set(key, input.value);
        // Live-update swatch without full re-render for snappy feel
        const swatch = input.parentElement && input.parentElement.querySelector("i");
        if (swatch) {
          swatch.style.background = input.value;
          swatch.style.borderColor = shade(input.value, -40);
        }
      });
      input.addEventListener("change", () => {
        savePrefs();
        render();
      });
    });
    const reset = $("btnResetColors");
    if (reset) {
      reset.addEventListener("click", () => {
        state.colors = {};
        buildColorMap();
        savePrefs();
        render();
        toast(tr("toastColorsReset"));
      });
    }
  }

  function render() {
    const model = layoutModel(false);
    const { tasks, dated, min, days, unit, chartW, groups, show } = model;
    updateWorkspaceHeader(dated);
    const excludedInFilter = filteredPool().filter((t) => state.excluded.has(taskKey(t))).length;
    els.stat.textContent = els.clientMode.checked
      ? tr("statClient", { n: tasks.length }) +
        (excludedInFilter ? tr("statClientExtra", { h: excludedInFilter }) : "")
      : tr("statInternal", { n: tasks.length, d: dated.length }) +
        (excludedInFilter ? tr("statInternalExtra", { h: excludedInFilter }) : "");

    renderExcludeList();

    if (!tasks.length) {
      els.gantt.innerHTML = `<div style="padding:32px;color:#8a857a;font-size:13px">${escapeHtml(tr("noItems"))}</div>`;
      return;
    }

    const months = [];
    for (let i = 0; i < days; ) {
      const d = addDays(min, i);
      const key = monthKey(d);
      let span = 0;
      while (i + span < days && monthKey(addDays(min, i + span)) === key) span += 1;
      months.push({ key, span });
      i += span;
    }

    const dayCells = [];
    const weekdayCells = [];
    const shadeWeekend = els.showWeekendShade.checked;
    const showWeekday = els.showWeekday.checked;
    for (let i = 0; i < days; i += 1) {
      const d = addDays(min, i);
      const weekend = shadeWeekend && (d.getDay() === 0 || d.getDay() === 6);
      const label = els.zoom.value === "day" ? String(d.getDate()) : i % 7 === 0 ? String(d.getDate()) : "";
      dayCells.push(
        `<div class="day-cell${weekend ? " weekend" : ""}" style="width:${unit}px">${label}</div>`
      );
      if (showWeekday) {
        const wd = weekdayLetter(d);
        const dow = d.getDay();
        const wdClass =
          dow === 0 ? " is-sunday" : dow === 6 ? " is-saturday" : "";
        weekdayCells.push(
          `<div class="weekday-cell${wdClass}" style="width:${unit}px">${escapeHtml(wd)}</div>`
        );
      }
    }

    const today = startOfDay(new Date());
    const todayOffset = dayDiff(min, today);
    const todayLine =
      els.showToday.checked && todayOffset >= 0 && todayOffset <= days
        ? `<div class="today" style="left:${todayOffset * unit + unit / 2}px"></div>`
        : "";
    const grid = weekendGridHtml(days, min, unit);
    const canDrag = !els.clientMode.checked;

    const noLeft = !els.showLeftCol.checked;
    els.gantt.classList.toggle("no-left", noLeft);
    els.gantt.classList.toggle("has-weekday", showWeekday);

    const weekdayRow = showWeekday
      ? `<div class="weekday-row">${weekdayCells.join("")}</div>`
      : "";

    const head = `<div class="gantt-head${showWeekday ? " has-weekday" : ""}">
      <div class="left-cell">${escapeHtml(tr("ganttTaskCol"))}</div>
      <div class="time-head${showWeekday ? " has-weekday" : ""}" style="width:${chartW}px">
        <div class="month-row">${months
          .map((m) => `<div class="month-cell" style="width:${m.span * unit}px">${escapeHtml(m.key)}</div>`)
          .join("")}</div>
        <div class="day-row">${dayCells.join("")}</div>
        ${weekdayRow}
      </div>
    </div>`;

    const body = groups
      .map((g) => {
        const groupItems = els.clientMode.checked
          ? g.items.filter((t) => !state.excluded.has(taskKey(t)))
          : g.items;
        if (!groupItems.length) return "";
        const groupColor =
          g.key && els.groupBy.value === "phase"
            ? colorFor(g.key)
            : colorFor(groupItems[0] && groupItems[0].phase);
        const dragGroupAttrs =
          canDrag && g.key
            ? ` data-drag-group="${escapeHtml(g.key)}"`
            : "";
        const grip =
          canDrag && g.key
            ? `<span class="drag-grip" draggable="true" data-drag-handle="group" title="${escapeHtml(tr("dragGroup"))}" aria-hidden="true"></span>`
            : "";
        const groupRow = g.key
          ? `<div class="group-row drop-target"${dragGroupAttrs}><div class="group-label" style="border-left:4px solid ${groupColor}"><span class="phase-dot" style="background:${groupColor}"></span>${grip}<span class="group-title">${escapeHtml(g.key)}</span></div><div class="bars group-bars" style="width:${chartW}px">${grid}</div></div>`
          : "";
        const rows = groupItems
          .map((task) => {
            const key = taskKey(task);
            const excluded = state.excluded.has(key);
            const bar = barMarkup(task, min, unit, show);
            const indent = task.parent ? " indent" : "";
            const hideBtn = els.showLeftCol.checked
              ? `<button type="button" class="hide-btn${excluded ? " is-hidden" : ""}" data-toggle="${escapeHtml(key)}" title="${escapeHtml(excluded ? tr("hiddenTitle") : tr("hideTitle"))}">${escapeHtml(excluded ? tr("hidden") : tr("hide"))}</button>`
              : "";
            const dragTaskAttrs = canDrag ? ` data-drag-task="${task.id}"` : "";
            const taskGrip = canDrag
              ? `<span class="drag-grip" draggable="true" data-drag-handle="task" title="${escapeHtml(tr("dragTask"))}" aria-hidden="true"></span>`
              : "";
            return `<div class="gantt-row drop-target${excluded ? " row-excluded" : ""}"${dragTaskAttrs}>
              <div class="left-cell${indent}">${taskGrip}${hideBtn}<span class="task-title" title="${escapeHtml(task.name)}">${escapeHtml(task.name)}</span></div>
              <div class="bars" style="width:${chartW}px">${grid}${todayLine}${bar}</div>
            </div>`;
          })
          .join("");
        return groupRow + rows;
      })
      .join("");

    els.gantt.innerHTML = phaseLegendHtml(groups) + head + body;
    els.gantt.querySelectorAll("[data-toggle]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const key = btn.dataset.toggle;
        if (state.excluded.has(key)) state.excluded.delete(key);
        else state.excluded.add(key);
        savePrefs();
        render();
      });
    });
    bindDrag();
    bindLegendColors();
  }

  function showWorkspace(on) {
    [els.toolbar, els.mapping, els.displayBar, els.privacy, els.ganttWrap].forEach((el) =>
      el.classList.toggle("hidden", !on)
    );
    els.empty.classList.toggle("hidden", on);
    els.dropzone.classList.toggle("compact", on);
    els.btnHtml.disabled = !on;
    els.btnPng.disabled = !on;
    els.btnPdf.disabled = !on;
  }

  function restoreExcludedAndMapping() {
    const prefs = loadPrefs();
    const schema = prefs.schemas && prefs.schemas[state.schemaKey];
    if (schema && schema.mapping) {
      state.mapping = { ...state.mapping, ...schema.mapping };
    }
    const fromSchema = schema && schema.excluded ? schema.excluded : [];
    state.excluded = new Set(fromSchema.filter(Boolean));
    const ord = (schema && schema.order) || { groups: [], tasks: [] };
    state.order = {
      groups: Array.isArray(ord.groups) ? ord.groups.slice() : [],
      tasks: Array.isArray(ord.tasks) ? ord.tasks.slice() : []
    };
    state.colors =
      schema && schema.colors && typeof schema.colors === "object" ? { ...schema.colors } : {};
  }

  function loadGrid(grid) {
    const parsed = objectsFromCsv(grid);
    state.headers = parsed.headers;
    state.rows = parsed.rows;
    state.schemaKey = schemaFingerprint(state.headers);
    state.filtersReady = false;
    applyGlobalPrefs();
    state.mapping = autoMap(state.headers, state.rows);
    restoreExcludedAndMapping();
    buildTasks();
    // Drop hide-list entries that are not in this file
    const validKeys = new Set(state.tasks.map(taskKey));
    state.excluded = new Set([...state.excluded].filter((k) => validKeys.has(k)));
    fillFilters(false);
    renderMapping();
    showWorkspace(true);
    // If client preview would show nothing, fall back to internal view
    if (els.clientMode.checked && visibleTasks(true).length === 0 && filteredPool().length > 0) {
      els.clientMode.checked = false;
    }
    savePrefs();
    render();
    toast(tr("toastLoaded"));
  }

  function readFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      loadGrid(parseCsv(String(reader.result || "")));
      const fn = $("fileName");
      if (fn) {
        fn.textContent = tr("imported", { name: file.name });
        fn.classList.remove("hidden");
      }
    };
    reader.readAsText(file, "utf-8");
  }

  function exportTitle() {
    return els.filterProject.value === "__all__" ? tr("defaultTitle") : els.filterProject.value;
  }

  function scheduleRangeLabel(dated) {
    if (!dated || !dated.length) return tr("noScheduleRange");
    const start = new Date(Math.min(...dated.map((t) => t.start)));
    const end = new Date(Math.max(...dated.map((t) => t.end || t.start)));
    return tr("scheduleRange", { start: fmt(start), end: fmt(end) });
  }

  function updateWorkspaceHeader(dated) {
    const titleEl = $("wsTitle");
    const subEl = $("wsSubtitle");
    if (!titleEl) return;
    if (!state.headers.length) {
      titleEl.textContent = tr("previewTitle");
      if (subEl) subEl.textContent = "";
      return;
    }
    titleEl.textContent = exportTitle();
    if (subEl) subEl.textContent = scheduleRangeLabel(dated);
  }

  function clientHtmlCss() {
    return `:root{--paper:#ffffff;--ink:#11334f;--muted:#7a8b9a;--line:#d9e1e8;--row-h:40px;--left-w:300px;--font:"Segoe UI","PingFang TC","Noto Sans TC","Microsoft JhengHei",sans-serif}
*{box-sizing:border-box}body{margin:0;font-family:var(--font);background:#fff;color:var(--ink)}
.export-head{padding:16px 24px 0}.export-head h1{margin:0 0 4px;font-size:20px}.export-head p{margin:0;color:#7a8b9a;font-size:13px}
.gantt-wrap{margin:16px;overflow:auto}.gantt{min-width:100%}
.phase-legend{display:flex;flex-wrap:wrap;gap:8px 14px;padding:10px 14px;border-bottom:1px solid var(--line);background:#fafcfd}
.phase-chip{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:#3a5166;font-weight:600}
.phase-chip i{width:12px;height:12px;border-radius:3px;display:inline-block;border:1px solid rgba(17,51,79,.15)}
.gantt-head,.gantt-row,.group-row{display:grid;grid-template-columns:var(--left-w) 1fr}
.gantt.no-left{--left-w:0px}.gantt.no-left .left-cell,.gantt.no-left .group-label{display:none}
.gantt.no-left .gantt-head,.gantt.no-left .gantt-row,.gantt.no-left .group-row{grid-template-columns:1fr}
.gantt-head{background:#f3f7fa;border-bottom:1px solid var(--line)}
.left-cell,.group-label{background:var(--paper);border-right:1px solid var(--line);padding:0 12px;display:flex;align-items:center;gap:6px;height:var(--row-h);font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gantt-head .left-cell{font-weight:650;height:48px}.group-label{background:#eef4f9;font-weight:650;height:28px;font-size:12px}
.phase-dot{width:8px;height:8px;border-radius:50%;flex:0 0 auto}
.indent .task-title{padding-left:14px;color:var(--muted)}.time-head{height:48px}.time-head.has-weekday{height:66px}
.gantt-head.has-weekday .left-cell{height:66px}
.month-row,.day-row{display:flex;height:24px}.weekday-row{display:flex;height:18px}
.month-cell,.day-cell,.weekday-cell{border-right:1px solid var(--line);font-size:11px;color:var(--muted);display:flex;align-items:center;justify-content:center;flex:0 0 auto}
.weekday-cell{font-size:9px;font-weight:650;letter-spacing:.02em}.weekday-cell.is-saturday{color:#9aa8b5}.weekday-cell.is-sunday{color:#c65442}
.month-cell{font-weight:650;color:var(--ink);background:#e8f1f8;justify-content:flex-start;padding-left:8px}.weekend{background:#f5f8fb}
.gantt-row .left-cell{border-bottom:1px solid #eef2f5}
.bars{position:relative;height:var(--row-h);border-bottom:1px solid #eef2f5;overflow:visible}
.group-bars{height:28px;background:#eef4f9}
.grid-weekend{position:absolute;top:0;bottom:0;background:#f5f8fb;pointer-events:none;z-index:0}
.grid-line{position:absolute;top:0;bottom:0;width:1px;background:#eef2f5;pointer-events:none;z-index:0}
.item{position:absolute;top:8px;display:flex;align-items:center;gap:8px;z-index:1}
.bar{flex:0 0 auto;height:22px;border-radius:5px;min-width:14px;border:0;box-shadow:none}
.bar.milestone{border-radius:5px}
.bar.payment{outline:1px dashed rgba(17,51,79,.28);outline-offset:1px}
.bar-label{display:flex;align-items:center;gap:8px;white-space:nowrap;font-size:12.5px}
.bar-label .name{font-weight:650}.bar-label .dates{color:#3a5166}.bar-label .meta{color:var(--muted)}
.tag{font-size:11px;background:#e8f1f8;color:#11334f;border-radius:999px;padding:2px 7px;font-weight:650}
.today{position:absolute;top:0;bottom:0;width:2px;background:#c65442;z-index:0}
.drag-grip{display:none}`;
  }

  function downloadClientHtml() {
    const wasClient = els.clientMode.checked;
    els.clientMode.checked = true;
    render();
    const clone = els.gantt.cloneNode(true);
    clone.querySelectorAll(".hide-btn").forEach((n) => n.remove());
    clone.querySelectorAll(".row-excluded").forEach((n) => n.remove());
    clone.querySelectorAll(".drag-grip").forEach((n) => n.remove());
    clone.querySelectorAll("[draggable]").forEach((n) => {
      n.removeAttribute("draggable");
      n.removeAttribute("data-drag-task");
      n.removeAttribute("data-drag-group");
    });
    const title = exportTitle();
    const subtitle = scheduleRangeLabel(
      layoutModel(true).dated
    );
    const html = `<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8"/><title>${escapeHtml(title)}</title><style>${clientHtmlCss()}</style></head><body>
<div class="export-head"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p></div>
<main class="gantt-wrap">${clone.outerHTML}</main></body></html>`;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${safeFile(title)}-client.html`;
    a.click();
    URL.revokeObjectURL(a.href);
    els.clientMode.checked = wasClient;
    render();
    toast(tr("toastHtml"));
  }

  function drawFullPng() {
    const wasClient = els.clientMode.checked;
    els.clientMode.checked = true;
    const model = layoutModel(true);
    els.clientMode.checked = wasClient;
    const { tasks, min, days, unit, chartW, groups, show, leftW } = model;
    if (!tasks.length) {
      toast(tr("toastNoExport"));
      return null;
    }

    const rowH = 40;
    const showWeekday = els.showWeekday.checked;
    const shadeWeekend = els.showWeekendShade.checked;
    const headH = showWeekday ? 66 : 48;
    const monthBand = 24;
    const dayBand = 24;
    const weekdayBand = showWeekday ? 18 : 0;
    const groupH = 28;
    let rowsH = 0;
    const flat = [];
    groups.forEach((g) => {
      const items = g.items.filter((t) => !state.excluded.has(taskKey(t)));
      if (!items.length) return;
      if (g.key) {
        flat.push({ kind: "group", key: g.key, phase: items[0] && items[0].phase });
        rowsH += groupH;
      }
      items.forEach((t) => {
        flat.push({ kind: "task", task: t });
        rowsH += rowH;
      });
    });

    const pad = 24;
    const titleH = 56;
    const width = Math.ceil(leftW + chartW + pad * 2);
    const height = Math.ceil(titleH + headH + rowsH + pad * 2);
    const canvas = document.createElement("canvas");
    const scale = Math.min(2, Math.max(1, 1800 / width));
    canvas.width = Math.floor(width * scale);
    canvas.height = Math.floor(height * scale);
    const ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    const title = exportTitle();
    ctx.fillStyle = "#11334f";
    ctx.font = "650 20px Segoe UI, Microsoft JhengHei, sans-serif";
    ctx.fillText(title, pad, pad + 22);
    ctx.fillStyle = "#7a8b9a";
    ctx.font = "13px Segoe UI, Microsoft JhengHei, sans-serif";
    ctx.fillText(scheduleRangeLabel(model.dated), pad, pad + 42);

    const ox = pad;
    const oy = pad + titleH;
    ctx.fillStyle = "#f3f7fa";
    ctx.fillRect(ox, oy, leftW + chartW, headH);
    ctx.strokeStyle = "#d9e1e8";
    ctx.beginPath();
    ctx.moveTo(ox, oy + headH);
    ctx.lineTo(ox + leftW + chartW, oy + headH);
    ctx.stroke();

    if (leftW) {
      ctx.fillStyle = "#11334f";
      ctx.font = "650 13px Segoe UI, Microsoft JhengHei, sans-serif";
      ctx.fillText(tr("ganttTaskCol"), ox + 12, oy + 30);
      ctx.beginPath();
      ctx.moveTo(ox + leftW, oy);
      ctx.lineTo(ox + leftW, oy + headH + rowsH);
      ctx.stroke();
    }

    let mi = 0;
    while (mi < days) {
      const d = addDays(min, mi);
      const key = monthKey(d);
      let span = 0;
      while (mi + span < days && monthKey(addDays(min, mi + span)) === key) span += 1;
      const x = ox + leftW + mi * unit;
      ctx.fillStyle = "#e8f1f8";
      ctx.fillRect(x, oy, span * unit, 24);
      ctx.fillStyle = "#11334f";
      ctx.font = "650 11px Segoe UI, Microsoft JhengHei, sans-serif";
      ctx.fillText(key, x + 6, oy + 16);
      mi += span;
    }
    for (let i = 0; i < days; i += 1) {
      const d = addDays(min, i);
      const x = ox + leftW + i * unit;
      if (shadeWeekend && (d.getDay() === 0 || d.getDay() === 6)) {
        ctx.fillStyle = "#f5f8fb";
        ctx.fillRect(x, oy + monthBand, unit, dayBand + weekdayBand);
      }
      if (els.zoom.value === "day" || i % 7 === 0) {
        ctx.fillStyle = "#7a8b9a";
        ctx.font = "11px Segoe UI, Microsoft JhengHei, sans-serif";
        const label = String(d.getDate());
        const tw = ctx.measureText(label).width;
        ctx.fillText(label, x + unit / 2 - tw / 2, oy + monthBand + 16);
      }
      if (showWeekday) {
        const wd = weekdayLetter(d);
        const dow = d.getDay();
        ctx.fillStyle = dow === 0 ? "#c65442" : dow === 6 ? "#9aa8b5" : "#7a8b9a";
        ctx.font = "650 9px Segoe UI, Microsoft JhengHei, sans-serif";
        const tw = ctx.measureText(wd).width;
        ctx.fillText(wd, x + unit / 2 - tw / 2, oy + monthBand + dayBand + 13);
      }
      ctx.strokeStyle = "#d9e1e8";
      ctx.beginPath();
      ctx.moveTo(x + unit, oy);
      ctx.lineTo(x + unit, oy + headH);
      ctx.stroke();
    }

    let y = oy + headH;
    flat.forEach((row) => {
      if (row.kind === "group") {
        ctx.fillStyle = "#eef4f9";
        ctx.fillRect(ox, y, leftW + chartW, groupH);
        const gcol = colorFor(row.phase);
        ctx.fillStyle = gcol;
        ctx.fillRect(ox, y, 3, groupH);
        if (leftW) {
          ctx.fillStyle = "#11334f";
          ctx.font = "650 12px Segoe UI, Microsoft JhengHei, sans-serif";
          ctx.fillText(row.key, ox + 12, y + 18);
        }
        y += groupH;
        return;
      }
      const t = row.task;
      ctx.strokeStyle = "#eef2f5";
      ctx.beginPath();
      ctx.moveTo(ox, y + rowH);
      ctx.lineTo(ox + leftW + chartW, y + rowH);
      ctx.stroke();
      if (leftW) {
        ctx.fillStyle = t.parent ? "#7a8b9a" : "#11334f";
        ctx.font = "13px Segoe UI, Microsoft JhengHei, sans-serif";
        const label = t.name.length > 28 ? `${t.name.slice(0, 28)}…` : t.name;
        ctx.fillText(label, ox + (t.parent ? 24 : 12), y + 25);
      }
      if (t.start) {
        const left = dayDiff(min, t.start) * unit;
        const span = dayDiff(t.start, t.end);
        const dur = Math.max(1, span + 1);
        const col = colorFor(t.phase);
        const bx = ox + leftW + left;
        const isMilestone = t.type === "Milestone" && span <= 0;
        const w = isMilestone ? Math.max(unit * 0.85, 18) : Math.max(dur * unit - 2, 14);
        // weekend stripes behind bars
        for (let i = 0; i < days; i += 1) {
          const d = addDays(min, i);
          if (shadeWeekend && (d.getDay() === 0 || d.getDay() === 6)) {
            ctx.fillStyle = "#f5f8fb";
            ctx.fillRect(ox + leftW + i * unit, y, unit, rowH);
          }
        }
        ctx.fillStyle = col;
        roundRect(ctx, bx, y + 9, w, 22, 5);
        ctx.fill();
        const range =
          t.end && dayDiff(t.start, t.end) > 0 ? `${fmt(t.start)} → ${fmt(t.end)}` : fmt(t.start);
        let tx = ox + leftW + left + w + 8;
        const parts = [];
        if (show.name) parts.push({ text: t.name, bold: true, color: "#11334f" });
        if (show.dates) parts.push({ text: range, bold: false, color: "#3a5166" });
        if (show.person && t.person) parts.push({ text: t.person.split(",")[0], bold: true, color: "#23649a" });
        if (show.duration && t.duration) parts.push({ text: t.duration, bold: false, color: "#7a8b9a" });
        if (show.phase && t.phase) parts.push({ text: t.phase, bold: false, color: "#7a8b9a" });
        if (show.type && t.type) parts.push({ text: t.type, bold: false, color: "#7a8b9a" });
        if (show.note && t.note) parts.push({ text: t.note.split("\n")[0].slice(0, 40), bold: false, color: "#7a8b9a" });
        parts.forEach((p) => {
          ctx.fillStyle = p.color;
          ctx.font = `${p.bold ? "650 " : ""}12.5px Segoe UI, Microsoft JhengHei, sans-serif`;
          ctx.fillText(p.text, tx, y + 25);
          tx += ctx.measureText(p.text).width + 10;
        });
      }
      y += rowH;
    });

    return { canvas, title };
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function downloadPng() {
    const out = drawFullPng();
    if (!out) return;
    out.canvas.toBlob((blob) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${safeFile(out.title)}-timeline.png`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast(tr("toastPng"));
    }, "image/png");
  }

  function downloadPdfViaImage() {
    const out = drawFullPng();
    if (!out) return;
    const dataUrl = out.canvas.toDataURL("image/png");
    const w = window.open("", "_blank");
    if (!w) {
      toast(tr("toastPopup"));
      return;
    }
    w.document.write(`<!DOCTYPE html><html lang="${lang}"><head><title>${escapeHtml(out.title)}</title>
<style>
  @page { margin: 8mm; size: auto; }
  html, body { margin: 0; background: #fff; }
  img { width: 100%; height: auto; display: block; }
  .tip { font: 13px sans-serif; color: #666; padding: 8px 12px; }
  @media print { .tip { display: none; } }
</style></head><body>
<p class="tip">${escapeHtml(tr("pdfTip"))}</p>
<img src="${dataUrl}" alt="timeline"/>
<script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script>
</body></html>`);
    w.document.close();
  }

  function persistUi() {
    savePrefs();
    render();
  }

  els.dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    els.dropzone.classList.add("drag");
  });
  els.dropzone.addEventListener("dragleave", () => els.dropzone.classList.remove("drag"));
  els.dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    els.dropzone.classList.remove("drag");
    const file = e.dataTransfer.files[0];
    if (file) readFile(file);
  });
  els.dropzone.addEventListener("click", (e) => {
    if (e.target.closest("button, a, input")) return;
    els.fileInput.click();
  });
  els.dropzone.style.cursor = "pointer";
  $("btnBrowse").addEventListener("click", (e) => {
    e.stopPropagation();
    els.fileInput.click();
  });
  els.fileInput.addEventListener("change", () => {
    const file = els.fileInput.files[0];
    if (file) readFile(file);
  });
  ["filterProject", "filterType", "groupBy", "zoom", "hideNoDate", "clientMode", "showLeftCol", "showToday", "showWeekday", "showWeekendShade"].forEach((id) => {
    $(id).addEventListener("change", persistUi);
  });
  document.querySelectorAll("[data-show]").forEach((el) => el.addEventListener("change", persistUi));
  $("btnClearExclude").addEventListener("click", () => {
    state.excluded.clear();
    savePrefs();
    render();
  });
  const btnResetOrder = $("btnResetOrder");
  if (btnResetOrder) {
    btnResetOrder.addEventListener("click", () => {
      state.order = { groups: [], tasks: [] };
      savePrefs();
      render();
      toast(tr("toastOrderReset"));
    });
  }
  els.btnHtml.addEventListener("click", downloadClientHtml);
  els.btnPng.addEventListener("click", downloadPng);
  els.btnPdf.addEventListener("click", downloadPdfViaImage);

  document.querySelectorAll(".lang-btn").forEach((btn) => {
    btn.addEventListener("click", () => setLang(btn.dataset.lang));
  });

  const btnUploadEmpty = $("btnUploadEmpty");
  if (btnUploadEmpty) {
    btnUploadEmpty.addEventListener("click", () => els.fileInput.click());
  }

  applyGlobalPrefs();
  applyStaticI18n();
})();
