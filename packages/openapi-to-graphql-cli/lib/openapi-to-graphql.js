#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express = require("express");
const express_graphql_1 = require("express-graphql");
const cors = require("cors");
const path = require("path");
const request = require("request");
const fs = require("fs");
const yaml = require("js-yaml");
const graphql_1 = require("graphql");
const commander_1 = require("commander");
const openapi_to_graphql_1 = require("openapi-to-graphql");
const app = express();
const program = new commander_1.Command();
program
    .version(require('../package.json').version)
    .usage('<OAS JSON file path(s) and/or remote url(s)> [options]')
    .arguments('<path(s) and/or url(s)>')
    .option('-s, --strict', 'throw an error if OpenAPI-to-GraphQL cannot run without compensating for errors or missing data in the OAS')
    .option('--save <file path>', 'save schema to path and do not start server')
    // Resolver options
    .option('-p, --port <port>', 'select the port where the server will start', parseInt)
    .option('-u, --url <url>', 'select the base url which paths will be built on')
    .option('--cors', 'enable Cross-origin resource sharing (CORS)')
    // Schema options
    .option('-o, --operationIdFieldNames', 'create field names based on the operationId')
    .option('-f, --fillEmptyResponses', 'create placeholder schemas for operations with no response body rather than ignore them')
    .option('--addLimitArgument', 'add a limit argument on fields returning lists of objects/lists to control the data size')
    .option('--genericPayloadArgName', "Sets argument name for the payload of a mutation to 'requestBody'")
    .option('--simpleNames', 'Only remove illegal characters from names in the OAS and ignore casing and formatting')
    .option('--simpleEnumValues', 'Only remove illegal characters from enum values in the OAS and ignore casing and formatting')
    .option('--singularNames', 'Experimental feature that will create more meaningful names from the operation path')
    // Resolver options
    .option('-H, --header <key:value>', 'add headers to every request; repeatable flag; set using key:value notation', collect, [])
    .option('-Q, --queryString <key:value>', 'add query parameters to every request; repeatable flag; set using key:value notation', collect, [])
    // Authentication options
    .option('--no-viewer', 'do not create GraphQL viewer objects for passing authentication credentials')
    // Logging options
    .option('--no-extensions', 'do not add extentions, containing information about failed REST calls, to the GraphQL errors objects')
    .option('--no-equivalentToMessages', 'do not append information about the underlying REST operations to the description of fields')
    .parse(process.argv);
// Select the port on which to host the GraphQL server
const portNumber = program.port ? program.port : 3000;
/**
 * Assemble headers so that they are in the proper format for the
 * OpenAPI-to-GraphQL library
 */
const headers = parseKeyValuePairs(program.header);
const qs = parseKeyValuePairs(program.queryString);
const options = {
    strict: program.strict,
    // Resolver options
    baseUrl: program.url,
    // Schema options
    operationIdFieldNames: program.operationIdFieldNames,
    fillEmptyResponses: program.fillEmptyResponses,
    addLimitArgument: program.addLimitArgument,
    genericPayloadArgName: program.genericPayloadArgName,
    simpleNames: program.simpleNames,
    simpleEnumValues: program.simpleEnumValues,
    singularNames: program.singularNames,
    // Resolver options
    headers,
    qs,
    // Authentication options
    viewer: program.viewer,
    // Logging options
    provideErrorExtensions: program.extensions,
    equivalentToMessages: program.equivalentToMessages
};
const filePaths = program.args;
if (typeof filePaths === 'undefined' || filePaths.length === 0) {
    console.error('No path(s) provided');
    console.error('Please refer to the help manual (openapi-to-graphql -h) for more information');
    process.exit(1);
}
// Load the OASs based off of the provided paths
Promise.all(filePaths.map((filePath) => {
    return new Promise((resolve, reject) => {
        // Check if the file exists
        if (fs.existsSync(path.resolve(filePath))) {
            try {
                resolve(readFile(path.resolve(filePath)));
            }
            catch (error) {
                reject(error);
            }
            // Check if file is in a remote location
        }
        else if (filePath.match(/^https?/g)) {
            getRemoteFileSpec(filePath)
                .then((remoteContent) => {
                resolve(remoteContent);
            })
                .catch((error) => {
                reject(error);
            });
            // Cannot determine location of file
        }
        else {
            reject(`File path '${filePath}' is invalid`);
        }
    });
}))
    .then((oass) => {
    startGraphQLServer(oass, options, portNumber);
})
    .catch((error) => {
    console.error(error);
    process.exit(1);
});
/**
 * For list arguments, collect all values and store them in a list
 *
 * @param value the current value
 * @param previous the store of all values
 */
