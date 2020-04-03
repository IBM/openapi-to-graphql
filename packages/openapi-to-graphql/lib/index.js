"use strict";
// Copyright IBM Corp. 2018. All Rights Reserved.
// Node module: openapi-to-graphql
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const graphql_1 = require("graphql");
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
/**
 * Creates a GraphQL interface from the given OpenAPI Specification (2 or 3).
 */
function createGraphQLSchema(spec, options) {
    return __awaiter(this, void 0, void 0, function* () {
        if (typeof options === 'undefined') {
            options = {};
        }
        // Setting default options
        options.strict = typeof options.strict === 'boolean' ? options.strict : false;
        // Schema options
        options.operationIdFieldNames =
            typeof options.operationIdFieldNames === 'boolean'
                ? options.operationIdFieldNames
                : false;
        options.fillEmptyResponses =
            typeof options.fillEmptyResponses === 'boolean'
                ? options.fillEmptyResponses
                : false;
        options.addLimitArgument =
            typeof options.addLimitArgument === 'boolean'
                ? options.addLimitArgument
                : false;
        options.genericPayloadArgName =
            typeof options.genericPayloadArgName === 'boolean'
                ? options.genericPayloadArgName
                : false;
        options.createSubscriptionsFromCallbacks =
            typeof options.createSubscriptionsFromCallbacks === 'boolean'
                ? options.createSubscriptionsFromCallbacks
                : false;
        // Authentication options
        options.viewer = typeof options.viewer === 'boolean' ? options.viewer : true;
        options.sendOAuthTokenInQuery =
            typeof options.sendOAuthTokenInQuery === 'boolean'
                ? options.sendOAuthTokenInQuery
                : false;
        // Logging options
        options.provideErrorExtensions =
            typeof options.provideErrorExtensions === 'boolean'
                ? options.provideErrorExtensions
                : true;
        options.equivalentToMessages =
            typeof options.equivalentToMessages === 'boolean'
                ? options.equivalentToMessages
                : true;
        options['report'] = {
            warnings: [],
            numOps: 0,
            numOpsQuery: 0,
            numOpsMutation: 0,
            numOpsSubscription: 0,
            numQueriesCreated: 0,
            numMutationsCreated: 0,
            numSubscriptionsCreated: 0
        };
        let oass;
        if (Array.isArray(spec)) {
            /**
             * Convert all non-OAS 3.0.x into OAS 3.0.x
             */
            oass = yield Promise.all(spec.map(ele => {
                return Oas3Tools.getValidOAS3(ele);
            }));
        }
        else {
            /**
             * Check if the spec is a valid OAS 3.0.x
             * If the spec is OAS 2.0, attempt to translate it into 3.0.x, then try to
             * translate the spec into a GraphQL schema
             */
            oass = [yield Oas3Tools.getValidOAS3(spec)];
        }
        const { schema, report } = yield translateOpenAPIToGraphQL(oass, options);
        return {
            schema,
            report
        };
    });
}
exports.createGraphQLSchema = createGraphQLSchema;
/**
 * Creates a GraphQL interface from the given OpenAPI Specification 3.0.x
 */
