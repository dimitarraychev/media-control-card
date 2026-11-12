/*
 * Media Control Card
 * Header, − / + volume stepper, custom action buttons and a Radio Browser
 * station picker in one card. The header is pinned on top, the other sections
 * can be shown, hidden and reordered; styling can be Mushroom or Bubble.
 */
const TAG = "media-control-card";
const EDITOR_TAG = "media-control-card-editor";
const CARD_VERSION = "0.3.1-beta";

const DEFAULT_RADIO_ROOT = "media-source://radio_browser";
const PINNED_ID = "__pinned__";
const RADIO_MAX_ITEMS = 300;

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

// ---------- sections ----------
// The header is pinned on top, it can only be shown or hidden. Volume, Buttons
// and Radio can be shown, hidden and reordered (the card is a flex column,
// sections are re-ordered with CSS `order`). `sections` in the config is an
// ordered list of ids; hide one with `- id: radio` + `show: false`. Unlisted
// sections are hidden.
const SECTION_IDS = ["header", "volume", "buttons", "radio"];
const SECTION_META = {
  header: { icon: "mdi:page-layout-header", label: "Header (icon, name, status)" },
  volume: { icon: "mdi:volume-high", label: "Volume control (− / +)" },
  buttons: { icon: "mdi:gesture-tap-button", label: "Action buttons" },
  radio: { icon: "mdi:radio", label: "Radio browser" },
};
const DEFAULT_SECTIONS = [
  { id: "header", show: true },
  { id: "volume", show: true },
  { id: "buttons", show: true },
  { id: "radio", show: false },
];
function effectiveSections(cfg) {
  if (!Array.isArray(cfg.sections)) return DEFAULT_SECTIONS.map((x) => ({ ...x }));
  const seen = new Set();
  const listed = [];
  cfg.sections.forEach((x) => {
    const o = typeof x === "string" ? { id: x } : x;
    if (!o || !SECTION_IDS.includes(o.id) || seen.has(o.id)) return;
    seen.add(o.id);
    listed.push({ id: o.id, show: o.show !== false });
  });
  SECTION_IDS.forEach((id) => { if (!seen.has(id)) listed.push({ id, show: false }); });
  // the header always stays on top
  return [listed.find((x) => x.id === "header"), ...listed.filter((x) => x.id !== "header")];
}
const resolveSections = (cfg) => effectiveSections(cfg).filter((x) => x.show).map((x) => x.id);

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const cap = (s) => String(s ?? "").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
const norm = (s) => String(s ?? "").trim().toLowerCase();

