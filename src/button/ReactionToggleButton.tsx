/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { Button as CpdButton, Tooltip, Alert } from "@vector-im/compound-web";
import {
  RaisedHandSolidIcon,
  ReactionSolidIcon,
  EditIcon,
  PlusIcon,
  CloseIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";
import {
  type ComponentPropsWithoutRef,
  type FC,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { logger } from "matrix-js-sdk/lib/logger";
import classNames from "classnames";

import { useReactionsSender } from "../reactions/useReactionsSender";
import styles from "./ReactionToggleButton.module.css";
import {
  type RaisedHandInfo,
  type ReactionOption,
  ReactionSet,
  ReactionsRowSize,
} from "../reactions";
import { Modal } from "../Modal";
import { useBehavior } from "../useBehavior";
import { type Behavior } from "../state/Behavior";
import { useCustomBoard } from "../swag/reactions/useCustomBoard";
import {
  mergeCustomReactions,
  type CustomReactionOption,
} from "../swag/reactions/customBoard";
import {
  AddSoundDialog,
  validateNewPad,
  type NewPad,
} from "../swag/reactions/AddSoundDialog";
import { SOUNDBOARD_LIMITS } from "../swag/soundboard/board";

interface InnerButtonProps extends ComponentPropsWithoutRef<"button"> {
  raised: boolean;
  open: boolean;
}

const InnerButton: FC<InnerButtonProps> = ({ raised, open, ...props }) => {
  const { t } = useTranslation();

  return (
    <Tooltip label={t("common.reactions")}>
      <CpdButton
        className={classNames(raised && styles.raisedButton)}
        aria-expanded={open}
        aria-haspopup
        kind={raised || open ? "primary" : "secondary"}
        iconOnly
        Icon={raised ? RaisedHandSolidIcon : ReactionSolidIcon}
        {...props}
      />
    </Tooltip>
  );
};

export function ReactionPopupMenu({
  sendReaction,
  toggleRaisedHand,
  isHandRaised,
  canReact,
  errorText,
  roomId,
}: {
  sendReaction: (reaction: ReactionOption) => void;
  toggleRaisedHand: () => void;
  errorText?: string;
  isHandRaised: boolean;
  canReact: boolean;
  /** The call room: custom pads load from its space board. Empty in tests. */
  roomId?: string;
}): ReactNode {
  const { t } = useTranslation();
  const [editMode, setEditMode] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<
    ReactionOption | CustomReactionOption | null
  >(null);
  const { pads, hiddenBuiltins, error, editable, add, remove, hideBuiltin } =
    useCustomBoard(roomId ?? "");

  // The full grid, always: visible built-ins, then custom pads, then the add
  // button last. Deleting a built-in hides it space-wide via the board state.
  const visibleBuiltinReactions = useMemo(
    () => ReactionSet.filter((r) => !hiddenBuiltins.includes(r.name)),
    [hiddenBuiltins],
  );
  const customReactions = useMemo(
    () =>
      mergeCustomReactions([], roomId ? pads : []).filter(
        (reaction): reaction is CustomReactionOption => "padId" in reaction,
      ),
    [pads, roomId],
  );
  const label = isHandRaised ? t("action.lower_hand") : t("action.raise_hand");

  const submitAdd = useCallback(
    async (pad: NewPad): Promise<void> => {
      // Emoji, name, size and full-board are checkable before anything is
      // decoded or uploaded; duration is re-checked in the hook after decode.
      // A refusal keeps the dialog open with the reason shown inside it.
      const refusal = validateNewPad({
        emoji: pad.emoji,
        name: pad.name,
        file: pad.file,
        durationMs: 0,
        full: pads.length >= SOUNDBOARD_LIMITS.maxSounds,
      });
      if (refusal !== null) {
        setAddError(refusal);
        return;
      }
      setAddError(null);
      await add(pad);
      setAddOpen(false);
    },
    [add, pads],
  );

  const confirmDelete = useCallback(async (): Promise<void> => {
    if (pendingDelete === null) return;
    const doomed = pendingDelete;
    setPendingDelete(null);
    if ("padId" in doomed) {
      await remove(doomed.padId);
    } else {
      await hideBuiltin(doomed.name);
    }
  }, [pendingDelete, remove, hideBuiltin]);
  return (
    <>
      {errorText && (
        <Alert
          className={styles.alert}
          type="critical"
          title={t("error.generic")}
        >
          {errorText}
        </Alert>
      )}
      {error !== null && (
        <Alert
          className={styles.alert}
          type="critical"
          title={t("error.generic")}
        >
          {error}
        </Alert>
      )}
      <div className={styles.reactionPopupMenu}>
        <section
          className={classNames(styles.handRaiseSection, styles.leftControls)}
        >
          <Tooltip label={label} caption="H">
            <CpdButton
              kind={isHandRaised ? "primary" : "secondary"}
              aria-keyshortcuts="H"
              aria-pressed={isHandRaised}
              aria-label={label}
              onClick={() => toggleRaisedHand()}
              iconOnly
              Icon={RaisedHandSolidIcon}
            />
          </Tooltip>
          {editable && (
            <Tooltip label={t("action.edit_sounds")}>
              <CpdButton
                kind={editMode ? "primary" : "secondary"}
                aria-pressed={editMode}
                aria-label={t("action.edit_sounds")}
                onClick={() => setEditMode((value) => !value)}
                iconOnly
                Icon={EditIcon}
              />
            </Tooltip>
          )}
        </section>
        <div className={styles.verticalSeperator} />
        <section className={styles.reactionsMenuSection}>
          <menu className={styles.reactionsMenu}>
            {visibleBuiltinReactions.map((reaction, index) => (
              <li
                key={reaction.name}
                className={classNames(editMode && styles.editableReaction)}
              >
                <Tooltip
                  label={reaction.name}
                  caption={
                    index < ReactionsRowSize
                      ? (index + 1).toString()
                      : undefined
                  }
                >
                  <CpdButton
                    kind="secondary"
                    className={styles.reactionButton}
                    disabled={editMode ? false : !canReact}
                    onClick={() =>
                      editMode
                        ? setPendingDelete(reaction)
                        : sendReaction(reaction)
                    }
                    aria-keyshortcuts={
                      index < ReactionsRowSize
                        ? (index + 1).toString()
                        : undefined
                    }
                    data-testid={`builtin-${reaction.name}`}
                  >
                    {reaction.emoji}
                  </CpdButton>
                </Tooltip>
                {editMode && (
                  <button
                    type="button"
                    className={styles.deleteOverlay}
                    aria-label={t("action.delete_sound", {
                      name: reaction.name,
                    })}
                    onClick={() => setPendingDelete(reaction)}
                    data-testid={`delete-builtin-${reaction.name}`}
                  >
                    <CloseIcon aria-hidden />
                  </button>
                )}
              </li>
            ))}
            {customReactions.map((reaction) => (
              <li
                key={`custom-${reaction.padId}`}
                className={classNames(editMode && styles.editableReaction)}
              >
                <Tooltip label={reaction.name}>
                  <CpdButton
                    kind="secondary"
                    className={styles.reactionButton}
                    disabled={editMode ? false : !canReact}
                    onClick={() =>
                      editMode
                        ? setPendingDelete(reaction)
                        : sendReaction(reaction)
                    }
                    data-testid={`custom-pad-${reaction.padId}`}
                  >
                    {reaction.emoji}
                  </CpdButton>
                </Tooltip>
                {editMode && (
                  <button
                    type="button"
                    className={styles.deleteOverlay}
                    aria-label={t("action.delete_sound", {
                      name: reaction.name,
                    })}
                    onClick={() => setPendingDelete(reaction)}
                    data-testid={`delete-custom-${reaction.padId}`}
                  >
                    <CloseIcon aria-hidden />
                  </button>
                )}
              </li>
            ))}
            {editable && (
              <li>
                <Tooltip label={t("action.add_sound")}>
                  <CpdButton
                    kind="secondary"
                    className={styles.reactionButton}
                    onClick={() => {
                      setAddError(null);
                      setAddOpen(true);
                    }}
                    aria-label={t("action.add_sound")}
                    iconOnly
                    Icon={PlusIcon}
                  />
                </Tooltip>
              </li>
            )}
          </menu>
        </section>
      </div>
      <AddSoundDialog
        open={addOpen}
        error={addError}
        onClose={() => setAddOpen(false)}
        onSubmit={(pad) => void submitAdd(pad)}
      />
      <Modal
        open={pendingDelete !== null}
        title={t("action.delete_sound", { name: pendingDelete?.name ?? "" })}
        onDismiss={() => setPendingDelete(null)}
      >
        <p>
          {t("action.delete_sound_confirm", {
            name: pendingDelete?.name ?? "",
          })}
        </p>
        <CpdButton kind="primary" onClick={() => void confirmDelete()}>
          {t("action.delete")}
        </CpdButton>
      </Modal>
    </>
  );
}

export interface ReactionData {
  handsRaised$: Behavior<Record<string, RaisedHandInfo>>;
  /** List of reactions. Keys are: membership.membershipId (currently predefined as: `${membershipEvent.userId}:${membershipEvent.deviceId}`)*/
  reactions$: Behavior<Record<string, ReactionOption>>;
}

interface ReactionToggleButtonProps extends ComponentPropsWithoutRef<"button"> {
  reactionData: ReactionData;
  identifier: string;
  size?: "md" | "lg";
  /** List of participants raising their hand */
}

export function ReactionToggleButton({
  identifier,
  reactionData: { handsRaised$, reactions$ },
  ...props
}: ReactionToggleButtonProps): ReactNode {
  const { t } = useTranslation();
  const { toggleRaisedHand, sendReaction, roomId } = useReactionsSender();
  const [busy, setBusy] = useState(false);
  const [showReactionsMenu, setShowReactionsMenu] = useState(false);
  const [errorText, setErrorText] = useState<string>();

  const isHandRaised = !!useBehavior(handsRaised$)[identifier];
  const canReact = !useBehavior(reactions$)[identifier];

  useEffect(() => {
    // Clear whenever the reactions menu state changes.
    setErrorText(undefined);
  }, [showReactionsMenu]);

  const sendRelation = useCallback(
    async (reaction: ReactionOption) => {
      try {
        setBusy(true);
        await sendReaction(reaction);
        setErrorText(undefined);
        setShowReactionsMenu(false);
      } catch (ex) {
        setErrorText(ex instanceof Error ? ex.message : "Unknown error");
        logger.error("Failed to send reaction", ex);
      } finally {
        setBusy(false);
      }
    },
    [sendReaction],
  );

  const wrappedToggleRaisedHand = useCallback(() => {
    const toggleHand = async (): Promise<void> => {
      try {
        setBusy(true);
        await toggleRaisedHand();
        setShowReactionsMenu(false);
      } catch (ex) {
        setErrorText(ex instanceof Error ? ex.message : "Unknown error");
        logger.error("Failed to raise/lower hand", ex);
      } finally {
        setBusy(false);
      }
    };

    void toggleHand();
  }, [toggleRaisedHand]);

  return (
    <>
      <InnerButton
        disabled={busy}
        onClick={() => setShowReactionsMenu((show) => !show)}
        raised={!!isHandRaised}
        open={showReactionsMenu}
        {...props}
      />
      <Modal
        open={showReactionsMenu}
        title={t("action.pick_reaction")}
        hideHeader
        classNameModal={styles.reactionPopupMenuModal}
        className={styles.reactionPopupMenuRoot}
        onDismiss={() => setShowReactionsMenu(false)}
      >
        <ReactionPopupMenu
          errorText={errorText}
          isHandRaised={!!isHandRaised}
          canReact={!busy && !!canReact}
          roomId={roomId}
          sendReaction={(reaction) => void sendRelation(reaction)}
          toggleRaisedHand={wrappedToggleRaisedHand}
        />
      </Modal>
    </>
  );
}
