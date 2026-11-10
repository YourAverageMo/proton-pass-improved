import {
    type AcceleratorKeyEvent,
    acceleratorFromKeyEvent,
    getAcceleratorKeyLabels,
    getAcceleratorPlatform,
    isValidAccelerator,
} from './accelerator';

const key = (code: string, mods: Partial<Omit<AcceleratorKeyEvent, 'code'>> = {}): AcceleratorKeyEvent => ({
    code,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    ...mods,
});

describe('acceleratorFromKeyEvent', () => {
    test('waits while only modifiers are held', () => {
        expect(acceleratorFromKeyEvent(key('ControlLeft', { ctrlKey: true }), 'win32')).toEqual({ type: 'pending' });
        expect(acceleratorFromKeyEvent(key('ShiftRight', { shiftKey: true }), 'linux')).toEqual({ type: 'pending' });
        expect(acceleratorFromKeyEvent(key('MetaLeft', { metaKey: true }), 'darwin')).toEqual({ type: 'pending' });
    });

    test('rejects keys without a primary modifier', () => {
        expect(acceleratorFromKeyEvent(key('KeyP'), 'win32')).toEqual({ type: 'invalid' });
        expect(acceleratorFromKeyEvent(key('KeyP', { shiftKey: true }), 'win32')).toEqual({ type: 'invalid' });
        expect(acceleratorFromKeyEvent(key('F5'), 'linux')).toEqual({ type: 'invalid' });
    });

    test('rejects unknown keys', () => {
        expect(acceleratorFromKeyEvent(key('IntlBackslash', { ctrlKey: true }), 'win32')).toEqual({ type: 'invalid' });
        expect(acceleratorFromKeyEvent(key('F25', { ctrlKey: true }), 'win32')).toEqual({ type: 'invalid' });
    });

    test('builds accelerators in a stable modifier order', () => {
        expect(acceleratorFromKeyEvent(key('KeyP', { ctrlKey: true, shiftKey: true, altKey: true }), 'win32')).toEqual({
            type: 'valid',
            accelerator: 'Control+Alt+Shift+P',
        });
        expect(acceleratorFromKeyEvent(key('Space', { metaKey: true, shiftKey: true }), 'darwin')).toEqual({
            type: 'valid',
            accelerator: 'Command+Shift+Space',
        });
        expect(acceleratorFromKeyEvent(key('Digit1', { metaKey: true }), 'linux')).toEqual({
            type: 'valid',
            accelerator: 'Super+1',
        });
    });

    test('maps punctuation, arrows, numpad and function keys', () => {
        const ctrl = { ctrlKey: true };
        expect(acceleratorFromKeyEvent(key('Backquote', ctrl), 'win32')).toMatchObject({ accelerator: 'Control+`' });
        expect(acceleratorFromKeyEvent(key('ArrowUp', ctrl), 'win32')).toMatchObject({ accelerator: 'Control+Up' });
        expect(acceleratorFromKeyEvent(key('Numpad7', ctrl), 'win32')).toMatchObject({ accelerator: 'Control+num7' });
        expect(acceleratorFromKeyEvent(key('F12', ctrl), 'win32')).toMatchObject({ accelerator: 'Control+F12' });
    });
});

describe('isValidAccelerator', () => {
    test('accepts recorded accelerators', () => {
        expect(isValidAccelerator('Control+Shift+P', 'win32')).toBe(true);
        expect(isValidAccelerator('Command+Space', 'darwin')).toBe(true);
        expect(isValidAccelerator('Alt+F24', 'linux')).toBe(true);
        expect(isValidAccelerator('Super+num0', 'linux')).toBe(true);
        expect(isValidAccelerator('Control+\\', 'win32')).toBe(true);
    });

    test('rejects malformed input', () => {
        expect(isValidAccelerator(undefined, 'win32')).toBe(false);
        expect(isValidAccelerator(42, 'win32')).toBe(false);
        expect(isValidAccelerator('', 'win32')).toBe(false);
        expect(isValidAccelerator('P', 'win32')).toBe(false);
        expect(isValidAccelerator('Shift+P', 'win32')).toBe(false);
        expect(isValidAccelerator('Control+Shift', 'win32')).toBe(false);
        expect(isValidAccelerator('Control+Control+P', 'win32')).toBe(false);
        expect(isValidAccelerator('Control+P+Q', 'win32')).toBe(false);
        expect(isValidAccelerator('Control+F25', 'win32')).toBe(false);
        expect(isValidAccelerator('Hyper+P', 'win32')).toBe(false);
    });

    test('rejects modifiers from another platform', () => {
        expect(isValidAccelerator('Command+P', 'win32')).toBe(false);
        expect(isValidAccelerator('Super+P', 'darwin')).toBe(false);
    });
});

describe('getAcceleratorKeyLabels', () => {
    test('uses platform names for modifiers', () => {
        expect(getAcceleratorKeyLabels('Command+Alt+Shift+P', 'darwin')).toEqual(['Cmd', 'Option', 'Shift', 'P']);
        expect(getAcceleratorKeyLabels('Control+Super+P', 'win32')).toEqual(['Ctrl', 'Win', 'P']);
        expect(getAcceleratorKeyLabels('Control+Super+P', 'linux')).toEqual(['Ctrl', 'Super', 'P']);
    });

    test('uses readable names for special keys', () => {
        expect(getAcceleratorKeyLabels('Control+Up', 'win32')).toEqual(['Ctrl', '↑']);
        expect(getAcceleratorKeyLabels('Control+num7', 'win32')).toEqual(['Ctrl', 'Num 7']);
        expect(getAcceleratorKeyLabels('Control+numadd', 'win32')).toEqual(['Ctrl', 'Num +']);
    });
});

describe('getAcceleratorPlatform', () => {
    test('maps build targets', () => {
        expect(getAcceleratorPlatform('darwin')).toBe('darwin');
        expect(getAcceleratorPlatform('win32')).toBe('win32');
        expect(getAcceleratorPlatform('linux')).toBe('linux');
        expect(getAcceleratorPlatform('web')).toBe('linux');
    });
});
