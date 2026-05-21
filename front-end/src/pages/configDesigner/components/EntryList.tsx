import {Fragment} from 'react';
import {DESIGNER_CATEGORIES} from '../ConfigDesigner';
import styles from '../ConfigDesigner.module.css';

interface ConfigManagerLike {
    getCategoryEntries(cat: string): string[];
}

interface EntryListProps {
    configManager: ConfigManagerLike;
    editingEntry: {category: string; id: string} | null;
    onLoad: (cat: string, id: string) => void;
}

export function EntryList({configManager, editingEntry, onLoad}: EntryListProps) {
    return (
        <div className="card">
            <div className="card-title">Entries per category</div>
            {DESIGNER_CATEGORIES.map((cat) => {
                const entries = configManager.getCategoryEntries(cat);
                if (entries.length === 0) return null;
                return (
                    <Fragment key={cat}>
                        <div className="card-header">{cat}</div>
                        <div className={styles.pillList}>
                            {entries.map((entry) => {
                                const isActive = editingEntry?.category === cat && editingEntry?.id === entry;
                                return (
                                    <button
                                        key={entry}
                                        className={`${styles.pill}${isActive ? ` ${styles.pillActive}` : ''}`}
                                        onClick={() => onLoad(cat, entry)}
                                        type="button"
                                    >
                                        {entry}
                                    </button>
                                );
                            })}
                        </div>
                    </Fragment>
                );
            })}
        </div>
    );
}
