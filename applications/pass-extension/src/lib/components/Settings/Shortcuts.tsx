import { type FC, Fragment, useEffect, useState } from 'react';

import { c } from 'ttag';

import { Button } from '@proton/atoms/Button/Button';
import { SettingsPanel } from '@proton/pass/components/Settings/SettingsPanel';
import { ShortcutRow as BaseShortcutRow } from '@proton/pass/components/Settings/ShortcutRow';
import browser from '@proton/pass/lib/globals/browser';
import { PASS_APP_NAME } from '@proton/shared/lib/constants';
import { isMac } from '@proton/shared/lib/helpers/browser';
import noop from '@proton/utils/noop';

import { type Shortcut, resolveShortcuts } from '../../extension/commands';

type ShortcutRowProps = {
    description: string;
    shortcut: string;
    onConfigure?: () => void;
};

const ShortcutRow: FC<ShortcutRowProps> = ({ description, shortcut, onConfigure }) => (
    <BaseShortcutRow
        description={description}
        keys={shortcut ? shortcut.split('+').map((key) => (isMac() && key === 'Ctrl' ? 'Cmd' : key)) : []}
        actions={
            BUILD_TARGET !== 'firefox' && (
                <Button onClick={onConfigure} size="small" shape="outline">
                    {c('Action').t`Configure`}
                </Button>
            )
        }
    />
);

export const Shortcuts: FC = () => {
    const [shortcuts, setShortcuts] = useState<Shortcut[]>([]);

    useEffect(() => {
        browser.commands
            ?.getAll()
            .then((commands) =>
                setShortcuts(
                    resolveShortcuts(commands, {
                        _execute_action: c('Info').t`Open the ${PASS_APP_NAME} popup`,
                        'open-larger-window': c('Info').t`Open ${PASS_APP_NAME} in a larger window`,
                    })
                )
            )
            .catch(noop);
    }, []);

    /* See worker/index.ts: `browser.commands` may be undefined transiently
     * after the 1.37.0 update. Render nothing in that case. */
    if (!browser.commands) return null;

    const openShortcutsPage =
        BUILD_TARGET !== 'firefox'
            ? () => browser.tabs.create({ url: 'chrome://extensions/shortcuts' }).catch(noop)
            : undefined;

    const subTitle =
        BUILD_TARGET === 'firefox'
            ? c('Info').t`To configure shortcuts, go to about:addons in Firefox and select "Manage Extension Shortcuts"`
            : undefined;

    return (
        <SettingsPanel title={c('Label').t`Keyboard shortcuts`} subTitle={subTitle}>
            <div className="flex flex-column gap-4">
                {shortcuts.map(({ name, description, shortcut }, i) => (
                    <Fragment key={name}>
                        {i > 0 && <hr className="m-0 border-weak" />}
                        <ShortcutRow description={description} shortcut={shortcut} onConfigure={openShortcutsPage} />
                    </Fragment>
                ))}
            </div>
        </SettingsPanel>
    );
};
