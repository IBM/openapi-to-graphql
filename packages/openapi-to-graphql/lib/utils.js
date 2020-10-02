"use strict";
// Copyright IBM Corp. 2018. All Rights Reserved.
// Node module: openapi-to-graphql
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCommonPropertyNames = exports.sortObject = exports.handleWarning = exports.mitigations = exports.MitigationTypes = void 0;
var MitigationTypes;
(function (MitigationTypes) {
    /**
     * Problems with the OAS
     *
     * Should be caught by the module oas-validator
     */
    MitigationTypes["INVALID_OAS"] = "INVALID_OAS";
    MitigationTypes["UNNAMED_PARAMETER"] = "UNNAMED_PARAMETER";
    // General problems
    MitigationTypes["AMBIGUOUS_UNION_MEMBERS"] = "AMBIGUOUS_UNION_MEMBERS";
    MitigationTypes["CANNOT_GET_FIELD_TYPE"] = "CANNOT_GET_FIELD_TYPE";
    MitigationTypes["COMBINE_SCHEMAS"] = "COMBINE_SCHEMAS";
    MitigationTypes["DUPLICATE_FIELD_NAME"] = "DUPLICATE_FIELD_NAME";
    MitigationTypes["DUPLICATE_LINK_KEY"] = "DUPLICATE_LINK_KEY";
    MitigationTypes["INVALID_HTTP_METHOD"] = "INVALID_HTTP_METHOD";
    MitigationTypes["INPUT_UNION"] = "INPUT_UNION";
    MitigationTypes["MISSING_RESPONSE_SCHEMA"] = "MISSING_RESPONSE_SCHEMA";
    MitigationTypes["MISSING_SCHEMA"] = "MISSING_SCHEMA";
    MitigationTypes["MULTIPLE_RESPONSES"] = "MULTIPLE_RESPONSES";
    MitigationTypes["NON_APPLICATION_JSON_SCHEMA"] = "NON_APPLICATION_JSON_SCHEMA";
    MitigationTypes["OBJECT_MISSING_PROPERTIES"] = "OBJECT_MISSING_PROPERTIES";
    MitigationTypes["UNKNOWN_TARGET_TYPE"] = "UNKNOWN_TARGET_TYPE";
    MitigationTypes["UNRESOLVABLE_SCHEMA"] = "UNRESOLVABLE_SCHEMA";
    MitigationTypes["UNSUPPORTED_HTTP_SECURITY_SCHEME"] = "UNSUPPORTED_HTTP_SECURITY_SCHEME";
    MitigationTypes["UNSUPPORTED_JSON_SCHEMA_KEYWORD"] = "UNSUPPORTED_JSON_SCHEMA_KEYWORD";
    MitigationTypes["CALLBACKS_MULTIPLE_OPERATION_OBJECTS"] = "CALLBACKS_MULTIPLE_OPERATION_OBJECTS";
    // Links
    MitigationTypes["AMBIGUOUS_LINK"] = "AMBIGUOUS_LINK";
    MitigationTypes["LINK_NAME_COLLISION"] = "LINK_NAME_COLLISION";
    MitigationTypes["UNRESOLVABLE_LINK"] = "UNRESOLVABLE_LINK";
    // Multiple OAS
    MitigationTypes["DUPLICATE_OPERATIONID"] = "DUPLICATE_OPERATIONID";
    MitigationTypes["DUPLICATE_SECURITY_SCHEME"] = "DUPLICATE_SECURITY_SCHEME";
    MitigationTypes["MULTIPLE_OAS_SAME_TITLE"] = "MULTIPLE_OAS_SAME_TITLE";
    // Options
    MitigationTypes["CUSTOM_RESOLVER_UNKNOWN_OAS"] = "CUSTOM_RESOLVER_UNKNOWN_OAS";
    MitigationTypes["CUSTOM_RESOLVER_UNKNOWN_PATH_METHOD"] = "CUSTOM_RESOLVER_UNKNOWN_PATH_METHOD";
    MitigationTypes["LIMIT_ARGUMENT_NAME_COLLISION"] = "LIMIT_ARGUMENT_NAME_COLLISION";
    // Miscellaneous
    MitigationTypes["OAUTH_SECURITY_SCHEME"] = "OAUTH_SECURITY_SCHEME";
})(MitigationTypes = exports.MitigationTypes || (exports.MitigationTypes = {}));
exports.mitigations = {
    /**
     * Problems with the OAS
     *
     * Should be caught by the module oas-validator
     */
    INVALID_OAS: 'Ignore issue and continue.',
    UNNAMED_PARAMETER: 'Ignore parameter.',
    // General problems
    AMBIGUOUS_UNION_MEMBERS: 'Ignore issue and continue.',
    CANNOT_GET_FIELD_TYPE: 'Ignore field and continue.',
    COMBINE_SCHEMAS: 'Ignore combine schema keyword and continue.',
    DUPLICATE_FIELD_NAME: 'Ignore field and maintain preexisting field.',
    DUPLICATE_LINK_KEY: 'Ignore link and maintain preexisting link.',
    INPUT_UNION: 'The data will be stored in an arbitrary JSON type.',
    INVALID_HTTP_METHOD: 'Ignore operation and continue.',
    MISSING_RESPONSE_SCHEMA: 'Ignore operation.',
    MISSING_SCHEMA: 'Use arbitrary JSON type.',
    MULTIPLE_RESPONSES: 'Select first response object with successful status code (200-299).',
    NON_APPLICATION_JSON_SCHEMA: 'Ignore schema',
    OBJECT_MISSING_PROPERTIES: 'The (sub-)object will be stored in an arbitray JSON type.',
    UNKNOWN_TARGET_TYPE: 'The data will be stored in an arbitrary JSON type.',
    UNRESOLVABLE_SCHEMA: 'Ignore and continue. May lead to unexpected behavior.',
    UNSUPPORTED_HTTP_SECURITY_SCHEME: 'Ignore security scheme.',
    UNSUPPORTED_JSON_SCHEMA_KEYWORD: 'Ignore keyword and continue.',
    CALLBACKS_MULTIPLE_OPERATION_OBJECTS: 'Select arbitrary operation object',
    // Links
    AMBIGUOUS_LINK: `Use first occurance of '#/'.`,
    LINK_NAME_COLLISION: 'Ignore link and maintain preexisting field.',
    UNRESOLVABLE_LINK: 'Ignore link.',
    // Multiple OAS
    DUPLICATE_OPERATIONID: 'Ignore operation and maintain preexisting operation.',
    DUPLICATE_SECURITY_SCHEME: 'Ignore security scheme and maintain preexisting scheme.',
    MULTIPLE_OAS_SAME_TITLE: 'Ignore issue and continue.',
    // Options
    CUSTOM_RESOLVER_UNKNOWN_OAS: 'Ignore this set of custom resolvers.',
    CUSTOM_RESOLVER_UNKNOWN_PATH_METHOD: 'Ignore this set of custom resolvers.',
    LIMIT_ARGUMENT_NAME_COLLISION: `Do not override existing 'limit' argument.`,
    // Miscellaneous
    OAUTH_SECURITY_SCHEME: `Ignore security scheme`
};
/**
 * Utilities that are specific to OpenAPI-to-GraphQL
 */
