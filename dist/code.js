"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __defProps = Object.defineProperties;
  var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };
  var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));

  // src/geometry.ts
  function transform(m, p) {
    return { x: m[0][0] * p.x + m[0][1] * p.y + m[0][2], y: m[1][0] * p.x + m[1][1] * p.y + m[1][2] };
  }
  function inverse(m) {
    const [[a, c, e], [b, d, f]] = m, det = a * d - b * c;
    if (Math.abs(det) < 1e-8) throw Error("The text region has a singular transform. Reset its scale.");
    return [[d / det, -c / det, (c * f - d * e) / det], [-b / det, a / det, (b * e - a * f) / det]];
  }
  function shapePolygon(type, width, height, m, toRegion) {
    const local = type === "ELLIPSE" ? Array.from({ length: 64 }, (_, i) => ({
      x: width / 2 + width / 2 / Math.cos(Math.PI / 64) * Math.cos(i * 2 * Math.PI / 64),
      y: height / 2 + height / 2 / Math.cos(Math.PI / 64) * Math.sin(i * 2 * Math.PI / 64)
    })) : [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }];
    return local.map((p) => transform(toRegion, transform(m, p)));
  }

  // src/shared.ts
  var LIMITS = { characters: 12e3, obstacles: 40, rows: 400, fragments: 800, measurements: 12e3 };

  // src/code.ts
  var OWNER = "dynamic-reflow-pretext-v1";
  var DATA = "reflow-session";
  var LINK = "reflow-output";
  var SOURCE_STATE = "reflow-source-state";
  var session = null;
  var probe = null;
  var live = false;
  var busy = false;
  var revision = 0;
  var padding = 12;
  var lastSignature = "";
  var lastStyle = "";
  var lastSnapshot = null;
  var samples = 0;
  var changes = 0;
  var renders = 0;
  var events = 0;
  var lastMs = 0;
  var latestStatus = { message: "Select one text box and obstacle shapes. Or create a safe demo.", error: false };
  var observedPage = figma.currentPage;
  var panelWidth = 340;
  var panelHeight = 320;
  var operation = Promise.resolve();
  var picking = null;
  var draft = null;
  figma.showUI(__html__, { width: 340, height: 320, themeColors: true });
  figma.root.setRelaunchData({ open: "" });
  function post(message) {
    figma.ui.postMessage(message);
  }
  function status(message, error = false) {
    latestStatus = { message, error };
    post({ type: "status", message, error, live });
  }
  function stats() {
    post({ type: "stats", samples, changes, renders, events, lastMs, revision });
  }
  function own(node, role) {
    return node.getPluginData("owner") === OWNER && (!role || node.getPluginData("role") === role);
  }
  function mark(node, role) {
    node.setPluginData("owner", OWNER);
    node.setPluginData("role", role);
  }
  function stop(message = "Stopped. Output remains editable.") {
    live = false;
    revision++;
    lastSnapshot = null;
    lastSignature = "";
    status(message);
  }
  function discardProbe() {
    if (probe && !probe.removed) probe.remove();
    probe = null;
  }
  function styleKey(source) {
    return JSON.stringify([source.fontName, source.fontSize, source.lineHeight, source.letterSpacing, source.fills, source.textCase, source.textDecoration, source.textAlignHorizontal, source.paragraphIndent, source.paragraphSpacing, source.listSpacing, source.hasMissingFont]);
  }
  function validateSource(source) {
    if (source.characters.length > LIMITS.characters) throw Error("Maximum source length is 12,000 characters. Split the article into regions.");
    if (!source.characters.trim()) throw Error("The selected text region is empty. Add source text first.");
    if (source.hasMissingFont) throw Error("The source uses a missing font. Install or replace that font in Figma first.");
    if (source.fontName === figma.mixed || source.fontSize === figma.mixed || source.lineHeight === figma.mixed || source.letterSpacing === figma.mixed) throw Error("Use one font, font size, line height and letter spacing per source region.");
    if (source.getStyledTextSegments(["fontName", "fontSize", "fills", "textCase", "textDecoration", "letterSpacing", "lineHeight"]).length > 1) throw Error("Mixed text styling is not supported yet. Use one uniform text style per region.");
    if (source.letterSpacing.value !== 0) throw Error("This version requires letter spacing = 0 for accurate Figma/Pretext measurements.");
    if (source.textAlignHorizontal !== "LEFT") throw Error("Set the source text alignment to Left. Center, right and justified text are not supported yet.");
    if (source.textCase !== "ORIGINAL") throw Error("Use Original text case. Text-case transforms would change the measured text.");
    if (source.paragraphIndent || source.paragraphSpacing || source.listSpacing || source.getStyledTextSegments(["listOptions"]).some((s) => s.listOptions.type !== "NONE")) throw Error("Remove paragraph indent, paragraph spacing and lists from the source region for this first version.");
    if (source.width < 10 || source.height < 10) throw Error("Resize the source text box to a region at least 10 \xD7 10 px.");
    for (let n = source.parent; n && n.type !== "PAGE"; n = n.parent) if (n.type === "INSTANCE") throw Error("Text inside an instance is unsupported. Duplicate it outside the instance first.");
  }
  async function setupProbe(source) {
    validateSource(source);
    const font = source.fontName;
    try {
      await figma.loadFontAsync(font);
    } catch (e) {
      throw Error(`Cannot load ${font.family} ${font.style}. Install the font or choose another face.`);
    }
    discardProbe();
    probe = source.clone();
    figma.currentPage.appendChild(probe);
    mark(probe, "measurement");
    probe.name = "Dynamic Reflow \xB7 temporary font measurement";
    probe.setPluginData(LINK, "");
    probe.visible = false;
    probe.locked = true;
    probe.textAutoResize = "WIDTH_AND_HEIGHT";
    probe.textTruncation = "DISABLED";
    probe.maxLines = null;
    probe.characters = "Mg";
    probe.x = -1e5;
    probe.y = -1e5;
    lastStyle = styleKey(source);
  }
  function lineHeight(source) {
    const h = source.lineHeight;
    return Math.max((probe == null ? void 0 : probe.height) || 1, h.unit === "PIXELS" ? h.value : h.unit === "PERCENT" ? source.fontSize * h.value / 100 : (probe == null ? void 0 : probe.height) || 1);
  }
  function polygons(s) {
    const inv = inverse(s.source.absoluteTransform);
    return s.obstacles.filter((n) => !n.removed && n.visible).map((n) => {
      if (n.type === "RECTANGLE" || n.type === "ELLIPSE") return shapePolygon(n.type, n.width, n.height, n.absoluteTransform, inv);
      const b = n.absoluteBoundingBox;
      if (!b) return [];
      return [{ x: b.x, y: b.y }, { x: b.x + b.width, y: b.y }, { x: b.x + b.width, y: b.y + b.height }, { x: b.x, y: b.y + b.height }].map((p) => transform(inv, p));
    }).filter((p) => p.length > 0);
  }
  function effectivePadding(s) {
    const inv = inverse(s.source.absoluteTransform);
    let stroke = 0;
    for (const n of s.obstacles) {
      if (n.removed || !n.visible) continue;
      if ("strokeWeight" in n && typeof n.strokeWeight === "number" && "strokes" in n && n.strokes.length) {
        const m = n.absoluteTransform;
        const a = transform(inv, { x: m[0][0], y: m[1][0] }), o = transform(inv, { x: 0, y: 0 });
        const b = transform(inv, { x: m[0][1], y: m[1][1] });
        stroke = Math.max(stroke, n.strokeWeight * Math.max(Math.hypot(a.x - o.x, a.y - o.y), Math.hypot(b.x - o.x, b.y - o.y)));
      }
    }
    return padding + stroke + 0.5;
  }
  async function tick(force = false) {
    var _a;
    if (!session || !live && !force || busy) return;
    busy = true;
    try {
      const s = session;
      samples++;
      if (figma.currentPage.id !== s.page.id) {
        stop("Stopped: the current page changed. Return to the source page and start again.");
        return;
      }
      if (s.source.removed) {
        stop("Stopped: the source text was deleted. Existing output remains.");
        return;
      }
      const key = styleKey(s.source);
      validateSource(s.source);
      if (key !== lastStyle || !probe || probe.removed) {
        await setupProbe(s.source);
      }
      if (session !== s) return;
      const geometry = polygons(s), height = lineHeight(s.source);
      const next = { styleKey: key, text: s.source.characters, fontSize: s.source.fontSize, width: s.source.width, height: s.source.height, lineHeight: height, padding: effectivePadding(s), polygons: geometry };
      const signature = JSON.stringify([next, s.source.absoluteTransform, (_a = s.source.parent) == null ? void 0 : _a.id, s.obstacles.map((n) => n.removed ? "removed" : n.id)]);
      if (force || signature !== lastSignature) {
        changes++;
        lastSignature = signature;
        revision++;
        lastSnapshot = __spreadValues({ revision }, next);
        post({ type: "snapshot", snapshot: lastSnapshot });
      }
      stats();
    } catch (error) {
      stop();
      status(String(error instanceof Error ? error.message : error), true);
    } finally {
      busy = false;
    }
  }
  function boundMessage(s) {
    return { type: "bound", text: s.source.characters, padding, sourceName: s.source.name, obstacles: s.obstacles.length, shapeNames: s.obstacles.filter((n) => !n.removed).map((n) => n.name) };
  }
  function currentCandidate() {
    const selected = figma.currentPage.selection.filter((n) => !own(n));
    const texts = selected.filter((n) => n.type === "TEXT");
    const shapes = selected.filter((n) => n.type !== "TEXT");
    return { sourceName: texts.length === 1 ? texts[0].name : null, shapeNames: shapes.map((n) => n.name), ready: texts.length === 1 && shapes.length > 0 };
  }
  function postDraft() {
    if (!draft) return;
    const source = draft.source && !draft.source.removed ? draft.source : null;
    const obstacles = draft.obstacles.filter((n) => !n.removed);
    post({ type: "selection", sourceName: picking === "text" ? null : (source == null ? void 0 : source.name) || null, shapeNames: picking === "shape" ? [] : obstacles.map((n) => n.name), ready: !picking && !!source && obstacles.length > 0, picking, staged: true });
  }
  async function beginPick(kind) {
    var _a;
    if (kind !== "text" && kind !== "shape") throw Error("choose text or shape.");
    if (live) stop();
    if (picking === kind) {
      picking = null;
      if (draft && session && ((_a = draft.source) == null ? void 0 : _a.id) === session.source.id && JSON.stringify(draft.obstacles.map((n) => n.id)) === JSON.stringify(session.obstacles.map((n) => n.id))) {
        draft = null;
        await selectionState();
      } else postDraft();
      return;
    }
    if (!draft) {
      if (!session && figma.currentPage.selection.length === 1) {
        const selected2 = figma.currentPage.selection[0];
        let n = selected2, resume = false;
        while (n && n.type !== "PAGE") {
          if (readSaved(n)) {
            resume = true;
            break;
          }
          n = n.parent;
        }
        if (selected2.type === "TEXT" && (selected2.getPluginData(LINK) || selected2.getPluginData(SOURCE_STATE))) resume = true;
        if (resume) await bind();
      }
      const selected = figma.currentPage.selection.filter((n) => !own(n));
      const texts = selected.filter((n) => n.type === "TEXT");
      draft = session ? { source: session.source, obstacles: [...session.obstacles] } : { source: texts.length === 1 ? texts[0] : null, obstacles: selected.filter((n) => n.type !== "TEXT") };
    }
    picking = kind;
    postDraft();
  }
  async function selectionChanged() {
    if (picking && draft) {
      const selected = figma.currentPage.selection.filter((n) => !own(n));
      if (picking === "text") {
        const texts = selected.filter((n) => n.type === "TEXT");
        if (texts.length !== 1) {
          postDraft();
          return;
        }
        draft.source = texts[0];
      } else {
        const shapes = selected.filter((n) => n.type !== "TEXT");
        if (!shapes.length) {
          postDraft();
          return;
        }
        draft.obstacles = shapes;
      }
      picking = null;
      postDraft();
      return;
    }
    if (draft && currentCandidate().ready) {
      const selected = figma.currentPage.selection.filter((n) => !own(n));
      draft = { source: selected.find((n) => n.type === "TEXT") || null, obstacles: selected.filter((n) => n.type !== "TEXT") };
    }
    await selectionState();
  }
  var selectionRevision = 0;
  async function selectionState() {
    const request = ++selectionRevision;
    if (draft) {
      postDraft();
      return;
    }
    const candidate = currentCandidate();
    if (candidate.ready) {
      post(__spreadValues({ type: "selection" }, candidate));
      return;
    }
    if (session && !session.source.removed && session.page.id === figma.currentPage.id) {
      post({ type: "selection", sourceName: session.source.name, shapeNames: session.obstacles.filter((n) => !n.removed).map((n) => n.name), ready: true });
      return;
    }
    const selected = figma.currentPage.selection;
    if (selected.length === 1) {
      let node = selected[0], saved = null;
      while (node && node.type !== "PAGE") {
        saved = readSaved(node);
        if (saved) break;
        node = node.parent;
      }
      if (!saved && selected[0].type === "TEXT") {
        const id = selected[0].getPluginData(LINK);
        if (id) {
          const output = await figma.getNodeByIdAsync(id);
          if (output) saved = readSaved(output);
        }
        if (!saved) {
          try {
            const backup = JSON.parse(selected[0].getPluginData(SOURCE_STATE));
            if (backup.sourceId === selected[0].id) saved = backup;
          } catch (e) {
          }
        }
      }
      if (saved) {
        const source = await figma.getNodeByIdAsync(saved.sourceId);
        const shapes = [];
        for (const id of saved.obstacleIds) {
          const n = await figma.getNodeByIdAsync(id);
          if (n && "absoluteTransform" in n) shapes.push(n);
        }
        if (request !== selectionRevision) return;
        if (source && source.type === "TEXT") {
          post({ type: "selection", sourceName: source.name, shapeNames: shapes.map((n) => n.name), ready: true });
          return;
        }
      }
    }
    if (request === selectionRevision) post(__spreadValues({ type: "selection" }, candidate));
  }
  function readSaved(frame) {
    if (frame.type !== "FRAME" || !own(frame, "output")) return null;
    try {
      const d = JSON.parse(frame.getPluginData(DATA));
      return d.version === 1 && typeof d.sourceId === "string" && Array.isArray(d.obstacleIds) ? d : null;
    } catch (e) {
      return null;
    }
  }
  async function bind(override) {
    var _a;
    stop("Loading selection\u2026");
    const selection = override || figma.currentPage.selection;
    let output = null, saved = null;
    if (selection.length === 1) {
      let n = selection[0];
      while (n && n.type !== "PAGE") {
        saved = readSaved(n);
        if (saved) {
          output = n;
          break;
        }
        n = n.parent;
      }
      if (!saved && selection[0].type === "TEXT") {
        const linked = await figma.getNodeByIdAsync(selection[0].getPluginData(LINK));
        if (linked) {
          saved = readSaved(linked);
          if ((saved == null ? void 0 : saved.sourceId) !== selection[0].id) saved = null;
          if (saved) output = linked;
        } else {
          try {
            const backup = JSON.parse(selection[0].getPluginData(SOURCE_STATE));
            if (backup.version === 1 && backup.sourceId === selection[0].id && Array.isArray(backup.obstacleIds)) saved = backup;
          } catch (e) {
          }
        }
      }
    }
    let source, obstacles;
    if (saved) {
      const n = await figma.getNodeByIdAsync(saved.sourceId);
      if (!n || n.type !== "TEXT") throw Error("This output\u2019s source is missing. Select a new text region and shapes.");
      source = n;
      obstacles = [];
      for (const id of saved.obstacleIds) {
        const o = await figma.getNodeByIdAsync(id);
        if (o && "absoluteTransform" in o) obstacles.push(o);
      }
      padding = saved.padding;
      if (typeof saved.sourceOpacity !== "number") saved.sourceOpacity = source.opacity;
    } else {
      const texts = selection.filter((n) => n.type === "TEXT" && !own(n));
      if (texts.length !== 1) throw Error("Select exactly one source text box and at least one obstacle shape, then press Start reflow. Or select a previous output to resume.");
      source = texts[0];
      obstacles = selection.filter((n) => n.id !== source.id);
      if (!obstacles.length) throw Error("Select the text box plus one or more obstacle shapes.");
      if (obstacles.some((n) => own(n))) throw Error("Generated output cannot be an obstacle. Select original shapes.");
      for (const o of obstacles) {
        let n = source.parent;
        while (n) {
          if (n.id === o.id) throw Error("An obstacle cannot contain the source text. Select shapes beside the text.");
          n = n.parent;
        }
      }
      saved = { version: 1, sourceId: source.id, obstacleIds: obstacles.map((n) => n.id), sourceVisible: source.visible, sourceOpacity: source.opacity, padding };
      try {
        const backup = JSON.parse(source.getPluginData(SOURCE_STATE));
        if (backup.sourceId === source.id && typeof backup.sourceOpacity === "number") {
          saved.sourceOpacity = backup.sourceOpacity;
          saved.sourceVisible = backup.sourceVisible;
        }
      } catch (e) {
      }
      const link = source.getPluginData(LINK);
      if (link) {
        const old = await figma.getNodeByIdAsync(link);
        if (old && old.type === "FRAME" && ((_a = readSaved(old)) == null ? void 0 : _a.sourceId) === source.id) output = old;
      }
    }
    if (obstacles.length > LIMITS.obstacles) throw Error("Use at most 40 obstacle shapes per region.");
    await setupProbe(source);
    session = { source, obstacles, page: figma.currentPage, output, saved };
    lastSignature = "";
    draft = null;
    picking = null;
    post(boundMessage(session));
    status("Ready. Start live reflow, then move or resize the selected shapes.");
  }
  function createOutput(s) {
    const frame = figma.createFrame();
    mark(frame, "output");
    frame.name = "Dynamic Reflow \xB7 editable lines";
    frame.fills = [];
    frame.clipsContent = false;
    frame.setRelaunchData({ open: "" });
    s.output = frame;
    return frame;
  }
  function persist(s) {
    if (!s.output) return;
    s.saved.padding = padding;
    s.output.setPluginData(DATA, JSON.stringify(s.saved));
    s.source.setPluginData(LINK, s.output.id);
    s.source.setPluginData(SOURCE_STATE, JSON.stringify(s.saved));
  }
  async function render(snapshot, fragments, overflow, measurements) {
    var _a;
    if (!session || !lastSnapshot || snapshot.revision !== revision || !live) return;
    const s = session, start = Date.now();
    if (s.source.removed) {
      stop("Source deleted.");
      return;
    }
    if (styleKey(s.source) !== snapshot.styleKey || s.source.characters !== snapshot.text) return;
    const nowNext = { styleKey: snapshot.styleKey, text: s.source.characters, fontSize: s.source.fontSize, width: s.source.width, height: s.source.height, lineHeight: lineHeight(s.source), padding: effectivePadding(s), polygons: polygons(s) };
    const nowSig = JSON.stringify([nowNext, s.source.absoluteTransform, (_a = s.source.parent) == null ? void 0 : _a.id, s.obstacles.map((n) => n.removed ? "removed" : n.id)]);
    if (nowSig !== lastSignature) {
      void tick(true);
      return;
    }
    if (fragments.length > LIMITS.fragments) throw Error("Too many generated lines.");
    if (s.output && !s.output.removed) {
      const fonts = /* @__PURE__ */ new Map();
      for (const n of s.output.children) if (n.type === "TEXT" && own(n, "line"))
        for (const segment of n.getStyledTextSegments(["fontName"])) fonts.set(JSON.stringify(segment.fontName), segment.fontName);
      for (const font of fonts.values()) {
        try {
          await figma.loadFontAsync(font);
        } catch (e) {
          throw Error(`Cannot load the previous output font ${font.family} ${font.style}. Restore that font or remove output and regenerate.`);
        }
      }
    }
    if (snapshot.revision !== revision || !live || session !== s) return;
    const frame = s.output && !s.output.removed ? s.output : createOutput(s);
    frame.resize(snapshot.width, snapshot.height);
    frame.relativeTransform = s.source.absoluteTransform;
    frame.visible = true;
    const owned = frame.children.filter((n) => n.type === "TEXT" && own(n, "line"));
    let used = 0;
    for (const f of fragments) {
      if (!f.text) continue;
      if (![f.x, f.y, f.slotWidth].every(Number.isFinite) || f.x < 0 || f.y < 0 || f.x + f.slotWidth > snapshot.width + 0.01 || f.y + snapshot.lineHeight > snapshot.height + 0.01) throw Error("Invalid layout coordinates.");
      let line = owned[used];
      if (!line) {
        line = s.source.clone();
        frame.appendChild(line);
        mark(line, "line");
        line.setPluginData(LINK, "");
        line.locked = false;
        line.visible = true;
        line.opacity = s.saved.sourceOpacity;
      }
      line.opacity = s.saved.sourceOpacity;
      line.visible = true;
      line.fontName = s.source.fontName;
      line.fontSize = s.source.fontSize;
      line.fills = JSON.parse(JSON.stringify(s.source.fills));
      line.lineHeight = s.source.lineHeight;
      line.textDecoration = s.source.textDecoration;
      line.textAutoResize = "WIDTH_AND_HEIGHT";
      line.textTruncation = "DISABLED";
      line.maxLines = null;
      line.relativeTransform = [[1, 0, f.x], [0, 1, f.y]];
      if (line.characters !== f.text) line.characters = f.text;
      if (line.width > f.slotWidth + 0.01) throw Error("Native text exceeded its measured slot. Stop and regenerate; try a different font.");
      line.name = `Line ${used + 1} \xB7 ${f.text.slice(0, 32)}`;
      used++;
    }
    for (const extra of owned.slice(used)) extra.remove();
    s.source.opacity = 0;
    persist(s);
    renders++;
    lastMs = Date.now() - start;
    status(`Live \xB7 ${used} text fragments${overflow ? " \xB7 OVERFLOW: enlarge the source box" : ""} \xB7 ${measurements} font measurements`);
    stats();
  }
  async function measure(message) {
    if (!session || !probe || probe.removed || message.styleKey !== lastStyle) throw Error("Source style changed; retrying the latest layout.");
    if (!Array.isArray(message.texts) || message.texts.length > LIMITS.measurements) throw Error("Invalid measurement batch.");
    const active = probe, values = /* @__PURE__ */ Object.create(null);
    for (let i = 0; i < message.texts.length; i++) {
      const text = message.texts[i];
      if (typeof text !== "string" || text.length > LIMITS.characters) throw Error("Invalid measurement text.");
      if (active.removed || active !== probe) throw Error("Measurement cancelled.");
      active.characters = text || " ";
      values[text] = { width: text ? active.width : 0 };
      if (i % 100 === 99) await new Promise((resolve) => setTimeout(resolve, 0));
    }
    active.characters = "Mg";
    post({ type: "metrics", requestId: message.requestId, values });
  }
  async function cleanup() {
    draft = null;
    picking = null;
    stop();
    if (!session) throw Error("Load a previous output or its source first.");
    const s = session, frame = s.output;
    if (frame && !frame.removed) {
      for (const n of [...frame.children]) if (own(n, "line")) n.remove();
      if (!frame.children.length) frame.remove();
      else {
        frame.setPluginData(DATA, "");
        frame.setPluginData("owner", "");
        frame.name = "Preserved user content \xB7 former reflow frame";
        frame.visible = true;
      }
    }
    if (!s.source.removed) {
      s.source.visible = s.saved.sourceVisible;
      s.source.opacity = s.saved.sourceOpacity;
      s.source.setPluginData(LINK, "");
      s.source.setPluginData(SOURCE_STATE, "");
    }
    discardProbe();
    session = null;
    post({ type: "unbound" });
    status("Generated output removed. Source text and obstacle shapes preserved.");
    figma.commitUndo();
    await selectionState();
  }
  async function demo() {
    draft = null;
    picking = null;
    stop();
    await figma.loadFontAsync({ family: "Inter", style: "Regular" });
    const right = Math.max(figma.viewport.center.x, ...figma.currentPage.children.map((n) => n.absoluteBoundingBox ? n.absoluteBoundingBox.x + n.absoluteBoundingBox.width : 0));
    const demo2 = figma.createFrame();
    demo2.name = "Dynamic Reflow \xB7 safe demo";
    demo2.resize(720, 780);
    demo2.x = right + 120;
    demo2.y = figma.viewport.center.y - 390;
    demo2.fills = [{ type: "SOLID", color: { r: 0.97, g: 0.96, b: 0.92 } }];
    const text = figma.createText();
    demo2.appendChild(text);
    text.fontName = { family: "Inter", style: "Regular" };
    text.fontSize = 18;
    text.lineHeight = { unit: "PIXELS", value: 27 };
    text.characters = "Move the shapes and watch these words find a new path. This is editable Figma text, laid out by Cheng Lou\u2019s Pretext engine using font widths measured inside Figma. The shapes remain yours: drag, rotate or resize them while the plugin stays open.\n\nThe full article stays in its original source layer. Generated line fragments can be edited after stopping live reflow. Keep writing, keep moving, and let the page respond.\n\n".repeat(3);
    text.textAutoResize = "NONE";
    text.resize(624, 684);
    text.x = 48;
    text.y = 48;
    text.name = "Source \xB7 resize this text box";
    const ellipse = figma.createEllipse();
    demo2.appendChild(ellipse);
    ellipse.resize(200, 200);
    ellipse.x = 240;
    ellipse.y = 100;
    ellipse.name = "Move me \xB7 ellipse";
    ellipse.fills = [{ type: "SOLID", color: { r: 0.95, g: 0.36, b: 0.16 } }];
    const rect = figma.createRectangle();
    demo2.appendChild(rect);
    rect.resize(140, 150);
    rect.x = 455;
    rect.y = 420;
    rect.rotation = 16;
    rect.name = "Resize me \xB7 rectangle";
    rect.fills = [{ type: "SOLID", color: { r: 0.22, g: 0.34, b: 0.85 } }];
    figma.currentPage.selection = [text, ellipse, rect];
    figma.viewport.scrollAndZoomIntoView([demo2]);
    await bind();
    status("Demo ready. Start live reflow, then drag the orange ellipse or resize the blue rectangle.");
  }
  var pageListener = (event) => {
    if (!session) return;
    const ids = /* @__PURE__ */ new Set([session.source.id, ...session.obstacles.map((n) => n.id)]);
    events += event.nodeChanges.filter((c) => ids.has(c.id)).length;
  };
  observedPage.on("nodechange", pageListener);
  figma.on("selectionchange", () => {
    void selectionChanged();
  });
  figma.on("currentpagechange", () => {
    observedPage.off("nodechange", pageListener);
    observedPage = figma.currentPage;
    observedPage.on("nodechange", pageListener);
    stop("Stopped: page changed.");
    discardProbe();
    session = null;
    draft = null;
    picking = null;
    post({ type: "unbound" });
    void selectionState();
  });
  figma.on("close", () => {
    discardProbe();
  });
  setInterval(() => {
    void tick();
  }, 120);
  figma.ui.onmessage = (message) => {
    if (message.type === "stop") {
      stop();
      figma.commitUndo();
      return;
    }
    operation = operation.then(async () => {
      switch (message.type) {
        case "ui-ready":
          if (session && !session.source.removed) post(boundMessage(session));
          await selectionState();
          post(__spreadProps(__spreadValues({ type: "status" }, latestStatus), { live }));
          stats();
          break;
        case "resize":
          if (Number.isFinite(message.width)) panelWidth = Math.max(280, Math.min(800, Math.round(message.width)));
          if (Number.isFinite(message.height)) panelHeight = Math.max(280, Math.min(1e3, Math.round(message.height)));
          figma.ui.resize(panelWidth, panelHeight);
          break;
        case "pick":
          await beginPick(message.kind);
          break;
        case "start-selection":
          if (picking) throw Error("finish selecting the layer on the canvas first.");
          if (draft) {
            if (!draft.source || draft.source.removed || !draft.obstacles.length) throw Error("select a text layer and a shape first.");
            await bind([draft.source, ...draft.obstacles.filter((n) => !n.removed)]);
          } else if (currentCandidate().ready || !session) await bind();
          live = true;
          status("Preparing live reflow\u2026");
          await tick(true);
          break;
        case "bind":
          await bind();
          break;
        case "demo":
          await demo();
          break;
        case "start":
          if (!session) throw Error("Select a text layer and shape, or choose More \u2192 Create demo.");
          live = true;
          status("Preparing live reflow\u2026");
          await tick(true);
          break;
        case "padding":
          if (!Number.isFinite(message.value) || message.value < 0 || message.value > 200) throw Error("Padding must be between 0 and 200 px.");
          padding = message.value;
          if (session) persist(session);
          if (live) await tick(true);
          break;
        case "apply-text":
          if (!session) throw Error("Load a source first.");
          if (typeof message.text !== "string" || message.text.length > LIMITS.characters) throw Error("Maximum text length is 12,000 characters.");
          await figma.loadFontAsync(session.source.fontName);
          session.source.characters = message.text;
          if (live) await tick(true);
          else status("Source text updated. Start live reflow to regenerate.");
          break;
        case "metrics-request":
          try {
            await measure(message);
          } catch (e) {
            post({ type: "metrics-error", requestId: message.requestId, message: String(e) });
          }
          break;
        case "layout":
          await render(message.snapshot, message.fragments, message.overflow, message.measurements);
          break;
        case "layout-error":
          if (message.revision === revision) {
            stop();
            status(message.message, true);
          }
          break;
        case "cleanup":
          await cleanup();
          break;
        case "edit-source":
          if (!session) throw Error("Load a source first.");
          stop("Source revealed. Edit it on the canvas, then start live reflow.");
          session.source.visible = true;
          session.source.opacity = session.saved.sourceOpacity;
          if (session.output && !session.output.removed) session.output.visible = false;
          figma.currentPage.selection = [session.source];
          break;
        case "regenerate":
          if (!session) throw Error("Load a source first.");
          live = true;
          status("Preparing live reflow\u2026");
          await tick(true);
          break;
      }
    }).catch((error) => {
      stop();
      status(error instanceof Error ? error.message : String(error), true);
    });
  };
  status("Select one text box and obstacle shapes. Or create a safe demo.");
})();
