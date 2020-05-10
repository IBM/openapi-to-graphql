"use strict";
// Copyright IBM Corp. 2018. All Rights Reserved.
// Node module: openapi-to-graphql
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT
Object.defineProperty(exports, "__esModule", { value: true });
exports.mitigations = {
    /**
     * Problems with the OAS
     *
     * Should be caught by the module oas-validator
     */
    INVALID_OAS: `Ignore issue and continue.`,
    UNNAMED_PARAMETER: `Ignore parameter.`,
    // General problems
    AMBIGUOUS_UNION_MEMBERS: `Ignore issue and continue.`,
    CANNOT_GET_FIELD_TYPE: `Ignore field and continue.`,
    COMBINE_SCHEMAS: `Ignore combine schema keyword and continue.`,
    DUPLICATE_FIELD_NAME: `Ignore field and maintain preexisting field.`,
    DUPLICATE_LINK_KEY: `Ignore link and maintain preexisting link.`,
    MISSING_RESPONSE_SCHEMA: `Ignore operation.`,
    MISSING_SCHEMA: `Use arbitrary JSON type.`,
    MULTIPLE_RESPONSES: `Select first response object with successful status code (200-299).`,
    NON_APPLICATION_JSON_SCHEMA: `Ignore schema`,
    OBJECT_MISSING_PROPERTIES: `The (sub-)object will be stored in an arbitray JSON type.`,
    UNKNOWN_TARGET_TYPE: `The response will be stored in an arbitrary JSON type.`,
    UNRESOLVABLE_SCHEMA: `Ignore and continue. May lead to unexpected behavior.`,
    UNSUPPORTED_HTTP_SECURITY_SCHEME: `Ignore security scheme.`,
    UNSUPPORTED_JSON_SCHEMA_KEYWORD: `Ignore keyword and continue.`,
    CALLBACKS_MULTIPLE_OPERATION_OBJECTS: `Select arbitrary operation object`,
    // Links
    AMBIGUOUS_LINK: `Use first occurance of '#/'.`,
    LINK_NAME_COLLISION: `Ignore link and maintain preexisting field.`,
    UNRESOLVABLE_LINK: `Ignore link.`,
    // Multiple OAS
    DUPLICATE_OPERATIONID: `Ignore operation and maintain preexisting operation.`,
    DUPLICATE_SECURITY_SCHEME: `Ignore security scheme and maintain preexisting scheme.`,
    MULTIPLE_OAS_SAME_TITLE: `Ignore issue and continue.`,
    // Options
    CUSTOM_RESOLVER_UNKNOWN_OAS: `Ignore this set of custom resolvers.`,
    CUSTOM_RESOLVER_UNKNOWN_PATH_METHOD: `Ignore this set of custom resolvers.`,
    LIMIT_ARGUMENT_NAME_COLLISION: `Do not override existing 'limit' argument.`,
    // Miscellaneous
    OAUTH_SECURITY_SCHEME: `Ignore security scheme`
};
const MAX_INT = 2147483647;
const MIN_INT = -2147483648;
const MAX_LONG = 9007199254740991;
const MIN_LONG = -9007199254740992;
/**
 * verify that a variable contains a safe int (2^31)
 */
function isSafeInteger(n) {
    return (typeof n === 'number' &&
        isFinite(n) &&
        Math.floor(n) === n &&
        n <= MAX_INT &&
        n >= MIN_INT);
}
exports.isSafeInteger = isSafeInteger;
/**
 * verify that a variable contains a safe long (2^53)
 */
function isSafeLong(n) {
    return typeof n === 'number' && isFinite(n) && n <= MAX_LONG && n >= MIN_LONG;
}
exports.isSafeLong = isSafeLong;
/**
 * verify that a vriable contains a valid UUID string
 */
function isUUID(s) {
    const uuidRegExp = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegExp.test(s);
}
exports.isUUID = isUUID;
/**
 * verify
 */
function isURL(s) {
    let res = null;
    try {
        res = s.match(/(http(s)?:\/\/.)?(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z0-9]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/g);
    }
    catch (e) {
        res = null;
    }
    return (res !== null);
}
exports.isURL = isURL;
;
/**
 * verify that a vriable contains a safe date/date-time string
 */
function isSafeDate(n) {
    const parsed = Date.parse(n);
    return typeof parsed === 'number' && parsed !== NaN && parsed > 0 && String(parsed).length === 13;
}
exports.isSafeDate = isSafeDate;
/**
 * check if a literal is falsy or not
 */
const isLiteralFalsey = (variable) => {
    return variable === '' || variable === false || variable === 0;
};
/**
 * provide the name of primitive and/or reference types
 */
const checkTypeName = (target, type) => {
    let typeName = '';
    if (isLiteralFalsey(target)) {
        typeName = typeof target;
    }
    else {
        typeName = '' + (target && target.constructor.name);
    }
    return !!(typeName.toLowerCase().indexOf(type) + 1);
};
/**
 * get the correct type of a variable
 */
function strictTypeOf(value, type) {
    let result = false;
    if (type === 'integer') {
        type = 'number';
    }
    type = type || [];
    if (typeof type === 'object') {
        if (typeof type.length !== 'number') {
            return result;
        }
        let bitPiece = 0;
        type = [].slice.call(type);
        type.forEach(_type => {
            if (typeof _type === 'function') {
                _type = (_type.name || _type.displayName).toLowerCase();
            }
            bitPiece |= Number(checkTypeName(value, _type));
        });
        result = Boolean(bitPiece);
    }
    else {
        if (typeof type === 'function') {
            type = (type.name || type.displayName).toLowerCase();
        }
        result = checkTypeName(value, type);
    }
    return result;
}
exports.strictTypeOf = strictTypeOf;
/**
 * Utilities that are specific to OpenAPI-to-GraphQL
 */
function handleWarning({ typeKey, message, mitigationAddendum, path, data, log }) {
    const mitigation = exports.mitigations[typeKey];
    const warning = {
        type: typeKey,
        message,
        mitigation: mitigationAddendum
            ? `${mitigation} ${mitigationAddendum}`
            : mitigation
    };
    if (typeof path !== undefined) {
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