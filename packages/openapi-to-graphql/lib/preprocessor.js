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
        data.security = Object.assign(Object.assign({}, currentSecurity), data.security);
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
                console.log(operationString);
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
 * an otName (= String to use as the name for object types), and an iotName
 * (= String to use as the name for input object types). Eventually, data
 * definitions also hold an ot (= the object type for the schema) and an iot
 * (= the input object type for the schema).
 *
 * Either names or preferredName should exist.
 */
function createDataDef(names, schema, isInputObjectType, data, links, oas) {
    // Do a basic validation check
    if (!schema || typeof schema === 'undefined') {
        throw new Error(`Cannot create data definition for invalid schema ` +
            `'${JSON.stringify(schema)}'`);
    }
    if ('$ref' in schema) {
        schema = Oas3Tools.resolveRef(schema['$ref'], oas);
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
                existingDataDef.links = Object.assign(Object.assign({}, saneLinks), existingDataDef.links);
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
        const targetGraphQLType = Oas3Tools.getSchemaTargetGraphQLType(schema, data);
        // Add the names to the master list
        data.usedOTNames.push(saneName);
        data.usedOTNames.push(saneInputName);
        const def = {
            preferredName,
            /**
             * Note that schema may contain $ref or schema composition (e.g. allOf)
             *
             * TODO: the schema is used in getSchemaIndex, which allows us to check
             * whether a dataDef has already been created for that particular
             * schema and name pair. The look up should resolve references but
             * currently, it does not.
             */
            schema,
            required: [],
            targetGraphQLType,
            subDefinitions: undefined,
            links: saneLinks,
            otName: saneName,
            iotName: saneInputName
        };
        // Add the def to the master list
        data.defs.push(def);
        if (Array.isArray(schema.anyOf) && Array.isArray(schema.oneOf)) {
            // TODO: warning currently do not support both anyOf and oneOf
            def.targetGraphQLType = 'json';
            return def;
        }
        const allOfConsolidated = Array.isArray(schema.allOf)
            ? consolidateSubSchemas(schema.allOf, oas, data)
            : null;
        const anyOfConsolidated = Array.isArray(schema.anyOf)
            ? consolidateSubSchemas(schema.anyOf, oas, data)
            : null;
        const oneOfConsolidated = Array.isArray(schema.oneOf)
            ? consolidateSubSchemas(schema.oneOf, oas, data)
            : null;
        // // Contains minimum the raw schema and everything in allOf, mandatory fields
        // const consolidatedSchema = JSON.parse(JSON.stringify(schema)) // Copy schema
        // // Add allOf to the consolidatedSchema
        // if (allOfConsolidated) {
        //   const allOfConsolidatedType = consolidateTypes(allOfConsolidated.consolidatedTargetGraphQLTypes, targetGraphQLType)
        //   if (allOfConsolidatedType !== targetGraphQLType) { // TODO: enum
        //     // TODO: warning
        //     def.targetGraphQLType = 'json'
        //     return def
        //   }
        //   if (allOfConsolidatedType === 'object') {
        //     allOfConsolidated.consolidatedProperties.forEach((properties) => {
        //       Object.entries(properties).forEach(([propertyName, property]) => {
        //         if (propertyName in consolidatedSchema) {
        //           if (!deepEqual(property, consolidatedSchema[propertyName])) { // TODO: deepEquals will not resolve references
        //             // TODO: warning: allOf is not compatible with the parent schema or itself
        //             def.targetGraphQLType = 'json'
        //             return def
        //           }
        //         } else {
        //           console.log(property)
        //           consolidatedSchema[propertyName] = property
        //         }
        //       })
        //     })
        //   }
        //   allOfConsolidated.consolidatedRequired.forEach((requiredPropertyName) => {
        //     if (Array.isArray(consolidatedSchema.required) && !consolidatedSchema.required.includes(requiredPropertyName)) {
        //       consolidatedSchema.required.concat(requiredPropertyName)
        //     }
        //   })
        // }
        // console.log()
        // console.log()
        // console.log()
        // console.log(`consolidate schema for...`, schema)
        const consolidatedSchema = collapseAllOf(schema, {}, oas);
        // console.log('final',consolidatedSchema)
        // if (schema.allOf) {
        //   console.log(targetGraphQLType)
        //   console.log(schema)
        //   console.log(consolidatedSchema)
        //   console.log()
        // }
        // if (schema.allOf) {
        //   console.log(targetGraphQLType)
        //   console.log(schema)
        //   console.log(consolidatedSchema)
        //   console.log()
        // }
        // if (oneOfConsolidated) {
        //   // Create union
        //   // if (oneOfConsolidated.consolidatedProperties.length > 0) {
        //   if (oneOfConsolidated.consolidatedTargetGraphQLTypes.some((memberTargetGraphQLTypes) => {
        //     return memberTargetGraphQLTypes === 'object'
        //   })) {
        //     /**
        //      * At this point, we know that oneOf contains member schemas that are
        //      * object types. We want to create a GraphQL union using these types.
        //      */
        //     /**
        //      * Ensure that schema is compatiable with oneOf
        //      */
        //     if (
        //       (targetGraphQLType === null || targetGraphQLType === 'object') && // From the parent schema
        //       (allOfConsolidated === null || (allOfConsolidated.consolidatedTargetGraphQLTypes.length === 0 || allOfConsolidated.consolidatedTargetGraphQLTypes.every((memberTargetGraphQLType) => {
        //         return memberTargetGraphQLType === null || memberTargetGraphQLType === 'object'
        //       })))
        //     ) {
        //       def.subDefinitions = []
        //       schema.oneOf.forEach(subSchema => {
        //         // Dereference subSchema
        //         let fromRef: string
        //         if ('$ref' in subSchema) {
        //           fromRef = subSchema['$ref'].split('/').pop()
        //           subSchema = Oas3Tools.resolveRef(subSchema['$ref'], oas) as SchemaObject
        //         }
        //         // TODO: properties should be handled like interfaces, which also means they need to be passed into the subschemas
        //         // TODO: ensure that unions are not composed of other unions
        //         // Member types of GraphQL unions must be object base types
        //         if (subSchema.type === 'object') {
        //           const subDefinition = createDataDef(
        //             {
        //               fromRef,
        //               fromSchema: subSchema.title,
        //               fromPath: `${saneName}Member`
        //             },
        //             subSchema,
        //             isInputObjectType,
        //             data,
        //             undefined,
        //             oas
        //           )
        //           ;(def.subDefinitions as DataDefinition[]).push(subDefinition)
        //         } else {
        //           // TODO: mitigation default JSON type
        //           handleWarning({
        //             typeKey: 'UNION_MEMBER_NON_OBJECT',
        //             message:
        //               `Union member type '${JSON.stringify(subSchema)}' in ` +
        //               `union type '${JSON.stringify(schema)}' is not an object ` +
        //               `type. Union member types must be object base types.`,
        //             data,
        //             log: preprocessingLog
        //           })
        //         }
        //       })
        //       // // Add the def to the master list
        //       // data.defs.push(def)
        //       def.targetGraphQLType = 'union'
        //       return def
        //     } else {
        //       // TODO: warning mismatching types between parent schema/allOf and oneOf member schemas
        //       // TODO: mitigatiom default JSON type
        //       def.targetGraphQLType = 'json'
        //       return def
        //     }
        //   } else {
        //     // TODO: cannot create union of different scalar types, default JSON type
        //     def.targetGraphQLType = 'json'
        //     return def
        //   }
        // }
        // if (anyOfConsolidated) {
        //   // Every member type should be an object
        //   if (anyOfConsolidated.consolidatedTargetGraphQLTypes.length > 0 &&
        //     anyOfConsolidated.consolidatedTargetGraphQLTypes.every((memberTargetGraphQLTypes) => {
        //       return memberTargetGraphQLTypes === 'object'
        //     }) &&
        //     anyOfConsolidated.consolidatedProperties.length > 0
        //   ) {
        //     const incompatibleProperties = new Set<string>()
        //     anyOfConsolidated.consolidatedProperties.forEach((properties) => {
        //       Object.keys(properties).forEach((propertyName) => {
        //         if (
        //           !incompatibleProperties.has(propertyName) && // No preexisting conflicts
        //           propertyName in consolidatedSchema && // Property already exists in the consolidated schema
        //           !deepEqual(properties[propertyName], consolidatedSchema[propertyName]) // Property conflicts with that in the consolidated schema
        //         ) {
        //           incompatibleProperties.add(propertyName)
        //           consolidatedSchema[propertyName] = undefined // Do not create these properties. Will add them in later.
        //         }
        //       })
        //     })
        //     def.subDefinitions = {}
        //     addObjectPropertiesToDataDef(
        //       def,
        //       consolidatedSchema,
        //       def.required,
        //       isInputObjectType,
        //       data,
        //       oas
        //     )
        //     // Add in incompatible properties
        //     incompatibleProperties.forEach((propertyName) => {
        //       // TODO: incompatible property
        //       // TODO: add description
        //       def.subDefinitions[propertyName] = {
        //         targetGraphQLType: 'json'
        //       }
        //     })
        //     return def
        //   } else {
        //     // TODO: warning different types
        //     def.targetGraphQLType = 'json'
        //     return def
        //   }
        // }
        if (targetGraphQLType) {
            switch (targetGraphQLType) {
                case 'array':
                    if (typeof schema.items === 'object') {
                        // Break schema down into component parts
                        // I.e. if it is an list type, create a reference to the list item type
                        // Or if it is an object type, create references to all of the field types
                        let itemsSchema = schema.items;
                        let itemsName = `${name}ListItem`;
                        if ('$ref' in itemsSchema) {
                            itemsName = schema.items['$ref'].split('/').pop();
                        }
                        const subDefinition = createDataDef(
                        // Is this the correct classification for this name? It does not matter in the long run.
                        { fromRef: itemsName }, itemsSchema, isInputObjectType, data, undefined, oas);
                        // Add list item reference
                        def.subDefinitions = subDefinition;
                    }
                    break;
                case 'object':
                    def.subDefinitions = {};
                    addObjectPropertiesToDataDef(def, schema, def.required, isInputObjectType, data, oas);
                    break;
            }
        }
        else {
            // TODO: throw error
            def.targetGraphQLType = 'json';
        }
        return def;
    }
}
exports.createDataDef = createDataDef;
function consolidateTypes(memberSchemaTypes, schemaType) {
    if (memberSchemaTypes.length > 0) {
        // Check if the memberSchemaTypes are compatible with each other and the schema type
        let memberTypesCompatible;
        if (schemaType) {
            memberTypesCompatible = memberSchemaTypes.every(type => {
                return type === schemaType;
            });
        }
        else {
            const consolidatedTypes = new Set(memberSchemaTypes);
            memberTypesCompatible = consolidatedTypes.size === 1;
        }
        if (memberTypesCompatible) {
            return memberSchemaTypes[0];
        }
        else {
            return null;
        }
    }
    else {
        return null;
    }
}
function consolidateSubSchemas(schemas, oas, data) {
    const consolidated = {
        consolidatedTypes: [],
        consolidatedTargetGraphQLTypes: [],
        consolidatedProperties: [],
        consolidatedRequired: []
    };
    schemas.forEach(schema => {
        // Dereference schemas
        if ('$ref' in schema) {
            schema = Oas3Tools.resolveRef(schema['$ref'], oas);
        }
        // Handle allOf
        if (Array.isArray(schema.allOf)) {
            const nestedConsolidated = consolidateSubSchemas(schema.allOf, oas, data);
            // Consolidate type
            consolidated.consolidatedTypes = consolidated.consolidatedTypes.concat(nestedConsolidated.consolidatedTypes);
            // Consolidate properties
            consolidated.consolidatedProperties = consolidated.consolidatedProperties.concat(nestedConsolidated.consolidatedProperties);
            // Consolidate required
            consolidated.consolidatedRequired = consolidated.consolidatedRequired.concat(nestedConsolidated.consolidatedRequired);
        }
        // Consolidate target GraphQL type
        const memberTargetGraphQLType = Oas3Tools.getSchemaTargetGraphQLType(schema, data);
        if (memberTargetGraphQLType) {
            consolidated.consolidatedTargetGraphQLTypes.push(memberTargetGraphQLType);
        }
        // Consolidate type
        if (schema.type) {
            consolidated.consolidatedTypes.push(schema.type);
        }
        // Consolidate properties
        if (schema.properties) {
            consolidated.consolidatedProperties.push(schema.properties);
        }
        // Consolidate required
        if (schema.required) {
            consolidated.consolidatedRequired = consolidated.consolidatedRequired.concat(schema.required);
        }
    });
    return consolidated;
}
/**
 * Returns the index of the data definition object in the given list that
 * contains the same schema and preferred name as the given one. Returns -1 if
 * that schema could not be found.
 */
