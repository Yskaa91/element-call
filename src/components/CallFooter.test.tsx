/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TooltipProvider } from "@vector-im/compound-web";
import { type JSX } from "react";

import { CallFooter, type FooterSnapshot } from "./CallFooter";
import { useStaticViewModel } from "../state/ViewModel";

const snapshot: FooterSnapshot = {
  showLogo: false,
  audioEnabled: true,
  audioBusy: false,
  videoEnabled: true,
  videoBusy: false,
  openSettings: (): void => {},
  toggleAudio: (): void => {},
  toggleVideo: (): void => {},
  toggleBlur: (): void => {},
  toggleScreenSharing: (): void => {},
  videoBlurEnabled: false,
  hangup: (): void => {},
  buttonSize: "lg",
  showFooter: true,
  hideControls: false,
  asOverlay: false,
  showModals: true,
  sharingScreen: false,
  audioOutputSwitcher: undefined,
  reactionIdentifier: undefined,
  reactionData: undefined,
  debugTileLayout: false,
  tileStoreGeneration: undefined,
  audioOptions: [],
  videoOptions: [],
  selectedAudio: undefined,
  selectedVideo: undefined,
  selectAudioButtonOption: undefined,
  selectVideoButtonOption: undefined,
  layoutSwitchVm: null,
};

function Wrapper({
  children,
  narrowChildren,
}: {
  children?: JSX.Element;
  narrowChildren?: JSX.Element;
}): JSX.Element {
  const vm = useStaticViewModel(snapshot);
  return (
    <TooltipProvider>
      <CallFooter vm={vm} narrowChildren={narrowChildren}>
        {children}
      </CallFooter>
    </TooltipProvider>
  );
}

describe("CallFooter", () => {
  it("renders the settings-slot children", () => {
    render(<Wrapper children={<button data-testid="wide-entry" />} />);
    expect(screen.getByTestId("wide-entry")).toBeTruthy();
  });

  it("renders the narrow entry point", () => {
    // The settings slot is hidden below 500px, so the soundboard needs an
    // entry point in the centre button group; this asserts CallFooter wires it.
    render(<Wrapper narrowChildren={<button data-testid="narrow-entry" />} />);
    expect(screen.getByTestId("narrow-entry")).toBeTruthy();
  });
});
