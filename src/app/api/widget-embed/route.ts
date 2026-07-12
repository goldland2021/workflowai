// Returns a JavaScript snippet for embedding the WorkflowAI chat widget
// Usage: <script src="https://your-domain.com/api/widget-embed"></script>

export const runtime = "nodejs";

const SCRIPT = (baseUrl: string) => `
(function() {
  // Don't load twice
  if (window.__waiWidgetLoaded) return;
  window.__waiWidgetLoaded = true;

  var BASE = ${JSON.stringify(baseUrl)};

  // Create container
  var container = document.createElement("div");
  container.id = "wai-widget-container";
  container.style.cssText = "all:initial;position:fixed;z-index:999999;bottom:0;right:0;width:0;height:0;";
  document.body.appendChild(container);

  // Create iframe
  var iframe = document.createElement("iframe");
  iframe.src = BASE + "/widget";
  iframe.style.cssText = "border:none;width:420px;height:620px;position:fixed;bottom:0;right:0;z-index:999999;background:transparent;pointer-events:none;";
  iframe.title = "Chat Widget";
  iframe.setAttribute("aria-label", "Chat Widget");
  document.body.appendChild(iframe);

  // Allow pointer events when iframe is interacted with
  iframe.onload = function() {
    iframe.style.pointerEvents = "auto";
  };
})();
`;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const baseUrl = url.origin;

  return new Response(SCRIPT(baseUrl), {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=3600, immutable",
    },
  });
}
