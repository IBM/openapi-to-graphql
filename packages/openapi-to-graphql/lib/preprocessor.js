"use strict";
// Copyright IBM Corp. 2018. All Rights Reserved.
// Node module: openapi-to-graphql
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT
Object.defineProperty(exports, "__esModule", { value: true });
// Imports:
const Oas3Tools = require("./oas_3_tools");
const deepEqual = require("deep-equal");
const debug_1 = require("debug");
const utils_1 = require("./utils");
const preprocessingLog = debug_1.default('preprocessing');
/**
 * Extract information from the OAS and put it inside a data structure that
 * is easier for OpenAPI-to-GraphQL to use
 */
function preprocessOas(oass, options) {
    const data = {
        usedOTNames: [
            'Query',
            'Mutation' // Used by OpenAPI-to-GraphQL for root-level element
        ],
        defs: [],
        operations: {},
        saneMap: {},
        security: {},
        options,
        oass
    };
    oass.forEach(oas => {
        // Store stats on OAS:
        data.options.report.numOps += Oas3Tools.countOperations(oas);
        data.options.report.numOpsMutation += Oas3Tools.countOperationsMutation(oas);
        data.options.report.numOpsQuery += Oas3Tools.countOperationsQuery(oas);
        // Get security schemes
        const currentSecurity = getProcessedSecuritySchemes(oas, data);
        const commonSecurityPropertyName = utils_1.getCommonPropertyNames(data.security, currentSecurity);
        commonSecurityPropertyName.forEach(propertyName => {
            utils_1.handleWarning({
                typeKey: 'DUPLICATE_SECURITY_SCHEME',
                message: `Multiple OASs share security schemes with the same name '${propertyName}'`,
                mitigationAddendum: `The security scheme from OAS ` +
                    `'${currentSecurity[propertyName].oas.info.title}' will be ignored`,
                data,
                log: preprocessingLog
            });
        });
        // Do not overwrite preexisting security schemes
        data.security = Object.assign({}, currentSecurity, data.security);
        // Process all operations
        for (let path in oas.paths) {
            for (let method in oas.paths[path]) {
                //  Only consider Operation Objects
                if (!Oas3Tools.isOperation(method)) {
                    continue;
                }
                const endpoint = oas.paths[path][method];
                const operationString = oass.length === 1
                    ? Oas3Tools.formatOperationString(method, path)
                    : Oas3Tools.formatOperationString(method, path, oas.info.title);
                // Determine description
                let description = endpoint.description;
                if ((typeof description !== 'string' || description === '') &&
                    typeof endpoint.summary === 'string') {
                    description = endpoint.summary;
                }
                if (typeof description !== 'string') {
                    description = 'No description available.';
                }
                if (data.options.equivalentToMessages) {
                    description += `\n\nEquivalent to ${operationString}`;
                }
                // Hold on to the operationId
                const operationId = typeof endpoint.operationId !== 'undefined'
                    ? endpoint.operationId
                    : Oas3Tools.generateOperationId(method, path);
                // Request schema
                const { payloadContentType, payloadSchema, payloadSchemaNames, payloadRequired } = Oas3Tools.getRequestSchemaAndNames(path, method, oas);
                const payloadDefinition = payloadSchema && typeof payloadSchema !== 'undefined'
                    ? createDataDef(payloadSchemaNames, payloadSchema, true, data, undefined, oas)
                    : undefined;
                // Response schema
                const { responseContentType, responseSchema, responseSchemaNames, statusCode } = Oas3Tools.getResponseSchemaAndNames(path, method, oas, data, options);
                if (!responseSchema || typeof responseSchema !== 'object') {
                    utils_1.handleWarning({
                        typeKey: 'MISSING_RESPONSE_SCHEMA',
                        message: `Operation ${operationString} has no (valid) response schema. ` +
                            `You can use the fillEmptyResponses option to create a ` +
                            `placeholder schema`,
                        data,
                        log: preprocessingLog
                    });
                    continue;
                }
                // Links
                const links = Oas3Tools.getEndpointLinks(path, method, oas, data);
                const responseDefinition = createDataDef(responseSchemaNames, responseSchema, false, data, links, oas);
                // Parameters
                const parameters = Oas3Tools.getParameters(path, method, oas);
                // Security protocols
                const securityRequirements = options.viewer
                    ? Oas3Tools.getSecurityRequirements(path, method, data.security, oas)
                    : [];
                // Servers
                const servers = Oas3Tools.getServers(path, method, oas);
                // Whether to place this operation into an authentication viewer
                const inViewer = securityRequirements.length > 0 && data.options.viewer !== false;
                const isMutation = method.toLowerCase() !== 'get';
                // Store determined information for operation
                const operation = {
                    operationId,
                    operationString,
                    description,
                    path,
                    method: method.toLowerCase(),
                    payloadContentType,
                    payloadDefinition,
                    payloadRequired,
                    responseContentType,
                    responseDefinition,
                    parameters,
                    securityRequirements,
                    servers,
                    inViewer,
                    isMutation,
                    statusCode,
                    oas
                };
                // Handle operationId property name collision
                // May occur if multiple OAS are provided
                if (operationId in data.operations) {
                    utils_1.handleWarning({
                        typeKey: 'DUPLICATE_OPERATIONID',
                        message: `Multiple OASs share operations with the same operationId '${operationId}'`,
                        mitigationAddendum: `The operation from the OAS '${operation.oas.info.title}' will be ignored`,
                        data,
                        log: preprocessingLog
                    });
                }
                else {
                    data.operations[operationId] = operation;
                }
            }
        }
    });
    return data;
}
exports.preprocessOas = preprocessOas;
/**
 * Extracts the security schemes from given OAS and organizes the information in
 * a data structure that is easier for OpenAPI-to-GraphQL to use
 *
 * Here is the structure of the data:
 * {
 *   {string} [sanitized name] { Contains information about the security protocol
 *     {string} rawName           Stores the raw security protocol name
 *     {object} def               Definition provided by OAS
 *     {object} parameters        Stores the names of the authentication credentials
 *                                  NOTE: Structure will depend on the type of the protocol
 *                                    (e.g. basic authentication, API key, etc.)
 *                                  NOTE: Mainly used for the AnyAuth viewers
 *     {object} schema            Stores the GraphQL schema to create the viewers
 *   }
 * }
 *
 * Here is an example:
 * {
 *   MyApiKey: {
 *     rawName: "My_api_key",
 *     def: { ... },
 *     parameters: {
 *       apiKey: MyKeyApiKey
 *     },
 *     schema: { ... }
 *   }
 *   MyBasicAuth: {
 *     rawName: "My_basic_auth",
 *     def: { ... },
 *     parameters: {
 *       username: MyBasicAuthUsername,
 *       password: MyBasicAuthPassword,
 *     },
 *     schema: { ... }
 *   }
 * }
 */
