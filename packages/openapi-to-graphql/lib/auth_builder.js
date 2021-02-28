"use strict";
// Copyright IBM Corp. 2018. All Rights Reserved.
// Node module: openapi-to-graphql
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAndLoadViewer = void 0;
/**
 * Functions to create viewers that allow users to pass credentials to resolve
 * functions used by OpenAPI-to-GraphQL.
 */
// Type imports:
const graphql_1 = require("graphql");
const graphql_2 = require("./types/graphql");
// Imports:
const schema_builder_1 = require("./schema_builder");
const Oas3Tools = require("./oas_3_tools");
const debug_1 = require("debug");
const utils_1 = require("./utils");
const preprocessor_1 = require("./preprocessor");
const translationLog = debug_1.default('translation');
/**
 * Load the field object in the appropriate root object
 *
 * i.e. inside either rootQueryFields/rootMutationFields or inside
 * rootQueryFields/rootMutationFields for further processing
 */
function createAndLoadViewer(queryFields, operationType, data) {
    const results = {};
    /**
     * To ensure that viewers have unique names, we add a numerical postfix.
     *
     * This object keeps track of what the postfix should be.
     *
     * The key is the security scheme type and the value is
     * the current highest postfix used for viewers of that security scheme type.
     */
    const viewerNamePostfix = {};
    /**
     * Used to collect all fields in the given querFields object, no matter which
     * protocol. Used to populate anyAuthViewer.
     */
    const anyAuthFields = {};
    for (let protocolName in queryFields) {
        Object.assign(anyAuthFields, queryFields[protocolName]);
        /**
         * Check if the name has already been used (i.e. in the list)
         * if so, create a new name and add it to the list
         */
        const securityType = data.security[protocolName].def.type;
        let viewerType;
        /**
         * HTTP is not an authentication protocol
         * HTTP covers a number of different authentication type
         * change the typeName to match the exact authentication type (e.g. basic
         * authentication)
         */
        if (securityType === 'http') {
            let scheme = data.security[protocolName].def.scheme;
            switch (scheme) {
                case 'basic':
                    viewerType = 'basicAuth';
                    break;
                default:
                    utils_1.handleWarning({
                        mitigationType: utils_1.MitigationTypes.UNSUPPORTED_HTTP_SECURITY_SCHEME,
                        message: `Currently unsupported HTTP authentication protocol ` +
                            `type 'http' and scheme '${scheme}'`,
                        data,
                        log: translationLog
                    });
                    continue;
            }
        }
        else {
            viewerType = securityType;
        }
        // Create name for the viewer
        let viewerName = operationType === graphql_2.GraphQLOperationType.Query
            ? Oas3Tools.sanitize(`viewer ${viewerType}`, Oas3Tools.CaseStyle.camelCase)
            : operationType === graphql_2.GraphQLOperationType.Mutation
                ? Oas3Tools.sanitize(`mutation viewer ${viewerType}`, Oas3Tools.CaseStyle.camelCase)
                : Oas3Tools.sanitize(`subscription viewer ${viewerType}`, Oas3Tools.CaseStyle.camelCase);
        // Ensure unique viewer name
        // If name already exists, append a number at the end of the name
        if (!(viewerType in viewerNamePostfix)) {
            viewerNamePostfix[viewerType] = 1;
        }
        else {
            viewerName += ++viewerNamePostfix[viewerType];
        }
        // Add the viewer object type to the specified root query object type
        results[viewerName] = getViewerOT(viewerName, protocolName, securityType, queryFields[protocolName], data);
    }
    // Create name for the AnyAuth viewer
    const anyAuthObjectName = operationType === graphql_2.GraphQLOperationType.Query
        ? 'viewerAnyAuth'
        : operationType === graphql_2.GraphQLOperationType.Mutation
            ? 'mutationViewerAnyAuth'
            : 'subscriptionViewerAnyAuth';
    // Add the AnyAuth object type to the specified root query object type
    results[anyAuthObjectName] = getViewerAnyAuthOT(anyAuthObjectName, anyAuthFields, data);
    return results;
}
exports.createAndLoadViewer = createAndLoadViewer;
/**
 * Get the viewer object, resolve function, and arguments
 */
function getViewerOT(name, protocolName, securityType, queryFields, data) {
    const scheme = data.security[protocolName];
    // Resolve function:
    const resolve = (source, args, context, info) => {
        const security = {};
        const saneProtocolName = Oas3Tools.sanitize(protocolName, Oas3Tools.CaseStyle.camelCase);
        security[Oas3Tools.storeSaneName(saneProtocolName, protocolName, data.saneMap)] = args;
        /**
         * Viewers are always root, so we can instantiate _openAPIToGraphQL here without
         * previously checking for its existence
         */
        return {
            _openAPIToGraphQL: {
                security
            }
        };
    };
    // Arguments:
    /**
     * Do not sort because they are already "sorted" in preprocessing.
     * Otherwise, for basic auth, "password" will appear before "username"
     */
    const args = {};
    if (typeof scheme === 'object') {
        for (let parameterName in scheme.parameters) {
            // The parameter name should be already sane as it is provided by OpenAPI-to-GraphQL
            const saneParameterName = Oas3Tools.sanitize(parameterName, Oas3Tools.CaseStyle.camelCase);
            args[saneParameterName] = { type: new graphql_1.GraphQLNonNull(graphql_1.GraphQLString) };
        }
    }
    let typeDescription = `A viewer for security scheme '${protocolName}'`;
    /**
     * HTTP authentication uses different schemes. It is not sufficient to name
     * only the security type
     */
    let description = securityType === 'http'
        ? `A viewer that wraps all operations authenticated via security scheme ` +
            `'${protocolName}', which is of type 'http' '${scheme.def.scheme}'`
        : `A viewer that wraps all operations authenticated via security scheme ` +
            `'${protocolName}', which is of type '${securityType}'`;
    if (data.oass.length !== 1) {
        typeDescription += ` in OAS '${scheme.oas.info.title}'`;
        description = `, in OAS '${scheme.oas.info.title}`;
    }
    return {
        type: new graphql_1.GraphQLObjectType({
            name: Oas3Tools.capitalize(name),
            description: typeDescription,
            fields: () => queryFields
        }),
        resolve,
        args,
        description
    };
}
/**
 * Create an object containing an AnyAuth viewer, its resolve function,
 * and its args.
 */
function getViewerAnyAuthOT(name, queryFields, data) {
    // Resolve function:
    const resolve = (source, args, context, info) => {
        return {
            _openAPIToGraphQL: {
                security: args
            }
        };
    };
    // Arguments:
    let args = {};
    for (let protocolName in data.security) {
        // Create input object types for the viewer arguments
        const def = preprocessor_1.createDataDef({ fromRef: protocolName }, data.security[protocolName].schema, true, data, data.security[protocolName].oas);
        const type = schema_builder_1.getGraphQLType({
            def,
            data,
            isInputObjectType: true
        });
        const saneProtocolName = Oas3Tools.sanitize(protocolName, Oas3Tools.CaseStyle.camelCase);
        args[Oas3Tools.storeSaneName(saneProtocolName, protocolName, data.saneMap)] = { type };
    }
    args = utils_1.sortObject(args);
    return {
        type: new graphql_1.GraphQLObjectType({
            name: Oas3Tools.capitalize(name),
            description: 'Warning: Not every request will work with this viewer type',
            fields: () => queryFields
        }),
        resolve,
        args,
        description: `A viewer that wraps operations for all available ` +
            `authentication mechanisms`
    };
}
//# sourceMappingURL=auth_builder.js.map