import { describe, expect, it } from "vitest";
import { buildWidgetEmbedScript } from "./embed-script";

describe("buildWidgetEmbedScript", () => {
  it("keeps the closed iframe hit area small and expands it from widget state messages", () => {
    const script = buildWidgetEmbedScript(
      "https://workflowai.example",
      "/widget?company=company-1&token=token-1",
    );

    expect(script).toContain("width:88px;height:88px");
    expect(script).toContain('data.type !== "workflowai:widget-state"');
    expect(script).toContain("widgetOpen = data.isOpen");
    expect(script).toContain("Math.min(window.innerWidth, 420)");
    expect(script).toContain("Math.min(window.innerHeight, 620)");
    expect(script).toContain("event.source !== iframe.contentWindow");
    expect(script).toContain("event.origin !== BASE");
  });
});
