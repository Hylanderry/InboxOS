import * as React from "react";

export type HorizontalViewport = "compact" | "mobile" | "tablet" | "desktop";
export type VerticalViewport = "short" | "regular" | "tall";

export type ViewportDimensions = { width: number; height: number };

export function classifyViewport({ width, height }: ViewportDimensions) {
  const horizontal: HorizontalViewport =
    width < 480 ? "compact" : width < 768 ? "mobile" : width < 1024 ? "tablet" : "desktop";
  const vertical: VerticalViewport = height < 560 ? "short" : height < 900 ? "regular" : "tall";
  return {
    horizontal,
    vertical,
    orientation: (width > height ? "landscape" : "portrait") as "landscape" | "portrait",
    isDesktop: horizontal === "desktop",
  };
}

function snapshot() {
  if (typeof window === "undefined") return classifyViewport({ width: 1024, height: 768 });
  return classifyViewport({ width: window.innerWidth, height: window.innerHeight });
}

export function useResponsiveViewport() {
  const [value, setValue] = React.useState(snapshot);
  React.useEffect(() => {
    const update = () => setValue(snapshot());
    const queries = [
      "(max-width: 479px)",
      "(min-width: 480px) and (max-width: 767px)",
      "(min-width: 768px) and (max-width: 1023px)",
      "(min-width: 1024px)",
      "(max-height: 559px)",
      "(min-height: 560px) and (max-height: 899px)",
      "(min-height: 900px)",
      "(orientation: portrait)",
    ].map((q) => window.matchMedia(q));
    queries.forEach((q) => q.addEventListener("change", update));
    window.addEventListener("resize", update, { passive: true });
    return () => {
      queries.forEach((q) => q.removeEventListener("change", update));
      window.removeEventListener("resize", update);
    };
  }, []);
  return value;
}
