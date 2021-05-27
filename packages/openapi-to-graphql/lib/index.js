"use strict";
// Copyright IBM Corp. 2018. All Rights Reserved.
// Node module: openapi-to-graphql
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT
Object.defineProperty(exports, "__esModule", { value: true });
exports.GraphQLOperationType = exports.sanitize = exports.CaseStyle = exports.createGraphQLSchema = void 0;
const graphql_1 = require("./types/graphql");
const graphql_2 = require("graphql");
// Imports:
const schema_builder_1 = require("./schema_builder");
const resolver_builder_1 = require("./resolver_builder");
const GraphQLTools = require("./graphql_tools");
const preprocessor_1 = require("./preprocessor");
const Oas3Tools = require("./oas_3_tools");
const auth_builder_1 = require("./auth_builder");
const debug_1 = require("debug");
const utils_1 = require("./utils");
const translationLog = debug_1.default('translation');
const DEFAULT_OPTIONS = {
    report: {
        warnings: [],
        numOps: 0,
        numOpsQuery: 0,
        numOpsMutation: 0,
        numOpsSubscription: 0,
        numQueriesCreated: 0,
        numMutationsCreated: 0,
        numSubscriptionsCreated: 0
    },
    // Setting default options
    strict: false,
    // Schema options
    operationIdFieldNames: false,
    fillEmptyResponses: false,
    addLimitArgument: false,
    idFormats: [],
    selectQueryOrMutationField: {},
    genericPayloadArgName: false,
    simpleNames: false,
    simpleEnumValues: false,
    singularNames: false,
    createSubscriptionsFromCallbacks: false,
    // Resolver options
    headers: {},
    qs: {},
    requestOptions: {},
    customResolvers: {},
    customSubscriptionResolvers: {},
    // Authentication options
    viewer: true,
    sendOAuthTokenInQuery: false,
    // Validation options
    oasValidatorOptions: {},
    swagger2OpenAPIOptions: {},
    // Logging options
    provideErrorExtensions: true,
    equivalentToMessages: true
};
/**
 * Creates a GraphQL interface from the given OpenAPI Specification (2 or 3).
 */
function createGraphQLSchema(spec, options) {
    return new Promise((resolve, reject) => {
        // Setting default options
        const internalOptions = Object.assign(Object.assign({}, DEFAULT_OPTIONS), options);
        if (Array.isArray(spec)) {
            // Convert all non-OAS 3 into OAS 3
            Promise.all(spec.map((ele) => {
                return Oas3Tools.getValidOAS3(ele, internalOptions.oasValidatorOptions, internalOptions.swagger2OpenAPIOptions);
            }))
                .then((oass) => {
                resolve(translateOpenAPIToGraphQL(oass, internalOptions));
            })
                .catch((error) => {
                reject(error);
            });
        }
        else {
            /**
             * Check if the spec is a valid OAS 3
             * If the spec is OAS 2.0, attempt to translate it into 3, then try to
             * translate the spec into a GraphQL schema
             */
            Oas3Tools.getValidOAS3(spec, internalOptions.oasValidatorOptions, internalOptions.swagger2OpenAPIOptions)
                .then((oas) => {
                resolve(translateOpenAPIToGraphQL([oas], internalOptions));
            })
                .catch((error) => {
                reject(error);
            });
        }
    });
}
exports.createGraphQLSchema = createGraphQLSchema;
/**
 * Creates a GraphQL interface from the given OpenAPI Specification 3
 */
