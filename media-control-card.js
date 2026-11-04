/*
 * Media Control Card
 * Header, − / + volume stepper and a row of custom action buttons in one card.
 * Each section can be toggled; styling can be Mushroom or Bubble.
 * Based on the AC Control Card's temperature stepper.
 */
const TAG = "media-control-card";
const EDITOR_TAG = "media-control-card-editor";
const CARD_VERSION = "0.1.0-beta";

const STATE_META = {
  playing: { icon: "mdi:play", label: "Playing", rgb: "76,175,80" },
  paused: { icon: "mdi:pause", label: "Paused", rgb: "255,152,0" },
  buffering: { icon: "mdi:timer-sand", label: "Buffering", rgb: "33,150,243" },
  idle: { icon: "mdi:sleep", label: "Idle", rgb: "33,150,243" },
  on: { icon: "mdi:power", label: "On", rgb: "33,150,243" },
  standby: { icon: "mdi:power-sleep", label: "Standby", rgb: "142,142,147" },
  off: { icon: "mdi:power", label: "Off", rgb: "142,142,147" },
};
const OFF_RGB = STATE_META.off.rgb;
const UNAVAILABLE = ["unavailable", "unknown"];

const DEVICE_ICONS = {
  tv: "mdi:television",
  speaker: "mdi:speaker",
  receiver: "mdi:audio-video",
};

// Shorthand buttons: `- preset: play` (anything can be overridden per button).
const PRESETS = {
  play: { icon: "mdi:play", label: "Play", service: "media_player.media_play", active: { state: "playing" } },
  pause: { icon: "mdi:pause", label: "Pause", service: "media_player.media_pause", active: { state: "paused" } },
  play_pause: {
    icon: "mdi:play-pause", label: "Play/Pause", service: "media_player.media_play_pause", active: { state: "playing" },
  },
  stop: { icon: "mdi:stop", label: "Stop", service: "media_player.media_stop" },
  next: { icon: "mdi:skip-next", label: "Next", service: "media_player.media_next_track" },
  previous: { icon: "mdi:skip-previous", label: "Previous", service: "media_player.media_previous_track" },
  mute: {
    icon: "mdi:volume-off", label: "Mute", service: "media_player.volume_mute",
    data: (st) => ({ is_volume_muted: !st.attributes.is_volume_muted }),
    active: { attribute: "is_volume_muted", value: true },
  },
  volume_up: { icon: "mdi:volume-plus", label: "Vol +", service: "media_player.volume_up" },
  volume_down: { icon: "mdi:volume-minus", label: "Vol −", service: "media_player.volume_down" },
  power: { icon: "mdi:power", label: "Power", service: "media_player.toggle", active: { state: ["on", "playing", "paused", "idle", "buffering"] } },
  shuffle: {
    icon: "mdi:shuffle-variant", label: "Shuffle", service: "media_player.shuffle_set",
    data: (st) => ({ shuffle: !st.attributes.shuffle }),
    active: { attribute: "shuffle", value: true },
  },
};
const PRESET_OPTIONS = Object.keys(PRESETS);

const LAYOUT_OPTIONS = [
  { value: "volume_buttons", label: "Volume → Buttons" },
  { value: "buttons_volume", label: "Buttons → Volume" },
];
const DEFAULT_LAYOUT = "volume_buttons";
const parseLayout = (v) => {
  const o = String(v ?? "").split("_").filter((x) => x === "volume" || x === "buttons");
  return o.length === 2 && o[0] === "buttons" ? ["buttons", "volume"] : ["volume", "buttons"];
};

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const cap = (s) => String(s ?? "").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

// Accepts "#rgb", "#rrggbb", "r,g,b" or "rgb(r,g,b)" -> "r,g,b"
const toRgb = (c) => {
  if (typeof c !== "string") return null;
  const s = c.trim();
  const hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split("").map((x) => x + x).join("");
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(",");
  }
  const m = s.match(/^(?:rgb\()?\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)?$/i);
  return m ? `${m[1]},${m[2]},${m[3]}` : null;
};

class MediaControlCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        ha-card {
          --rgb: ${OFF_RGB};
          --icon-rgb: ${OFF_RGB};
          position: relative; overflow: hidden; box-sizing: border-box; padding: 12px;
          display: flex; flex-direction: column; gap: 12px;
          background: rgba(var(--rgb), .06);
          border: none;
          box-shadow: none;
          -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px);
          transition: background .3s;
        }
        ha-card:not(.off) { background: rgba(var(--rgb), .08); }
        ha-card.active { animation: glow 3s ease-in-out infinite; }
        @keyframes glow {
          0%, 100% { box-shadow: inset 0 0 10px rgba(var(--rgb), .15); }
          50% { box-shadow: inset 0 0 25px rgba(var(--rgb), .38); }
        }
        @media (prefers-reduced-motion: reduce) {
          ha-card.active { animation: none; box-shadow: inset 0 0 14px rgba(var(--rgb), .22); }
        }
        ha-card.active.static { animation: none; box-shadow: inset 0 0 14px rgba(var(--rgb), .22); }
        ha-card.solo-vol { padding: 6px 10px; min-height: 64px; justify-content: center; }

        .head { display: flex; align-items: center; gap: 12px; cursor: pointer; -webkit-tap-highlight-color: transparent; border-radius: 16px; }
        .head[hidden] { display: none; }
        .head:focus, .head:focus-visible, .vbtn:focus, .bbtn:focus { outline: none; }
        ha-card.kbd .head:focus-visible { outline: 2px solid rgb(var(--rgb)); outline-offset: 2px; }

        /* Mushroom-style icon container */
        .tile {
          flex: none; width: 65px; height: 65px; border-radius: 50%;
          margin: -18px -4px 0 -18px;
          display: flex; align-items: center; justify-content: center;
          color: rgb(var(--icon-rgb));
          background: rgba(var(--icon-rgb), 0.2);
          transition: color .3s, background .3s;
        }
        .tile ha-icon { --mdc-icon-size: 44px; display: flex; }

        .info { flex: 1; min-width: 0; }
        .name {
          font-size: 14px; font-weight: 500; line-height: 1.5;
          color: var(--primary-text-color);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .sub {
          font-size: 12px; font-weight: 400; line-height: 1.5;
          color: var(--secondary-text-color);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }

        .vol[hidden], .vsub[hidden] { display: none; }
        .vol { display: flex; align-items: center; justify-content: space-between; }
        .vbtn {
          all: unset; box-sizing: border-box; cursor: pointer; width: 44px; height: 44px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center; color: var(--secondary-text-color);
          --mdc-icon-size: 26px; transition: background .2s, color .2s, transform .1s; -webkit-tap-highlight-color: transparent;
        }
        .vbtn:hover { background: rgba(var(--rgb), .15); color: rgb(var(--rgb)); }
        .vbtn:active { transform: scale(.9); }
        ha-card.kbd .vbtn:focus-visible { outline: 2px solid rgb(var(--rgb)); }
        .vbtn[disabled] { opacity: .3; pointer-events: none; }
        .vcenter { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; min-width: 0; user-select: none; }
        .vcenter.clickable { cursor: pointer; }
        .vval { display: flex; align-items: flex-start; line-height: 1; color: var(--primary-text-color); font-variant-numeric: tabular-nums; }
        .vnum { font-size: 2.2rem; font-weight: 300; letter-spacing: -1px; }
        .vunit { font-size: 1rem; margin: 5px 0 0 3px; color: rgb(var(--rgb)); }
        .vsub {
          margin-top: 2px; font-size: .7rem; letter-spacing: .5px; text-transform: uppercase;
          color: var(--secondary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;
        }
        .off .vval, .muted .vval { opacity: .5; }

        .track {
          padding: 4px; border-radius: 16px;
          background: color-mix(in srgb, var(--primary-text-color) 6%, transparent);
        }
        .track[hidden] { display: none; }
        .seg { display: grid; grid-template-columns: repeat(var(--n, 1), 1fr); gap: 0; }
        .bbtn {
          all: unset; box-sizing: border-box; position: relative; cursor: pointer; height: max(40px, calc(var(--btn-icon-size, 24px) + 16px));
          display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px;
          color: var(--secondary-text-color); --mdc-icon-size: var(--btn-icon-size, 24px); border-radius: 12px;
          transition: color .2s, background .2s, box-shadow .2s, transform .1s; -webkit-tap-highlight-color: transparent;
          min-width: 0;
        }
        .bbtn:hover { background: rgba(var(--b-rgb, var(--icon-rgb)), .1); }
        .bbtn:active { transform: scale(.94); }
        .bbtn span { font-size: 10.5px; font-weight: 600; line-height: 1; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .bbtn.active {
          color: rgb(var(--b-rgb, var(--icon-rgb)));
          background: rgba(var(--b-rgb, var(--icon-rgb)), .2);
          box-shadow: inset 0 0 0 1px rgba(var(--b-rgb, var(--icon-rgb)), .4);
        }
        .bbtn[disabled] { opacity: .3; pointer-events: none; }
        ha-card.kbd .bbtn:focus-visible { outline: 2px solid rgb(var(--rgb)); outline-offset: -2px; }
        .labels .bbtn { height: max(52px, calc(var(--btn-icon-size, 24px) + 28px)); }

        /* ---------- Bubble Card style ---------- */
        ha-card.bubble,
        ha-card.bubble:not(.off) {
          border: none; border-radius: 32px; padding: 8px; gap: 8px;
          background: var(--ha-card-background, var(--card-background-color, rgba(30,30,30,1)));
          -webkit-backdrop-filter: none; backdrop-filter: none;
        }
        ha-card.bubble.solo-vol { padding: 6px 10px; }
        ha-card.bubble .head { gap: 12px; border-radius: 28px; }
        ha-card.bubble .tile {
          width: 40px; height: 40px; margin: 0 0 0 0;
          background: rgba(var(--icon-rgb), .2);
        }
        ha-card.bubble .tile ha-icon { --mdc-icon-size: 24px; }
        ha-card.bubble .track { border-radius: 24px; }
        ha-card.bubble .bbtn { border-radius: 20px; }
      </style>
      <ha-card>
        <div class="head" tabindex="0" role="button">
          <div class="tile"><ha-icon></ha-icon></div>
          <div class="info"><div class="name"></div><div class="sub"></div></div>
        </div>
        <div class="vol" hidden>
          <button class="vbtn" id="down" aria-label="Decrease volume"><ha-icon icon="mdi:minus"></ha-icon></button>
          <div class="vcenter">
            <div class="vval"><span class="vnum"></span><span class="vunit"></span></div>
            <div class="vsub" hidden></div>
          </div>
          <button class="vbtn" id="up" aria-label="Increase volume"><ha-icon icon="mdi:plus"></ha-icon></button>
        </div>
        <div class="track" hidden><div class="seg"></div></div>
      </ha-card>`;
    const $ = (s) => this.shadowRoot.querySelector(s);
    this._card = $("ha-card");
    this._head = $(".head");
    this._tile = $(".tile ha-icon");
    this._name = $(".name");
    this._sub = $(".sub");
    this._vol = $(".vol");
    this._vcenter = $(".vcenter");
    this._vnum = $(".vnum");
    this._vunit = $(".vunit");
    this._vsub = $(".vsub");
    this._down = $("#down");
    this._up = $("#up");
    this._track = $(".track");
    this._seg = $(".seg");

    this._head.addEventListener("click", (e) => {
      this._onTap();
      if (e.detail) this._head.blur(); // pointer/touch click: don't keep focus
    });
    this.shadowRoot.addEventListener("pointerdown", () => this._card.classList.remove("kbd"), true);
    this.shadowRoot.addEventListener("keydown", (e) => { if (e.key === "Tab") this._card.classList.add("kbd"); }, true);
    this._head.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this._onTap(); }
    });
    // When the header is hidden, tapping the volume number opens more-info
    this._vcenter.addEventListener("click", () => {
      if (this._config?.show_header === false) {
        this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: this._config.entity }, bubbles: true, composed: true }));
      }
    });
    this._down.addEventListener("click", () => this._bump(-1));
    this._up.addEventListener("click", () => this._bump(1));
    this._seg.addEventListener("click", (e) => {
      const b = e.target.closest("[data-i]");
      if (b) this._onButton(Number(b.dataset.i));
    });
  }

  // ---------- HA integration ----------
  static getConfigElement() {
    return document.createElement(EDITOR_TAG);
  }

  static getStubConfig(hass, entities, entitiesFallback) {
    const isMp = (id) => typeof id === "string" && id.startsWith("media_player.");
    const e =
      (entities || []).find(isMp) ||
      (entitiesFallback || []).find(isMp) ||
      Object.keys(hass?.states || {}).find(isMp);
    return {
      entity: e || "media_player.living_room",
      buttons: [{ preset: "previous" }, { preset: "play_pause" }, { preset: "stop" }, { preset: "next" }, { preset: "mute" }],
    };
  }

  static getEntitySuggestion(hass, entityId) {
    if (typeof entityId !== "string" || !entityId.startsWith("media_player.")) return null;
    if (!hass?.states?.[entityId]) return null;
    return { config: { type: `custom:${TAG}`, entity: entityId } };
  }

  setConfig(config) {
    if (!config || !config.entity) throw new Error("You need to define a media_player entity");
    this._config = {
      show_header: true,
      show_volume_control: true,
      show_buttons: true,
      tap_action: { action: "more-info" },
      ...config,
    };
    this._buttons = this._resolveButtons(this._config.buttons);
    this._key = null;
    this._buttonsKey = null;
    if (this._hass) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  getCardSize() {
    const c = this._config || {};
    let n = 0;
    if (c.show_header !== false) n += 1;
    if (c.show_volume_control !== false) n += 1;
    if (c.show_buttons !== false && this._buttons?.length) n += 1;
    return Math.max(n, 1);
  }
  getGridOptions() { return { columns: 12, min_columns: 3 }; }

  // ---------- helpers ----------
  _state() { return this._hass?.states?.[this._config.entity]; }

  _resolveButtons(list) {
    if (!Array.isArray(list)) return [];
    return list
      .map((item) => {
        const it = typeof item === "string" ? { preset: item } : item;
        if (!it || typeof it !== "object") return null;
        const base = it.preset && PRESETS[it.preset] ? PRESETS[it.preset] : {};
        const b = { ...base, ...it };
        // shorthand: perform_action / service at the button's top level
        if (!b.tap_action) {
          const svc = it.perform_action || it.service || base.service;
          if (svc) {
            b.tap_action = {
              action: "perform-action",
              perform_action: svc,
              data: it.data ?? it.service_data ?? base.data,
              target: it.target,
            };
          }
        }
        if (!b.icon) b.icon = "mdi:gesture-tap";
        if (b.label == null && !it.preset) b.label = b.name || "";
        b._rgb = toRgb(b.color);
        return b;
      })
      .filter(Boolean);
  }

  _isActive(btn) {
    const st = this._state();
    const spec = btn.active;
    if (!st || spec == null) return false;
    const toList = (v) => (Array.isArray(v) ? v : [v]);
    if (typeof spec === "string" || Array.isArray(spec)) return toList(spec).includes(st.state);
    if (spec.attribute) {
      const val = st.attributes?.[spec.attribute];
      if ("value" in spec) return toList(spec.value).some((v) => v === val || String(v) === String(val));
      return !!val;
    }
    if (spec.state != null) return toList(spec.state).includes(st.state);
    return false;
  }

  _limits() {
    const lo = Number(this._config.min_volume);
    const hi = Number(this._config.max_volume);
    const min = Number.isFinite(lo) ? Math.min(Math.max(lo, 0), 100) : 0;
    const max = Number.isFinite(hi) ? Math.min(Math.max(hi, min), 100) : 100;
    return { min, max };
  }

  _step() { return Number(this._config.step) || 5; }

  _mediaInfo(a) {
    const t = a.media_title;
    const ar = a.media_artist;
    if (t && ar) return `${ar} – ${t}`;
    return t || ar || "";
  }

  _model() {
    const cfg = this._config;
    const st = this._state();
    if (!st) return { missing: true, name: cfg.name || cfg.entity };
    const a = st.attributes || {};
    const unavailable = UNAVAILABLE.includes(st.state);
    const isOff = unavailable || st.state === "off";
    const meta = STATE_META[st.state] || { icon: "mdi:speaker", label: cap(st.state), rgb: "33,150,243" };
    const muted = a.is_volume_muted === true;

    const vol = a.volume_level != null && !isNaN(Number(a.volume_level)) ? Math.round(Number(a.volume_level) * 100) : null;
    if (this._pendingVol != null && vol === this._pendingVol) this._pendingVol = null;
    const shown = this._pendingVol ?? vol;
    const volText = shown != null ? String(shown) : null;

    const info = cfg.show_media_info && !isOff ? this._mediaInfo(a) : "";
    let sub;
    if (unavailable) sub = "Unavailable";
    else if (st.state === "off") sub = "Off";
    else {
      const parts = [meta.label];
      if (volText != null) parts.push(muted ? "Muted" : `${volText}%`);
      if (info) parts.push(info);
      sub = parts.join(" · ");
    }

    // Caption under the number (used when the header is hidden)
    const vparts = [];
    if (cfg.name) vparts.push(cfg.name);
    if (unavailable) vparts.push("Unavailable");
    else if (isOff) vparts.push("Off");
    else {
      if (muted) vparts.push("Muted");
      if (info) vparts.push(info);
    }

    const override = toRgb(cfg.color);
    const icon = cfg.icon || DEVICE_ICONS[a.device_class] || "mdi:speaker";

    return {
      name: cfg.name ?? a.friendly_name ?? cfg.entity,
      icon: muted && !cfg.icon ? "mdi:volume-off" : icon,
      sub,
      vsub: vparts.join(" · "),
      rgb: cfg.coloring === false ? "var(--ha-card-background, var(--card-background-color))" : (isOff ? OFF_RGB : override || meta.rgb),
      iconRgb: cfg.icon_coloring === false || isOff ? OFF_RGB : override || meta.rgb,
      isOff,
      muted,
      active: st.state === "playing",
      volText,
      disabled: isOff || shown == null,
      btnDisabled: unavailable,
      btnActive: this._buttons.map((b) => this._isActive(b)),
    };
  }

  // ---------- render ----------
  _render() {
    if (!this._config || !this._hass) return;
    const cfg = this._config;
    const m = this._model();
    const showHeader = cfg.show_header !== false;
    const showVol = cfg.show_volume_control !== false;
    const showButtons = cfg.show_buttons !== false && this._buttons.length > 0;
    const bubble = cfg.card_style === "bubble";
    const animate = cfg.animation !== false;
    const order = parseLayout(cfg.layout);
    const btnIconSize = Math.min(Math.max(Number(cfg.button_icon_size) || 24, 10), 48);
    const key = JSON.stringify([m, !!cfg.show_labels, showHeader, showVol, showButtons, bubble, animate, order, btnIconSize]);
    if (key === this._key) return;
    this._key = key;

    // layout toggles
    this._card.classList.toggle("bubble", bubble);
    this._card.classList.toggle("static", !animate);
    this._head.style.order = 0;
    this._vol.style.order = 1 + order.indexOf("volume");
    this._track.style.order = 1 + order.indexOf("buttons");
    this._card.classList.toggle("solo-vol", !showHeader && !showButtons && showVol);
    this._head.hidden = !showHeader;
    this._vol.hidden = !showVol;
    this._vcenter.classList.toggle("clickable", !showHeader);

    this._name.textContent = m.name;
    if (m.missing) {
      this._sub.textContent = "Entity not found";
      this._vsub.textContent = "Entity not found";
      this._vsub.hidden = showHeader;
      this._track.hidden = true;
      return;
    }

    this._card.style.setProperty("--rgb", m.rgb);
    this._card.style.setProperty("--icon-rgb", m.iconRgb);
    this._card.style.setProperty("--btn-icon-size", `${btnIconSize}px`);
    this._card.classList.toggle("off", m.isOff);
    this._card.classList.toggle("muted", m.muted);
    this._card.classList.toggle("active", m.active);
    this._tile.setAttribute("icon", m.icon);
    this._sub.textContent = m.sub;

    this._vnum.textContent = m.volText ?? "--";
    this._vunit.textContent = m.volText ? "%" : "";
    this._vsub.textContent = m.vsub;
    this._vsub.hidden = showHeader || !m.vsub;
    this._down.disabled = this._up.disabled = m.disabled;

    // (re)build buttons only when their definition changes
    const buttonsKey = JSON.stringify(this._buttons.map((b) => [b.icon, b.label, b._rgb])) + "|" + !!cfg.show_labels;
    if (buttonsKey !== this._buttonsKey) {
      this._buttonsKey = buttonsKey;
      this._track.classList.toggle("labels", !!cfg.show_labels);
      this._seg.innerHTML = this._buttons
        .map((b, i) => {
          const label = b.label || "";
          const style = b._rgb ? ` style="--b-rgb:${b._rgb}"` : "";
          return `<button class="bbtn" data-i="${i}"${style} title="${esc(label)}" aria-label="${esc(label || b.icon)}">
            <ha-icon icon="${esc(b.icon)}"></ha-icon>${cfg.show_labels && label ? `<span>${esc(label)}</span>` : ""}</button>`;
        })
        .join("");
      this._seg.style.setProperty("--n", Math.max(this._buttons.length, 1));
    }
    this._seg.querySelectorAll(".bbtn").forEach((el, i) => {
      const on = !!m.btnActive[i];
      el.classList.toggle("active", on);
      el.disabled = m.btnDisabled;
      el.setAttribute("aria-pressed", on ? "true" : "false");
    });
    this._track.hidden = !showButtons;
  }

  // ---------- actions ----------
  _bump(dir) {
    const st = this._state();
    if (!st) return;
    const a = st.attributes;
    const current = a.volume_level != null ? Math.round(Number(a.volume_level) * 100) : NaN;
    const base = this._pendingVol ?? current;
    if (isNaN(base)) return;
    const { min, max } = this._limits();
    const next = Math.round(Math.min(max, Math.max(min, base + dir * this._step())));
    this._pendingVol = next;
    this._render();
    clearTimeout(this._volTimer);
    this._volTimer = setTimeout(() => {
      this._hass.callService("media_player", "volume_set", { entity_id: this._config.entity, volume_level: next / 100 });
      clearTimeout(this._volRelease);
      this._volRelease = setTimeout(() => { this._pendingVol = null; this._render(); }, 4000);
    }, 600);
  }

  _onButton(i) {
    const b = this._buttons[i];
    if (!b) return;
    this._runAction(b.tap_action || { action: "none" }, b.entity);
  }

  _onTap() {
    this._runAction(this._config.tap_action || { action: "more-info" });
  }

  _runAction(a, entityOverride) {
    const entityId = a.entity || entityOverride || this._config.entity;
    switch (a.action) {
      case "navigate":
        if (!a.navigation_path) return;
        if (a.navigation_replace) history.replaceState(null, "", a.navigation_path);
        else history.pushState(null, "", a.navigation_path);
        window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: !!a.navigation_replace } }));
        break;
      case "more-info":
        this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId }, bubbles: true, composed: true }));
        break;
      case "toggle":
        this._hass.callService("homeassistant", "toggle", { entity_id: entityId });
        break;
      case "perform-action":
      case "call-service": {
        const svc = a.perform_action || a.service;
        if (!svc) return;
        const [domain, service] = svc.split(".");
        let data = a.data || a.service_data || {};
        if (typeof data === "function") data = data(this._state() || { attributes: {} });
        // default the target to this card's entity
        const target = a.target && Object.keys(a.target).length ? a.target : { entity_id: entityId };
        this._hass.callService(domain, service, data, target);
        break;
      }
      case "url":
        if (a.url_path) window.open(a.url_path, "_blank");
        break;
      default:
        break;
    }
  }
}

// ---------- Visual editor ----------
const EDITOR_LABELS = {
  entity: "Media player entity",
  name: "Name",
  icon: "Icon",
  show_header: "Show header (icon, name, status)",
  show_volume_control: "Show − / + volume control",
  show_buttons: "Show action buttons",
  buttons: "Buttons (YAML list — presets: " + PRESET_OPTIONS.join(", ") + ")",
  layout: "Order of volume and buttons",
  show_media_info: "Show media title / artist",
  show_labels: "Show labels under button icons",
  tap_action: "Header tap action",
  card_style: "Card style (icon, icon box and borders)",
  step: "Volume step in % (default: 5)",
  min_volume: "Minimum volume (%)",
  max_volume: "Maximum volume (%)",
  color: "Accent color override (e.g. #2196f3)",
  animation: "Glow animation",
  coloring: "Card state coloring",
  icon_coloring: "Icon state coloring",
  button_icon_size: "Button icon size (px)",
};

// Values the card uses when a key is missing. The editor shows these and
// never writes them into the YAML.
const EDITOR_DEFAULTS = {
  show_header: true,
  show_volume_control: true,
  show_buttons: true,
  show_media_info: false,
  show_labels: false,
  card_style: "mushroom",
  layout: DEFAULT_LAYOUT,
  animation: true,
  coloring: true,
  icon_coloring: true,
  button_icon_size: 24,
};

const getEditorSchema = (cfg) => {
  const showHeader = cfg.show_header !== false;
  const showButtons = cfg.show_buttons !== false;
  const showVol = cfg.show_volume_control !== false;
  return [
    { name: "entity", required: true, selector: { entity: { domain: "media_player" } } },
    { name: "name", selector: { text: {} } },
    { name: "icon", selector: { icon: {} } },
    { name: "show_header", selector: { boolean: {} } },
    { name: "show_volume_control", selector: { boolean: {} } },
    { name: "show_buttons", selector: { boolean: {} } },
    ...(showButtons ? [{ name: "buttons", selector: { object: {} } }] : []),
    ...(showVol && showButtons ? [{ name: "layout", selector: { select: { mode: "dropdown", options: LAYOUT_OPTIONS } } }] : []),
    ...(showHeader ? [{ name: "tap_action", selector: { ui_action: {} } }] : []),
    {
      type: "expandable",
      name: "advanced",
      title: "Advanced settings",
      flatten: true,
      schema: [
        {
          name: "card_style",
          selector: {
            select: {
              mode: "dropdown",
              options: [
                { value: "mushroom", label: "Mushroom" },
                { value: "bubble", label: "Bubble" },
              ],
            },
          },
        },
        { name: "step", selector: { number: { min: 1, max: 25, step: 1, mode: "box", unit_of_measurement: "%" } } },
        { name: "min_volume", selector: { number: { min: 0, max: 100, step: 1, mode: "box", unit_of_measurement: "%" } } },
        { name: "max_volume", selector: { number: { min: 0, max: 100, step: 1, mode: "box", unit_of_measurement: "%" } } },
        ...(showButtons ? [{ name: "button_icon_size", selector: { number: { min: 12, max: 40, step: 1, mode: "box", unit_of_measurement: "px" } } }] : []),
        { name: "color", selector: { text: {} } },
        { name: "show_media_info", selector: { boolean: {} } },
        ...(showButtons ? [{ name: "show_labels", selector: { boolean: {} } }] : []),
        { name: "animation", selector: { boolean: {} } },
        { name: "coloring", selector: { boolean: {} } },
        { name: "icon_coloring", selector: { boolean: {} } },
      ],
    },
  ];
};

// The editor merges the card's defaults into the form data so toggles that
// default to "on" are shown as on.
class MediaControlCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = config;
    this._sync();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._form) this._form.hass = hass;
    else this._sync();
  }

  _sync() {
    if (!this._config || !this._hass) return;
    if (!this._form) {
      this._form = document.createElement("ha-form");
      this._form.computeLabel = (s) => EDITOR_LABELS[s.name] || s.name;
      this._form.addEventListener("value-changed", (ev) => {
        ev.stopPropagation();
        const config = { ...this._config, ...ev.detail.value };
        // don't write default values into the YAML
        for (const [k, v] of Object.entries(EDITOR_DEFAULTS)) if (config[k] === v) delete config[k];
        for (const k of Object.keys(config)) {
          const v = config[k];
          if (v === "" || v == null || (Array.isArray(v) && v.length === 0)) delete config[k];
        }
        this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
      });
      this.appendChild(this._form);
    }
    this._form.hass = this._hass;

    const cfg = this._config;
    const schemaKey = JSON.stringify([cfg.show_header !== false, cfg.show_buttons !== false, cfg.show_volume_control !== false]);
    if (schemaKey !== this._schemaKey) {
      this._schemaKey = schemaKey;
      this._form.schema = getEditorSchema(cfg);
    }

    this._form.data = { ...EDITOR_DEFAULTS, ...cfg };
  }
}

if (!customElements.get(TAG)) customElements.define(TAG, MediaControlCard);
if (!customElements.get(EDITOR_TAG)) customElements.define(EDITOR_TAG, MediaControlCardEditor);
window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === TAG)) {
  window.customCards.push({
    type: TAG,
    name: "Media Control Card",
    description: "Media player card with optional header, − / + volume stepper and a row of custom action buttons. Mushroom or Bubble styling.",
    preview: true,
    getEntitySuggestion: (hass, entityId) => MediaControlCard.getEntitySuggestion(hass, entityId),
  });
}
console.info(`%c MEDIA-VOLUME-CARD %c v${CARD_VERSION} `, "color:white;background:#4CAF50;font-weight:700", "color:#4CAF50;background:white");