function collect(value, previous) {
    return previous.concat([value]);
}
/**
 * Returns content of read JSON/YAML file.
 *
 * @param  {string} path Path to file to read
 * @return {object}      Content of read file
 */
function readFile(path) {
    if (/json$/.test(path)) {
        return JSON.parse(fs.readFileSync(path, 'utf8'));
    }
    else if (/yaml$/.test(path) || /yml$/.test(path)) {
        return yaml.safeLoad(fs.readFileSync(path, 'utf8'));
    }
    else {
        throw new Error(`Failed to parse JSON/YAML. Ensure file '${path}' has ` +
            `the correct extension (i.e. '.json', '.yaml', or '.yml).`);
    }
}
/**
 * reads a remote file content using http protocol
 * @param {string} url specifies a valid URL path including the port number
 */
function getRemoteFileSpec(uri) {
    return new Promise((resolve, reject) => {
        request({
            uri
        }, (err, res, body) => {
            if (err) {
                reject(err);
            }
            else if (res.statusCode < 200 && res.statusCode <= 300) {
                reject(new Error(`Could not retrieve file. Received unsuccessful status code '${res.statusCode}.`));
            }
            else {
                if (typeof body === 'string') {
                    try {
                        resolve(JSON.parse(body));
                    }
                    catch (e) {
                        try {
                            resolve(yaml.safeLoad(body));
                        }
                        catch (f) {
                            console.error(`JSON parse error: ${e}\nYAML parse error: ${f}`);
                        }
                    }
                }
                reject(new Error(`Cannot parse remote file`));
            }
        });
    });
}
/**
 * generates a GraphQL schema and starts the GraphQL server on the specified port
 * @param {object} oas the OAS specification file
 * @param {number} port the port number to listen on on this server
 */
function startGraphQLServer(oas, options, port) {
    // Create GraphQL interface
    openapi_to_graphql_1.createGraphQLSchema(oas, options)
        .then(({ schema, report }) => {
        console.log(JSON.stringify(report, null, 2));
        // Save local file if required
        if (program.save) {
            writeSchema(schema);
        }
        else {
            // Enable CORS
            if (program.cors) {
                app.use(cors());
            }
            // Mounting graphql endpoint using the middleware express-graphql
            app.use('/graphql', express_graphql_1.graphqlHTTP({
                schema: schema,
                graphiql: true
            }));
            // Initiating the server on the port specified by user or the default one
            app.listen(port, () => {
                console.log(`GraphQL accessible at: http://localhost:${port}/graphql`);
            });
        }
    })
        .catch((err) => {
        console.log('OpenAPI-to-GraphQL creation event error:', err.message);
    });
}
/**
 * saves a grahpQL schema generated by OpenAPI-to-GraphQL to a file
 * @param {createGraphQLSchema} schema
 */
function writeSchema(schema) {
    fs.writeFile(program.save, graphql_1.printSchema(schema), (err) => {
        if (err)
            throw err;
        console.log(`OpenAPI-to-GraphQL successfully saved your schema at ${program.save}`);
    });
}
/**
 * Parse key value pairs in the form `key:string`
 *
 * @param keyValues Raw unparsed key value pairs from the CLI
 */
function parseKeyValuePairs(keyValues) {
    const parsedKeyValues = {};
    if (Array.isArray(keyValues)) {
        ;
        keyValues.forEach((keyValue) => {
            const separator = keyValue.indexOf(':');
            if (separator === -1) {
                console.warn(`The key value pair '${keyValue}' does not have a ':' separating ` +
                    `the key from the value. It will be ignored.`);
            }
            else {
                const key = keyValue.substr(0, separator);
                // Trim, may have leading white space
                const value = keyValue.substr(separator + 1).trim();
                if (key in parsedKeyValues) {
                    console.warn(`Multiple key value pairs have the same key '${key}'. ` +
                        `The key value pair '${keyValue}' will be ignored.`);
                }
                else {
                    parsedKeyValues[key] = value;
                }
            }
        });
    }
    return parsedKeyValues;
}
//# sourceMappingURL=openapi-to-graphql.js.map