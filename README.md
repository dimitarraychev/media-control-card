# Media Control Card

A Home Assistant Lovelace card for media players: header, − / + volume stepper, a row of fully customizable action buttons (play, pause, stop, mute, anything) and an optional Radio Browser station picker. Styled like Mushroom or Bubble Card, with a visual editor.

## Features

- Header with icon, name, state, volume and optional media title/artist
- − / + volume stepper (`media_player.volume_set`) with debounce and instant feedback
- Row of custom buttons: presets or any action/service, added and edited from the UI
- Radio browser: browse Home Assistant's Radio Browser tree, search and play stations on the player
- Each section can be toggled, so the card can be just the stepper or just the buttons
- Mushroom or Bubble style, state coloring, glow animation
- Volume step, minimum and maximum limits
- Mute indication
- Visual editor

## Installation

### HACS (custom repository)

1. HACS → ⋮ → **Custom repositories**
2. Add `https://github.com/YOURNAME/media-control-card`, category **Dashboard** (Plugin)
3. Install **Media Control Card** and reload the browser

### Manual

1. Copy `media-control-card.js` to `/config/www/`
2. **Settings → Dashboards → ⋮ → Resources → Add resource**
   - URL: `/local/media-control-card.js`
   - Type: **JavaScript module**
3. Reload the browser

## Usage

```yaml
type: custom:media-control-card
entity: media_player.living_room
show_labels: true
buttons:
  - preset: previous
  - preset: play_pause
  - preset: stop
  - preset: next
  - preset: mute
```

Volume only:

```yaml
type: custom:media-control-card
entity: media_player.living_room
sections:
  - id: header
    show: false
  - volume
```

## Sections

The card has four sections: header, volume, buttons and radio. In the visual editor, the **Sections** list has a toggle for each one and up/down arrows to reorder them. The header is pinned on top, so it can only be shown or hidden.

`sections` is an ordered list of ids. A section you leave out is hidden, and you can also hide one in place with `show: false`. Without `sections`, the card shows header, volume and buttons.

```yaml
sections:
  - header
  - radio
  - volume
  - id: buttons
    show: false
```

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `entity` | string | **required** | `media_player` entity |
| `name` | string | friendly name | Card name |
| `icon` | string | by device class | Header icon |
| `sections` | list | header, volume, buttons | Sections to show and their order, see above |
| `buttons` | list | none | Buttons, see below |
| `tap_action` | object | `more-info` | Header tap action |
| `card_style` | string | `mushroom` | `mushroom` or `bubble` |
| `step` | number | `5` | Volume step in % |
| `min_volume` | number | `0` | Lower limit in % |
| `max_volume` | number | `100` | Upper limit in % |
| `show_media_info` | boolean | `false` | Show artist and title |
| `show_labels` | boolean | `false` | Labels under button icons |
| `button_icon_size` | number | `24` | Button icon size in px |
| `color` | string | by state | Accent color override (`#2196f3`, `33,150,243`) |
| `animation` | boolean | `true` | Glow while playing |
| `coloring` | boolean | `true` | Card background follows state |
| `icon_coloring` | boolean | `true` | Icon color follows state |

## Buttons

### Adding buttons in the visual editor

Press **Add button** in the **Buttons** list. Pick **Custom button** or one of the presets. Each row expands into a form:

- **Preset:** icon, label and color overrides
- **Custom:** icon, label, color, the action to run (the standard Home Assistant action editor, including the service picker and its data), an optional entity for toggle / more-info, and an optional **Highlight the button when…** section (state, or attribute and value)

Use the arrows to reorder rows and the bin to delete one.

### Buttons in YAML

Each entry in `buttons` is a preset name, or an object.

### Presets

`play`, `pause`, `play_pause`, `stop`, `next`, `previous`, `mute`, `volume_up`, `volume_down`, `power`, `shuffle`

`mute` and `shuffle` toggle based on the current state. Any preset property can be overridden:

```yaml
buttons:
  - preset: play
    icon: mdi:play-circle
    label: Start
    color: "#4caf50"
```

### Button options

| Option | Description |
|---|---|
| `preset` | Start from a preset |
| `icon` | MDI icon |
| `label` | Text shown when `show_labels` is on, also the tooltip |
| `color` | Color for the active state |
| `tap_action` | Action to run (see below) |
| `service` / `perform_action` | Shortcut for a `perform-action` tap action |
| `data`, `target` | Used with the shortcut above |
| `entity` | Entity for `toggle` / `more-info` (default: this player) |
| `active` | When to highlight the button (YAML form) |
| `active_state`, `active_attribute`, `active_value` | Same, as flat fields (what the editor writes) |

### Actions

`tap_action.action` can be `perform-action`, `toggle`, `more-info`, `navigate` or `url`. A `perform-action` for a `media_player` service without a `target` uses this card's player. Other services need their own `target`.

```yaml
buttons:
  - icon: mdi:television
    label: HDMI 1
    tap_action:
      action: perform-action
      perform_action: media_player.select_source
      data:
        source: HDMI 1
    active:
      attribute: source
      value: HDMI 1

  - icon: mdi:lightbulb
    label: Lights
    service: light.toggle
    target:
      entity_id: light.tv

  - icon: mdi:cog
    label: Settings
    tap_action:
      action: navigate
      navigation_path: /config/devices
```

### Active highlight

```yaml
active: playing                    # state
active: [playing, paused]          # any of these states
active:
  attribute: is_volume_muted       # attribute equals value
  value: true
```

## Radio browser

Turn on the **Radio browser** section (add `radio` to `sections`) to add a station picker. It uses the built-in **Radio Browser** integration, so add that first under **Settings → Devices & services**.

The picker shows the integration's folders (Favorites, By country, By language, By popularity, By tag…), with a back button, a search box that filters the current folder, and station logos. Tapping a folder opens it, tapping a station plays it on the card's player with `media_player.play_media`. The station that is playing is highlighted. The tree loads the first time the section is shown, and folders are cached while the page is open.

```yaml
type: custom:media-control-card
entity: media_player.kitchen
sections:
  - header
  - volume
  - radio
radio_max_height: 320
```

### Radio options

In the editor these are in their own **Radio browser settings** section.

| Option | Type | Default | Description |
|---|---|---|---|
| `radio_title` | string | `Radio` | Title of the top level |
| `radio_max_height` | number | `240` | List height in px, the list scrolls |
| `radio_show_search` | boolean | `true` | Show the search box |
| `radio_show_thumbnails` | boolean | `true` | Show station logos |
| `radio_stations` | list | none | Pinned stations, see below |
| `radio_root` | string | `media-source://radio_browser` | Start folder |

### Pinned stations

Stations you always want one tap away. They show up as a **Pinned stations** folder at the top level. `media_content_id` is the station's `media-source://radio_browser/...` ID, which you can see in the media browser.

```yaml
radio_stations:
  - name: BBC Radio 1
    media_content_id: media-source://radio_browser/<station-uuid>
    thumbnail: https://example.com/logo.png   # optional
```

## Notes

- The stepper is disabled while the player is off or has no `volume_level`.
- Buttons are disabled only when the player is unavailable.
- If the header is hidden, tap the volume number to open more-info.
- Station logos come from the stations themselves. If Home Assistant runs over HTTPS, logos served over plain HTTP are blocked by the browser and a radio icon is shown instead.
- Pinned stations are edited as YAML in the visual editor.

## License

MIT
