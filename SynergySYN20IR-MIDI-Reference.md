# Synergy SYN-20IR — MIDI Reference (working notes)

Purpose: MIDI mapping used by the editor's "SYN quick-fill" on footswitch commands.

> Sourcing note: The provided `SYNERGY-SYN-20IR-MANUAL-FINAL-2026.pdf` uses embedded
> subset fonts, so its text/tables could not be machine-extracted in this environment
> (no OCR available), and ManualsLib/Sweetwater do not publish the CC table online.
> The values below marked **CONFIRMED** come from Synergy's published modular MIDI
> implementation (SYN‑2 manual), which the SYN family shares. Values marked **TO CONFIRM**
> must be read from your SYN‑20IR manual before relying on them.
> Content was rephrased for compliance with licensing restrictions.

---

## Channel / mode setup (from the device)

- A 16‑position rotary switch sets the MIDI channel.
- A slide switch selects **SELECT** mode (use the rotary channel) or **OMNI** (respond on all
  16 channels at once).
- Presets can be stored on the unit so a controller Program Change recalls a channel/state;
  the unit also responds to Continuous Controller (CC) messages for instant access.

## CC value rule (CONFIRMED, family-wide)

- For channel-select CCs, **only a value of 64 or higher takes effect**; 63 or lower is ignored.
- **Mute:** a value of 64+ mutes; 63 or lower un-mutes.
- The editor's quick-fill uses **127** to trigger and **0** to release.

## CC map

| CC# | Function | Status |
|---|---|---|
| 56 | Module Channel A | CONFIRMED (SYN-2 slot 1A) |
| 57 | Module Channel B | CONFIRMED (SYN-2 slot 1B) |
| 60 | Bypass (preamp) | CONFIRMED |
| 64 | Mute (64+ mute, ≤63 un-mute) | CONFIRMED |
| ?? | Built-in Clean channel select | **TO CONFIRM** |
| ?? | IR preset 1 | **TO CONFIRM** |
| ?? | IR preset 2 | **TO CONFIRM** |
| ?? | IR preset 3 | **TO CONFIRM** |
| ?? | IR preset 4 | **TO CONFIRM** |
| ?? | IR bypass | **TO CONFIRM** |

The SYN-20IR front panel exposes **IR/BYPASS (1,2,3,4)** — a short press selects the IR
cabinet preset, a long press bypasses the IR/cab simulation. It also adds a built-in
American-style **clean** channel in addition to the module's two channels (A/B).

Program Change (PC) is also supported to recall stored presets.

---

## Editor integration

The editor's **SYN quick-fill** dropdown (on each footswitch command) fills the command
Type = CC, the SYN MIDI channel (from the navbar **SYN Ch** selector), the CC number and the
value. Currently it offers the CONFIRMED actions (Channel A, Channel B, Preamp Bypass,
Mute on/off).

To add the IR presets and clean channel: fill in the **TO CONFIRM** CC numbers above from
your manual, then add them to the `SYN_ACTIONS` list in `editer/editer.html` (an
`"SYN-20IR — IR & Clean"` group), e.g. `["IR Preset 1", <cc>, 127]`.
