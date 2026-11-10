import { useEffect } from 'react';

import { onArrowNavigationKeyDown } from '../lib/arrow-navigation/dom';

/** Moves focus between the main page's elements with the arrow keys
 * and makes Enter click focused `role="button"`-like elements.
 * Zones are marked with `data-arrow-nav-zone` on the layout containers. */
export const useArrowKeyNavigation = (enabled: boolean) => {
    useEffect(() => {
        if (!enabled) return;
        document.addEventListener('keydown', onArrowNavigationKeyDown);
        return () => document.removeEventListener('keydown', onArrowNavigationKeyDown);
    }, [enabled]);
};
