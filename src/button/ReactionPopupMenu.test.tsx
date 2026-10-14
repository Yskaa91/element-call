/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { render } from "@testing-library/react";
import { expect, test, vi, beforeEach } from "vitest";
import { TooltipProvider } from "@vector-im/compound-web";
import { userEvent } from "@testing-library/user-event";

import { ReactionPopupMenu } from "./ReactionToggleButton";

const { mockAdd, mockRemove } = vi.hoisted(() => ({
  mockAdd: vi.fn(),
  mockRemove: vi.fn(),
}));

vi.mock("../swag/reactions/useCustomBoard", () => ({
  useCustomBoard: vi.fn(() => ({
    pads: [
      {
        id: "pad1",
        name: "Horn",
        emoji: "📯",
        mxc: "mxc://example/horn",
        mimetype: "audio/ogg",
        size: 1000,
        durationMs: 1000,
        addedBy: "@alice:example.org",
        addedTs: 0,
      },
    ],
    error: null,
    editable: true,
    add: mockAdd,
    remove: mockRemove,
  })),
}));

function renderMenu(props?: {
  sendReaction?: (reaction: unknown) => void;
  canReact?: boolean;
}): ReturnType<typeof render> & { sendReaction: ReturnType<typeof vi.fn> } {
  const sendReaction = vi.fn(props?.sendReaction);
  const rendered = render(
    <TooltipProvider>
      <ReactionPopupMenu
        sendReaction={sendReaction as never}
        toggleRaisedHand={vi.fn()}
        isHandRaised={false}
        canReact={props?.canReact ?? true}
        roomId="!room:example.org"
      />
    </TooltipProvider>,
  );
  return { ...rendered, sendReaction };
}

beforeEach(() => {
  vi.clearAllMocks();
});

test("pencil sits under the hand button in DOM order", () => {
  const { getByLabelText } = renderMenu();
  const hand = getByLabelText("Raise hand");
  const pencil = getByLabelText("Edit sounds");
  expect(hand).toBeDefined();
  expect(pencil).toBeDefined();
  expect(
    hand.compareDocumentPosition(pencil) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});

test("no delete overlay before edit mode", () => {
  const { queryByTestId } = renderMenu();
  expect(queryByTestId("delete-custom-pad1")).toBeNull();
});

test("edit mode shows delete overlay; clicking pad opens confirm and does not send", async () => {
  const user = userEvent.setup();
  const {
    getByLabelText,
    getByTestId,
    queryByTestId,
    getByText,
    sendReaction,
  } = renderMenu();
  await user.click(getByLabelText("Edit sounds"));
  expect(queryByTestId("delete-custom-pad1")).not.toBeNull();
  await user.click(getByTestId("custom-pad-pad1"));
  expect(sendReaction).not.toHaveBeenCalled();
  expect(getByText(/Delete Horn from the board/)).toBeDefined();
  await user.click(getByText("Delete", { selector: "button" }));
  expect(mockRemove).toHaveBeenCalledWith("pad1");
});

test("clicking custom pad outside edit mode sends the reaction", async () => {
  const user = userEvent.setup();
  const { getByTestId, sendReaction } = renderMenu();
  await user.click(getByTestId("custom-pad-pad1"));
  expect(sendReaction).toHaveBeenCalledTimes(1);
  expect(sendReaction.mock.calls[0][0]).toMatchObject({ padId: "pad1" });
});

test("edit-mode pad stays enabled when reactions are exhausted", async () => {
  const user = userEvent.setup();
  const { getByLabelText, getByTestId, getByText } = renderMenu({
    canReact: false,
  });
  await user.click(getByLabelText("Edit sounds"));
  const pad = getByTestId("custom-pad-pad1");
  expect((pad as HTMLButtonElement).disabled).toBe(false);
  await user.click(pad);
  expect(getByText(/Delete Horn from the board/)).toBeDefined();
});
