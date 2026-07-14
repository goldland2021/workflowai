import { WIDGET_STATE_MESSAGE_TYPE } from "./protocol";

const CLOSED_WIDGET_SIZE = 88;
const OPEN_WIDGET_WIDTH = 420;
const OPEN_WIDGET_HEIGHT = 620;

export function buildWidgetEmbedScript(baseUrl: string, widgetSrc: string) {
  return `
(function() {
  // Don't load twice
  if (window.__waiWidgetLoaded) return;
  window.__waiWidgetLoaded = true;

  var BASE = ${JSON.stringify(baseUrl)};
  var widgetOpen = false;

  // Create container
  var container = document.createElement("div");
  container.id = "wai-widget-container";
  container.style.cssText = "all:initial;position:fixed;z-index:999999;bottom:0;right:0;width:0;height:0;";
  document.body.appendChild(container);

  // Create iframe. Keep its closed hit area small so the transparent frame
  // cannot block the host website behind it.
  var iframe = document.createElement("iframe");
  iframe.src = BASE + ${JSON.stringify(widgetSrc)}
    + "&origin=" + encodeURIComponent(window.location.origin)
    + "&lang=" + encodeURIComponent(document.documentElement.lang || "en");
  iframe.style.cssText = "border:none;width:${CLOSED_WIDGET_SIZE}px;height:${CLOSED_WIDGET_SIZE}px;position:fixed;bottom:0;right:0;z-index:999999;background:transparent;pointer-events:none;";
  iframe.title = "Chat Widget";
  iframe.setAttribute("aria-label", "Chat Widget");
  document.body.appendChild(iframe);

  function applyWidgetSize() {
    var width = widgetOpen ? Math.min(window.innerWidth, ${OPEN_WIDGET_WIDTH}) : ${CLOSED_WIDGET_SIZE};
    var height = widgetOpen ? Math.min(window.innerHeight, ${OPEN_WIDGET_HEIGHT}) : ${CLOSED_WIDGET_SIZE};
    iframe.style.width = width + "px";
    iframe.style.height = height + "px";
  }

  function handleWidgetMessage(event) {
    if (event.source !== iframe.contentWindow || event.origin !== BASE) return;
    var data = event.data;
    if (!data || data.type !== ${JSON.stringify(WIDGET_STATE_MESSAGE_TYPE)} || typeof data.isOpen !== "boolean") return;
    widgetOpen = data.isOpen;
    applyWidgetSize();
  }

  window.addEventListener("message", handleWidgetMessage);
  window.addEventListener("resize", applyWidgetSize);

  iframe.onload = function() {
    applyWidgetSize();
    iframe.style.pointerEvents = "auto";
  };
})();
`;
}
