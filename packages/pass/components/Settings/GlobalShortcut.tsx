import { type FC, useCallback, useEffect, useRef, useState } from 'react';

import { c } from 'ttag';

import { useNotifications } from '@proton/app-context/useNotifications';
import { Button } from '@proton/atoms/Button/Button';
import { PASS_APP_NAME } from '@proton/shared/lib/constants';
import noop from '@proton/utils/noop';

import {
    acceleratorFromKeyEvent,
    getAcceleratorKeyLabels,
    getAcceleratorPlatform,
} from '../../lib/global-shortcut/accelerator';
import type { GlobalShortcutState } from '../../types/desktop';
import type { MaybeNull } from '../../types/utils';
import { logger } from '../../utils/logger';
import { SettingsPanel } from './SettingsPanel';
import { ShortcutRow } from './ShortcutRow';

const platform = getAcceleratorPlatform(BUILD_TARGET);

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

const GlobalShortcutDesktop: FC<{ bridge: NonNullable<Window['ctxBridge']>['globalShortcut'] }> = ({ bridge }) => {
    const { createNotification } = useNotifications();

    const [state, setState] = useState<MaybeNull<GlobalShortcutState>>(null);
    const [recording, setRecording] = useState(false);
    const [hint, setHint] = useState<MaybeNull<string>>(null);
    const [loading, setLoading] = useState(false);
    const recordingRef = useRef(false);

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

    const stopRecording = (resume: boolean) => {
        if (!recordingRef.current) return;
        recordingRef.current = false;
        setRecording(false);
        setHint(null);
        if (resume) bridge.setSuspended(false).catch(noop);
    };

    const startRecording = () => {
        recordingRef.current = true;
        setRecording(true);
        setHint(null);
        /* Unregister the current shortcut while recording so
         * pressing it again is captured rather than hiding Pass */
        bridge.setSuspended(true).catch(noop);
    };

    /* No `setSuspended(false)` before `update`: setting a
     * shortcut ends the suspension in the main process */
    const handleRemove = () => {
        stopRecording(false);
        void update(null);
    };

    useEffect(() => {
        void refresh();
    }, []);

    useEffect(() => {
        if (!recording) return;

        const onKeyDown = (event: KeyboardEvent) => {
            event.preventDefault();
            event.stopImmediatePropagation();
            if (event.repeat) return;

            if (event.code === 'Escape' && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey) {
                return stopRecording(true);
            }

            const result = acceleratorFromKeyEvent(event, platform);
            if (result.type === 'pending') return;
            if (result.type === 'invalid') return setHint(getModifierHint());

            stopRecording(false);
            void update(result.accelerator);
        };

        const onBlur = () => stopRecording(true);

        window.addEventListener('keydown', onKeyDown, { capture: true });
        window.addEventListener('blur', onBlur);

        return () => {
            window.removeEventListener('keydown', onKeyDown, { capture: true });
            window.removeEventListener('blur', onBlur);
        };
    }, [recording]);

    /* Never leave the shortcut suspended when leaving the settings */
    useEffect(() => () => stopRecording(true), []);

    if (!state) return null;

    const { accelerator, active } = state;

    return (
        <SettingsPanel title={c('Label').t`Keyboard shortcuts`}>
            <ShortcutRow
                keys={accelerator ? getAcceleratorKeyLabels(accelerator, platform) : []}
                placeholder={recording ? c('Info').t`Press a shortcut…` : undefined}
                description={
                    recording
                        ? (hint ?? c('Info').t`Press Esc to cancel.`)
                        : c('Info').t`Show or hide ${PASS_APP_NAME} from any application`
                }
                actions={
                    recording ? (
                        <>
                            {accelerator && (
                                <Button onClick={handleRemove} size="small" shape="ghost">
                                    {c('Action').t`Remove`}
                                </Button>
                            )}
                            <Button onClick={() => stopRecording(true)} size="small" shape="outline">
                                {c('Action').t`Cancel`}
                            </Button>
                        </>
                    ) : (
                        <Button onClick={startRecording} size="small" shape="outline" loading={loading}>
                            {c('Action').t`Configure`}
                        </Button>
                    )
                }
            >
                {!recording && accelerator && !active && (
                    <span className="block color-danger text-sm mt-1">{getShortcutTakenMessage()}</span>
                )}
            </ShortcutRow>
        </SettingsPanel>
    );
};

export const GlobalShortcut: FC = () => {
    const bridge = window.ctxBridge?.globalShortcut;
    if (!DESKTOP_BUILD || !bridge) return null;
    return <GlobalShortcutDesktop bridge={bridge} />;
};
