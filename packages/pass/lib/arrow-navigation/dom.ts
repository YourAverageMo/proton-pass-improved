import type { ArrowDirection, Rect } from './geometry';
import { findBest } from './geometry';

export const ZONE_ATTR = 'data-arrow-nav-zone';
export const ENTRY_ATTR = 'data-arrow-nav-entry';
export const ITEM_ATTR = 'data-arrow-nav-item';

/** Value is a selector: the arrow key in that direction focuses
 * the topmost visible element matching it */
export const overrideAttr = (direction: ArrowDirection) => `data-arrow-nav-${direction}`;

const ZONE_SELECTOR = `[${ZONE_ATTR}]`;
const DEFAULT_ZONE = 'list';

const KEY_DIRECTIONS: Record<string, ArrowDirection> = {
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right',
};

const NATIVE_FOCUSABLE =
    'a[href], button, input:not([type="hidden"]), select, textarea, [contenteditable=""], [contenteditable="true"]';

const INTERACTIVE_ROLES = new Set([
    'button',
    'link',
    'menuitem',
    'option',
    'tab',
    'checkbox',
    'switch',
    'radio',
    'textbox',
    'combobox',
]);

/** Elements whose native behaviour already handles Enter */
const NATIVE_ENTER = 'button, a[href], input, textarea, select, summary';

/** Containers that implement their own arrow-key behaviour */
const ARROW_OWNERS =
    '[role="tablist"], [role="radiogroup"], [role="menu"], [role="menubar"], [role="listbox"], [role="tree"], [role="slider"], [role="spinbutton"]';

const ARROW_OWNING_INPUTS = new Set([
    'number',
    'range',
    'date',
    'time',
    'datetime-local',
    'month',
    'week',
    'color',
    'radio',
]);

const TEXT_INPUTS = new Set(['text', 'search', 'email', 'password', 'url', 'tel']);

const MODAL_SELECTOR = 'dialog[open], [aria-modal="true"], [role="dialog"]';

const toRect = ({ top, right, bottom, left }: DOMRect): Rect => ({ top, right, bottom, left });

const isVisible = (el: Element): boolean => {
    const { width, height } = el.getBoundingClientRect();
    if (width === 0 && height === 0) return false;
    return el.closest('[aria-hidden="true"], [inert]') === null;
};

const isDisabled = (el: Element) => (el as HTMLButtonElement).disabled === true;

export const isCandidate = (el: Element): el is HTMLElement => {
    if (!(el instanceof HTMLElement)) return false;

    const focusable = el.matches(NATIVE_FOCUSABLE)
        ? !isDisabled(el)
        : el.tabIndex >= 0 && el.hasAttribute('tabindex') && INTERACTIVE_ROLES.has(el.getAttribute('role') ?? '');

    return focusable && isVisible(el);
};

const getZones = (): HTMLElement[] => Array.from(document.querySelectorAll<HTMLElement>(ZONE_SELECTOR));

const getZone = (el: Element): HTMLElement | null => el.closest<HTMLElement>(ZONE_SELECTOR);

const getZoneByName = (name: string) => document.querySelector<HTMLElement>(`[${ZONE_ATTR}="${name}"]`) ?? null;

const pickBest = (from: Element, elements: HTMLElement[], direction: ArrowDirection): HTMLElement | null => {
    const fromRect = toRect(from.getBoundingClientRect());
    const index = findBest(
        fromRect,
        elements.map((el) => toRect(el.getBoundingClientRect())),
        direction
    );

    return index === null ? null : elements[index];
};

/** Closest ancestor that scrolls, used to decide which matches are on screen */
const getScrollParent = (el: Element): Element | null => {
    let node = el.parentElement;

    while (node) {
        const { overflowY } = getComputedStyle(node);
        if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') return node;
        node = node.parentElement;
    }

    return null;
};

const intersectsVertically = (a: Rect, b: Rect) => a.bottom > b.top && a.top < b.bottom;
const intersects = (a: Rect, b: Rect) => intersectsVertically(a, b) && a.right > b.left && a.left < b.right;

/** Candidates in `root`. Elements scrolled out of their scroll container
 * (eg: overscan rows of the virtual list) only count when `from` shares
 * that container, so moving row to row still scrolls the list but moving
 * up from the filter bar doesn't land on a row hidden behind it. */
const getCandidates = (root: Element, from?: Element): HTMLElement[] =>
    Array.from(root.querySelectorAll(`${NATIVE_FOCUSABLE}, [tabindex][role]`)).filter((el): el is HTMLElement => {
        if (!isCandidate(el)) return false;

        const container = getScrollParent(el);
        if (!container || (from && container.contains(from))) return true;

        return intersects(toRect(el.getBoundingClientRect()), toRect(container.getBoundingClientRect()));
    });

