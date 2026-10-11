# Swag anchors — Element Call

The swag rule: every feature lives in its own directory, `src/swag/<feature>/`. Upstream files are
touched only by *anchors*: a registration line, a capability request, a render slot. No anchor hunk
should be larger than about 20 lines. This file records every anchor and why it exists, and is updated
in the same commit as the anchor. Rebases should conflict here, and in the anchors, and nowhere else.

## Anchors added by phase 2 (soundboard)

_None yet — the board schema module (`src/swag/soundboard/board.ts`) and the check workflow add no
anchor. The widget capabilities land in the next commit._