function getSchemaIndex(preferredName, schema, dataDefs) {
    /**
     * TODO: instead of iterating through the whole list every time, create a
     * hashing function and store all of the DataDefinitions in a hashmap.
     */
    for (let index = 0; index < dataDefs.length; index++) {
        const def = dataDefs[index];
        /**
         * TODO: deepEquals is not sufficient. We also need to resolve references.
         * However, deepEquals should work for vast majority of cases.
         */
        if (preferredName === def.preferredName && deepEqual(schema, def.schema)) {
            return index;
        }
    }
    // The schema could not be found in the master list
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
function collapseAllOf(schema, references, oas, nesting = 0) {
    // Dereference schema
    if ('$ref' in schema) {
        const referenceLocation = schema['$ref'];
        if (referenceLocation in references) {
            return references[referenceLocation];
        }
        else {
            references[referenceLocation] = schema;
        }
        schema = Oas3Tools.resolveRef(schema['$ref'], oas);
    }
    if (nesting >= 1 &&
        (Array.isArray(schema.anyOf) || Array.isArray(schema.oneOf))) {
        // TODO: throw error
    }
    const collapsedSchema = schema;
    if (Array.isArray(collapsedSchema.allOf)) {
        const resolvedSchemas = [];
        collapsedSchema.allOf.forEach(subSchema => {
            resolvedSchemas.push(collapseAllOf(subSchema, references, oas, nesting + 1));
        });
        resolvedSchemas.forEach(resolvedSchema => {
            if (resolvedSchema.type) {
                if (!collapsedSchema.type) {
                    collapsedSchema.type = resolvedSchema.type; // Add type if applicable
                }
                else if (collapsedSchema.type !== resolvedSchema.type) {
                    // TODO: throw error different types
                }
            }
            if ('properties' in resolvedSchema) {
                if (!('properties' in collapsedSchema)) {
                    collapsedSchema.properties = {};
                }
                Object.entries(resolvedSchema.properties).forEach(([propertyName, property]) => {
                    if (propertyName in collapsedSchema) {
                        // TODO: throw error conflicting property
                    }
                    else {
                        collapsedSchema.properties[propertyName] = collapseAllOf(property, references, oas);
                    }
                });
            }
            if ('required' in resolvedSchema) {
                if (!('required' in collapsedSchema)) {
                    collapsedSchema.required = [];
                }
                resolvedSchema.required.forEach(requiredProperty => {
                    if (!collapsedSchema.required.includes(requiredProperty)) {
                        collapsedSchema.required.push(requiredProperty);
                    }
                });
            }
        });
        // console.log('resolvedSchemas', JSON.stringify(resolvedSchemas, null, 2))
    }
    return collapsedSchema;
}
/**
 * Recursively add the (nested) allOf schemas to the root-level data definition
 *
 * @param def Root-level data definition
 */
function addAllOfToDataDef(def, schema, required, isInputObjectType, data, oas) {
    schema.allOf.forEach(subSchema => {
        // Dereference subSchema
        if ('$ref' in subSchema) {
            subSchema = Oas3Tools.resolveRef(subSchema['$ref'], oas);
        }
        // Recurse into nested allOf (if applicable)
        if ('allOf' in subSchema) {
            addAllOfToDataDef(def, subSchema, required, isInputObjectType, data, oas);
        }
        // Add properties of the subSchema
        addObjectPropertiesToDataDef(def, subSchema, required, isInputObjectType, data, oas);
    });
}
/**
 * Add the properties to the data definition
 */
function addObjectPropertiesToDataDef(def, schema, required, isInputObjectType, data, oas) {
    /**
     * Resolve all required properties
     *
     * TODO: required may contain duplicates, which is not necessarily a problem
     */
    if (Array.isArray(schema.required)) {
        schema.required.forEach(requiredProperty => {
            required.push(requiredProperty);
        });
    }
    for (let propertyKey in schema.properties) {
        let propSchemaName = propertyKey;
        let propSchema = schema.properties[propertyKey];
        if ('$ref' in propSchema) {
            propSchemaName = propSchema['$ref'].split('/').pop();
            propSchema = Oas3Tools.resolveRef(propSchema['$ref'], oas);
        }
        if (!(propertyKey in def.subDefinitions)) {
            const subDefinition = createDataDef({
                fromRef: propSchemaName,
                fromSchema: propSchema.title // TODO: Currently not utilized because of fromRef but arguably, propertyKey is a better field name and title is a better type name
            }, propSchema, isInputObjectType, data, undefined, oas);
            // Add field type references
            def.subDefinitions[propertyKey] = subDefinition;
        }
        else {
            utils_1.handleWarning({
                typeKey: 'DUPLICATE_FIELD_NAME',
                message: `By way of resolving 'allOf', multiple schemas contain ` +
                    `properties with the same name, preventing consolidation. Cannot ` +
                    `add property '${propertyKey}' from schema '${JSON.stringify(schema)}' ` +
                    `to dataDefinition '${JSON.stringify(def)}'`,
                data,
                log: preprocessingLog
            });
        }
    }
}
//# sourceMappingURL=preprocessor.js.map