function getProcessedSecuritySchemes(oas, data) {
    const result = {};
    const security = Oas3Tools.getSecuritySchemes(oas);
    // Loop through all the security protocols
    for (let key in security) {
        const protocol = security[key];
        let schema;
        // Determine the parameters and the schema for the security protocol
        let parameters = {};
        let description;
        switch (protocol.type) {
            case 'apiKey':
                description = `API key credentials for the security protocol '${key}'`;
                if (data.oass.length > 1) {
                    description += ` in ${oas.info.title}`;
                }
                parameters = {
                    apiKey: Oas3Tools.sanitize(`${key}_apiKey`)
                };
                schema = {
                    type: 'object',
                    description,
                    properties: {
                        apiKey: {
                            type: 'string'
                        }
                    }
                };
                break;
            case 'http':
                switch (protocol.scheme) {
                    /**
                     * TODO: HTTP has a number of authentication types
                     *
                     * See http://www.iana.org/assignments/http-authschemes/http-authschemes.xhtml
                     */
                    case 'basic':
                        description = `Basic auth credentials for security protocol '${key}'`;
                        parameters = {
                            username: Oas3Tools.sanitize(`${key}_username`),
                            password: Oas3Tools.sanitize(`${key}_password`)
                        };
                        schema = {
                            type: 'object',
                            description,
                            properties: {
                                username: {
                                    type: 'string'
                                },
                                password: {
                                    type: 'string'
                                }
                            }
                        };
                        break;
                    default:
                        utils_1.handleWarning({
                            typeKey: 'UNSUPPORTED_HTTP_SECURITY_SCHEME',
                            message: `Currently unsupported HTTP authentication protocol ` +
                                `type 'http' and scheme '${protocol.scheme}' in OAS ` +
                                `'${oas.info.title}'`,
                            data,
                            log: preprocessingLog
                        });
                }
                break;
            // TODO: Implement
            case 'openIdConnect':
                utils_1.handleWarning({
                    typeKey: 'UNSUPPORTED_HTTP_SECURITY_SCHEME',
                    message: `Currently unsupported HTTP authentication protocol ` +
                        `type 'openIdConnect' in OAS '${oas.info.title}'`,
                    data,
                    log: preprocessingLog
                });
                break;
            case 'oauth2':
                utils_1.handleWarning({
                    typeKey: 'OAUTH_SECURITY_SCHEME',
                    message: `OAuth security scheme found in OAS '${oas.info.title}'. ` +
                        `OAuth support is provided using the 'tokenJSONpath' option`,
                    data,
                    log: preprocessingLog
                });
                // Continue because we do not want to create an oauth viewer
                continue;
            default:
                utils_1.handleWarning({
                    typeKey: 'UNSUPPORTED_HTTP_SECURITY_SCHEME',
                    message: `Unsupported HTTP authentication protocol` +
                        `type '${protocol.type}' in OAS '${oas.info.title}'`,
                    data,
                    log: preprocessingLog
                });
        }
        // Add protocol data to the output
        result[key] = {
            rawName: key,
            def: protocol,
            parameters,
            schema,
            oas
        };
    }
    return result;
}
/**
 * Method to either create a new or reuse an existing, centrally stored data
 * definition. Data definitions are objects that hold a schema (= JSON schema),
 * an otName (= String to use as the name for Object Types), and an iotName
 * (= String to use as the name for Input Object Types). Eventually, data
 * definitions also hold an ot (= the Object Type for the schema) and an iot
 * (= the Input Object Type for the schema).
 *
 * Either names or preferredName should exist.
 */
