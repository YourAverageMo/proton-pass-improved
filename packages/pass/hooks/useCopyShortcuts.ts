import { useEffect, useRef } from 'react';
import { useStore } from 'react-redux';

import { useNotifications } from '@proton/app-context/useNotifications';
import noop from '@proton/utils/noop';

import { usePassCore } from '../components/Core/PassCoreProvider';
import { useSelectedItem } from '../components/Navigation/NavigationItem';
import { useCopyToClipboard } from '../components/Settings/Clipboard/ClipboardProvider';
import { MODAL_SELECTOR } from '../lib/arrow-navigation/dom';
import {
    ITEM_KEY_ATTR,
    getCopyShortcutField,
    getCopyShortcutValue,
    resolveCopyShortcuts,
} from '../lib/copy-shortcuts/copy-shortcuts';
import { getAcceleratorPlatform } from '../lib/global-shortcut/accelerator';
import { fromItemKey } from '../lib/items/item.utils';
import { selectItem } from '../store/selectors/items';
import { selectTOTPLimits } from '../store/selectors/limits';
import { selectOrgTOTPDisabled } from '../store/selectors/organization';
import { selectCopyShortcuts } from '../store/selectors/settings';
import { selectCanRevealSensitiveContent } from '../store/selectors/user';
import type { State } from '../store/types';
import type { UniqueItem } from '../types/data/items';
import type { MaybeNull } from '../types/utils';
import { otpGenerationErrorNotifcation } from './useOTPCode';

/** Leaves time to see the "Copied to clipboard" notification before hiding */
export const COPY_SHORTCUT_HIDE_DELAY_MS = 750;

const EDITABLE_SELECTOR = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

const isEditable = (el: MaybeNull<Element>) => el?.closest(EDITABLE_SELECTOR) != null;

const hasTextSelection = () => (window.getSelection()?.toString() ?? '').length > 0;

/** The focused item-list entry, else the item open in the content view */
const getTargetItem = (openItem: MaybeNull<UniqueItem>): MaybeNull<UniqueItem> => {
    const key = document.activeElement?.closest(`[${ITEM_KEY_ATTR}]`)?.getAttribute(ITEM_KEY_ATTR);
    return key ? fromItemKey(key) : openItem;
};

const useCopyShortcutsImpl = () => {
    const store = useStore<State>();
    const copyToClipboard = useCopyToClipboard();
    const { generateOTP } = usePassCore();
    const { createNotification } = useNotifications();
    const selectedItem = useSelectedItem();

    const openItem = useRef<MaybeNull<UniqueItem>>(null);
    openItem.current = selectedItem ? { shareId: selectedItem.shareId, itemId: selectedItem.itemId } : null;

    useEffect(() => {
        const platform = getAcceleratorPlatform(BUILD_TARGET);
        let hideTimer: ReturnType<typeof setTimeout> | undefined;

        const scheduleHide = () => {
            clearTimeout(hideTimer);
            hideTimer = setTimeout(() => {
                hideTimer = undefined;
                window.ctxBridge?.windowHide().catch(noop);
            }, COPY_SHORTCUT_HIDE_DELAY_MS);
        };

        const onKeyDown = async (event: KeyboardEvent) => {
            if (event.defaultPrevented || event.repeat || event.isComposing) return;

            const state = store.getState();
            const shortcuts = resolveCopyShortcuts(selectCopyShortcuts(state), platform);
            const field = getCopyShortcutField(event, shortcuts, platform);
            if (!field) return;

            if (isEditable(document.activeElement) || isEditable(event.target as MaybeNull<Element>)) return;
            if (hasTextSelection() || document.querySelector(MODAL_SELECTOR)) return;

            const target = getTargetItem(openItem.current);
            if (!target) return;

            const item = selectItem(target.shareId, target.itemId)(state);
            if (!item) return;

            const value = getCopyShortcutValue(item.data, field, {
                canRevealSensitiveContent: selectCanRevealSensitiveContent(item.shareId)(state),
                orgTOTPDisabled: selectOrgTOTPDisabled(state),
                totpAllowed: selectTOTPLimits(state).totpAllowed(item.itemId),
            });
            if (!value) return;

            event.preventDefault();

            let text: string;
            if (value.type === 'text') text = value.value;
            else {
                const otp = await Promise.resolve(generateOTP({ type: 'uri', totpUri: value.totpUri })).catch(
                    () => null
                );
                if (!otp) return createNotification(otpGenerationErrorNotifcation());
                text = otp.token;
            }

            if (await copyToClipboard(text)) scheduleHide();
        };

        document.addEventListener('keydown', onKeyDown);

        return () => {
            document.removeEventListener('keydown', onKeyDown);
            clearTimeout(hideTimer);
        };
    }, []);
};

/** Desktop shortcuts copying a field of the selected or open login item */
export const useCopyShortcuts: () => void = DESKTOP_BUILD ? useCopyShortcutsImpl : noop;
