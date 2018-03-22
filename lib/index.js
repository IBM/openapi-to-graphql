"use strict";
/**
 * Defines the functions exposed by OASGraph.
 *
 * Some general notes:
 *
 * - GraphQL interfaces rely on sanitized strings for (Input) Object Type names
 *   and fields. We perform sanitization only when assigning (field-) names, but
 *   keep keys in the OAS otherwise as-is, to ensure that inner-OAS references
 *   work as expected.
 *
 * - GraphQL (Input) Object Types must have a unique name. Thus, sometimes Input
 *   Object Types and Object Types need separate names, despite them having the
 *   same structure. We thus append 'Input' to every Input Object Type's name
 *   as a convention.
 *
 * - To pass data between resolve functions, OASGraph uses a _oasgraph object
 *   returned by every resolver in addition to its original data (OASGraph does
 *   not use the context to do so, which is an anti-pattern according to=
 *   https://github.com/graphql/graphql-js/issues/953).
 *
 * - OasGraph can handle basic authentication and api key-based authentication
 *   through GraphQL. To do this, OASGraph creates two new intermediate Object
 *   Types called QueryViewer and MutationViewer that take as input security
 *   credentials and pass them on using the _oasgraph object to other resolve
 *   functions.
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
// Imports:
const schema_builder_1 = require("./schema_builder");
const resolver_builder_1 = require("./resolver_builder");
const GraphQLTools = require("./graphql_tools");
const preprocessor_1 = require("./preprocessor");
const Oas3Tools = require("./oas_3_tools");
const auth_builder_1 = require("./auth_builder");
const debug_1 = require("debug");
const graphql_1 = require("graphql");
const log = debug_1.default('translation');
/**
 * Creates a GraphQL interface from the given OpenAPI Specification (2 or 3).
 */
function createGraphQlSchema(spec, options) {
    return __awaiter(this, void 0, void 0, function* () {
        // deal with option defaults:
        // @ts-ignore
        if (typeof options === 'undefined')
            options = {};
        options.strict = typeof options.strict === 'boolean'
            ? options.strict
            : false;
        options.addSubOperations = typeof options.addSubOperations === 'boolean'
            ? options.addSubOperations
            : false;
        options.viewer = typeof options.viewer === 'boolean'
            ? options.viewer
            : true;
        options.sendOAuthTokenInQuery = typeof options.sendOAuthTokenInQuery === 'boolean'
            ? options.sendOAuthTokenInQuery
            : false;
        options.report = {
            warnings: [],
            numOps: 0,
            numOpsQuery: 0,
            numOpsMutation: 0,
            numQueriesCreated: 0,
            numMutationsCreated: 0
        };
        /**
         * Check if the spec is a valid OAS 3.0.x
         * If the spec is OAS 2.0, attempt to translate it into 3.0.x, then try to
         * translate the spec into a GraphQL schema
         */
        let oas = yield Oas3Tools.getValidOAS3(spec);
        let { schema, report } = yield translateOpenApiToGraphQL(oas, options);
        return {
            schema,
            report
        };
    });
}
exports.createGraphQlSchema = createGraphQlSchema;
/**
 * Creates a GraphQL interface from the given OpenAPI Specification 3.0.x
 */
