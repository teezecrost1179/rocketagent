/* Rocket Reception Widget (universal) */
/* eslint-disable @typescript-eslint/no-explicit-any */
(function () {
  "use strict";

  type WidgetConfig = {
    apiBase?: string;
    subscriber?: string;
    routingSubscriber?: string;
    transferPreselect?: string;

    // Branding
    title?: string;
    subtitle?: string;
    greeting?: string;

    // Logo/avatar
    avatarUrl?: string;

    // Colors
    widgetPrimaryColorHex?: string;
    widgetSecondaryColorHex?: string;

    // UI
    position?: string; // t, tr, r, br, b, bl, l, tl
    offsetX?: number;
    offsetY?: number;

    // Behavior
    offline?: boolean;
    theme?: "dark" | "light";
  };

  let _initialized = false;
  let _api: { open: () => void; close: () => void; reset: () => void } | null = null;

  const defaultOptions: Required<
    Pick<
      WidgetConfig,
      | "apiBase"
      | "position"
      | "offsetX"
      | "offsetY"
      | "title"
      | "subtitle"
      | "greeting"
      | "theme"
      | "widgetPrimaryColorHex"
      | "widgetSecondaryColorHex"
    >
  > = {
    apiBase: "",
    position: "br",
    offsetX: 20,
    offsetY: 20,
    title: "Rocket Reception",
    subtitle: "AI receptionist",
    greeting: "Hi! How can I help today?",
    theme: "dark",
    widgetPrimaryColorHex: "#081d49",
    widgetSecondaryColorHex: "#c6c6c6"
  };

  const DEFAULT_AVATAR_URL = "https://rocketreception.ca/assets/rocket-reception.png";

  function mergeOptions(base: WidgetConfig, override?: WidgetConfig): WidgetConfig {
    const out: WidgetConfig = { ...base };
    if (!override) return out;
    Object.keys(override).forEach((k) => {
      (out as any)[k] = (override as any)[k];
    });
    return out;
  }

  function normalizeHexColor(value?: string): string | null {
    if (!value) return null;
    const raw = value.trim().toLowerCase();
    if (!raw) return null;
    const hex = raw.startsWith("#") ? raw.slice(1) : raw;
    if (hex.length === 3) {
      if (!/^[0-9a-f]{3}$/.test(hex)) return null;
      return "#" + hex.split("").map((c) => c + c).join("");
    }
    if (!/^[0-9a-f]{6}$/.test(hex)) return null;
    return "#" + hex;
  }

  function relativeLuminance(hexColor: string): number {
    const hex = hexColor.replace("#", "");
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    const toLinear = (c: number) =>
      c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    const rl = toLinear(r);
    const gl = toLinear(g);
    const bl = toLinear(b);
    return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
  }

  function getButtonTextColor(primaryHex?: string): string {
    const normalized = normalizeHexColor(primaryHex || "");
    if (!normalized) return "#f9fafb";
    const luminance = relativeLuminance(normalized);
    return luminance < 0.5 ? "#f3f4f6" : "#111827";
  }

  function normalizeApiBase(apiBase?: string): string {
    if (!apiBase) return "";
    return apiBase.replace(/\/+$/, "");
  }

  function getChatStorageKey(subscriber?: string): string | null {
    const slug = (subscriber || "").trim().toLowerCase();
    if (!slug) return null;
    return "rcw_chat_id:" + slug;
  }

  function getInteractionStorageKey(subscriber?: string): string | null {
    const slug = (subscriber || "").trim().toLowerCase();
    if (!slug) return null;
    return "rcw_interaction_id:" + slug;
  }

  function loadChatId(subscriber?: string): string | null {
    const key = getChatStorageKey(subscriber);
    if (!key) return null;
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function saveChatId(subscriber: string | undefined, chatId: string | null) {
    const key = getChatStorageKey(subscriber);
    if (!key) return;
    try {
      if (chatId) localStorage.setItem(key, chatId);
      else localStorage.removeItem(key);
    } catch {
      // Ignore storage errors (private mode, blocked, etc.)
    }
  }

  function loadInteractionId(subscriber?: string): string | null {
    const key = getInteractionStorageKey(subscriber);
    if (!key) return null;
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function saveInteractionId(subscriber: string | undefined, interactionId: string | null) {
    const key = getInteractionStorageKey(subscriber);
    if (!key) return;
    try {
      if (interactionId) localStorage.setItem(key, interactionId);
      else localStorage.removeItem(key);
    } catch {
      // Ignore storage errors (private mode, blocked, etc.)
    }
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
      subscriber: d.subscriber || "",
      routingSubscriber: d.routingSubscriber || "",
      transferPreselect: d.transferPreselect || ""
    };
  }


  function injectStyles() {
    if (document.getElementById("rocket-chat-widget-styles")) return;

    const css = `
      @import url('https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&display=swap');
      .rcw-root {
        position: fixed;
        z-index: 999999;
        font-family: "Figtree","Segoe UI",-apple-system,BlinkMacSystemFont,"Helvetica Neue",sans-serif;
        color: #f9fafb;
        --rcw-primary-color: #081d49;
        --rcw-secondary-color: #c6c6c6;
      }
      .rcw-bubble {
        width: 71px;
        height: 71px;
        background: transparent;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        color: var(--rcw-primary-color);
        transition: transform 160ms ease, filter 160ms ease;
        animation: rcw-float 4s ease-in-out infinite;
        z-index: 1;
      }
      .rcw-bubble:hover {
        transform: translateY(-2px);
        filter: drop-shadow(0 6px 12px rgba(0,0,0,0.18));
        animation-play-state: paused;
      }
      .rcw-root.rcw-open .rcw-bubble {
        animation-play-state: paused;
      }
      .rcw-bubble-icon {
        width: 46px;
        height: 46px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .rcw-bubble-icon svg {
        width: 46px;
        height: 46px;
        display: block;
        filter: drop-shadow(0 6px 12px rgba(0,0,0,0.35));
      }
      @keyframes rcw-float {
        0% { transform: translate(0, 0); }
        25% { transform: translate(2px, -2px); }
        50% { transform: translate(0, -3px); }
        75% { transform: translate(-2px, -1px); }
        80% { transform: translate(0, 0); }
        100% { transform: translate(0, 0); }
      }
      .rcw-panel {
        position: absolute;
        width: 340px;
        max-width: calc(100vw - 40px);
        height: 470px;
        max-height: calc(100vh - 80px);
        border-radius: 16px;
        overflow: hidden;
        background: radial-gradient(circle at top left, #111827 0, #020617 55%);
        box-shadow: 0 20px 40px rgba(0,0,0,0.8);
        border: 2px solid var(--rcw-primary-color);
        display: none;
        flex-direction: column;
        z-index: 2;
      }
      .rcw-root.rcw-open .rcw-panel {
        display: flex;
      }
      .rcw-header {
        padding: 10px 12px;
        border-bottom: none;
        display: flex;
        align-items: center;
        background: #000;
      }
      .rcw-header-left {
        display: flex;
        align-items: center;
        gap: 10px;
        flex: 1 1 auto;
        min-width: 0;
      }
      .rcw-header-avatar {
        width: 39px;
        height: 39px;
        border-radius: 50%;
        background: var(--rcw-secondary-color);
        border: 2px solid #fff;
        box-sizing: border-box;
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
        font-size: 16px;
        font-weight: 600;
        color: #fff;
        text-transform: uppercase;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .rcw-header-subtitle {
        font-size: 12px;
        color: #fff;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .rcw-header-close {
        border: none;
        background: transparent;
        color: #fff;
        cursor: pointer;
        font-size: 22px;
        font-weight: 700;
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
        background: #b0b0b0;
      }
      .rcw-status {
        font-size: 11px;
        color: #111827;
        padding: 0 10px 6px;
      }
      .rcw-footer {
        padding: 8px;
        border-top: none;
        background: #000;
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: 6px;
      }
      .rcw-input {
        width: 100%;
        padding: 8px 10px;
        border-radius: 10px;
        border: 1px solid #fff;
        background: #000 !important;
        color: #fff !important;
        font-size: 14px;
        font-family: inherit;
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
        color: #fff;
      }
      .rcw-send {
        align-self: flex-end;
        border: none;
        border-radius: 999px;
        padding: 6px 12px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        background: var(--rcw-primary-color);
        color: var(--rcw-send-text-color);
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
        font-size: 14px;
        line-height: 1.4;
        word-wrap: break-word;
        white-space: pre-wrap;
      }
      .rcw-msg-row.rcw-agent .rcw-msg-bubble {
        background: #464646;
        border: 1px solid var(--rcw-primary-color);
        color: #fff;
      }
      .rcw-msg-row.rcw-user .rcw-msg-bubble {
        background: #000;
        border: 1px solid #fff;
        color: #fff;
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
        .rcw-bubble {
          width: 64px;
          height: 64px;
        }
        .rcw-panel {
          width: calc(100vw - 24px);
          height: calc(100vh - 40px);
        }
      }
      @media (min-width: 1280px) {
        .rcw-bubble {
          width: 89px;
          height: 89px;
        }
        .rcw-bubble-icon {
          width: 58px;
          height: 58px;
        }
        .rcw-bubble-icon svg {
          width: 58px;
          height: 58px;
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

    if (isBottom) panelEl.style.bottom = "0";
    else panelEl.style.top = "0";

    if (isLeft) panelEl.style.left = "0";
    else panelEl.style.right = "0";
  }

  function createWidget(options: WidgetConfig) {
    injectStyles();

    const root = document.createElement("div");
    root.className = "rcw-root";
    // Apply subscriber-specific colors (fall back to defaults).
    const resolvedPrimary =
      normalizeHexColor(options.widgetPrimaryColorHex) || defaultOptions.widgetPrimaryColorHex;
    root.style.setProperty("--rcw-primary-color", resolvedPrimary);
    root.style.setProperty(
      "--rcw-secondary-color",
      normalizeHexColor(options.widgetSecondaryColorHex) || defaultOptions.widgetSecondaryColorHex
    );
    root.style.setProperty("--rcw-send-text-color", getButtonTextColor(resolvedPrimary));

    const bubble = document.createElement("div");
    bubble.className = "rcw-bubble";

    const icon = document.createElement("div");
    icon.className = "rcw-bubble-icon";
    icon.innerHTML = `
      <svg class="rocketChatBubble" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 86.91">
        <path fill="currentColor" d="M48.38,62.2c-1.14,0-1.96.97-2.35,1.37-5.47,5.59-10.64,11.95-15.96,17.75-1.24,1.35-4.11,4.87-5.64,5.37-1.75.58-3.75-.04-4.67-1.67-.08-.14-.5-1.09-.5-1.15v-21.67c-3.84-.09-7.5.46-11.14-1.04C3.75,59.36.46,55.2,0,50.43V11.9C.55,5.41,6.19.4,12.59,0h64.68c6.65.37,12.11,5.36,12.73,12.04,0,0,0,30.11,0,38.26s-4.57,11.91-10.39,11.91-23.31-.01-31.22-.01Z" />
        <path fill="#fff" d="M26.56,74.31l14.38-15.96c1.16-1.62,2.46-2.6,4.56-2.76,0,0,29.07,0,32.32,0s5.54-1.77,5.54-5.87.29-25.09,0-38.06c-.83-3.06-3.22-4.86-6.36-5.05H13.28c-3.4,0-6.4,2.34-6.67,5.84v37.3c1.04,8.42,10.84,5.22,16.69,5.88,1.39.16,3.02,1.15,3.27,2.65v16.03Z" />
        <path fill="currentColor" d="M44.14,24.67c3.81-.52,7.02,2.75,5.99,6.54-1.68,6.14-11.04,4.62-10.21-2.36.23-1.94,2.3-3.91,4.22-4.18Z" />
        <path fill="currentColor" d="M24.6,24.67c6.56-.9,8.33,8.45,2.35,10.19-7.18,2.08-9.49-9.21-2.35-10.19Z" />
        <path fill="currentColor" d="M63.96,24.67c7.14-.98,8.18,9.9,1.06,10.42-6.4.47-7.57-9.53-1.06-10.42Z" />
      </svg>
    `;
    bubble.appendChild(icon);

    const panel = document.createElement("div");
    panel.className = "rcw-panel";

    // Header
    const header = document.createElement("div");
    header.className = "rcw-header";

    const avatar = document.createElement("div");
    avatar.className = "rcw-header-avatar";

    const avatarUrl = options.avatarUrl || DEFAULT_AVATAR_URL;
    if (avatarUrl) {
      avatar.style.background = "transparent";
      const img = document.createElement("img");
      img.src = avatarUrl;
      img.alt = options.title || "Chat";
      img.style.width = "90%";
      img.style.height = "90%";
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

    // Branding uses subscriber; routing can be overridden separately.
    let chatId: string | null = loadChatId(options.subscriber);
    let interactionId: string | null = loadInteractionId(options.subscriber);
    let phonePromptShown = false;
    let contactPhoneKnown = false;
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

    function resetSession() {
      chatId = null;
      interactionId = null;
      saveChatId(options.subscriber, null);
      saveInteractionId(options.subscriber, null);
      messagesEl.innerHTML = "";
      if (options.greeting) appendMessage("agent", options.greeting);
      setStatus("");
    }

    function sendMessage(text: string) {
      if (!text || !text.trim() || sending) return;

      if (!canChat()) {
        appendMessage("agent", "Sorry – I can’t connect right now. Please try again later.");
        return;
      }

      if (text.trim().toLowerCase() === "/reset") {
        resetSession();
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
        interactionId: interactionId,
        subscriber: options.subscriber || undefined,
        routingSubscriber: options.routingSubscriber || undefined,
        transferPreselect: options.transferPreselect || undefined
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
          saveChatId(options.subscriber, chatId);
          interactionId = (result.data && result.data.interactionId) || interactionId;
          saveInteractionId(options.subscriber, interactionId);
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
        // Prompt for phone only once, when we don't already have an interaction id.
        if (!phonePromptShown && !interactionId && !options.offline) {
          appendMessage(
            "agent",
            "If you share your phone number, I can check past conversations and remember this one."
          );
          phonePromptShown = true;
        }
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

    // Look up contact phone and show prompt only if we don't have one.
    if (interactionId && !options.offline) {
      const contactUrl =
        normalizeApiBase(options.apiBase) +
        "/chat/contact-phone?interactionId=" +
        encodeURIComponent(interactionId);
      fetch(contactUrl)
        .then((resp) => resp.json())
        .then((data) => {
          contactPhoneKnown = !!(data && data.contactPhoneE164);
          if (!contactPhoneKnown && !phonePromptShown) {
            appendMessage(
              "agent",
              "If you share your phone number, I can check past conversations and remember this one."
            );
            phonePromptShown = true;
          }
        })
        .catch(() => {});
    } else if (!interactionId && !options.offline) {
      appendMessage(
        "agent",
        "If you share your phone number, I can check past conversations and remember this one."
      );
      phonePromptShown = true;
    }

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
      },
      reset: () => {
        resetSession();
      },
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
        document.addEventListener("DOMContentLoaded", () => {
          _api = createWidget(finalOpts);
        });
      } else {
        _api = createWidget(finalOpts);
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
  const RocketChatWidget = {
    init,
    open: () => _api?.open(),
    close: () => _api?.close(),
    reset: () => _api?.reset(),
  };

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
