import styles from '../YamlEditor.module.css';

interface LoaderHeaderProps {
    schema: Record<string, unknown> | null;
    loading: boolean;
    onFetch: () => void;
}

export const LoaderHeader = ({ schema, loading, onFetch }: LoaderHeaderProps) => {
    return (
        <div className={`flex justify-between align-center mb-4 pb-3 ${styles.loaderHeader}`}>
            <div>
                <h2 className="mb-1">YAML Editor</h2>
            </div>
            <div className="flex align-center gap-md">
                <div className={`${schema ? "text-success" : "text-muted"} text-small ${styles.schemaStatus}`}>
                    {schema ? 'Schema Active' : 'Schema Missing'}
                </div>
                <button
                    onClick={onFetch}
                    disabled={loading}
                    className={loading ? "" : "btn-primary"}
                >
                    {loading ? 'Fetching...' : 'Fetch Schema'}
                </button>
            </div>
        </div>
    );
};
