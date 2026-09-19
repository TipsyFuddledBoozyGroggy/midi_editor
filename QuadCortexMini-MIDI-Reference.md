# Quad Cortex mini — MIDI Reference

Source: Neural DSP Quad Cortex mini User Manual (CorOS 4.1.0) — MIDI Support section.
This document captures the MIDI-pertinent information needed to control a Quad Cortex mini
from an external MIDI foot controller (such as the MIDI Captain Mini).

Content was rephrased for compliance with licensing restrictions.

---

## Connections

The Quad Cortex mini supports MIDI over two transports:

- **USB-B** (USB MIDI).
- **TRS MIDI (Type-A)** — the MIDI Association standard.
  - **Tip:** Data line (equivalent to MIDI DIN pin 5).
  - **Ring:** Voltage reference (MIDI DIN pin 4).
  - **Sleeve:** Shield (MIDI DIN pin 2).
  - Any TRS MIDI cable wired to the Type-A standard will work.

Hardware MIDI ports: 3.5 mm TRS-F for both IN and OUT/THRU (MIDI Type A).

**MIDI channel / Thru / MIDI-over-USB / MIDI Clock** are configured on the device under
**Device Settings → MIDI**. Set the controller to send on the same channel the QC listens on.

---

## Incoming MIDI — what the QC responds to

These are the messages an external controller (the MIDI Captain) sends **to** the Quad Cortex
mini to control it.

### Preset / Setlist recall (Program Change)

The QC recalls presets with a combination of Bank Select CCs plus a Program Change:

| Message | Range | Purpose |
|---|---|---|
| **CC#0** (Bank MSB) | 0–1 | Preset group within the active setlist. `0` = presets 0–127, `1` = presets 128–256. |
| **CC#32** (Bank LSB) | 0–12 | Selects the setlist. `0` = Factory Presets, `1` = My Presets, `2–12` = User folders. |
| **PC# (Program Change)** | 0–127 | Recalls a preset within the group chosen by CC#0. |

Notes:
- Send CC#0 and CC#32 first (if changing group/setlist), then the Program Change.
- Neural DSP offers an online "MIDI PC Calculator" to work out the exact PC to send.

### Expression pedal control

| CC# | Function | Values |
|---|---|---|
| **CC#1** | Expression Pedal 1 position | 0 = heel, 127 = toe |
| **CC#2** | Expression Pedal 2 position (MIDI-exclusive) | 0 = heel, 127 = toe |

### Footswitch control (emulate pressing A/B/C/D)

| CC# | Footswitch | Page |
|---|---|---|
| **CC#35** | A | Page I |
| **CC#36** | B | Page I |
| **CC#37** | C | Page I |
| **CC#38** | D | Page I |
| **CC#39** | A | Page II |
| **CC#40** | B | Page II |
| **CC#41** | C | Page II |
| **CC#42** | D | Page II |

Any value 0–127 acts as a footswitch press.

### Scene recall

**CC#43** recalls a scene:

| Value | Scene |
|---|---|
| 0 | Scene A (Page I) |
| 1 | Scene B (Page I) |
| 2 | Scene C (Page I) |
| 3 | Scene D (Page I) |
| 4 | Scene A (Page II) |
| 5 | Scene B (Page II) |
| 6 | Scene C (Page II) |
| 7 | Scene D (Page II) |

### Menu access & feature control

| CC# | Function | Values |
|---|---|---|
| **CC#44** | Tap Tempo | 0–127 = a tap press |
| **CC#45** | Tuner | 0–63 = close, 64–127 = open |
| **CC#46** | Gig View | 0–63 = close, 64–127 = open |
| **CC#47** | Modes | 0 = Mode Slot 1 (Preset), 1 = Slot 2 (Scene), 2 = Slot 3 (Stomp) |

Mode note: If modes are reordered on the device, the CC values do **not** follow the new
order. An empty mode slot recalls nothing.

