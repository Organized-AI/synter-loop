document.addEventListener("DOMContentLoaded", () => {
  const media = document.querySelector(".demo-media");
  const video = media?.querySelector("video");
  if (video) {
    video.addEventListener("loadedmetadata", () => media.classList.add("has-video"), { once: true });
    video.addEventListener("error", () => media.classList.remove("has-video"), { once: true });
    video.load();
  }
  if (window.gsap) {
    window.gsap.from(".hero-copy > *", { y: 18, opacity: 0, duration: 0.8, stagger: 0.08, ease: "power2.out" });
    window.gsap.from(".visual", { opacity: 0, scale: 0.96, duration: 1.1, delay: 0.2, ease: "power2.out" });
    window.gsap.to(".core", { scale: 1.06, duration: 2.4, yoyo: true, repeat: -1, ease: "sine.inOut" });
  }
});