function translateOpenAPIToGraphQL(oass, { strict, report, 
// Schema options
operationIdFieldNames, fillEmptyResponses, addLimitArgument, idFormats, selectQueryOrMutationField, genericPayloadArgName, 
// Resolver options
headers, qs, requestOptions, connectOptions, baseUrl, customResolvers, createSubscriptionsFromCallbacks, 
// Authentication options
viewer, tokenJSONpath, sendOAuthTokenInQuery, 
// Logging options
provideErrorExtensions, equivalentToMessages }) {
    return __awaiter(this, void 0, void 0, function* () {
        const options = {
            strict,
            report,
            // Schema options
            operationIdFieldNames,
            fillEmptyResponses,
            addLimitArgument,
            idFormats,
            genericPayloadArgName,
            // Resolver options
            headers,
            qs,
            requestOptions,
            connectOptions,
            baseUrl,
            customResolvers,
            selectQueryOrMutationField,
            createSubscriptionsFromCallbacks,
            // Authentication options
            viewer,
            tokenJSONpath,
            sendOAuthTokenInQuery,
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
        /**
         * Create GraphQL fields for every operation and structure them based on their
         * characteristics (query vs. mutation, auth vs. non-auth).
         */
        let queryFields = {};
        let mutationFields = {};
        let subscriptionFields = {};
        let authQueryFields = {};
        let authMutationFields = {};
        let authSubscriptionFields = {};
        // todo parse data.callbacks to recompose subscription ?
        Object.entries(data.operations).forEach(([operationId, operation]) => {
            translationLog(`Process operation '${operationId}'...`);
            let field = getFieldForOperation(operation, options.baseUrl, data, requestOptions, connectOptions);
            const saneOperationId = Oas3Tools.sanitize(operationId, Oas3Tools.CaseStyle.camelCase);
            // Check if the operation should be added as a Query | Mutation | Subscription field
            if (!operation.isMutation && !operation.isSubscription) {
                let fieldName = Oas3Tools.uncapitalize(operation.responseDefinition.graphQLTypeName);
                if (operation.inViewer) {
                    for (let securityRequirement of operation.securityRequirements) {
                        if (typeof authQueryFields[securityRequirement] !== 'object') {
                            authQueryFields[securityRequirement] = {};
                        }
                        // Avoid overwriting fields that return the same data:
                        if (fieldName in authQueryFields[securityRequirement] ||
                            /**
                             * If the option is set operationIdFieldNames, the fieldName is
                             * forced to be the operationId
                             */
                            operationIdFieldNames) {
                            fieldName = Oas3Tools.storeSaneName(saneOperationId, operationId, data.saneMap);
                        }
                        if (fieldName in authQueryFields[securityRequirement]) {
                            utils_1.handleWarning({
                                typeKey: 'DUPLICATE_FIELD_NAME',
                                message: `Multiple operations have the same name ` +
                                    `'${fieldName}' and security requirement ` +
                                    `'${securityRequirement}'. GraphQL field names must be ` +
                                    `unique so only one can be added to the authentication ` +
                                    `viewer. Operation '${operation.operationString}' will be ignored.`,
                                data,
                                log: translationLog
                            });
                        }
                        else {
                            authQueryFields[securityRequirement][fieldName] = field;
                        }
                    }
                }
                else {
                    // Avoid overwriting fields that return the same data:
                    if (fieldName in queryFields ||
                        /**
                         * If the option is set operationIdFieldNames, the fieldName is
                         * forced to be the operationId
                         */
                        operationIdFieldNames) {
                        fieldName = Oas3Tools.storeSaneName(saneOperationId, operationId, data.saneMap);
                    }
                    if (fieldName in queryFields) {
                        utils_1.handleWarning({
                            typeKey: 'DUPLICATE_FIELD_NAME',
                            message: `Multiple operations have the same name ` +
                                `'${fieldName}'. GraphQL field names must be ` +
                                `unique so only one can be added to the Query object. ` +
                                `Operation '${operation.operationString}' will be ignored.`,
                            data,
                            log: translationLog
                        });
                    }
                    else {
                        queryFields[fieldName] = field;
                    }
                }
            }
            else if (operation.isMutation && !operation.isSubscription) {
                /**
                 * Use operationId to avoid problems differentiating operations with the
                 * same path but different methods
                 */
                let saneFieldName = Oas3Tools.storeSaneName(saneOperationId, operationId, data.saneMap);
                if (operation.inViewer) {
                    for (let securityRequirement of operation.securityRequirements) {
                        if (typeof authMutationFields[securityRequirement] !== 'object') {
                            authMutationFields[securityRequirement] = {};
                        }
                        if (saneFieldName in authMutationFields[securityRequirement]) {
                            utils_1.handleWarning({
                                typeKey: 'DUPLICATE_FIELD_NAME',
                                message: `Multiple operations have the same name ` +
                                    `'${saneFieldName}' and security requirement ` +
                                    `'${securityRequirement}'. GraphQL field names must be ` +
                                    `unique so only one can be added to the authentication ` +
                                    `viewer. Operation '${operation.operationString}' will be ignored.`,
                                data,
                                log: translationLog
                            });
                        }
                        else {
                            authMutationFields[securityRequirement][saneFieldName] = field;
                        }
                    }
                }
                else {
                    if (saneFieldName in mutationFields) {
                        utils_1.handleWarning({
                            typeKey: 'DUPLICATE_FIELD_NAME',
                            message: `Multiple operations have the same name ` +
                                `'${saneFieldName}'. GraphQL field names must be ` +
                                `unique so only one can be added to the Mutation object. ` +
                                `Operation '${operation.operationString}' will be ignored.`,
                            data,
                            log: translationLog
                        });
                    }
                    else {
                        mutationFields[saneFieldName] = field;
                    }
                }
            }
            else if (operation.isSubscription) {
                // handle subscriptions from operation.callbacks
                // 1) cbName would be the subscription field name
                // each paths contained in operation.callbacks[cbName]
                // would be a channel to subscribe on the resolver
                // but if callback object contains several operations
                // how to be sure that the returned Graphql type would be the same ?
                // By "forcing' a common response schema for every operation within the CB ?
                // 2) cbName would be a prefix to the subscription field name
                // each paths contained in operation.callbacks[cbName] would be appended to create a unique subscription
                // console.log('SUB FIELD', field.args, field.subscribe.toString(), field.resolve.toString())
                // console.log('SUB FIELD', operation)
                let saneFieldName = Oas3Tools.storeSaneName(saneOperationId, operationId, data.saneMap);
                if (operation.inViewer) {
                    for (let securityRequirement of operation.securityRequirements) {
                        if (typeof authSubscriptionFields[securityRequirement] !== 'object') {
                            authSubscriptionFields[securityRequirement] = {};
                        }
                        if (saneFieldName in authSubscriptionFields[securityRequirement]) {
                            utils_1.handleWarning({
                                typeKey: 'DUPLICATE_FIELD_NAME',
                                message: `Multiple operations have the same name ` +
                                    `'${saneFieldName}' and security requirement ` +
                                    `'${securityRequirement}'. GraphQL field names must be ` +
                                    `unique so only one can be added to the authentication ` +
                                    `viewer. Operation '${operation.operationString}' will be ignored.`,
                                data,
                                log: translationLog
                            });
                        }
                        else {
                            authSubscriptionFields[securityRequirement][saneFieldName] = field;
                        }
                    }
                }
                else {
                    if (saneFieldName in subscriptionFields) {
                        utils_1.handleWarning({
                            typeKey: 'DUPLICATE_FIELD_NAME',
                            message: `Multiple operations have the same name ` +
                                `'${saneFieldName}'. GraphQL field names must be ` +
                                `unique so only one can be added to the Mutation object. ` +
                                `Operation '${operation.operationString}' will be ignored.`,
                            data,
                            log: translationLog
                        });
                    }
                    else {
                        subscriptionFields[saneFieldName] = field;
                    }
                }
            }
        });
        // Sorting fields
        queryFields = utils_1.sortObject(queryFields);
        mutationFields = utils_1.sortObject(mutationFields);
        subscriptionFields = utils_1.sortObject(subscriptionFields);
        authQueryFields = utils_1.sortObject(authQueryFields);
        Object.keys(authQueryFields).forEach(key => {
            authQueryFields[key] = utils_1.sortObject(authQueryFields[key]);
        });
        authMutationFields = utils_1.sortObject(authMutationFields);
        Object.keys(authMutationFields).forEach(key => {
            authMutationFields[key] = utils_1.sortObject(authMutationFields[key]);
        });
        authSubscriptionFields = utils_1.sortObject(authSubscriptionFields);
        Object.keys(authSubscriptionFields).forEach(key => {
            authSubscriptionFields[key] = utils_1.sortObject(authSubscriptionFields[key]);
        });
        /**
         * Count created queries / mutations
         */
        options.report.numQueriesCreated =
            Object.keys(queryFields).length +
                Object.keys(authQueryFields).reduce((sum, key) => {
                    return sum + Object.keys(authQueryFields[key]).length;
                }, 0);
        options.report.numMutationsCreated =
            Object.keys(mutationFields).length +
                Object.keys(authMutationFields).reduce((sum, key) => {
                    return sum + Object.keys(authMutationFields[key]).length;
                }, 0);
        options.report.numSubscriptionsCreated =
            Object.keys(subscriptionFields).length +
                Object.keys(authSubscriptionFields).reduce((sum, key) => {
                    return sum + Object.keys(authSubscriptionFields[key]).length;
                }, 0);
        /**
         * Organize created queries / mutations / subscriptions into viewer objects.
         */
        if (Object.keys(authQueryFields).length > 0) {
            Object.assign(queryFields, auth_builder_1.createAndLoadViewer(authQueryFields, data, false, false));
        }
        if (Object.keys(authMutationFields).length > 0) {
            Object.assign(mutationFields, auth_builder_1.createAndLoadViewer(authMutationFields, data, true, false));
        }
        if (Object.keys(authSubscriptionFields).length > 0) {
            Object.assign(subscriptionFields, auth_builder_1.createAndLoadViewer(authSubscriptionFields, data, true, true));
        }
        /**
         * Build up the schema
         */
        const schemaConfig = {
            query: Object.keys(queryFields).length > 0
                ? new graphql_1.GraphQLObjectType({
                    name: 'Query',
                    description: 'The start of any query',
                    fields: queryFields
                })
                : GraphQLTools.getEmptyObjectType('Query'),
            mutation: Object.keys(mutationFields).length > 0
                ? new graphql_1.GraphQLObjectType({
                    name: 'Mutation',
                    description: 'The start of any mutation',
                    fields: mutationFields
                })
                : null,
            subscription: Object.keys(subscriptionFields).length > 0
                ? new graphql_1.GraphQLObjectType({
                    name: 'Subscription',
                    description: 'The start of any subscription',
                    fields: subscriptionFields
                })
                : null
        };
        /**
         * Fill in yet undefined object types to avoid GraphQLSchema from breaking.
         *
         * The reason: once creating the schema, the 'fields' thunks will resolve and
         * if a field references an undefined object types, GraphQL will throw.
         */
        Object.entries(data.operations).forEach(([opId, operation]) => {
            if (typeof operation.responseDefinition.graphQLType === 'undefined') {
                operation.responseDefinition.graphQLType = GraphQLTools.getEmptyObjectType(operation.responseDefinition.graphQLTypeName);
            }
        });
        const schema = new graphql_1.GraphQLSchema(schemaConfig);
        return { schema, report: options.report };
    });
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
    // Create resolve function:
    const payloadSchemaName = operation.payloadDefinition
        ? operation.payloadDefinition.graphQLInputObjectTypeName
        : null;
    // Create args:
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
    if (operation.isSubscription) {
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
    }
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
/**
 * Ensures that the options are valid
 */
function preliminaryChecks(options, data) {
    // Check if OASs have unique titles
    const titles = data.oass.map(oas => {
        return oas.info.title;
    });
    // Find duplicates among titles
    new Set(titles.filter((title, index) => {
        return titles.indexOf(title) !== index;
    })).forEach(title => {
        utils_1.handleWarning({
            typeKey: 'MULTIPLE_OAS_SAME_TITLE',
            message: `Multiple OAS share the same title '${title}'`,
            data,
            log: translationLog
        });
    });
    // Check customResolvers
    if (typeof options.customResolvers === 'object') {
        // Check that all OASs that are referenced in the customResolvers are provided
        Object.keys(options.customResolvers)
            .filter(title => {
            // If no OAS contains this title
            return !data.oass.some(oas => {
                return title === oas.info.title;
            });
        })
            .forEach(title => {
            utils_1.handleWarning({
                typeKey: 'CUSTOM_RESOLVER_UNKNOWN_OAS',
                message: `Custom resolvers reference OAS '${title}' but no such ` +
                    `OAS was provided`,
                data,
                log: translationLog
            });
        });
        // TODO: Only run the following test on OASs that exist. See previous check.
        Object.keys(options.customResolvers).forEach(title => {
            // Get all operations from a particular OAS
            const operations = Object.values(data.operations).filter(operation => {
                return title === operation.oas.info.title;
            });
            Object.keys(options.customResolvers[title]).forEach(path => {
                Object.keys(options.customResolvers[title][path]).forEach(method => {
                    if (!operations.some(operation => {
                        return path === operation.path && method === operation.method;
                    })) {
                        utils_1.handleWarning({
                            typeKey: 'CUSTOM_RESOLVER_UNKNOWN_PATH_METHOD',
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
var oas_3_tools_1 = require("./oas_3_tools");
exports.sanitize = oas_3_tools_1.sanitize;
exports.CaseStyle = oas_3_tools_1.CaseStyle;
var graphql_2 = require("./types/graphql");
exports.GraphQLOperationType = graphql_2.GraphQLOperationType;
//# sourceMappingURL=index.js.map