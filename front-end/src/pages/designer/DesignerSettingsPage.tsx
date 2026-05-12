import {useState} from 'react';
import {Link} from 'react-router-dom';
import {useDesignerSettings, getMergedOverrides, withCategoryOverride, parsePlaceholders, type DomainConfig} from '../../hooks/useDesignerSettings';
import type {IdFieldSettings} from '../../components/SchemaFormRenderer/IdField/IdField';
import {IdDesigner} from './DesignerSettings';
import {DESIGNER_CATEGORIES} from './RouteDesigner';
import styles from './DesignerSettingsPage.module.css';
import dsStyles from './DesignerSettings.module.css';

export function DesignerSettingsPage() {
    const [settings, setSettings] = useDesignerSettings();
    const [category, setCategory] = useState('route');

    const idSettings = (getMergedOverrides(settings, category).id ?? {}) as IdFieldSettings;
    const template = idSettings.template ?? '';
    const placeholderNames = parsePlaceholders(template);

    return (
        <div className="container">
            <div className={styles.pageHeader}>
                <Link to="/designer" className={styles.backLink}>Back to Designer</Link>
                <h2>Designer Settings</h2>
            </div>

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
                        domains={settings.domains}
                        placeholderNames={placeholderNames}
                        onDomainsChange={domains => setSettings({...settings, domains})}
                    />
                </div>
            </div>

            <div className={`card ${styles.section}`}>
                <div className="card-header">Category Settings</div>
                <div className={styles.categoryPillBar}>
                    {DESIGNER_CATEGORIES.map(c => (
                        <button key={c} type="button"
                                className={`${styles.pill} ${category === c ? styles.pillActive : ''}`}
                                onClick={() => setCategory(c)}>
                            {c.replace(/_/g, ' ')}
                        </button>
                    ))}
                </div>
                <div className={styles.sectionBody}>
                    <IdDesigner
                        category={category}
                        idSettings={idSettings}
                        onIdSettingsChange={s => setSettings(withCategoryOverride(settings, category, 'id', s))}
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
        const next = new Set(expanded);
        if (next.has(name)) {
            next.delete(name);
        } else {
            next.add(name);
        }
        setExpanded(next);
    }

    function addDomain() {
        const name = nameInput.trim();
        if (!name || domains.some(d => d.name === name)) return;
        onDomainsChange([...domains, {name, placeholders: {}}]);
        setExpanded(new Set([...expanded, name]));
        setNameInput('');
    }

    function removeDomain(name: string) {
        onDomainsChange(domains.filter(d => d.name !== name));
    }

    function addValue(domainName: string, placeholder: string) {
        const newValue = (valueInputs[domainName]?.[placeholder] ?? '').trim();
        if (!newValue) return;

        onDomainsChange(domains.map(domain => {
            if (domain.name !== domainName) return domain;
            const current = domain.placeholders[placeholder] ?? [];
            if (current.includes(newValue)) return domain;
            return {...domain, placeholders: {...domain.placeholders, [placeholder]: [...current, newValue]}};
        }));

        setValueInputs({...valueInputs, [domainName]: {...(valueInputs[domainName] ?? {}), [placeholder]: ''}});
    }

    function removeValue(domainName: string, placeholder: string, val: string) {
        onDomainsChange(domains.map(domain => {
            if (domain.name !== domainName) return domain;
            const filtered = domain.placeholders[placeholder].filter(v => v !== val);
            return {...domain, placeholders: {...domain.placeholders, [placeholder]: filtered}};
        }));
    }

    return (
        <div>
            <div className={`${dsStyles.addRow} ${styles.addDomainRow}`}>
                <input
                    type="text"
                    value={nameInput}
                    placeholder="e.g. sector name"
                    onChange={e => setNameInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addDomain()}
                />
                <button type="button" onClick={addDomain}
                        disabled={!nameInput.trim() || domains.some(d => d.name === nameInput.trim())}>
                    Add domain
                </button>
            </div>
            <ul className={styles.domainList}>
                {domains.length === 0 && (
                    <li className={`${dsStyles.emptyState} ${styles.domainListEmpty}`}>No domains - add one above</li>
                )}
                {domains.map(domain => (
                    <li key={domain.name} className={styles.domainCard}>
                        <div className={styles.domainCardHeader} onClick={() => toggleExpanded(domain.name)}>
                            <span className={dsStyles.fieldName}>{domain.name}</span>
                            <div className={styles.domainCardHeaderActions}>
                                <span className={styles.chevron}>{expanded.has(domain.name) ? '▲' : '▼'}</span>
                                <button type="button" className={dsStyles.removeButton}
                                        onClick={e => { e.stopPropagation(); removeDomain(domain.name); }}>x
                                </button>
                            </div>
                        </div>
                        {expanded.has(domain.name) && placeholderNames.length > 0 && (
                            <div className={styles.placeholderSections}>
                                {placeholderNames.map(placeholder => {
                                    const values = domain.placeholders[placeholder] ?? [];
                                    const inputVal = valueInputs[domain.name]?.[placeholder] ?? '';
                                    return (
                                        <div key={placeholder} className={styles.placeholderSection}>
                                            <p className={styles.placeholderLabel}>{'{' + placeholder + '}'}</p>
                                            <div className={styles.chipRow}>
                                                {values.length === 0 && <span className={dsStyles.emptyState}>none</span>}
                                                {values.map(v => (
                                                    <span key={v} className={styles.chip}>
                                                        {v}
                                                        <button type="button"
                                                                onClick={() => removeValue(domain.name, placeholder, v)}>x</button>
                                                    </span>
                                                ))}
                                            </div>
                                            <div className={dsStyles.addRow}>
                                                <input
                                                    type="text"
                                                    placeholder={`Add ${placeholder} value…`}
                                                    value={inputVal}
                                                    onChange={e => setValueInputs({
                                                        ...valueInputs,
                                                        [domain.name]: {...(valueInputs[domain.name] ?? {}), [placeholder]: e.target.value}
                                                    })}
                                                    onKeyDown={e => e.key === 'Enter' && addValue(domain.name, placeholder)}
                                                />
                                                <button type="button" disabled={!inputVal.trim()}
                                                        onClick={() => addValue(domain.name, placeholder)}>Add
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
}
