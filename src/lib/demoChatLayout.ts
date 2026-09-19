/** Demo workspace chat geometry. CSS in src/app/demo/demo-workspace.css must stay in sync. */
export const DEMO_CHAT_LAYOUT = {
  panelHeightPx: 560,
} as const;

/** Homepage live-chat shells. CSS in src/components/landing/landing.css must stay in sync. */
export const HOME_CHAT_LAYOUT = {
  desktopPanelHeightPx: 560,
  mobilePanelHeightPx: 430,
  mobileMaxWidthPx: 639,
} as const;

/** Canonical PulseTech navy-blue page canvas (desktop reference, used on mobile too). */
export const PULSETECH_CANVAS_GRADIENT =
  "linear-gradient(160deg, #023047 0%, #03485f 42%, #012536 100%)";
