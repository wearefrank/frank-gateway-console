import {useState} from 'react';
import type {SchemaField} from '../../actions/SchemaFormGenerator';
import type {IdFieldSettings} from '../../components/SchemaFormRenderer/IdField/IdField';
import {type DesignerSettings, parsePlaceholders} from '../../hooks/useDesignerSettings';
import styles from './DesignerSettings.module.css';

interface DesignerSettingsProps {
    category: string;
    fields: SchemaField[];
    settings: DesignerSettings;
    onSettingsChange: (settings: DesignerSettings) => void;
}

export function DesignerSettings({category, fields, settings, onSettingsChange}: DesignerSettingsProps) {
    const [collapsed, setCollapsed] = useState(true);
    const [inputValue, setInputValue] = useState('');

    const priorityMap = settings.priorityMap;
    const currentList = priorityMap[category] ?? [];
    const availableFields = fields.map(f => f.name).filter(n => !currentList.includes(n));
    const listId = 'settings-priority-datalist';

    const trimmedInput = inputValue.trim();
    const isValidInput = trimmedInput.length > 0 && !currentList.includes(trimmedInput);

    function applyPriorityList(newList: string[]) {
        onSettingsChange({...settings, priorityMap: {...priorityMap, [category]: newList}});
    }

    function handleAdd() {
        if (!isValidInput) return;
        applyPriorityList(currentList.concat(trimmedInput));
        setInputValue('');
    }

    function handleRemove(fieldName: string) {
        applyPriorityList(currentList.filter(f => f !== fieldName));
    }

    function handleMoveUp(i: number) {
        if (i === 0) return;
        const newList = currentList.slice();
        [newList[i - 1], newList[i]] = [newList[i], newList[i - 1]];
        applyPriorityList(newList);
    }

    function handleMoveDown(i: number) {
        if (i === currentList.length - 1) return;
        const newList = currentList.slice();
        [newList[i], newList[i + 1]] = [newList[i + 1], newList[i]];
        applyPriorityList(newList);
    }

    return (
        <div className="card">
            <div className={`card-header ${styles.header}`} onClick={() => setCollapsed(c => !c)}>
                Settings
                <span className={styles.chevron}>{collapsed ? 'Open' : 'Close'}</span>
            </div>
            {!collapsed && (
                <div className={styles.body}>
                    <p className={styles.sectionLabel}>Pinned fields for <strong>{category}</strong></p>
                    <ul className={styles.priorityList}>
                        {currentList.length === 0 && (
                            <li className={styles.emptyState}>No pinned fields — add one below</li>
                        )}
                        {currentList.map((name, i) => (
                            <li key={name} className={styles.priorityItem}>
                                <span className={styles.fieldName}>{name}</span>
                                <div className={styles.itemActions}>
                                    <button type="button" disabled={i === 0}
                                            onClick={() => handleMoveUp(i)}>up</button>
                                    <button type="button" disabled={i === currentList.length - 1}
                                            onClick={() => handleMoveDown(i)}>down</button>
                                    <button type="button" className={styles.removeButton}
                                            onClick={() => handleRemove(name)}>x</button>
                                </div>
                            </li>
                        ))}
                    </ul>
                    <div className={styles.addRow}>
                        <input
                            type="text"
                            list={listId}
                            value={inputValue}
                            placeholder="Add a field..."
                            onChange={e => setInputValue(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleAdd()}
                        />
                        <datalist id={listId}>
                            {availableFields.map(f => <option key={f} value={f}/>)}
                        </datalist>
                        <button type="button" onClick={handleAdd} disabled={!isValidInput}>
                            Add
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

interface IdDesignerProps {
    category: string;
    idSettings: IdFieldSettings;
    onIdSettingsChange: (settings: IdFieldSettings) => void;
}

export function IdDesigner({ category, idSettings, onIdSettingsChange }: IdDesignerProps) {
    const [optionInput, setOptionInput] = useState<Record<string, string>>({});

    const template = idSettings.template ?? '';
    const placeHolderOptions = idSettings.placeHolderOptions ?? {};

    const uniquePlaceholders = parsePlaceholders(template);

    function addOption(name: string) {
        const value = (optionInput[name] ?? '').trim();
        const currentOptions = placeHolderOptions[name] ?? [];
        if (!value || currentOptions.includes(value)) return;
        onIdSettingsChange({
            ...idSettings,
            placeHolderOptions: { ...placeHolderOptions, [name]: [...currentOptions, value] }
        });
        setOptionInput({...optionInput, [name]: ''});
    }

    function removeOption(name: string, val: string) {
        const newOptions = { ...placeHolderOptions, [name]: (placeHolderOptions[name] ?? []).filter((o: string) => o !== val) };
        onIdSettingsChange({ ...idSettings, placeHolderOptions: newOptions });
    }

    return (
        <div>
            <p className={styles.sectionLabel} style={{ marginTop: '16px' }}>
                ID template for <strong>{category}</strong> - These settings only apply when domain is set to <strong>none</strong>
            </p>
            <div className={styles.addRow}>
                <label htmlFor="id-template-input">Template</label>
                <input
                    id="id-template-input"
                    type="text"
                    placeholder="e.g. {subdomain}-{service}-upstream"
                    value={template}
                    onChange={e => onIdSettingsChange({ ...idSettings, template: e.target.value })}
                />
            </div>

            {uniquePlaceholders.map(name => (
                <div key={name}>
                    <p className={styles.sectionLabel} style={{ marginTop: '12px' }}>
                        Options for <strong>{'{' + name + '}'}</strong>
                    </p>
                    <ul className={styles.priorityList}>
                        {(placeHolderOptions[name] ?? []).map((opt: string) => (
                            <li key={opt} className={styles.priorityItem}>
                                <span className={styles.fieldName}>{opt}</span>
                                <button type="button" className={styles.removeButton} onClick={() => removeOption(name, opt)}>x</button>
                            </li>
                        ))}
                    </ul>
                    <div className={styles.addRow}>
                        <input
                            type="text"
                            placeholder={`Add ${name} option...`}
                            value={optionInput[name] ?? ''}
                            onChange={e => setOptionInput(prev => ({ ...prev, [name]: e.target.value }))}
                            onKeyDown={e => e.key === 'Enter' && addOption(name)}
                        />
                        <button type="button" onClick={() => addOption(name)} disabled={!(optionInput[name] ?? '').trim()}>Add</button>
                    </div>
                </div>
            ))}
        </div>
    );
}
