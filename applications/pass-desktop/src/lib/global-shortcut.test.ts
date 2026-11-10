import noop from '@proton/utils/noop';

import type * as GlobalShortcut from './global-shortcut';

const mockRegistered = new Map<string, () => void>();
const mockTaken = new Set<string>();
const mockStore = new Map<string, unknown>();
const mockHandlers = new Map<string, (...args: any[]) => any>();

jest.mock('electron', () => ({
    app: { focus: jest.fn(), dock: { hide: jest.fn() } },
    globalShortcut: {
        register: jest.fn((accelerator: string, callback: () => void) => {
            if (mockTaken.has(accelerator)) return false;
            mockRegistered.set(accelerator, callback);
            return true;
        }),
        unregister: jest.fn((accelerator: string) => mockRegistered.delete(accelerator)),
        unregisterAll: jest.fn(() => mockRegistered.clear()),
    },
}));

jest.mock('../store', () => ({
    store: {
        get: (key: string) => mockStore.get(key),
        set: (key: string, value: unknown) => mockStore.set(key, value),
        delete: (key: string) => mockStore.delete(key),
    },
}));

jest.mock('./ipc', () => ({
    setupIpcHandler: (channel: string, handler: (...args: any[]) => any) => mockHandlers.set(channel, handler),
}));

jest.mock('../utils/logger', () => ({ log: noop, debug: noop, info: noop, warn: noop, error: noop }));

const getMockWindow = (state: { visible: boolean; focused: boolean; minimized: boolean }) => ({
    isVisible: jest.fn(() => state.visible),
    isFocused: jest.fn(() => state.focused),
    isMinimized: jest.fn(() => state.minimized),
    isDestroyed: jest.fn(() => false),
    restore: jest.fn(),
    show: jest.fn(),
    focus: jest.fn(),
    hide: jest.fn(),
    webContents: { send: jest.fn() },
});

const ipc = (channel: string, ...args: any[]) => mockHandlers.get(channel)!(...args);

const ACCELERATOR = process.platform === 'darwin' ? 'Command+Shift+P' : 'Control+Shift+P';
const OTHER_ACCELERATOR = process.platform === 'darwin' ? 'Command+Alt+L' : 'Control+Alt+L';

describe('global-shortcut', () => {
    let module: typeof GlobalShortcut;
    let window: ReturnType<typeof getMockWindow>;

    beforeEach(() => {
        jest.resetModules();
        mockRegistered.clear();
        mockTaken.clear();
        mockStore.clear();
        mockHandlers.clear();
        window = getMockWindow({ visible: false, focused: false, minimized: false });
        module = require('./global-shortcut');
        module.setupIpcHandlers(() => window as any);
    });

    describe('toggleWindow', () => {
        test('hides the focused window to the tray', () => {
            const focused = getMockWindow({ visible: true, focused: true, minimized: false });
            module.toggleWindow(focused as any);

            expect(focused.hide).toHaveBeenCalled();
            expect(focused.webContents.send).toHaveBeenCalledWith('window:hide');
            expect(focused.show).not.toHaveBeenCalled();
        });

        test('brings a visible but unfocused window to the front', () => {
            const background = getMockWindow({ visible: true, focused: false, minimized: false });
            module.toggleWindow(background as any);

            expect(background.show).toHaveBeenCalled();
            expect(background.focus).toHaveBeenCalled();
            expect(background.hide).not.toHaveBeenCalled();
        });

        test('restores a minimized window', () => {
            const minimized = getMockWindow({ visible: true, focused: true, minimized: true });
            module.toggleWindow(minimized as any);

            expect(minimized.restore).toHaveBeenCalled();
            expect(minimized.show).toHaveBeenCalled();
            expect(minimized.hide).not.toHaveBeenCalled();
        });
    });

    describe('registration', () => {
        test('registers the stored shortcut once the app is ready', () => {
            mockStore.set('globalShortcut', ACCELERATOR);
            expect(mockRegistered.size).toBe(0);

            module.registerGlobalShortcut();

            expect([...mockRegistered.keys()]).toEqual([ACCELERATOR]);
            expect(ipc('globalShortcut:get')).toEqual({ accelerator: ACCELERATOR, active: true });
        });

        test('ignores an invalid stored shortcut', () => {
            mockStore.set('globalShortcut', 'Shift+P');
            module.registerGlobalShortcut();

            expect(mockRegistered.size).toBe(0);
            expect(ipc('globalShortcut:get')).toEqual({ accelerator: null, active: false });
        });

        test('reports a stored shortcut taken by another application', () => {
            mockStore.set('globalShortcut', ACCELERATOR);
            mockTaken.add(ACCELERATOR);
            module.registerGlobalShortcut();

            expect(ipc('globalShortcut:get')).toEqual({ accelerator: ACCELERATOR, active: false });
        });

        test('the registered shortcut toggles the window', () => {
            mockStore.set('globalShortcut', ACCELERATOR);
            module.registerGlobalShortcut();

            mockRegistered.get(ACCELERATOR)!();
            expect(window.show).toHaveBeenCalled();
        });

        test('unregisters everything on quit', () => {
            mockStore.set('globalShortcut', ACCELERATOR);
            module.registerGlobalShortcut();
            module.unregisterGlobalShortcut();

            expect(mockRegistered.size).toBe(0);
        });
    });

    describe('globalShortcut:set', () => {
        beforeEach(() => module.registerGlobalShortcut());

        test('replaces the registered shortcut and persists it', () => {
            ipc('globalShortcut:set', ACCELERATOR);
            ipc('globalShortcut:set', OTHER_ACCELERATOR);

            expect([...mockRegistered.keys()]).toEqual([OTHER_ACCELERATOR]);
            expect(mockStore.get('globalShortcut')).toBe(OTHER_ACCELERATOR);
        });

        test('removes the shortcut', () => {
            ipc('globalShortcut:set', ACCELERATOR);
            ipc('globalShortcut:set', null);

            expect(mockRegistered.size).toBe(0);
            expect(mockStore.has('globalShortcut')).toBe(false);
        });

        test('rejects invalid shortcuts', () => {
            expect(() => ipc('globalShortcut:set', 'Shift+P')).toThrow('Invalid shortcut');
            expect(() => ipc('globalShortcut:set', 42)).toThrow('Invalid shortcut');
            expect(mockStore.has('globalShortcut')).toBe(false);
        });

        test('keeps the previous shortcut when the new one is taken', () => {
            ipc('globalShortcut:set', ACCELERATOR);
            mockTaken.add(OTHER_ACCELERATOR);

            expect(() => ipc('globalShortcut:set', OTHER_ACCELERATOR)).toThrow('used by another application');
            expect([...mockRegistered.keys()]).toEqual([ACCELERATOR]);
            expect(mockStore.get('globalShortcut')).toBe(ACCELERATOR);
        });
    });

    describe('globalShortcut:setSuspended', () => {
        beforeEach(() => {
            mockStore.set('globalShortcut', ACCELERATOR);
            module.registerGlobalShortcut();
        });

        test('unregisters while recording and restores afterwards', () => {
            ipc('globalShortcut:setSuspended', true);
            expect(mockRegistered.size).toBe(0);

            ipc('globalShortcut:setSuspended', false);
            expect([...mockRegistered.keys()]).toEqual([ACCELERATOR]);
        });

        test('setting a shortcut ends the suspension', () => {
            ipc('globalShortcut:setSuspended', true);
            ipc('globalShortcut:set', OTHER_ACCELERATOR);

            expect([...mockRegistered.keys()]).toEqual([OTHER_ACCELERATOR]);
        });
    });
});
