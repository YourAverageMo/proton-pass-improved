import { renderHook } from '@testing-library/react-hooks';

import { useArrowKeyNavigation } from './useArrowKeyNavigation';

/** Elements carry their rect as `data-rect="left,top,width,height"`.
 * Elements without one get jsdom's empty rect and count as hidden. */
const mount = (html: string) => {
    document.body.innerHTML = html;

    document.querySelectorAll<HTMLElement>('[data-rect]').forEach((el) => {
        const [left, top, width, height] = el.dataset.rect!.split(',').map(Number);
        const rect = { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top };
        el.getBoundingClientRect = () => ({ ...rect, toJSON: () => rect }) as DOMRect;
    });
};

const byId = (id: string) => document.getElementById(id)!;

const press = (key: string, init: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
    (document.activeElement ?? document.body).dispatchEvent(event);
    return event;
};

/* Layout: sidebar on the left, header on top, list and content below it.
 * The search input jumps to the topmost visible result. */
const LAYOUT = `
    <div id="sidebar" data-arrow-nav-zone="sidebar" data-rect="0,0,200,800">
        <button id="vault-1" data-rect="10,100,180,30">Vault 1</button>
        <button id="vault-2" data-rect="10,140,180,30">Vault 2</button>
    </div>
    <div id="header" data-arrow-nav-zone="header" data-rect="200,0,1000,60">
        <button id="menu" data-rect="210,10,40,40">Menu</button>
        <input id="search" type="text" value="hello" data-arrow-nav-down="[data-arrow-nav-item='result']" data-rect="260,10,600,40" />
        <button id="upsell" data-rect="870,10,40,40">Upgrade</button>
    </div>
    <div id="list" data-arrow-nav-zone="list" data-rect="200,60,400,740">
        <button id="filter" data-rect="210,70,100,30">Filter</button>
        <div id="grid" tabindex="0" style="overflow-y: auto" data-rect="200,110,400,690">
            <a href="#" id="row-hidden" data-arrow-nav-item="result" data-rect="200,50,400,54">Hidden</a>
            <a href="#" id="row-1" data-arrow-nav-item="result" data-rect="200,110,400,54">One</a>
            <a href="#" id="row-2" data-arrow-nav-item="result" data-arrow-nav-entry data-rect="200,164,400,54">Two</a>
        </div>
    </div>
    <div id="content" data-arrow-nav-zone="content" data-rect="600,60,600,740">
        <button id="edit" data-rect="1000,70,60,30">Edit</button>
        <div data-arrow-nav-entry data-rect="600,110,600,600">
            <div id="field-1" tabindex="0" role="button" data-rect="610,120,580,60">
                <button id="eye" data-rect="1140,132,36,36">Eye</button>
            </div>
            <div id="field-2" tabindex="0" role="button" data-rect="610,190,580,60">Field 2</div>
            <textarea id="note" data-rect="610,260,580,100"></textarea>
        </div>
    </div>
    <div id="outside" data-rect="0,900,100,30"><button id="portal-button" data-rect="0,900,100,30">Portal</button></div>
`;