function translateOpenAPIToGraphQL(oass, { strict, report, 
// Schema options
operationIdFieldNames, fillEmptyResponses, addLimitArgument, idFormats, selectQueryOrMutationField, genericPayloadArgName, simpleNames, simpleEnumValues, singularNames, createSubscriptionsFromCallbacks, 
// Resolver options
headers, qs, requestOptions, connectOptions, baseUrl, customResolvers, customSubscriptionResolvers, 
// Authentication options
viewer, tokenJSONpath, sendOAuthTokenInQuery, 
// Validation options
oasValidatorOptions, swagger2OpenAPIOptions, 
// Logging options
provideErrorExtensions, equivalentToMessages }) {
    const options = {
        strict,
        report,
        // Schema options
        operationIdFieldNames,
        fillEmptyResponses,
        addLimitArgument,
        idFormats,
        selectQueryOrMutationField,
        genericPayloadArgName,
        simpleNames,
        simpleEnumValues,
        singularNames,
        createSubscriptionsFromCallbacks,
        // Resolver options
        headers,
        qs,
        requestOptions,
        connectOptions,
        baseUrl,
        customResolvers,
        customSubscriptionResolvers,
        // Authentication options
        viewer,
        tokenJSONpath,
        sendOAuthTokenInQuery,
        // Validation options
        oasValidatorOptions,
        swagger2OpenAPIOptions,
        // Logging options
        provideErrorExtensions,
        equivalentToMessages
    };
    translationLog(`Options: ${JSON.stringify(options)}`);
    /**
     * Extract information from the OASs and put it inside a data structure that
     * is easier for OpenAPI-to-GraphQL to use
     */
    const data = preprocessor_1.preprocessOas(oass, options);
    preliminaryChecks(options, data);
    // Query, Mutation, and Subscription fields
    let queryFields = {};
    let mutationFields = {};
    let subscriptionFields = {};
    // Authenticated Query, Mutation, and Subscription fields
    let authQueryFields = {};
    let authMutationFields = {};
    let authSubscriptionFields = {};
    // Add Query and Mutation fields
    Object.entries(data.operations).forEach(([operationId, operation]) => {
        translationLog(`Process operation '${operation.operationString}'...`);
        // Check if the operation should be added as a Query or Mutation
        if (operation.operationType === graphql_1.GraphQLOperationType.Query) {
            addQueryFields({
                authQueryFields,
                queryFields,
                operationId,
                operation,
                options,
                data
            });
        }
        else if (operation.operationType === graphql_1.GraphQLOperationType.Mutation) {
            addMutationFields({
                authMutationFields,
                mutationFields,
                operationId,
                operation,
                options,
                data
            });
        }
    });
    // Add Subscription fields
    Object.entries(data.callbackOperations).forEach(([operationId, operation]) => {
        translationLog(`Process operation '${operationId}'...`);
        addSubscriptionFields({
            authSubscriptionFields,
            subscriptionFields,
            operationId,
            operation,
            options,
            data
        });
    });
    // Sorting fields
    queryFields = utils_1.sortObject(queryFields);
    mutationFields = utils_1.sortObject(mutationFields);
    subscriptionFields = utils_1.sortObject(subscriptionFields);
    authQueryFields = utils_1.sortObject(authQueryFields);
    Object.keys(authQueryFields).forEach((key) => {
        authQueryFields[key] = utils_1.sortObject(authQueryFields[key]);
    });
    authMutationFields = utils_1.sortObject(authMutationFields);
    Object.keys(authMutationFields).forEach((key) => {
        authMutationFields[key] = utils_1.sortObject(authMutationFields[key]);
    });
    authSubscriptionFields = utils_1.sortObject(authSubscriptionFields);
    Object.keys(authSubscriptionFields).forEach((key) => {
        authSubscriptionFields[key] = utils_1.sortObject(authSubscriptionFields[key]);
    });
    // Count created Query, Mutation, and Subscription fields
    report.numQueriesCreated =
        Object.keys(queryFields).length +
            Object.keys(authQueryFields).reduce((sum, key) => {
                return sum + Object.keys(authQueryFields[key]).length;
            }, 0);
    report.numMutationsCreated =
        Object.keys(mutationFields).length +
            Object.keys(authMutationFields).reduce((sum, key) => {
                return sum + Object.keys(authMutationFields[key]).length;
            }, 0);
    report.numSubscriptionsCreated =
        Object.keys(subscriptionFields).length +
            Object.keys(authSubscriptionFields).reduce((sum, key) => {
                return sum + Object.keys(authSubscriptionFields[key]).length;
            }, 0);
    /**
     * Organize authenticated Query, Mutation, and Subscriptions fields into
     * viewer objects.
     */
    if (Object.keys(authQueryFields).length > 0) {
        Object.assign(queryFields, auth_builder_1.createAndLoadViewer(authQueryFields, graphql_1.GraphQLOperationType.Query, data));
    }
    if (Object.keys(authMutationFields).length > 0) {
        Object.assign(mutationFields, auth_builder_1.createAndLoadViewer(authMutationFields, graphql_1.GraphQLOperationType.Mutation, data));
    }
    if (Object.keys(authSubscriptionFields).length > 0) {
        Object.assign(subscriptionFields, auth_builder_1.createAndLoadViewer(authSubscriptionFields, graphql_1.GraphQLOperationType.Subscription, data));
    }
    // Build up the schema
    const schemaConfig = {
        query: Object.keys(queryFields).length > 0
            ? new graphql_2.GraphQLObjectType({
                name: 'Query',
                fields: queryFields
            })
            : GraphQLTools.getEmptyObjectType('Query'),
        mutation: Object.keys(mutationFields).length > 0
            ? new graphql_2.GraphQLObjectType({
                name: 'Mutation',
                fields: mutationFields
            })
            : null,
        subscription: Object.keys(subscriptionFields).length > 0
            ? new graphql_2.GraphQLObjectType({
                name: 'Subscription',
                fields: subscriptionFields
            })
            : null
    };
    /**
     * Fill in yet undefined object types to avoid GraphQLSchema from breaking.
     *
     * The reason: once creating the schema, the 'fields' thunks will resolve and
     * if a field references an undefined object type, GraphQL will throw.
     */
    Object.entries(data.operations).forEach(([opId, operation]) => {
        if (typeof operation.responseDefinition.graphQLType === 'undefined') {
            operation.responseDefinition.graphQLType = GraphQLTools.getEmptyObjectType(operation.responseDefinition.graphQLTypeName);
        }
    });
    const schema = new graphql_2.GraphQLSchema(schemaConfig);
    return { schema, report, data };
}
function addQueryFields({ authQueryFields, queryFields, operationId, operation, options, data }) {
    const { operationIdFieldNames, singularNames, baseUrl, requestOptions, connectOptions } = options;
    const field = getFieldForOperation(operation, baseUrl, data, requestOptions, connectOptions);
    const saneOperationId = Oas3Tools.sanitize(operationId, Oas3Tools.CaseStyle.camelCase);
    // Field name provided by x-graphql-field-name OAS extension
    const extensionFieldName = operation.operation[Oas3Tools.OAS_GRAPHQL_EXTENSIONS.FieldName];
    const generatedFieldName = operationIdFieldNames
        ? saneOperationId // Sanitized (generated) operationId
        : singularNames
            ? Oas3Tools.sanitize(
            // Generated singular name
            Oas3Tools.inferResourceNameFromPath(operation.path), Oas3Tools.CaseStyle.camelCase)
            : Oas3Tools.uncapitalize(
            // Generated type name (to be used as a field name)
            operation.responseDefinition.graphQLTypeName);
    /**
     * The name of the field
     *
     * Priority order:
     *  1. (extensionFieldName) if the field name is provided by
     * x-graphql-field-name OAS extension, use it.
     *
     *  2. (operationIdFieldNames) if the operationIdFieldNames option is set
     * to true, then use the sane operationId.
     *
     *  3. (singularNames) if the singularNames option is set to true, then
     * generate a singular name and use it.
     *
     *  4. (default) use the generated type name and use it.
     */
    let fieldName = extensionFieldName || generatedFieldName;
    // Generate viewer
    if (operation.inViewer) {
        for (let securityRequirement of operation.securityRequirements) {
            if (typeof authQueryFields[securityRequirement] !== 'object') {
                authQueryFields[securityRequirement] = {};
            }
            // Check for extensionFieldName because it can create conflicts
            if (extensionFieldName &&
                extensionFieldName in authQueryFields[securityRequirement]) {
                throw new Error(`Cannot create query field with name "${extensionFieldName}".\nYou provided "${extensionFieldName}" in ${Oas3Tools.OAS_GRAPHQL_EXTENSIONS.FieldName}, but it conflicts with another field named "${extensionFieldName}"`);
            }
            /**
             * If using fieldName will cause a conflict, then try to use the
             * operationId instead.
             *
             * For example, the default behavior is to use the type name as a
             * field name and multiple operations can return the same type.
             */
            if (fieldName in authQueryFields[securityRequirement]) {
                fieldName = saneOperationId;
            }
            // Final fieldName verification
            if (fieldName in authQueryFields[securityRequirement]) {
                utils_1.handleWarning({
                    mitigationType: utils_1.MitigationTypes.DUPLICATE_FIELD_NAME,
                    message: `Multiple operations have the same name ` +
                        `'${fieldName}' and security requirement ` +
                        `'${securityRequirement}'. GraphQL field names must be ` +
                        `unique so only one can be added to the authentication ` +
                        `viewer. Operation '${operation.operationString}' will be ignored.`,
                    data,
                    log: translationLog
                });
                return;
            }
            authQueryFields[securityRequirement][fieldName] = field;
        }
    }
    else {
        // Check for extensionFieldName because it can create conflicts
        if (extensionFieldName && extensionFieldName in queryFields) {
            throw new Error(`Cannot create query field with name "${extensionFieldName}".\nYou provided "${extensionFieldName}" in ${Oas3Tools.OAS_GRAPHQL_EXTENSIONS.FieldName}, but it conflicts with another field named "${extensionFieldName}"`);
        }
        /**
         * If using fieldName will cause a conflict, then try to use the
         * operationId instead.
         *
         * For example, the default behavior is to use the type name as a
         * field name and multiple operations can return the same type.
         */
        if (fieldName in queryFields) {
            fieldName = saneOperationId;
        }
        // Final fieldName verification
        if (fieldName in queryFields) {
            utils_1.handleWarning({
                mitigationType: utils_1.MitigationTypes.DUPLICATE_FIELD_NAME,
                message: `Multiple operations have the same name ` +
                    `'${fieldName}'. GraphQL field names must be ` +
                    `unique so only one can be added to the Query object. ` +
                    `Operation '${operation.operationString}' will be ignored.`,
                data,
                log: translationLog
            });
            return;
        }
        // Add field into Query
        queryFields[fieldName] = field;
    }
}
function addMutationFields({ authMutationFields, mutationFields, operationId, operation, options, data }) {
    const { singularNames, baseUrl, requestOptions, connectOptions } = options;
    const field = getFieldForOperation(operation, baseUrl, data, requestOptions, connectOptions);
    const saneOperationId = Oas3Tools.sanitize(operationId, Oas3Tools.CaseStyle.camelCase);
    // Field name provided by x-graphql-field-name OAS extension
    const extensionFieldName = operation.operation[Oas3Tools.OAS_GRAPHQL_EXTENSIONS.FieldName];
    const generatedFieldName = singularNames
        ? Oas3Tools.sanitize(
        // Generated singular name with HTTP method
        `${operation.method}${Oas3Tools.inferResourceNameFromPath(operation.path)}`, Oas3Tools.CaseStyle.camelCase)
        : saneOperationId; // (Generated) operationId (for mutations, operationId is guaranteed unique)
    /**
     * The name of the field
     *
     * Priority order:
     *  1. (extensionFieldName) if the field name is provided by
     * x-graphql-field-name OAS extension, use it.
     *
     *  2. (singularNames) if the singularNames option is set to true, then
     * generate a singular name with the HTTP method and use it.
     *
     *  3. (default) use the (generated) operationId.
     */
    const fieldName = extensionFieldName || generatedFieldName;
    // Generate viewer
    if (operation.inViewer) {
        for (let securityRequirement of operation.securityRequirements) {
            if (typeof authMutationFields[securityRequirement] !== 'object') {
                authMutationFields[securityRequirement] = {};
            }
            // Check for extensionFieldName because it can create conflicts
            if (extensionFieldName &&
                extensionFieldName in authMutationFields[securityRequirement]) {
                throw new Error(`Cannot create mutation field with name "${extensionFieldName}".\nYou provided "${extensionFieldName}" in ${Oas3Tools.OAS_GRAPHQL_EXTENSIONS.FieldName}, but it conflicts with another field named "${extensionFieldName}"`);
            }
            // Final fieldName verification
            if (fieldName in authMutationFields[securityRequirement]) {
                utils_1.handleWarning({
                    mitigationType: utils_1.MitigationTypes.DUPLICATE_FIELD_NAME,
                    message: `Multiple operations have the same name ` +
                        `'${fieldName}' and security requirement ` +
                        `'${securityRequirement}'. GraphQL field names must be ` +
                        `unique so only one can be added to the authentication ` +
                        `viewer. Operation '${operation.operationString}' will be ignored.`,
                    data,
                    log: translationLog
                });
                return;
            }
            // Add field into viewer
            authMutationFields[securityRequirement][fieldName] = field;
        }
        // No viewer
    }
    else {
        // Check for extensionFieldName because it can create conflicts
        if (extensionFieldName && extensionFieldName in mutationFields) {
            throw new Error(`Cannot create mutation field with name "${extensionFieldName}".\nYou provided "${extensionFieldName}" in ${Oas3Tools.OAS_GRAPHQL_EXTENSIONS.FieldName}, but it conflicts with another field named "${extensionFieldName}"`);
        }
        // Final fieldName verification
        if (fieldName in mutationFields) {
            utils_1.handleWarning({
                mitigationType: utils_1.MitigationTypes.DUPLICATE_FIELD_NAME,
                message: `Multiple operations have the same name ` +
                    `'${fieldName}'. GraphQL field names must be ` +
                    `unique so only one can be added to the Mutation object. ` +
                    `Operation '${operation.operationString}' will be ignored.`,
                data,
                log: translationLog
            });
            return;
        }
        // Add field into Mutation
        mutationFields[fieldName] = field;
    }
}
function addSubscriptionFields({ authSubscriptionFields, subscriptionFields, operationId, operation, options, data }) {
    const { baseUrl, requestOptions, connectOptions } = options;
    const field = getFieldForOperation(operation, baseUrl, data, requestOptions, connectOptions);
    const saneOperationId = Oas3Tools.sanitize(operationId, Oas3Tools.CaseStyle.camelCase);
    const extensionFieldName = operation.operation[Oas3Tools.OAS_GRAPHQL_EXTENSIONS.FieldName];
    const fieldName = extensionFieldName || saneOperationId;
    // Generate viewer
    if (operation.inViewer) {
        for (let securityRequirement of operation.securityRequirements) {
            if (typeof authSubscriptionFields[securityRequirement] !== 'object') {
                authSubscriptionFields[securityRequirement] = {};
            }
            if (extensionFieldName &&
                extensionFieldName in authSubscriptionFields[securityRequirement]) {
                throw new Error(`Cannot create subscription field with name "${extensionFieldName}".\nYou provided "${extensionFieldName}" in ${Oas3Tools.OAS_GRAPHQL_EXTENSIONS.FieldName}, but it conflicts with another field named "${extensionFieldName}"`);
            }
            // Final fieldName verification
            if (fieldName in authSubscriptionFields[securityRequirement]) {
                utils_1.handleWarning({
                    mitigationType: utils_1.MitigationTypes.DUPLICATE_FIELD_NAME,
                    message: `Multiple operations have the same name ` +
                        `'${fieldName}' and security requirement ` +
                        `'${securityRequirement}'. GraphQL field names must be ` +
                        `unique so only one can be added to the authentication ` +
                        `viewer. Operation '${operation.operationString}' will be ignored.`,
                    data,
                    log: translationLog
                });
                return;
            }
            // Add field into viewer
            authSubscriptionFields[securityRequirement][fieldName] = field;
        }
        // No viewer
    }
    else {
        if (extensionFieldName && extensionFieldName in subscriptionFields) {
            throw new Error(`Cannot create subscription field with name "${extensionFieldName}".\nYou provided "${extensionFieldName}" in ${Oas3Tools.OAS_GRAPHQL_EXTENSIONS.FieldName}, but it conflicts with another field named "${extensionFieldName}"`);
        }
        // Final fieldName verification
        if (fieldName in subscriptionFields) {
            utils_1.handleWarning({
                mitigationType: utils_1.MitigationTypes.DUPLICATE_FIELD_NAME,
                message: `Multiple operations have the same name ` +
                    `'${fieldName}'. GraphQL field names must be ` +
                    `unique so only one can be added to the Mutation object. ` +
                    `Operation '${operation.operationString}' will be ignored.`,
                data,
                log: translationLog
            });
            return;
        }
        // Add field into Subscription
        subscriptionFields[fieldName] = field;
    }
}
/**
 * Creates the field object for the given operation.
 */