// Accepts "#rgb", "#rrggbb", "r,g,b", "rgb(r,g,b)" or [r,g,b] -> "r,g,b"
const toRgb = (c) => {
  if (Array.isArray(c) && c.length === 3 && c.every((n) => Number.isFinite(Number(n)))) return c.map((n) => Math.round(Number(n))).join(",");
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

// "true" / "false" / numbers from a text field -> real values
const parseVal = (v) => {
  const s = String(v ?? "").trim();
  if (s === "true") return true;
  if (s === "false") return false;
  if (s !== "" && !isNaN(Number(s))) return Number(s);
  return s;
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

        .track, .radio {
          padding: 4px; border-radius: 16px;
          background: color-mix(in srgb, var(--primary-text-color) 6%, transparent);
        }
        .track[hidden], .radio[hidden] { display: none; }
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

        /* ---------- Radio browser ---------- */
        .radio { display: flex; flex-direction: column; gap: 4px; }
        .rbar { display: flex; align-items: center; gap: 6px; min-height: 40px; padding: 0 4px; }
        .rback {
          all: unset; box-sizing: border-box; cursor: pointer; flex: none; width: 32px; height: 32px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center; color: var(--secondary-text-color);
          --mdc-icon-size: 22px; -webkit-tap-highlight-color: transparent;
        }
        .rback[hidden] { display: none; }
        .rback:hover { background: rgba(var(--rgb), .15); color: rgb(var(--rgb)); }
        .rtitle {
          flex: 1; min-width: 0; font-size: 13px; font-weight: 600; color: var(--primary-text-color);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .rsearch {
          flex: 0 1 170px; min-width: 90px; display: flex; align-items: center; gap: 4px; height: 32px; padding: 0 10px;
          border-radius: 999px; box-sizing: border-box; --mdc-icon-size: 18px; color: var(--secondary-text-color);
          background: color-mix(in srgb, var(--primary-text-color) 8%, transparent);
        }
        .rsearch[hidden] { display: none; }
        .rsearch input {
          all: unset; flex: 1; min-width: 0; font-size: 13px; color: var(--primary-text-color);
        }
        .rsearch input::placeholder { color: var(--secondary-text-color); }
        .rlist {
          max-height: var(--radio-h, 240px); overflow-y: auto; display: flex; flex-direction: column; gap: 2px;
          scrollbar-width: thin; overscroll-behavior: contain;
        }
        .ritem {
          all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 10px; padding: 5px 8px;
          min-height: 44px; border-radius: 12px; cursor: pointer; -webkit-tap-highlight-color: transparent;
          transition: background .2s;
        }
        .ritem:hover { background: rgba(var(--icon-rgb), .1); }
        ha-card.kbd .ritem:focus-visible { outline: 2px solid rgb(var(--rgb)); outline-offset: -2px; }
        .ritem.playing { background: rgba(var(--icon-rgb), .2); box-shadow: inset 0 0 0 1px rgba(var(--icon-rgb), .4); }
        .rthumb {
          position: relative; flex: none; width: 34px; height: 34px; border-radius: 8px; overflow: hidden;
          display: flex; align-items: center; justify-content: center; --mdc-icon-size: 20px;
          color: var(--secondary-text-color); background: color-mix(in srgb, var(--primary-text-color) 8%, transparent);
        }
        .rthumb img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; background: var(--card-background-color, #fff); }
        .nothumb .rthumb { display: none; }
        .rname {
          flex: 1; min-width: 0; font-size: 13.5px; color: var(--primary-text-color);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .ritem.playing .rname { font-weight: 600; }
        .rend { flex: none; --mdc-icon-size: 20px; color: var(--secondary-text-color); }
        .ritem.playing .rend { color: rgb(var(--icon-rgb)); }
        .rmsg { padding: 14px 10px; text-align: center; font-size: 12.5px; color: var(--secondary-text-color); }
        .rmsg.err { cursor: pointer; }

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
        ha-card.bubble .track, ha-card.bubble .radio { border-radius: 24px; }
        ha-card.bubble .bbtn { border-radius: 20px; }
        ha-card.bubble .ritem { border-radius: 20px; }
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
        <div class="radio" hidden>
          <div class="rbar">
            <button class="rback" hidden aria-label="Back"><ha-icon icon="mdi:arrow-left"></ha-icon></button>
            <div class="rtitle"></div>
            <label class="rsearch"><ha-icon icon="mdi:magnify"></ha-icon><input type="search" placeholder="Search" aria-label="Search stations" /></label>
          </div>
          <div class="rlist"></div>
        </div>
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
    this._radioEl = $(".radio");
    this._rback = $(".rback");
    this._rtitle = $(".rtitle");
    this._rsearch = $(".rsearch");
    this._rinput = $(".rsearch input");
    this._rlist = $(".rlist");

    this._radio = { stack: null, raw: [], view: [], loading: false, error: "", filter: "", cache: new Map(), token: 0, html: null };

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
      if (this._config && !resolveSections(this._config).includes("header")) {
        this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: this._config.entity }, bubbles: true, composed: true }));
      }
    });
    this._down.addEventListener("click", () => this._bump(-1));
    this._up.addEventListener("click", () => this._bump(1));
    this._seg.addEventListener("click", (e) => {
      const b = e.target.closest("[data-i]");
      if (b) this._onButton(Number(b.dataset.i));
    });

    // radio browser
    this._rback.addEventListener("click", () => {
      const r = this._radio;
      if (r.stack && r.stack.length > 1) { r.stack.pop(); this._rlist.scrollTop = 0; this._radioLoad(); }
    });
    this._rinput.addEventListener("input", () => { this._radio.filter = this._rinput.value; this._renderRadioList(); });
    // keep Home Assistant's global keyboard shortcuts out of the search box
    this._rinput.addEventListener("keydown", (e) => e.stopPropagation());
    this._rlist.addEventListener("click", (e) => {
      if (e.target.closest("[data-retry]")) { this._radioLoad(); return; }
      const b = e.target.closest("[data-ri]");
      const it = b && this._radio.view[Number(b.dataset.ri)];
      if (!it) return;
      if (it.expand) {
        this._radio.stack.push({ id: it.id, title: it.title });
        this._rlist.scrollTop = 0;
        this._radioLoad();
      } else if (it.play) this._radioPlay(it);
    });
    // hide broken station logos, the fallback icon sits underneath
    this._rlist.addEventListener("error", (e) => { if (e.target?.tagName === "IMG") e.target.style.display = "none"; }, true);
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
      tap_action: { action: "more-info" },
      ...config,
    };
    this._buttons = this._resolveButtons(this._config.buttons);
    // a different radio root means a different tree: start over
    const root = this._config.radio_root || DEFAULT_RADIO_ROOT;
    if (root !== this._radioRoot) {
      this._radioRoot = root;
      this._radio.stack = null;
      this._radio.cache.clear();
    }
    this._key = null;
    this._buttonsKey = null;
    if (this._hass) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  getCardSize() {
    const vis = resolveSections(this._config || {});
    const size = { header: 1, volume: 1, buttons: 1, radio: 3 };
    return Math.max(vis.reduce((n, id) => n + (id === "buttons" && !this._buttons?.length ? 0 : size[id]), 0), 1);
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
        // highlight fields from the visual editor
        if (it.active == null) {
          if (it.active_state) {
            b.active = { state: String(it.active_state).split(",").map((s) => s.trim()).filter(Boolean) };
          } else if (it.active_attribute) {
            b.active = { attribute: it.active_attribute };
            if (it.active_value !== undefined && String(it.active_value) !== "") b.active.value = parseVal(it.active_value);
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
    const playingNow = !isOff && st.state !== "idle" && st.state !== "standby";

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
      // used to highlight the station that is playing in the radio list
      playingTitle: playingNow ? String(a.media_title || a.media_channel || "") : "",
      playingId: playingNow ? String(a.media_content_id || "") : "",
    };
  }

  // ---------- render ----------
  _render() {
    if (!this._config || !this._hass) return;
    const cfg = this._config;
    const m = this._model();
    const sections = effectiveSections(cfg);
    const vis = new Set(sections.filter((x) => x.show).map((x) => x.id));
    const showHeader = vis.has("header");
    const showVol = vis.has("volume");
    const showButtons = vis.has("buttons") && this._buttons.length > 0;
    const showRadio = vis.has("radio");
    const bubble = cfg.card_style === "bubble";
    const animate = cfg.animation !== false;
    const btnIconSize = Math.min(Math.max(Number(cfg.button_icon_size) || 24, 10), 48);
    const radioH = Math.min(Math.max(Number(cfg.radio_max_height) || 240, 100), 800);
    const radioSearch = cfg.radio_show_search !== false;
    const radioThumbs = cfg.radio_show_thumbnails !== false;
    const key = JSON.stringify([
      m, !!cfg.show_labels, sections, this._buttons.length, bubble, animate, btnIconSize,
      radioH, radioSearch, radioThumbs, cfg.radio_stations || null, cfg.radio_title || null,
    ]);
    if (key === this._key) return;
    this._key = key;
    this._playingTitle = m.playingTitle || "";
    this._playingId = m.playingId || "";

    // layout toggles (the header is always first)
    const pos = (id) => sections.findIndex((x) => x.id === id);
    this._card.classList.toggle("bubble", bubble);
    this._card.classList.toggle("static", !animate);
    this._head.style.order = 0;
    this._vol.style.order = pos("volume");
    this._track.style.order = pos("buttons");
    this._radioEl.style.order = pos("radio");
    this._card.classList.toggle("solo-vol", !showHeader && !showButtons && !showRadio && showVol);
    this._head.hidden = !showHeader;
    this._vol.hidden = !showVol;
    this._vcenter.classList.toggle("clickable", !showHeader);

    this._name.textContent = m.name;
    if (m.missing) {
      this._sub.textContent = "Entity not found";
      this._vsub.textContent = "Entity not found";
      this._vsub.hidden = showHeader;
      this._track.hidden = true;
      this._radioEl.hidden = true;
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

    // radio browser (loaded lazily, the first time the section is shown)
    this._radioEl.hidden = !showRadio;
    if (showRadio) {
      this._radioEl.classList.toggle("nothumb", !radioThumbs);
      this._rsearch.hidden = !radioSearch;
      this._radioEl.style.setProperty("--radio-h", `${radioH}px`);
      if (!this._radio.stack) {
        this._radio.stack = [{ id: this._radioRoot, title: cfg.radio_title || "Radio" }];
        this._radioLoad();
      } else {
        const r = this._radio;
        if (r.stack.length === 1 && cfg.radio_title) r.stack[0].title = cfg.radio_title;
        this._renderRadioList();
      }
    }
  }

  // ---------- radio browser ----------
  _radioPinned() {
    const l = this._config.radio_stations;
    if (!Array.isArray(l)) return [];
    return l
      .filter((s) => s && s.media_content_id)
      .map((s) => ({
        title: s.name || s.title || s.media_content_id,
        id: s.media_content_id,
        type: s.media_content_type || "music",
        expand: false,
        play: true,
        thumb: s.thumbnail || "",
        icon: s.icon || "",
      }));
  }

  _radioItems() {
    const r = this._radio;
    const lvl = r.stack[r.stack.length - 1];
    if (lvl.id === PINNED_ID) return this._radioPinned();
    const pinned = this._radioPinned();
    if (r.stack.length === 1 && pinned.length) {
      return [{ title: "Pinned stations", id: PINNED_ID, expand: true, play: false, thumb: "", icon: "mdi:star" }, ...r.raw];
    }
    return r.raw;
  }

  async _radioLoad() {
    const r = this._radio;
    if (!r.stack || !this._hass) return;
    const lvl = r.stack[r.stack.length - 1];
    r.filter = "";
    this._rinput.value = "";
    r.error = "";
    if (lvl.id === PINNED_ID) { r.raw = []; r.loading = false; this._renderRadioList(); return; }
    if (r.cache.has(lvl.id)) { r.raw = r.cache.get(lvl.id); r.loading = false; this._renderRadioList(); return; }
    r.loading = true;
    r.raw = [];
    this._renderRadioList();
    const tok = ++r.token;
    try {
      const res = await this._hass.callWS({ type: "media_source/browse_media", media_content_id: lvl.id });
      if (tok !== r.token) return;
      const raw = (res.children || []).map((c) => ({
        title: c.title || "",
        id: c.media_content_id,
        type: c.media_content_type,
        expand: !!c.can_expand,
        play: !!c.can_play && !c.can_expand,
        thumb: c.thumbnail || "",
        icon: "",
      }));
      r.cache.set(lvl.id, raw);
      r.raw = raw;
    } catch (e) {
      if (tok !== r.token) return;
      r.error = (e && e.message) || "Could not load stations";
    }
    r.loading = false;
    this._renderRadioList();
  }

  _thumbUrl(u) {
    if (!u) return "";
    if (u.startsWith("/")) {
      try { return this._hass.hassUrl(u); } catch (e) { return u; }
    }
    return u;
  }

  _renderRadioList() {
    const r = this._radio;
    if (!r.stack) return;
    const lvl = r.stack[r.stack.length - 1];
    this._rtitle.textContent = lvl.title;
    this._rback.hidden = r.stack.length < 2;

    let html;
    r.view = [];
    if (r.loading) html = `<div class="rmsg">Loading…</div>`;
    else if (r.error) {
      html = `<div class="rmsg err" data-retry="1">${esc(r.error)}<br>Is the Radio Browser integration installed? Tap to retry.</div>`;
    } else {
      let items = this._radioItems();
      const f = norm(r.filter);
      if (f) items = items.filter((i) => norm(i.title).includes(f));
      if (!items.length) html = `<div class="rmsg">${f ? "No matches" : "Nothing here"}</div>`;
      else {
        const shown = items.slice(0, RADIO_MAX_ITEMS);
        r.view = shown;
        const pt = norm(this._playingTitle);
        const pid = this._playingId;
        html = shown
          .map((it, i) => {
            const playing = it.play && ((pid && it.id === pid) || (pt && norm(it.title) === pt));
            const icon = it.icon || (it.expand ? "mdi:folder-outline" : "mdi:radio");
            const end = it.expand ? "mdi:chevron-right" : playing ? "mdi:volume-high" : "mdi:play-circle-outline";
            const url = this._thumbUrl(it.thumb);
            return `<button class="ritem${playing ? " playing" : ""}" data-ri="${i}" title="${esc(it.title)}">
              <div class="rthumb"><ha-icon icon="${esc(icon)}"></ha-icon>${url ? `<img src="${esc(url)}" loading="lazy" referrerpolicy="no-referrer" alt="">` : ""}</div>
              <span class="rname">${esc(it.title)}</span><ha-icon class="rend" icon="${end}"></ha-icon></button>`;
          })
          .join("");
        if (items.length > shown.length) html += `<div class="rmsg">Showing first ${shown.length} of ${items.length}. Use search to narrow down.</div>`;
      }
    }
    // only touch the DOM when something changed (keeps scroll position and avoids flicker)
    if (html !== r.html) {
      r.html = html;
      const top = this._rlist.scrollTop;
      this._rlist.innerHTML = html;
      this._rlist.scrollTop = top;
    }
  }

  _radioPlay(it) {
    this._hass.callService("media_player", "play_media", {
      entity_id: this._config.entity,
      media_content_id: it.id,
      media_content_type: it.type || "music",
    });
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
    this._volTimer = setTimeout(async () => {
      const entity = this._config.entity;
      try {
        if (this._state()?.attributes?.is_volume_muted === true) {
          await this._hass.callService("media_player", "volume_mute", { entity_id: entity, is_volume_muted: false });
        }
        await this._hass.callService("media_player", "volume_set", { entity_id: entity, volume_level: next / 100 });
      } catch (e) {
        console.warn("media-control-card: volume change failed", e);
      }
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
        // media_player services default to this card's player
        const hasTarget = a.target && Object.keys(a.target).length;
        const target = hasTarget ? a.target : domain === "media_player" ? { entity_id: entityId } : undefined;
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
  // radio section
  radio_title: "Title of the top level (default: Radio)",
  radio_root: "Start folder (default: media-source://radio_browser)",
  radio_max_height: "List height (px)",
  radio_show_search: "Show search box",
  radio_show_thumbnails: "Show station logos",
  radio_stations: "Pinned stations",
  // custom button form
  label: "Label",
  color_rgb: "Color",
  btn_tap_action: "Action when pressed",
  btn_entity: "Entity for toggle / more-info (default: this player)",
  active_state: "State(s), comma separated (e.g. playing, paused)",
  active_attribute: "Attribute name (e.g. is_volume_muted)",
  active_value: "Attribute value (leave empty for any truthy value)",
};
const EDITOR_HELPERS = {
  radio_stations: "YAML list. Each item: name, media_content_id and optionally thumbnail",
  radio_root: "Only change this to start deeper in the tree, e.g. a country folder",
};

// Values the card uses when a key is missing. The editor shows these and
// never writes them into the YAML.
const EDITOR_DEFAULTS = {
  show_media_info: false,
  show_labels: false,
  card_style: "mushroom",
  animation: true,
  coloring: true,
  icon_coloring: true,
  button_icon_size: 24,
  radio_max_height: 240,
  radio_show_search: true,
  radio_show_thumbnails: true,
};

const schemaNames = (schema) => schema.flatMap((s) => (s.schema ? schemaNames(s.schema) : s.name ? [s.name] : []));

// Entity, name and icon (above the sections list)
const getTopSchema = () => [
  { name: "entity", required: true, selector: { entity: { domain: "media_player" } } },
  { name: "name", selector: { text: {} } },
  { name: "icon", selector: { icon: {} } },
];

// Tap action, radio settings and advanced (below the button editor)
const getBottomSchema = (cfg) => {
  const vis = resolveSections(cfg);
  const showHeader = vis.includes("header");
  const showButtons = vis.includes("buttons");
  const showRadio = vis.includes("radio");
  return [
    ...(showHeader ? [{ name: "tap_action", selector: { ui_action: {} } }] : []),
    ...(showRadio
      ? [
          {
            type: "expandable",
            name: "radio_settings",
            title: "Radio browser settings",
            flatten: true,
            schema: [
              { name: "radio_title", selector: { text: {} } },
              { name: "radio_max_height", selector: { number: { min: 100, max: 800, step: 10, mode: "box", unit_of_measurement: "px" } } },
              { name: "radio_show_search", selector: { boolean: {} } },
              { name: "radio_show_thumbnails", selector: { boolean: {} } },
              { name: "radio_stations", selector: { object: {} } },
              { name: "radio_root", selector: { text: {} } },
            ],
          },
        ]
      : []),
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

// Per-button forms
const PRESET_BUTTON_SCHEMA = [
  { name: "icon", selector: { icon: {} } },
  { name: "label", selector: { text: {} } },
  { name: "color", selector: { color_rgb: {} } },
];
const CUSTOM_BUTTON_SCHEMA = [
  { name: "icon", selector: { icon: {} } },
  { name: "label", selector: { text: {} } },
  { name: "color", selector: { color_rgb: {} } },
  { name: "tap_action", selector: { ui_action: { default_action: "none" } } },
  { name: "entity", selector: { entity: {} } },
  {
    type: "expandable",
    name: "highlight",
    title: "Highlight the button when…",
    flatten: true,
    schema: [
      { name: "active_state", selector: { text: {} } },
      { name: "active_attribute", selector: { text: {} } },
      { name: "active_value", selector: { text: {} } },
    ],
  },
];
const BUTTON_LABELS = {
  ...EDITOR_LABELS,
  color: "Color (used when highlighted)",
  tap_action: EDITOR_LABELS.btn_tap_action,
  entity: EDITOR_LABELS.btn_entity,
};

const isEmpty = (v) =>
  v === "" || v == null || (Array.isArray(v) && v.length === 0) ||
  (typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0);
const cleanObj = (o) => {
  const c = { ...o };
  for (const k of Object.keys(c)) if (isEmpty(c[k])) delete c[k];
  return c;
};
const asButton = (b) => (typeof b === "string" ? { preset: b } : b && typeof b === "object" ? b : {});

const EDITOR_CSS = `
  .mcc-btns { margin: 16px 0; }
  .mcc-h { font-size: 14px; font-weight: 500; color: var(--primary-text-color); margin-bottom: 8px; }
  .mcc-row { border: 1px solid var(--divider-color); border-radius: 12px; margin-bottom: 8px; overflow: hidden; background: var(--card-background-color); }
  .mcc-rh { display: flex; align-items: center; gap: 4px; padding: 6px 4px 6px 12px; cursor: pointer; }
  .mcc-rh > ha-icon { --mdc-icon-size: 22px; margin-right: 8px; color: var(--secondary-text-color); }
  .mcc-rh .t { flex: 1; min-width: 0; }
  .mcc-rh .n { font-size: 14px; color: var(--primary-text-color); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mcc-rh .s { font-size: 12px; color: var(--secondary-text-color); }
  .mcc-ib {
    all: unset; box-sizing: border-box; cursor: pointer; width: 32px; height: 32px; flex: none; border-radius: 50%;
    display: flex; align-items: center; justify-content: center; color: var(--secondary-text-color); --mdc-icon-size: 20px;
  }
  .mcc-ib:hover { background: var(--secondary-background-color); color: var(--primary-text-color); }
  .mcc-ib[disabled] { opacity: .3; pointer-events: none; }
  .mcc-ib.del:hover { color: var(--error-color, #db4437); }
  .mcc-body { padding: 12px; border-top: 1px solid var(--divider-color); }
  .mcc-add {
    all: unset; box-sizing: border-box; cursor: pointer; width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px;
    padding: 10px; border: 1px dashed var(--divider-color); border-radius: 12px; color: var(--primary-color);
    font-size: 14px; font-weight: 500; --mdc-icon-size: 20px;
  }
  .mcc-add:hover { background: var(--secondary-background-color); }
  .mcc-menu { border: 1px solid var(--divider-color); border-radius: 12px; padding: 12px; }
  .mcc-menu .sub { font-size: 12px; color: var(--secondary-text-color); margin: 10px 0 6px; }
  .mcc-menu .sub:first-child { margin-top: 0; }
  .mcc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; }
  .mcc-chip {
    all: unset; box-sizing: border-box; cursor: pointer; display: flex; align-items: center; gap: 8px; padding: 8px 10px; min-width: 0;
    border: 1px solid var(--divider-color); border-radius: 10px; font-size: 13px; color: var(--primary-text-color); --mdc-icon-size: 20px;
  }
  .mcc-chip:hover { background: var(--secondary-background-color); border-color: var(--primary-color); }
  .mcc-chip.custom { border-color: var(--primary-color); color: var(--primary-color); }
  .mcc-chip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mcc-cancel { all: unset; cursor: pointer; display: block; margin: 10px auto 0; font-size: 13px; color: var(--secondary-text-color); }
  .mcc-hrow { display: flex; align-items: center; }
  .mcc-hrow span { flex: 1; }
  .mcc-reset { all: unset; cursor: pointer; font-size: 12px; color: var(--primary-color); }
  .mcc-pin { width: 68px; height: 32px; flex: none; display: flex; align-items: center; justify-content: center; color: var(--secondary-text-color); --mdc-icon-size: 18px; }
  .mcc-tgl { all: unset; box-sizing: border-box; cursor: pointer; flex: none; position: relative; width: 38px; height: 22px; border-radius: 11px; margin: 0 8px 0 4px; background: var(--disabled-color, #bdbdbd); transition: background .2s; }
  .mcc-tgl::after { content: ""; position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%; background: #fff; transition: transform .2s; box-shadow: 0 1px 3px rgba(0,0,0,.35); }
  .mcc-tgl.on { background: var(--primary-color); }
  .mcc-tgl.on::after { transform: translateX(16px); }
  .mcc-row.hidden-sec .t, .mcc-row.hidden-sec > .mcc-rh > ha-icon { opacity: .55; }
  .mcc-empty { font-size: 13px; color: var(--secondary-text-color); margin-bottom: 8px; }
`;

// Rows to show / hide and reorder the card's sections. The header is pinned on top.
class SectionsEditor {
  constructor(host, commit) {
    this.commit = commit;
    this.wrap = document.createElement("div");
    this.wrap.className = "mcc-btns";
    host.appendChild(this.wrap);
  }

  update(list, custom) {
    const wrap = this.wrap;
    wrap.innerHTML = "";
    const head = document.createElement("div");
    head.className = "mcc-h mcc-hrow";
    const t = document.createElement("span");
    t.textContent = "Sections";
    head.appendChild(t);
    if (custom) {
      const reset = document.createElement("button");
      reset.className = "mcc-reset";
      reset.textContent = "Reset to default";
      reset.addEventListener("click", () => this.commit(null));
      head.appendChild(reset);
    }
    wrap.appendChild(head);
    list.forEach((it, i) => {
      const meta = SECTION_META[it.id];
      const pinned = it.id === "header";
      const row = document.createElement("div");
      row.className = "mcc-row" + (it.show ? "" : " hidden-sec");
      const rh = document.createElement("div");
      rh.className = "mcc-rh";
      rh.style.cursor = "default";
      rh.innerHTML = `
        <ha-icon icon="${meta.icon}"></ha-icon>
        <div class="t"><div class="n"></div><div class="s"></div></div>
        ${
          pinned
            ? `<span class="mcc-pin" title="The header always stays on top"><ha-icon icon="mdi:pin-outline"></ha-icon></span>`
            : `<button class="mcc-ib" data-a="up" title="Move up" ${i <= 1 ? "disabled" : ""}><ha-icon icon="mdi:arrow-up"></ha-icon></button>
               <button class="mcc-ib" data-a="down" title="Move down" ${i === list.length - 1 ? "disabled" : ""}><ha-icon icon="mdi:arrow-down"></ha-icon></button>`
        }
        <button class="mcc-tgl${it.show ? " on" : ""}" data-a="tgl" role="switch" aria-checked="${it.show}" title="${it.show ? "Hide" : "Show"}"></button>`;
      rh.querySelector(".n").textContent = meta.label;
      rh.querySelector(".s").textContent = pinned ? (it.show ? "Shown, always on top" : "Hidden") : it.show ? "Shown" : "Hidden";
      rh.addEventListener("click", (e) => {
        const a = e.target.closest("[data-a]")?.dataset.a;
        if (!a) return;
        const cur = list.map((x) => ({ ...x }));
        if (a === "tgl") cur[i].show = !cur[i].show;
        else {
          const j = a === "up" ? i - 1 : i + 1;
          if (j < 1 || j >= cur.length) return; // never above the header
          [cur[i], cur[j]] = [cur[j], cur[i]];
        }
        this.commit(cur);
      });
      row.appendChild(rh);
      wrap.appendChild(row);
    });
  }
}

// The editor merges the card's defaults into the form data so toggles that
// default to "on" are shown as on. Buttons get their own list editor:
// "+" opens a menu with Custom and every preset, rows expand into UI forms.
class MediaControlCardEditor extends HTMLElement {
  constructor() {
    super();
    this._open = -1;
    this._adding = false;
    this._rows = [];
    this._structKey = null;
  }

  setConfig(config) {
    this._config = config;
    this._sync();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._built) {
      this._top.hass = hass;
      this._bottom.hass = hass;
      this._rows.forEach((r) => { if (r.form) r.form.hass = hass; });
    } else this._sync();
  }

  _emit(config) {
    const c = { ...config };
    for (const [k, v] of Object.entries(EDITOR_DEFAULTS)) if (c[k] === v) delete c[k];
    for (const k of Object.keys(c)) if (isEmpty(c[k])) delete c[k];
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: c }, bubbles: true, composed: true }));
  }

  _makeForm(schema, onChange) {
    const f = document.createElement("ha-form");
    f.computeLabel = (s) => EDITOR_LABELS[s.name] || s.name;
    f.computeHelper = (s) => EDITOR_HELPERS[s.name] || "";
    f.addEventListener("value-changed", (ev) => { ev.stopPropagation(); onChange(ev.detail.value); });
    f.hass = this._hass;
    f.schema = schema;
    return f;
  }

  _build() {
    this._built = true;
    const style = document.createElement("style");
    style.textContent = EDITOR_CSS;
    this.appendChild(style);

    // form fields are merged only for the keys that form owns
    const onFormChange = (getSchema) => (value) => {
      const config = { ...this._config };
      for (const n of schemaNames(getSchema())) {
        if (value[n] === undefined) delete config[n];
        else config[n] = value[n];
      }
      this._emit(config);
    };
    this._top = this._makeForm(getTopSchema(), onFormChange(() => getTopSchema()));
    this.appendChild(this._top);

    this._sections = new SectionsEditor(this, (list) => {
      const c = { ...this._config };
      for (const k of ["show_header", "show_volume_control", "show_buttons", "show_radio", "layout"]) delete c[k]; // old keys
      const written = list === null ? null : list.map((x) => (x.show ? x.id : { id: x.id, show: false }));
      // the default arrangement is not written into the YAML
      const isDefault = written && JSON.stringify(list) === JSON.stringify(DEFAULT_SECTIONS);
      if (written === null || isDefault) delete c.sections;
      else c.sections = written;
      this._emit(c);
    });

    this._btnWrap = document.createElement("div");
    this._btnWrap.className = "mcc-btns";
    this.appendChild(this._btnWrap);

    this._bottom = this._makeForm([], onFormChange(() => getBottomSchema(this._config)));
    this.appendChild(this._bottom);
  }

  _sync() {
    if (!this._config || !this._hass) return;
    if (!this._built) this._build();
    this._top.hass = this._bottom.hass = this._hass;
    const cfg = this._config;
    const data = { ...EDITOR_DEFAULTS, ...cfg };

    this._top.data = data;

    const vis = resolveSections(cfg);
    const schemaKey = JSON.stringify(vis);
    if (schemaKey !== this._schemaKey) {
      this._schemaKey = schemaKey;
      this._bottom.schema = getBottomSchema(cfg);
    }
    this._bottom.data = data;

    this._sections.update(effectiveSections(cfg), Array.isArray(cfg.sections));
    this._renderButtons();
  }

  // ----- button list -----
  _buttons() {
    return (Array.isArray(this._config.buttons) ? this._config.buttons : []).map(asButton);
  }

  _setButtons(list) {
    const buttons = list.map((b) => cleanObj(b));
    this._emit({ ...this._config, buttons });
  }

  _headInfo(b) {
    const preset = b.preset && PRESETS[b.preset];
    return {
      icon: b.icon || (preset && preset.icon) || "mdi:gesture-tap",
      name: b.label || (preset && preset.label) || (b.preset ? cap(b.preset) : "Custom button"),
      sub: preset ? `Preset · ${b.preset}` : "Custom",
    };
  }

  _fillHead(ref, b) {
    const h = this._headInfo(b);
    ref.ic.setAttribute("icon", h.icon);
    ref.n.textContent = h.name;
    ref.s.textContent = h.sub;
  }

  _renderButtons() {
    const show = resolveSections(this._config).includes("buttons");
    this._btnWrap.hidden = !show;
    if (!show) return;
    const list = this._buttons();
    const structKey = JSON.stringify([list.map((b) => b.preset || "_custom"), this._open, this._adding]);
    if (structKey !== this._structKey) {
      this._structKey = structKey;
      this._buildButtons(list);
      return;
    }
    // same structure: update in place so inputs keep focus while typing
    this._rows.forEach((ref, i) => {
      this._fillHead(ref, list[i]);
      if (ref.form) ref.form.data = list[i];
    });
  }

  _buildButtons(list) {
    const wrap = this._btnWrap;
    wrap.innerHTML = "";
    this._rows = [];
    const h = document.createElement("div");
    h.className = "mcc-h";
    h.textContent = "Buttons";
    wrap.appendChild(h);

    if (!list.length && !this._adding) {
      const e = document.createElement("div");
      e.className = "mcc-empty";
      e.textContent = "No buttons yet. Add one with the plus below.";
      wrap.appendChild(e);
    }

    list.forEach((b, i) => {
      const open = this._open === i;
      const row = document.createElement("div");
      row.className = "mcc-row";
      const head = document.createElement("div");
      head.className = "mcc-rh";
      head.innerHTML = `
        <ha-icon></ha-icon>
        <div class="t"><div class="n"></div><div class="s"></div></div>
        <button class="mcc-ib" data-a="up" title="Move up" ${i === 0 ? "disabled" : ""}><ha-icon icon="mdi:arrow-up"></ha-icon></button>
        <button class="mcc-ib" data-a="down" title="Move down" ${i === list.length - 1 ? "disabled" : ""}><ha-icon icon="mdi:arrow-down"></ha-icon></button>
        <button class="mcc-ib del" data-a="del" title="Delete"><ha-icon icon="mdi:delete-outline"></ha-icon></button>
        <ha-icon icon="${open ? "mdi:chevron-up" : "mdi:chevron-down"}" style="--mdc-icon-size:22px;margin:0 6px 0 2px;color:var(--secondary-text-color)"></ha-icon>`;
      const ref = { ic: head.querySelector("ha-icon"), n: head.querySelector(".n"), s: head.querySelector(".s"), form: null };
      this._fillHead(ref, b);
      head.addEventListener("click", (e) => {
        const a = e.target.closest("[data-a]")?.dataset.a;
        if (!a) { this._open = open ? -1 : i; this._adding = false; this._renderButtons(); return; }
        e.stopPropagation();
        const cur = this._buttons();
        if (a === "del") {
          cur.splice(i, 1);
          this._open = -1;
        } else {
          const j = a === "up" ? i - 1 : i + 1;
          if (j < 0 || j >= cur.length) return;
          [cur[i], cur[j]] = [cur[j], cur[i]];
          if (this._open === i) this._open = j;
          else if (this._open === j) this._open = i;
        }
        this._setButtons(cur);
      });
      row.appendChild(head);

      if (open) {
        const body = document.createElement("div");
        body.className = "mcc-body";
        const isPreset = !!b.preset;
        const form = document.createElement("ha-form");
        form.computeLabel = (s) => BUTTON_LABELS[s.name] || s.name;
        form.hass = this._hass;
        form.schema = isPreset ? PRESET_BUTTON_SCHEMA : CUSTOM_BUTTON_SCHEMA;
        form.data = b;
        form.addEventListener("value-changed", (ev) => {
          ev.stopPropagation();
          const cur = this._buttons();
          const next = { ...ev.detail.value };
          if (isPreset) next.preset = cur[i]?.preset || b.preset;
          cur[i] = next;
          this._setButtons(cur);
        });
        body.appendChild(form);
        row.appendChild(body);
        ref.form = form;
      }
      wrap.appendChild(row);
      this._rows.push(ref);
    });

    if (this._adding) {
      const menu = document.createElement("div");
      menu.className = "mcc-menu";
      menu.innerHTML = `
        <div class="sub">Build your own</div>
        <div class="mcc-grid"><button class="mcc-chip custom" data-add="_custom"><ha-icon icon="mdi:tune-variant"></ha-icon><span>Custom button</span></button></div>
        <div class="sub">Or pick a preset</div>
        <div class="mcc-grid">${PRESET_OPTIONS.map((p) => `<button class="mcc-chip" data-add="${p}"><ha-icon icon="${esc(PRESETS[p].icon)}"></ha-icon><span>${esc(PRESETS[p].label)}</span></button>`).join("")}</div>
        <button class="mcc-cancel">Cancel</button>`;
      menu.addEventListener("click", (e) => {
        if (e.target.closest(".mcc-cancel")) { this._adding = false; this._renderButtons(); return; }
        const c = e.target.closest("[data-add]");
        if (!c) return;
        const cur = this._buttons();
        cur.push(c.dataset.add === "_custom" ? { icon: "mdi:gesture-tap" } : { preset: c.dataset.add });
        this._adding = false;
        this._open = cur.length - 1;
        this._setButtons(cur);
      });
      wrap.appendChild(menu);
    } else {
      const add = document.createElement("button");
      add.className = "mcc-add";
      add.innerHTML = `<ha-icon icon="mdi:plus"></ha-icon>Add button`;
      add.addEventListener("click", () => { this._adding = true; this._open = -1; this._renderButtons(); });
      wrap.appendChild(add);
    }
  }
}

if (!customElements.get(TAG)) customElements.define(TAG, MediaControlCard);
if (!customElements.get(EDITOR_TAG)) customElements.define(EDITOR_TAG, MediaControlCardEditor);
window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === TAG)) {
  window.customCards.push({
    type: TAG,
    name: "Media Control Card",
    description: "Media player card with optional header, − / + volume stepper, custom action buttons and a Radio Browser station picker. Mushroom or Bubble styling.",
    preview: true,
    getEntitySuggestion: (hass, entityId) => MediaControlCard.getEntitySuggestion(hass, entityId),
  });
}
console.info(`%c MEDIA-CONTROL-CARD %c v${CARD_VERSION} `, "color:white;background:#4CAF50;font-weight:700", "color:#4CAF50;background:white");
