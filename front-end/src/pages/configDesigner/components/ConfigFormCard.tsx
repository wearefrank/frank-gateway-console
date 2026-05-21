import type {SchemaField} from '../../../actions/SchemaFormGenerator';
import type {ResolvedError} from '../../../actions/ErrorResolver';
import {SchemaFormRenderer} from '../../../components/SchemaFormRenderer/SchemaFormRenderer';
import {IdField} from '../../../components/SchemaFormRenderer/IdField/IdField';
import styles from '../ConfigDesigner.module.css';

interface ConfigFormCardProps {
    category: string;
    fields: SchemaField[];
    values: Record<string, unknown>;
    onChange: (name: string, value: unknown) => void;
    priorityList: string[];
    overrideSettings: Record<string, unknown>;
    editingEntry: {category: string; id: string} | null;
    allErrors: ResolvedError[];
    builtObject: Record<string, unknown>;
    search: string;
    onSearchChange: (value: string) => void;
    onAddToConfig: () => void;
    onSaveEdit: () => void;
    onNewEntry: () => void;
    confirmation: string;
}

export function ConfigFormCard({category, fields, values, onChange, priorityList, overrideSettings, editingEntry, allErrors, builtObject, search, onSearchChange, onAddToConfig, onSaveEdit, onNewEntry, confirmation}: ConfigFormCardProps) {

    const hasContent = Object.keys(builtObject).length > 0;

    return (
        <div className={`card ${styles.formCard}`}>
            <div className="card-header">
                <div className="flex align-center gap-sm">
                    {category} Configuration
                    {hasContent && (
                        <span className={allErrors.length > 0 ? styles.statusWarning : styles.statusValid}>
                            {allErrors.length > 0 ? 'Has errors' : 'Valid'}
                        </span>
                    )}
                </div>
                <div className={styles.headerActionRow}>
                    {editingEntry ? (
                        <>
                            <button
                                className={styles.addButton}
                                onClick={onSaveEdit}
                                disabled={allErrors.length > 0 || !hasContent}
                            >
                                Save Changes
                            </button>
                            <button className={styles.newButton} onClick={onNewEntry} type="button">
                                New
                            </button>
                        </>
                    ) : (
                        <button
                            className={styles.addButton}
                            onClick={onAddToConfig}
                            disabled={allErrors.length > 0 || !hasContent}
                        >
                            Add to Config
                        </button>
                    )}
                    {confirmation && <span className={styles.addedConfirmation}>{confirmation}</span>}
                </div>
                <input
                    type="search"
                    placeholder="search for a field"
                    onChange={e => onSearchChange(e.target.value)}
                    value={search}
                />
            </div>
            <form className={styles.routeForm} onSubmit={e => e.preventDefault()}>
                <SchemaFormRenderer
                    fields={fields}
                    values={values}
                    onChange={onChange}
                    searchTerm={search}
                    priorityList={priorityList}
                    overrides={{id: IdField}}
                    overrideSettings={overrideSettings}
                />
            </form>
        </div>
    );
}