function createDataDef(names, schema, isInputObjectType, data, links, oas) {
    // Do a basic validation check
    if (!schema || typeof schema === 'undefined') {
        throw new Error(`Cannot create data definition for invalid schema ` +
            `'${JSON.stringify(schema)}'`);
    }
    const preferredName = getPreferredName(names);
    const saneLinks = {};
    if (typeof links === 'object') {
        Object.keys(links).forEach(linkKey => {
            saneLinks[Oas3Tools.sanitize(linkKey)] = links[linkKey];
        });
    }
    // Determine the index of possible existing data definition
    const index = getSchemaIndex(preferredName, schema, data.defs);
    if (index !== -1) {
        // Found existing data definition. Fetch it
        const existingDataDef = data.defs[index];
        /**
         * Collapse links if possible, i.e. if the current operation has links,
         * combine them with the prexisting ones
         */
        if (typeof saneLinks !== 'undefined') {
            if (typeof existingDataDef.links !== 'undefined') {
                // Check if there are any overlapping links
                Object.keys(existingDataDef.links).forEach(saneLinkKey => {
                    if (typeof saneLinks[saneLinkKey] !== 'undefined' &&
                        !deepEqual(existingDataDef.links[saneLinkKey], saneLinks[saneLinkKey])) {
                        utils_1.handleWarning({
                            typeKey: 'DUPLICATE_LINK_KEY',
                            message: `Multiple operations with the same response body share the same sanitized ` +
                                `link key '${saneLinkKey}' but have different link definitions ` +
                                `'${JSON.stringify(existingDataDef.links[saneLinkKey])}' and ` +
                                `'${JSON.stringify(saneLinks[saneLinkKey])}'.`,
                            data,
                            log: preprocessingLog
                        });
                    }
                });
                /**
                 * Collapse the links
                 *
                 * Avoid overwriting preexisting links
                 */
                existingDataDef.links = Object.assign({}, saneLinks, existingDataDef.links);
            }
            else {
                // No preexisting links, so simply assign the links
                existingDataDef.links = saneLinks;
            }
        }
        return existingDataDef;
    }
    else {
        // Else, define a new name, store the def, and return it
        const name = getSchemaName(data.usedOTNames, names);
        // Store and sanitize the name
        const saneName = Oas3Tools.capitalize(Oas3Tools.sanitizeAndStore(name, data.saneMap));
        const saneInputName = Oas3Tools.capitalize(saneName + 'Input');
        // Determine the type of the schema
        const type = Oas3Tools.getSchemaType(schema, data);
        if (type) {
            // Add the names to the master list
            data.usedOTNames.push(saneName);
            data.usedOTNames.push(saneInputName);
            const def = {
                preferredName,
                schema,
                type,
                subDefinitions: undefined,
                links: saneLinks,
                otName: saneName,
                iotName: saneInputName
            };
            // Add the def to the master list
            data.defs.push(def);
            // Break schema down into component parts
            // I.e. if it is an list type, create a reference to the list item type
            // Or if it is an object type, create references to all of the field types
            if (type === 'array' && typeof schema.items === 'object') {
                let itemsSchema = schema.items;
                let itemsName = `${name}ListItem`;
                if ('$ref' in itemsSchema) {
                    if (oas) {
                        itemsName = schema.items['$ref'].split('/').pop();
                        itemsSchema = Oas3Tools.resolveRef(itemsSchema['$ref'], oas);
                    }
                    else {
                        // TODO: Should this simply throw an error?
                        utils_1.handleWarning({
                            typeKey: 'UNRESOLVABLE_REFERENCE',
                            message: `A schema reference could not be resolved due to unknown OAS origin.`,
                            data,
                            log: preprocessingLog
                        });
                    }
                }
                const subDefinition = createDataDef({ fromRef: itemsName }, itemsSchema, isInputObjectType, data, undefined, oas);
                // Add list item reference
                def.subDefinitions = subDefinition;
            }
            else if (type === 'object') {
                def.subDefinitions = {};
                // Resolve allOf element in schema if applicable
                if ('allOf' in schema) {
                    schema.allOf.forEach((subSchema) => {
                        // Dereference subSchema
                        if ('$ref' in subSchema) {
                            if (oas) {
                                subSchema = Oas3Tools.resolveRef(subSchema['$ref'], oas);
                            }
                            else {
                                // TODO: Should this simply throw an error?
                                utils_1.handleWarning({
                                    typeKey: 'UNRESOLVABLE_REFERENCE',
                                    message: `A schema reference could not be resolved due to unknown OAS origin.`,
                                    data,
                                    log: preprocessingLog
                                });
                            }
                        }
                        for (let propertyKey in subSchema.properties) {
                            let propSchemaName = propertyKey;
                            let propSchema = subSchema.properties[propertyKey];
                            if ('$ref' in propSchema) {
                                if (oas) {
                                    propSchemaName = propSchema['$ref'].split('/').pop();
                                    propSchema = Oas3Tools.resolveRef(propSchema['$ref'], oas);
                                }
                                else {
                                    // TODO: Should this simply throw an error?
                                    utils_1.handleWarning({
                                        typeKey: 'UNRESOLVABLE_REFERENCE',
                                        message: `A schema reference could not be resolved due to unknown OAS origin.`,
                                        data,
                                        log: preprocessingLog
                                    });
                                }
                            }
                            const subDefinition = createDataDef({ fromRef: propSchemaName }, propSchema, isInputObjectType, data, undefined, oas);
                            // Add field type references
                            def.subDefinitions[propertyKey] = subDefinition;
                        }
                    });
                }
                else if ('anyOf' in schema) {
                    throw new Error(`OpenAPI-to-GraphQL currently cannot handle 'anyOf' keyword in '${JSON.stringify(schema)}'`);
                }
                else if ('oneOf' in schema) {
                    throw new Error(`OpenAPI-to-GraphQL currently cannot handle 'oneOf' keyword in '${JSON.stringify(schema)}'`);
                }
                else if ('not' in schema) {
                    throw new Error(`OpenAPI-to-GraphQL currently cannot handle 'not' keyword in '${JSON.stringify(schema)}'`);
                }
                // Regular object type
                for (let propertyKey in schema.properties) {
                    let propSchemaName = propertyKey;
                    let propSchema = schema.properties[propertyKey];
                    if ('$ref' in propSchema) {
                        if (oas) {
                            propSchemaName = propSchema['$ref'].split('/').pop();
                            propSchema = Oas3Tools.resolveRef(propSchema['$ref'], oas);
                        }
                        else {
                            // TODO: Should this simply throw an error?
                            utils_1.handleWarning({
                                typeKey: 'UNRESOLVABLE_REFERENCE',
                                message: `A schema reference could not be resolved due to unknown OAS origin.`,
                                data,
                                log: preprocessingLog
                            });
                        }
                    }
                    const subDefinition = createDataDef({ fromRef: propSchemaName }, propSchema, isInputObjectType, data, undefined, oas);
                    // Add field type references
                    def.subDefinitions[propertyKey] = subDefinition;
                }
            }
            return def;
        }
        else {
            throw new Error(`Cannot process schema '${JSON.stringify(schema)}'. Cannot identify type of schema.`);
        }
    }
}
exports.createDataDef = createDataDef;
/**
 * Returns the index of the data definition object in the given list that
 * contains the same schema and preferred name as the given one. Returns -1 if
 * that schema could not be found.
 */
