import type { FC, PropsWithChildren } from 'react';

import './SubSidebar.scss';

export const SubSidebar: FC<PropsWithChildren> = ({ children }) => (
    <div id="pass-sub-sidebar" data-arrow-nav-zone="list" className="flex-1 relative">
        {children}
    </div>
);
