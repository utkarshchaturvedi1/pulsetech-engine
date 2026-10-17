(function () {
  var script = document.currentScript;
  if (!script || script.dataset.pulsetechLoaded === "true") return;

  var demoId = script.dataset.demoId || "";
  if (!/^[A-Za-z0-9_-]+$/.test(demoId)) return;
  script.dataset.pulsetechLoaded = "true";

  var baseUrl = new URL(script.src, window.location.href).origin;
  var title = script.dataset.title || "Chat with us";
  var accent = script.dataset.accent || "#2563eb";
  if (!/^#[0-9a-f]{3,8}$/i.test(accent)) accent = "#2563eb";

  var root = document.createElement("div");
  root.id = "pulsetech-widget-" + demoId;
  root.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483000;font-family:Arial,sans-serif;";

  var panel = document.createElement("div");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", title);
  panel.style.cssText = "display:none;position:absolute;right:0;bottom:76px;width:min(380px,calc(100vw - 32px));height:560px;max-height:calc(100vh - 112px);border:1px solid rgba(15,23,42,.12);border-radius:18px;background:#fff;overflow:hidden;box-shadow:0 18px 55px rgba(15,23,42,.28);";
  panel.style.height = "min(560px,calc(100dvh - 112px))";

  var frame = document.createElement("iframe");
  frame.title = title;
  frame.loading = "lazy";
  frame.referrerPolicy = "strict-origin-when-cross-origin";
  frame.style.cssText = "display:block;width:100%;height:100%;border:0;background:#fff;";
  panel.appendChild(frame);

  var button = document.createElement("button");
  button.type = "button";
  button.setAttribute("aria-label", "Open chat");
  button.setAttribute("aria-expanded", "false");
  button.title = "Chat with us";
  button.style.cssText = "display:flex;align-items:center;justify-content:center;width:60px;height:60px;border:0;border-radius:50%;background:" + accent + ";color:#fff;box-shadow:0 8px 24px rgba(15,23,42,.28);cursor:pointer;";

  var chatIcon = '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" aria-hidden="true"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H6l-3 2v-5.5A7.5 7.5 0 1 1 20 11.5Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M7.5 11.5h.01M12 11.5h.01M16.5 11.5h.01" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>';
  var closeIcon = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';

  function setOpen(open) {
    panel.style.display = open ? "block" : "none";
    button.setAttribute("aria-expanded", String(open));
    button.setAttribute("aria-label", open ? "Close chat" : "Open chat");
    button.title = open ? "Close chat" : "Chat with us";
    button.innerHTML = open ? closeIcon : chatIcon;
    if (open && !frame.src) {
      frame.src = baseUrl + "/widget/" + encodeURIComponent(demoId);
    }
  }

  button.innerHTML = chatIcon;
  button.addEventListener("click", function () {
    setOpen(panel.style.display !== "block");
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && panel.style.display === "block") setOpen(false);
  });

  root.appendChild(panel);
  root.appendChild(button);
  document.body.appendChild(root);
})();