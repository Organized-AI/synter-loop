// The loop: five stages around Synter MCP, animated with GSAP 3.12.5. Motion is slow and calm
// (sine easing, no overshoot), can be paused, and is off under prefers-reduced-motion.
// The step list doubles as tabs: choosing a step moves the loop there.
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";
  var CX = 300, CY = 300, R = 210, CAPTURE_R = 272;
  var names = [["Spend", "Guard"], ["Tag", "Witness"], ["Truth", "Layer"], ["Agent", "ROAS"], ["Jev", ""]];
  var angleOf = function (i) { return -90 + i * 72; };
  var pt = function (deg, r) {
    var a = (deg * Math.PI) / 180;
    return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) };
  };

  // Copy button.
  var copy = document.getElementById("copy");
  if (copy && navigator.clipboard) {
    copy.addEventListener("click", function () {
      navigator.clipboard.writeText(document.getElementById("install-cmd").textContent).then(function () {
        copy.textContent = "Copied";
        setTimeout(function () { copy.textContent = "Copy"; }, 1600);
      });
    });
  }

  var nodesG = document.getElementById("nodes");
  if (!nodesG) return;
  var nodes = names.map(function (n, i) {
    var p = pt(angleOf(i), R);
    var g = document.createElementNS(NS, "g");
    g.setAttribute("class", "node");
    g.setAttribute("transform", "translate(" + p.x + " " + p.y + ")");
    var c = document.createElementNS(NS, "circle");
    c.setAttribute("r", "50");
    g.appendChild(c);
    n.forEach(function (line, j) {
      if (!line) return;
      var t = document.createElementNS(NS, "text");
      t.setAttribute("y", n[1] ? (j === 0 ? -3 : 16) : 5);
      t.textContent = line;
      g.appendChild(t);
    });
    nodesG.appendChild(g);
    return g;
  });
  var steps = Array.prototype.slice.call(document.querySelectorAll("#stages button"));
  var activate = function (i) {
    nodes.forEach(function (n, j) { n.classList.toggle("active", j === i); });
    steps.forEach(function (b, j) {
      b.classList.toggle("active", j === i);
      b.setAttribute("aria-current", j === i ? "step" : "false");
    });
  };

  var pulse = document.getElementById("pulse");
  var progress = document.getElementById("ring-progress");
  var toggle = document.getElementById("motion-toggle");
  var circumference = 2 * Math.PI * R;
  progress.setAttribute("stroke-dasharray", String(circumference));
  var state = { a: -90 };
  var place = function () {
    var p = pt(state.a, R);
    pulse.setAttribute("cx", p.x);
    pulse.setAttribute("cy", p.y);
    var travelled = Math.min(360, Math.max(0, state.a + 90));
    progress.setAttribute("stroke-dashoffset", String(circumference * (1 - travelled / 360)));
  };

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var gsap = window.gsap;
  if (reduce || !gsap) {
    // Static diagram: whole ring drawn, step 1 selected, steps still selectable.
    progress.setAttribute("stroke-dashoffset", "0");
    pulse.setAttribute("visibility", "hidden");
    if (toggle) toggle.hidden = true;
    activate(0);
    steps.forEach(function (b, i) { b.addEventListener("click", function () { activate(i); }); });
    return;
  }

  var sparks = document.getElementById("sparks");
  var spark = function (i) {
    var from = pt(angleOf(i), R + 52), to = pt(angleOf(i) + 8, CAPTURE_R);
    var s = document.createElementNS(NS, "circle");
    s.setAttribute("class", "spark");
    s.setAttribute("r", "3");
    s.setAttribute("cx", from.x);
    s.setAttribute("cy", from.y);
    sparks.appendChild(s);
    gsap.to(s, {
      attr: { cx: to.x, cy: to.y }, opacity: 0, duration: 1.8, ease: "sine.out",
      onComplete: function () { s.remove(); },
    });
  };

  place();
  var tl = gsap.timeline({ repeat: -1 });
  names.forEach(function (_, i) {
    tl.addLabel("s" + i)
      .call(activate, [i])
      .call(spark, [i])
      .to(state, { a: angleOf(i + 1), duration: 2.6, ease: "sine.inOut", onUpdate: place }, "+=1.4");
  });
  tl.call(function () { state.a = -90; place(); });

  var userPaused = false;
  var setPaused = function (p) {
    userPaused = p;
    if (p) tl.pause(); else tl.resume();
    toggle.setAttribute("aria-pressed", String(p));
    toggle.firstChild.nodeValue = p ? "Resume motion " : "Pause motion ";
    toggle.lastChild.textContent = p ? "" : "‖";
  };
  toggle.lastChild.textContent = "‖";
  toggle.addEventListener("click", function () { setPaused(!userPaused); });

  steps.forEach(function (b, i) {
    b.addEventListener("click", function () {
      tl.seek("s" + i, false);
      state.a = angleOf(i);
      place();
      activate(i);
    });
  });

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) tl.pause(); else if (!userPaused) tl.resume();
  });
})();
