/* Rocket Reception Widget (universal) */
/* eslint-disable @typescript-eslint/no-explicit-any */
(function () {
  "use strict";

  type WidgetConfig = {
    apiBase?: string;
    subscriber?: string;

    // Branding
    title?: string;
    subtitle?: string;
    greeting?: string;

    // Logo/avatar
    avatarUrl?: string;

    // UI
    position?: string; // t, tr, r, br, b, bl, l, tl
    offsetX?: number;
    offsetY?: number;

    // Behavior
    offline?: boolean;
    theme?: "dark" | "light";
  };

  let _initialized = false;

  const defaultOptions: Required<
    Pick<
      WidgetConfig,
      "apiBase" | "position" | "offsetX" | "offsetY" | "title" | "subtitle" | "greeting" | "theme"
    >
  > = {
    apiBase: "",
    position: "br",
    offsetX: 20,
    offsetY: 20,
    title: "Rocket Reception",
    subtitle: "AI receptionist",
    greeting: "Hi! How can I help today?",
    theme: "dark"
  };

  function mergeOptions(base: WidgetConfig, override?: WidgetConfig): WidgetConfig {
    const out: WidgetConfig = { ...base };
    if (!override) return out;
    Object.keys(override).forEach((k) => {
      (out as any)[k] = (override as any)[k];
    });
    return out;
  }

  function normalizeApiBase(apiBase?: string): string {
    if (!apiBase) return "";
    return apiBase.replace(/\/+$/, "");
  }

  function findWidgetScriptTag(): HTMLScriptElement | null {
    // Match your hosted URL (adjust if needed)
    const candidates = Array.from(document.getElementsByTagName("script"));
    return (
      candidates.find((s) => (s.src || "").includes("widget.rocketreception.ca/widget.js")) ||
      candidates.find((s) => (s.src || "").endsWith("/widget.js")) ||
      null
    );
  }

  function getDatasetOptions(): WidgetConfig {
    const s = findWidgetScriptTag();
    if (!s) return {};
    const d = (s as any).dataset || {};
    return {
      apiBase: d.apiBase || "",
      subscriber: d.subscriber || ""
    };
  }


  function injectStyles() {
    if (document.getElementById("rocket-chat-widget-styles")) return;

    const css = `
      .rcw-root {
        position: fixed;
        z-index: 999999;
        font-family: system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
        color: #f9fafb;
      }
      .rcw-bubble {
        width: 52px;
        height: 52px;
        border-radius: 999px;
        background: radial-gradient(circle at 30% 30%, #facc15 0, #f97316 40%, #0f172a 85%);
        box-shadow: 0 10px 25px rgba(0,0,0,0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        border: 1px solid rgba(15,23,42,0.7);
      }
      .rcw-bubble-icon {
        font-size: 26px;
        transform: translateY(1px);
      }
      .rcw-panel {
        position: absolute;
        width: 340px;
        max-width: calc(100vw - 40px);
        height: 420px;
        max-height: calc(100vh - 80px);
        border-radius: 16px;
        overflow: hidden;
        background: radial-gradient(circle at top left, #111827 0, #020617 55%);
        box-shadow: 0 20px 40px rgba(0,0,0,0.8);
        border: 1px solid rgba(148,163,184,0.3);
        display: none;
        flex-direction: column;
      }
      .rcw-root.rcw-open .rcw-panel {
        display: flex;
      }
      .rcw-header {
        padding: 10px 12px;
        border-bottom: 1px solid rgba(148,163,184,0.3);
        display: flex;
        align-items: center;
        background: linear-gradient(135deg,#111827,#020617);
      }
      .rcw-header-left {
        display: flex;
        align-items: center;
        gap: 10px;
        flex: 1 1 auto;
        min-width: 0;
      }
      .rcw-header-avatar {
        width: 30px;
        height: 30px;
        border-radius: 50%;
        background: radial-gradient(circle at 30% 30%, #facc15 0, #f97316 40%, #0f172a 85%);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
        flex-shrink: 0;
        overflow: hidden;
      }
      .rcw-header-text {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }
      .rcw-header-title {
        font-size: 13px;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .rcw-header-subtitle {
        font-size: 11px;
        color: #9ca3af;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .rcw-header-close {
        border: none;
        background: transparent;
        color: #9ca3af;
        cursor: pointer;
        font-size: 18px;
        padding: 0 6px;
        line-height: 1;
        margin-left: 8px;
        width: auto;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .rcw-messages {
        flex: 1;
        padding: 10px 10px 4px;
        overflow-y: auto;
        background: radial-gradient(circle at top,#020617 0,#000 60%);
      }
      .rcw-status {
        font-size: 10px;
        color: #9ca3af;
        padding: 0 10px 6px;
      }
      .rcw-footer {
        padding: 8px;
        border-top: 1px solid rgba(148,163,184,0.3);
        background: #020617;
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: 6px;
      }
      .rcw-input {
        width: 100%;
        padding: 8px 10px;
        border-radius: 10px;
        border: 1px solid rgba(148,163,184,0.6);
        background: #020617 !important;
        color: #e5e7eb !important;
        font-size: 13px;
        outline: none;
        min-height: 40px;
        max-height: 90px;
        resize: none;
        line-height: 1.4;
        box-sizing: border-box;
        margin: 0;
        display: block;
      }
      .rcw-input::placeholder {
        color: #6b7280;
      }
      .rcw-send {
        align-self: flex-end;
        border: none;
        border-radius: 999px;
        padding: 6px 12px;
        font-size: 11px;
        font-weight: 500;
        cursor: pointer;
        background: linear-gradient(135deg,#22c55e,#16a34a);
        color: #022c22;
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
      .rcw-send[disabled] {
        opacity: 0.5;
        cursor: default;
      }
      .rcw-msg-row {
        margin-bottom: 8px;
        display: flex;
      }
      .rcw-msg-row.rcw-user { justify-content: flex-end; }
      .rcw-msg-row.rcw-agent { justify-content: flex-start; }
      .rcw-msg-bubble {
        max-width: 80%;
        padding: 7px 10px;
        border-radius: 14px;
        font-size: 13px;
        line-height: 1.4;
        word-wrap: break-word;
        white-space: pre-wrap;
      }
      .rcw-msg-row.rcw-agent .rcw-msg-bubble {
        background: rgba(15,23,42,0.95);
        border: 1px solid rgba(148,163,184,0.6);
      }
      .rcw-msg-row.rcw-user .rcw-msg-bubble {
        background: #4f46e5;
        border: 1px solid rgba(199,210,254,0.7);
      }
      .rcw-typing {
        display: inline-block;
        width: 18px;
        text-align: center;
      }
      .rcw-typing span {
        display: inline-block;
        width: 3px;
        height: 3px;
        margin: 0 1px;
        border-radius: 999px;
        background: #9ca3af;
        animation: rcw-typing 1s infinite ease-in-out;
      }
      .rcw-typing span:nth-child(2) { animation-delay: 0.15s; }
      .rcw-typing span:nth-child(3) { animation-delay: 0.3s; }
      @keyframes rcw-typing {
        0%,60%,100% { transform: translateY(0); opacity: 0.7; }
        30% { transform: translateY(-3px); opacity: 1; }
      }
      @media (max-width: 480px) {
        .rcw-panel {
          width: calc(100vw - 24px);
          height: calc(100vh - 40px);
        }
      }
    `;

    const style = document.createElement("style");
    style.id = "rocket-chat-widget-styles";
    style.type = "text/css";
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);
  }

  function applyPosition(rootEl: HTMLElement, panelEl: HTMLElement, position?: string, offsetX?: number, offsetY?: number) {
    rootEl.style.top = "";
    rootEl.style.right = "";
    rootEl.style.bottom = "";
    rootEl.style.left = "";
    rootEl.style.transform = "";

    const pos = (position || "br").toLowerCase();
    const ox = typeof offsetX === "number" ? offsetX : 20;
    const oy = typeof offsetY === "number" ? offsetY : 20;

    const isTop = pos.startsWith("t");
    const isBottom = pos.startsWith("b") || (!isTop && pos.includes("b"));
    const isLeft = pos.includes("l");
    const isRight = pos.includes("r");

    if (isTop) rootEl.style.top = oy + "px";
    else if (isBottom) rootEl.style.bottom = oy + "px";
    else {
      rootEl.style.top = "50%";
      rootEl.style.transform = "translateY(-50%)";
    }

    if (isLeft) rootEl.style.left = ox + "px";
    else if (isRight) rootEl.style.right = ox + "px";
    else {
      rootEl.style.left = "50%";
      rootEl.style.transform = (rootEl.style.transform || "") + " translateX(-50%)";
    }

    panelEl.style.bottom = "";
    panelEl.style.top = "";
    panelEl.style.left = "";
    panelEl.style.right = "";

    if (isBottom) panelEl.style.bottom = "60px";
    else panelEl.style.top = "60px";

    if (isLeft) panelEl.style.left = "0";
    else panelEl.style.right = "0";
  }

  function createWidget(options: WidgetConfig) {
    injectStyles();

    const root = document.createElement("div");
    root.className = "rcw-root";

    const bubble = document.createElement("div");
    bubble.className = "rcw-bubble";

    const icon = document.createElement("div");
    icon.className = "rcw-bubble-icon";
    icon.textContent = "💬";
    bubble.appendChild(icon);

    const panel = document.createElement("div");
    panel.className = "rcw-panel";

    // Header
    const header = document.createElement("div");
    header.className = "rcw-header";

    const avatar = document.createElement("div");
    avatar.className = "rcw-header-avatar";

    if (options.avatarUrl) {
      avatar.style.background = "transparent";
      const img = document.createElement("img");
      img.src = options.avatarUrl;
      img.alt = options.title || "Chat";
      img.style.width = "100%";
      img.style.height = "100%";
      img.style.objectFit = "cover";
      avatar.appendChild(img);
    } else {
      avatar.textContent = "🚀";
    }

    const headerText = document.createElement("div");
    headerText.className = "rcw-header-text";

    const titleEl = document.createElement("div");
    titleEl.className = "rcw-header-title";
    titleEl.textContent = options.title || defaultOptions.title;

    const subtitleEl = document.createElement("div");
    subtitleEl.className = "rcw-header-subtitle";
    subtitleEl.textContent = options.subtitle || defaultOptions.subtitle;

    headerText.appendChild(titleEl);
    headerText.appendChild(subtitleEl);

    const closeBtn = document.createElement("button");
    closeBtn.className = "rcw-header-close";
    closeBtn.type = "button";
    closeBtn.innerHTML = "&times;";

    const headerLeft = document.createElement("div");
    headerLeft.className = "rcw-header-left";
    headerLeft.appendChild(avatar);
    headerLeft.appendChild(headerText);

    header.appendChild(headerLeft);
    header.appendChild(closeBtn);

    // Body
    const messagesEl = document.createElement("div");
    messagesEl.className = "rcw-messages";

    const statusEl = document.createElement("div");
    statusEl.className = "rcw-status";

    // Footer
    const footer = document.createElement("div");
    footer.className = "rcw-footer";

    const input = document.createElement("textarea");
    input.className = "rcw-input";
    input.autocomplete = "off";
    input.placeholder = "Type a message…";

    const sendBtn = document.createElement("button");
    sendBtn.className = "rcw-send";
    sendBtn.type = "button";
    sendBtn.textContent = "Send";

    footer.appendChild(input);
    footer.appendChild(sendBtn);

    panel.appendChild(header);
    panel.appendChild(messagesEl);
    panel.appendChild(statusEl);
    panel.appendChild(footer);

    root.appendChild(panel);
    root.appendChild(bubble);
    document.body.appendChild(root);

    applyPosition(root, panel, options.position, options.offsetX, options.offsetY);

    let chatId: string | null = null;
    let sending = false;

    function appendMessage(role: "user" | "agent", text: string) {
      const row = document.createElement("div");
      row.className = "rcw-msg-row " + (role === "user" ? "rcw-user" : "rcw-agent");

      const bubbleEl = document.createElement("div");
      bubbleEl.className = "rcw-msg-bubble";
      bubbleEl.textContent = text;

      row.appendChild(bubbleEl);
      messagesEl.appendChild(row);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function setStatus(text?: string) {
      statusEl.textContent = text || "";
    }

    function createTypingIndicator(): HTMLDivElement {
      const row = document.createElement("div");
      row.className = "rcw-msg-row rcw-agent";
      const bubbleEl = document.createElement("div");
      bubbleEl.className = "rcw-msg-bubble";
      bubbleEl.innerHTML =
        '<span class="rcw-typing"><span></span><span></span><span></span></span>';
      row.appendChild(bubbleEl);
      messagesEl.appendChild(row);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return row;
    }

    function setOffline(reason?: string) {
      input.disabled = true;
      sendBtn.disabled = true;
      setStatus(reason || "Chat is temporarily unavailable.");
      // If there are no messages yet, give a clear agent message
      if (messagesEl.children.length === 0) {
        appendMessage("agent", "Sorry — I can’t connect right now. Please try again later.");
      }
    }

    function canChat(): boolean {
      return !!normalizeApiBase(options.apiBase) && !options.offline;
    }

    function sendMessage(text: string) {
      if (!text || !text.trim() || sending) return;

      if (!canChat()) {
        appendMessage("agent", "Sorry — I can’t connect right now. Please try again later.");
        return;
      }

      sending = true;
      sendBtn.disabled = true;
      input.disabled = true;

      appendMessage("user", text);
      input.value = "";
      setStatus("Thinking…");

      const typingRow = createTypingIndicator();

      const payload: any = {
        message: text,
        chatId: chatId,
        subscriber: options.subscriber || undefined
      };

      const url = normalizeApiBase(options.apiBase) + "/chat";

      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
        .then((resp) =>
          resp
            .json()
            .catch(() => ({}))
            .then((data) => ({ ok: resp.ok, data }))
        )
        .then((result) => {
          try {
            messagesEl.removeChild(typingRow);
          } catch {}

          if (!result.ok || (result.data && result.data.error)) {
            appendMessage("agent", "Sorry, I ran into an error. Please try again in a moment.");
            return;
          }

          chatId = (result.data && result.data.chatId) || chatId;
          const reply = (result.data && result.data.reply) || "(No response)";
          appendMessage("agent", reply);
        })
        .catch(() => {
          try {
            messagesEl.removeChild(typingRow);
          } catch {}
          appendMessage("agent", "Sorry — I can’t connect right now. Please try again later.");
          // Optionally go offline after a network error:
          // setOffline("Chat is temporarily unavailable.");
        })
        .finally(() => {
          sending = false;
          // If we’re offline, keep disabled
          if (!options.offline) {
            sendBtn.disabled = false;
            input.disabled = false;
            input.focus();
            setStatus("");
          }
        });
    }

    // Events
    bubble.addEventListener("click", () => {
      if (root.classList.contains("rcw-open")) {
        root.classList.remove("rcw-open");
      } else {
        root.classList.add("rcw-open");
        input.focus();
      }
    });

    closeBtn.addEventListener("click", () => {
      root.classList.remove("rcw-open");
    });

    sendBtn.addEventListener("click", () => {
      sendMessage(input.value);
    });

    input.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage(input.value);
      }
    });

    // Initial greeting
    if (options.greeting) appendMessage("agent", options.greeting);

    // Offline mode at boot (e.g. no apiBase)
    if (options.offline || !normalizeApiBase(options.apiBase)) {
      setOffline("Chat is temporarily unavailable.");
    }

    return {
      root,
      open: () => {
        root.classList.add("rcw-open");
        input.focus();
      },
      close: () => {
        root.classList.remove("rcw-open");
      }
    };
  }

  function init(userOptions?: WidgetConfig) {
    if (_initialized) {
      console.warn("RocketChatWidget.init called more than once; ignoring.");
      return;
    }
    _initialized = true;

    const datasetOpts = getDatasetOptions();
    let options = mergeOptions(defaultOptions, mergeOptions(datasetOpts, userOptions || {}));

    // If apiBase missing: render anyway but offline
    if (!options.apiBase) {
      console.warn("RocketChatWidget: apiBase missing; starting in offline mode.");
      options.offline = true;
    }

    const boot = (finalOpts: WidgetConfig) => {
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => createWidget(finalOpts));
      } else {
        createWidget(finalOpts);
      }
    };

    // If no subscriber, just boot with what we have
    const subscriber = (options.subscriber || "").trim();
    if (!subscriber) {
      boot(options);
      return;
    }

    // Fetch subscriber config (fail-open)
    const apiBase = normalizeApiBase(options.apiBase);
    if (!apiBase) {
      boot(options);
      return;
    }

    const cfgUrl = apiBase + "/widget-config?subscriber=" + encodeURIComponent(subscriber);

    fetch(cfgUrl)
      .then((r) => r.json())
      .then((cfg: WidgetConfig) => {
        // Merge: defaults < dataset+user < server cfg
        options = mergeOptions(options, cfg || {});
        boot(options);
      })
      .catch(() => {
        // Fail open: still render
        boot(options);
      });
  }

  // Expose globally
  const RocketChatWidget = { init };

  if (!(window as any).RocketChatWidget) {
    (window as any).RocketChatWidget = RocketChatWidget;
  } else {
    console.warn("window.RocketChatWidget already exists; not overwriting.");
  }

  // Auto-init if loaded via script include (optional convenience)
  // If you prefer manual init from the host page, comment this out.
  try {
  const s = findWidgetScriptTag();
  const auto = s?.dataset?.auto === "true";
  if (auto) init();
} catch {}
})();
