import React from 'react';
import { useFetch } from '../../hooks/useFetch';
import { Link } from 'react-router-dom';
import styles from './SchemaPage.module.css';

export const SchemaPage: React.FC = () => {
    const { data, loading, error } = useFetch<any>('/schema/route');

    return (
        <div className="container">
            <div className="mb-4">
                <Link to="/" className={styles.backLink}>Back to Home</Link>
                <h1>APISIX Route Schema</h1>
            </div>

            {loading && <p>Loading schema...</p>}
            {error && <div className={`card text-error ${styles.errorCard}`}>
                <strong>Error:</strong> {error}
            </div>}

            {data && (
                <div className={`mt-4 ${styles.schemaSection}`}>
                    <h3>Schema Definition</h3>
                    <pre className={`card scroll-y ${styles.schemaPre}`}>
                        {JSON.stringify(data, null, 2)}
                    </pre>
                </div>
            )}
        </div>
    );
};
