/** Helpers to build, validate and display Electron accelerators
 * (https://www.electronjs.org/docs/latest/api/accelerator) for the
 * desktop app's global summon shortcut. Shared by the main process,
 * which validates what the renderer sends, and the settings UI,
 * which records a shortcut from a `KeyboardEvent`. */

export type AcceleratorPlatform = 'darwin' | 'win32' | 'linux';

export type AcceleratorKeyEvent = Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>;

export type AcceleratorRecordResult =
    /** Only modifiers are held so far */
    | { type: 'pending' }
    /** A key without Ctrl, Alt or Cmd/Super: would steal normal typing */
    | { type: 'invalid' }
    | { type: 'valid'; accelerator: string };

/** `KeyboardEvent.code` values that are modifiers on their own */
const MODIFIER_CODES = new Set([
    'ControlLeft',
    'ControlRight',
    'ShiftLeft',
    'ShiftRight',
    'AltLeft',
    'AltRight',
    'MetaLeft',
    'MetaRight',
    'OSLeft',
    'OSRight',
    'CapsLock',
    'Fn',
    'FnLock',
]);

/** Non-alphanumeric `KeyboardEvent.code` values mapped to their accelerator key */
const CODE_TO_KEY: Record<string, string> = {
    Space: 'Space',
    Enter: 'Enter',
    Tab: 'Tab',
    Backspace: 'Backspace',
    Delete: 'Delete',
    Insert: 'Insert',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Minus: '-',
    Equal: '=',
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
    Backquote: '`',
    NumpadAdd: 'numadd',
    NumpadSubtract: 'numsub',
    NumpadMultiply: 'nummult',
    NumpadDivide: 'numdiv',
    NumpadDecimal: 'numdec',
};

const NON_ALPHANUMERIC_KEYS = new Set(Object.values(CODE_TO_KEY));

/** Modifiers that make a shortcut safe to register globally. Shift alone
 * is not enough: `Shift+A` would capture every capital A typed anywhere. */
const PRIMARY_MODIFIERS = new Set(['Command', 'Control', 'Alt', 'Super']);
const MODIFIERS = new Set([...PRIMARY_MODIFIERS, 'Shift']);

/** Electron accepts F1 to F24 */
const isFunctionKey = (key: string) => {
    const match = key.match(/^F([0-9]{1,2})$/);
    return match !== null && Number(match[1]) >= 1 && Number(match[1]) <= 24;
};

const keyFromCode = (code: string): string | undefined => {
    const letter = code.match(/^Key([A-Z])$/);
    if (letter) return letter[1];

    const digit = code.match(/^Digit([0-9])$/);
    if (digit) return digit[1];

    const numpad = code.match(/^Numpad([0-9])$/);
    if (numpad) return `num${numpad[1]}`;

    if (isFunctionKey(code)) return code;

    return CODE_TO_KEY[code];
};

const isKey = (key: string) =>
    /^[A-Z0-9]$/.test(key) || /^num[0-9]$/.test(key) || isFunctionKey(key) || NON_ALPHANUMERIC_KEYS.has(key);

/** Builds an accelerator from a `keydown` event. Uses `code` rather than
 * `key` so the result doesn't change with the keyboard layout or with
 * Alt/Option producing a different character. */
export const acceleratorFromKeyEvent = (
    event: AcceleratorKeyEvent,
    platform: AcceleratorPlatform
): AcceleratorRecordResult => {
    if (MODIFIER_CODES.has(event.code)) return { type: 'pending' };

    const key = keyFromCode(event.code);
    if (!key) return { type: 'invalid' };

    const modifiers: string[] = [];
    if (platform === 'darwin' && event.metaKey) modifiers.push('Command');
    if (event.ctrlKey) modifiers.push('Control');
    if (event.altKey) modifiers.push('Alt');
    if (event.shiftKey) modifiers.push('Shift');
    if (platform !== 'darwin' && event.metaKey) modifiers.push('Super');

    if (!modifiers.some((modifier) => PRIMARY_MODIFIERS.has(modifier))) return { type: 'invalid' };

    return { type: 'valid', accelerator: [...modifiers, key].join('+') };
};

/** Checks an accelerator has the shape `acceleratorFromKeyEvent` produces:
 * unique known modifiers including a primary one, then exactly one key. */
export const isValidAccelerator = (accelerator: unknown, platform: AcceleratorPlatform): accelerator is string => {
    /* The longest valid accelerator is about 40 characters: the
     * limit rejects oversized input before splitting it */
    if (typeof accelerator !== 'string' || accelerator.length > 64) return false;

    const parts = accelerator.split('+');
    const key = parts.pop();
    if (!key || !isKey(key)) return false;

    const modifiers = new Set(parts);
    if (modifiers.size !== parts.length) return false;
    if (!parts.every((modifier) => MODIFIERS.has(modifier))) return false;
    if (platform === 'darwin' ? modifiers.has('Super') : modifiers.has('Command')) return false;

    return parts.some((modifier) => PRIMARY_MODIFIERS.has(modifier));
};

const MODIFIER_DISPLAY_NAMES: Record<AcceleratorPlatform, Record<string, string>> = {
    darwin: { Command: 'Cmd', Control: 'Ctrl', Alt: 'Option' },
    win32: { Control: 'Ctrl', Super: 'Win' },
    linux: { Control: 'Ctrl' },
};

const KEY_DISPLAY_NAMES: Record<string, string> = {
    Up: '↑',
    Down: '↓',
    Left: '←',
    Right: '→',
    numadd: 'Num +',
    numsub: 'Num -',
    nummult: 'Num *',
    numdiv: 'Num /',
    numdec: 'Num .',
};

/** Splits an accelerator into the labels shown on each key cap */
export const getAcceleratorKeyLabels = (accelerator: string, platform: AcceleratorPlatform): string[] =>
    accelerator.split('+').map((part) => {
        if (MODIFIER_DISPLAY_NAMES[platform][part]) return MODIFIER_DISPLAY_NAMES[platform][part];
        if (KEY_DISPLAY_NAMES[part]) return KEY_DISPLAY_NAMES[part];
        if (/^num[0-9]$/.test(part)) return `Num ${part.slice(3)}`;
        return part;
    });

export const getAcceleratorPlatform = (target: string): AcceleratorPlatform => {
    if (target === 'darwin' || target === 'win32') return target;
    return 'linux';
};
