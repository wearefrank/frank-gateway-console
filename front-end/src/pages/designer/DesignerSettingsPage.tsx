import {useState} from 'react';
import {Link} from 'react-router-dom';
import {useDesignerSettings, type DomainConfig} from '../../hooks/useDesignerSettings';
import type {IdFieldSettings} from '../../components/SchemaFormRenderer/IdField/IdField';
import {IdDesigner} from './DesignerSettings';
import styles from './DesignerSettingsPage.module.css';
import dsStyles from './DesignerSettings.module.css';

const CATEGORIES = ['route', 'upstream', 'service', 'consumer', 'global_rule', 'ssl', 'plugin_config'] as const;

export function DesignerSettingsPage() {
    const [settings, setSettings] = useDesignerSettings();
    const [category, setCategory] = useState<string>('route');

    const idSettings = (settings.getMergedOverrides(category)['id'] ?? {}) as IdFieldSettings;
    const template = idSettings.template ?? '';
    const placeholderNames = [...new Set([...template.matchAll(/\{([^}]+)}/g)].map(m => m[1]))];

    return (
        <div className="container">
            <div className={styles.pageHeader}>
                <Link to="/designer" className={styles.backLink}>Back to Designer</Link>
                <h2>Designer Settings</h2>
            </div>

            {/* Domain Configuration*/}
            <div className={`card ${styles.section}`}>
                <div className="card-header">Domain Configuration</div>
                <div className={styles.sectionBody}>
                    {placeholderNames.length === 0 && (
                        <p className={dsStyles.sectionLabel}>
                            Set an ID template below first, placeholders like <code>{'{subdomain}'}</code> will appear
                            here.
                        </p>
                    )}
                    <DomainManager
                        domains={settings.getDomains()}
                        placeholderNames={placeholderNames}
                        onDomainsChange={domains => setSettings(settings.withDomains(domains))}
                    />
                </div>
            </div>

            {/* Per-category settings */}
            <div className={`card ${styles.section}`}>
                <div className="card-header">Category Settings</div>
                <div className={styles.categoryPillBar}>
                    {CATEGORIES.map(c => (
                        <button key={c} type="button"
                                className={`${styles.pill} ${category === c ? styles.pillActive : ''}`}
                                onClick={() => setCategory(c)}>
                            {/* replace underscore with spaces */}
                            {c.replace(/_/g, ' ')}
                        </button>
                    ))}
                </div>
                <div className={styles.sectionBody}>
                    <IdDesigner
                        category={category}
                        idSettings={idSettings}
                        onIdSettingsChange={s => setSettings(settings.withCategoryOverride(category, 'id', s))}
                    />
                </div>
            </div>
        </div>
    );
}

interface DomainManagerProps {
    domains: DomainConfig[];
    placeholderNames: string[];
    onDomainsChange: (domains: DomainConfig[]) => void;
}

