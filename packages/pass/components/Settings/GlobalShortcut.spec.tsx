import { act, fireEvent, waitFor } from '@testing-library/react';

import type { ContextBridgeApi, GlobalShortcutState } from '../../types/desktop';
import { render } from '../../utils/tests/render';
import { GlobalShortcut } from './GlobalShortcut';

const mockCreateNotification = jest.fn();

jest.mock('@proton/app-context/useNotifications', () => ({
    useNotifications: () => ({ createNotification: mockCreateNotification }),
}));

const createBridge = (initial: GlobalShortcutState) => {
    let state = initial;
    return {
        get: jest.fn(async () => state),
        set: jest.fn(async (accelerator: string | null): Promise<boolean> => {
            state = { accelerator, active: accelerator !== null };
            return true;
        }),
        setSuspended: jest.fn(async () => {}),
    } satisfies ContextBridgeApi['globalShortcut'];
};

describe('GlobalShortcut', () => {
    let bridge: ReturnType<typeof createBridge>;

    const setup = async (initial: GlobalShortcutState = { accelerator: null, active: false }) => {
        bridge = createBridge(initial);
        /* The theme provider also reads `ctxBridge` when it's defined */
        window.ctxBridge = {
            globalShortcut: bridge,
            getTheme: jest.fn(async () => undefined),
            setTheme: jest.fn(async () => {}),
        } as Partial<ContextBridgeApi> as ContextBridgeApi;
        const result = render(<GlobalShortcut />);
        await waitFor(() => expect(result.getByText('Keyboard shortcuts')).toBeDefined());
        return result;
    };

    beforeEach(() => {
        (globalThis as any).DESKTOP_BUILD = true;
        mockCreateNotification.mockClear();
    });

    afterEach(() => {
        (globalThis as any).DESKTOP_BUILD = false;
        delete window.ctxBridge;
    });

    test('renders nothing outside the desktop app', () => {
        (globalThis as any).DESKTOP_BUILD = false;
        window.ctxBridge = {
            globalShortcut: createBridge({ accelerator: null, active: false }),
        } as Partial<ContextBridgeApi> as ContextBridgeApi;
        const { queryByText } = render(<GlobalShortcut />);
        expect(queryByText('Keyboard shortcuts')).toBeNull();
    });

    test('shows the configured shortcut', async () => {
        const { getByText } = await setup({ accelerator: 'Control+Shift+P', active: true });
        expect(getByText('Ctrl')).toBeDefined();
        expect(getByText('Shift')).toBeDefined();
        expect(getByText('P')).toBeDefined();
        expect(getByText('Configure')).toBeDefined();
    });

    test('warns when another application holds the shortcut', async () => {
        const { getByText } = await setup({ accelerator: 'Control+Shift+P', active: false });
        expect(getByText('This shortcut is used by another application. Choose a different one.')).toBeDefined();
    });

    test('records a new shortcut', async () => {
        const { getByText, findByText } = await setup();

        fireEvent.click(getByText('Configure'));
        expect(bridge.setSuspended).toHaveBeenCalledWith(true);
        expect(getByText('Press a shortcut…')).toBeDefined();

        /* Modifiers alone and keys without a primary modifier are not accepted */
        fireEvent.keyDown(window, { code: 'ControlLeft', ctrlKey: true });
        fireEvent.keyDown(window, { code: 'KeyP', shiftKey: true });
        expect(bridge.set).not.toHaveBeenCalled();
        expect(getByText('Include Ctrl, Alt or Super in the shortcut.')).toBeDefined();

        fireEvent.keyDown(window, { code: 'KeyP', ctrlKey: true, shiftKey: true });
        expect(bridge.set).toHaveBeenCalledWith('Control+Shift+P');
        expect(await findByText('Configure')).toBeDefined();
        expect(getByText('Ctrl')).toBeDefined();
    });

    test('Escape cancels recording and restores the shortcut', async () => {
        const { getByText } = await setup({ accelerator: 'Control+Shift+P', active: true });

        fireEvent.click(getByText('Configure'));
        fireEvent.keyDown(window, { code: 'Escape' });

        expect(bridge.setSuspended).toHaveBeenLastCalledWith(false);
        expect(bridge.set).not.toHaveBeenCalled();
        expect(getByText('Configure')).toBeDefined();
    });

    test('leaving the window cancels recording', async () => {
        const { getByText } = await setup();

        fireEvent.click(getByText('Configure'));
        act(() => {
            window.dispatchEvent(new Event('blur'));
        });

        expect(bridge.setSuspended).toHaveBeenLastCalledWith(false);
        expect(getByText('Configure')).toBeDefined();
    });

    test('unmounting while recording restores the shortcut', async () => {
        const { getByText, unmount } = await setup();

        fireEvent.click(getByText('Configure'));
        unmount();

        expect(bridge.setSuspended).toHaveBeenLastCalledWith(false);
    });

    test('removes the shortcut', async () => {
        const { getByText, queryByText, findByText } = await setup({ accelerator: 'Control+Shift+P', active: true });

        expect(queryByText('Remove')).toBeNull();
        fireEvent.click(getByText('Configure'));
        fireEvent.click(getByText('Remove'));

        expect(bridge.set).toHaveBeenCalledWith(null);
        expect(await findByText('Not configured')).toBeDefined();
    });

    test('offers no removal when no shortcut is set', async () => {
        const { getByText, queryByText } = await setup();

        fireEvent.click(getByText('Configure'));
        expect(queryByText('Remove')).toBeNull();
        expect(getByText('Cancel')).toBeDefined();
    });

    test('tells the user when another application holds the new shortcut', async () => {
        const { getByText } = await setup();
        bridge.set.mockResolvedValueOnce(false);

        fireEvent.click(getByText('Configure'));
        fireEvent.keyDown(window, { code: 'KeyP', ctrlKey: true, shiftKey: true });

        await waitFor(() =>
            expect(mockCreateNotification).toHaveBeenCalledWith({
                type: 'error',
                text: 'This shortcut is used by another application. Choose a different one.',
            })
        );
    });

    test('reports other failures without blaming another application', async () => {
        const { getByText } = await setup();
        bridge.set.mockRejectedValueOnce(new Error('Invalid shortcut'));

        fireEvent.click(getByText('Configure'));
        fireEvent.keyDown(window, { code: 'KeyP', ctrlKey: true, shiftKey: true });

        await waitFor(() =>
            expect(mockCreateNotification).toHaveBeenCalledWith({ type: 'error', text: 'Could not save the shortcut.' })
        );
    });
});
