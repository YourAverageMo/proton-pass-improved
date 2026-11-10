import { type BrowserWindow, type WebContents, app, globalShortcut } from 'electron';

import { getAcceleratorPlatform, isValidAccelerator } from '@proton/pass/lib/global-shortcut/accelerator';
import type { GlobalShortcutState } from '@proton/pass/types/desktop';
import type { MaybeNull } from '@proton/pass/types/utils';
import { getErrorMessage } from '@proton/pass/utils/errors/get-error-message';

import { store } from '../store';
import logger from '../utils/logger';
import { isMac } from '../utils/platform';
import { setupIpcHandler } from './ipc';
import { hideWindowToTray } from './window';

declare module './ipc' {
    interface IPCChannels {
        'globalShortcut:get': IPCChannel<[], GlobalShortcutState>;
        /** Resolves to `false` when another application already registered the shortcut */
        'globalShortcut:set': IPCChannel<[accelerator: MaybeNull<string>], boolean>;
        'globalShortcut:setSuspended': IPCChannel<[suspended: boolean], void>;
    }
}

const platform = getAcceleratorPlatform(process.platform);

/** Accelerator currently registered with the OS */
let registered: MaybeNull<string> = null;
/** `globalShortcut` is only usable once the app is ready */
let ready = false;
/** Set while the settings UI records a new shortcut, so pressing
 * the current one is captured instead of toggling the window */
let suspended = false;
/** Removes the renderer listeners that end a suspension */
let detachSuspensionListeners: MaybeNull<() => void> = null;
let getWindow: () => MaybeNull<BrowserWindow> = () => null;

export const getStoredShortcut = (): MaybeNull<string> => {
    const accelerator = store.get('globalShortcut');
    return isValidAccelerator(accelerator, platform) ? accelerator : null;
};

/** Brings the window to the front, or hides it to the
 * tray when it's already the focused window. */
export const toggleWindow = (window: BrowserWindow) => {
    if (window.isVisible() && window.isFocused() && !window.isMinimized()) {
        logger.debug('[global-shortcut] hiding window to tray');
        return hideWindowToTray(window);
    }

    if (window.isMinimized()) {
        logger.debug('[global-shortcut] showing window (restored from minimized)');
        window.restore();
    } else logger.debug('[global-shortcut] showing window');

    window.show();
    window.focus();

    /* The shortcut fires while another app is active:
     * activate Pass so the window takes keyboard focus */
    if (isMac()) app.focus({ steal: true });
};

const onTrigger = () => {
    logger.debug('[global-shortcut] triggered');
    const window = getWindow();
    if (window && !window.isDestroyed()) toggleWindow(window);
};

/** Registers `accelerator` with the OS in place of the current shortcut.
 * Returns `false` when the OS refuses it, usually because another
 * application already registered it. */
const registerAccelerator = (accelerator: MaybeNull<string>): boolean => {
    if (registered === accelerator) return true;

    if (registered) globalShortcut.unregister(registered);
    registered = null;

    if (!accelerator) return true;

    try {
        if (!globalShortcut.register(accelerator, onTrigger)) return false;
        registered = accelerator;
        logger.info(`[global-shortcut] registered "${accelerator}"`);
        return true;
    } catch (err) {
        logger.warn(`[global-shortcut] could not register "${accelerator}": ${getErrorMessage(err)}`);
        return false;
    }
};

/** Registers the stored shortcut, or nothing while suspended */
const registerStoredShortcut = () => {
    if (!ready) return;
    const accelerator = suspended ? null : getStoredShortcut();
    if (!registerAccelerator(accelerator)) {
        logger.warn(`[global-shortcut] "${accelerator}" is used by another application`);
    }
};

/** The settings UI ends a suspension when recording stops. If the renderer
 * reloads, crashes or closes first, that never happens, so end it here. */
const attachSuspensionListeners = (webContents: WebContents, resume: () => void) => {
    const onNavigation = ({ isMainFrame, isSameDocument }: { isMainFrame: boolean; isSameDocument: boolean }) => {
        if (isMainFrame && !isSameDocument) resume();
    };

    webContents.on('did-start-navigation', onNavigation);
    webContents.on('render-process-gone', resume);
    webContents.on('destroyed', resume);

    return () => {
        if (webContents.isDestroyed()) return;
        webContents.off('did-start-navigation', onNavigation);
        webContents.off('render-process-gone', resume);
        webContents.off('destroyed', resume);
    };
};

const setSuspended = (value: boolean) => {
    detachSuspensionListeners?.();
    detachSuspensionListeners = null;
    suspended = value;

    const webContents = getWindow()?.webContents;
    if (suspended && webContents)
        detachSuspensionListeners = attachSuspensionListeners(webContents, () => setSuspended(false));

    registerStoredShortcut();
};

const setShortcut = (accelerator: MaybeNull<string>): boolean => {
    if (accelerator !== null && !isValidAccelerator(accelerator, platform)) throw new Error('Invalid shortcut');

    if (ready && !registerAccelerator(accelerator)) {
        setSuspended(false);
        return false;
    }

    if (accelerator) store.set('globalShortcut', accelerator);
    else store.delete('globalShortcut');

    setSuspended(false);
    logger.info(`[global-shortcut] set to ${accelerator ?? 'none'}`);
    return true;
};

const getState = (): GlobalShortcutState => {
    const accelerator = getStoredShortcut();
    return { accelerator, active: accelerator !== null && registered === accelerator };
};

export const setupIpcHandlers = (windowGetter: () => MaybeNull<BrowserWindow>) => {
    getWindow = windowGetter;

    setupIpcHandler('globalShortcut:get', getState);
    setupIpcHandler('globalShortcut:set', setShortcut);
    setupIpcHandler('globalShortcut:setSuspended', (value) => setSuspended(value === true));
};

/** Call once the app is ready */
export const registerGlobalShortcut = () => {
    ready = true;
    registerStoredShortcut();
};

export const unregisterGlobalShortcut = () => {
    if (!ready || !registered) return;
    globalShortcut.unregister(registered);
    registered = null;
};
