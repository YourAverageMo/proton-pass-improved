import type { OverscanIndices, OverscanIndicesGetterParams } from 'react-virtualized';

export type OverscanIndicesGetter = (params: OverscanIndicesGetterParams) => OverscanIndices;

/** Overscans `overscanCellsCount` rows on both sides of the visible range,
 * whatever the scroll direction. react-virtualized's default getter keeps
 * a single row behind the scroll direction, so the entry above a date
 * heading may not be mounted for arrow-key navigation to reach. */
export const bidirectionalOverscanIndicesGetter: OverscanIndicesGetter = ({
    cellCount,
    overscanCellsCount,
    startIndex,
    stopIndex,
}) => ({
    overscanStartIndex: Math.max(0, startIndex - overscanCellsCount),
    overscanStopIndex: Math.min(cellCount - 1, stopIndex + overscanCellsCount),
});
