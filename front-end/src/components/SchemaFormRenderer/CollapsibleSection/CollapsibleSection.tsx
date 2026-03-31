import {type ReactNode, useState} from 'react';
import styles from './CollapsibleSection.module.css';

interface CollapsibleSectionProps {
    children: ReactNode;
    collapsePreviewNames: string[];
}

export function CollapsibleSection({ children, collapsePreviewNames }: CollapsibleSectionProps) {
    const [hidden, setHidden] = useState(false);

    const collapsePreview = collapsePreviewNames.join(', ')
    const expand = <div onClick={() => setHidden(false)}>...{collapsePreview}</div>;

    return (
        <div className={styles.CollapseSection}>
            <div className={styles.indentLine} onClick={() => setHidden(!hidden)}></div>
            <div className={styles.content}>
                {hidden && expand}
                <div style={{ display: hidden ? 'none' : undefined }}>
                    {children}
                </div>
            </div>
        </div>
    );
}
