/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type ChangeEvent, type FC, useId } from "react";
import { useTranslation } from "react-i18next";
import {
  HelpMessage,
  InlineField,
  Label,
  RadioControl,
} from "@vector-im/compound-web";

import { FieldRow, InputField } from "../../input/Input";
import {
  autoGainControlSetting,
  echoCancellationSetting,
  noiseSuppressionSetting,
  useSetting,
} from "../../settings/settings";
import {
  NOISE_CANCELLATION_MODES,
  noiseCancellationSetting,
  type NoiseCancellationMode,
} from "./mode";

export const NoiseCancellationSettings: FC = () => {
  const { t } = useTranslation();
  const groupId = useId();

  const [mode, setMode] = useSetting(noiseCancellationSetting);
  const [echoCancellation, setEchoCancellation] = useSetting(
    echoCancellationSetting,
  );
  const [noiseSuppression, setNoiseSuppression] = useSetting(
    noiseSuppressionSetting,
  );
  const [autoGainControl, setAutoGainControl] = useSetting(
    autoGainControlSetting,
  );

  const onModeChange = (e: ChangeEvent<HTMLInputElement>): void => {
    setMode(e.target.value as NoiseCancellationMode);
  };

  const modeLabels: Record<NoiseCancellationMode, string> = {
    browser: t("settings.noise_cancellation_mode_browser", "Browser (default)"),
    gtcrn: t("settings.noise_cancellation_mode_gtcrn", "Enhanced (GTCRN)"),
    off: t("settings.noise_cancellation_mode_off", "Off"),
  };

  const modeDescriptions: Record<NoiseCancellationMode, string> = {
    browser: t(
      "settings.noise_cancellation_mode_browser_description",
      "Uses your browser's built-in echo cancellation, noise suppression, and automatic gain control. The toggles below still apply.",
    ),
    gtcrn: t(
      "settings.noise_cancellation_mode_gtcrn_description",
      "Replaces browser noise suppression with the GTCRN denoiser. Echo cancellation and automatic gain control still follow the toggles below.",
    ),
    off: t(
      "settings.noise_cancellation_mode_off_description",
      "Disables all browser processing, including echo cancellation.",
    ),
  };

  return (
    <>
      <h4>{t("settings.audio_processing_header", "Audio processing")}</h4>
      <p>
        {t(
          "settings.audio_processing_description",
          "Changes apply on next call join.",
        )}
      </p>
      <h4>{t("settings.noise_cancellation_mode_label", "Noise cancellation")}</h4>
      {NOISE_CANCELLATION_MODES.map((m) => (
        <InlineField
          key={m}
          name={groupId}
          control={
            <RadioControl
              checked={mode === m}
              value={m}
              onChange={onModeChange}
            />
          }
        >
          <Label>{modeLabels[m]}</Label>
          <HelpMessage>{modeDescriptions[m]}</HelpMessage>
        </InlineField>
      ))}
      <FieldRow>
        <InputField
          id="echoCancellation"
          label={t("settings.echo_cancellation_label", "Echo cancellation")}
          type="checkbox"
          checked={echoCancellation}
          onChange={(e): void => setEchoCancellation(e.target.checked)}
        />
      </FieldRow>
      <FieldRow>
        <InputField
          id="noiseSuppression"
          label={t("settings.noise_suppression_label", "Noise suppression")}
          type="checkbox"
          checked={noiseSuppression}
          onChange={(e): void => setNoiseSuppression(e.target.checked)}
        />
      </FieldRow>
      <FieldRow>
        <InputField
          id="autoGainControl"
          label={t(
            "settings.auto_gain_control_label",
            "Automatic gain control",
          )}
          type="checkbox"
          checked={autoGainControl}
          onChange={(e): void => setAutoGainControl(e.target.checked)}
        />
      </FieldRow>
    </>
  );
};