function getSchemaIndex(preferredName, schema, dataDefs) {
    let index = -1;
    for (let def of dataDefs) {
        index++;
        if (preferredName === def.preferredName && deepEqual(schema, def.schema)) {
            return index;
        }
    }
    // If the schema could not be found in the master list
    return -1;
}
/**
 * Determines the preferred name to use for schema regardless of name collisions.
 *
 * In other words, determines the ideal name for a schema.
 *
 * Similar to getSchemaName() except it does not check if the name has already
 * been taken.
 */
function getPreferredName(names) {
    let schemaName;
    // CASE: preferred name already known
    if (typeof names.preferred === 'string') {
        schemaName = names.preferred;
        // CASE: name from reference
    }
    else if (typeof names.fromRef === 'string') {
        schemaName = names.fromRef;
        // CASE: name from schema (i.e., "title" property in schema)
    }
    else if (typeof names.fromSchema === 'string') {
        schemaName = names.fromSchema;
        // CASE: name from path
    }
    else if (typeof names.fromPath === 'string') {
        schemaName = names.fromPath;
        // CASE: placeholder name
    }
    else {
        schemaName = 'PlaceholderName';
    }
    return Oas3Tools.sanitize(schemaName);
}
/**
 * Determines name to use for schema from previously determined schemaNames and
 * considering not reusing existing names.
 */
