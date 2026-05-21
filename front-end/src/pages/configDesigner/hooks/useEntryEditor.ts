import {useCallback, useEffect, useRef, startTransition, useState} from 'react';

interface ConfigManagerLike {
    getCategoryEntry(cat: string, id: string): Record<string, unknown> | undefined | null;
}

interface EntryEditorProps {
    category: string;
    configManager: ConfigManagerLike;
    handleCategorySwitch: (cat: string) => void;
    loadValues: (values: Record<string, unknown>) => void;
    initialCategory: string;
    focusId: string | null;
}

export function useEntryEditor({category, configManager, handleCategorySwitch, loadValues, initialCategory, focusId}: EntryEditorProps) {
    const [editingEntry, setEditingEntry] = useState<{category: string; id: string} | null>(null);
    const hasAutoLoaded = useRef(false);

    const handleLoadEntry = useCallback((cat: string, id: string) => {
        const entry = configManager.getCategoryEntry(cat, id);
        if (!entry) return;

        if (cat !== category) handleCategorySwitch(cat);

        loadValues(entry);
        setEditingEntry({category: cat, id});
    }, [category, configManager, handleCategorySwitch, loadValues]);

    const handleNewEntry = useCallback(() => {
        setEditingEntry(null);
        loadValues({});
    }, [loadValues]);

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
