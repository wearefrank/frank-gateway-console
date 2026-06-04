import {useCallback, useState} from 'react';
import type {ApisixConfig} from '../../../actions/SchemaValidation';
import { getIdField } from '../../../config/categoryDefinitions';
import {dump} from 'js-yaml';
import {parseDocument, isSeq, isMap} from 'yaml';

type NodeWithRange = {range?: [number, number, number]};

// given where a block sequence item's content starts (after the '- '),
// return the spaces that precede the '-' on that line
function getIndentStr(configText: string, contentStart: number): string {
    const lineStart = configText.lastIndexOf('\n', contentStart - 1) + 1;
    return ' '.repeat(Math.max(0, contentStart - lineStart - 2));
}

// serialize one item as a block sequence entry with the given indentation,
// optionally preceded by a designer domain comment on its own line
function serializeItem(item: Record<string, unknown>, indentStr: string, domain?: string): string {
    const raw = dump([item], {indent: 2, noRefs: true});
    const lines = raw.split('\n').map(line => line ? indentStr + line : line);
    if (domain) lines.unshift(indentStr + `# designer:domain: ${domain}`);
    return lines.join('\n');
}

// append a new item to an existing sequence in the YAML text without
// re-serializing the whole document (so comments elsewhere are untouched)
function appendItemToYaml(configText: string, key: string, item: Record<string, unknown>, domain?: string): string {
    const doc = parseDocument(configText);
    const seq = doc.getIn([key], true);

    // if the key doesn't exist yet or has no range, let the yaml library handle it -
    // there are no existing items so there are no comments to worry about
    if (!isSeq(seq) || !seq.range) {
        if (isSeq(seq)) {
            const newNode = doc.createNode(item);
            if (domain) newNode.commentBefore = ` designer:domain: ${domain}`;
            seq.add(newNode);
        } else {
            doc.set(key, doc.createNode([item]));
        }
        return doc.toString();
    }

    // match the indentation of the first existing item so the new one lines up
    const firstContentStart = (seq.items[0] as NodeWithRange | undefined)?.range?.[0];
    const indentStr = firstContentStart != null ? getIndentStr(configText, firstContentStart) : '  ';

    // insert the new item right after where the sequence ends in the source
    return configText.slice(0, seq.range[2])
        + serializeItem(item, indentStr, domain)
        + configText.slice(seq.range[2]);
}

// replace one item in a sequence by its id, splicing only those bytes so
// the rest of the file (comments, formatting) stays exactly as written
function replaceItemInYaml(configText: string, seqKey: string, idKey: string, id: string, item: Record<string, unknown>, domain?: string): string {
    const doc = parseDocument(configText);
    const seq = doc.getIn([seqKey], true);
    if (!isSeq(seq)) return configText;

    const itemNode = seq.items.find(n => isMap(n) && n.get(idKey) === id);
    const itemRange = (itemNode as NodeWithRange | undefined)?.range;

    // no range means we can't do a targeted splice - fall back to full re-serialize
    if (!itemRange) {
        const idx = seq.items.findIndex(n => isMap(n) && n.get(idKey) === id);
        if (idx !== -1) {
            const newNode = doc.createNode(item);
            if (domain) newNode.commentBefore = ` designer:domain: ${domain}`;
            seq.set(idx, newNode);
        }
        return doc.toString();
    }

    // walk back to the start of the '  - ' line
    const lineStart = configText.lastIndexOf('\n', itemRange[0] - 1) + 1;

    // if the preceding line is a designer domain comment, extend the replacement range to cover it
    let replaceFrom = lineStart;
    if (lineStart > 0) {
        const prevLineEnd = lineStart - 1;
        const prevLineStart = configText.lastIndexOf('\n', prevLineEnd - 1) + 1;
        const prevLine = configText.slice(prevLineStart, prevLineEnd).trim();
        if (/^#\s*designer:domain:/.test(prevLine)) replaceFrom = prevLineStart;
    }

    return configText.slice(0, replaceFrom)
        + serializeItem(item, getIndentStr(configText, itemRange[0]), domain)
        + configText.slice(itemRange[2]);
}

interface ConfigEditorProps {
    builtObject: Record<string, unknown>;
    category: string;
    config: ApisixConfig | null;
    configText: string;
    setConfig: (text: string) => void;
    editingEntry: {category: string; id: string} | null;
    onEditSaved: () => void;
    domain?: string;
}

export function useConfigEditor({builtObject, category, config, configText, setConfig, editingEntry, onEditSaved, domain}: ConfigEditorProps) {
    const [confirmation, setConfirmation] = useState('');

    const flash = useCallback((message: string) => {
        setConfirmation(message);
        setTimeout(() => setConfirmation(''), 2000);
    }, []);

    const handleAddToConfig = useCallback(() => {
        if (Object.keys(builtObject).length === 0) return;

        const key = category + 's';
        const existing = Array.isArray(config?.[key as keyof typeof config])
            ? [...(config[key as keyof typeof config] as unknown[])]
            : [];
        const newJson = {...(config ?? {}), [key]: [...existing, builtObject]} as ApisixConfig;
        const newText = configText
            ? appendItemToYaml(configText, key, builtObject, domain)
            : dump(newJson, {indent: 2, noRefs: true});

        setConfig(newText);
        flash('Added!');
    }, [builtObject, category, config, configText, setConfig, flash, domain]);

    const handleSaveEdit = useCallback(() => {
        if (!editingEntry || Object.keys(builtObject).length === 0) return;

        const categoryKey = (editingEntry.category + 's') as keyof ApisixConfig;
        const idKey = getIdField(editingEntry.category);
        const currentList = (config?.[categoryKey] as Record<string, unknown>[]) || [];
        const updatedList = currentList.map(item => item[idKey] === editingEntry.id ? builtObject : item);
        const newJson = {...config, [categoryKey]: updatedList} as ApisixConfig;
        const newText = configText
            ? replaceItemInYaml(configText, categoryKey as string, idKey, editingEntry.id, builtObject, domain)
            : dump(newJson, {indent: 2, noRefs: true});

        setConfig(newText);
        onEditSaved();
        flash('Saved!');
    }, [editingEntry, builtObject, config, configText, setConfig, onEditSaved, flash, domain]);

    return {handleAddToConfig, handleSaveEdit, confirmation};
}
