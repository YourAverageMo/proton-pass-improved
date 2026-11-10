import { itemBuilder } from '../items/item.builder';
import type { CopyShortcutPermissions } from './copy-shortcuts';
import {
    getCopyShortcutField,
    getCopyShortcutValue,
    getDefaultCopyShortcuts,
    resolveCopyShortcuts,
} from './copy-shortcuts';

const key = (
    code: string,
    modifiers: Partial<Record<'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey', boolean>> = {}
) => ({
    code,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    ...modifiers,
});

const ALLOWED: CopyShortcutPermissions = {
    canRevealSensitiveContent: true,
    orgTOTPDisabled: false,
    totpAllowed: true,
};

const createLogin = (fields: { email?: string; username?: string; password?: string; totpUri?: string } = {}) =>
    itemBuilder('login').set('content', (content) =>
        content
            .set('itemEmail', fields.email ?? '')
            .set('itemUsername', fields.username ?? '')
            .set('password', fields.password ?? '')
            .set('totpUri', fields.totpUri ?? '')
    ).data;

describe('copy shortcuts', () => {
    describe('getDefaultCopyShortcuts', () => {
        test.each(['win32', 'linux'] as const)('uses Control on %s', (platform) => {
            expect(getDefaultCopyShortcuts(platform)).toEqual({
                email: 'Control+C',
                username: null,
                password: 'Control+Shift+C',
                totp: 'Control+Alt+C',
            });
        });

        test('uses Command on darwin', () => {
            expect(getDefaultCopyShortcuts('darwin')).toEqual({
                email: 'Command+C',
                username: null,
                password: 'Command+Shift+C',
                totp: 'Command+Alt+C',
            });
        });
    });

    describe('resolveCopyShortcuts', () => {
        test('uses the defaults without settings', () => {
            expect(resolveCopyShortcuts(undefined, 'win32')).toEqual(getDefaultCopyShortcuts('win32'));
            expect(resolveCopyShortcuts({}, 'win32')).toEqual(getDefaultCopyShortcuts('win32'));
        });

        test('keeps `null` as removed', () => {
            expect(resolveCopyShortcuts({ email: null }, 'win32').email).toBeNull();
        });

        test('uses valid stored values', () => {
            const shortcuts = resolveCopyShortcuts({ username: 'Control+Shift+U', password: 'Alt+P' }, 'win32');
            expect(shortcuts.username).toBe('Control+Shift+U');
            expect(shortcuts.password).toBe('Alt+P');
            expect(shortcuts.email).toBe('Control+C');
        });

        test('falls back to the default for invalid stored values', () => {
            const shortcuts = resolveCopyShortcuts(
                { email: 'Shift+C', password: 'Command+P', totp: 42 as any, username: 'nonsense' },
                'win32'
            );
            expect(shortcuts).toEqual(getDefaultCopyShortcuts('win32'));
        });
    });

    describe('getCopyShortcutField', () => {
        const shortcuts = getDefaultCopyShortcuts('win32');

        test('matches each default', () => {
            expect(getCopyShortcutField(key('KeyC', { ctrlKey: true }), shortcuts, 'win32')).toBe('email');
            expect(getCopyShortcutField(key('KeyC', { ctrlKey: true, shiftKey: true }), shortcuts, 'win32')).toBe(
                'password'
            );
            expect(getCopyShortcutField(key('KeyC', { ctrlKey: true, altKey: true }), shortcuts, 'win32')).toBe('totp');
        });

        test('requires the exact modifiers', () => {
            expect(
                getCopyShortcutField(
                    key('KeyC', { ctrlKey: true, shiftKey: true }),
                    { ...shortcuts, password: null },
                    'win32'
                )
            ).toBeNull();
            expect(
                getCopyShortcutField(key('KeyC', { ctrlKey: true, altKey: true, shiftKey: true }), shortcuts, 'win32')
            ).toBeNull();
        });

        test('ignores keys without a shortcut or primary modifier', () => {
            expect(getCopyShortcutField(key('KeyC'), shortcuts, 'win32')).toBeNull();
            expect(getCopyShortcutField(key('KeyC', { shiftKey: true }), shortcuts, 'win32')).toBeNull();
            expect(getCopyShortcutField(key('ControlLeft', { ctrlKey: true }), shortcuts, 'win32')).toBeNull();
            expect(getCopyShortcutField(key('KeyV', { ctrlKey: true }), shortcuts, 'win32')).toBeNull();
        });

        test('uses Command on darwin', () => {
            const mac = getDefaultCopyShortcuts('darwin');
            expect(getCopyShortcutField(key('KeyC', { metaKey: true }), mac, 'darwin')).toBe('email');
            expect(getCopyShortcutField(key('KeyC', { ctrlKey: true }), mac, 'darwin')).toBeNull();
        });
    });

    describe('getCopyShortcutValue', () => {
        const item = createLogin({
            email: 'john@proton.me',
            username: 'john',
            password: 'secret',
            totpUri: 'otpauth://totp/x?secret=ABC',
        });

        test('returns each login field', () => {
            expect(getCopyShortcutValue(item, 'email', ALLOWED)).toEqual({
                type: 'text',
                value: 'john@proton.me',
            });
            expect(getCopyShortcutValue(item, 'username', ALLOWED)).toEqual({
                type: 'text',
                value: 'john',
            });
            expect(getCopyShortcutValue(item, 'password', ALLOWED)).toEqual({
                type: 'text',
                value: 'secret',
            });
            expect(getCopyShortcutValue(item, 'totp', ALLOWED)).toEqual({
                type: 'totp',
                totpUri: 'otpauth://totp/x?secret=ABC',
            });
        });

        test.each(['email', 'username', 'password', 'totp'] as const)('returns `null` for an empty %s', (field) => {
            expect(getCopyShortcutValue(createLogin(), field, ALLOWED)).toBeNull();
        });

        test('needs permission to reveal the password', () => {
            expect(
                getCopyShortcutValue(item, 'password', {
                    ...ALLOWED,
                    canRevealSensitiveContent: false,
                })
            ).toBeNull();
        });

        test('respects the organization TOTP policy', () => {
            expect(getCopyShortcutValue(item, 'totp', { ...ALLOWED, orgTOTPDisabled: true })).toBeNull();
        });

        test('respects the plan TOTP limit', () => {
            expect(getCopyShortcutValue(item, 'totp', { ...ALLOWED, totpAllowed: false })).toBeNull();
        });

        test.each(['note', 'alias', 'creditCard', 'identity'] as const)('returns `null` for %s items', (type) => {
            const other = itemBuilder(type).data;
            for (const field of ['email', 'username', 'password', 'totp'] as const) {
                expect(getCopyShortcutValue(other, field, ALLOWED)).toBeNull();
            }
        });
    });
});