describe('useArrowKeyNavigation', () => {
    let unmount: () => void;

    beforeEach(() => {
        mount(LAYOUT);
        unmount = renderHook(() => useArrowKeyNavigation(true)).unmount;
    });

    afterEach(() => unmount());

    test('moves inside a zone', () => {
        byId('field-1').focus();
        const event = press('ArrowDown');
        expect(document.activeElement).toBe(byId('field-2'));
        expect(event.defaultPrevented).toBe(true);
    });

    test('focuses without the browser scroll, then scrolls by the minimum amount', () => {
        const target = byId('field-2');
        const focus = jest.spyOn(target, 'focus');
        const scrollIntoView = jest.fn();
        target.scrollIntoView = scrollIntoView;

        byId('field-1').focus();
        press('ArrowDown');

        expect(focus).toHaveBeenCalledWith({ preventScroll: true });
        expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
    });

    test('reaches a field action button and comes back', () => {
        byId('field-1').focus();
        press('ArrowRight');
        expect(document.activeElement).toBe(byId('eye'));
        press('ArrowLeft');
        expect(document.activeElement).toBe(byId('field-1'));
    });

    test('moves across zones and prefers the entry marker', () => {
        byId('row-1').focus();
        press('ArrowRight');
        expect(document.activeElement).toBe(byId('field-1'));

        press('ArrowLeft');
        expect(document.activeElement).toBe(byId('row-2'));

        /* no entry marker in the sidebar: closest vault to the row */
        press('ArrowLeft');
        expect(document.activeElement).toBe(byId('vault-2'));
    });

    test('skips rows scrolled out of the list when coming from outside it', () => {
        byId('filter').focus();
        press('ArrowUp');
        expect(document.activeElement).toBe(byId('menu'));
    });

    test('reaches rows scrolled out of the list from another row', () => {
        byId('row-1').focus();
        press('ArrowUp');
        expect(document.activeElement).toBe(byId('row-hidden'));
    });

    test('search goes down to the topmost visible result', () => {
        byId('search').focus();
        press('ArrowDown');
        expect(document.activeElement).toBe(byId('row-1'));
    });

    test('focus on a non-candidate enters its zone', () => {
        byId('grid').focus();
        press('ArrowDown');
        expect(document.activeElement).toBe(byId('row-2'));
    });

    test('focus on body enters the list zone', () => {
        (document.activeElement as HTMLElement | null)?.blur();
        press('ArrowDown');
        expect(document.activeElement).toBe(byId('row-2'));
    });

    test('nothing to move to leaves the event alone', () => {
        byId('vault-1').focus();
        const event = press('ArrowLeft');
        expect(document.activeElement).toBe(byId('vault-1'));
        expect(event.defaultPrevented).toBe(false);
    });

    describe('text inputs', () => {
        test('left and right move the caret until it reaches an edge', () => {
            const search = byId('search') as HTMLInputElement;
            search.focus();

            search.setSelectionRange(2, 2);
            expect(press('ArrowLeft').defaultPrevented).toBe(false);
            expect(press('ArrowRight').defaultPrevented).toBe(false);
            expect(document.activeElement).toBe(search);

            search.setSelectionRange(0, 5);
            press('ArrowLeft');
            expect(document.activeElement).toBe(search);

            search.setSelectionRange(0, 0);
            press('ArrowLeft');
            expect(document.activeElement).toBe(byId('menu'));
        });

        test('right at the end of the value navigates', () => {
            const search = byId('search') as HTMLInputElement;
            search.focus();
            search.setSelectionRange(5, 5);
            press('ArrowRight');
            expect(document.activeElement).toBe(byId('upsell'));
        });
    });

    describe('ignored keys', () => {
        test.each(['altKey', 'ctrlKey', 'metaKey', 'shiftKey'])('with %s', (modifier) => {
            byId('field-1').focus();
            press('ArrowDown', { [modifier]: true });
            expect(document.activeElement).toBe(byId('field-1'));
        });

        test('when already handled', () => {
            byId('field-1').focus();
            const event = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
            event.preventDefault();
            byId('field-1').dispatchEvent(event);
            expect(document.activeElement).toBe(byId('field-1'));
        });

        test('when focus is outside every zone', () => {
            byId('portal-button').focus();
            press('ArrowUp');
            expect(document.activeElement).toBe(byId('portal-button'));
        });

        test('in a textarea', () => {
            byId('note').focus();
            press('ArrowUp');
            expect(document.activeElement).toBe(byId('note'));
        });

        test('on body while a modal is open', () => {
            document.body.insertAdjacentHTML('beforeend', '<dialog open></dialog>');
            (document.activeElement as HTMLElement | null)?.blur();
            press('ArrowDown');
            expect(document.activeElement).toBe(document.body);
        });
    });

    describe('Enter', () => {
        test('clicks a focused role=button element once', () => {
            const onClick = jest.fn();
            byId('field-2').addEventListener('click', onClick);
            byId('field-2').focus();

            const event = press('Enter');
            expect(onClick).toHaveBeenCalledTimes(1);
            expect(event.defaultPrevented).toBe(true);
        });

        test('leaves native buttons to the browser', () => {
            const onClick = jest.fn();
            byId('edit').addEventListener('click', onClick);
            byId('edit').focus();

            expect(press('Enter').defaultPrevented).toBe(false);
            expect(onClick).not.toHaveBeenCalled();
        });
    });
});

describe('useArrowKeyNavigation disabled', () => {
    test('adds no listener', () => {
        const addEventListener = jest.spyOn(document, 'addEventListener');
        const { unmount } = renderHook(() => useArrowKeyNavigation(false));

        expect(addEventListener).not.toHaveBeenCalledWith('keydown', expect.anything());
        unmount();
        addEventListener.mockRestore();
    });
});
