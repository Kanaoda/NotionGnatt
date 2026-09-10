(function () {
  const STORAGE_KEY = "notion-timeline-exporter-v2";
  const ROLES = [
    ["name", "任務名稱"],
    ["dates", "日期區間"],
    ["phase", "階段 Phase"],
    ["type", "類型 Type"],
    ["project", "專案"],
    ["person", "負責人"],
    ["duration", "工期"],
    ["parent", "上層任務"],
    ["note", "備註"]
  ];

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
    "Fab-Site Work": "#d7ae7c"
  };

  const state = {
    headers: [],
    rows: [],
    mapping: {},
    tasks: [],
    excluded: new Set(),
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
      groupBy: els.groupBy.value,
      zoom: els.zoom.value,
      hideNoDate: els.hideNoDate.checked,
      clientMode: els.clientMode.checked
    };
    if (state.schemaKey) {
      prefs.schemas = prefs.schemas || {};
      prefs.schemas[state.schemaKey] = {
        mapping: { ...state.mapping },
        filterProject: els.filterProject.value,
        filterType: els.filterType.value,
        excluded: [...state.excluded]
      };
    }
    prefs.excludedByName = [...new Set([...(prefs.excludedByName || []), ...state.excluded])];
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
    for (const [role] of ROLES) {
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

  function colorFor(phase) {
    if (PHASE_COLORS[phase]) return PHASE_COLORS[phase];
    let hash = 0;
    for (const ch of phase) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    const hues = [12, 28, 48, 160, 200, 250, 280];
    return `hsl(${hues[hash % hues.length]} 45% 78%)`;
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
      `<option value="__all__">全部專案</option>` +
      projects.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
    const typeOpts = [`<option value="__all__">全部類型</option>`];
    if (types.some((t) => t === "Milestone" || t === "Task")) {
      typeOpts.push(`<option value="__work__">Milestone + Task</option>`);
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
    els.mapGrid.innerHTML = ROLES.map(([role, label]) => {
      const opts = [`<option value="">（不使用）</option>`]
        .concat(
          state.headers.map(
            (h) =>
              `<option value="${escapeHtml(h)}" ${state.mapping[role] === h ? "selected" : ""}>${escapeHtml(h)}</option>`
          )
        )
        .join("");
      return `<label>${escapeHtml(label)}<select data-role="${role}">${opts}</select></label>`;
    }).join("");
    els.mapGrid.querySelectorAll("select").forEach((sel) => {
      sel.addEventListener("change", () => {
        state.mapping[sel.dataset.role] = sel.value;
        buildTasks();
        fillFilters(true);
        savePrefs();
        render();
        toast("欄位對應已更新");
      });
    });
  }

  function renderExcludeList() {
    const names = [...state.excluded].sort();
    els.excludeStat.textContent = names.length ? `已隱藏 ${names.length} 個項目` : "尚未隱藏任何項目";
    els.excludeList.innerHTML = names
      .map((key) => {
        const label = key.includes("::") ? key.split("::").slice(1).join("::") : key;
        return `<span class="exclude-chip"><span class="x-name" title="${escapeHtml(label)}">${escapeHtml(label)}</span><button type="button" data-restore="${escapeHtml(key)}" title="恢復顯示">×</button></span>`;
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
    if (mode === "none") return [{ key: "", items: tasks }];
    const map = new Map();
    for (const t of tasks) {
      const key = mode === "project" ? t.project : t.phase;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(t);
    }
    return [...map.entries()].map(([key, items]) => {
      items.sort((a, b) => {
        if (a.start && b.start) return a.start - b.start || a.name.localeCompare(b.name);
        if (a.start) return -1;
        if (b.start) return 1;
        return a.name.localeCompare(b.name);
      });
      return { key, items };
    });
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
    const labelPad = 460;
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
      show: shownFields()
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

  function render() {
    const model = layoutModel(false);
    const { tasks, dated, min, days, unit, chartW, groups, show } = model;
    const excludedInFilter = filteredPool().filter((t) => state.excluded.has(taskKey(t))).length;
    els.stat.textContent = els.clientMode.checked
      ? `客戶視角 · ${tasks.length} 個項目${excludedInFilter ? `（另有 ${excludedInFilter} 個已隱藏）` : ""}`
      : `${tasks.length} 個項目 · ${dated.length} 個已排期${excludedInFilter ? ` · ${excludedInFilter} 個交付時隱藏` : ""}`;

    renderExcludeList();

    if (!tasks.length) {
      els.gantt.innerHTML = `<div style="padding:32px;color:#8a857a;font-size:13px">目前的篩選條件下沒有項目。請調整左側「檢視範圍」。</div>`;
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
    for (let i = 0; i < days; i += 1) {
      const d = addDays(min, i);
      const weekend = d.getDay() === 0 || d.getDay() === 6;
      const label = els.zoom.value === "day" ? String(d.getDate()) : i % 7 === 0 ? String(d.getDate()) : "";
      dayCells.push(
        `<div class="day-cell${weekend ? " weekend" : ""}" style="width:${unit}px">${label}</div>`
      );
    }

    const today = startOfDay(new Date());
    const todayOffset = dayDiff(min, today);
    const todayLine =
      todayOffset >= 0 && todayOffset <= days
        ? `<div class="today" style="left:${todayOffset * unit + unit / 2}px"></div>`
        : "";

    const noLeft = !els.showLeftCol.checked;
    els.gantt.classList.toggle("no-left", noLeft);

    const head = `<div class="gantt-head">
      <div class="left-cell">任務</div>
      <div class="time-head" style="width:${chartW}px">
        <div class="month-row">${months
          .map((m) => `<div class="month-cell" style="width:${m.span * unit}px">${escapeHtml(m.key)}</div>`)
          .join("")}</div>
        <div class="day-row">${dayCells.join("")}</div>
      </div>
    </div>`;

    const body = groups
      .map((g) => {
        const groupItems = els.clientMode.checked
          ? g.items.filter((t) => !state.excluded.has(taskKey(t)))
          : g.items;
        if (!groupItems.length) return "";
        const groupRow = g.key
          ? `<div class="group-row"><div class="group-label">${escapeHtml(g.key)}</div><div class="bars" style="width:${chartW}px;height:28px;background:#f3efe6"></div></div>`
          : "";
        const rows = groupItems
          .map((t) => {
            const key = taskKey(t);
            const excluded = state.excluded.has(key);
            let bar = "";
            if (t.start) {
              const left = dayDiff(min, t.start) * unit;
              const dur = Math.max(1, dayDiff(t.start, t.end) + 1);
              const w = Math.max(dur * unit - 2, 10);
              const cls =
                t.type === "Payment-In" || /payment/i.test(t.type)
                  ? "payment"
                  : t.type === "Milestone"
                    ? "milestone"
                    : "";
              const range =
                t.end && dayDiff(t.start, t.end) > 0 ? `${fmt(t.start)} → ${fmt(t.end)}` : fmt(t.start);
              bar = `<div class="item" style="left:${left}px">
                <div class="bar ${cls}" style="width:${w}px;background:${colorFor(t.phase)}"></div>
                <div class="bar-label">${labelBits(t, show, range)}</div>
              </div>`;
            }
            const indent = t.parent ? " indent" : "";
            const hideBtn = els.showLeftCol.checked
              ? `<button type="button" class="hide-btn${excluded ? " is-hidden" : ""}" data-toggle="${escapeHtml(key)}" title="${excluded ? "此項目不會出現在交付內容，點擊恢復" : "交付時隱藏此項目"}">${excluded ? "已隱藏" : "隱藏"}</button>`
              : "";
            return `<div class="gantt-row${excluded ? " row-excluded" : ""}">
              <div class="left-cell${indent}">${hideBtn}<span class="task-title" title="${escapeHtml(t.name)}">${escapeHtml(t.name)}</span></div>
              <div class="bars" style="width:${chartW}px">${todayLine}${bar}</div>
            </div>`;
          })
          .join("");
        return groupRow + rows;
      })
      .join("");

    els.gantt.innerHTML = head + body;
    els.gantt.querySelectorAll("[data-toggle]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.toggle;
        if (state.excluded.has(key)) state.excluded.delete(key);
        else state.excluded.add(key);
        savePrefs();
        render();
      });
    });
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
    const fromGlobal = prefs.excludedByName || [];
    state.excluded = new Set([...fromSchema, ...fromGlobal].filter(Boolean));
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
    fillFilters(false);
    renderMapping();
    showWorkspace(true);
    savePrefs();
    render();
    toast("匯入完成，已套用先前的設定");
  }

  function readFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      loadGrid(parseCsv(String(reader.result || "")));
      const fn = $("fileName");
      if (fn) {
        fn.textContent = `已匯入：${file.name}`;
        fn.classList.remove("hidden");
      }
    };
    reader.readAsText(file, "utf-8");
  }

  function exportTitle() {
    return els.filterProject.value === "__all__" ? "Project Timeline" : els.filterProject.value;
  }

  function clientHtmlCss() {
    return `:root{--paper:#fffdf8;--ink:#1c1914;--muted:#6b6458;--line:#e4ddd2;--row-h:40px;--left-w:300px;--font:"Segoe UI","PingFang TC","Noto Sans TC","Microsoft JhengHei",sans-serif}
*{box-sizing:border-box}body{margin:0;font-family:var(--font);background:#fff;color:var(--ink)}
.export-head{padding:16px 24px 0}.export-head h1{margin:0 0 4px;font-size:20px}.export-head p{margin:0;color:#6b6458;font-size:13px}
.gantt-wrap{margin:16px;overflow:auto}.gantt{min-width:100%}
.gantt-head,.gantt-row,.group-row{display:grid;grid-template-columns:var(--left-w) 1fr}
.gantt.no-left{--left-w:0px}.gantt.no-left .left-cell,.gantt.no-left .group-label{display:none}
.gantt.no-left .gantt-head,.gantt.no-left .gantt-row,.gantt.no-left .group-row{grid-template-columns:1fr}
.gantt-head{background:#faf7f1;border-bottom:1px solid var(--line)}
.left-cell,.group-label{background:var(--paper);border-right:1px solid var(--line);padding:0 12px;display:flex;align-items:center;height:var(--row-h);font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gantt-head .left-cell{font-weight:650;height:48px}.group-label{background:#efe8d9;font-weight:650;height:28px;font-size:12px}
.indent .task-title{padding-left:14px;color:var(--muted)}.time-head{height:48px}
.month-row,.day-row{display:flex;height:24px}
.month-cell,.day-cell{border-right:1px solid var(--line);font-size:11px;color:var(--muted);display:flex;align-items:center;justify-content:center;flex:0 0 auto}
.month-cell{font-weight:650;color:var(--ink);background:#f3efe6}.weekend{background:#f6f2ea}
.gantt-row .left-cell{border-bottom:1px solid #f0ebe3}
.bars{position:relative;height:var(--row-h);border-bottom:1px solid #f0ebe3}
.item{position:absolute;top:8px;display:flex;align-items:center;gap:8px}
.bar{flex:0 0 auto;height:24px;border-radius:6px;min-width:8px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.08)}
.bar-label{display:flex;align-items:center;gap:8px;white-space:nowrap;font-size:12.5px}
.bar-label .name{font-weight:650}.bar-label .dates{color:#5c564c}.bar-label .meta{color:var(--muted)}
.tag{font-size:11px;background:#e8eef8;color:#2c4a7c;border-radius:999px;padding:2px 7px;font-weight:650}
.today{position:absolute;top:0;bottom:0;width:2px;background:#c0392b}`;
  }

  function downloadClientHtml() {
    const wasClient = els.clientMode.checked;
    els.clientMode.checked = true;
    render();
    const clone = els.gantt.cloneNode(true);
    clone.querySelectorAll(".hide-btn").forEach((n) => n.remove());
    clone.querySelectorAll(".row-excluded").forEach((n) => n.remove());
    const title = exportTitle();
    const html = `<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="UTF-8"/><title>${escapeHtml(title)}</title><style>${clientHtmlCss()}</style></head><body>
<div class="export-head"><h1>${escapeHtml(title)}</h1><p>專案時間軸 · ${escapeHtml(new Date().toISOString().slice(0, 10))}</p></div>
<main class="gantt-wrap">${clone.outerHTML}</main></body></html>`;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${safeFile(title)}-client.html`;
    a.click();
    URL.revokeObjectURL(a.href);
    els.clientMode.checked = wasClient;
    render();
    toast("已匯出互動網頁（隱藏項目不會出現）");
  }

  function drawFullPng() {
    const wasClient = els.clientMode.checked;
    els.clientMode.checked = true;
    const model = layoutModel(true);
    els.clientMode.checked = wasClient;
    const { tasks, min, days, unit, chartW, groups, show, leftW } = model;
    if (!tasks.length) {
      toast("目前的篩選條件下沒有可交付的項目");
      return null;
    }

    const rowH = 40;
    const headH = 48;
    const groupH = 28;
    let rowsH = 0;
    const flat = [];
    groups.forEach((g) => {
      const items = g.items.filter((t) => !state.excluded.has(taskKey(t)));
      if (!items.length) return;
      if (g.key) {
        flat.push({ kind: "group", key: g.key });
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
    ctx.fillStyle = "#fffdf8";
    ctx.fillRect(0, 0, width, height);

    const title = exportTitle();
    ctx.fillStyle = "#1c1914";
    ctx.font = "650 20px Segoe UI, Microsoft JhengHei, sans-serif";
    ctx.fillText(title, pad, pad + 22);
    ctx.fillStyle = "#6b6458";
    ctx.font = "13px Segoe UI, Microsoft JhengHei, sans-serif";
    ctx.fillText(`專案時間軸 · ${new Date().toISOString().slice(0, 10)}`, pad, pad + 42);

    const ox = pad;
    const oy = pad + titleH;
    ctx.fillStyle = "#faf7f1";
    ctx.fillRect(ox, oy, leftW + chartW, headH);
    ctx.strokeStyle = "#e4ddd2";
    ctx.beginPath();
    ctx.moveTo(ox, oy + headH);
    ctx.lineTo(ox + leftW + chartW, oy + headH);
    ctx.stroke();

    if (leftW) {
      ctx.fillStyle = "#1c1914";
      ctx.font = "650 13px Segoe UI, Microsoft JhengHei, sans-serif";
      ctx.fillText("任務", ox + 12, oy + 30);
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
      ctx.fillStyle = "#f3efe6";
      ctx.fillRect(x, oy, span * unit, 24);
      ctx.fillStyle = "#1c1914";
      ctx.font = "650 11px Segoe UI, Microsoft JhengHei, sans-serif";
      ctx.fillText(key, x + 6, oy + 16);
      mi += span;
    }
    for (let i = 0; i < days; i += 1) {
      const d = addDays(min, i);
      const x = ox + leftW + i * unit;
      if (d.getDay() === 0 || d.getDay() === 6) {
        ctx.fillStyle = "#f6f2ea";
        ctx.fillRect(x, oy + 24, unit, 24);
      }
      if (els.zoom.value === "day" || i % 7 === 0) {
        ctx.fillStyle = "#6b6458";
        ctx.font = "11px Segoe UI, Microsoft JhengHei, sans-serif";
        ctx.fillText(String(d.getDate()), x + unit / 2 - 4, oy + 40);
      }
      ctx.strokeStyle = "#e4ddd2";
      ctx.beginPath();
      ctx.moveTo(x + unit, oy);
      ctx.lineTo(x + unit, oy + headH);
      ctx.stroke();
    }

    let y = oy + headH;
    flat.forEach((row) => {
      if (row.kind === "group") {
        ctx.fillStyle = "#efe8d9";
        ctx.fillRect(ox, y, leftW + chartW, groupH);
        if (leftW) {
          ctx.fillStyle = "#1c1914";
          ctx.font = "650 12px Segoe UI, Microsoft JhengHei, sans-serif";
          ctx.fillText(row.key, ox + 12, y + 18);
        }
        y += groupH;
        return;
      }
      const t = row.task;
      ctx.strokeStyle = "#f0ebe3";
      ctx.beginPath();
      ctx.moveTo(ox, y + rowH);
      ctx.lineTo(ox + leftW + chartW, y + rowH);
      ctx.stroke();
      if (leftW) {
        ctx.fillStyle = t.parent ? "#6b6458" : "#1c1914";
        ctx.font = "13px Segoe UI, Microsoft JhengHei, sans-serif";
        const label = t.name.length > 28 ? `${t.name.slice(0, 28)}…` : t.name;
        ctx.fillText(label, ox + (t.parent ? 24 : 12), y + 25);
      }
      if (t.start) {
        const left = dayDiff(min, t.start) * unit;
        const dur = Math.max(1, dayDiff(t.start, t.end) + 1);
        const w = Math.max(dur * unit - 2, 10);
        const col = colorFor(t.phase);
        ctx.fillStyle = col.startsWith("#") ? col : col;
        roundRect(ctx, ox + leftW + left, y + 8, w, 24, 6);
        ctx.fill();
        const range =
          t.end && dayDiff(t.start, t.end) > 0 ? `${fmt(t.start)} → ${fmt(t.end)}` : fmt(t.start);
        let tx = ox + leftW + left + w + 8;
        const parts = [];
        if (show.name) parts.push({ text: t.name, bold: true, color: "#1c1914" });
        if (show.dates) parts.push({ text: range, bold: false, color: "#5c564c" });
        if (show.person && t.person) parts.push({ text: t.person.split(",")[0], bold: true, color: "#2c4a7c" });
        if (show.duration && t.duration) parts.push({ text: t.duration, bold: false, color: "#6b6458" });
        if (show.phase && t.phase) parts.push({ text: t.phase, bold: false, color: "#6b6458" });
        if (show.type && t.type) parts.push({ text: t.type, bold: false, color: "#6b6458" });
        if (show.note && t.note) parts.push({ text: t.note.split("\n")[0].slice(0, 40), bold: false, color: "#6b6458" });
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
      toast("已匯出完整圖片");
    }, "image/png");
  }

  function downloadPdfViaImage() {
    const out = drawFullPng();
    if (!out) return;
    const dataUrl = out.canvas.toDataURL("image/png");
    const w = window.open("", "_blank");
    if (!w) {
      toast("瀏覽器阻擋了彈出視窗，請允許後重試，或改用「匯出圖片」");
      return;
    }
    w.document.write(`<!DOCTYPE html><html><head><title>${escapeHtml(out.title)}</title>
<style>
  @page { margin: 8mm; size: auto; }
  html, body { margin: 0; background: #fff; }
  img { width: 100%; height: auto; display: block; }
  .tip { font: 13px sans-serif; color: #666; padding: 8px 12px; }
  @media print { .tip { display: none; } }
</style></head><body>
<p class="tip">請在列印對話框選「另存 PDF」，並關閉頁首頁尾。這是一整張長圖，不會被橫向斬開。</p>
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
  $("btnBrowse").addEventListener("click", () => els.fileInput.click());
  els.fileInput.addEventListener("change", () => {
    const file = els.fileInput.files[0];
    if (file) readFile(file);
  });
  ["filterProject", "filterType", "groupBy", "zoom", "hideNoDate", "clientMode", "showLeftCol"].forEach((id) => {
    $(id).addEventListener("change", persistUi);
  });
  document.querySelectorAll("[data-show]").forEach((el) => el.addEventListener("change", persistUi));
  $("btnClearExclude").addEventListener("click", () => {
    state.excluded.clear();
    savePrefs();
    render();
  });
  els.btnHtml.addEventListener("click", downloadClientHtml);
  els.btnPng.addEventListener("click", downloadPng);
  els.btnPdf.addEventListener("click", downloadPdfViaImage);
  function loadSample() {
    fetch("sample/project-tasks.csv")
      .then((r) => {
        if (!r.ok) throw new Error("missing");
        return r.text();
      })
      .then((text) => {
        loadGrid(parseCsv(text));
        const fn = $("fileName");
        if (fn) {
          fn.textContent = "已載入範例資料";
          fn.classList.remove("hidden");
        }
      })
      .catch(() => {
        alert("瀏覽器限制無法直接讀取範例檔。請把 sample/project-tasks.csv 拖進左側「資料來源」。");
      });
  }
  $("btnSample").addEventListener("click", loadSample);
  const btnSampleEmpty = $("btnSampleEmpty");
  if (btnSampleEmpty) btnSampleEmpty.addEventListener("click", loadSample);

  applyGlobalPrefs();
})();
