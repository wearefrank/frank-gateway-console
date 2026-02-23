import React from 'react';
import { useFetch } from '../../hooks/useFetch';
import { Link } from 'react-router-dom';

export const SchemaPage: React.FC = () => {
    const { data, loading, error } = useFetch<any>('/schema/route');

    return (
        <div className="container">
            <div className="mb-4">
                <Link to="/" style={{ marginRight: '15px' }}>Back to Home</Link>
                <h1>APISIX Route Schema</h1>
            </div>

            {loading && <p>Loading schema...</p>}
            {error && <div className="card text-error" style={{ borderColor: 'var(--error-color)' }}>
                <strong>Error:</strong> {error}
            </div>}

            {data && (
                <div className="mt-4" style={{ marginTop: '20px' }}>
                    <h3>Schema Definition</h3>
                    <pre className="card scroll-y" style={{
                        padding: '15px',
                        textAlign: 'left',
                        fontSize: '14px',
                        lineHeight: '1.4',
                        maxHeight: '70vh'
                    }}>
                        {JSON.stringify(data, null, 2)}
                    </pre>
                </div>
            )}
        </div>
    );
};
