---
inclusion: always
---

# Project Rule: Protect page0.txt

## Purpose of this project

The web app in `editer/editer.html` exists to **configure the contents of `page0.txt`**.
`page0.txt` is the firmware-compatible config file (INI-style) that the MIDI Captain
device reads. The editor generates/edits values that end up in this file's structure.

## Hard rule — page0.txt is a fixed contract

`page0.txt` defines a fixed data structure and wording that the device firmware depends on.

- **NEVER** change the data structure of `page0.txt`: do not add, remove, rename, or
  reorder sections (e.g. `[GlobalSetup]`, `[key1]`, `[keyA]`), keys, or fields.
- **NEVER** change the wording, spelling, casing, or formatting of any key names,
  section names, or literal tokens (e.g. `WIRELESS_2.4G`, `display_number_ABC`,
  `ledcolor0`, `short_dw1_name`, bracket `[...]` value wrapping).
- The layout, key order, and syntax must always remain intact.

## What editing IS allowed

- The editor may change the **values** a user assigns to existing keys, producing a
  `page0.txt` whose structure and key names are byte-for-byte compatible with the
  original format.
- UI, layout, and code changes to `editer/editer.html` are fine — as long as the file
  it reads/writes still matches the exact `page0.txt` structure and wording.

## When in doubt

If a requested change would alter the structure or wording of `page0.txt`, stop and
confirm with the user before proceeding. Treat `page0.txt` as a read-only contract for
its shape; only the values within the existing shape may vary.
