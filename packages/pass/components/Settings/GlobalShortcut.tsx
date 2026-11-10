import { type FC, Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { c } from 'ttag';

import { useNotifications } from '@proton/app-context/useNotifications';
import { Button } from '@proton/atoms/Button/Button';
import { PASS_APP_NAME } from '@proton/shared/lib/constants';
import noop from '@proton/utils/noop';

import type { CopyShortcutField } from '../../lib/copy-shortcuts/copy-shortcuts';
import { COPY_SHORTCUT_FIELDS, resolveCopyShortcuts } from '../../lib/copy-shortcuts/copy-shortcuts';
import {
    acceleratorFromKeyEvent,
    getAcceleratorKeyLabels,
    getAcceleratorPlatform,
} from '../../lib/global-shortcut/accelerator';
import { settingsEditIntent } from '../../store/actions/creators/settings';
import { selectCopyShortcuts } from '../../store/selectors/settings';
import type { GlobalShortcutState } from '../../types/desktop';
import type { MaybeNull } from '../../types/utils';
import { logger } from '../../utils/logger';
import { SettingsPanel } from './SettingsPanel';
import { ShortcutRow } from './ShortcutRow';

const platform = getAcceleratorPlatform(BUILD_TARGET);

type ShortcutTarget = 'summon' | CopyShortcutField;

const getModifierHint = () => {
    switch (platform) {
        case 'darwin':
            return c('Info').t`Include Cmd, Ctrl or Option in the shortcut.`;
        case 'win32':
            return c('Info').t`Include Ctrl, Alt or Win in the shortcut.`;
        default:
            return c('Info').t`Include Ctrl, Alt or Super in the shortcut.`;
    }
};

const getShortcutTakenMessage = () =>
    c('Warning').t`This shortcut is used by another application. Choose a different one.`;

const getShortcutInUseMessage = () => c('Warning').t`This shortcut is already in use. Choose a different one.`;

const getCopyShortcutDescription = (field: CopyShortcutField) => {
    switch (field) {
        case 'email':
            return c('Info').t`Copy the email of the selected item`;
        case 'username':
            return c('Info').t`Copy the username of the selected item`;
        case 'password':
            return c('Info').t`Copy the password of the selected item`;
        case 'totp':
            return c('Info').t`Copy the 2FA code of the selected item`;
    }
};

type RecorderHandlers = {
    /** Escape pressed or the window lost focus */
    onCancel: () => void;
    /** A key without Ctrl, Alt or Cmd/Super */
    onInvalid: () => void;
    onRecord: (accelerator: string) => void;
};

/** Captures the next shortcut pressed while `active`. Listens in the
 * capture phase so no other keyboard handler sees the keys. */
const useAcceleratorRecorder = (active: boolean, handlers: RecorderHandlers) => {
    const handlersRef = useRef(handlers);
    handlersRef.current = handlers;

    useEffect(() => {
        if (!active) return;

        const onKeyDown = (event: KeyboardEvent) => {
            event.preventDefault();
            event.stopImmediatePropagation();
            if (event.repeat) return;

            if (event.code === 'Escape' && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey) {
                return handlersRef.current.onCancel();
            }

            const result = acceleratorFromKeyEvent(event, platform);
            if (result.type === 'pending') return;
            if (result.type === 'invalid') return handlersRef.current.onInvalid();
            handlersRef.current.onRecord(result.accelerator);
        };

        const onBlur = () => handlersRef.current.onCancel();

        window.addEventListener('keydown', onKeyDown, { capture: true });
        window.addEventListener('blur', onBlur);

        return () => {
            window.removeEventListener('keydown', onKeyDown, { capture: true });
            window.removeEventListener('blur', onBlur);
        };
    }, [active]);
};

const GlobalShortcutDesktop: FC<{ bridge: NonNullable<Window['ctxBridge']>['globalShortcut'] }> = ({ bridge }) => {
    const { createNotification } = useNotifications();
    const dispatch = useDispatch();
    const copyShortcuts = resolveCopyShortcuts(useSelector(selectCopyShortcuts), platform);

    const [state, setState] = useState<MaybeNull<GlobalShortcutState>>(null);
    const [recording, setRecording] = useState<MaybeNull<ShortcutTarget>>(null);
    const [hint, setHint] = useState<MaybeNull<string>>(null);
    const [loading, setLoading] = useState(false);
    const recordingRef = useRef<MaybeNull<ShortcutTarget>>(null);

    const refresh = useCallback(() => bridge.get().then(setState).catch(noop), [bridge]);

    const update = async (accelerator: MaybeNull<string>) => {
        setLoading(true);
        try {
            const saved = await bridge.set(accelerator);
            if (!saved) createNotification({ type: 'error', text: getShortcutTakenMessage() });
        } catch (error) {
            logger.warn(`[GlobalShortcut] could not set shortcut`, error);
            createNotification({
                type: 'error',
                text:
                    accelerator === null
                        ? c('Error').t`Could not remove the shortcut.`
                        : c('Error').t`Could not save the shortcut.`,
            });
        } finally {
            setLoading(false);
            await refresh();
        }
    };

    const updateCopyShortcut = (field: CopyShortcutField, accelerator: MaybeNull<string>) =>
        dispatch(settingsEditIntent('copy-shortcuts', { copyShortcuts: { [field]: accelerator } }, true));

    const stopRecording = (resume: boolean) => {
        if (!recordingRef.current) return;
        recordingRef.current = null;
        setRecording(null);
        setHint(null);
        if (resume) bridge.setSuspended(false).catch(noop);
    };

    const startRecording = (target: ShortcutTarget) => {
        recordingRef.current = target;
        setRecording(target);
        setHint(null);
        /* Unregister the summon shortcut while recording so
         * pressing it is captured rather than hiding Pass */
        bridge.setSuspended(true).catch(noop);
    };

    /** Shortcuts other than `target`'s, which `target` can't reuse */
    const isInUse = (target: ShortcutTarget, accelerator: string) => {
        if (target !== 'summon' && state?.accelerator === accelerator) return true;
        return COPY_SHORTCUT_FIELDS.some((field) => field !== target && copyShortcuts[field] === accelerator);
    };

    /* No `setSuspended(false)` before `update`: setting the summon
     * shortcut ends the suspension in the main process */
    const save = (target: ShortcutTarget, accelerator: MaybeNull<string>) => {
        if (target === 'summon') {
            stopRecording(false);
            void update(accelerator);
        } else {
            stopRecording(true);
            updateCopyShortcut(target, accelerator);
        }
    };

    useAcceleratorRecorder(recording !== null, {
        onCancel: () => stopRecording(true),
        onInvalid: () => setHint(getModifierHint()),
        onRecord: (accelerator) => {
            const target = recordingRef.current;
            if (!target) return;
            if (isInUse(target, accelerator)) return setHint(getShortcutInUseMessage());
            save(target, accelerator);
        },
    });

    useEffect(() => {
        void refresh();
    }, []);

    /* Never leave the shortcut suspended when leaving the settings */
    useEffect(() => () => stopRecording(true), []);

    if (!state) return null;

    const { accelerator, active } = state;

    const renderRow = (target: ShortcutTarget, value: MaybeNull<string>, description: string) => {
        const isRecording = recording === target;

        return (
            <ShortcutRow
                keys={value ? getAcceleratorKeyLabels(value, platform) : []}
                placeholder={isRecording ? c('Info').t`Press a shortcut…` : undefined}
                description={isRecording ? (hint ?? c('Info').t`Press Esc to cancel.`) : description}
                actions={
                    isRecording ? (
                        <>
                            {value && (
                                <Button onClick={() => save(target, null)} size="small" shape="ghost">
                                    {c('Action').t`Remove`}
                                </Button>
                            )}
                            <Button onClick={() => stopRecording(true)} size="small" shape="outline">
                                {c('Action').t`Cancel`}
                            </Button>
                        </>
                    ) : (
                        <Button
                            onClick={() => startRecording(target)}
                            size="small"
                            shape="outline"
                            disabled={recording !== null}
                            loading={target === 'summon' && loading}
                        >
                            {c('Action').t`Configure`}
                        </Button>
                    )
                }
            >
                {target === 'summon' && !isRecording && accelerator && !active && (
                    <span className="block color-danger text-sm mt-1">{getShortcutTakenMessage()}</span>
                )}
            </ShortcutRow>
        );
    };

    return (
        <SettingsPanel title={c('Label').t`Keyboard shortcuts`}>
            {renderRow('summon', accelerator, c('Info').t`Show or hide ${PASS_APP_NAME} from any application`)}
            {COPY_SHORTCUT_FIELDS.map((field) => (
                <Fragment key={field}>
                    <hr className="m-0 border-weak" />
                    {renderRow(field, copyShortcuts[field], getCopyShortcutDescription(field))}
                </Fragment>
            ))}
        </SettingsPanel>
    );
};

export const GlobalShortcut: FC = () => {
    const bridge = window.ctxBridge?.globalShortcut;
    if (!DESKTOP_BUILD || !bridge) return null;
    return <GlobalShortcutDesktop bridge={bridge} />;
};
