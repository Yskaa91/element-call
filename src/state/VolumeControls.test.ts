/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, test, beforeEach } from "vitest";
import { of } from "rxjs";

import { createVolumeControls } from "./VolumeControls";
import { ObservableScope } from "./ObservableScope";
import { constant } from "./Behavior";

describe("volume control persistence anchors", () => {
  let scope: ObservableScope;

  beforeEach(() => {
    scope = new ObservableScope();
  });

  function create(
    initialVolume?: number,
    onCommittedVolume?: (volume: number) => void,
  ) {
    const volumes: number[] = [];
    const controls = createVolumeControls(scope, {
      pretendToBeDisconnected$: constant(false),
      sink$: constant((volume: number) => volumes.push(volume)),
      initialVolume,
      onCommittedVolume,
    });
    return { controls, volumes };
  }

  test("starts silent without anchors, at the stored volume with them", () => {
    const { volumes: defaultVolumes } = create();
    const { volumes: storedVolumes } = create(0.4);
    // The sink receives the starting volume on creation.
    expect(defaultVolumes[0]).toBe(1);
    expect(storedVolumes[0]).toBe(0.4);
  });

  test("reports committed slider volumes, never mute toggles", () => {
    const committed: number[] = [];
    const { controls } = create(1, (v) => committed.push(v));
    controls.adjustPlaybackVolume(0.5);
    controls.commitPlaybackVolume();
    expect(committed).toEqual([0.5]);
    controls.togglePlaybackMuted();
    controls.togglePlaybackMuted();
    expect(committed).toEqual([0.5]);
  });
});
