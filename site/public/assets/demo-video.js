// Demo player: autoplays muted once 55% of it is on screen and pauses when it leaves (skipped under
// prefers-reduced-motion or after the viewer pauses it themselves), a "Sound on" toggle, a fallback
// if the file is missing, and GA4-style video events pushed to window.dataLayer.
(function () {
  "use strict";
  var video = document.getElementById("demo-video");
  if (!video) return;
  var toggle = document.getElementById("sound-toggle");
  var fallback = document.getElementById("video-fallback");
  var TITLE = "synter-loop explainer (71s)";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // --- dataLayer events (video_start, video_progress 25/50/75, video_complete) ---
  window.dataLayer = window.dataLayer || [];
  var started = false;
  var marks = {};
  var push = function (event, percent) {
    var duration = isFinite(video.duration) ? Math.round(video.duration) : 71;
    var payload = {
      event: event,
      video_title: TITLE,
      video_provider: "self-hosted",
      video_url: video.currentSrc || video.src,
      video_duration: duration,
      video_current_time: Math.round(video.currentTime),
      video_percent: percent,
    };
    window.dataLayer.push(payload);
  };
  video.addEventListener("play", function () {
    if (!started) {
      started = true;
      push("video_start", 0);
    }
  });
  video.addEventListener("timeupdate", function () {
    if (!started || !isFinite(video.duration) || video.duration === 0) return;
    var pct = (video.currentTime / video.duration) * 100;
    [25, 50, 75].forEach(function (m) {
      if (pct >= m && !marks[m]) {
        marks[m] = true;
        push("video_progress", m);
      }
    });
  });
  video.addEventListener("ended", function () {
    push("video_complete", 100);
    started = false; // a replay counts as a new view
    marks = {};
  });

  // --- Sound on toggle: aria-pressed mirrors whether sound is on ---
  var syncToggle = function () {
    if (!toggle) return;
    toggle.setAttribute("aria-pressed", String(!video.muted));
  };
  if (toggle) {
    toggle.addEventListener("click", function () {
      video.muted = !video.muted;
      if (!video.muted && video.paused) {
        userPaused = false;
        video.play().catch(function () {});
      }
      syncToggle();
    });
  }
  video.addEventListener("volumechange", syncToggle);
  syncToggle();

  // --- In-view autoplay, muted; pause when it scrolls out ---
  var userPaused = false;
  var observerPausing = false;
  video.addEventListener("pause", function () {
    if (observerPausing) observerPausing = false;
    else if (!video.ended) userPaused = true;
  });
  video.addEventListener("play", function () { userPaused = false; });

  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.intersectionRatio >= 0.55) {
          if (!reduce && !userPaused && video.paused && !video.ended) {
            if (!started) video.muted = true; // autoplay is only allowed muted
            syncToggle();
            video.play().catch(function () {});
          }
        } else if (!video.paused) {
          observerPausing = true;
          video.pause();
        }
      });
    }, { threshold: [0, 0.55] });
    io.observe(video);
  }

  // --- Fallback if the file is missing or cannot be decoded ---
  video.addEventListener("error", function () {
    video.hidden = true;
    if (toggle) toggle.hidden = true;
    if (fallback) fallback.hidden = false;
  });
})();
