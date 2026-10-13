/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { fn } from "storybook/test";

import type { Meta, StoryObj } from "@storybook/react-vite";
import { EmojiGrid } from "./EmojiGrid";
import { AddSoundDialog } from "./AddSoundDialog";

const meta: Meta = {
  title: "Swag/ReactionBoard",
};

export default meta;

export const EmojiPicker: StoryObj = {
  render: () => <EmojiGrid value="📯" onPick={fn()} />,
};

export const AddDialog: StoryObj = {
  render: () => (
    <AddSoundDialog open={true} error={null} onClose={fn()} onSubmit={fn()} />
  ),
};

export const AddDialogError: StoryObj = {
  render: () => (
    <AddSoundDialog
      open={true}
      error="Sound files must be 2 MB or smaller"
      onClose={fn()}
      onSubmit={fn()}
    />
  ),
};
