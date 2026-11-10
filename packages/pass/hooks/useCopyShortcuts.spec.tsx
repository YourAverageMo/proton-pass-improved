import type { FC, PropsWithChildren } from 'react';
import { Provider } from 'react-redux';

import { act, renderHook } from '@testing-library/react-hooks';
import { createStore } from 'redux';

import { ITEM_KEY_ATTR } from '../lib/copy-shortcuts/copy-shortcuts';
import { getItemKey } from '../lib/items/item.utils';
import type { SelectedItem } from '../types/data/items';
import type { ContextBridgeApi } from '../types/desktop';
import { createTestLogin } from '../utils/tests/fixtures/items';
import { createTestState } from '../utils/tests/state';

const mockCopyToClipboard = jest.fn<Promise<boolean>, [string]>();
const mockGenerateOTP = jest.fn();
const mockCreateNotification = jest.fn();
let mockSelectedItem: SelectedItem | undefined;

jest.mock('../components/Settings/Clipboard/ClipboardProvider', () => ({
    useCopyToClipboard: () => mockCopyToClipboard,
}));

jest.mock('../components/Navigation/NavigationItem', () => ({
    useSelectedItem: () => mockSelectedItem,
}));

jest.mock('../components/Core/PassCoreProvider', () => ({
    usePassCore: () => ({ generateOTP: mockGenerateOTP }),
}));

jest.mock('@proton/app-context/useNotifications', () => ({
    useNotifications: () => ({ createNotification: mockCreateNotification }),
}));

(globalThis as any).DESKTOP_BUILD = true;
const { useCopyShortcuts, COPY_SHORTCUT_HIDE_DELAY_MS } = require('./useCopyShortcuts');
(globalThis as any).DESKTOP_BUILD = false;

const SHARE_ID = 'share-1';
const open = createTestLogin({ shareId: SHARE_ID, itemId: 'open', name: 'Open', email: 'open@proton.me' });
const listed = createTestLogin({ shareId: SHARE_ID, itemId: 'listed', name: 'Listed', email: 'listed@proton.me' });
const noEmail = createTestLogin({ shareId: SHARE_ID, itemId: 'no-email', name: 'No email', username: 'john' });

const store = createStore(() => createTestState({ items: [open, listed, noEmail] }));
const wrapper: FC<PropsWithChildren> = ({ children }) => <Provider store={store}>{children}</Provider>;

const press = (init: KeyboardEventInit = { code: 'KeyC', ctrlKey: true }) => {
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
    (document.activeElement ?? document.body).dispatchEvent(event);
    return event;
};

/** Lets the async keydown handler finish */
const flush = () => act(async () => {});

describe('useCopyShortcuts', () => {
    const windowHide = jest.fn(async () => {});

    beforeEach(() => {
        jest.useFakeTimers();
        document.body.innerHTML = '';
        window.getSelection()?.removeAllRanges();
        mockSelectedItem = { shareId: SHARE_ID, itemId: open.itemId };
        mockCopyToClipboard.mockReset().mockResolvedValue(true);
        mockCreateNotification.mockReset();
        windowHide.mockClear();
        window.ctxBridge = { windowHide } as Partial<ContextBridgeApi> as ContextBridgeApi;
    });

    afterEach(() => {
        jest.useRealTimers();
        delete window.ctxBridge;
    });

    test("copies the open item's email on Ctrl+C", async () => {
        renderHook(() => useCopyShortcuts(), { wrapper });

        const event = press();
        await flush();

        expect(event.defaultPrevented).toBe(true);
        expect(mockCopyToClipboard).toHaveBeenCalledWith('open@proton.me');
    });

    test('prefers the focused list entry', async () => {
        document.body.innerHTML = `<a href="#" id="entry" ${ITEM_KEY_ATTR}="${getItemKey(listed)}"><span>Listed</span></a>`;
        document.getElementById('entry')!.focus();
        renderHook(() => useCopyShortcuts(), { wrapper });

        press();
        await flush();

        expect(mockCopyToClipboard).toHaveBeenCalledWith('listed@proton.me');
    });

    test('ignores keydowns from an input', async () => {
        document.body.innerHTML = '<input id="input" />';
        document.getElementById('input')!.focus();
        renderHook(() => useCopyShortcuts(), { wrapper });

        const event = press();
        await flush();

        expect(event.defaultPrevented).toBe(false);
        expect(mockCopyToClipboard).not.toHaveBeenCalled();
    });

    test('ignores keydowns while text is selected', async () => {
        document.body.innerHTML = '<p id="text">Some text</p>';
        window.getSelection()!.selectAllChildren(document.getElementById('text')!);
        renderHook(() => useCopyShortcuts(), { wrapper });

        const event = press();
        await flush();

        expect(event.defaultPrevented).toBe(false);
        expect(mockCopyToClipboard).not.toHaveBeenCalled();
    });

    test('does nothing when the item has no such field', async () => {
        mockSelectedItem = { shareId: SHARE_ID, itemId: noEmail.itemId };
        renderHook(() => useCopyShortcuts(), { wrapper });

        const event = press();
        await flush();

        expect(event.defaultPrevented).toBe(false);
        expect(mockCopyToClipboard).not.toHaveBeenCalled();
    });

    test('hides the window after the delay once copied', async () => {
        renderHook(() => useCopyShortcuts(), { wrapper });

        press();
        await flush();

        act(() => jest.advanceTimersByTime(COPY_SHORTCUT_HIDE_DELAY_MS - 1));
        expect(windowHide).not.toHaveBeenCalled();
        act(() => jest.advanceTimersByTime(1));
        expect(windowHide).toHaveBeenCalledTimes(1);
    });

    test('does not hide when the copy did not happen', async () => {
        mockCopyToClipboard.mockResolvedValue(false);
        renderHook(() => useCopyShortcuts(), { wrapper });

        press();
        await flush();

        act(() => jest.advanceTimersByTime(COPY_SHORTCUT_HIDE_DELAY_MS * 2));
        expect(mockCopyToClipboard).toHaveBeenCalled();
        expect(windowHide).not.toHaveBeenCalled();
    });
});
