import styles from '../configLoader.module.css';

interface SchemaViewProps {
    schema: Record<string, unknown> | null;
}

export const SchemaView = ({ schema }: SchemaViewProps) => {
    return (
        <div className={`card mt-4 ${styles.configCard}`}>
            <div className={`card-header ${styles.bold}`}>
                Reference Schema
            </div>
            <div className={`scroll-y ${styles.schemaContainer}`}>
                {schema ? (
                    <pre className={styles.schemaPre}>{JSON.stringify(schema, null, 2)}</pre>
                ) : (
                    <div className="text-muted text-small italic">Fetch schema...</div>
                )}
            </div>
        </div>
    );
};
