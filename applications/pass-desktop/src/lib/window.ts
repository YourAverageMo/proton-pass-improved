import { type BrowserWindow, app } from 'electron';

import type { MaybeNull } from '@proton/pass/types/utils';

import { isMac } from '../utils/platform';
import { setupIpcHandler } from './ipc';

declare module './ipc' {
    interface IPCChannels {
        'window:show': IPCChannel<[void], void>;
        'window:hide': IPCChannel<[void], void>;
    }
}

export const setupIpcHandlers = (getWindow: () => MaybeNull<BrowserWindow>) => {
    setupIpcHandler('window:show', () => getWindow()?.show());
};

export const onHideWindow = (getWindow: () => MaybeNull<BrowserWindow>) => {
    getWindow()?.webContents.send('window:hide');
};

/** Hides the window to the tray, as closing it does. The renderer
 * is notified through `window:hide` so it can lock the session. */
export const hideWindowToTray = (window: BrowserWindow) => {
    window.hide();
    onHideWindow(() => window);
    if (isMac()) app.dock?.hide();
};
