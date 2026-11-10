import type { Rect } from './geometry';
import { findBest } from './geometry';

const rect = (left: number, top: number, width: number, height: number): Rect => ({
    left,
    top,
    right: left + width,
    bottom: top + height,
});

describe('findBest', () => {
    describe('vertical list', () => {
        const rows = [rect(0, 0, 200, 50), rect(0, 50, 200, 50), rect(0, 100, 200, 50)];

        test('down picks the next row', () => {
            expect(findBest(rows[0], rows, 'down')).toBe(1);
            expect(findBest(rows[1], rows, 'down')).toBe(2);
        });

        test('up picks the previous row', () => {
            expect(findBest(rows[2], rows, 'up')).toBe(1);
        });

        test('returns null past the ends', () => {
            expect(findBest(rows[2], rows, 'down')).toBeNull();
            expect(findBest(rows[0], rows, 'up')).toBeNull();
            expect(findBest(rows[1], rows, 'left')).toBeNull();
        });
    });

    describe('horizontal button row', () => {
        const buttons = [rect(0, 0, 30, 30), rect(40, 0, 30, 30), rect(80, 0, 30, 30)];

        test('right and left move one button', () => {
            expect(findBest(buttons[0], buttons, 'right')).toBe(1);
            expect(findBest(buttons[2], buttons, 'left')).toBe(1);
        });
    });

    describe('field with an inner action button', () => {
        const field = rect(0, 0, 300, 60);
        const button = rect(250, 12, 36, 36);
        const nextField = rect(0, 70, 300, 60);
        /* inner button whose center sits 3px lower than the field's */
        const lowButton = rect(250, 15, 36, 36);

        test('right reaches the inner button, left returns', () => {
            expect(findBest(field, [field, button, nextField], 'right')).toBe(1);
            expect(findBest(button, [field, button, nextField], 'left')).toBe(0);
        });

        test('down skips the inner button', () => {
            expect(findBest(field, [lowButton, nextField], 'down')).toBe(1);
        });

        test('up from the inner button skips its own field', () => {
            const previous = rect(0, -70, 300, 60);
            expect(findBest(lowButton, [previous, field], 'up')).toBe(0);
        });

        test('down from the inner button reaches the next field', () => {
            expect(findBest(button, [field, nextField], 'down')).toBe(1);
        });
    });

    describe('toolbar above fields', () => {
        const toolbar = [rect(400, 0, 60, 30), rect(470, 0, 30, 30)];
        const fields = [rect(0, 50, 500, 60), rect(0, 120, 500, 60)];
        const all = [...toolbar, ...fields];

        test('down from a toolbar button reaches the first field', () => {
            expect(findBest(toolbar[0], all, 'down')).toBe(2);
        });

        test('up from the first field reaches the closest toolbar button', () => {
            /* both overlap horizontally: the one closest to the field's center wins */
            expect(findBest(fields[0], all, 'up')).toBe(0);
        });
    });

    test('left and right skip candidates on other rows', () => {
        const row = rect(200, 160, 400, 50);
        const filterAbove = rect(210, 70, 100, 30);
        const sidebar = rect(0, 0, 200, 800);
        expect(findBest(row, [filterAbove], 'left')).toBeNull();
        expect(findBest(row, [filterAbove, sidebar], 'left')).toBe(1);
    });

    test('prefers aligned candidates over closer offset ones', () => {
        const from = rect(0, 0, 100, 40);
        const aligned = rect(0, 100, 100, 40);
        const offset = rect(150, 50, 100, 40);
        expect(findBest(from, [offset, aligned], 'down')).toBe(1);
    });

    test('breaks ties by orthogonal center distance, then by order', () => {
        const from = rect(100, 0, 100, 40);
        const left = rect(0, 50, 250, 40);
        const centered = rect(100, 50, 100, 40);
        expect(findBest(from, [left, centered], 'down')).toBe(1);

        const twinA = rect(100, 50, 100, 40);
        const twinB = rect(100, 50, 100, 40);
        expect(findBest(from, [twinA, twinB], 'down')).toBe(0);
    });

    test('returns null without candidates', () => {
        expect(findBest(rect(0, 0, 10, 10), [], 'down')).toBeNull();
    });
});
