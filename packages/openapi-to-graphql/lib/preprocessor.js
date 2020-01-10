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
const graphql_1 = require("./types/graphql");
const preprocessingLog = debug_1.default('preprocessing');
/**
 * Extract information from the OAS and put it inside a data structure that
 * is easier for OpenAPI-to-GraphQL to use
 */
function preprocessOas(oass, options) {
    const data = {
        usedTypeNames: [
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
                // Only consider Operation Objects
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
                if (data.options.equivalentToMessages &&
                    typeof description === 'string') {
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
                /**
                 * Whether the operation should be added as a Query or Mutation field.
                 * By default, all GET operations are Query fields and all other
                 * operations are Mutation fields.
                 */
                let isMutation = method.toLowerCase() !== 'get';
                // Option selectQueryOrMutationField can override isMutation
                if (typeof options.selectQueryOrMutationField === 'object' &&
                    typeof options.selectQueryOrMutationField[oas.info.title] ===
                        'object' &&
                    typeof options.selectQueryOrMutationField[oas.info.title][path] ===
                        'object' &&
                    typeof options.selectQueryOrMutationField[oas.info.title][path][method] === 'number' // This is an TS enum, which is translated to have a integer value
                ) {
                    isMutation =
                        options.selectQueryOrMutationField[oas.info.title][path][method] ===
                            graphql_1.GraphQLOperationType.Mutation;
                }
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
                /**
                 * Handle operationId property name collision
                 * May occur if multiple OAS are provided
                 */
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
        // Determine the schema and the parameters for the security protocol
        let schema;
        let parameters = {};
        let description;
        switch (protocol.type) {
            case 'apiKey':
                description = `API key credentials for the security protocol '${key}'`;
                if (data.oass.length > 1) {
                    description += ` in ${oas.info.title}`;
                }
                parameters = {
                    apiKey: Oas3Tools.sanitize(`${key}_apiKey`, Oas3Tools.CaseStyle.camelCase)
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
                            username: Oas3Tools.sanitize(`${key}_username`, Oas3Tools.CaseStyle.camelCase),
                            password: Oas3Tools.sanitize(`${key}_password`, Oas3Tools.CaseStyle.camelCase)
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
                // Continue because we do not want to create an OAuth viewer
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
    const preferredName = getPreferredName(names);
    // Basic validation test
    if (typeof schema !== 'object') {
        utils_1.handleWarning({
            typeKey: 'MISSING_SCHEMA',
            message: `Could not create data definition for schema with ` +
                `preferred name '${preferredName}' and schema '${JSON.stringify(schema)}'`,
            data,
            log: preprocessingLog
        });
        // TODO: Does this change make the option fillEmptyResponses obsolete?
        return {
            preferredName,
            schema: null,
            required: [],
            links: null,
            subDefinitions: null,
            graphQLTypeName: null,
            graphQLInputObjectTypeName: null,
            targetGraphQLType: 'json'
        };
    }
    else {
        if ('$ref' in schema) {
            schema = Oas3Tools.resolveRef(schema['$ref'], oas);
        }
        const saneLinks = {};
        if (typeof links === 'object') {
            Object.keys(links).forEach(linkKey => {
                saneLinks[Oas3Tools.sanitize(linkKey, Oas3Tools.CaseStyle.camelCase)] =
                    links[linkKey];
            });
        }
        // Determine the index of possible existing data definition
        const index = getSchemaIndex(preferredName, schema, data.defs);
        if (index !== -1) {
            // Found existing data definition and fetch it
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
            const name = getSchemaName(names, data.usedTypeNames);
            // Store and sanitize the name
            const saneName = Oas3Tools.sanitize(name, Oas3Tools.CaseStyle.PascalCase);
            const saneInputName = Oas3Tools.capitalize(saneName + 'Input');
            Oas3Tools.storeSaneName(saneName, name, data.saneMap);
            /**
             * TODO: is there a better way of copying the schema object?
             *
             * Perhaps, just copy it at the root level (operation schema)
             */
            const consolidatedSchema = collapseSchema(schema, {}, data, oas);
            const targetGraphQLType = Oas3Tools.getSchemaTargetGraphQLType(consolidatedSchema, data);
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
                graphQLTypeName: saneName,
                graphQLInputObjectTypeName: saneInputName
            };
            // Used type names and defs of union and object types are pushed during creation
            if (targetGraphQLType === 'object' ||
                targetGraphQLType === 'list' ||
                targetGraphQLType === 'enum') {
                data.usedTypeNames.push(saneName);
                data.usedTypeNames.push(saneInputName);
                // Add the def to the master list
                data.defs.push(def);
            }
            // We currently only support simple cases of anyOf and oneOf
            if ((Array.isArray(consolidatedSchema.anyOf) &&
                Array.isArray(consolidatedSchema.oneOf)) || // anyOf and oneOf used concurrently
                (Array.isArray(consolidatedSchema.anyOf) &&
                    consolidatedSchema.anyOf.some(memberSchema => {
                        // anyOf and oneOf are nested
                        if ('$ref' in memberSchema) {
                            memberSchema = Oas3Tools.resolveRef(memberSchema['$ref'], oas);
                        }
                        return (Array.isArray(memberSchema.anyOf) ||
                            Array.isArray(memberSchema.oneOf));
                    })) ||
                (Array.isArray(consolidatedSchema.oneOf) &&
                    consolidatedSchema.oneOf.some(memberSchema => {
                        // oneOf and allOf are nested
                        if ('$ref' in memberSchema) {
                            memberSchema = Oas3Tools.resolveRef(memberSchema['$ref'], oas);
                        }
                        return (Array.isArray(memberSchema.anyOf) ||
                            Array.isArray(memberSchema.oneOf)); // Nested oneOf would result in nested unions which are not allowed by GraphQL
                    }))) {
                utils_1.handleWarning({
                    typeKey: 'COMBINE_SCHEMAS',
                    message: `Schema '${JSON.stringify(schema)}' contains either both ` +
                        `'anyOf' and 'oneOf' or nested 'anyOf' and 'oneOf' which ` +
                        `is currently not supported.`,
                    mitigationAddendum: `Use arbitrary JSON type instead.`,
                    data,
                    log: preprocessingLog
                });
                def.targetGraphQLType = 'json';
                return def;
            }
            // oneOf will ideally be turned into a union type
            if (Array.isArray(consolidatedSchema.oneOf)) {
                const oneOfData = getMemberSchemaData(consolidatedSchema.oneOf, data, oas);
                if (oneOfData.allTargetGraphQLTypes.some(memberTargetGraphQLType => {
                    return memberTargetGraphQLType === 'object';
                })) {
                    // unions must be created from object types
                    if (oneOfData.allTargetGraphQLTypes.every(memberTargetGraphQLType => {
                        return memberTargetGraphQLType === 'object';
                    }) &&
                        oneOfData.allProperties.length > 0 // Redundant check
                    ) {
                        // Ensure that parent schema is compatiable with oneOf
                        if (targetGraphQLType === null || targetGraphQLType === 'object') {
                            def.subDefinitions = [];
                            consolidatedSchema.oneOf.forEach(memberSchema => {
                                // Dereference member schema
                                let fromRef;
                                if ('$ref' in memberSchema) {
                                    fromRef = memberSchema['$ref'].split('/').pop();
                                    memberSchema = Oas3Tools.resolveRef(memberSchema['$ref'], oas);
                                }
                                // Member types of GraphQL unions must be object types
                                if (memberSchema.type === 'object') {
                                    const subDefinition = createDataDef({
                                        fromRef,
                                        fromSchema: memberSchema.title,
                                        fromPath: `${saneName}Member`
                                    }, memberSchema, isInputObjectType, data, undefined, oas);
                                    def.subDefinitions.push(subDefinition);
                                }
                                else {
                                    utils_1.handleWarning({
                                        typeKey: 'COMBINE_SCHEMAS',
                                        message: `Schema '${JSON.stringify(schema)}' contains 'oneOf' so ` +
                                            `create a GraphQL union type but member schema '${JSON.stringify(memberSchema)}' ` +
                                            `is not an object type and union member types must be ` +
                                            `object base types.`,
                                        data,
                                        log: preprocessingLog
                                    });
                                }
                            });
                            // Not all member schemas may have been turned into GraphQL member types
                            if (def.subDefinitions.length > 0) {
                                data.usedTypeNames.push(saneName);
                                data.usedTypeNames.push(saneInputName);
                                data.defs.push(def);
                                def.targetGraphQLType = 'union';
                            }
                            else {
                                utils_1.handleWarning({
                                    typeKey: 'COMBINE_SCHEMAS',
                                    message: `Schema '${JSON.stringify(schema)}' contains 'oneOf' so ` +
                                        `create a GraphQL union type but all member schemas are not` +
                                        `object types and union member types must be object types.`,
                                    mitigationAddendum: `Create arbitrary JSON type instead.`,
                                    data,
                                    log: preprocessingLog
                                });
                                // Default arbitrary JSON type
                                def.targetGraphQLType = 'json';
                            }
                            return def;
                        }
                        else {
                            // The parent schema is incompatible with the member schemas
                            utils_1.handleWarning({
                                typeKey: 'COMBINE_SCHEMAS',
                                message: `Schema '${JSON.stringify(schema)}' contains 'oneOf' so create ` +
                                    `a GraphQL union type but the parent schema is a non-object ` +
                                    `type and member types must be object types.`,
                                mitigationAddendum: `The schema will be made into an arbitrary JSON type.`,
                                data,
                                log: preprocessingLog
                            });
                            def.targetGraphQLType = 'json';
                            return def;
                        }
                    }
                    else {
                        // The member schemas are not all object types
                        utils_1.handleWarning({
                            typeKey: 'COMBINE_SCHEMAS',
                            message: `Schema '${JSON.stringify(schema)}' contains 'oneOf' so create ` +
                                `a GraphQL union type but some member schemas are non-object ` +
                                `types and union member types must be object types.`,
                            mitigationAddendum: `The schema will be made into an arbitrary JSON type.`,
                            data,
                            log: preprocessingLog
                        });
                        def.targetGraphQLType = 'json';
                        return def;
                    }
                }
            }
            /**
             * anyOf will ideally be turned into an object type
             *
             * Fields common to all member schemas will be made non-null
             */
            if (Array.isArray(consolidatedSchema.anyOf)) {
                const anyOfData = getMemberSchemaData(consolidatedSchema.anyOf, data, oas);
                if (anyOfData.allTargetGraphQLTypes.some(memberTargetGraphQLType => {
                    return memberTargetGraphQLType === 'object';
                })) {
                    // Every member type should be an object
                    if (anyOfData.allTargetGraphQLTypes.every(memberTargetGraphQLType => {
                        return memberTargetGraphQLType === 'object';
                    }) &&
                        anyOfData.allProperties.length > 0 // Redundant check
                    ) {
                        // Ensure that parent schema is compatiable with oneOf
                        if (targetGraphQLType === null || targetGraphQLType === 'object') {
                            const allProperties = {};
                            const incompatibleProperties = new Set();
                            if (Array.isArray(consolidatedSchema.properties)) {
                                Object.keys(consolidatedSchema.properties).forEach(propertyName => {
                                    allProperties[propertyName] = [
                                        consolidatedSchema.properties[propertyName]
                                    ];
                                });
                            }
                            // Check if any member schema has conflicting properties
                            anyOfData.allProperties.forEach(properties => {
                                Object.keys(properties).forEach(propertyName => {
                                    if (!incompatibleProperties.has(propertyName) && // Has not been already identified as a problematic property
                                        propertyName in allProperties &&
                                        allProperties[propertyName].some(property => {
                                            // Property does not match a recorded one
                                            return !deepEqual(property, properties[propertyName]);
                                        })) {
                                        incompatibleProperties.add(propertyName);
                                    }
                                    // Add property in the store
                                    if (!(propertyName in allProperties)) {
                                        allProperties[propertyName] = [];
                                    }
                                    allProperties[propertyName].push(properties[propertyName]);
                                });
                            });
                            def.subDefinitions = {};
                            if (typeof consolidatedSchema.properties === 'object' &&
                                Object.keys(consolidatedSchema.properties).length > 0) {
                                addObjectPropertiesToDataDef(def, consolidatedSchema, def.required, isInputObjectType, data, oas);
                            }
                            anyOfData.allProperties.forEach(properties => {
                                Object.keys(properties).forEach(propertyName => {
                                    if (!incompatibleProperties.has(propertyName)) {
                                        // Dereferenced by processing anyOfData
                                        const propertySchema = properties[propertyName];
                                        const subDefinition = createDataDef({
                                            fromRef: propertyName,
                                            fromSchema: propertySchema.title // TODO: Currently not utilized because of fromRef but arguably, propertyKey is a better field name and title is a better type name
                                        }, propertySchema, isInputObjectType, data, undefined, oas);
                                        /**
                                         * Add field type references
                                         * There should not be any collisions
                                         */
                                        def.subDefinitions[propertyName] = subDefinition;
                                    }
                                });
                            });
                            //  Add in incompatible properties
                            incompatibleProperties.forEach(propertyName => {
                                //  TODO: add description
                                def.subDefinitions[propertyName] = {
                                    targetGraphQLType: 'json'
                                };
                            });
                            data.usedTypeNames.push(saneName);
                            data.usedTypeNames.push(saneInputName);
                            data.defs.push(def);
                            def.targetGraphQLType = 'object';
                            return def;
                        }
                        else {
                            // The parent schema is incompatible with the member schemas
                            utils_1.handleWarning({
                                typeKey: 'COMBINE_SCHEMAS',
                                message: `Schema '${JSON.stringify(schema)}' contains 'anyOf' and ` +
                                    `some member schemas are object types so create a GraphQL ` +
                                    `object type but the parent schema is a non-object type ` +
                                    `so they are not compatible.`,
                                mitigationAddendum: `The schema will be made into an arbitrary JSON type.`,
                                data,
                                log: preprocessingLog
                            });
                            def.targetGraphQLType = 'json';
                            return def;
                        }
                    }
                    else {
                        // The member schemas are not all object types
                        utils_1.handleWarning({
                            typeKey: 'COMBINE_SCHEMAS',
                            message: `Schema '${JSON.stringify(schema)}' contains 'anyOf' and ` +
                                `some member schemas are object types so create a GraphQL ` +
                                `object type but some member schemas are non-object types ` +
                                `so they are not compatible.`,
                            data,
                            log: preprocessingLog
                        });
                        def.targetGraphQLType = 'json';
                        return def;
                    }
                }
            }
            if (targetGraphQLType) {
                switch (targetGraphQLType) {
                    case 'list':
                        if (typeof consolidatedSchema.items === 'object') {
                            // Break schema down into component parts
                            // I.e. if it is an list type, create a reference to the list item type
                            // Or if it is an object type, create references to all of the field types
                            let itemsSchema = consolidatedSchema.items;
                            let itemsName = `${name}ListItem`;
                            if ('$ref' in itemsSchema) {
                                itemsName = consolidatedSchema.items['$ref'].split('/').pop();
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
                        if (typeof consolidatedSchema.properties === 'object' &&
                            Object.keys(consolidatedSchema.properties).length > 0) {
                            addObjectPropertiesToDataDef(def, consolidatedSchema, def.required, isInputObjectType, data, oas);
                        }
                        else {
                            utils_1.handleWarning({
                                typeKey: 'OBJECT_MISSING_PROPERTIES',
                                message: `Schema ${JSON.stringify(schema)} does not have ` +
                                    `any properties`,
                                data,
                                log: preprocessingLog
                            });
                            def.targetGraphQLType = 'json';
                        }
                        break;
                }
            }
            else {
                // No target GraphQL type
                utils_1.handleWarning({
                    typeKey: 'UNKNOWN_TARGET_TYPE',
                    message: `No GraphQL target type could be identified for schema '${JSON.stringify(schema)}'.`,
                    data,
                    log: preprocessingLog
                });
                def.targetGraphQLType = 'json';
            }
            return def;
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
    if (typeof names.preferred === 'string') {
        return Oas3Tools.sanitize(names.preferred, Oas3Tools.CaseStyle.PascalCase); // CASE: preferred name already known
    }
    else if (typeof names.fromRef === 'string') {
        return Oas3Tools.sanitize(names.fromRef, Oas3Tools.CaseStyle.PascalCase); // CASE: name from reference
    }
    else if (typeof names.fromSchema === 'string') {
        return Oas3Tools.sanitize(names.fromSchema, Oas3Tools.CaseStyle.PascalCase); // CASE: name from schema (i.e., "title" property in schema)
    }
    else if (typeof names.fromPath === 'string') {
        return Oas3Tools.sanitize(names.fromPath, Oas3Tools.CaseStyle.PascalCase); // CASE: name from path
    }
    else {
        return 'PlaceholderName'; // CASE: placeholder name
    }
}
/**
 * Determines name to use for schema from previously determined schemaNames and
 * considering not reusing existing names.
 */
function getSchemaName(names, usedNames) {
    if (Object.keys(names).length === 1 && typeof names.preferred === 'string') {
        throw new Error(`Cannot create data definition without name(s), excluding the preferred name.`);
    }
    let schemaName;
    // CASE: name from reference
    if (typeof names.fromRef === 'string') {
        const saneName = Oas3Tools.sanitize(names.fromRef, Oas3Tools.CaseStyle.PascalCase);
        if (!usedNames.includes(saneName)) {
            schemaName = names.fromRef;
        }
    }
    // CASE: name from schema (i.e., "title" property in schema)
    if (!schemaName && typeof names.fromSchema === 'string') {
        const saneName = Oas3Tools.sanitize(names.fromSchema, Oas3Tools.CaseStyle.PascalCase);
        if (!usedNames.includes(saneName)) {
            schemaName = names.fromSchema;
        }
    }
    // CASE: name from path
    if (!schemaName && typeof names.fromPath === 'string') {
        const saneName = Oas3Tools.sanitize(names.fromPath, Oas3Tools.CaseStyle.PascalCase);
        if (!usedNames.includes(saneName)) {
            schemaName = names.fromPath;
        }
    }
    // CASE: all names are already used - create approximate name
    if (!schemaName) {
        schemaName = Oas3Tools.sanitize(typeof names.fromRef === 'string'
            ? names.fromRef
            : typeof names.fromSchema === 'string'
                ? names.fromSchema
                : typeof names.fromPath === 'string'
                    ? names.fromPath
                    : 'PlaceholderName', Oas3Tools.CaseStyle.PascalCase);
    }
    if (usedNames.includes(schemaName)) {
        let appendix = 2;
        /**
         * GraphQL Objects cannot share the name so if the name already exists in
         * the master list append an incremental number until the name does not
         * exist anymore.
         */
        while (usedNames.includes(`${schemaName}${appendix}`)) {
            appendix++;
        }
        schemaName = `${schemaName}${appendix}`;
    }
    return schemaName;
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
/**
 * Recursively traverse a schema and resolve allOf by appending the data to the
 * parent schema
 */
function collapseSchema(schema, references, data, oas) {
    // Dereference schema
    if ('$ref' in schema) {
        const referenceLocation = schema['$ref'];
        schema = Oas3Tools.resolveRef(schema['$ref'], oas);
        if (referenceLocation in references) {
            return references[referenceLocation];
        }
        else {
            // Store references in case of circular allOf
            references[referenceLocation] = schema;
        }
    }
    const collapsedSchema = JSON.parse(JSON.stringify(schema));
    // Resolve allOf
    if (Array.isArray(collapsedSchema.allOf)) {
        collapsedSchema.allOf.forEach(memberSchema => {
            // Collapse type if applicable
            const resolvedSchema = collapseSchema(memberSchema, references, data, oas);
            if (resolvedSchema.type) {
                if (!collapsedSchema.type) {
                    collapsedSchema.type = resolvedSchema.type;
                    // Add type if applicable
                }
                else if (collapsedSchema.type !== resolvedSchema.type) {
                    // Incompatible schema type
                    utils_1.handleWarning({
                        typeKey: 'UNRESOLVABLE_SCHEMA',
                        message: `Resolving 'allOf' field in schema '${collapsedSchema}' ` +
                            `results in incompatible schema type from partial schema '${resolvedSchema}'.`,
                        data,
                        log: preprocessingLog
                    });
                }
            }
            // Collapse properties if applicable
            if ('properties' in resolvedSchema) {
                if (!('properties' in collapsedSchema)) {
                    collapsedSchema.properties = {};
                }
                Object.entries(resolvedSchema.properties).forEach(([propertyName, property]) => {
                    if (propertyName in collapsedSchema) {
                        // Conflicting property
                        utils_1.handleWarning({
                            typeKey: 'UNRESOLVABLE_SCHEMA',
                            message: `Resolving 'allOf' field in schema '${collapsedSchema}' ` +
                                `results in incompatible property field from partial schema '${resolvedSchema}'.`,
                            data,
                            log: preprocessingLog
                        });
                    }
                    else {
                        collapsedSchema.properties[propertyName] = property;
                    }
                });
            }
            // Collapse required if applicable
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
    }
    return collapsedSchema;
}
/**
 * In the context of schemas that use keywords that combine member schemas,
 * collect data on certain aspects so it is all in one place for processing.
 */
function getMemberSchemaData(schemas, data, oas) {
    const result = {
        allTargetGraphQLTypes: [],
        allProperties: [],
        allRequired: []
    };
    schemas.forEach(schema => {
        // Dereference schemas
        if ('$ref' in schema) {
            schema = Oas3Tools.resolveRef(schema['$ref'], oas);
        }
        /**
         * Handle allOf
         *
         * NOTE: should be redundant because collapseAllOf() is called before
         */
        if (Array.isArray(schema.allOf)) {
            const nestedConsolidated = getMemberSchemaData(schema.allOf, data, oas);
            // Consolidate properties
            result.allProperties = result.allProperties.concat(nestedConsolidated.allProperties);
            // Consolidate required
            result.allRequired = result.allRequired.concat(nestedConsolidated.allRequired);
        }
        // Consolidate target GraphQL type
        const memberTargetGraphQLType = Oas3Tools.getSchemaTargetGraphQLType(schema, data);
        if (memberTargetGraphQLType) {
            result.allTargetGraphQLTypes.push(memberTargetGraphQLType);
        }
        // Consolidate properties
        if (schema.properties) {
            result.allProperties.push(schema.properties);
        }
        // Consolidate required
        if (schema.required) {
            result.allRequired = result.allRequired.concat(schema.required);
        }
    });
    return result;
}
//# sourceMappingURL=preprocessor.js.map