import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function canonical(value) {
    if (Array.isArray(value)) {
        return value.map(canonical);
    }

    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value)
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([key, item]) => [key, canonical(item)])
        );
    }

    return value;
}

function countRows(rows) {
    const counts = new Map();

    for (const row of rows) {
        const key = JSON.stringify(canonical(row));
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    return counts;
}

function compareRecordSets(original, optimized) {
    const originalCounts = countRows(original);
    const optimizedCounts = countRows(optimized);
    let missing = 0;
    let additional = 0;

    for (const [key, count] of originalCounts) {
        missing += Math.max(0, count - (optimizedCounts.get(key) ?? 0));
    }

    for (const [key, count] of optimizedCounts) {
        additional += Math.max(0, count - (originalCounts.get(key) ?? 0));
    }

    return {
        originalCount: original.length,
        optimizedCount: optimized.length,
        missing,
        additional,
        equivalent: missing === 0 && additional === 0
    };
}

function readRows(path) {
    const value = JSON.parse(readFileSync(path, "utf8"));
    const rows = Array.isArray(value) ? value : value?.data;

    if (!Array.isArray(rows)) {
        throw new TypeError("O arquivo deve conter um array ou um objeto com data em array.");
    }

    return rows;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    const [originalPath, optimizedPath] = process.argv.slice(2);

    if (!originalPath || !optimizedPath) {
        throw new Error("Informe os caminhos dos resultados original e otimizado.");
    }

    const result = compareRecordSets(readRows(originalPath), readRows(optimizedPath));
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exitCode = result.equivalent ? 0 : 1;
}

export { compareRecordSets };