function handleWarning({ mitigationType, message, mitigationAddendum, path, data, log }) {
    const mitigation = exports.mitigations[mitigationType];
    const warning = {
        type: mitigationType,
        message,
        mitigation: mitigationAddendum
            ? `${mitigation} ${mitigationAddendum}`
            : mitigation
    };
    if (path) {
        warning['path'] = path;
    }
    if (data.options.strict) {
        throw new Error(`${warning.type} - ${warning.message}`);
    }
    else {
        const output = `Warning: ${warning.message} - ${warning.mitigation}`;
        if (typeof log === 'function') {
            log(output);
        }
        else {
            console.log(output);
        }
        data.options.report.warnings.push(warning);
    }
}
exports.handleWarning = handleWarning;
// Code provided by codename- from StackOverflow
// Link: https://stackoverflow.com/a/29622653
function sortObject(o) {
    return Object.keys(o)
        .sort()
        .reduce((r, k) => ((r[k] = o[k]), r), {});
}
exports.sortObject = sortObject;
/**
 * Finds the common property names between two objects
 */
function getCommonPropertyNames(object1, object2) {
    return Object.keys(object1).filter(propertyName => {
        return propertyName in object2;
    });
}
exports.getCommonPropertyNames = getCommonPropertyNames;
//# sourceMappingURL=utils.js.map