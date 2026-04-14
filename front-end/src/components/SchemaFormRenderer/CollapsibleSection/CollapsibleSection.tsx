import {type ReactNode, useState} from 'react';
import styles from './CollapsibleSection.module.css';

interface CollapsibleSectionProps {
    children: ReactNode;
    collapsePreviewNames: string[];
    forceOpen?: boolean;
}

export function CollapsibleSection({ children, collapsePreviewNames, forceOpen }: CollapsibleSectionProps) {
    const [hidden, setHidden] = useState(false);

    const isHidden = forceOpen ? false : hidden;
    const collapsePreview = collapsePreviewNames.join(', ')
    const expand = <div onClick={() => setHidden(false)}>...{collapsePreview}</div>;

    return (
        <div className={styles.CollapseSection}>
            <div className={styles.indentLine} onClick={() => setHidden(!hidden)}></div>
            <div className={styles.content}>
                {isHidden && expand}
                <div style={{ display: isHidden ? 'none' : undefined }}>
                    {children}
                </div>
            </div>
        </div>
    );
}
