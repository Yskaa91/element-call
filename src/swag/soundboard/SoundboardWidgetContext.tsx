/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { createContext, type FC, type JSX, use } from "react";

import { type WidgetHelpers } from "../../widget.ts";

/**
 * The widget API, for swag features that talk to the host directly.
 *
 * Element Call only has the widget API in its app shell, but the soundboard
 * panel sits deep in the call view and needs it to read and write the board.
 * Null means Element Call is not running as a widget, so the soundboard is
 * unavailable and the panel stays hidden.
 */
const SoundboardWidgetContext = createContext<WidgetHelpers | null>(null);

export const SoundboardWidgetProvider: FC<{
  widget: WidgetHelpers | null;
  children: JSX.Element;
}> = ({ widget, children }) => (
  <SoundboardWidgetContext value={widget}>{children}</SoundboardWidgetContext>
);

/** The widget API, or null when Element Call is not a widget. */
export const useSoundboardWidget = (): WidgetHelpers | null =>
  use(SoundboardWidgetContext);
