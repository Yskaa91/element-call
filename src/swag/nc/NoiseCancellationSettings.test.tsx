/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Root as Form, TooltipProvider } from "@vector-im/compound-web";

import { NoiseCancellationSettings } from "./NoiseCancellationSettings";
import {
  autoGainControlSetting,
  echoCancellationSetting,
  noiseSuppressionSetting,
} from "../../settings/settings";
import {
  NOISE_CANCELLATION_MODES,
  noiseCancellationSetting,
} from "./mode";

function renderSettings(): void {
  render(
    <TooltipProvider>
      <Form>
        <NoiseCancellationSettings />
      </Form>
    </TooltipProvider>,
  );
}

describe("NoiseCancellationSettings", () => {
  afterEach(() => {
    noiseCancellationSetting.setValue("browser");
    echoCancellationSetting.setValue(true);
    noiseSuppressionSetting.setValue(true);
    autoGainControlSetting.setValue(true);
  });

  it("renders the three mode options", () => {
    renderSettings();
    for (const mode of NOISE_CANCELLATION_MODES) {
      expect(screen.getByDisplayValue(mode)).toBeInTheDocument();
    }
  });

  it("renders the three toggles", () => {
    renderSettings();
    expect(screen.getByLabelText("Echo cancellation")).toBeInTheDocument();
    expect(screen.getByLabelText("Noise suppression")).toBeInTheDocument();
    expect(screen.getByLabelText("Automatic gain control")).toBeInTheDocument();
  });

  it("reflects the stored mode", () => {
    noiseCancellationSetting.setValue("gtcrn");
    renderSettings();
    expect(screen.getByDisplayValue("gtcrn")).toBeChecked();
    expect(screen.getByDisplayValue("browser")).not.toBeChecked();
  });

  it("writes the mode setting on change", async () => {
    const user = userEvent.setup();
    renderSettings();
    expect(noiseCancellationSetting.getValue()).toBe("browser");
    await user.click(screen.getByDisplayValue("off"));
    expect(noiseCancellationSetting.getValue()).toBe("off");
  });

  it("writes the toggle settings on change", async () => {
    const user = userEvent.setup();
    renderSettings();
    expect(echoCancellationSetting.getValue()).toBe(true);
    expect(noiseSuppressionSetting.getValue()).toBe(true);
    expect(autoGainControlSetting.getValue()).toBe(true);

    await user.click(screen.getByLabelText("Echo cancellation"));
    expect(echoCancellationSetting.getValue()).toBe(false);

    await user.click(screen.getByLabelText("Noise suppression"));
    expect(noiseSuppressionSetting.getValue()).toBe(false);

    await user.click(screen.getByLabelText("Automatic gain control"));
    expect(autoGainControlSetting.getValue()).toBe(false);
  });
});
