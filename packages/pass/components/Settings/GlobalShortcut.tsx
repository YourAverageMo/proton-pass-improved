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
import { getErrorMessage } from '../../utils/errors/get-error-message';
import { logger } from '../../utils/logger';
import { SettingsPanel } from './SettingsPanel';

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

const ShortcutKeys: FC<{ accelerator: string }> = ({ accelerator }) => (
    <span className="flex items-center gap-1">
        {getAcceleratorKeyLabels(accelerator, platform).map((label, i) => (
            <kbd
                key={i}
                className="inline-flex items-center justify-center h-6 px-2 text-sm border border-weak rounded"
                style={{ fontFamily: 'system-ui, sans-serif', minWidth: '1.5rem' }}
            >
                {label}
            </kbd>
        ))}
    </span>
);

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
            await bridge.set(accelerator);
        } catch (error) {
            logger.warn(`[GlobalShortcut] could not set shortcut`, error);
            const errorMessage = getErrorMessage(error);
            createNotification({
                type: 'error',
                text:
                    accelerator === null
                        ? c('Error').t`Could not remove the shortcut: ${errorMessage}`
                        : c('Error').t`This shortcut is used by another application. Choose a different one.`,
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

            /* `set` re-enables the global shortcut in the main process */
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
        <SettingsPanel title={c('Label').t`Global shortcut`}>
            <div className="flex flex-nowrap items-center justify-between gap-4">
                <div className="flex-1" aria-live="polite">
                    <span className="block mb-1">
                        {(() => {
                            if (recording) return <span className="color-weak">{c('Info').t`Press a shortcut…`}</span>;
                            if (accelerator) return <ShortcutKeys accelerator={accelerator} />;
                            return <span className="color-weak">{c('Info').t`Not configured`}</span>;
                        })()}
                    </span>
                    <span className="block color-weak text-sm">
                        {recording
                            ? (hint ?? c('Info').t`Press Esc to cancel.`)
                            : c('Info').t`Show or hide ${PASS_APP_NAME} from any application.`}
                    </span>
                    {!recording && accelerator && !active && (
                        <span className="block color-danger text-sm mt-1">
                            {c('Warning').t`This shortcut is used by another application. Choose a different one.`}
                        </span>
                    )}
                </div>
                <div className="flex flex-nowrap shrink-0 gap-2">
                    {recording ? (
                        <Button onClick={() => stopRecording(true)} size="small" shape="outline">
                            {c('Action').t`Cancel`}
                        </Button>
                    ) : (
                        <>
                            {accelerator && (
                                <Button onClick={() => update(null)} size="small" shape="ghost" disabled={loading}>
                                    {c('Action').t`Remove`}
                                </Button>
                            )}
                            <Button onClick={startRecording} size="small" shape="outline" loading={loading}>
                                {accelerator ? c('Action').t`Change` : c('Action').t`Set shortcut`}
                            </Button>
                        </>
                    )}
                </div>
            </div>
        </SettingsPanel>
    );
};

export const GlobalShortcut: FC = () => {
    const bridge = window.ctxBridge?.globalShortcut;
    if (!DESKTOP_BUILD || !bridge) return null;
    return <GlobalShortcutDesktop bridge={bridge} />;
};
