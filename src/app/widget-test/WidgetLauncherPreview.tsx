"use client";

import { useEffect } from "react";

export default function WidgetLauncherPreview({
  demoId,
  businessName,
  primaryColor,
}: {
  demoId: string;
  businessName: string;
  primaryColor: string;
}) {
  useEffect(() => {
    const script = document.createElement("script");
    script.src = `${window.location.origin}/pulsetech-widget.js`;
    script.async = true;
    script.dataset.demoId = demoId;
    script.dataset.title = `Chat with ${businessName}`;
    script.dataset.accent = primaryColor;
    document.body.appendChild(script);

    return () => {
      script.remove();
      document.getElementById(`pulsetech-widget-${demoId}`)?.remove();
    };
  }, [demoId, businessName, primaryColor]);

  return null;
}
