import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
    buildFbl5nDeployedSqlQueryDefinitions,
    loadFbl5nSqlQueryDefinitions
} from "../src/integrations/fbl5nSqlQueries.js";

const outputDirectory = fileURLToPath(
    new URL("../docs/implementation/sqlqueries/", import.meta.url)
);

mkdirSync(outputDirectory, { recursive: true });

const definitions = loadFbl5nSqlQueryDefinitions();

for (const definition of definitions) {
    writeFileSync(
        join(outputDirectory, `${definition.SqlCode}.sql`),
        `${definition.SqlText}\n`,
        "utf8"
    );
}

writeFileSync(
    join(outputDirectory, "definitions.json"),
    `${JSON.stringify(definitions, null, 2)}\n`,
    "utf8"
);

const deployedSourcePath = join(
    outputDirectory,
    "FBL5N_7_SQLQueries_ServiceLayer.json"
);
const deployedDefinitions = JSON.parse(readFileSync(deployedSourcePath, "utf8"));
const filteredDefinitions = buildFbl5nDeployedSqlQueryDefinitions(deployedDefinitions);

writeFileSync(
    join(outputDirectory, "FBL5N_7_SQLQueries_ServiceLayer_filtradas.json"),
    `${JSON.stringify(filteredDefinitions, null, 2)}\n`,
    "utf8"
);
