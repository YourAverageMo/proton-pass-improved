import { fireEvent, render, screen } from '@testing-library/react';

import { ClickToCopy } from './ClickToCopy';

const copyToClipboard = jest.fn().mockResolvedValue(undefined);

jest.mock('../../../Settings/Clipboard/ClipboardProvider', () => ({
    useCopyToClipboard: () => copyToClipboard,
}));

describe('ClickToCopy', () => {
    beforeEach(() => copyToClipboard.mockClear());

    test('Enter copies once and calls `onCopy`', () => {
        const onCopy = jest.fn();
        render(
            <ClickToCopy value="john@proton.me" onCopy={onCopy}>
                john@proton.me
            </ClickToCopy>
        );

        const field = screen.getByRole('button');
        const notPrevented = fireEvent.keyDown(field, { key: 'Enter' });

        expect(notPrevented).toBe(false);
        expect(copyToClipboard).toHaveBeenCalledTimes(1);
        expect(copyToClipboard).toHaveBeenCalledWith('john@proton.me');
        expect(onCopy).toHaveBeenCalledTimes(1);
    });

    test('Enter on a nested button does not copy', () => {
        render(
            <ClickToCopy value="secret">
                <button type="button">Show</button>
            </ClickToCopy>
        );

        fireEvent.keyDown(screen.getByText('Show'), { key: 'Enter' });
        expect(copyToClipboard).not.toHaveBeenCalled();
    });
});