function getSchemaName(usedNames, names) {
    if (!names || typeof names === 'undefined') {
        throw new Error(`Cannot create data definition without name(s).`);
        // Cannot create a schema name from only preferred name
    }
    else if (Object.keys(names).length === 1 &&
        typeof names.preferred === 'string') {
        throw new Error(`Cannot create data definition without name(s), excluding the preferred name.`);
    }
    let schemaName;
    // // CASE: preferred name already known
    // if (typeof names.preferred === 'string') {
    //   const saneName = Oas3Tools.capitalize(Oas3Tools.sanitize(names.preferred))
    //   if (!usedNames.includes(saneName)) {
    //     schemaName = names.preferred
    //   }
    // }
    // CASE: name from reference
    if (typeof names.fromRef === 'string') {
        const saneName = Oas3Tools.capitalize(Oas3Tools.sanitize(names.fromRef));
        if (!usedNames.includes(saneName)) {
            schemaName = names.fromRef;
        }
    }
    // CASE: name from schema (i.e., "title" property in schema)
    if (!schemaName && typeof names.fromSchema === 'string') {
        const saneName = Oas3Tools.capitalize(Oas3Tools.sanitize(names.fromSchema));
        if (!usedNames.includes(saneName)) {
            schemaName = names.fromSchema;
        }
    }
    // CASE: name from path
    if (!schemaName && typeof names.fromPath === 'string') {
        const saneName = Oas3Tools.capitalize(Oas3Tools.sanitize(names.fromPath));
        if (!usedNames.includes(saneName)) {
            schemaName = names.fromPath;
        }
    }
    // CASE: all names are already used - create approximate name
    if (!schemaName) {
        const tempName = Oas3Tools.capitalize(Oas3Tools.sanitize(typeof names.fromRef === 'string'
            ? names.fromRef
            : typeof names.fromSchema === 'string'
                ? names.fromSchema
                : typeof names.fromPath === 'string'
                    ? names.fromPath
                    : 'PlaceholderName'));
        let appendix = 2;
        /**
         * GraphQL Objects cannot share the name so if the name already exists in
         * the master list append an incremental number until the name does not
         * exist anymore.
         */
        while (usedNames.includes(`${tempName}${appendix}`)) {
            appendix++;
        }
        schemaName = `${tempName}${appendix}`;
    }
    return schemaName;
}
//# sourceMappingURL=preprocessor.js.map