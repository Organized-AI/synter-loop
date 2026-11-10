// The loop, in 3D: five stations around the Synter MCP core, after Judy's Courthouse
// (gavel-and-gown /judy/courthouse/). three.js r147 and its OrbitControls are vendored under
// /assets/vendor/ (the CSP allows scripts only from 'self' and cdnjs) and load when the section
// comes near the viewport. GSAP 3.12.5 drives the run and the camera. Motion is slow and calm,
// can be paused, and is off under prefers-reduced-motion. Without WebGL the flat diagram stays,
// and the step list and detail panel work either way.
(function () {
  "use strict";

  // ---------- install line: copy ----------
  var copy = document.getElementById("copy");
  if (copy && navigator.clipboard) {
    copy.addEventListener("click", function () {
      navigator.clipboard.writeText(document.getElementById("install-cmd").textContent).then(function () {
        copy.textContent = "Copied";
        setTimeout(function () { copy.textContent = "Copy"; }, 1600);
      });
    });
  }

  const stage = document.getElementById("stage3d");
  if (!stage) return;

  // ---------- what each part does (the detail panel) ----------
  const STATIONS = [
    { n: "01", name: "Spend Guard", role: "Decides",
      body: "A gate on every Synter write. It checks the per-change and daily caps, runs a dry run, applies the tracking gate and asks Jev for a score, then Hermes asks you. Cron runs and propose-only mode record a proposal instead of acting.",
      where: "Runs in the plugin's pre_tool_call hook" },
    { n: "02", name: "Tag Witness", role: "Verifies tracking",
      body: "Opens the landing page in a real browser and listens for dataLayer pushes, GTM hits and pixel requests, so you see which tags actually fired. Fixes go to a GTM draft through Synter and are never published from here.",
      where: "Runs in a browser backend (Kernel or local Chromium) with a CDP listener" },
    { n: "03", name: "Truth Layer", role: "Verifies numbers",
      body: "Before a turn it puts platform-claimed conversions next to GA4, CAPI and CRM counts. After the turn it footnotes any number the model got wrong, or blocks the answer if you set it to.",
      where: "Runs on Synter's spend reconciliation, attribution and GA4 reads" },
    { n: "04", name: "Agent ROAS", role: "Grades",
      body: "Every approved change carries its run ID into the platform's change history. After seven days by default, Synter's incrementality tool measures before and after, and the grade goes into the ledger.",
      where: "Runs as a nightly job on measure_incrementality" },
    { n: "05", name: "Jev", role: "Learns",
      body: "Each grade reaches jev-gateway as a real outcome, so the next score is calibrated on results. Scores land in bands: pass at 0.80, warn at 0.50. Jev scores; only you approve.",
      where: "Runs in jev-gateway, a Cloudflare Worker" },
  ];
  const EXTRA = {
    core: { n: "", name: "Synter MCP", role: "The hub",
      body: "Synter's hosted MCP: one connection to every connected ad platform. Every stage reads through it, and writes reach it only through Spend Guard.",
      where: "Endpoint mcp.syntermedia.ai" },
    hermes: { n: "", name: "Hermes", role: "Your agent",
      body: "Hermes Agent, carrying one spend change around the loop. synter-loop is a Hermes plugin: every Synter write Hermes proposes stops at Spend Guard, waits for you, and is graded later.",
      where: "Runs on Hermes Agent 0.23.0 or later" },
    capture: { n: "", name: "Capture ring", role: "Records every step",
      body: "Agent runtime capture records every prompt, tool call and token. It is off by default; raw runs stay in your own R2 bucket and only metadata milestones go to server-side GTM. Agent P&L turns them into cost per approved change.",
      where: "Runs in the agent-capture Worker (R2 agent-runs, D1 agent_runs)" },
  };
  const info = (k) => (typeof k === "number" ? STATIONS[k] : EXTRA[k]);

  const stepButtons = Array.prototype.slice.call(document.querySelectorAll("#stages button"));
  const flatNodes = Array.prototype.slice.call(stage.querySelectorAll(".loop-flat .node"));
  const $ = (id) => document.getElementById(id);
  const detailRole = $("detail-role"), detailName = $("detail-name"), detailBody = $("detail-body"), detailWhere = $("detail-where");
  const liveEl = $("loop-live");
  const still = window.matchMedia("(prefers-reduced-motion: reduce)");

  let onSelect = null; // the 3D scene hooks in here to highlight and frame the part
  function select(k, opts) {
    const s = info(k);
    detailRole.textContent = s.n ? s.n + " · " + s.role : s.role;
    detailName.textContent = s.name;
    detailBody.textContent = s.body;
    detailWhere.textContent = s.where;
    stepButtons.forEach((b, j) => {
      b.classList.toggle("active", j === k);
      b.setAttribute("aria-current", j === k ? "step" : "false");
    });
    flatNodes.forEach((n, j) => n.classList.toggle("active", j === k));
    if (onSelect) onSelect(k, opts || {});
  }
  stepButtons.forEach((b, i) => b.addEventListener("click", () => select(i, { fly: true, user: true })));
  select(0);

  // ---------- load three.js when the section is close ----------
  const VENDOR = ["/assets/vendor/three-0.147.0.min.js", "/assets/vendor/orbit-controls-0.147.0.js"];
  const load = (src) => new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = false;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
  const webgl = () => {
    try {
      const c = document.createElement("canvas");
      return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
    } catch (e) { return false; }
  };
  const near = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    near.disconnect();
    if (!window.gsap || !webgl()) return;
    load(VENDOR[0]).then(() => load(VENDOR[1])).then(() => {
      if (window.THREE && THREE.OrbitControls) build();
    }).catch(() => { /* the flat diagram stays */ });
  }, { rootMargin: "700px 0px" });
  near.observe(stage);

  // ======================================================================
  function build() {
    const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    const C = {
      carbon: css("--carbon") || "#0b0e12", panel: css("--dark-panel") || "#10171b", line: css("--dark-line") || "#344048",
      lime: css("--lime") || "#9cff5a", white: css("--white") || "#e8ebee", muted: css("--dark-muted") || "#a6b5b6",
      warm: css("--warm") || "#f5b942", bad: css("--bad") || "#ff6b6b",
    };
    // Surfaces a step lighter than the UI tokens so the low-poly forms read on carbon.
    const M = { floor: "#121a1f", plinth: "#18222a", body: "#22303a", metal: "#384650", edge: "#4b5d68", dot: "#3a4852" };
    if (THREE.ColorManagement) THREE.ColorManagement.legacyMode = false; // hex in = hex on screen

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch (e) { return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.setAttribute("aria-hidden", "true");
    stage.prepend(renderer.domElement);
    stage.setAttribute("data-mode", "3d");

    const TAU = Math.PI * 2, rad = (d) => (d * Math.PI) / 180;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const SR = 11.5, TR = 7.3, CAP_R = 16.2, FLOOR_R = 18.6, P = 0.45; // station ring, track, capture ring, floor, plinth top
    const ANG = [0, 1, 2, 3, 4, 5].map((i) => -90 + i * 72); // degrees, clockwise from the back

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(C.carbon, 64, 130);
    const camera = new THREE.PerspectiveCamera(34, 1, 0.5, 300);
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enableZoom = false; // the wheel keeps scrolling the page
    controls.enablePan = false;
    controls.minPolarAngle = 0.32;
    controls.maxPolarAngle = 1.28;
    controls.rotateSpeed = 0.7;
    controls.autoRotateSpeed = 0.35;
    renderer.domElement.style.touchAction = "pan-y"; // a vertical swipe still scrolls the page on phones

    scene.add(new THREE.HemisphereLight(0xdfe9e4, 0x05070a, 0.85));
    const key = new THREE.DirectionalLight(0xffffff, 1.15);
    key.position.set(-14, 30, 18);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 90 });
    key.shadow.bias = -0.0006;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x9cff5a, 0.28);
    rim.position.set(16, 10, -22);
    scene.add(rim);

    // ---------- materials ----------
    const std = (color, extra) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.78, metalness: 0.05 }, extra || {}));
    const mats = {
      floor: std(M.floor), plinth: std(M.plinth), body: std(M.body), metal: std(M.metal, { roughness: 0.5, metalness: 0.3 }),
      white: std(C.white, { roughness: 0.6 }), warm: std(C.warm, { roughness: 0.6, emissive: C.warm, emissiveIntensity: 0.12 }),
      muted: std(C.muted, { roughness: 0.6 }), lime: std(C.lime, { roughness: 0.5, emissive: C.lime, emissiveIntensity: 0.35 }),
      glass: new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.14, roughness: 0.15 }),
      glow: new THREE.MeshBasicMaterial({ color: C.lime, toneMapped: false }),
    };
    const edgeMat = (color) => new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 });
    const baseEdge = edgeMat(M.edge);

    // ---------- helpers (as in the courthouse) ----------
    const root = new THREE.Group();
    scene.add(root);
    function outline(mesh, em) {
      if (em) mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 30), em));
      return mesh;
    }
    function put(mesh, parent, shadow) {
      mesh.castShadow = shadow !== false;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    }
    function box(w, h, d, mat, x, y, z, parent, em) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y + h / 2, z);
      return outline(put(m, parent || root), em === undefined ? baseEdge : em);
    }
    function cyl(r, h, mat, x, y, z, parent, seg, em, rTop) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop || r, r, h, seg || 40), mat);
      m.position.set(x, y + h / 2, z);
      return outline(put(m, parent || root), em === undefined ? baseEdge : em);
    }
    function flatRing(r, tube, mat, y, parent, arc) {
      const m = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 6, Math.max(24, Math.round(r * 10)), arc || TAU), mat);
      m.rotation.x = Math.PI / 2;
      m.position.y = y;
      (parent || root).add(m);
      return m;
    }
    function plate(w, h, px, parent, pos) {
      const canvas = document.createElement("canvas");
      canvas.width = px;
      canvas.height = Math.round(px * (h / w));
      const tex = new THREE.CanvasTexture(canvas);
      tex.encoding = THREE.sRGBEncoding;
      tex.anisotropy = 4;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
      mesh.position.copy(pos);
      parent.add(mesh);
      return { canvas, tex, mesh, ctx: canvas.getContext("2d"), W: canvas.width, H: canvas.height };
    }
    const sans = (w, px) => w + " " + px + "px Inter, Arial, sans-serif";
    const mono = (px) => "400 " + px + "px 'IBM Plex Mono', ui-monospace, monospace";
    function panel(ctx, W, H) {
      ctx.fillStyle = C.panel;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = C.line;
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, W - 4, H - 4);
    }

    // ---------- the floor, the track, the capture ring ----------
    cyl(FLOOR_R, 0.5, mats.floor, 0, -0.5, 0, root, 128, edgeMat(C.line));
    flatRing(TR, 0.06, new THREE.MeshBasicMaterial({ color: M.edge }), 0.04);

    class Ring extends THREE.Curve {
      constructor(r, y) { super(); this.r = r; this.y = y; }
      getPoint(t, target) {
        const a = rad(ANG[0]) + t * TAU;
        return (target || new THREE.Vector3()).set(this.r * Math.cos(a), this.y, this.r * Math.sin(a));
      }
    }
    const PROG_SEG = 240, PROG_RAD = 6;
    const progress = new THREE.Mesh(new THREE.TubeGeometry(new Ring(TR, 0.1), PROG_SEG, 0.12, PROG_RAD, false), mats.glow);
    root.add(progress);
    const setProgress = (f) => progress.geometry.setDrawRange(0, Math.round(Math.max(0, Math.min(1, f)) * PROG_SEG) * PROG_RAD * 6);
    setProgress(0);

    const dotMat = new THREE.MeshBasicMaterial({ color: M.dot });
    const DOTS = 96;
    const dots = new THREE.InstancedMesh(new THREE.BoxGeometry(0.24, 0.08, 0.24), dotMat, DOTS);
    const tmp = new THREE.Object3D();
    for (let i = 0; i < DOTS; i++) {
      const a = (i / DOTS) * TAU;
      tmp.position.set(CAP_R * Math.cos(a), 0.05, CAP_R * Math.sin(a));
      tmp.rotation.set(0, -a, 0);
      tmp.updateMatrix();
      dots.setMatrixAt(i, tmp.matrix);
    }
    root.add(dots);
    // one arc of the capture ring per station: it lights when that step is recorded
    const capArcs = ANG.slice(0, 5).map((deg) => {
      const arc = 0.62;
      const m = new THREE.Mesh(new THREE.TorusGeometry(CAP_R, 0.085, 6, 28, arc), new THREE.MeshBasicMaterial({ color: C.lime, transparent: true, opacity: 0, toneMapped: false }));
      m.rotation.set(Math.PI / 2, arc / 2 - rad(deg), 0, "YXZ");
      m.position.y = 0.1;
      root.add(m);
      return m;
    });

    // ---------- the core: Synter MCP ----------
    const coreEdge = edgeMat("#5d7a3e");
    cyl(3.5, 0.4, mats.metal, 0, 0, 0, root, 6, coreEdge, 3.3);
    cyl(3.0, 1.4, mats.body, 0, 0.4, 0, root, 6, coreEdge);
    const coreTop = plate(5.9, 5.9, 512, root, V(0, 1.81, 0));
    coreTop.mesh.geometry.dispose();
    coreTop.mesh.geometry = new THREE.CircleGeometry(2.96, 6, -Math.PI / 2);
    coreTop.mesh.rotation.x = -Math.PI / 2;
    const mark = new Image();
    mark.src = "/assets/synter-mark.png";
    function drawCore() {
      const { ctx, W, H, tex } = coreTop;
      ctx.fillStyle = C.panel;
      ctx.fillRect(0, 0, W, H);
      if (mark.complete && mark.naturalWidth) ctx.drawImage(mark, W / 2 - 62, 120, 124, 124);
      ctx.textAlign = "center";
      ctx.fillStyle = C.white;
      ctx.font = "500 50px 'Space Grotesk', Inter, sans-serif";
      ctx.fillText("SYNTER MCP", W / 2, 318);
      ctx.fillStyle = C.muted;
      ctx.font = mono(22);
      ctx.fillText("every connected ad platform", W / 2, 362);
      ctx.textAlign = "left";
      tex.needsUpdate = true;
    }
    mark.onload = drawCore;
    flatRing(4.1, 0.035, new THREE.MeshBasicMaterial({ color: M.edge }), 1.0);
    const satellites = new THREE.Group();
    satellites.position.y = 1.0;
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8), mats.glow);
      s.position.set(4.1 * Math.cos((i * TAU) / 3), 0, 4.1 * Math.sin((i * TAU) / 3));
      satellites.add(s);
    }
    root.add(satellites);
    const coreHit = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 2.6, 12), new THREE.MeshBasicMaterial());
    coreHit.position.y = 1.3;
    coreHit.visible = false;
    coreHit.userData.key = "core";
    root.add(coreHit);

    // ---------- the five stations ----------
    const stations = ANG.slice(0, 5).map((deg, i) => {
      const a = rad(deg);
      const g = new THREE.Group();
      g.position.set(SR * Math.cos(a), 0, SR * Math.sin(a));
      root.add(g);
      const edge = edgeMat(M.edge);
      cyl(2.7, P, mats.plinth, 0, 0, 0, g, 48, edge);
      const ring = flatRing(2.78, 0.05, new THREE.MeshBasicMaterial({ color: C.line }), P + 0.01, g);
      const hit = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 7, 12), new THREE.MeshBasicMaterial());
      hit.position.y = 3.5;
      hit.visible = false;
      hit.userData.key = i;
      g.add(hit);
      // a spoke on the floor from the core to the plinth: every stage talks to Synter MCP
      const len = SR - 2.75 - 3.55;
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(len, 0.04, 0.14), new THREE.MeshBasicMaterial({ color: C.line }));
      const mid = 3.55 + len / 2;
      spoke.position.set(mid * Math.cos(a), 0.03, mid * Math.sin(a));
      spoke.rotation.y = -a;
      root.add(spoke);
      return { g, edge, ring, hit, spoke, a, deg };
    });
    const hitVolumes = stations.map((s) => s.hit).concat([coreHit]);
    // (the Hermes coin joins hitVolumes once it exists, below)

    // 01 Spend Guard: a barrier gate, a lamp, a caps sign
    const sg = stations[0], sgE = sg.edge;
    box(0.42, 2.4, 0.42, mats.body, -1.7, P, 0, sg.g, sgE);
    box(0.42, 2.4, 0.42, mats.body, 1.7, P, 0, sg.g, sgE);
    const lampMat = std("#2a3238", { emissive: "#000000", emissiveIntensity: 0.9, roughness: 0.4 });
    const lamp = put(new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12), lampMat), sg.g);
    lamp.position.set(1.7, P + 2.66, 0);
    const arm = new THREE.Group();
    arm.position.set(-1.7, P + 1.55, -0.38); // behind the posts and the sign, so the raised arm never covers the sign
    sg.g.add(arm);
    const armBar = outline(put(new THREE.Mesh(new THREE.BoxGeometry(3.55, 0.2, 0.2), mats.white), arm), sgE);
    armBar.position.x = 1.78;
    [0.95, 2.45].forEach((x) => { const b = put(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.23, 0.23), mats.lime), arm); b.position.x = x; });
    const ARM_OPEN = 1.25;
    box(0.12, 0.72, 0.12, mats.metal, -1.2, P + 2.4, -0.05, sg.g, null);
    box(0.12, 0.72, 0.12, mats.metal, 1.2, P + 2.4, -0.05, sg.g, null);
    box(3.06, 1.6, 0.12, mats.body, 0, P + 2.95, -0.09, sg.g, sgE);
    const guardSign = plate(2.9, 1.45, 512, sg.g, V(0, P + 3.75, -0.02));

    // 02 Tag Witness: a browser on a stand, a lens that reads it
    const tw = stations[1], twE = tw.edge;
    box(1.8, 0.14, 1.1, mats.metal, 0, P, -0.2, tw.g, twE);
    box(0.34, 1.0, 0.34, mats.body, 0, P + 0.14, -0.2, tw.g, twE);
    box(4.0, 2.7, 0.22, mats.body, 0, P + 1.0, -0.2, tw.g, twE);
    const screen = plate(3.72, 2.42, 512, tw.g, V(0, P + 2.35, -0.07));
    const lens = new THREE.Group();
    lens.position.set(-1.25, P + 2.45, 0.55);
    tw.g.add(lens);
    put(new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.07, 10, 32), mats.lime), lens);
    lens.add(new THREE.Mesh(new THREE.CircleGeometry(0.4, 24), mats.glass));
    const handle = put(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.62, 0.1), mats.metal), lens);
    handle.position.set(0.42, -0.58, 0);
    handle.rotation.z = 0.7;
    const W_LINES = [
      ["•", "landing page, real browser", C.muted],
      ["✓", "dataLayer: form_submit", C.lime],
      ["✓", "Reddit pixel fired", C.lime],
      ["✗", "Meta CAPI missing", C.bad],
      ["→", "fix staged as a GTM draft", C.warm],
    ];

    // 03 Truth Layer: three bars side by side, a footnote card
    const tl3 = stations[2], tlE = tl3.edge;
    box(4.3, 0.5, 1.6, mats.body, 0, P, 0, tl3.g, tlE);
    const barLabel = plate(4.1, 0.4, 512, tl3.g, V(0, P + 0.25, 0.81));
    const BARS = [["META", 120, mats.warm, -1.35], ["GA4", 71, mats.muted, 0], ["CAPI", 84, mats.white, 1.35]];
    const bars = BARS.map(([, n, mat, x]) => {
      const h = n * 0.03;
      const geo = new THREE.BoxGeometry(0.8, h, 0.8);
      geo.translate(0, h / 2, 0);
      const m = outline(put(new THREE.Mesh(geo, mat), tl3.g), tlE);
      m.position.set(x, P + 0.5, 0);
      m.scale.y = 0.001;
      return m;
    });
    box(4.15, 1.25, 0.1, mats.body, 0, P + 4.42, -0.07, tl3.g, tlE);
    const truthCard = plate(4.0, 1.1, 640, tl3.g, V(0, P + 5.05, 0));

    // 04 Agent ROAS: a lift gauge on a pedestal
    const ar = stations[3], arE = ar.edge;
    box(0.5, 0.9, 0.5, mats.body, 0, P, 0, ar.g, arE);
    box(3.3, 2.3, 0.22, mats.body, 0, P + 0.9, 0, ar.g, arE);
    const gauge = plate(3.04, 2.04, 384, ar.g, V(0, P + 2.05, 0.13));

    // 05 Jev: an eye on a pillar, a ring that spins faster when a grade arrives
    const jv = stations[4], jvE = jv.edge;
    cyl(0.42, 1.9, mats.body, 0, P, 0, jv.g, 20, jvE);
    cyl(0.75, 0.2, mats.metal, 0, P + 1.9, 0, jv.g, 24, jvE);
    const jevMat = std(C.lime, { emissive: C.lime, emissiveIntensity: 0.35, roughness: 0.35 });
    const eye = put(new THREE.Mesh(new THREE.SphereGeometry(0.95, 28, 18), jevMat), jv.g);
    eye.position.y = P + 3.05;
    const jevRing = put(new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.06, 8, 64), mats.metal), jv.g);
    jevRing.position.y = P + 3.05;
    jevRing.rotation.x = 1.15;
    const jevCard = plate(2.8, 0.9, 448, jv.g, V(0, P + 5.1, 0));

    // ---------- the token: a Hermes coin carrying the change around the loop ----------
    // The face is the Hermes mark multiplied onto lime; the coin turns to face the camera every frame
    // and flips once (coinSpin) when it reaches a stage.
    const TOKEN_R = 1.15, TOKEN_Y = 1.35;
    const token = new THREE.Group();
    token.position.y = TOKEN_Y;
    root.add(token);
    const coinCanvas = document.createElement("canvas");
    coinCanvas.width = coinCanvas.height = 512;
    const coinTex = new THREE.CanvasTexture(coinCanvas);
    coinTex.encoding = THREE.sRGBEncoding;
    coinTex.anisotropy = 8;
    const hermesMark = new Image();
    hermesMark.src = "/assets/hermes-mark.png";
    function drawCoin() {
      const ctx = coinCanvas.getContext("2d"), W = coinCanvas.width, r = W / 2;
      ctx.fillStyle = C.carbon;
      ctx.fillRect(0, 0, W, W);
      ctx.save();
      ctx.beginPath();
      ctx.arc(r, r, r - 16, 0, TAU);
      ctx.fillStyle = C.white;
      ctx.fill();
      // no clip(): in Chrome a clip plus "multiply" drops the image; ink outside the disc lands on carbon anyway
      if (hermesMark.complete && hermesMark.naturalWidth) {
        ctx.globalCompositeOperation = "multiply"; // black ink stays black, the white paper takes the coin colour
        ctx.imageSmoothingQuality = "high";
        const sz = W * 0.84;
        ctx.drawImage(hermesMark, (W - sz) / 2, W * 0.13, sz, sz);
      }
      ctx.restore();
      coinTex.needsUpdate = true;
    }
    hermesMark.onload = drawCoin;
    drawCoin();
    const coinMat = new THREE.MeshBasicMaterial({ map: coinTex, toneMapped: false });
    const coinFront = put(new THREE.Mesh(new THREE.CircleGeometry(TOKEN_R, 56), coinMat), token);
    coinFront.position.z = 0.081;
    const coinBack = put(new THREE.Mesh(new THREE.CircleGeometry(TOKEN_R, 56), coinMat), token);
    coinBack.rotation.y = Math.PI;
    coinBack.position.z = -0.081;
    const coinRim = put(new THREE.Mesh(new THREE.CylinderGeometry(TOKEN_R, TOKEN_R, 0.16, 56, 1, true), new THREE.MeshBasicMaterial({ color: C.white, toneMapped: false })), token);
    coinRim.rotation.x = Math.PI / 2;
    coinFront.userData.key = coinBack.userData.key = "hermes";
    const coinSpin = { a: 0 };
    hitVolumes.push(coinFront, coinBack);
    const hermesAnchor = new THREE.Vector3();
    function placeToken(deg) {
      const a = rad(deg);
      token.position.set(TR * Math.cos(a), TOKEN_Y, TR * Math.sin(a));
      setProgress((deg - ANG[0]) / 360);
    }
    const sparks = Array.from({ length: 6 }, () => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), mats.glow);
      m.visible = false;
      root.add(m);
      return m;
    });
    const calls = Array.from({ length: 6 }, () => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), mats.glow);
      m.visible = false;
      root.add(m);
      return m;
    });

    // ---------- canvas faces ----------
    function drawGuard(big, small, state) {
      const { ctx, W, H, tex } = guardSign;
      panel(ctx, W, H);
      ctx.fillStyle = C.lime;
      ctx.font = mono(22);
      ctx.fillText("SPEND GUARD", 28, 48);
      const chip = { idle: [C.muted, "IDLE"], check: [C.white, "CHECKING"], wait: [C.warm, "WAITING"], ok: [C.lime, "APPROVED"] }[state];
      ctx.font = mono(18);
      const cw = ctx.measureText(chip[1]).width + 22;
      ctx.strokeStyle = chip[0];
      ctx.lineWidth = 2;
      ctx.strokeRect(W - 28 - cw, 24, cw, 32);
      ctx.fillStyle = chip[0];
      ctx.fillText(chip[1], W - 28 - cw + 11, 46);
      ctx.fillStyle = C.white;
      ctx.font = sans(500, 50);
      ctx.fillText(big, 28, 142);
      ctx.fillStyle = C.muted;
      ctx.font = mono(22);
      ctx.fillText(small, 28, 204);
      tex.needsUpdate = true;
    }
    function drawWitness(n) {
      const { ctx, W, H, tex } = screen;
      ctx.fillStyle = "#0a1013";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = C.panel;
      ctx.fillRect(0, 0, W, 42);
      [C.bad, C.warm, C.lime].forEach((c, i) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(22 + i * 20, 21, 6, 0, TAU); ctx.fill(); });
      ctx.fillStyle = C.carbon;
      ctx.fillRect(88, 9, W - 104, 24);
      ctx.fillStyle = C.muted;
      ctx.font = mono(15);
      ctx.fillText("lp.example.com/offer", 98, 27);
      ctx.font = mono(19);
      if (!n) {
        ctx.fillStyle = C.muted;
        ctx.fillText("waiting for a check", 24, 90);
      }
      W_LINES.slice(0, n).forEach(([markc, text, tone], i) => {
        ctx.fillStyle = tone;
        ctx.fillText(markc, 24, 90 + i * 46);
        ctx.fillStyle = i === 3 ? C.bad : C.white;
        ctx.fillText(text, 54, 90 + i * 46);
      });
      tex.needsUpdate = true;
    }
    function drawBarLabels() {
      const { ctx, W, H, tex } = barLabel;
      ctx.fillStyle = M.body;
      ctx.fillRect(0, 0, W, H);
      ctx.font = mono(24);
      ctx.textAlign = "center";
      BARS.forEach(([name, , , x]) => { ctx.fillStyle = C.muted; ctx.fillText(name, ((x + 2.05) / 4.1) * W, 36); });
      ctx.textAlign = "left";
      tex.needsUpdate = true;
    }
    function drawTruth(shown) {
      const { ctx, W, H, tex } = truthCard;
      panel(ctx, W, H);
      ctx.fillStyle = C.lime;
      ctx.font = mono(19);
      ctx.fillText("TRUTH LAYER · CONVERSIONS", 28, 42);
      ctx.font = sans(500, 34);
      if (shown) {
        ctx.fillStyle = C.warm;
        ctx.fillText("Meta claims 120", 28, 98);
        const w = ctx.measureText("Meta claims 120").width;
        ctx.fillStyle = C.white;
        ctx.fillText("· GA4 71 · CAPI 84", 28 + w + 12, 98);
        ctx.fillStyle = C.muted;
        ctx.font = mono(19);
        ctx.fillText("footnoted: the platform's figure is a claim", 28, 146);
      } else {
        ctx.fillStyle = C.white;
        ctx.fillText("claimed · GA4 · CAPI · CRM", 28, 98);
        ctx.fillStyle = C.muted;
        ctx.font = mono(19);
        ctx.fillText("side by side, before every turn", 28, 146);
      }
      tex.needsUpdate = true;
    }
    function drawGauge(v, shown) {
      const { ctx, W, H, tex } = gauge;
      panel(ctx, W, H);
      ctx.fillStyle = C.lime;
      ctx.font = mono(17);
      ctx.fillText("AGENT ROAS · LIFT", 20, 34);
      ctx.textAlign = "right";
      ctx.fillStyle = shown ? C.lime : C.muted;
      ctx.font = sans(500, 40);
      ctx.fillText(shown ? "+" + Math.round(v) + "%" : "—", W - 20, 46);
      ctx.textAlign = "left";
      const cx = W / 2, cy = 214, r = 128;
      const ang = (x) => Math.PI + ((Math.max(-20, Math.min(20, x)) + 20) / 40) * Math.PI;
      ctx.lineWidth = 10;
      ctx.strokeStyle = C.line;
      ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, TAU); ctx.stroke();
      if (shown && v > 0) { ctx.strokeStyle = C.lime; ctx.beginPath(); ctx.arc(cx, cy, r, ang(0), ang(v)); ctx.stroke(); }
      ctx.fillStyle = C.muted;
      ctx.font = mono(13);
      ctx.textAlign = "center";
      [-20, -10, 0, 10, 20].forEach((t) => {
        const a = ang(t);
        ctx.fillText((t > 0 ? "+" : "") + t, cx + (r - 26) * Math.cos(a), cy + (r - 26) * Math.sin(a) + 5);
      });
      ctx.textAlign = "left";
      const a = ang(shown ? v : 0);
      ctx.strokeStyle = C.white;
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + (r - 8) * Math.cos(a), cy + (r - 8) * Math.sin(a)); ctx.stroke();
      ctx.fillStyle = C.white;
      ctx.beginPath(); ctx.arc(cx, cy, 9, 0, TAU); ctx.fill();
      ctx.fillStyle = C.muted;
      ctx.font = mono(13);
      ctx.fillText(shown ? "7 DAYS · FIXTURE" : "GRADED AFTER 7 DAYS", 20, H - 14);
      tex.needsUpdate = true;
    }
    function drawJev(top, bottom) {
      const { ctx, W, H, tex } = jevCard;
      panel(ctx, W, H);
      ctx.fillStyle = C.lime;
      ctx.font = mono(16);
      ctx.fillText("JEV · SCORES, NEVER APPROVES", 22, 34);
      ctx.fillStyle = C.white;
      ctx.font = sans(500, 30);
      ctx.fillText(top, 22, 80);
      ctx.fillStyle = C.muted;
      ctx.font = mono(17);
      ctx.fillText(bottom, 22, 118);
      tex.needsUpdate = true;
    }

    // ---------- labels ----------
    const labelsEl = $("labels3d");
    const counterEl = $("counter3d");
    const LABELS = STATIONS.map((s, i) => ({ key: i, n: s.n, name: s.name, at: stations[i].g.position.clone().setY([5.6, 4.7, 6.5, 4.2, 6.4][i]) }))
      .concat([{ key: "hermes", n: "", name: "Hermes", at: hermesAnchor, below: true }, { key: "capture", n: "", name: "Capture ring", at: V(CAP_R * Math.cos(rad(60)), 0.4, CAP_R * Math.sin(rad(60))) }]);
    LABELS.forEach((L) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "tag3d" + (typeof L.key === "number" ? "" : " tag3d-quiet") + (L.below ? " tag3d-below" : "");
      el.tabIndex = -1; // keyboard users have the step list; these duplicate it for pointers
      el.setAttribute("aria-hidden", "true");
      if (L.n) { const n = document.createElement("span"); n.className = "n"; n.textContent = L.n; el.appendChild(n); }
      el.appendChild(document.createTextNode(L.name));
      el.addEventListener("click", () => select(L.key, { fly: true, user: true }));
      labelsEl.appendChild(el);
      L.el = el;
    });

    // ---------- camera ----------
    let viewMode = "home", userCam = false, idleUntil = 0, instant = false;
    const HOME_DIR = V(0, 0.6, 0.8).normalize(), HOME_TARGET = V(0, 1.6, 0.8);
    const fit = () => Math.max(1, 1.15 / (camera.aspect || 1));
    const homeView = () => ({ pos: HOME_TARGET.clone().addScaledVector(HOME_DIR, 41 * fit()), target: HOME_TARGET.clone() });
    function stationView(i) {
      // from in front of the station and above it: every face points +z, and the core stays out of frame
      const p = stations[i].g.position;
      const target = V(p.x, 2.6, p.z);
      const off = V(p.x * 0.2, 11.5, 13.5).multiplyScalar(Math.max(1, 1.1 / (camera.aspect || 1)));
      return { pos: target.clone().add(off), target };
    }
    const coreView = () => ({ pos: V(0, 12, 15).multiplyScalar(fit()), target: V(0, 1.2, 0) });
    const viewFor = (k) => (typeof k === "number" ? stationView(k) : k === "core" ? coreView() : homeView());
    function flyTo(v, seconds) {
      gsap.killTweensOf(camera.position);
      gsap.killTweensOf(controls.target);
      if (still.matches || instant) { camera.position.copy(v.pos); controls.target.copy(v.target); return; }
      const d = seconds || 1.6;
      gsap.to(camera.position, { x: v.pos.x, y: v.pos.y, z: v.pos.z, duration: d, ease: "power2.inOut" });
      gsap.to(controls.target, { x: v.target.x, y: v.target.y, z: v.target.z, duration: d, ease: "power2.inOut" });
    }
    controls.addEventListener("start", () => {
      userCam = true;
      idleUntil = performance.now() + 9000;
      gsap.killTweensOf(camera.position);
      gsap.killTweensOf(controls.target);
    });

    onSelect = (k, opts) => {
      stations.forEach((s, i) => {
        const on = i === k;
        s.edge.color.set(on ? C.lime : M.edge);
        s.ring.material.color.set(on ? C.lime : C.line);
        s.spoke.material.color.set(on ? C.lime : C.line);
      });
      coreEdge.color.set(k === "core" ? C.lime : "#5d7a3e");
      dotMat.color.set(k === "capture" ? C.lime : M.dot);
      LABELS.forEach((L) => L.el.toggleAttribute("data-on", L.key === k));
      if (opts.user) { userCam = true; idleUntil = performance.now() + 9000; }
      if (opts.fly) { viewMode = typeof k === "number" || k === "core" ? k : "home"; flyTo(viewFor(k)); }
    };
    $("view-overview").addEventListener("click", () => {
      viewMode = "home";
      userCam = false;
      idleUntil = performance.now() + 2500;
      flyTo(homeView());
    });

    // ---------- picking ----------
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    function pick(ev) {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(hitVolumes, false)[0];
      return hit ? hit.object.userData.key : null;
    }
    let down = null;
    renderer.domElement.addEventListener("pointerdown", (e) => { down = { x: e.clientX, y: e.clientY }; });
    renderer.domElement.addEventListener("pointerup", (e) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > 6) return;
      const k = pick(e);
      if (k !== null) select(k, { fly: true, user: true });
    });
    renderer.domElement.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse" || down) return;
      stage.toggleAttribute("data-hover", pick(e) !== null);
    });

    // ---------- the run: one spend change around the loop ----------
    const say = (text, spoken) => {
      if (instant) return;
      counterEl.textContent = text;
      if (spoken) liveEl.textContent = spoken;
    };
    const pulse = (amount, repeat) => {
      if (instant || still.matches) return;
      gsap.to(jevMat, { emissiveIntensity: amount, duration: 0.45, yoyo: true, repeat });
    };
    function spark(i) {
      const arcMat = capArcs[i].material;
      if (instant || still.matches) { arcMat.opacity = 0.3; return; }
      gsap.timeline().to(arcMat, { opacity: 1, duration: 0.5, delay: 1.1 }).to(arcMat, { opacity: 0.3, duration: 1.2 });
      const s = sparks.find((m) => !m.visible);
      if (!s) return;
      const a = stations[i].a, top = [3.4, 4.2, 4.6, 3.8, 4.1][i];
      const curve = new THREE.QuadraticBezierCurve3(
        V(SR * Math.cos(a), top, SR * Math.sin(a)),
        V(((SR + CAP_R) / 2) * Math.cos(a), top + 3.2, ((SR + CAP_R) / 2) * Math.sin(a)),
        V(CAP_R * Math.cos(a), 0.25, CAP_R * Math.sin(a)));
      const p = { t: 0 };
      s.visible = true;
      gsap.to(p, { t: 1, duration: 1.2, ease: "sine.in", onUpdate: () => s.position.copy(curve.getPoint(p.t)), onComplete: () => { s.visible = false; } });
    }
    function callSynter(i) {
      if (instant || still.matches) return;
      const a = stations[i].a;
      [0, 1, 2].forEach((j) => {
        const c = calls.find((m) => !m.visible);
        if (!c) return;
        const p = { r: 3.6 };
        c.visible = true;
        c.position.set(p.r * Math.cos(a), 0.22, p.r * Math.sin(a));
        gsap.to(p, { r: SR - 2.8, duration: 0.9, delay: j * 0.22, ease: "sine.inOut", onUpdate: () => c.position.set(p.r * Math.cos(a), 0.22, p.r * Math.sin(a)), onComplete: () => { c.visible = false; } });
      });
    }
    let jevSpin = 0.35;
    function lampTo(state) {
      const c = { off: ["#2a3238", "#000000"], warm: [C.warm, C.warm], lime: [C.lime, C.lime] }[state];
      lampMat.color.set(c[0]);
      lampMat.emissive.set(c[1]);
    }
    function idleFaces() {
      drawGuard("caps · dry run", "every write stops here", "idle");
      drawWitness(0);
      drawTruth(false);
      drawGauge(0, false);
      drawJev("pass ≥ 0.80 · warn ≥ 0.50", "learns from graded outcomes");
    }
    function resetRun() {
      arm.rotation.z = 0;
      lampTo("off");
      bars.forEach((b) => { b.scale.y = 0.001; });
      lens.position.x = -1.25;
      capArcs.forEach((m) => { gsap.killTweensOf(m.material); m.material.opacity = 0; });
      idleFaces();
      token.visible = true;
      placeToken(ANG[0]);
    }
    const at = (tl, fn, pos) => tl.call(fn, null, pos === undefined ? ">" : pos);
    function view(i) {
      if (userCam) return;
      viewMode = i;
      flyTo(i === "home" ? homeView() : stationView(i), 1.7);
    }
    function leg(tl, to) {
      const k = to % 5;
      at(tl, () => { select(k); view(k === 0 ? "home" : k); }, ">+0.5");
      const p = { d: ANG[to - 1] };
      tl.to(p, { d: ANG[to], duration: 2.0, ease: "sine.inOut", onUpdate: () => placeToken(p.d) }, "<");
      tl.fromTo(coinSpin, { a: 0 }, { a: TAU, duration: 0.8, ease: "power2.inOut" }, "<+1.4");
    }
    function runTimeline() {
      const tl = gsap.timeline({ defaults: { ease: "sine.inOut" } });
      at(tl, () => {
        resetRun();
        select(0);
        view(0);
        say("proposal · move $200/day from Meta to Reddit", "Run started. Spend Guard receives a proposal to move 200 dollars a day from Meta to Reddit.");
      }, 0);
      at(tl, () => { drawGuard("$200 of $250/day", "caps ✓ · within the daily cap", "check"); lampTo("warm"); say("caps ✓ · $200 is inside the $250/day cap"); }, "+=1.3");
      at(tl, () => { drawGuard("dry run", "diff ready · nothing spent", "check"); callSynter(0); say("dry run through Synter · diff ready, nothing spent"); }, "+=1.4");
      at(tl, () => { drawGuard("Jev 0.86 · pass", "Hermes asks you", "wait"); pulse(1.1, 1); say("Jev scores 0.86 · pass · Hermes asks you"); }, "+=1.5");
      at(tl, () => { drawGuard("approved", "by you · readback ✓", "ok"); lampTo("lime"); spark(0); say("you approve · readback matches", "You approve. The readback matches."); }, "+=1.6");
      tl.to(arm.rotation, { z: ARM_OPEN, duration: 1.0, ease: "power2.inOut" }, ">");

      leg(tl, 1);
      at(tl, () => say("Tag Witness walks the landing page in a real browser", "Tag Witness checks tracking on the landing page."), ">");
      tl.addLabel("witness", ">");
      tl.to(lens.position, { x: 1.25, duration: 1.4, ease: "sine.inOut", yoyo: true, repeat: 1 }, "witness");
      W_LINES.forEach((_, j) => at(tl, () => drawWitness(j + 1), "witness+=" + (0.3 + j * 0.55)));
      at(tl, () => { callSynter(1); spark(1); say("Reddit pixel fired · Meta CAPI missing → fix staged as a GTM draft", "The Reddit pixel fired; Meta CAPI is missing. A fix is staged as a GTM draft, not published."); }, "witness+=3.2");

      leg(tl, 2);
      at(tl, () => { callSynter(2); say("Truth Layer reads platform, GA4 and CAPI side by side", "Truth Layer compares the platform's conversions with GA4 and CAPI."); }, ">");
      bars.forEach((b, j) => tl.to(b.scale, { y: 1, duration: 0.9, ease: "power2.out" }, j ? "<+0.3" : ">+0.2"));
      at(tl, () => { drawTruth(true); spark(2); say("Meta claims 120 · GA4 71 · CAPI 84 → footnoted", "Meta claims 120, GA4 shows 71, CAPI 84. The answer gets a footnote."); }, ">+0.2");

      leg(tl, 3);
      at(tl, () => { callSynter(3); say("7 days later (fixture) · measuring before and after", "Seven days later, on a fixture, Agent ROAS measures the change."); }, ">");
      const g = { v: 0 };
      tl.to(g, { v: 12, duration: 1.8, ease: "power2.out", onUpdate: () => drawGauge(g.v, true) }, ">+0.4");
      at(tl, () => { spark(3); say("graded +12% lift · written to the ledger", "Graded plus 12 percent lift."); }, ">");

      leg(tl, 4);
      at(tl, () => {
        jevSpin = 3;
        pulse(1.3, 3);
        drawJev("grade received", "next score recalibrates");
        spark(4);
        say("grade → jev-gateway · the next score recalibrates", "The grade goes to jev-gateway, and Jev's next score is recalibrated.");
      }, ">+0.2");

      leg(tl, 5);
      tl.to(arm.rotation, { z: 0, duration: 1.0, ease: "power2.inOut" }, "<+0.6");
      at(tl, () => {
        lampTo("off");
        drawGuard("next decision", "scored by the new Jev", "idle");
        say("loop closed · every step captured", "Loop closed. Every step was captured.");
        viewMode = "home";
        if (!userCam) flyTo(homeView(), 1.8);
      }, "+=0.1");
      return tl;
    }
    let running = null, paused = false, visible = true;
    const runBtn = $("run-loop");
    const sync = () => {
      if (!running) return;
      if (!paused && visible && !document.hidden) running.resume(); else running.pause();
    };
    function run() {
      if (running) running.kill();
      gsap.killTweensOf(camera.position);
      gsap.killTweensOf(controls.target);
      userCam = false;
      if (paused) setPaused(false);
      running = runTimeline();
      running.eventCallback("onComplete", () => { running = null; idleUntil = performance.now() + 4000; });
      if (still.matches) { running.progress(1); running = null; }
      else sync();
    }
    runBtn.addEventListener("click", run);

    const toggle = $("motion-toggle");
    function setPaused(p) {
      paused = p;
      toggle.setAttribute("aria-pressed", String(p));
      toggle.firstChild.nodeValue = p ? "Resume motion " : "Pause motion ";
      toggle.lastChild.textContent = p ? "▸" : "‖";
      sync();
    }
    toggle.addEventListener("click", () => setPaused(!paused));
    if (still.matches) toggle.hidden = true;

    // ---------- frame loop ----------
    const v3 = new THREE.Vector3();
    let width = 0, height = 0, last = performance.now(), raf = 0;
    function resize() {
      const r = stage.getBoundingClientRect();
      if (r.width === width && r.height === height) return;
      width = r.width;
      height = r.height;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.fov = width < 600 ? 40 : 34;
      camera.updateProjectionMatrix();
      if (viewMode === "home" && !userCam && !gsap.isTweening(camera.position)) {
        const h = homeView();
        camera.position.copy(h.pos);
        controls.target.copy(h.target);
      }
    }
    function placeLabels() {
      for (const L of LABELS) {
        v3.copy(L.at).project(camera);
        const off = v3.z > 1 || Math.abs(v3.x) > 1.08 || Math.abs(v3.y) > 1.08;
        L.el.style.display = off ? "none" : "";
        if (off) continue;
        L.el.style.left = (((v3.x + 1) / 2) * width).toFixed(1) + "px";
        L.el.style.top = (((1 - v3.y) / 2) * height).toFixed(1) + "px";
        L.el.style.zIndex = String(1000 - Math.round(camera.position.distanceTo(L.at) * 10));
      }
    }
    function frame(now) {
      raf = 0;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      resize();
      const moving = !paused && !still.matches;
      controls.autoRotate = moving && !running && viewMode === "home" && now > idleUntil;
      controls.update();
      if (moving) {
        satellites.rotation.y += dt * 0.25;
        jevSpin = Math.max(0.35, jevSpin - dt * 0.9);
        jevRing.rotation.z += dt * jevSpin;
        if (!running) eye.position.y = P + 3.05 + Math.sin(now / 1100) * 0.08;
      }
      // the coin faces the camera (plus its arrival flip) and floats a little
      token.rotation.y = Math.atan2(camera.position.x - token.position.x, camera.position.z - token.position.z) + coinSpin.a;
      token.position.y = TOKEN_Y + (moving ? Math.sin(now / 900) * 0.07 : 0);
      hermesAnchor.copy(token.position).setY(token.position.y - TOKEN_R - 0.2); // the tag sits under the coin
      renderer.render(scene, camera);
      placeLabels();
      if (visible && !document.hidden) raf = requestAnimationFrame(frame);
    }
    const kick = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } };

    let played = false;
    new IntersectionObserver((entries) => {
      const e = entries[entries.length - 1];
      visible = e.isIntersecting;
      if (visible) kick();
      sync();
      if (visible && !played && e.intersectionRatio >= 0.45 && !still.matches) {
        played = true;
        setTimeout(run, 500);
      }
    }, { threshold: [0, 0.45] }).observe(stage);
    document.addEventListener("visibilitychange", () => { sync(); if (!document.hidden) kick(); });

    // ---------- the opening frame: a finished run, so the model reads at rest ----------
    resize();
    instant = true;
    const opening = runTimeline();
    opening.progress(1);
    opening.kill();
    instant = false;
    counterEl.textContent = "";
    select(0);
    viewMode = "home";
    const h = homeView();
    camera.position.copy(h.pos);
    controls.target.copy(h.target);
    drawBarLabels();
    drawCore();
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => { drawBarLabels(); drawCore(); if (!running) { drawWitness(5); drawTruth(true); drawGauge(12, true); drawJev("grade received", "next score recalibrates"); drawGuard("next decision", "scored by the new Jev", "idle"); } });
    }
    kick();
  }
})();