function getFieldForOperation(operation, baseUrl, data, requestOptions, connectOptions) {
    // Create GraphQL Type for response:
    const type = schema_builder_1.getGraphQLType({
        def: operation.responseDefinition,
        data,
        operation
    });
    const payloadSchemaName = operation.payloadDefinition
        ? operation.payloadDefinition.graphQLInputObjectTypeName
        : null;
    const args = schema_builder_1.getArgs({
        /**
         * Even though these arguments seems redundent because of the operation
         * argument, the function cannot be refactored because it is also used to
         * create arguments for links. The operation argument is really used to pass
         * data to other functions.
         */
        requestPayloadDef: operation.payloadDefinition,
        parameters: operation.parameters,
        operation,
        data
    });
    // Get resolver and subscribe function for Subscription fields
    if (operation.operationType === graphql_1.GraphQLOperationType.Subscription) {
        const responseSchemaName = operation.responseDefinition
            ? operation.responseDefinition.graphQLTypeName
            : null;
        const resolve = resolver_builder_1.getPublishResolver({
            operation,
            responseName: responseSchemaName,
            data
        });
        const subscribe = resolver_builder_1.getSubscribe({
            operation,
            payloadName: payloadSchemaName,
            data,
            baseUrl,
            connectOptions
        });
        return {
            type,
            resolve,
            subscribe,
            args,
            description: operation.description
        };
        // Get resolver for Query and Mutation fields
    }
    else {
        const resolve = resolver_builder_1.getResolver({
            operation,
            payloadName: payloadSchemaName,
            data,
            baseUrl,
            requestOptions
        });
        return {
            type,
            resolve,
            args,
            description: operation.description
        };
    }
}
/**
 * Ensure that the customResolvers/customSubscriptionResolvers object is a
 * triply nested object using the name of the OAS, the path, and the method
 * as keys.
 */
