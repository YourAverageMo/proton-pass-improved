import { act, fireEvent, waitFor, within } from '@testing-library/react';

import type { ContextBridgeApi, GlobalShortcutState } from '../../types/desktop';
import { render } from '../../utils/tests/render';
import type { TestStateInit } from '../../utils/tests/state';
import { GlobalShortcut } from './GlobalShortcut';

const mockCreateNotification = jest.fn();

jest.mock('@proton/app-context/useNotifications', () => ({
    useNotifications: () => ({ createNotification: mockCreateNotification }),
}));

const SUMMON = 'Show or hide Proton Pass from any application';
const EMAIL = 'Copy the email of the selected item';
const USERNAME = 'Copy the username of the selected item';
const PASSWORD = 'Copy the password of the selected item';
const TOTP = 'Copy the 2FA code of the selected item';
const IN_USE = 'This shortcut is already in use. Choose a different one.';

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

    /** Queries scoped to the row showing `description`. The row element
     * stays the same while recording replaces its description. */
    const getRow = (result: ReturnType<typeof render>, description: string) =>
        within(result.getByText(description).closest('.flex-1')!.parentElement!);

    const setup = async (
        initial: GlobalShortcutState = { accelerator: null, active: false },
        state?: TestStateInit
    ) => {
        bridge = createBridge(initial);
        /* The theme provider also reads `ctxBridge` when it's defined */
        window.ctxBridge = {
            globalShortcut: bridge,
            getTheme: jest.fn(async () => undefined),
            setTheme: jest.fn(async () => {}),
        } as Partial<ContextBridgeApi> as ContextBridgeApi;
        const result = render(<GlobalShortcut />, { state });
        await waitFor(() => expect(result.getByText('Keyboard shortcuts')).toBeDefined());
        return { ...result, summon: getRow(result, SUMMON), row: (description: string) => getRow(result, description) };
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
        const {
            summon: { getByText },
        } = await setup({ accelerator: 'Control+Shift+P', active: true });
        expect(getByText('Ctrl')).toBeDefined();
        expect(getByText('Shift')).toBeDefined();
        expect(getByText('P')).toBeDefined();
        expect(getByText('Configure')).toBeDefined();
    });

    test('warns when another application holds the shortcut', async () => {
        const {
            summon: { getByText },
        } = await setup({ accelerator: 'Control+Shift+P', active: false });
        expect(getByText('This shortcut is used by another application. Choose a different one.')).toBeDefined();
    });

    test('records a new shortcut', async () => {
        const {
            summon: { getByText, findByText },
        } = await setup();

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
        const {
            summon: { getByText },
        } = await setup({ accelerator: 'Control+Shift+P', active: true });

        fireEvent.click(getByText('Configure'));
        fireEvent.keyDown(window, { code: 'Escape' });

        expect(bridge.setSuspended).toHaveBeenLastCalledWith(false);
        expect(bridge.set).not.toHaveBeenCalled();
        expect(getByText('Configure')).toBeDefined();
    });

    test('leaving the window cancels recording', async () => {
        const {
            summon: { getByText },
        } = await setup();

        fireEvent.click(getByText('Configure'));
        act(() => {
            window.dispatchEvent(new Event('blur'));
        });

        expect(bridge.setSuspended).toHaveBeenLastCalledWith(false);
        expect(getByText('Configure')).toBeDefined();
    });

    test('unmounting while recording restores the shortcut', async () => {
        const {
            summon: { getByText },
            unmount,
        } = await setup();

        fireEvent.click(getByText('Configure'));
        unmount();

        expect(bridge.setSuspended).toHaveBeenLastCalledWith(false);
    });

    test('removes the shortcut', async () => {
        const {
            summon: { getByText, queryByText, findByText },
        } = await setup({ accelerator: 'Control+Shift+P', active: true });

        expect(queryByText('Remove')).toBeNull();
        fireEvent.click(getByText('Configure'));
        fireEvent.click(getByText('Remove'));

        expect(bridge.set).toHaveBeenCalledWith(null);
        expect(await findByText('Not configured')).toBeDefined();
    });

    test('offers no removal when no shortcut is set', async () => {
        const {
            summon: { getByText, queryByText },
        } = await setup();

        fireEvent.click(getByText('Configure'));
        expect(queryByText('Remove')).toBeNull();
        expect(getByText('Cancel')).toBeDefined();
    });

    test('tells the user when another application holds the new shortcut', async () => {
        const {
            summon: { getByText },
        } = await setup();
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
        const {
            summon: { getByText },
        } = await setup();
        bridge.set.mockRejectedValueOnce(new Error('Invalid shortcut'));

        fireEvent.click(getByText('Configure'));
        fireEvent.keyDown(window, { code: 'KeyP', ctrlKey: true, shiftKey: true });

        await waitFor(() =>
            expect(mockCreateNotification).toHaveBeenCalledWith({ type: 'error', text: 'Could not save the shortcut.' })
        );
    });

    describe('copy shortcuts', () => {
        const keys = (row: ReturnType<typeof within>) =>
            row
                .queryAllByText((_: string, el: Element | null) => el?.tagName === 'KBD')
                .map((kbd: HTMLElement) => kbd.textContent);

        test('shows the defaults', async () => {
            const { row } = await setup();
            expect(keys(row(EMAIL))).toEqual(['Ctrl', 'C']);
            expect(row(USERNAME).getByText('Not configured')).toBeDefined();
            expect(keys(row(PASSWORD))).toEqual(['Ctrl', 'Shift', 'C']);
            expect(keys(row(TOTP))).toEqual(['Ctrl', 'Alt', 'C']);
        });

        test('shows custom and removed shortcuts', async () => {
            const { row } = await setup(undefined, {
                settings: { copyShortcuts: { email: null, username: 'Control+Shift+U' } },
            });
            expect(row(EMAIL).getByText('Not configured')).toBeDefined();
            expect(keys(row(USERNAME))).toEqual(['Ctrl', 'Shift', 'U']);
        });

        test('records a shortcut into the settings', async () => {
            const { row, store } = await setup();
            const username = row(USERNAME);

            fireEvent.click(username.getByText('Configure'));
            expect(username.getByText('Press a shortcut…')).toBeDefined();
            fireEvent.keyDown(window, { code: 'KeyU', ctrlKey: true, shiftKey: true });

            await waitFor(() =>
                expect(store.getState().settings.copyShortcuts).toEqual({ username: 'Control+Shift+U' })
            );
            expect(keys(username)).toEqual(['Ctrl', 'Shift', 'U']);
            expect(bridge.set).not.toHaveBeenCalled();
        });

        test('removes a shortcut', async () => {
            const { row, store } = await setup();
            const email = row(EMAIL);

            fireEvent.click(email.getByText('Configure'));
            fireEvent.click(email.getByText('Remove'));

            await waitFor(() => expect(store.getState().settings.copyShortcuts).toEqual({ email: null }));
            expect(email.getByText('Not configured')).toBeDefined();
        });

        test('rejects a shortcut used by another copy shortcut', async () => {
            const { row, store } = await setup();
            const username = row(USERNAME);

            fireEvent.click(username.getByText('Configure'));
            fireEvent.keyDown(window, { code: 'KeyC', ctrlKey: true, shiftKey: true });

            expect(username.getByText(IN_USE)).toBeDefined();
            expect(username.getByText('Press a shortcut…')).toBeDefined();
            expect(store.getState().settings.copyShortcuts).toBeUndefined();
        });

        test('rejects a shortcut used by the summon shortcut', async () => {
            const { row, store } = await setup({ accelerator: 'Control+Shift+P', active: true });
            const email = row(EMAIL);

            fireEvent.click(email.getByText('Configure'));
            fireEvent.keyDown(window, { code: 'KeyP', ctrlKey: true, shiftKey: true });

            expect(email.getByText(IN_USE)).toBeDefined();
            expect(store.getState().settings.copyShortcuts).toBeUndefined();
        });

        test('rejects a summon shortcut used by a copy shortcut', async () => {
            const { summon } = await setup();

            fireEvent.click(summon.getByText('Configure'));
            fireEvent.keyDown(window, { code: 'KeyC', ctrlKey: true, altKey: true });

            expect(summon.getByText(IN_USE)).toBeDefined();
            expect(bridge.set).not.toHaveBeenCalled();
        });

        test('warns when a copy shortcut equals the summon shortcut', async () => {
            const { row } = await setup({ accelerator: 'Control+Shift+C', active: true });
            expect(row(PASSWORD).getByText(IN_USE)).toBeDefined();
            expect(row(EMAIL).queryByText(IN_USE)).toBeNull();
        });

        test('suspends the summon shortcut while recording', async () => {
            const { row } = await setup();
            const password = row(PASSWORD);

            fireEvent.click(password.getByText('Configure'));
            expect(bridge.setSuspended).toHaveBeenLastCalledWith(true);

            fireEvent.keyDown(window, { code: 'KeyP', ctrlKey: true, altKey: true });
            expect(bridge.setSuspended).toHaveBeenLastCalledWith(false);
        });

        test('records one row at a time', async () => {
            const { row, summon } = await setup();

            fireEvent.click(row(EMAIL).getByText('Configure'));
            expect(summon.getByText('Configure').closest('button')!.disabled).toBe(true);
        });
    });
});
