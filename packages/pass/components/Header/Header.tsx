import type { FC } from 'react';
import { Route, Switch } from 'react-router-dom';

import { getLocalPath } from '../Navigation/routing';
import { HeaderMain } from './HeaderMain';
import { HeaderMonitor } from './HeaderMonitor';
import { HeaderSettings } from './HeaderSettings';
import type { HeaderProps } from './types';

export const Header: FC<HeaderProps> = (props) => (
    <div className="shrink-0" data-arrow-nav-zone="header">
        <Switch>
            <Route path={getLocalPath('monitor')}>{(subRoute) => <HeaderMonitor {...subRoute} {...props} />}</Route>
            <Route path={getLocalPath('settings')}>{() => <HeaderSettings {...props} />}</Route>
            <Route>{() => <HeaderMain {...props} />}</Route>
        </Switch>
    </div>
);
