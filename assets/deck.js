/* ===== 드림주스 슬라이드 덱 엔진 =====
 * - 발표: ← → / Space / PageUp·PageDown / Home·End, 화면 좌우 클릭, 터치 스와이프
 * - F: 전체화면, E: 편집 모드, ?: 단축키 도움말
 * - 편집: 클릭=선택, 드래그=이동, 위쪽 동그라미=회전, 오른쪽 아래 네모=크기, 더블클릭=글자 수정
 * - 편집 내용은 이 브라우저(localStorage)에 자동 저장되고, "HTML 저장"으로 파일을 받아 저장소에 커밋하면 모두에게 반영됨
 */
(function () {
  "use strict";

  const W = 1280, H = 720;
  const stage = document.querySelector(".stage");
  const slides = Array.from(stage.querySelectorAll(":scope > .slide"));
  const deckId = document.body.dataset.deck || location.pathname;
  const STORE_KEY = "deck-edits:" + deckId;

  let cur = 0;
  let editing = false;
  let selected = null;
  let textEditing = null;
  let state = {};               // oid -> { x, y, r, s, html }
  const orig = {};              // oid -> { x, y, r, s, html }
  const undoStack = [];
  const COLORS = [["#ff3b30", "빨강"], ["#ffcc00", "노랑"], ["#34c759", "초록"], ["#0a84ff", "파랑"], ["#1d1916", "검정"]];
  let tool = null;              // null | "pointer" | "laser" | "pen"

  /* ---------- 객체 수집 ---------- */
  const objects = [];
  slides.forEach((slide, si) => {
    slide.dataset.num = si + 1 + " / " + slides.length;
    let n = 0;
    const collect = (container) => {
      for (const el of Array.from(container.children)) {
        if (el.classList.contains("bg")) continue;
        if (el.classList.contains("layout")) { collect(el); continue; }
        el.dataset.oid = "s" + (si + 1) + "-" + (n++);
        objects.push(el);
      }
    };
    collect(slide);
  });
  stage.querySelectorAll("img").forEach((img) => img.setAttribute("draggable", "false"));

  // 원본 해시 (원본이 바뀌면 예전 로컬 편집은 버림)
  const baseHash = hash(stage.innerHTML);

  objects.forEach((el) => {
    orig[el.dataset.oid] = {
      x: +el.dataset.x || 0, y: +el.dataset.y || 0,
      r: +el.dataset.r || 0, s: +el.dataset.s || 1,
      html: el.innerHTML,
    };
  });
  const byId = (oid) => stage.querySelector('[data-oid="' + oid + '"]');

  /* ---------- 저장/불러오기 ---------- */
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.base !== baseHash) {
        localStorage.removeItem(STORE_KEY);
        setTimeout(() => toast("원본 파일이 바뀌어 이전 로컬 편집 내용을 지웠습니다"), 300);
        return;
      }
      state = data.state || {};
      applyAll();
    } catch (e) { /* 저장소를 못 쓰는 환경이면 무시 */ }
  }
  function save() {
    try {
      if (Object.keys(state).length) localStorage.setItem(STORE_KEY, JSON.stringify({ base: baseHash, state }));
      else localStorage.removeItem(STORE_KEY);
    } catch (e) { /* ignore */ }
  }
  function get(oid) { return Object.assign({}, orig[oid], state[oid] || {}); }
  function set(oid, patch) {
    const next = Object.assign(get(oid), patch);
    const o = orig[oid];
    const diff = {};
    for (const k of ["x", "y", "r", "s", "html"]) if (next[k] !== o[k]) diff[k] = next[k];
    if (Object.keys(diff).length) state[oid] = diff; else delete state[oid];
  }
  function applyOne(el) {
    const v = get(el.dataset.oid);
    if (el.innerHTML !== v.html && el !== textEditing) el.innerHTML = v.html;
    const t = transformOf(v);
    el.style.transform = t;
    for (const k of ["x", "y", "r", "s"]) {
      const def = k === "s" ? 1 : 0;
      if (v[k] !== def) el.dataset[k] = round(v[k], k === "s" ? 3 : 1); else delete el.dataset[k];
    }
  }
  function applyAll() { objects.forEach(applyOne); }
  function transformOf(v) {
    if (!v.x && !v.y && !v.r && v.s === 1) return "";
    return "translate(" + round(v.x) + "px," + round(v.y) + "px) rotate(" + round(v.r) + "deg) scale(" + round(v.s, 3) + ")";
  }
  function pushUndo() {
    undoStack.push(JSON.stringify(state));
    if (undoStack.length > 100) undoStack.shift();
  }
  function undo() {
    if (!undoStack.length) return toast("되돌릴 내용이 없습니다");
    endTextEdit();
    state = JSON.parse(undoStack.pop());
    applyAll(); save(); placeOverlay();
  }

  /* ---------- 화면 맞춤 ---------- */
  function fit() {
    const k = Math.min(window.innerWidth / W, window.innerHeight / H);
    stage.style.setProperty("--k", k);
    placeOverlay();
  }
  const scale = () => parseFloat(stage.style.getPropertyValue("--k")) || 1;

  /* ---------- 이동 ---------- */
  function go(i, fromHash) {
    i = Math.max(0, Math.min(slides.length - 1, i));
    if (i === cur && slides[i].classList.contains("active")) return;
    endTextEdit(); select(null);
    slides[cur].classList.remove("active");
    clearLaser(true);
    cur = i;
    slides[cur].classList.add("active");
    ui.count.textContent = cur + 1 + " / " + slides.length;
    ui.progress.style.width = ((cur + 1) / slides.length) * 100 + "%";
    if (!fromHash) history.replaceState(null, "", "#" + (cur + 1));
  }
  const next = () => go(cur + 1);
  const prev = () => go(cur - 1);
  function fromHash() {
    const n = parseInt(location.hash.replace(/[^0-9]/g, ""), 10);
    return isNaN(n) ? 0 : n - 1;
  }

  /* ---------- UI ---------- */
  const ui = buildUI();
  function buildUI() {
    const root = document.createElement("div");
    root.id = "deck-ui";
    root.innerHTML =
      '<div class="deck-progress"></div>' +
      '<div class="deck-bar" role="toolbar" aria-label="슬라이드 조작">' +
      '<button data-act="home" title="강의 목록으로 (H)">목록</button>' +
      '<span class="sep"></span>' +
      '<button data-act="prev" title="이전 (←)">◀</button>' +
      '<span class="count"></span>' +
      '<button data-act="next" title="다음 (→)">▶</button>' +
      '<span class="sep tool-grp"></span>' +
      '<button class="tool-grp" data-act="tool" data-tool="pointer" title="레이저 포인터 (L)">포인터</button>' +
      '<button class="tool-grp" data-act="tool" data-tool="laser" title="레이저 펜: 그린 선이 잠시 뒤 사라짐 (K)">레이저펜</button>' +
      '<button class="tool-grp" data-act="tool" data-tool="pen" title="펜: 그린 선이 남음 (P)">펜</button>' +
      '<span class="colors tool-only">' + COLORS.map((c) =>
        '<button class="sw" data-act="color" data-c="' + c[0] + '" style="--c:' + c[0] + '" title="' + c[1] + '" aria-label="' + c[1] + '"></button>').join("") + "</span>" +
      '<button class="tool-only" data-act="clearInk" title="이 슬라이드의 펜 자국 지우기 (C)">지우기</button>' +
      '<span class="sep"></span>' +
      '<button data-act="full" title="전체화면 (F)">전체화면</button>' +
      '<button data-act="edit" title="편집 모드 (E)">편집</button>' +
      '<button class="edit-only" data-act="undo" title="되돌리기 (Ctrl+Z)">되돌리기</button>' +
      '<button class="edit-only" data-act="resetObj" title="선택한 개체 원위치">원위치</button>' +
      '<button class="edit-only" data-act="export" title="수정된 HTML 파일 다운로드">HTML 저장</button>' +
      '<button class="edit-only" data-act="resetAll" title="모든 편집 지우기">전체 초기화</button>' +
      '<button data-act="help" title="도움말 (?)">?</button>' +
      "</div>" +
      '<div class="deck-toast"></div>' +
      '<div class="deck-help"><div class="box">' +
      "<h4>발표</h4><table>" +
      "<tr><td><kbd>→</kbd> <kbd>Space</kbd> <kbd>PageDown</kbd></td><td>다음 슬라이드</td></tr>" +
      "<tr><td><kbd>←</kbd> <kbd>PageUp</kbd></td><td>이전 슬라이드</td></tr>" +
      "<tr><td><kbd>Home</kbd> / <kbd>End</kbd></td><td>처음 / 마지막</td></tr>" +
      "<tr><td>화면 오른쪽·왼쪽 클릭</td><td>다음 / 이전</td></tr>" +
      "<tr><td><kbd>F</kbd></td><td>전체화면</td></tr>" +
      "<tr><td><kbd>H</kbd> 또는 <b>목록</b> 버튼</td><td>강의 목록(첫 화면)으로</td></tr>" +
      "</table><h4>가리키기 · 그리기</h4><table>" +
      "<tr><td><kbd>L</kbd> 포인터</td><td>레이저 포인터로 가리키기</td></tr>" +
      "<tr><td><kbd>K</kbd> 레이저펜</td><td>누른 채 그리면 잠시 뒤 사라짐</td></tr>" +
      "<tr><td><kbd>P</kbd> 펜</td><td>누른 채 그리면 계속 남음</td></tr>" +
      "<tr><td><kbd>C</kbd> 지우기 · <kbd>Ctrl</kbd>+<kbd>Z</kbd></td><td>이 슬라이드 펜 자국 지우기 · 마지막 획 지우기</td></tr>" +
      "<tr><td><kbd>Esc</kbd> 또는 같은 버튼</td><td>도구 끄기</td></tr>" +
      "</table><h4>편집 (<kbd>E</kbd>로 켜고 끄기)</h4><table>" +
      "<tr><td>클릭 후 드래그</td><td>개체 이동 (방향키: 1px, Shift+방향키: 10px)</td></tr>" +
      "<tr><td>위쪽 동그라미 드래그</td><td>회전 (Shift: 15° 단위)</td></tr>" +
      "<tr><td>오른쪽 아래 네모 드래그</td><td>크기 조절</td></tr>" +
      "<tr><td>더블클릭</td><td>글자 수정 (Esc 또는 바깥 클릭으로 끝)</td></tr>" +
      "<tr><td><kbd>Ctrl</kbd>+<kbd>Z</kbd></td><td>되돌리기</td></tr>" +
      "</table><p class=\"muted\" style=\"margin:0\">편집 내용은 이 브라우저에만 자동 저장됩니다. 모두에게 보이게 하려면 <b>HTML 저장</b>으로 받은 파일을 저장소의 같은 위치에 덮어쓰고 커밋하세요.</p>" +
      "</div></div>";
    document.body.appendChild(root);
    const bar = root.querySelector(".deck-bar");
    bar.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      e.stopPropagation();
      actions[b.dataset.act](b);
      b.blur();
    });
    const help = root.querySelector(".deck-help");
    help.addEventListener("click", (e) => { if (e.target === help) help.classList.remove("show"); });
    return {
      root, bar, help,
      count: bar.querySelector(".count"),
      progress: root.querySelector(".deck-progress"),
      editBtn: bar.querySelector('[data-act="edit"]'),
      toast: root.querySelector(".deck-toast"),
    };
  }

  const actions = {
    prev, next,
    home() {
      if (textEditing) endTextEdit();
      if (document.fullscreenElement) document.exitFullscreen();
      location.href = "../index.html";
    },
    full() {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
    },
    edit() { setEditing(!editing); },
    undo,
    resetObj() {
      if (!selected) return toast("먼저 개체를 클릭해 선택하세요");
      pushUndo();
      delete state[selected.dataset.oid];
      applyOne(selected); save(); placeOverlay();
    },
    resetAll() {
      if (!Object.keys(state).length) return toast("편집한 내용이 없습니다");
      if (!confirm("이 강의의 모든 편집 내용을 지울까요?")) return;
      pushUndo();
      endTextEdit();
      state = {};
      applyAll(); save(); placeOverlay();
      toast("편집 내용을 모두 지웠습니다 (Ctrl+Z로 되돌리기)");
    },
    export: exportHTML,
    tool(b) { setTool(tool === b.dataset.tool ? null : b.dataset.tool); },
    color(b) { setColor(b.dataset.c); },
    clearInk,
    help() { ui.help.classList.toggle("show"); },
  };

  let toastTimer;
  function toast(msg) {
    ui.toast.textContent = msg;
    ui.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ui.toast.classList.remove("show"), 2200);
  }

  // 발표 중 마우스가 멈추면 툴바 숨김
  let idleTimer;
  function wake(e) {
    if (tool && e && e.clientY < window.innerHeight - 110 && ui.bar.classList.contains("idle")) return;
    ui.bar.classList.remove("idle");
    document.body.style.cursor = "";
    clearTimeout(idleTimer);
    if (!editing) idleTimer = setTimeout(() => {
      ui.bar.classList.add("idle");
      if (document.fullscreenElement && !tool) document.body.style.cursor = "none";
    }, 2500);
  }
  window.addEventListener("mousemove", wake);

  /* ---------- 편집 모드 ---------- */
  function setEditing(on) {
    if (on && tool) setTool(null, true);
    editing = on;
    document.body.classList.toggle("editing", on);
    ui.editBtn.classList.toggle("on", on);
    ui.editBtn.textContent = on ? "편집 끝" : "편집";
    if (!on) { endTextEdit(); select(null); }
    toast(on ? "편집 모드: 드래그=이동 · 더블클릭=글자 수정 · ?=도움말" : "발표 모드");
    wake();
  }

  const overlay = document.createElement("div");
  overlay.className = "obj-overlay";
  overlay.innerHTML = '<div class="h h-rot" data-h="rot" title="회전"></div><div class="h h-scale" data-h="scale" title="크기"></div>';

  function select(el) {
    if (selected) selected.classList.remove("is-selected");
    selected = el;
    if (el) el.classList.add("is-selected");
    if (!el) { overlay.remove(); return; }
    el.closest(".slide").appendChild(overlay);
    placeOverlay();
  }
  function placeOverlay() {
    if (!selected || !overlay.isConnected) return;
    const slide = selected.closest(".slide");
    let x = 0, y = 0, n = selected;
    while (n && n !== slide) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    const v = get(selected.dataset.oid);
    Object.assign(overlay.style, {
      left: x + "px", top: y + "px",
      width: selected.offsetWidth + "px", height: selected.offsetHeight + "px",
      transform: transformOf(v),
    });
    overlay.style.setProperty("--hs", (1 / v.s / scale()).toFixed(3));
  }

  function startTextEdit(el) {
    if (textEditing === el) return;
    endTextEdit();
    if (!el.textContent.trim()) return; // 이미지 등 글자가 없는 개체
    pushUndo();
    textEditing = el;
    el.contentEditable = "true";
    el.classList.add("is-editing");
    el.focus();
  }
  function endTextEdit() {
    const el = textEditing;
    if (!el) return;
    textEditing = null;
    el.removeAttribute("contenteditable");
    el.classList.remove("is-editing");
    const oid = el.dataset.oid;
    const before = get(oid).html;
    if (el.innerHTML !== before) { set(oid, { html: el.innerHTML }); save(); }
    else undoStack.pop(); // 변화 없음 → 쌓아둔 되돌리기 지점 취소
    window.getSelection && window.getSelection().removeAllRanges();
  }

  /* 포인터: 이동 / 회전 / 크기 */
  let drag = null;
  stage.addEventListener("pointerdown", (e) => {
    if (!editing || e.button !== 0) return;
    const handle = e.target.closest(".obj-overlay .h");
    const el = handle ? selected : e.target.closest(".slide.active [data-oid]");
    if (!el) { endTextEdit(); select(null); return; }
    if (el === textEditing && !handle) return; // 글자 편집 중엔 커서 이동/드래그 선택 허용
    if (textEditing && el !== textEditing) endTextEdit();
    e.preventDefault();
    if (selected !== el) select(el);
    const v = get(el.dataset.oid);
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    drag = {
      el, kind: handle ? handle.dataset.h : "move", v, moved: false,
      sx: e.clientX, sy: e.clientY, cx, cy,
      a0: Math.atan2(e.clientY - cy, e.clientX - cx),
      d0: Math.hypot(e.clientX - cx, e.clientY - cy) || 1,
      pid: e.pointerId,
    };
  });
  stage.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (!drag.moved) {
      if (Math.hypot(dx, dy) < 3) return;
      drag.moved = true;
      try { stage.setPointerCapture(drag.pid); } catch (err) { /* ignore */ }
      pushUndo();
      document.body.classList.add("dragging");
    }
    const oid = drag.el.dataset.oid, v = drag.v, k = scale();
    if (drag.kind === "move") {
      set(oid, { x: v.x + dx / k, y: v.y + dy / k });
    } else if (drag.kind === "rot") {
      let r = v.r + ((Math.atan2(e.clientY - drag.cy, e.clientX - drag.cx) - drag.a0) * 180) / Math.PI;
      r = ((r + 540) % 360) - 180;
      if (e.shiftKey) r = Math.round(r / 15) * 15;
      else if (Math.abs(r) < 2) r = 0; // 0° 근처는 똑바로
      set(oid, { r });
    } else if (drag.kind === "scale") {
      const d = Math.hypot(e.clientX - drag.cx, e.clientY - drag.cy);
      set(oid, { s: Math.max(0.2, Math.min(5, v.s * (d / drag.d0))) });
    }
    applyOne(drag.el); placeOverlay();
  });
  const endDrag = () => {
    if (!drag) return;
    if (drag.moved) save();
    drag = null;
    document.body.classList.remove("dragging");
  };
  stage.addEventListener("pointerup", endDrag);
  stage.addEventListener("pointercancel", endDrag);

  stage.addEventListener("dblclick", (e) => {
    if (!editing) return;
    const el = e.target.closest(".slide.active [data-oid]");
    if (!el) return;
    startTextEdit(el);
    // 더블클릭한 위치에 커서 놓기
    if (document.caretRangeFromPoint) {
      const r = document.caretRangeFromPoint(e.clientX, e.clientY);
      if (r) { const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
    }
  });
  // 붙여넣기는 서식 없이 글자만
  stage.addEventListener("paste", (e) => {
    if (!textEditing) return;
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData("text/plain");
    document.execCommand("insertText", false, text);
  });
  stage.addEventListener("input", () => placeOverlay());

  /* 발표 모드: 화면 클릭으로 넘기기 */
  stage.addEventListener("click", (e) => {
    if (tool === "laser" || tool === "pen") { e.preventDefault(); return; }
    if (editing) { if (e.target.closest("a")) e.preventDefault(); return; } // 편집 중엔 링크로 이동하지 않음
    if (e.target.closest("a")) return;
    const x = e.clientX / window.innerWidth;
    if (x > 0.35) next(); else prev();
  });

  /* 터치 스와이프 */
  let touch = null;
  stage.addEventListener("touchstart", (e) => { touch = editing || tool === "laser" || tool === "pen" ? null : e.touches[0]; }, { passive: true });
  stage.addEventListener("touchend", (e) => {
    if (!touch || editing) return;
    const dx = e.changedTouches[0].clientX - touch.clientX;
    if (Math.abs(dx) > 50) { dx < 0 ? next() : prev(); }
    touch = null;
  });

  /* ---------- 키보드 ---------- */
  window.addEventListener("keydown", (e) => {
    if (textEditing) {
      if (e.key === "Escape") { e.preventDefault(); endTextEdit(); }
      return; // 글자 편집 중에는 나머지 단축키 무시
    }
    if (e.target.closest && e.target.closest("input, textarea, [contenteditable]")) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "z") {
      if (editing) { e.preventDefault(); undo(); }
      else if (tool) { e.preventDefault(); undoInk(); }
      return;
    }
    if (mod || e.altKey) return;

    if (editing && selected && e.key.startsWith("Arrow")) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1, v = get(selected.dataset.oid);
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (!e.repeat) pushUndo();
      set(selected.dataset.oid, { x: v.x + d[0], y: v.y + d[1] });
      applyOne(selected); placeOverlay(); save();
      return;
    }
    if (editing && selected && e.key === "Enter") { e.preventDefault(); startTextEdit(selected); return; }
    if (e.key === "Escape") {
      if (ui.help.classList.contains("show")) return ui.help.classList.remove("show");
      if (selected) return select(null);
      if (tool) return setTool(null);
      return;
    }
    switch (e.key) {
      case "ArrowRight": case "ArrowDown": case "PageDown": case " ": case "Enter":
        e.preventDefault(); next(); break;
      case "ArrowLeft": case "ArrowUp": case "PageUp": case "Backspace":
        e.preventDefault(); prev(); break;
      case "Home": e.preventDefault(); go(0); break;
      case "End": e.preventDefault(); go(slides.length - 1); break;
      case "f": case "F": actions.full(); break;
      case "h": case "H": actions.home(); break;
      case "e": case "E": actions.edit(); break;
      case "l": case "L": setTool(tool === "pointer" ? null : "pointer"); break;
      case "k": case "K": setTool(tool === "laser" ? null : "laser"); break;
      case "p": case "P": setTool(tool === "pen" ? null : "pen"); break;
      case "c": case "C": clearInk(); break;
      case "?": actions.help(); break;
    }
  });

  /* ---------- HTML 내보내기 ---------- */
  function exportHTML() {
    endTextEdit();
    const doc = document.documentElement.cloneNode(true);
    const kill = (sel) => doc.querySelectorAll(sel).forEach((n) => n.remove());
    kill("#deck-ui"); kill(".obj-overlay"); kill(".ink-layer");
    doc.querySelector("body").classList.remove("tool-on", "tool-pointer", "tool-laser", "tool-pen");
    doc.querySelector("body").classList.remove("editing", "dragging");
    doc.querySelector("body").style.cursor = "";
    if (!doc.querySelector("body").getAttribute("class")) doc.querySelector("body").removeAttribute("class");
    if (!doc.querySelector("body").getAttribute("style")) doc.querySelector("body").removeAttribute("style");
    const st = doc.querySelector(".stage");
    st.style.removeProperty("--k");
    if (!st.getAttribute("style")) st.removeAttribute("style");
    doc.querySelectorAll(".slide").forEach((s) => { s.classList.remove("active"); s.removeAttribute("data-num"); });
    doc.querySelectorAll("[data-oid]").forEach((n) => {
      n.removeAttribute("data-oid");
      n.classList.remove("is-editing", "is-selected");
      if (!n.getAttribute("class")) n.removeAttribute("class");
      if (!n.getAttribute("style")) n.removeAttribute("style");
    });
    doc.querySelectorAll('img[draggable="false"]').forEach((n) => n.removeAttribute("draggable"));
    const html = "<!DOCTYPE html>\n" + doc.outerHTML + "\n";
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "index.html";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast("index.html 다운로드 — 저장소의 이 강의 폴더에 덮어쓰고 커밋하세요");
  }

  /* ---------- 레이저 포인터 / 레이저 펜 / 펜 ---------- */
  const INK_KEY = "deck-ink:" + deckId;
  const SVGNS = "http://www.w3.org/2000/svg";
  let color = COLORS[0][0];
  let ink = {};                 // 슬라이드 번호 -> [{ c, w, p: [[x, y], ...] }]
  let stroke = null, laserTimer = null;
  const inkLayers = slides.map((s) => {
    const svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("class", "ink-layer");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    s.appendChild(svg);
    return svg;
  });
  const dot = document.createElement("div");
  dot.className = "laser-dot";
  ui.root.appendChild(dot);

  function setTool(t, quiet) {
    if (t && editing) setEditing(false);
    tool = t;
    document.body.classList.remove("tool-on", "tool-pointer", "tool-laser", "tool-pen");
    if (t) document.body.classList.add("tool-on", "tool-" + t);
    ui.bar.querySelectorAll('[data-act="tool"]').forEach((b) => b.classList.toggle("on", b.dataset.tool === t));
    if (t !== "pointer") dot.classList.remove("show");
    if (!quiet) toast(t ? { pointer: "레이저 포인터", laser: "레이저 펜: 그린 선이 잠시 뒤 사라집니다", pen: "펜: 그린 선이 남습니다 (C: 지우기)" }[t] + " · Esc로 끄기" : "도구 끔");
  }
  function setColor(c) {
    color = c;
    document.body.style.setProperty("--pen", c);
    ui.bar.querySelectorAll(".sw").forEach((b) => b.classList.toggle("on", b.dataset.c === c));
  }
  setColor(color);

  function toLocal(e) {
    const r = stage.getBoundingClientRect();
    return [round(((e.clientX - r.left) * W) / r.width, 1), round(((e.clientY - r.top) * H) / r.height, 1)];
  }
  function pathD(p) {
    if (p.length === 1) return "M" + p[0][0] + " " + p[0][1] + "l0.01 0";
    let d = "M" + p[0][0] + " " + p[0][1];
    for (let i = 1; i < p.length - 1; i++) {
      d += "Q" + p[i][0] + " " + p[i][1] + " " + round((p[i][0] + p[i + 1][0]) / 2, 1) + " " + round((p[i][1] + p[i + 1][1]) / 2, 1);
    }
    const l = p[p.length - 1];
    return d + "L" + l[0] + " " + l[1];
  }
  function makePath(s, laser) {
    const el = document.createElementNS(SVGNS, "path");
    el.setAttribute("d", pathD(s.p));
    el.setAttribute("stroke", s.c);
    el.setAttribute("stroke-width", s.w);
    if (laser) { el.setAttribute("class", "laser"); el.style.setProperty("--c", s.c); }
    return el;
  }
  function renderInk(i) {
    inkLayers[i].querySelectorAll("path:not(.laser)").forEach((n) => n.remove());
    (ink[i] || []).forEach((s) => inkLayers[i].appendChild(makePath(s, false)));
  }
  function loadInk() {
    try {
      const data = JSON.parse(localStorage.getItem(INK_KEY) || "null");
      if (!data || data.base !== baseHash) return;
      ink = data.ink || {};
      Object.keys(ink).forEach((i) => inkLayers[i] && renderInk(+i));
    } catch (e) { /* ignore */ }
  }
  function saveInk() {
    try {
      Object.keys(ink).forEach((i) => { if (!ink[i].length) delete ink[i]; });
      if (Object.keys(ink).length) localStorage.setItem(INK_KEY, JSON.stringify({ base: baseHash, ink }));
      else localStorage.removeItem(INK_KEY);
    } catch (e) { /* ignore */ }
  }
  function clearInk() {
    clearLaser(true);
    if (!(ink[cur] || []).length) return toast("이 슬라이드에는 지울 펜 자국이 없습니다");
    delete ink[cur]; renderInk(cur); saveInk();
    toast("이 슬라이드의 펜 자국을 지웠습니다");
  }
  function undoInk() {
    if (!(ink[cur] || []).length) return toast("지울 펜 자국이 없습니다");
    ink[cur].pop(); renderInk(cur); saveInk();
  }
  function clearLaser(now) {
    clearTimeout(laserTimer);
    const paths = stage.querySelectorAll(".ink-layer path.laser");
    if (now) return paths.forEach((n) => n.remove());
    paths.forEach((n) => n.classList.add("fade"));
    laserTimer = setTimeout(() => paths.forEach((n) => n.remove()), 700);
  }

  stage.addEventListener("pointerdown", (e) => {
    if ((tool !== "laser" && tool !== "pen") || e.button !== 0) return;
    e.preventDefault();
    clearTimeout(laserTimer);
    stage.querySelectorAll(".ink-layer path.laser.fade").forEach((n) => n.remove());
    const s = { c: color, w: tool === "pen" ? 4 : 5, p: [toLocal(e)] };
    const el = makePath(s, tool === "laser");
    inkLayers[cur].appendChild(el);
    stroke = { s, el, laser: tool === "laser", pid: e.pointerId };
    try { stage.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  });
  stage.addEventListener("pointermove", (e) => {
    if (tool === "pointer") {
      dot.classList.add("show");
      dot.style.transform = "translate(" + e.clientX + "px," + e.clientY + "px)";
    }
    if (!stroke || e.pointerId !== stroke.pid) return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of evs.length ? evs : [e]) {
      const pt = toLocal(ev), last = stroke.s.p[stroke.s.p.length - 1];
      if (Math.hypot(pt[0] - last[0], pt[1] - last[1]) >= 1) stroke.s.p.push(pt);
    }
    stroke.el.setAttribute("d", pathD(stroke.s.p));
  });
  const endStroke = (e) => {
    if (!stroke || e.pointerId !== stroke.pid) return;
    if (stroke.laser) {
      clearTimeout(laserTimer);
      laserTimer = setTimeout(() => clearLaser(false), 1500);
    } else {
      (ink[cur] = ink[cur] || []).push(stroke.s);
      saveInk();
    }
    stroke = null;
  };
  stage.addEventListener("pointerup", endStroke);
  stage.addEventListener("pointercancel", endStroke);
  stage.addEventListener("pointerleave", () => dot.classList.remove("show"));
  loadInk();

  /* ---------- 유틸 ---------- */
  function round(n, d) { const p = Math.pow(10, d || 1); return Math.round(n * p) / p; }
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  }

  /* ---------- 시작 ---------- */
  load();
  fit();
  window.addEventListener("resize", fit);
  window.addEventListener("hashchange", () => go(fromHash(), true));
  cur = Math.max(0, Math.min(slides.length - 1, fromHash()));
  slides[cur].classList.add("active");
  ui.count.textContent = cur + 1 + " / " + slides.length;
  ui.progress.style.width = ((cur + 1) / slides.length) * 100 + "%";
  if (new URLSearchParams(location.search).has("edit")) setEditing(true);
  wake();
})();
