"use strict";
// Copyright IBM Corp. 2018. All Rights Reserved.
// Node module: openapi-to-graphql
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDataDef = exports.preprocessOas = void 0;
const operation_1 = require("./types/operation");
// Imports:
const Oas3Tools = require("./oas_3_tools");
const deepEqual = require("deep-equal");
const debug_1 = require("debug");
const utils_1 = require("./utils");
const graphql_1 = require("./types/graphql");
const oas_3_tools_1 = require("./oas_3_tools");
const preprocessingLog = debug_1.default('preprocessing');
/**
 * Given an operation object from the OAS, create an Operation, which contains
 * the necessary data to create a GraphQL wrapper for said operation object.
 *
 * @param path The path of the operation object
 * @param method The method of the operation object
 * @param operationString A string representation of the path and the method (and the OAS title if applicable)
 * @param operationType Whether the operation should be turned into a Query/Mutation/Subscription operation
 * @param operation The operation object from the OAS
 * @param pathItem The path item object from the OAS from which the operation object is derived from
 * @param oas The OAS from which the path item and operation object are derived from
 * @param data An assortment of data which at this point is mainly used enable logging
 * @param options The options passed by the user
 */
function processOperation(path, method, operationString, operationType, operation, pathItem, oas, data, options) {
    // Response schema
    const { responseContentType, responseSchema, responseSchemaNames, statusCode } = Oas3Tools.getResponseSchemaAndNames(path, method, operation, oas, data, options);
    /**
     * All GraphQL fields must have a type, which is derived from the response
     * schema. Therefore, the response schema is the first to be determined.
     */
    if (typeof responseSchema === 'object') {
        // Description
        let description = operation.description;
        if ((typeof description !== 'string' || description === '') &&
            typeof operation.summary === 'string') {
            description = operation.summary;
        }
        if (data.options.equivalentToMessages) {
            // Description may not exist
            if (typeof description !== 'string') {
                description = '';
            }
            description += `\n\nEquivalent to ${operationString}`;
        }
        // Tags
        const tags = operation.tags || [];
        // OperationId
        const operationId = typeof operation.operationId !== 'undefined'
            ? operation.operationId
            : Oas3Tools.generateOperationId(method, path);
        // Request schema
        const { payloadContentType, payloadSchema, payloadSchemaNames, payloadRequired } = Oas3Tools.getRequestSchemaAndNames(path, method, operation, oas);
        // Request data definition
        const payloadDefinition = payloadSchema && typeof payloadSchema !== 'undefined'
            ? createDataDef(payloadSchemaNames, payloadSchema, true, data, oas)
            : undefined;
        // Links
        const links = Oas3Tools.getLinks(path, method, operation, oas, data);
        // Response data definition
        const responseDefinition = createDataDef(responseSchemaNames, responseSchema, false, data, oas, links);
        // Parameters
        const parameters = Oas3Tools.getParameters(path, method, operation, pathItem, oas);
        // Security protocols
        const securityRequirements = options.viewer
            ? Oas3Tools.getSecurityRequirements(operation, data.security, oas)
            : [];
        // Servers
        const servers = Oas3Tools.getServers(operation, pathItem, oas);
        // Whether to place this operation into an authentication viewer
        const inViewer = securityRequirements.length > 0 && data.options.viewer !== false;
        return {
            operation,
            operationId,
            operationString,
            operationType,
            description,
            tags,
            path,
            method,
            payloadContentType,
            payloadDefinition,
            payloadRequired,
            responseContentType,
            responseDefinition,
            parameters,
            securityRequirements,
            servers,
            inViewer,
            statusCode,
            oas
        };
    }
    else {
        utils_1.handleWarning({
            mitigationType: utils_1.MitigationTypes.MISSING_RESPONSE_SCHEMA,
            message: `Operation ${operationString} has no (valid) response schema. ` +
                `You can use the fillEmptyResponses option to create a ` +
                `placeholder schema`,
            data,
            log: preprocessingLog
        });
    }
}
/**
 * Extract information from the OAS and put it inside a data structure that
 * is easier for OpenAPI-to-GraphQL to use
 */
