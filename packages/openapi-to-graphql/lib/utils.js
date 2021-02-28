"use strict";
// Copyright IBM Corp. 2018. All Rights Reserved.
// Node module: openapi-to-graphql
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCommonPropertyNames = exports.sortObject = exports.handleWarning = exports.isTypeOf = exports.ucFirst = exports.isUUIDOrGUID = exports.isEmail = exports.isURL = exports.isSafeDate = exports.serializeDate = exports.isSafeFloat = exports.isSafeLong = exports.isSafeInteger = exports.mitigations = exports.MitigationTypes = void 0;
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
const MAX_INT = 2147483647;
const MIN_INT = -2147483648;
const MAX_LONG = 9007199254740991;
const MIN_LONG = -9007199254740992;
/**
 * Verify that a variable contains a safe int (2^31)
 */
function isSafeInteger(n) {
    return (typeof n === 'number' &&
        isFinite(n) &&
        n <= MAX_INT &&
        n >= MIN_INT &&
        n % 1 === 0);
}
exports.isSafeInteger = isSafeInteger;
/**
 * Verify that a variable contains a safe long (2^53)
 */
function isSafeLong(n) {
    return (typeof n === 'number' &&
        isFinite(n) &&
        n <= MAX_LONG &&
        n >= MIN_LONG &&
        n % 1 === 0);
}
exports.isSafeLong = isSafeLong;
/**
 * Check if a number is a safe floating point
 */
function isSafeFloat(n) {
    return typeof n === 'number' && n % 0.5 !== 0;
}
exports.isSafeFloat = isSafeFloat;
/**
 * Convert a date and/or date-time string into a date object
 */
function toDate(n) {
    const parsed = Date.parse(n);
    const $ref = new Date();
    $ref.setTime(parsed);
    return ((typeof parsed === 'number' &&
        parsed !== NaN &&
        parsed > 0 &&
        String(parsed).length === 13 &&
        $ref) ||
        null);
}
/**
 * Serialize a date string into the ISO format
 */
function serializeDate(n) {
    const date = toDate(n);
    return date && date.toJSON();
}
exports.serializeDate = serializeDate;
/**
 * Verify that a vriable contains a safe date/date-time string
 */
function isSafeDate(n) {
    const date = toDate(n);
    return date !== null && date.getTime() !== NaN;
}
exports.isSafeDate = isSafeDate;
/**
 * Verify is a string is a valid URL
 */
function isURL(s) {
    let res = null;
    /* See: https://mathiasbynens.be/demo/url-regex for URL Reg Exp source */
    const urlRegex = /(http(s)?:\/\/.)?(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z0-9]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/g;
    try {
        res = s.match(urlRegex);
    }
    catch (e) {
        res = null;
    }
    return res !== null;
}
exports.isURL = isURL;
/**
 * Verify if a string is a valid EMAIL
 */
function isEmail(s) {
    /* See: See: https://github.com/Urigo/graphql-scalars/blob/master/src/resolvers/EmailAddress.ts#L4 for EMAIL Reg Exp source */
    const emailRegex = /^[a-zA-Z0-9.!#$%&’*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;
    return emailRegex.test(s);
}
exports.isEmail = isEmail;
/**
 * Verify if a string is a valid GUID/UUID
 */
function isUUIDOrGUID(s) {
    /* See: See: https://github.com/Urigo/graphql-scalars/blob/master/src/resolvers/GUID.ts#L4 for UUID Reg Exp source */
    const uuidRegExp = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const guidRegExp = /^(\{){0,1}[0-9a-fA-F]{8}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{12}(\}){0,1}$/gi;
    if (s.startsWith('{')) {
        s = s.substring(1, s.length - 1);
    }
    return uuidRegExp.test(s) || guidRegExp.test(s);
}
exports.isUUIDOrGUID = isUUIDOrGUID;
/**
 * Convert the fist letter of a word in a string to upper case
 */
function ucFirst(s) {
    if (typeof s !== 'string') {
        return '';
    }
    return s.replace(/^./, c => c.toUpperCase());
}
exports.ucFirst = ucFirst;
/**
 * Check if a literal is falsy or not
 */
const isLiteralFalsey = (variable) => {
    return variable === '' || variable === false || variable === 0;
};
/**
 * Check if a variable contains a reference type (not a literal)
 */
const isPrimitive = (arg) => {
    return (typeof arg === 'object' || (Boolean(arg) && typeof arg.apply === 'function'));
};
/**
 * Check that the data type of primitive and/or reference
 * variable mathes the type provided
 */
const checkTypeName = (target, type) => {
    let typeName = '';
    // we need to separate checks for literal types and
    // primitive types so we can speed up performance and
    // keep things simple
    if (isLiteralFalsey(target) || !isPrimitive(target)) {
        // literal
        typeName = typeof target;
    }
    else {
        // primitive/reference
        typeName = Object.prototype.toString
            .call(target)
            .replace(/^\[object (.+)\]$/, '$1');
    }
    // check if the type matches
    return Boolean(typeName.toLowerCase().indexOf(type) + 1);
};
/**
 * Get the correct type of a variable
 */
function isTypeOf(value, type) {
    // swagger/OpenAPI 'integer' type is converted
    // a JavaScript 'number' type for compatibility
    if (type === 'integer') {
        type = 'number';
    }
    type = type || '';
    // checks that the data type of the variable
    // matches that that was passed in
    return checkTypeName(value, type);
}
exports.isTypeOf = isTypeOf;
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
// See: https://stackoverflow.com/a/29622653
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