function checkCustomResolversStructure(customResolvers, data) {
    if (typeof customResolvers === 'object') {
        // Check that all OASs that are referenced in the customResolvers are provided
        Object.keys(customResolvers)
            .filter((title) => {
            // If no OAS contains this title
            return !data.oass.some((oas) => {
                return title === oas.info.title;
            });
        })
            .forEach((title) => {
            utils_1.handleWarning({
                mitigationType: utils_1.MitigationTypes.CUSTOM_RESOLVER_UNKNOWN_OAS,
                message: `Custom resolvers reference OAS '${title}' but no such ` +
                    `OAS was provided`,
                data,
                log: translationLog
            });
        });
        // TODO: Only run the following test on OASs that exist. See previous check.
        Object.keys(customResolvers).forEach((title) => {
            // Get all operations from a particular OAS
            const operations = Object.values(data.operations).filter((operation) => {
                return title === operation.oas.info.title;
            });
            Object.keys(customResolvers[title]).forEach((path) => {
                Object.keys(customResolvers[title][path]).forEach((method) => {
                    if (!operations.some((operation) => {
                        return path === operation.path && method === operation.method;
                    })) {
                        utils_1.handleWarning({
                            mitigationType: utils_1.MitigationTypes.CUSTOM_RESOLVER_UNKNOWN_PATH_METHOD,
                            message: `A custom resolver references an operation with ` +
                                `path '${path}' and method '${method}' but no such operation ` +
                                `exists in OAS '${title}'`,
                            data,
                            log: translationLog
                        });
                    }
                });
            });
        });
    }
}
/**
 * Ensures that the options are valid
 */
