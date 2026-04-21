import styles from './PillSelect.module.css';

interface PillOption {
    value: string;
    label: string;
}

interface PillSelectProps {
    label: string;
    options: PillOption[];
    value: string;
    onChange: (value: string) => void;
}

export const PillSelect = ({label, options, value, onChange}: PillSelectProps) => (
    <div className={styles.selectorGroup}>
        <span className={styles.selectorLabel}>{label}</span>
        <div className={styles.pillBar}>
            {options.map(opt => (
                <button key={opt.value} type="button"
                        className={`${styles.pill} ${value === opt.value ? styles.pillActive : ''}`}
                        onClick={() => onChange(opt.value)}>
                    {opt.label}
                </button>
            ))}
        </div>
    </div>
);
