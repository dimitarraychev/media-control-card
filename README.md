# Media Control Card

A Home Assistant Lovelace card for media players: header, − / + volume stepper and a row of fully customizable action buttons (play, pause, stop, mute, anything). Styled like Mushroom or Bubble Card, with a visual editor.

## Features

- Header with icon, name, state, volume and optional media title/artist
- − / + volume stepper (`media_player.volume_set`) with debounce and instant feedback
- Row of custom buttons: presets or any action/service
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
show_header: false
show_buttons: false
```

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `entity` | string | **required** | `media_player` entity |
| `name` | string | friendly name | Card name |
| `icon` | string | by device class | Header icon |
| `show_header` | boolean | `true` | Show icon, name and status |
| `show_volume_control` | boolean | `true` | Show the − / + stepper |
| `show_buttons` | boolean | `true` | Show the button row |
| `buttons` | list | none | Buttons, see below |
| `layout` | string | `volume_buttons` | `volume_buttons` or `buttons_volume` |
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
| `active` | When to highlight the button |

### Actions

`tap_action.action` can be `perform-action`, `toggle`, `more-info`, `navigate` or `url`. If a `perform-action` has no `target`, it uses the card's entity.

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

## Notes

- The stepper is disabled while the player is off or has no `volume_level`.
- Buttons are disabled only when the player is unavailable.
- If the header is hidden, tap the volume number to open more-info.
- In the visual editor, buttons are edited as YAML.

## License

MIT