function preliminaryChecks(options, data) {
    // Check if OASs have unique titles
    const titles = data.oass.map((oas) => {
        return oas.info.title;
    });
    // Find duplicates among titles
    new Set(titles.filter((title, index) => {
        return titles.indexOf(title) !== index;
    })).forEach((title) => {
        utils_1.handleWarning({
            mitigationType: utils_1.MitigationTypes.MULTIPLE_OAS_SAME_TITLE,
            message: `Multiple OAS share the same title '${title}'`,
            data,
            log: translationLog
        });
    });
    // Check customResolvers
    checkCustomResolversStructure(options.customResolvers, data);
    // Check customSubscriptionResolvers
    checkCustomResolversStructure(options.customSubscriptionResolvers, data);
}
var oas_3_tools_1 = require("./oas_3_tools");
Object.defineProperty(exports, "CaseStyle", { enumerable: true, get: function () { return oas_3_tools_1.CaseStyle; } });
Object.defineProperty(exports, "sanitize", { enumerable: true, get: function () { return oas_3_tools_1.sanitize; } });
var graphql_3 = require("./types/graphql");
Object.defineProperty(exports, "GraphQLOperationType", { enumerable: true, get: function () { return graphql_3.GraphQLOperationType; } });
//# sourceMappingURL=index.js.map