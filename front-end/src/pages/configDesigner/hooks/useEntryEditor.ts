import {useCallback, useEffect, useRef, startTransition, useState} from 'react';
import {parseDocument, isSeq, isMap} from 'yaml';
import {getIdField} from '../../../config/categoryDefinitions';

type NodeWithRange = {range?: [number, number, number]};

// looks for a `# designer:domain: <name>` comment on the line immediately
// preceding the sequence item with the given id, returns the name or null
function extractDomainFromYaml(configText: string, seqKey: string, idKey: string, id: string): string | null {
    let doc;
    try { doc = parseDocument(configText); } catch { return null; }
    const seq = doc.getIn([seqKey], true);
    if (!isSeq(seq)) return null;

    const itemNode = seq.items.find(n => isMap(n) && n.get(idKey) === id);
    const itemRange = (itemNode as NodeWithRange | undefined)?.range;
    if (!itemRange) return null;

    const lineStart = configText.lastIndexOf('\n', itemRange[0] - 1) + 1;
    if (lineStart <= 0) return null;

    const prevLineEnd = lineStart - 1;
    if (prevLineEnd <= 0) return null;
    const prevLineStart = configText.lastIndexOf('\n', prevLineEnd - 1) + 1;
    const prevLine = configText.slice(prevLineStart, prevLineEnd).trim();

    const match = prevLine.match(/^#\s*designer:domain:\s*(.+)$/);
    return match ? match[1].trim() : null;
}

interface ConfigManagerLike {
    getCategoryEntry(cat: string, id: string): Record<string, unknown> | undefined | null;
}

interface EntryEditorProps {
    category: string;
    configManager: ConfigManagerLike;
    switchCategoryForLoad: (cat: string) => void;
    loadValues: (values: Record<string, unknown>) => void;
    initialCategory: string;
    focusId: string | null;
    configText?: string;
    onDomainDetected?: (domain: string | null) => void;
}

export function useEntryEditor({category, configManager, switchCategoryForLoad, loadValues, initialCategory, focusId, configText, onDomainDetected}: EntryEditorProps) {
    const [editingEntry, setEditingEntry] = useState<{category: string; id: string} | null>(null);
    const hasAutoLoaded = useRef(false);

    const handleLoadEntry = useCallback((cat: string, id: string) => {
        const entry = configManager.getCategoryEntry(cat, id);
        if (!entry) return;

        if (cat !== category) switchCategoryForLoad(cat);

        loadValues(entry);
        setEditingEntry({category: cat, id});

        if (configText && onDomainDetected) {
            const domain = extractDomainFromYaml(configText, cat + 's', getIdField(cat), id);
            onDomainDetected(domain);
        }
    }, [category, configManager, switchCategoryForLoad, loadValues, configText, onDomainDetected]);

    const handleNewEntry = useCallback(() => {
        setEditingEntry(null);
        loadValues({});
        onDomainDetected?.(null);
    }, [loadValues, onDomainDetected]);

    const clearEditingEntry = useCallback(() => {
        setEditingEntry(null);
    }, []);

    useEffect(() => {
        if (hasAutoLoaded.current || !configManager || !focusId) return;
        hasAutoLoaded.current = true;
        startTransition(() => handleLoadEntry(initialCategory, focusId));
    }, [configManager, focusId, handleLoadEntry, initialCategory]);

    return {editingEntry, handleLoadEntry, handleNewEntry, clearEditingEntry};
}
