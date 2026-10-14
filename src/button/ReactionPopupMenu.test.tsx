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
import { ReactionSet } from "../reactions";

const { mockAdd, mockRemove, mockHideBuiltin, mockBoard } = vi.hoisted(() => ({
  mockAdd: vi.fn(),
  mockRemove: vi.fn(),
  mockHideBuiltin: vi.fn(),
  mockBoard: {
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
    hiddenBuiltins: [] as string[],
  },
}));

vi.mock("../swag/reactions/useCustomBoard", () => ({
  useCustomBoard: vi.fn(() => ({
    pads: mockBoard.pads,
    hiddenBuiltins: mockBoard.hiddenBuiltins,
    error: null,
    editable: true,
    add: mockAdd,
    remove: mockRemove,
    hideBuiltin: mockHideBuiltin,
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
  mockBoard.hiddenBuiltins = [];
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
  expect(queryByTestId("delete-builtin-thumbsup")).toBeNull();
});

test("the full grid is always present: built-ins, then custom pads, then add last", () => {
  const { getByLabelText, getByTestId, container } = renderMenu();
  const pad = getByTestId("custom-pad-pad1");
  expect(pad).toBeDefined();
  const addButton = getByLabelText("Add sound");
  const items = [...container.querySelectorAll("menu li")];
  const firstBuiltin = items.findIndex(
    (li) => li.querySelector("[data-testid^='builtin-']") !== null,
  );
  const padIndex = items.findIndex((li) => li.contains(pad));
  const addIndex = items.findIndex((li) => li.contains(addButton));
  expect(firstBuiltin).toBe(0);
  expect(padIndex).toBeGreaterThan(firstBuiltin);
  expect(addIndex).toBe(items.length - 1);
  expect(padIndex).toBeLessThan(addIndex);
  // Every built-in renders: no show-more gate.
  expect(items.length).toBe(ReactionSet.length + 1 + 1);
});

test("hidden built-ins are not rendered", () => {
  mockBoard.hiddenBuiltins = ["thumbsup"];
  const { queryByTestId, getByTestId } = renderMenu();
  expect(queryByTestId("builtin-thumbsup")).toBeNull();
  expect(getByTestId("builtin-party")).toBeDefined();
});

test("edit mode shows delete overlays for built-ins and custom pads", async () => {
  const user = userEvent.setup();
  const { getByLabelText, queryByTestId } = renderMenu();
  await user.click(getByLabelText("Edit sounds"));
  expect(queryByTestId("delete-custom-pad1")).not.toBeNull();
  expect(queryByTestId("delete-builtin-thumbsup")).not.toBeNull();
});

test("built-in delete confirm hides the built-in and never sends", async () => {
  const user = userEvent.setup();
  const { getByLabelText, getByTestId, getByText, sendReaction } = renderMenu();
  await user.click(getByLabelText("Edit sounds"));
  await user.click(getByTestId("builtin-thumbsup"));
  expect(sendReaction).not.toHaveBeenCalled();
  expect(getByText(/Delete thumbsup from the board/)).toBeDefined();
  await user.click(getByText("Delete", { selector: "button" }));
  expect(mockHideBuiltin).toHaveBeenCalledWith("thumbsup");
  expect(mockRemove).not.toHaveBeenCalled();
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
  expect(mockHideBuiltin).not.toHaveBeenCalled();
});

test("clicking custom pad outside edit mode sends the reaction", async () => {
  const user = userEvent.setup();
  const { getByTestId, sendReaction } = renderMenu();
  await user.click(getByTestId("custom-pad-pad1"));
  expect(sendReaction).toHaveBeenCalledTimes(1);
  expect(sendReaction.mock.calls[0][0]).toMatchObject({ padId: "pad1" });
});

test("clicking a built-in outside edit mode sends the reaction", async () => {
  const user = userEvent.setup();
  const { getByTestId, sendReaction } = renderMenu();
  await user.click(getByTestId("builtin-party"));
  expect(sendReaction).toHaveBeenCalledTimes(1);
  expect(sendReaction.mock.calls[0][0]).toMatchObject({ name: "party" });
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
