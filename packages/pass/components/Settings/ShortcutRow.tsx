import type { FC, ReactNode } from 'react';

import { c } from 'ttag';

/** Key caps for a keyboard shortcut, one per key label */
const ShortcutKeys: FC<{ keys: string[] }> = ({ keys }) => (
    <span className="flex items-center gap-1">
        {keys.map((key, i) => (
            <kbd
                key={i}
                className="inline-flex items-center justify-center h-6 px-2 text-sm border border-weak rounded"
                style={{ fontFamily: 'system-ui, sans-serif', minWidth: '1.5rem' }}
            >
                {key}
            </kbd>
        ))}
    </span>
);

type ShortcutRowProps = {
    description: ReactNode;
    /** Key labels of the shortcut, empty when none is set */
    keys: string[];
    /** Shown in place of the keys, e.g. while recording a shortcut */
    placeholder?: ReactNode;
    actions?: ReactNode;
    children?: ReactNode;
};

/** One row of the "Keyboard shortcuts" settings panel */
export const ShortcutRow: FC<ShortcutRowProps> = ({ description, keys, placeholder, actions, children }) => (
    <div className="flex flex-nowrap items-center justify-between gap-4">
        <div className="flex-1" aria-live="polite">
            <span className="block mb-1">
                {placeholder || keys.length === 0 ? (
                    <span className="color-weak">{placeholder ?? c('Info').t`Not configured`}</span>
                ) : (
                    <ShortcutKeys keys={keys} />
                )}
            </span>
            <span className="block color-weak text-sm">{description}</span>
            {children}
        </div>
        {actions && <div className="flex flex-nowrap shrink-0 gap-2">{actions}</div>}
    </div>
);
