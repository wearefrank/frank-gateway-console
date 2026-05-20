import {Document, LineCounter, parseDocument, type Node} from 'yaml';

export function parseYamlDoc(configText: string): { doc: Document; lineCounter: LineCounter } {
    const lineCounter = new LineCounter();
    const doc = parseDocument(configText, {lineCounter});
    return {doc, lineCounter};
}

export function resolvePathToNode(doc: Document, pathStr: string): Node | null {
    const parts: (string | number)[] = pathStr.split('/').filter(Boolean).map(p => {
        const num = parseInt(p, 10);
        return isNaN(num) ? p : num;
    });

    let trimmedParts = [...parts];
    let node = doc.getIn(trimmedParts, true) as Node;
    while ((!node || !node.range) && trimmedParts.length > 0) {
        trimmedParts = trimmedParts.slice(0, -1);
        node = doc.getIn(trimmedParts, true) as Node;
    }

    return node && node.range ? node : null;
}