/** Topmost match whose rect intersects its scroll container,
 * falling back to the first match in DOM order */
const resolveOverride = (selector: string): HTMLElement | null => {
    let matches: HTMLElement[];

    try {
        matches = Array.from(document.querySelectorAll(selector)).filter(isCandidate);
    } catch {
        return null;
    }

    let best: { el: HTMLElement; top: number } | null = null;

    for (const el of matches) {
        const rect = toRect(el.getBoundingClientRect());
        const container = getScrollParent(el);
        const viewport = container
            ? toRect(container.getBoundingClientRect())
            : { top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth };

        if (intersectsVertically(rect, viewport) && (!best || rect.top < best.top)) best = { el, top: rect.top };
    }

    return best?.el ?? matches[0] ?? null;
};

/** Element to focus when arriving in `zone`: an entry marker first,
 * then the closest candidate from `from`, then the first candidate */
export const resolveEntry = (zone: Element, from?: Element, direction?: ArrowDirection): HTMLElement | null => {
    const candidates = getCandidates(zone, from);
    if (candidates.length === 0) return null;

    const marker = Array.from(zone.querySelectorAll(`[${ENTRY_ATTR}]`)).find(isVisible);

    if (marker) {
        if (isCandidate(marker)) return marker;
        const inner = candidates.find((el) => marker.contains(el));
        if (inner) return inner;
    }

    if (from && direction) {
        const closest = pickBest(from, candidates, direction);
        if (closest) return closest;
    }

    return candidates[0];
};

/** Whether an arrow key should move focus away from a text-like input */
const canLeaveInput = (input: HTMLInputElement, direction: ArrowDirection): boolean => {
    if (direction === 'up' || direction === 'down') return true;

    let start: number | null;
    let end: number | null;

    try {
        ({ selectionStart: start, selectionEnd: end } = input);
    } catch {
        return false;
    }

    /* Some input types (eg: email in Chromium) don't expose a selection */
    if (start === null || end === null || start !== end) return false;

    return direction === 'left' ? start === 0 : start === input.value.length;
};

/** Whether the focused element keeps the arrow key for itself */
const ownsArrowKey = (el: Element, direction: ArrowDirection): boolean => {
    if (el.closest(ARROW_OWNERS)) return true;
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
    if (el instanceof HTMLElement && el.isContentEditable) return true;

    if (el instanceof HTMLInputElement) {
        const type = el.type.toLowerCase();
        if (ARROW_OWNING_INPUTS.has(type)) return true;
        if (TEXT_INPUTS.has(type)) return !canLeaveInput(el, direction);
    }

    return false;
};

const moveFocus = (target: HTMLElement, event: KeyboardEvent) => {
    target.focus();
    target.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    event.preventDefault();
};

const findTarget = (active: Element, direction: ArrowDirection): HTMLElement | null => {
    if (active === document.body) {
        const zone = getZoneByName(DEFAULT_ZONE);
        return zone ? resolveEntry(zone) : null;
    }

    const zone = getZone(active);
    if (!zone) return null;

    /* Focus sits on something we can't navigate from (eg: a scroll
     * container after clicking empty space): enter its zone instead */
    if (!isCandidate(active)) return resolveEntry(zone);

    const override = active.getAttribute(overrideAttr(direction));
    if (override) {
        const target = resolveOverride(override);
        if (target) return target;
    }

    const inZone = pickBest(
        active,
        getCandidates(zone, active).filter((el) => el !== active),
        direction
    );

    if (inZone) return inZone;

    const otherZones = getZones().filter((other) => other !== zone && getCandidates(other).length > 0);
    const nextZone = pickBest(active, otherZones, direction);

    return nextZone ? resolveEntry(nextZone, active, direction) : null;
};

const handleEnter = (active: Element, event: KeyboardEvent) => {
    if (!(active instanceof HTMLElement) || !getZone(active)) return;
    if (active.matches(NATIVE_ENTER)) return;
    if (!INTERACTIVE_ROLES.has(active.getAttribute('role') ?? '')) return;

    event.preventDefault();
    active.click();
};

export const onArrowNavigationKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

    const direction = KEY_DIRECTIONS[event.key];
    if (!direction && event.key !== 'Enter') return;

    const active = document.activeElement ?? document.body;

    if (active === document.body) {
        if (document.querySelector(MODAL_SELECTOR)) return;
    } else if (!getZone(active)) return;

    if (!direction) return handleEnter(active, event);
    if (active !== document.body && ownsArrowKey(active, direction)) return;

    const target = findTarget(active, direction);
    if (target) moveFocus(target, event);
};
