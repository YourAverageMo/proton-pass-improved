import { bidirectionalOverscanIndicesGetter } from './overscan';

const params = { direction: 'vertical', overscanCellsCount: 3 } as const;

describe('bidirectionalOverscanIndicesGetter', () => {
    test.each([-1, 1] as const)('overscans both sides when scrolling in direction %s', (scrollDirection) => {
        expect(
            bidirectionalOverscanIndicesGetter({
                ...params,
                scrollDirection,
                cellCount: 100,
                startIndex: 20,
                stopIndex: 30,
            })
        ).toEqual({ overscanStartIndex: 17, overscanStopIndex: 33 });
    });

    test('clamps to the available rows', () => {
        expect(
            bidirectionalOverscanIndicesGetter({
                ...params,
                scrollDirection: 1,
                cellCount: 10,
                startIndex: 1,
                stopIndex: 8,
            })
        ).toEqual({ overscanStartIndex: 0, overscanStopIndex: 9 });
    });
});
