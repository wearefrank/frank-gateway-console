import React, {useState, useMemo} from 'react';
import yaml from 'js-yaml';
import styles from './RouteDesigner.module.css';

// --- Types ---

interface UpstreamNode {
    host: string;
    port: number;
    weight: number;
}

interface RouteFormState {
    name: string;
    uri: string;
    methods: string[];
    host: string;
    remote_addr: string;
    upstream_type: 'roundrobin' | 'chash';
    upstream_nodes: UpstreamNode[];
}

// 2. The APISIX Config Structure (What the API/YAML expects)
interface ApisixRouteConfig {
    name?: string;
    uri: string;
    methods?: string[];
    host?: string;
    remote_addr?: string;
    upstream: {
        type: string;
        nodes: Record<string, number>; // "IP:Port": Weight
    };
}

export const RouteDesigner: React.FC = () => {

// Stores the list of routes you have already "Added"
    const [routeList, setRouteList] = useState<ApisixRouteConfig[]>([]);

    // Stores the current form state (the one you are editing right now)
    const [form, setForm] = useState<RouteFormState>({
        name: '',
        uri: '/',
        methods: ['GET'],
        host: '',
        remote_addr: '',
        upstream_type: 'roundrobin',
        upstream_nodes: [{ host: '127.0.0.1', port: 80, weight: 1 }]
    });

    // --- Logic ---

    const toggleMethod = (method: string) => {
        setForm(prev => {
            const exists = prev.methods.includes(method);
            const newMethods = exists
                ? prev.methods.filter(m => m !== method)
                : [...prev.methods, method];
            return { ...prev, methods: newMethods };
        });
    };

    const updateNode = (index: number, field: keyof UpstreamNode, value: string | number) => {
        const newNodes = [...form.upstream_nodes];
        newNodes[index] = { ...newNodes[index], [field]: value };
        setForm({ ...form, upstream_nodes: newNodes });
    };

    const addNode = () => {
        setForm({
            ...form,
            upstream_nodes: [...form.upstream_nodes, { host: '', port: 80, weight: 1 }]
        });
    };

    const removeNode = (index: number) => {
        setForm({
            ...form,
            upstream_nodes: form.upstream_nodes.filter((_, i) => i !== index)
        });
    };

    // Calculate the current config object from the form state
    const currentDraftConfig = useMemo((): ApisixRouteConfig => {
        const nodesObj: Record<string, number> = {};
        form.upstream_nodes.forEach(node => {
            if (node.host) {
                const key = `${node.host}:${node.port}`;
                nodesObj[key] = Number(node.weight);
            }
        });

        return {
            name: form.name || undefined,
            uri: form.uri,
            methods: form.methods.length > 0 ? form.methods : undefined,
            host: form.host || undefined,
            remote_addr: form.remote_addr || undefined,
            upstream: {
                type: form.upstream_type,
                nodes: nodesObj
            }
        };
    }, [form]);

    // Generate the YAML preview (Saved Routes + Current Draft)
    const fullYamlPreview = useMemo(() => {
        const allRoutes = [...routeList, currentDraftConfig];
        return yaml.dump({ routes: allRoutes }, { indent: 2, lineWidth: -1 });
    }, [routeList, currentDraftConfig]);

    const addConfigToList = () => {
        setRouteList(prev => [...prev, currentDraftConfig]);

        // Optional: Reset form for the next route
        setForm({
            name: '',
            uri: '/',
            methods: ['GET'],
            host: '',
            remote_addr: '',
            upstream_type: 'roundrobin',
            upstream_nodes: [{ host: '127.0.0.1', port: 80, weight: 1 }]
        });
    };

    return (
        <div className={styles['route-designer-container']}>

            {/* LEFT COLUMN: The Designer */}
            <div className={styles['designer-column']}>
                <div className={styles['header-container']}>
                    <h2>Route Designer</h2>
                    <p>Configure routing rules and backend targets.</p>
                </div>

                <Section title="1. Basic Info">
                    <div className={styles.grid2}>
                        <InputGroup label="Route Name" value={form.name} onChange={v => setForm({...form, name: v})} placeholder="e.g. User Service" />
                        <InputGroup label="URI Path (Required)" value={form.uri} onChange={v => setForm({...form, uri: v})} required />
                    </div>
                </Section>

                <Section title="2. Matching Rules">
                    <label className={styles.label}>HTTP Methods</label>
                    <div className={styles['methods-container']}>
                        {['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'].map(m => (
                            <div
                                key={m}
                                onClick={() => toggleMethod(m)}
                                className={`${styles.chip} ${form.methods.includes(m) ? styles.active : ''}`}
                            >
                                {m}
                            </div>
                        ))}
                    </div>

                    <div className={styles.grid2}>
                        <InputGroup label="Host Domain (Optional)"
                                    value={form.host}
                                    onChange={v => setForm({...form, host: v})}
                                    placeholder="api.example.com"
                        />

                        <InputGroup label="Client IP (Optional)"
                                    value={form.remote_addr}
                                    onChange={v => setForm({...form, remote_addr: v})}
                                    placeholder="192.168.1.0/24"
                        />
                    </div>
                </Section>

                <Section title="3. Upstream Targets">
                    <div className={styles['upstream-algo-container']}>
                        <label className={styles.label}>Load Balancing Algorithm</label>
                        <select
                            value={form.upstream_type}
                            onChange={e => setForm({...form, upstream_type: e.target.value as RouteFormState['upstream_type']})}
                            className={styles.input}
                        >
                            <option value="roundrobin">Round Robin</option>
                            <option value="chash">Consistent Hashing</option>
                        </select>
                    </div>

                    <table className={styles['upstream-table']}>
                        <thead>
                        <tr>
                            <th>Target Host / IP</th>
                            <th>Port</th>
                            <th>Weight</th>
                            <th className={styles['th-actions']}></th>
                        </tr>
                        </thead>
                        <tbody>
                        {form.upstream_nodes.map((node, i) => (
                            <tr key={i}>
                                <td>
                                    <input
                                        className={styles.input}
                                        value={node.host}
                                        onChange={e => updateNode(i, 'host', e.target.value)}
                                        placeholder="127.0.0.1"
                                    />
                                </td>
                                <td className={styles['td-port']}>
                                    <input
                                        type="number" className={styles.input}
                                        value={node.port}
                                        onChange={e => updateNode(i, 'port', Number(e.target.value))}
                                    />
                                </td>
                                <td className={styles['td-weight']}>
                                    <input
                                        type="number" className={styles.input}
                                        value={node.weight}
                                        onChange={e => updateNode(i, 'weight', Number(e.target.value))}
                                    />
                                </td>
                                <td>
                                    <button
                                        onClick={() => removeNode(i)}
                                        className={styles['remove-node-btn']}
                                    >
                                        &times;
                                    </button>
                                </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                    <button onClick={addNode} className={styles['add-node-btn']}>
                        + Add Target Node
                    </button>
                </Section>
            </div>

            {/* RIGHT COLUMN: The Preview */}
            <div className={styles['preview-column']}>
                <div className={styles['preview-card']}>
                    <div className={styles['preview-header']}>
                        <span>apisix.yaml Preview</span>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            {/* BUTTON 1: Calls addConfigToList */}
                            <button
                                className={styles['copy-btn']}
                                onClick={addConfigToList}
                                style={{ backgroundColor: 'var(--accent-color)', color: '#1a1a1a', border: 'none', fontWeight: 'bold' }}
                            >
                                + Add to List
                            </button>

                            {/* BUTTON 2: Copies fullYamlPreview */}
                            <button
                                className={styles['copy-btn']}
                                onClick={() => { navigator.clipboard.writeText(fullYamlPreview); alert('Copied!'); }}
                            >
                                Copy All
                            </button>
                        </div>
                    </div>

                    <div style={{ padding: '10px', background: '#374151', color: '#9ca3af', fontSize: '12px', borderBottom: '1px solid #4b5563' }}>
                        Routes Configured: {routeList.length} | Currently Editing: 1
                    </div>

                    {/* PREVIEW: Uses fullYamlPreview */}
                    <pre className={styles['preview-content']}>
                        {fullYamlPreview}
                    </pre>
                </div>
            </div>
        </div>
    );
};

// --- Reusable Sub-Components for cleanliness ---

const Section: React.FC<{title: string, children: React.ReactNode}> = ({ title, children }) => (
    <div className={styles.section}>
        <h3 className={styles['section-title']}>
            {title}
        </h3>
        {children}
    </div>
);

const InputGroup: React.FC<{ label: string, value: string, onChange: (val: string) => void, placeholder?: string, required?: boolean }> = ({ label, value, onChange, placeholder, required }) => (
    <div className={styles['input-group']}>
        <label className={styles.label}>
            {label} {required && <span className={styles.required}>*</span>}
        </label>
        <input
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            className={styles.input}
        />
    </div>
);