function DomainManager({domains, placeholderNames, onDomainsChange}: DomainManagerProps) {
    const [nameInput, setNameInput] = useState('');
    const [valueInputs, setValueInputs] = useState<Record<string, Record<string, string>>>({});
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    function toggleExpanded(name: string) {
        setExpanded(prev => {
            const next = new Set(prev);
            next.has(name) ? next.delete(name) : next.add(name);
            return next;
        });
    }

    const isDuplicate = domains.some(d => d.name === nameInput.trim());
    const canAdd = nameInput.trim().length > 0 && !isDuplicate;

    function addDomain() {
        if (!canAdd) return;
        const name = nameInput.trim();
        onDomainsChange([...domains, {name, placeholders: {}}]);
        setExpanded(prev => new Set([...prev, name]));
        setNameInput('');
    }

    function removeDomain(name: string) {
        onDomainsChange(domains.filter(d => d.name !== name));
    }

    function addValue(domainName: string, placeholder: string) {
        const newValue = (valueInputs[domainName]?.[placeholder] ?? '').trim();
        if (!newValue) return;

        onDomainsChange(domains.map(domain => {
            // don't add double's (same for check below)
            if (domain.name !== domainName) return domain;

            const currentValues = domain.placeholders[placeholder] ?? [];
            if (currentValues.includes(newValue)) return domain;

            return {...domain, placeholders: {...domain.placeholders, [placeholder]: [...currentValues, newValue]}};
        }));

        setValueInputs(prev => ({
            ...prev,
            [domainName]: {...(prev[domainName] ?? {}), [placeholder]: ''}
        }));
    }

    function removeValue(domainName: string, placeholder: string, val: string) {
        onDomainsChange(domains.map(domain => domain.name !== domainName ? domain : {
            ...domain,
            placeholders: {
                ...domain.placeholders,
                [placeholder]: (domain.placeholders[placeholder] ?? []).filter(v => v !== val)
            }
        }));
    }

    return (
        <div>
            {/* Bottom row to add a brand new domain to the list */}
            <div className={`${dsStyles.addRow} ${styles.addDomainRow}`}>
                <input
                    type="text"
                    value={nameInput}
                    placeholder="e.g. sector name"
                    onChange={e => setNameInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addDomain()}
                />
                <button type="button" disabled={!canAdd} onClick={addDomain}>Add domain</button>
            </div>
            <ul className={styles.domainList}>
                {domains.length === 0 && (
                    <li className={`${dsStyles.emptyState} ${styles.domainListEmpty}`}>No domains - add one above</li>
                )}
                {domains.map(domain => {
                    const isExpanded = expanded.has(domain.name);
                    return (
                    <li key={domain.name} className={styles.domainCard}>
                        <div className={styles.domainCardHeader} onClick={() => toggleExpanded(domain.name)}>
                            <span className={dsStyles.fieldName}>{domain.name}</span>
                            <div className={styles.domainCardHeaderActions}>
                                <span className={styles.chevron}>{isExpanded ? '▲' : '▼'}</span>
                                <button type="button" className={dsStyles.removeButton}
                                        onClick={e => { e.stopPropagation(); removeDomain(domain.name); }}>x
                                </button>
                            </div>
                        </div>
                        {isExpanded && placeholderNames.length > 0 && (
                            <div className={styles.placeholderSections}>
                                {/* Generate the placeholder cards */}
                                {placeholderNames.map(placeholder => {
                                    const values = domain.placeholders[placeholder] ?? [];
                                    const inputVal = valueInputs[domain.name]?.[placeholder] ?? '';
                                    const canAddVal = inputVal.trim().length > 0 && !values.includes(inputVal.trim());
                                    return (
                                        <div key={placeholder} className={styles.placeholderSection}>
                                            <p className={styles.placeholderLabel}>{'{' + placeholder + '}'}</p>
                                            {/* render the tags/chips for existing values */}
                                            <div className={styles.chipRow}>
                                                {values.length === 0 && (
                                                    <span className={dsStyles.emptyState}>none - open input</span>
                                                )}
                                                {values.map(v => (
                                                    <span key={v} className={styles.chip}>
                                                        {v}
                                                        <button type="button"
                                                                onClick={() => removeValue(domain.name, placeholder, v)}>x</button>
                                                    </span>
                                                ))}
                                            </div>
                                            {/* Input for adding new values to this specific placeholder */}
                                            <div className={dsStyles.addRow}>
                                                <input
                                                    type="text"
                                                    placeholder={`Add ${placeholder} value…`}
                                                    value={inputVal}
                                                    onChange={e => setValueInputs(prev => ({
                                                        ...prev,
                                                        [domain.name]: {
                                                            ...(prev[domain.name] ?? {}),
                                                            [placeholder]: e.target.value
                                                        }
                                                    }))}
                                                    onKeyDown={e => e.key === 'Enter' && addValue(domain.name, placeholder)}
                                                />
                                                <button type="button" disabled={!canAddVal}
                                                        onClick={() => addValue(domain.name, placeholder)}>Add
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </li>
                    );
                })}
            </ul>
        </div>
    );
}
