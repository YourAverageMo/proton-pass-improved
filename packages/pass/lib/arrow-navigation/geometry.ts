export type ArrowDirection = 'up' | 'down' | 'left' | 'right';

export type Rect = { top: number; right: number; bottom: number; left: number };

/** Minimum distance, in pixels, a candidate's center must
 * sit past the origin's center to count as "in that direction" */
const CENTER_THRESHOLD = 1;

const centerX = (rect: Rect) => (rect.left + rect.right) / 2;
const centerY = (rect: Rect) => (rect.top + rect.bottom) / 2;

const overlapsVertically = (a: Rect, b: Rect) => a.bottom > b.top && a.top < b.bottom;

const contains = (outer: Rect, inner: Rect) =>
    outer.left <= inner.left && outer.right >= inner.right && outer.top <= inner.top && outer.bottom >= inner.bottom;

const nested = (a: Rect, b: Rect) => contains(a, b) || contains(b, a);

const isVertical = (direction: ArrowDirection) => direction === 'up' || direction === 'down';

const isEligible = (from: Rect, to: Rect, direction: ArrowDirection): boolean => {
    switch (direction) {
        /* Horizontally, a candidate must overlap the origin's rows. Left
         * from a result row then leaves the list instead of climbing to
         * the filter bar above it. */
        case 'right':
            return centerX(to) - centerX(from) > CENTER_THRESHOLD && overlapsVertically(from, to);
        case 'left':
            return centerX(from) - centerX(to) > CENTER_THRESHOLD && overlapsVertically(from, to);
        /* Vertically, nested rects don't count: a field's inner action
         * button can sit a few pixels below the field's center, and Down
         * should reach the next field, not that button (and vice versa). */
        case 'down':
            return centerY(to) - centerY(from) > CENTER_THRESHOLD && !nested(from, to);
        case 'up':
            return centerY(from) - centerY(to) > CENTER_THRESHOLD && !nested(from, to);
    }
};

const primaryGap = (from: Rect, to: Rect, direction: ArrowDirection): number => {
    switch (direction) {
        case 'right':
            return Math.max(0, to.left - from.right);
        case 'left':
            return Math.max(0, from.left - to.right);
        case 'down':
            return Math.max(0, to.top - from.bottom);
        case 'up':
            return Math.max(0, from.top - to.bottom);
    }
};

/** Gap between the rects on the axis orthogonal to `direction`, 0 when they overlap */
const orthogonalGap = (from: Rect, to: Rect, direction: ArrowDirection): number =>
    isVertical(direction)
        ? Math.max(0, to.left - from.right, from.left - to.right)
        : Math.max(0, to.top - from.bottom, from.top - to.bottom);

const orthogonalCenterDistance = (from: Rect, to: Rect, direction: ArrowDirection): number =>
    isVertical(direction) ? Math.abs(centerX(to) - centerX(from)) : Math.abs(centerY(to) - centerY(from));

/** Returns the index of the closest candidate in `direction`, or `null`.
 * Candidates are expected in DOM order: on a full tie the lower index wins. */
export const findBest = (from: Rect, candidates: Rect[], direction: ArrowDirection): number | null => {
    let best: { index: number; score: number; tie: number } | null = null;

    for (let index = 0; index < candidates.length; index++) {
        const rect = candidates[index];
        if (!isEligible(from, rect, direction)) continue;

        const score = primaryGap(from, rect, direction) + 2 * orthogonalGap(from, rect, direction);
        const tie = orthogonalCenterDistance(from, rect, direction);

        if (!best || score < best.score || (score === best.score && tie < best.tie)) {
            best = { index, score, tie };
        }
    }

    return best?.index ?? null;
};
