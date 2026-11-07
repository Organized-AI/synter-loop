// The loop: five stages around Synter MCP, animated with GSAP 3.12.5. Each stage sends a
// spark to the outer capture ring. Reduced motion (or no GSAP) shows the static diagram.
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

  // Demo video placeholder until the file exists in R2.
  var video = document.getElementById("demo-video");
  if (video) {
    fetch("/media/demo.mp4", { method: "HEAD" }).then(function (r) {
      if (!r.ok) {
        video.hidden = true;
        document.getElementById("video-placeholder").hidden = false;
      }
    }).catch(function () {});
  }

  // Nodes.
  var nodesG = document.getElementById("nodes");
  if (!nodesG) return;
  var nodes = names.map(function (n, i) {
    var p = pt(angleOf(i), R);
    var g = document.createElementNS(NS, "g");
    g.setAttribute("class", "node");
    g.setAttribute("transform", "translate(" + p.x + " " + p.y + ")");
    var inner = document.createElementNS(NS, "g");
    var c = document.createElementNS(NS, "circle");
    c.setAttribute("r", "50");
    inner.appendChild(c);
    n.forEach(function (line, j) {
      if (!line) return;
      var t = document.createElementNS(NS, "text");
      t.setAttribute("y", n[1] ? (j === 0 ? -4 : 16) : 6);
      t.textContent = line;
      inner.appendChild(t);
    });
    g.appendChild(inner);
    nodesG.appendChild(g);
    return inner;
  });
  var items = Array.prototype.slice.call(document.querySelectorAll("#stages li"));
  var activate = function (i) {
    nodes.forEach(function (n, j) { n.parentNode.classList.toggle("active", j === i); });
    items.forEach(function (li, j) { li.classList.toggle("active", j === i); });
  };

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var gsap = window.gsap;
  var pulse = document.getElementById("pulse");
  var progress = document.getElementById("ring-progress");
  var circumference = 2 * Math.PI * R;
  progress.setAttribute("stroke-dasharray", String(circumference));
  if (reduce || !gsap) {
    progress.setAttribute("stroke-dashoffset", "0");
    nodes.forEach(function (n) { n.parentNode.classList.add("active"); });
    items.forEach(function (li) { li.classList.add("active"); });
    pulse.setAttribute("hidden", "");
    return;
  }

  var sparks = document.getElementById("sparks");
  var spark = function (i) {
    var from = pt(angleOf(i), R + 50), to = pt(angleOf(i) + 10, CAPTURE_R);
    var s = document.createElementNS(NS, "circle");
    s.setAttribute("class", "spark");
    s.setAttribute("r", "4");
    s.setAttribute("cx", from.x);
    s.setAttribute("cy", from.y);
    sparks.appendChild(s);
    gsap.to(s, {
      attr: { cx: to.x, cy: to.y }, opacity: 0, duration: 1.1, ease: "power2.out",
      onComplete: function () { s.remove(); },
    });
  };

  var state = { a: -90 };
  var place = function () {
    var p = pt(state.a, R);
    pulse.setAttribute("cx", p.x);
    pulse.setAttribute("cy", p.y);
    var travelled = Math.min(360, Math.max(0, state.a + 90));
    progress.setAttribute("stroke-dashoffset", String(circumference * (1 - travelled / 360)));
  };
  place();

  var tl = gsap.timeline({ repeat: -1 });
  names.forEach(function (_, i) {
    tl.call(activate, [i])
      .call(spark, [i])
      .fromTo(nodes[i], { scale: 1 }, { scale: 1.12, duration: 0.28, yoyo: true, repeat: 1, ease: "power1.inOut", svgOrigin: "0 0" })
      .to(state, { a: angleOf(i + 1), duration: 1.7, ease: "sine.inOut", onUpdate: place }, "+=0.5");
  });
  tl.call(function () { state.a = -90; place(); });

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) tl.pause(); else tl.resume();
  });
})();