### Looper X control

| CC# | Function | Values |
|---|---|---|
| **CC#48** | Looper X editor | 0–63 = open (Perform), 64–127 = close |
| **CC#49** | Duplicate | 64–127 toggles |
| **CC#50** | One Shot | 64–127 toggles |
| **CC#51** | Half Speed | 64–127 toggles |
| **CC#52** | Punch In/Out | 64–127 toggles |
| **CC#53** | Record / Overdub | 64–127 toggles |
| **CC#54** | Play / Stop | 64–127 toggles |
| **CC#55** | Reverse | 64–127 toggles |
| **CC#56** | Undo / Redo | 64–127 toggles |
| **CC#57** | Duplicate Mode | 0 = Free, 1 = Sync |
| **CC#58** | Quantize | 0 = Off, 1–8 = 1–8 beats, 9 = 16 beats |
| **CC#59** | MIDI Clock Start | 0 = Free, 1 = Sync |
| **CC#60** | Perform / Parameters swap | 0 = Perform, 1 = Parameters |
| **CC#61** | Routing Mode | 0 = Grid, 1 = In 1, 2 = In 2, 3 = Return 1, 4 = Return 2, 5 = Ins 1/2, 6 = Returns 1/2, 7–10 = Out 1–4, 11 = Outs 1/2, 12 = Outs 3/4, 13 = Multiple Outputs block |

### MIDI settings

| CC# | Function | Values |
|---|---|---|
| **CC#62** | Ignore Duplicate PC | 0–63 = off (reload each time), 64–127 = on (ignore repeat PCs; also ignores related CC#0/CC#32) |

### Quad Cortex mini exclusive

| CC# | Function | Values |
|---|---|---|
| **CC#64** | Footswitch Page Swap | 0–63 = Page I, 64–127 = Page II |

---

## Outgoing MIDI — Preset MIDI Out (from the QC)

The QC can also **send** MIDI when footswitches are pressed or a preset loads (via USB and/or
TRS MIDI). Included here for completeness; not needed to control the QC from the MIDI Captain.

**Per footswitch / expression:** up to 12 MIDI messages each, separate for Page I and Page II.
- **TYPE:** CC, CC Toggle, or PC
- **CHANNEL:** 1–16
- **CC#:** 0–127
- **BANK CC#0 / BANK CC#32:** Bank Select MSB / LSB for PC messages
- **VALUE:** 0–127 (CC)
- **MIN/MAX VALUE:** 0–127 (CC Toggle)
- **PROGRAM#:** 0–127 (PC)

Behavior:
- Footswitch MIDI is sent only in SCENE, STOMP, or HYBRID modes.
- Expression pedal MIDI is always sent, regardless of mode.

**On Preset Load:** up to 12 messages (CC or PC) sent when the preset loads.

---

## Programming the MIDI Captain Mini to drive the QC

The MIDI Captain sends CC/PC messages; the QC listens per the "Incoming MIDI" tables above.
Typical footswitch assignments (send on the QC's MIDI channel):

| Goal | Message to send |
|---|---|
| Toggle a Stomp (Footswitch A, Page I) | CC#35, value 127 |
| Recall Scene B | CC#43, value 1 |
| Enter Scene mode | CC#47, value 1 |
| Tap tempo | CC#44, value 127 |
| Open the tuner | CC#45, value 127 |
| Toggle Gig View | CC#46, value 127 (open) / 0 (close) |
| Looper record/overdub | CC#53, value 127 |
| Looper play/stop | CC#54, value 127 |
| Swap footswitch page | CC#64, value 127 (Page II) / 0 (Page I) |
| Change preset | Program Change (with CC#0 / CC#32 first if changing group/setlist) |

For preset changes across banks/setlists, use the editor's **Auto PC Bank** section with the
QC's bank CCs: **CC#0** (MSB, 0–1) and **CC#32** (LSB / setlist, 0–12).
