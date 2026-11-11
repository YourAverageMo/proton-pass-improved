/** In-window keyboard shortcuts of the desktop app that copy a field
 * of the selected login item. Shortcuts use the accelerator format
 * of the global summon shortcut (`lib/global-shortcut/accelerator`). */
import type { Item } from '../../types/data/items';
import type { MaybeNull } from '../../types/utils';
import { deobfuscate } from '../../utils/obfuscate/xor';
import type { AcceleratorKeyEvent, AcceleratorPlatform } from '../global-shortcut/accelerator';
import { acceleratorFromKeyEvent, isValidAccelerator } from '../global-shortcut/accelerator';

/** Marks an item-list entry with its item key (`getItemKey`) */
export const ITEM_KEY_ATTR = 'data-item-key';

/** Marks an input where the copy shortcuts still work, unless it has selected text */
export const COPY_SHORTCUT_INPUT_ATTR = 'data-copy-shortcuts';

export type CopyShortcutField = 'email' | 'username' | 'password' | 'totp';

/** In the order shown in the settings */
export const COPY_SHORTCUT_FIELDS: CopyShortcutField[] = ['email', 'username', 'password', 'totp'];

export type CopyShortcuts = Record<CopyShortcutField, MaybeNull<string>>;

/** Stored user choices: a missing key uses the default, `null` removes the shortcut */
export type CopyShortcutsSettings = Partial<Record<CopyShortcutField, MaybeNull<string>>>;

/** Same keys as 1Password on Windows */
export const getDefaultCopyShortcuts = (platform: AcceleratorPlatform): CopyShortcuts => {
    const primary = platform === 'darwin' ? 'Command' : 'Control';
    return {
        email: `${primary}+C`,
        username: null,
        password: `${primary}+Shift+C`,
        totp: `${primary}+Alt+C`,
    };
};

export const resolveCopyShortcuts = (
    settings: CopyShortcutsSettings | undefined,
    platform: AcceleratorPlatform
): CopyShortcuts => {
    const defaults = getDefaultCopyShortcuts(platform);

    return COPY_SHORTCUT_FIELDS.reduce<CopyShortcuts>(
        (shortcuts, field) => {
            const stored = settings?.[field];
            if (stored === null) shortcuts[field] = null;
            else if (isValidAccelerator(stored, platform)) shortcuts[field] = stored;
            return shortcuts;
        },
        { ...defaults }
    );
};

/** The field whose shortcut matches the keydown, if any */
export const getCopyShortcutField = (
    event: AcceleratorKeyEvent,
    shortcuts: CopyShortcuts,
    platform: AcceleratorPlatform
): MaybeNull<CopyShortcutField> => {
    const result = acceleratorFromKeyEvent(event, platform);
    if (result.type !== 'valid') return null;
    return COPY_SHORTCUT_FIELDS.find((field) => shortcuts[field] === result.accelerator) ?? null;
};

export type CopyShortcutPermissions = {
    canRevealSensitiveContent: boolean;
    orgTOTPDisabled: boolean;
    totpAllowed: boolean;
};

export type CopyShortcutValue = { type: 'text'; value: string } | { type: 'totp'; totpUri: string };

/** What a shortcut copies from an item, following what the login
 * view lets the user copy. `null` when there is nothing to copy. */
export const getCopyShortcutValue = (
    item: Item,
    field: CopyShortcutField,
    permissions: CopyShortcutPermissions
): MaybeNull<CopyShortcutValue> => {
    if (item.type !== 'login') return null;
    const { content } = item;

    const text = (value: string): MaybeNull<CopyShortcutValue> => (value ? { type: 'text', value } : null);

    switch (field) {
        case 'email':
            return text(deobfuscate(content.itemEmail));
        case 'username':
            return text(deobfuscate(content.itemUsername));
        case 'password':
            return permissions.canRevealSensitiveContent ? text(deobfuscate(content.password)) : null;
        case 'totp': {
            if (permissions.orgTOTPDisabled || !permissions.totpAllowed) return null;
            const totpUri = deobfuscate(content.totpUri);
            return totpUri ? { type: 'totp', totpUri } : null;
        }
    }
};
