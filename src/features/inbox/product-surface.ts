import type { HorizontalViewport } from "@/hooks/use-responsive-viewport";

export function progressiveRenderLimit(viewport: HorizontalViewport): number {
  if (viewport === "compact") return 24;
  if (viewport === "mobile") return 32;
  if (viewport === "tablet") return 48;
  return 72;
}
