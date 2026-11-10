import type { KeyboardEvent, MouseEvent, PropsWithChildren } from 'react';
import { type FC, useRef } from 'react';

import { c } from 'ttag';

import clsx from '@proton/utils/clsx';

import { SelectionManager } from '../../../../utils/dom/selection';
import { useCopyToClipboard } from '../../../Settings/Clipboard/ClipboardProvider';

export type ClickToCopyProps = {
    className?: string;
    value?: string | (() => string);
    onCopy?: () => void;
};

export const ClickToCopy: FC<PropsWithChildren<ClickToCopyProps>> = ({ className, children, onCopy, value = '' }) => {
    const ref = useRef<HTMLDivElement>(null);
    const copyToClipboard = useCopyToClipboard();
    const getValue = () => (value instanceof Function ? value() : value);

    const copy = () => {
        if (!value) return;
        void copyToClipboard(getValue());
        onCopy?.();
    };

    const handleClick = (evt: MouseEvent) => {
        if (ref.current && SelectionManager.hasChildOf(ref.current)) evt.preventDefault();
        else copy();
    };

    /** Only handle Enter on the field itself: Enter on a nested
     * button (eg: show/hide) must not copy as well */
    const handleKeyDown = (evt: KeyboardEvent) => {
        if (evt.key !== 'Enter' || evt.target !== evt.currentTarget) return;
        evt.preventDefault();
        copy();
    };

    return (
        /* disabling `prefer-tag-over-role` as we cannot use a * `button` element here - children may include
            buttons and * this would lead to invalid DOM structure */
        <div
            ref={ref}
            className={clsx('cursor-pointer overflow-hidden', className)}
            onKeyDown={handleKeyDown}
            onClick={handleClick}
            tabIndex={0}
            // eslint-disable-next-line jsx-a11y/prefer-tag-over-role
            role="button"
        >
            <span className="sr-only"> {c('Info').t`Press Enter to copy`}</span>
            {children}
        </div>
    );
};
