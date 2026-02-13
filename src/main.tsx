import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let activeAnimationFrame: number | null = null;

const smoothScrollToY = (targetY: number, duration = 900) => {
  if (prefersReducedMotion()) {
    window.scrollTo(0, targetY);
    return;
  }

  if (activeAnimationFrame !== null) {
    cancelAnimationFrame(activeAnimationFrame);
    activeAnimationFrame = null;
  }

  const startY = window.scrollY;
  const distance = targetY - startY;
  const startTime = performance.now();

  // Ease-in-out cubic for a more premium, less abrupt feel.
  const easeInOutCubic = (t: number) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  const step = (now: number) => {
    const elapsed = now - startTime;
    const progress = Math.min(1, elapsed / duration);
    const eased = easeInOutCubic(progress);

    window.scrollTo(0, startY + distance * eased);

    if (progress < 1) {
      activeAnimationFrame = requestAnimationFrame(step);
    } else {
      activeAnimationFrame = null;
    }
  };

  activeAnimationFrame = requestAnimationFrame(step);
};

const initGlobalSmoothScroll = () => {
  const offset = 8;

  document.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    const anchor = target?.closest('a[href^="#"]') as HTMLAnchorElement | null;
    if (!anchor) return;

    const hash = anchor.getAttribute("href");
    if (!hash || hash === "#") return;

    const element = document.querySelector(hash) as HTMLElement | null;
    if (!element) return;

    event.preventDefault();
    const y = element.getBoundingClientRect().top + window.scrollY - offset;
    smoothScrollToY(Math.max(0, y));
    history.pushState(null, "", hash);
  });
};

initGlobalSmoothScroll();

createRoot(document.getElementById("root")!).render(<App />);