function preprocessOas(oass, options) {
    const data = {
        operations: {},
        callbackOperations: {},
        usedTypeNames: [
            'Query',
            'Mutation',
            'Subscription' // Used by OpenAPI-to-GraphQL for root-level element
        ],
        defs: [],
        security: {},
        saneMap: {},
        options,
        oass
    };
    oass.forEach((oas) => {
        // Store stats on OAS:
        data.options.report.numOps += Oas3Tools.countOperations(oas);
        data.options.report.numOpsMutation += Oas3Tools.countOperationsMutation(oas);
        data.options.report.numOpsQuery += Oas3Tools.countOperationsQuery(oas);
        if (data.options.createSubscriptionsFromCallbacks) {
            data.options.report.numOpsSubscription += Oas3Tools.countOperationsSubscription(oas);
        }
        else {
            data.options.report.numOpsSubscription = 0;
        }
        // Get security schemes
        const currentSecurity = getProcessedSecuritySchemes(oas, data);
        const commonSecurityPropertyName = utils_1.getCommonPropertyNames(data.security, currentSecurity);
        commonSecurityPropertyName.forEach((propertyName) => {
            utils_1.handleWarning({
                mitigationType: utils_1.MitigationTypes.DUPLICATE_SECURITY_SCHEME,
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
            const pathItem = typeof oas.paths[path].$ref === 'string'
                ? Oas3Tools.resolveRef(oas.paths[path].$ref, oas)
                : oas.paths[path];
            Object.keys(pathItem)
                .filter((pathFields) => {
                /**
                 * Get only method fields that contain operation objects (e.g. "get",
                 * "put", "post", "delete", etc.)
                 *
                 * Can also contain other fields such as summary or description
                 */
                return Oas3Tools.isHttpMethod(pathFields);
            })
                .forEach((rawMethod) => {
                var _a, _b, _c;
                const operationString = oass.length === 1
                    ? Oas3Tools.formatOperationString(rawMethod, path)
                    : Oas3Tools.formatOperationString(rawMethod, path, oas.info.title);
                let httpMethod;
                try {
                    httpMethod = oas_3_tools_1.methodToHttpMethod(rawMethod);
                }
                catch (e) {
                    utils_1.handleWarning({
                        mitigationType: utils_1.MitigationTypes.INVALID_HTTP_METHOD,
                        message: `Invalid HTTP method '${rawMethod}' in operation '${operationString}'`,
                        data,
                        log: preprocessingLog
                    });
                    return;
                }
                const operation = pathItem[httpMethod];
                let operationType = httpMethod === Oas3Tools.HTTP_METHODS.get
                    ? graphql_1.GraphQLOperationType.Query
                    : graphql_1.GraphQLOperationType.Mutation;
                // Option selectQueryOrMutationField can override operation type
                if (typeof ((_c = (_b = (_a = options === null || options === void 0 ? void 0 : options.selectQueryOrMutationField) === null || _a === void 0 ? void 0 : _a[oas.info.title]) === null || _b === void 0 ? void 0 : _b[path]) === null || _c === void 0 ? void 0 : _c[httpMethod]) === 'number'
                // This is an enum, which is an integer value
                ) {
                    operationType =
                        options.selectQueryOrMutationField[oas.info.title][path][httpMethod] === graphql_1.GraphQLOperationType.Mutation
                            ? graphql_1.GraphQLOperationType.Mutation
                            : graphql_1.GraphQLOperationType.Query;
                }
                const operationData = processOperation(path, httpMethod, operationString, operationType, operation, pathItem, oas, data, options);
                if (typeof operationData === 'object') {
                    /**
                     * Handle operationId property name collision
                     * May occur if multiple OAS are provided
                     */
                    if (!(operationData.operationId in data.operations)) {
                        data.operations[operationData.operationId] = operationData;
                    }
                    else {
                        utils_1.handleWarning({
                            mitigationType: utils_1.MitigationTypes.DUPLICATE_OPERATIONID,
                            message: `Multiple OASs share operations with the same operationId '${operationData.operationId}'`,
                            mitigationAddendum: `The operation from the OAS '${operationData.oas.info.title}' will be ignored`,
                            data,
                            log: preprocessingLog
                        });
                        return;
                    }
                }
                // Process all callbacks
                if (data.options.createSubscriptionsFromCallbacks &&
                    operation.callbacks) {
                    Object.entries(operation.callbacks).forEach(([callbackName, callbackObjectOrRef]) => {
                        let callback;
                        if ('$ref' in callbackObjectOrRef && typeof callbackObjectOrRef.$ref === 'string') {
                            callback = Oas3Tools.resolveRef(callbackObjectOrRef.$ref, oas);
                        }
                        else {
                            callback = callbackObjectOrRef;
                        }
                        Object.entries(callback).forEach(([callbackExpression, callbackPathItem]) => {
                            const resolvedCallbackPathItem = !('$ref' in callbackPathItem)
                                ? callbackPathItem
                                : Oas3Tools.resolveRef(callbackPathItem.$ref, oas);
                            const callbackOperationObjectMethods = Object.keys(resolvedCallbackPathItem).filter((objectKey) => {
                                /**
                                 * Get only fields that contain operation objects
                                 *
                                 * Can also contain other fields such as summary or description
                                 */
                                return Oas3Tools.isHttpMethod(objectKey);
                            });
                            if (callbackOperationObjectMethods.length > 0) {
                                if (callbackOperationObjectMethods.length > 1) {
                                    utils_1.handleWarning({
                                        mitigationType: utils_1.MitigationTypes.CALLBACKS_MULTIPLE_OPERATION_OBJECTS,
                                        message: `Callback '${callbackExpression}' on operation '${operationString}' has multiple operation objects with the methods '${callbackOperationObjectMethods}'. OpenAPI-to-GraphQL can only utilize one of these operation objects.`,
                                        mitigationAddendum: `The operation with the method '${callbackOperationObjectMethods[0]}' will be selected and all others will be ignored.`,
                                        data,
                                        log: preprocessingLog
                                    });
                                }
                                // Select only one of the operation object methods
                                const callbackRawMethod = callbackOperationObjectMethods[0];
                                const callbackOperationString = oass.length === 1
                                    ? Oas3Tools.formatOperationString(httpMethod, callbackName)
                                    : Oas3Tools.formatOperationString(httpMethod, callbackName, oas.info.title);
                                let callbackHttpMethod;
                                try {
                                    callbackHttpMethod = oas_3_tools_1.methodToHttpMethod(callbackRawMethod);
                                }
                                catch (e) {
                                    utils_1.handleWarning({
                                        mitigationType: utils_1.MitigationTypes.INVALID_HTTP_METHOD,
                                        message: `Invalid HTTP method '${rawMethod}' in callback '${callbackOperationString}' in operation '${operationString}'`,
                                        data,
                                        log: preprocessingLog
                                    });
                                    return;
                                }
                                const callbackOperation = processOperation(callbackExpression, callbackHttpMethod, callbackOperationString, graphql_1.GraphQLOperationType.Subscription, resolvedCallbackPathItem[callbackHttpMethod], callbackPathItem, oas, data, options);
                                if (callbackOperation) {
                                    /**
                                     * Handle operationId property name collision
                                     * May occur if multiple OAS are provided
                                     */
                                    if (callbackOperation &&
                                        !(callbackOperation.operationId in
                                            data.callbackOperations)) {
                                        data.callbackOperations[callbackOperation.operationId] = callbackOperation;
                                    }
                                    else {
                                        utils_1.handleWarning({
                                            mitigationType: utils_1.MitigationTypes.DUPLICATE_OPERATIONID,
                                            message: `Multiple OASs share callback operations with the same operationId '${callbackOperation.operationId}'`,
                                            mitigationAddendum: `The callback operation from the OAS '${operationData.oas.info.title}' will be ignored`,
                                            data,
                                            log: preprocessingLog
                                        });
                                    }
                                }
                            }
                        });
                    });
                }
            });
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
    for (let schemeKey in security) {
        const securityScheme = security[schemeKey];
        // Determine the schema and the parameters for the security protocol
        let schema;
        let parameters = {};
        let description;
        switch (securityScheme.type) {
            case 'apiKey':
                description = `API key credentials for the security protocol '${schemeKey}'`;
                if (data.oass.length > 1) {
                    description += ` in ${oas.info.title}`;
                }
                parameters = {
                    apiKey: Oas3Tools.sanitize(`${schemeKey}_apiKey`, Oas3Tools.CaseStyle.camelCase)
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
                switch (securityScheme.scheme) {
                    /**
                     * TODO: HTTP has a number of authentication types
                     *
                     * See http://www.iana.org/assignments/http-authschemes/http-authschemes.xhtml
                     */
                    case 'basic':
                        description = `Basic auth credentials for security protocol '${schemeKey}'`;
                        parameters = {
                            username: Oas3Tools.sanitize(`${schemeKey}_username`, Oas3Tools.CaseStyle.camelCase),
                            password: Oas3Tools.sanitize(`${schemeKey}_password`, Oas3Tools.CaseStyle.camelCase)
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
                            mitigationType: utils_1.MitigationTypes.UNSUPPORTED_HTTP_SECURITY_SCHEME,
                            message: `Currently unsupported HTTP authentication protocol ` +
                                `type 'http' and scheme '${securityScheme.scheme}' in OAS ` +
                                `'${oas.info.title}'`,
                            data,
                            log: preprocessingLog
                        });
                }
                break;
            // TODO: Implement
            case 'openIdConnect':
                utils_1.handleWarning({
                    mitigationType: utils_1.MitigationTypes.UNSUPPORTED_HTTP_SECURITY_SCHEME,
                    message: `Currently unsupported HTTP authentication protocol ` +
                        `type 'openIdConnect' in OAS '${oas.info.title}'`,
                    data,
                    log: preprocessingLog
                });
                break;
            case 'oauth2':
                utils_1.handleWarning({
                    mitigationType: utils_1.MitigationTypes.OAUTH_SECURITY_SCHEME,
                    message: `OAuth security scheme found in OAS '${oas.info.title}'`,
                    data,
                    log: preprocessingLog
                });
                // Continue because we do not want to create an OAuth viewer
                continue;
            default:
                utils_1.handleWarning({
                    mitigationType: utils_1.MitigationTypes.UNSUPPORTED_HTTP_SECURITY_SCHEME,
                    message: `Unsupported HTTP authentication protocol` +
                        `type '${securityScheme.type}' in OAS '${oas.info.title}'`,
                    data,
                    log: preprocessingLog
                });
        }
        // Add protocol data to the output
        result[schemeKey] = {
            rawName: schemeKey,
            def: securityScheme,
            parameters,
            schema,
            oas
        };
    }
    return result;
}
/**
 * Method to either create a new or reuse an existing, centrally stored data
 * definition.
 */
function createDataDef(names, schemaOrRef, isInputObjectType, data, oas, links) {
    const preferredName = getPreferredName(names);
    // Basic validation test
    if (typeof schemaOrRef !== 'object' && schemaOrRef !== null) {
        utils_1.handleWarning({
            mitigationType: utils_1.MitigationTypes.MISSING_SCHEMA,
            message: `Could not create data definition for schema with ` +
                `preferred name '${preferredName}' and schema '${JSON.stringify(schemaOrRef)}'`,
            data,
            log: preprocessingLog
        });
        return {
            preferredName,
            schema: null,
            required: [],
            links: null,
            subDefinitions: null,
            graphQLTypeName: null,
            graphQLInputObjectTypeName: null,
            targetGraphQLType: operation_1.TargetGraphQLType.json
        };
    }
    else {
        let schema;
        if ('$ref' in schemaOrRef && typeof schemaOrRef.$ref === 'string') {
            schema = Oas3Tools.resolveRef(schemaOrRef.$ref, oas);
        }
        else {
            schema = schemaOrRef;
        }
        const saneLinks = {};
        if (typeof links === 'object') {
            Object.keys(links).forEach((linkKey) => {
                saneLinks[Oas3Tools.sanitize(linkKey, !data.options.simpleNames
                    ? Oas3Tools.CaseStyle.camelCase
                    : Oas3Tools.CaseStyle.simple)] = links[linkKey];
            });
        }
        // Determine the index of possible existing data definition
        const index = getSchemaIndex(preferredName, schema, data.defs);
        // There is a preexisting data definition
        if (index !== -1) {
            // Found existing data definition and fetch it
            const existingDataDef = data.defs[index];
            /**
             * Collapse links if possible, i.e. if the current operation has links,
             * combine them with the prexisting ones
             */
            if (typeof existingDataDef.links === 'object') {
                // Check if there are any overlapping links
                Object.keys(existingDataDef.links).forEach((saneLinkKey) => {
                    if (!deepEqual(existingDataDef.links[saneLinkKey], saneLinks[saneLinkKey])) {
                        utils_1.handleWarning({
                            mitigationType: utils_1.MitigationTypes.DUPLICATE_LINK_KEY,
                            message: `Multiple operations with the same response body share the same sanitized ` +
                                `link key '${saneLinkKey}' but have different link definitions ` +
                                `'${JSON.stringify(existingDataDef.links[saneLinkKey])}' and ` +
                                `'${JSON.stringify(saneLinks[saneLinkKey])}'.`,
                            data,
                            log: preprocessingLog
                        });
                        return;
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
            return existingDataDef;
            // There is no preexisting data definition, so create a new one
        }
        else {
            const name = getSchemaName(names, data.usedTypeNames);
            // Store and sanitize the name
            const saneName = !data.options.simpleNames
                ? Oas3Tools.sanitize(name, Oas3Tools.CaseStyle.PascalCase)
                : Oas3Tools.capitalize(Oas3Tools.sanitize(name, Oas3Tools.CaseStyle.simple));
            const saneInputName = Oas3Tools.capitalize(saneName + 'Input');
            Oas3Tools.storeSaneName(saneName, name, data.saneMap);
            /**
             * Recursively resolve allOf so type, properties, anyOf, oneOf, and
             * required are resolved
             */
            const collapsedSchema = resolveAllOf(schema, {}, data, oas);
            const targetGraphQLType = Oas3Tools.getSchemaTargetGraphQLType(collapsedSchema, data, oas);
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
            if (targetGraphQLType === operation_1.TargetGraphQLType.object ||
                targetGraphQLType === operation_1.TargetGraphQLType.list ||
                targetGraphQLType === operation_1.TargetGraphQLType.enum) {
                data.usedTypeNames.push(saneName);
                data.usedTypeNames.push(saneInputName);
                // Add the def to the master list
                data.defs.push(def);
            }
            switch (targetGraphQLType) {
                case operation_1.TargetGraphQLType.object:
                    def.subDefinitions = {};
                    if (typeof collapsedSchema.properties === 'object' &&
                        Object.keys(collapsedSchema.properties).length > 0) {
                        addObjectPropertiesToDataDef(def, collapsedSchema, def.required, isInputObjectType, data, oas);
                    }
                    else {
                        utils_1.handleWarning({
                            mitigationType: utils_1.MitigationTypes.OBJECT_MISSING_PROPERTIES,
                            message: `Schema ${JSON.stringify(schema)} does not have ` +
                                `any properties`,
                            data,
                            log: preprocessingLog
                        });
                        def.targetGraphQLType = operation_1.TargetGraphQLType.json;
                    }
                    break;
                case operation_1.TargetGraphQLType.list:
                    if (typeof collapsedSchema.items === 'object') {
                        // Break schema down into component parts
                        // I.e. if it is an list type, create a reference to the list item type
                        // Or if it is an object type, create references to all of the field types
                        let itemsSchema = collapsedSchema.items;
                        let itemsName = `${name}ListItem`;
                        if ('$ref' in itemsSchema) {
                            itemsName = itemsSchema.$ref.split('/').pop();
                        }
                        const subDefinition = createDataDef(
                        // Is this the correct classification for this name? It does not matter in the long run.
                        { fromRef: itemsName }, itemsSchema, isInputObjectType, data, oas);
                        // Add list item reference
                        def.subDefinitions = subDefinition;
                    }
                    break;
                case operation_1.TargetGraphQLType.anyOfObject:
                    if (Array.isArray(collapsedSchema.anyOf)) {
                        createAnyOfObject(saneName, saneInputName, collapsedSchema, isInputObjectType, def, data, oas);
                    }
                    else {
                        // Error
                    }
                    break;
                case operation_1.TargetGraphQLType.oneOfUnion:
                    if (Array.isArray(collapsedSchema.oneOf)) {
                        createOneOfUnion(saneName, saneInputName, collapsedSchema, isInputObjectType, def, data, oas);
                    }
                    else {
                        // Error
                    }
                    break;
                case operation_1.TargetGraphQLType.json:
                    def.targetGraphQLType = operation_1.TargetGraphQLType.json;
                    break;
                case null:
                    // No target GraphQL type
                    utils_1.handleWarning({
                        mitigationType: utils_1.MitigationTypes.UNKNOWN_TARGET_TYPE,
                        message: `No GraphQL target type could be identified for schema '${JSON.stringify(schema)}'.`,
                        data,
                        log: preprocessingLog
                    });
                    def.targetGraphQLType = operation_1.TargetGraphQLType.json;
                    break;
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
    if (typeof names.fromExtension === 'string') {
        const saneName = Oas3Tools.sanitize(names.fromExtension, Oas3Tools.CaseStyle.PascalCase);
        if (!usedNames.includes(saneName)) {
            schemaName = names.fromExtension;
        }
    }
    // CASE: name from reference
    if (!schemaName && typeof names.fromRef === 'string') {
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
        schemaName = Oas3Tools.sanitize(typeof names.fromExtension === 'string'
            ? names.fromExtension
            : typeof names.fromRef === 'string'
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
 * Recursively add all of the properties of an object to the data definition
 */
function addObjectPropertiesToDataDef(def, schema, required, isInputObjectType, data, oas) {
    /**
     * Resolve all required properties
     *
     * TODO: required may contain duplicates, which is not necessarily a problem
     */
    if (Array.isArray(schema.required)) {
        schema.required.forEach((requiredProperty) => {
            required.push(requiredProperty);
        });
    }
    for (let propertyKey in schema.properties) {
        if (!(propertyKey in def.subDefinitions)) {
            let propSchemaName = propertyKey;
            const propSchemaOrRef = schema.properties[propertyKey];
            let propSchema;
            if ("$ref" in propSchemaOrRef && typeof propSchemaOrRef.$ref === 'string') {
                propSchemaName = propSchemaOrRef.$ref.split('/').pop();
                propSchema = Oas3Tools.resolveRef(propSchemaOrRef.$ref, oas);
            }
            else {
                propSchema = propSchemaOrRef;
            }
            const fromExtension = propSchema[Oas3Tools.OAS_GRAPHQL_EXTENSIONS.Name];
            const subDefinition = createDataDef({
                fromExtension,
                fromRef: propSchemaName,
                fromSchema: propSchema.title // TODO: Redundant because of fromRef but arguably, propertyKey is a better field name and title is a better type name
            }, propSchema, isInputObjectType, data, oas);
            // Add field type references
            def.subDefinitions[propertyKey] = subDefinition;
        }
        else {
            utils_1.handleWarning({
                mitigationType: utils_1.MitigationTypes.DUPLICATE_FIELD_NAME,
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
function resolveAllOf(schema, references, data, oas) {
    // Dereference schema
    if ("$ref" in schema && typeof schema.$ref === 'string') {
        if (schema.$ref in references) {
            return references[schema.$ref];
        }
        const reference = schema.$ref;
        schema = Oas3Tools.resolveRef(schema.$ref, oas);
        references[reference] = schema;
    }
    /**
     * TODO: Is there a better method to copy the schema?
     *
     * Copy the schema
     */
    const collapsedSchema = JSON.parse(JSON.stringify(schema));
    // Resolve allOf
    if (Array.isArray(collapsedSchema.allOf)) {
        collapsedSchema.allOf.forEach((memberSchema) => {
            const collapsedMemberSchema = resolveAllOf(memberSchema, references, data, oas);
            // Collapse type if applicable
            if (collapsedMemberSchema.type) {
                if (!collapsedSchema.type) {
                    collapsedSchema.type = collapsedMemberSchema.type;
                    // Check for incompatible schema type
                }
                else if (collapsedSchema.type !== collapsedMemberSchema.type) {
                    utils_1.handleWarning({
                        mitigationType: utils_1.MitigationTypes.UNRESOLVABLE_SCHEMA,
                        message: `Resolving 'allOf' field in schema '${JSON.stringify(collapsedSchema)}' ` + `results in incompatible schema type.`,
                        data,
                        log: preprocessingLog
                    });
                }
            }
            // Collapse properties if applicable
            if ('properties' in collapsedMemberSchema) {
                if (!('properties' in collapsedSchema)) {
                    collapsedSchema.properties = {};
                }
                Object.entries(collapsedMemberSchema.properties).forEach(([propertyName, property]) => {
                    if (!(propertyName in collapsedSchema.properties)) {
                        collapsedSchema.properties[propertyName] = property;
                        // Conflicting property
                    }
                    else {
                        utils_1.handleWarning({
                            mitigationType: utils_1.MitigationTypes.UNRESOLVABLE_SCHEMA,
                            message: `Resolving 'allOf' field in schema '${JSON.stringify(collapsedSchema)}' ` +
                                `results in incompatible property field '${propertyName}'.`,
                            data,
                            log: preprocessingLog
                        });
                    }
                });
            }
            // Collapse oneOf if applicable
            if ('oneOf' in collapsedMemberSchema) {
                if (!('oneOf' in collapsedSchema)) {
                    collapsedSchema.oneOf = [];
                }
                collapsedMemberSchema.oneOf.forEach((oneOfProperty) => {
                    collapsedSchema.oneOf.push(oneOfProperty);
                });
            }
            // Collapse anyOf if applicable
            if ('anyOf' in collapsedMemberSchema) {
                if (!('anyOf' in collapsedSchema)) {
                    collapsedSchema.anyOf = [];
                }
                collapsedMemberSchema.anyOf.forEach((anyOfProperty) => {
                    collapsedSchema.anyOf.push(anyOfProperty);
                });
            }
            // Collapse required if applicable
            if ('required' in collapsedMemberSchema) {
                if (!('required' in collapsedSchema)) {
                    collapsedSchema.required = [];
                }
                collapsedMemberSchema.required.forEach((requiredProperty) => {
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
        allRequired: [] // Contains the required of all the member schemas
    };
    schemas.forEach((schemaOrRef) => {
        // Dereference schemas
        let schema;
        if ("$ref" in schemaOrRef && typeof schemaOrRef.$ref === 'string') {
            schema = Oas3Tools.resolveRef(schemaOrRef.$ref, oas);
        }
        else {
            schema = schemaOrRef;
        }
        // Consolidate target GraphQL type
        const memberTargetGraphQLType = Oas3Tools.getSchemaTargetGraphQLType(schema, data, oas);
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
function createAnyOfObject(saneName, saneInputName, collapsedSchema, isInputObjectType, def, data, oas) {
    /**
     * Used to find incompatible properties
     *
     * Store a properties from the base and member schemas. Start with the base
     * schema properties.
     *
     * If there are multiple properties with the same name, it only needs to store
     * the contents of one of them.
     *
     * If it is conflicting, add to incompatiable
     * properties; if not, do nothing.
     */
    const allProperties = {};
    if ('properties' in collapsedSchema) {
        Object.entries(collapsedSchema.properties).forEach(([propertyName, propertyObjectOrRef]) => {
            let property;
            if ('$ref' in propertyObjectOrRef && typeof propertyObjectOrRef.$ref === 'string') {
                property = Oas3Tools.resolveRef(propertyObjectOrRef.$ref, oas);
            }
            else {
                property = propertyObjectOrRef;
            }
            allProperties[propertyName] = property;
        });
    }
    // Store the names of properties with conflicting contents
    const incompatibleProperties = new Set();
    // An array containing the properties of all member schemas
    const memberProperties = [];
    collapsedSchema.anyOf.forEach((memberSchemaOrRef) => {
        // Collapsed schema should already be recursively resolved
        let memberSchema;
        if ("$ref" in memberSchemaOrRef && typeof memberSchemaOrRef.$ref === 'string') {
            memberSchema = Oas3Tools.resolveRef(memberSchemaOrRef.$ref, oas);
        }
        else {
            memberSchema = memberSchemaOrRef;
        }
        if (memberSchema.properties) {
            const properties = {};
            Object.entries(memberSchema.properties).forEach(([propertyName, propertyObjectOrRef]) => {
                let property;
                if ('$ref' in propertyObjectOrRef && typeof propertyObjectOrRef.$ref === 'string') {
                    property = Oas3Tools.resolveRef(propertyObjectOrRef.$ref, oas);
                }
                else {
                    property = propertyObjectOrRef;
                }
                properties[propertyName] = property;
            });
            memberProperties.push(properties);
        }
    });
    /**
     * TODO: Check for consistent properties across all member schemas and
     * make them into non-nullable properties by manipulating the
     * required field
     */
    /**
     * Add properties from the member schemas (from anyOf) as well as check
     * for incompatible properties (conflicting properties between member
     * schemas and other member schemas or the base schema)
     */
    memberProperties.forEach((properties) => {
        Object.keys(properties).forEach((propertyName) => {
            if (!incompatibleProperties.has(propertyName) && // Has not been already identified as a problematic property
                typeof allProperties[propertyName] === 'object' &&
                !deepEqual(properties[propertyName], allProperties[propertyName])) {
                incompatibleProperties.add(propertyName);
            }
            /**
             * Save property to check in future iterations
             *
             * Can overwrite. If there is an incompatible property, we are
             * guaranteed to record it in incompatibleProperties
             */
            allProperties[propertyName] = properties[propertyName];
        });
    });
    def.subDefinitions = {};
    if (typeof collapsedSchema.properties === 'object' &&
        Object.keys(collapsedSchema.properties).length > 0) {
        /**
         * TODO: Instead of creating the entire dataDefinition, disregard
         * incompatible properties.
         */
        addObjectPropertiesToDataDef(def, collapsedSchema, def.required, isInputObjectType, data, oas);
    }
    memberProperties.forEach((properties) => {
        Object.keys(properties).forEach((propertyName) => {
            if (!incompatibleProperties.has(propertyName)) {
                // Dereferenced by processing anyOfData
                const propertySchema = properties[propertyName];
                const subDefinition = createDataDef({
                    fromRef: propertyName,
                    fromSchema: propertySchema.title // TODO: Currently not utilized because of fromRef but arguably, propertyKey is a better field name and title is a better type name
                }, propertySchema, isInputObjectType, data, oas);
                /**
                 * Add field type references
                 * There should not be any collisions
                 */
                def.subDefinitions[propertyName] = subDefinition;
            }
        });
    });
    // Add in incompatible properties
    incompatibleProperties.forEach((propertyName) => {
        // TODO: add description
        def.subDefinitions[propertyName] = {
            targetGraphQLType: operation_1.TargetGraphQLType.json
        };
    });
    data.usedTypeNames.push(saneName);
    data.usedTypeNames.push(saneInputName);
    data.defs.push(def);
    def.targetGraphQLType = operation_1.TargetGraphQLType.object;
    return def;
}
function createOneOfUnion(saneName, saneInputName, collapsedSchema, isInputObjectType, def, data, oas) {
    if (isInputObjectType) {
        utils_1.handleWarning({
            mitigationType: utils_1.MitigationTypes.INPUT_UNION,
            message: `Input object types cannot be composed of union types.`,
            data,
            log: preprocessingLog
        });
        def.targetGraphQLType = operation_1.TargetGraphQLType.json;
        return def;
    }
    def.subDefinitions = [];
    collapsedSchema.oneOf.forEach((memberSchemaOrRef) => {
        // Collapsed schema should already be recursively resolved
        let fromRef;
        let memberSchema;
        if ("$ref" in memberSchemaOrRef && typeof memberSchemaOrRef.$ref === 'string') {
            fromRef = memberSchemaOrRef.$ref.split('/').pop();
            memberSchema = Oas3Tools.resolveRef(memberSchemaOrRef.$ref, oas);
        }
        else {
            memberSchema = memberSchemaOrRef;
        }
        const subDefinition = createDataDef({
            fromRef,
            fromSchema: memberSchema.title,
            fromPath: `${saneName}Member`
        }, memberSchema, isInputObjectType, data, oas);
        def.subDefinitions.push(subDefinition);
    });
    // Not all member schemas may have been turned into GraphQL member types
    if (def.subDefinitions.length > 0 &&
        def.subDefinitions.every((subDefinition) => {
            return subDefinition.targetGraphQLType === operation_1.TargetGraphQLType.object;
        })) {
        // Ensure all member schemas have been verified as object types
        data.usedTypeNames.push(saneName);
        data.usedTypeNames.push(saneInputName);
        data.defs.push(def);
        def.targetGraphQLType = operation_1.TargetGraphQLType.oneOfUnion;
        return def;
    }
    else {
        utils_1.handleWarning({
            mitigationType: utils_1.MitigationTypes.COMBINE_SCHEMAS,
            message: `Schema '${JSON.stringify(def.schema)}' contains 'oneOf' so ` +
                `create a GraphQL union type but all member schemas are not` +
                `object types and union member types must be object types.`,
            mitigationAddendum: `Use arbitrary JSON type instead.`,
            data,
            log: preprocessingLog
        });
        def.targetGraphQLType = operation_1.TargetGraphQLType.json;
        return def;
    }
}
//# sourceMappingURL=preprocessor.js.map