function translateOpenApiToGraphQL(oas, { strict, headers, qs, viewer, tokenJSONpath, addSubOperations, sendOAuthTokenInQuery, report }) {
    return __awaiter(this, void 0, void 0, function* () {
        let options = {
            headers,
            qs,
            viewer,
            tokenJSONpath,
            strict,
            addSubOperations,
            sendOAuthTokenInQuery,
            report
        };
        log(`Options: ${JSON.stringify(options)}`);
        /**
         * Extract information from the OAS and put it inside a data structure that
         * is easier for OASGraph to use
         */
        let data = preprocessor_1.preprocessOas(oas, options);
        // holds unauthenticated query fields
        let queryFields = {};
        // holds unauthenticated mutation fields
        let mutationFields = {};
        // holds authenticated query fields
        let authQueryFields = {};
        // holds authenticated mutation fields
        let authMutationFields = {};
        /**
         * Translate every endpoint to GraphQL schemes.
         */
        Object.entries(data.operations)
            .sort(([op1Id, op1], [op2Id, op2]) => sortByHasLinksOrSubOps(op1, op2))
            .forEach(([operationId, operation]) => {
            log(`Process operation "${operationId}"...`);
            let field = getFieldForOperation(operation, data, oas);
            if (!operation.isMutation) {
                let name = operation.resDef.otName;
                if (operation.inViewer) {
                    for (let securityRequirement of operation.securityRequirements) {
                        if (typeof authQueryFields[securityRequirement] !== 'object') {
                            authQueryFields[securityRequirement] = {};
                        }
                        // Avoid overwriting fields that return the same data:
                        if (name in authQueryFields[securityRequirement])
                            name = Oas3Tools.beautifyAndStore(operationId, data.saneMap);
                        authQueryFields[securityRequirement][name] = field;
                    }
                }
                else {
                    // Avoid overwriting fields that return the same data:
                    if (name in queryFields)
                        name = Oas3Tools.beautifyAndStore(operationId, data.saneMap);
                    queryFields[name] = field;
                }
            }
            else {
                // Use operationId to avoid problems differentiating operations with the
                // same path but differnet methods
                let saneName = Oas3Tools.beautifyAndStore(operationId, data.saneMap);
                if (operation.inViewer) {
                    for (let securityRequirement of operation.securityRequirements) {
                        if (typeof authMutationFields[securityRequirement] !== 'object')
                            authMutationFields[securityRequirement] = {};
                        authMutationFields[securityRequirement][saneName] = field;
                    }
                }
                else {
                    mutationFields[saneName] = field;
                }
            }
        });
        /**
         * Count created queries / mutations
         */
        let numQueriesCreated = Object.keys(queryFields).length;
        for (let key in authQueryFields)
            numQueriesCreated += Object.keys(authQueryFields[key]).length;
        options.report.numQueriesCreated = numQueriesCreated;
        let numMutationsCreated = Object.keys(mutationFields).length;
        for (let key in authMutationFields)
            numMutationsCreated += Object.keys(authMutationFields[key]).length;
        options.report.numMutationsCreated = numMutationsCreated;
        /**
         * Organize created queries / mutations into viewer objects.
         */
        if (Object.keys(authQueryFields).length > 0)
            Object.assign(queryFields, auth_builder_1.createAndLoadViewer(authQueryFields, data, oas, false));
        if (Object.keys(authMutationFields).length > 0)
            Object.assign(mutationFields, auth_builder_1.createAndLoadViewer(authMutationFields, data, oas, true));
        /**
         * Build up the schema
         */
        let schemaConfig = {
            query: Object.keys(queryFields).length > 0
                ? new graphql_1.GraphQLObjectType({
                    name: 'query',
                    description: 'The start of any query',
                    fields: queryFields
                })
                : GraphQLTools.getEmptyObjectType('query'),
            mutation: Object.keys(mutationFields).length > 0
                ? new graphql_1.GraphQLObjectType({
                    name: 'mutation',
                    description: 'The start of any mutation',
                    fields: mutationFields
                })
                : null
        };
        // Fill in yet undefined Object Types to avoid GraphQLSchema from breaking.
        // The reason: once creating the schema, the 'fields' thunks will resolve
        // and if a field references an undefined Object Types, GraphQL will throw.
        Object.entries(data.operations).forEach(([opId, operation]) => {
            if (typeof operation.resDef.ot === 'undefined') {
                operation.resDef.ot = GraphQLTools
                    .getEmptyObjectType(operation.resDef.otName);
            }
        });
        let schema = new graphql_1.GraphQLSchema(schemaConfig);
        return { schema, report: options.report };
    });
}
/**
 * Helper function for sorting operations based on them having links or sub-
 * operations.
 */
function sortByHasLinksOrSubOps(op1, op2) {
    const hasOp1 = Object.keys(op1.links).length > 0 ||
        (Array.isArray(op1.subOps) && op1.subOps.length > 0);
    const hasOp2 = Object.keys(op2.links).length > 0 ||
        (Array.isArray(op2.subOps) && op2.subOps.length > 0);
    return (hasOp1 === hasOp2) ? 0 : hasOp1 ? -1 : 1; // hasOp1 = true => -1 = first
}
/**
 * Creates the field object for the given operation.
 */
function getFieldForOperation(operation, data, oas) {
    // create OT returned by operation:
    let type = schema_builder_1.getGraphQLType({
        name: operation.resDef.otName,
        schema: operation.resDef.schema,
        data,
        operation,
        oas
    });
    // create resolve function:
    let reqSchemaName = (operation.reqDef ? operation.reqDef.iotName : null);
    let reqSchema = (operation.reqDef ? operation.reqDef.schema : null);
    let resolve = resolver_builder_1.getResolver({
        operation,
        oas,
        payloadName: reqSchemaName,
        data
    });
    // create args:
    let args = schema_builder_1.getArgs({
        parameters: operation.parameters,
        reqSchemaName: reqSchemaName,
        reqSchema,
        operation,
        data,
        oas
    });
    return {
        type,
        resolve,
        args,
        description: operation.description
    };
}
//# sourceMappingURL=index.js.map