"use strict";
// Copyright IBM Corp. 2018. All Rights Reserved.
// Node module: openapi-to-graphql
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateOperationId = exports.uncapitalize = exports.capitalize = exports.formatOperationString = exports.isHttpMethod = exports.trim = exports.storeSaneName = exports.sanitize = exports.isSanitized = exports.CaseStyle = exports.getSecurityRequirements = exports.getSecuritySchemes = exports.getServers = exports.getParameters = exports.getLinks = exports.getResponseStatusCode = exports.getResponseSchemaAndNames = exports.getRequestSchemaAndNames = exports.inferResourceNameFromPath = exports.getSchemaTargetGraphQLType = exports.desanitizeObjectKeys = exports.sanitizeObjectKeys = exports.getBaseUrl = exports.resolveRef = exports.countOperationsWithPayload = exports.countOperationsSubscription = exports.countOperationsMutation = exports.countOperationsQuery = exports.countOperations = exports.getValidOAS3 = exports.methodToHttpMethod = exports.OAS_GRAPHQL_EXTENSIONS = exports.SUCCESS_STATUS_RX = exports.HTTP_METHODS = void 0;
const operation_1 = require("./types/operation");
// Imports:
const Swagger2OpenAPI = require("swagger2openapi");
const spectral_1 = require("@stoplight/spectral");
const debug_1 = require("debug");
const utils_1 = require("./utils");
const jsonptr = require("json-ptr");
const pluralize = require("pluralize");
const httpLog = debug_1.default('http');
const preprocessingLog = debug_1.default('preprocessing');
const translationLog = debug_1.default('translation');
// OAS constants
var HTTP_METHODS;
(function (HTTP_METHODS) {
    HTTP_METHODS["get"] = "get";
    HTTP_METHODS["put"] = "put";
    HTTP_METHODS["post"] = "post";
    HTTP_METHODS["patch"] = "patch";
    HTTP_METHODS["delete"] = "delete";
    HTTP_METHODS["options"] = "options";
    HTTP_METHODS["head"] = "head";
})(HTTP_METHODS = exports.HTTP_METHODS || (exports.HTTP_METHODS = {}));
exports.SUCCESS_STATUS_RX = /2[0-9]{2}|2XX/;
var OAS_GRAPHQL_EXTENSIONS;
(function (OAS_GRAPHQL_EXTENSIONS) {
    OAS_GRAPHQL_EXTENSIONS["TypeName"] = "x-graphql-type-name";
    OAS_GRAPHQL_EXTENSIONS["FieldName"] = "x-graphql-field-name";
    OAS_GRAPHQL_EXTENSIONS["EnumMapping"] = "x-graphql-enum-mapping";
})(OAS_GRAPHQL_EXTENSIONS = exports.OAS_GRAPHQL_EXTENSIONS || (exports.OAS_GRAPHQL_EXTENSIONS = {}));
/**
 * Given an HTTP method, convert it to the HTTP_METHODS enum
 */
function methodToHttpMethod(method) {
    switch (method.toLowerCase()) {
        case 'get':
            return HTTP_METHODS.get;
        case 'put':
            return HTTP_METHODS.put;
        case 'post':
            return HTTP_METHODS.post;
        case 'patch':
            return HTTP_METHODS.patch;
        case 'delete':
            return HTTP_METHODS.delete;
        case 'options':
            return HTTP_METHODS.options;
        case 'head':
            return HTTP_METHODS.head;
        default:
            throw new Error(`Invalid HTTP method '${method}'`);
    }
}
exports.methodToHttpMethod = methodToHttpMethod;
/**
 * Resolves on a validated OAS 3 for the given spec (OAS 2 or OAS 3), or rejects
 * if errors occur.
 */
function getValidOAS3(spec, swagger2OpenAPIOptions) {
    return new Promise((resolve, reject) => {
        // CASE: translate
        if (typeof spec.swagger === 'string' &&
            spec.swagger === '2.0') {
            preprocessingLog(`Received Swagger - going to translate to OpenAPI Specification...`);
            Swagger2OpenAPI.convertObj(spec, swagger2OpenAPIOptions)
                .then((options) => resolve(options.openapi))
                .catch((error) => reject(`Could not convert Swagger '${spec.info.title}' to OpenAPI Specification. ${error.message}`));
            // CASE: validate
        }
        else if (typeof spec.openapi === 'string' &&
            /^3/.test(spec.openapi)) {
            preprocessingLog(`Received OpenAPI Specification - going to validate...`);
            const validator = new spectral_1.Spectral();
            validator.registerFormat('oas3', spectral_1.isOpenApiv3);
            validator.registerFormat('oas3_1', spectral_1.isOpenApiv3_1);
            validator
                .loadRuleset('spectral:oas')
                .then(() => validator.run(spec))
                .then((results) => {
                for (const result of results) {
                    console.warn(result);
                    // Ensure there are no errors about no format being matched
                    if (result.code === 'unrecognized-format') {
                        return reject(`Could not validate OpenAPI Specification '${spec.info.title}'. ${result.message}`);
                    }
                    if (result.severity < 1) {
                        return reject(`Invalid OpenAPI Specification '${spec.info.title}'. [${result.path.join('.')}] ${result.message}`);
                    }
                }
                resolve(spec);
            })
                .catch((error) => reject(`Could not validate OpenAPI Specification '${spec.info.title}'. ${error.message}`));
        }
        else {
            reject(`Invalid specification provided`);
        }
    });
}
exports.getValidOAS3 = getValidOAS3;
/**
 * Counts the number of operations in an OAS.
 */
function countOperations(oas) {
    let numOps = 0;
    for (let path in oas.paths) {
        for (let method in oas.paths[path]) {
            if (isHttpMethod(method)) {
                numOps++;
                if (oas.paths[path][method].callbacks) {
                    for (let cbName in oas.paths[path][method].callbacks) {
                        for (let cbPath in oas.paths[path][method].callbacks[cbName]) {
                            numOps++;
                        }
                    }
                }
            }
        }
    }
    return numOps;
}
exports.countOperations = countOperations;
/**
 * Counts the number of operations that translate to queries in an OAS.
 */
function countOperationsQuery(oas) {
    let numOps = 0;
    for (let path in oas.paths) {
        for (let method in oas.paths[path]) {
            if (isHttpMethod(method) && method.toLowerCase() === HTTP_METHODS.get) {
                numOps++;
            }
        }
    }
    return numOps;
}
exports.countOperationsQuery = countOperationsQuery;
/**
 * Counts the number of operations that translate to mutations in an OAS.
 */
function countOperationsMutation(oas) {
    let numOps = 0;
    for (let path in oas.paths) {
        for (let method in oas.paths[path]) {
            if (isHttpMethod(method) && method.toLowerCase() !== HTTP_METHODS.get) {
                numOps++;
            }
        }
    }
    return numOps;
}
exports.countOperationsMutation = countOperationsMutation;
/**
 * Counts the number of operations that translate to subscriptions in an OAS.
 */
function countOperationsSubscription(oas) {
    let numOps = 0;
    for (let path in oas.paths) {
        for (let method in oas.paths[path]) {
            if (isHttpMethod(method) &&
                method.toLowerCase() !== HTTP_METHODS.get &&
                oas.paths[path][method].callbacks) {
                for (let cbName in oas.paths[path][method].callbacks) {
                    for (let cbPath in oas.paths[path][method].callbacks[cbName]) {
                        numOps++;
                    }
                }
            }
        }
    }
    return numOps;
}
exports.countOperationsSubscription = countOperationsSubscription;
/**
 * Counts the number of operations with a payload definition in an OAS.
 */
function countOperationsWithPayload(oas) {
    let numOps = 0;
    for (let path in oas.paths) {
        for (let method in oas.paths[path]) {
            if (isHttpMethod(method) &&
                typeof oas.paths[path][method].requestBody === 'object') {
                numOps++;
            }
        }
    }
    return numOps;
}
exports.countOperationsWithPayload = countOperationsWithPayload;
/**
 * Resolves the given reference in the given object.
 */
function resolveRef(ref, oas) {
    return jsonptr.JsonPointer.get(oas, ref);
}
exports.resolveRef = resolveRef;
/**
 * Returns the base URL to use for the given operation.
 */
function getBaseUrl(operation) {
    // Check for servers:
    if (!Array.isArray(operation.servers) || operation.servers.length === 0) {
        throw new Error(`No servers defined for operation '${operation.operationString}'`);
    }
    // Check for local servers
    if (Array.isArray(operation.servers) && operation.servers.length > 0) {
        const url = buildUrl(operation.servers[0]);
        if (Array.isArray(operation.servers) && operation.servers.length > 1) {
            httpLog(`Warning: Randomly selected first server '${url}'`);
        }
        return url.replace(/\/$/, '');
    }
    const oas = operation.oas;
    if (Array.isArray(oas.servers) && oas.servers.length > 0) {
        const url = buildUrl(oas.servers[0]);
        if (Array.isArray(oas.servers) && oas.servers.length > 1) {
            httpLog(`Warning: Randomly selected first server '${url}'`);
        }
        return url.replace(/\/$/, '');
    }
    throw new Error('Cannot find a server to call');
}
exports.getBaseUrl = getBaseUrl;
/**
 * Returns the default URL for a given OAS server object.
 */
function buildUrl(server) {
    let url = server.url;
    // Replace with variable defaults, if applicable
    if (typeof server.variables === 'object' &&
        Object.keys(server.variables).length > 0) {
        for (let variableKey in server.variables) {
            // TODO: check for default? Would be invalid OAS
            url = url.replace(`{${variableKey}}`, server.variables[variableKey].default.toString());
        }
    }
    return url;
}
/**
 * Returns object/array/scalar where all object keys (if applicable) are
 * sanitized.
 */
function sanitizeObjectKeys(obj, // obj does not necessarily need to be an object
caseStyle = CaseStyle.camelCase) {
    const cleanKeys = (obj) => {
        // Case: no (response) data
        if (obj === null || typeof obj === 'undefined') {
            return null;
            // Case: array
        }
        else if (Array.isArray(obj)) {
            return obj.map(cleanKeys);
            // Case: object
        }
        else if (typeof obj === 'object') {
            const res = {};
            for (const key in obj) {
                const saneKey = sanitize(key, caseStyle);
                if (Object.prototype.hasOwnProperty.call(obj, key)) {
                    res[saneKey] = cleanKeys(obj[key]);
                }
            }
            return res;
            // Case: scalar
        }
        else {
            return obj;
        }
    };
    return cleanKeys(obj);
}
exports.sanitizeObjectKeys = sanitizeObjectKeys;
/**
 * Desanitizes keys in given object by replacing them with the keys stored in
 * the given mapping.
 */
function desanitizeObjectKeys(obj, mapping = {}) {
    const replaceKeys = (obj) => {
        if (obj === null) {
            return null;
        }
        else if (Array.isArray(obj)) {
            return obj.map(replaceKeys);
        }
        else if (typeof obj === 'object') {
            const res = {};
            for (let key in obj) {
                if (key in mapping) {
                    const rawKey = mapping[key];
                    if (Object.prototype.hasOwnProperty.call(obj, key)) {
                        res[rawKey] = replaceKeys(obj[key]);
                    }
                }
                else {
                    res[key] = replaceKeys(obj[key]);
                }
            }
            return res;
        }
        else {
            return obj;
        }
    };
    return replaceKeys(obj);
}
exports.desanitizeObjectKeys = desanitizeObjectKeys;
/**
 * Returns the GraphQL type that the provided schema should be made into
 */
function getSchemaTargetGraphQLType(schemaOrRef, data, oas) {
    let schema;
    if ('$ref' in schemaOrRef && typeof schemaOrRef.$ref === 'string') {
        schema = resolveRef(schemaOrRef.$ref, oas);
    }
    else {
        schema = schemaOrRef;
    }
    // TODO: Need to resolve allOf here as well.
    // CASE: Check for nested or concurrent anyOf and oneOf
    if (
    // TODO: Should also consider if the member schema contains type data
    (Array.isArray(schema.anyOf) && Array.isArray(schema.oneOf)) || // anyOf and oneOf used concurrently
        hasNestedAnyOfUsage(schema, oas) ||
        hasNestedOneOfUsage(schema, oas)) {
        utils_1.handleWarning({
            mitigationType: utils_1.MitigationTypes.COMBINE_SCHEMAS,
            message: `Schema '${JSON.stringify(schema)}' contains either both ` +
                `'anyOf' and 'oneOf' or nested 'anyOf' and 'oneOf' which ` +
                `is currently not supported.`,
            mitigationAddendum: `Use arbitrary JSON type instead.`,
            data,
            log: preprocessingLog
        });
        return operation_1.TargetGraphQLType.json;
    }
    if (Array.isArray(schema.anyOf)) {
        return GetAnyOfTargetGraphQLType(schema, data, oas);
    }
    if (Array.isArray(schema.oneOf)) {
        return GetOneOfTargetGraphQLType(schema, data, oas);
    }
    // CASE: enum
    if (Array.isArray(schema.enum)) {
        return operation_1.TargetGraphQLType.enum;
    }
    // CASE: object
    if (schema.type === 'object' || typeof schema.properties === 'object') {
        // TODO: additionalProperties is more like a flag than a type itself
        // CASE: arbitrary JSON
        if (typeof schema.additionalProperties === 'object') {
            return operation_1.TargetGraphQLType.json;
        }
        else {
            return operation_1.TargetGraphQLType.object;
        }
    }
    // CASE: array
    if (schema.type === 'array' || 'items' in schema) {
        return operation_1.TargetGraphQLType.list;
    }
    // Special edge cases involving the schema format
    if (typeof schema.format === 'string') {
        /**
         * CASE: 64 bit int - return number instead of integer, leading to use of
         * GraphQLFloat, which can support 64 bits:
         */
        if (schema.type === 'integer' && schema.format === 'int64') {
            return operation_1.TargetGraphQLType.float;
            // CASE: id
        }
        else if (schema.type === 'string' &&
            (schema.format === 'uuid' ||
                // Custom ID format
                (Array.isArray(data.options.idFormats) &&
                    data.options.idFormats.includes(schema.format)))) {
            return operation_1.TargetGraphQLType.id;
        }
    }
    switch (schema.type) {
        case 'string':
            return operation_1.TargetGraphQLType.string;
        case 'number':
            return operation_1.TargetGraphQLType.float;
        case 'integer':
            return operation_1.TargetGraphQLType.integer;
        case 'boolean':
            return operation_1.TargetGraphQLType.boolean;
        default:
        // Error: unsupported schema type
    }
    return null;
}
exports.getSchemaTargetGraphQLType = getSchemaTargetGraphQLType;
/**
 * Check to see if there are cases of nested oneOf fields in the member schemas
 *
 * We currently cannot handle complex cases of oneOf and anyOf
 */
function hasNestedOneOfUsage(schema, oas) {
    // TODO: Should also consider if the member schema contains type data
    return (Array.isArray(schema.oneOf) &&
        schema.oneOf.some((memberSchemaOrRef) => {
            let memberSchema;
            if ('$ref' in memberSchemaOrRef &&
                typeof memberSchemaOrRef.$ref === 'string') {
                memberSchema = resolveRef(memberSchemaOrRef.$ref, oas);
            }
            else {
                memberSchema = memberSchemaOrRef;
            }
            return (
            /**
             * anyOf and oneOf are nested
             *
             * Nested oneOf would result in nested unions which are not allowed by
             * GraphQL
             */
            Array.isArray(memberSchema.anyOf) || Array.isArray(memberSchema.oneOf));
        }));
}
/**
 * Check to see if there are cases of nested anyOf fields in the member schemas
 *
 * We currently cannot handle complex cases of oneOf and anyOf
 */
function hasNestedAnyOfUsage(schema, oas) {
    // TODO: Should also consider if the member schema contains type data
    return (Array.isArray(schema.anyOf) &&
        schema.anyOf.some((memberSchemaOrRef) => {
            let memberSchema;
            if ('$ref' in memberSchemaOrRef &&
                typeof memberSchemaOrRef.$ref === 'string') {
                memberSchema = resolveRef(memberSchemaOrRef.$ref, oas);
            }
            else {
                memberSchema = memberSchemaOrRef;
            }
            return (
            // anyOf and oneOf are nested
            Array.isArray(memberSchema.anyOf) || Array.isArray(memberSchema.oneOf));
        }));
}
function GetAnyOfTargetGraphQLType(schema, data, oas) {
    // Identify the type of the base schema, meaning ignoring the anyOf
    const schemaWithNoAnyOf = Object.assign({}, schema);
    delete schemaWithNoAnyOf.anyOf;
    const baseTargetType = getSchemaTargetGraphQLType(schemaWithNoAnyOf, data, oas);
    // Target GraphQL types of all the member schemas
    const memberTargetTypes = [];
    schema.anyOf.forEach((memberSchema) => {
        const memberTargetType = getSchemaTargetGraphQLType(memberSchema, data, oas);
        if (memberTargetType !== null) {
            memberTargetTypes.push(memberTargetType);
        }
    });
    if (memberTargetTypes.length > 0) {
        const firstMemberTargetType = memberTargetTypes[0];
        const consistentMemberTargetTypes = memberTargetTypes.every((targetType) => {
            return targetType === firstMemberTargetType;
        });
        if (consistentMemberTargetTypes) {
            if (baseTargetType !== null) {
                if (baseTargetType === firstMemberTargetType) {
                    if (baseTargetType === 'object') {
                        // Base schema and member schema types are object types
                        return operation_1.TargetGraphQLType.anyOfObject;
                    }
                    else {
                        // Base schema and member schema types but no object types
                        return baseTargetType;
                    }
                }
                else {
                    // Base schema and member schema types are not consistent
                    return operation_1.TargetGraphQLType.json;
                }
            }
            else {
                if (firstMemberTargetType === operation_1.TargetGraphQLType.object) {
                    return operation_1.TargetGraphQLType.anyOfObject;
                }
                else {
                    return firstMemberTargetType;
                }
            }
        }
        else {
            // Member schema types are not consistent
            return operation_1.TargetGraphQLType.json;
        }
    }
    else {
        // No member schema types, therefore use the base schema type
        return baseTargetType;
    }
}
function GetOneOfTargetGraphQLType(schema, data, oas) {
    // Identify the type of the base schema, meaning ignoring the oneOf
    const schemaWithNoOneOf = Object.assign({}, schema);
    delete schemaWithNoOneOf.oneOf;
    const baseTargetType = getSchemaTargetGraphQLType(schemaWithNoOneOf, data, oas);
    // Target GraphQL types of all the member schemas
    const memberTargetTypes = [];
    schema.oneOf.forEach((memberSchema) => {
        const memberTargetType = getSchemaTargetGraphQLType(memberSchema, data, oas);
        if (memberTargetType !== null) {
            memberTargetTypes.push(memberTargetType);
        }
    });
    if (memberTargetTypes.length > 0) {
        const firstMemberTargetType = memberTargetTypes[0];
        const consistentMemberTargetTypes = memberTargetTypes.every((targetType) => {
            return targetType === firstMemberTargetType;
        });
        if (consistentMemberTargetTypes) {
            if (baseTargetType !== null) {
                if (baseTargetType === firstMemberTargetType) {
                    if (baseTargetType === 'object') {
                        // Base schema and member schema types are object types
                        return operation_1.TargetGraphQLType.oneOfUnion;
                    }
                    else {
                        // Base schema and member schema types but no object types
                        return baseTargetType;
                    }
                }
                else {
                    // Base schema and member schema types are not consistent
                    return operation_1.TargetGraphQLType.json;
                }
            }
            else {
                if (firstMemberTargetType === operation_1.TargetGraphQLType.object) {
                    return operation_1.TargetGraphQLType.oneOfUnion;
                }
                else {
                    return firstMemberTargetType;
                }
            }
        }
        else {
            // Member schema types are not consistent
            return operation_1.TargetGraphQLType.json;
        }
    }
    else {
        // No member schema types, therefore use the base schema type
        return baseTargetType;
    }
}
/**
 * Identifies common path components in the given list of paths. Returns these
 * components as well as an updated list of paths where the common prefix was
 * removed.
 */
function extractBasePath(paths) {
    if (paths.length <= 1) {
        return {
            basePath: '/',
            updatedPaths: paths
        };
    }
    let basePathComponents = paths[0].split('/');
    for (let path of paths) {
        if (basePathComponents.length === 0) {
            break;
        }
        const pathComponents = path.split('/');
        for (let i = 0; i < pathComponents.length; i++) {
            if (i < basePathComponents.length) {
                if (pathComponents[i] !== basePathComponents[i]) {
                    basePathComponents = basePathComponents.slice(0, i);
                }
            }
            else {
                break;
            }
        }
    }
    const updatedPaths = paths.map((path) => path.split('/').slice(basePathComponents.length).join('/'));
    let basePath = basePathComponents.length === 0 ||
        (basePathComponents.length === 1 && basePathComponents[0] === '')
        ? '/'
        : basePathComponents.join('/');
    return {
        basePath,
        updatedPaths
    };
}
function isIdParam(part) {
    return /^{.*(id|name|key).*}$/gi.test(part);
}
function isSingularParam(part, nextPart) {
    return `\{${pluralize.singular(part)}\}` === nextPart;
}
/**
 * Infers a resource name from the given URL path.
 *
 * For example, turns "/users/{userId}/car" into "userCar".
 */
function inferResourceNameFromPath(path) {
    const parts = path.split('/');
    let pathNoPathParams = parts.reduce((path, part, i) => {
        if (!/{/g.test(part)) {
            if (parts[i + 1] &&
                (isIdParam(parts[i + 1]) || isSingularParam(part, parts[i + 1]))) {
                return path + capitalize(pluralize.singular(part));
            }
            else {
                return path + capitalize(part);
            }
        }
        else {
            return path;
        }
    }, '');
    return pathNoPathParams;
}
exports.inferResourceNameFromPath = inferResourceNameFromPath;
/**
 * Returns the request schema (if any) for the given operation,
 * a dictionary of names from different sources (if available), and whether the
 * request schema is required for the operation.
 */
function getRequestSchemaAndNames(path, method, operation, oas) {
    var _a;
    let payloadContentType; // randomly selected content-type, prioritizing application/json
    let requestBodyObject; // request object
    let payloadSchema; // request schema with given content-type
    let payloadSchemaNames; // dictionary of names
    let payloadRequired = false;
    // Get request body
    const requestBodyObjectOrRef = operation === null || operation === void 0 ? void 0 : operation.requestBody;
    if (typeof requestBodyObjectOrRef === 'object' &&
        requestBodyObjectOrRef !== null) {
        // Resolve reference if applicable. Make sure we have a RequestBodyObject:
        if ('$ref' in requestBodyObjectOrRef &&
            typeof requestBodyObjectOrRef.$ref === 'string') {
            requestBodyObject = resolveRef(requestBodyObjectOrRef.$ref, oas);
        }
        else {
            requestBodyObject = requestBodyObjectOrRef;
        }
        if (typeof requestBodyObject === 'object' && requestBodyObject !== null) {
            // Determine if request body is required:
            payloadRequired =
                typeof (requestBodyObject === null || requestBodyObject === void 0 ? void 0 : requestBodyObject.required) === 'boolean'
                    ? requestBodyObject === null || requestBodyObject === void 0 ? void 0 : requestBodyObject.required : false;
            // Determine content-type
            const content = requestBodyObject === null || requestBodyObject === void 0 ? void 0 : requestBodyObject.content;
            if (typeof content === 'object' &&
                content !== null &&
                Object.keys(content).length > 0) {
                // Prioritize content-type JSON
                if ('application/json' in content) {
                    payloadContentType = 'application/json';
                }
                else if ('application/x-www-form-urlencoded' in content) {
                    payloadContentType = 'application/x-www-form-urlencoded';
                }
                else {
                    // Pick first (random) content type
                    const randomContentType = Object.keys(content)[0];
                    payloadContentType = randomContentType;
                }
                if (payloadContentType === 'application/json' ||
                    payloadContentType === '*/*' ||
                    payloadContentType === 'application/x-www-form-urlencoded') {
                    // Name extracted from a reference, if applicable
                    let fromRef;
                    // Determine payload schema
                    const payloadSchemaOrRef = (_a = content === null || content === void 0 ? void 0 : content[payloadContentType]) === null || _a === void 0 ? void 0 : _a.schema;
                    if (typeof payloadSchemaOrRef === 'object' &&
                        payloadSchemaOrRef !== null) {
                        // Resolve payload schema reference if applicable
                        if ('$ref' in payloadSchemaOrRef &&
                            typeof payloadSchemaOrRef.$ref === 'string') {
                            fromRef = payloadSchemaOrRef.$ref.split('/').pop();
                            payloadSchema = resolveRef(payloadSchemaOrRef.$ref, oas);
                        }
                        else {
                            payloadSchema = payloadSchemaOrRef;
                        }
                    }
                    // Determine possible schema names
                    payloadSchemaNames = {
                        fromExtension: payloadSchema[OAS_GRAPHQL_EXTENSIONS.TypeName],
                        fromRef,
                        fromSchema: payloadSchema === null || payloadSchema === void 0 ? void 0 : payloadSchema.title,
                        fromPath: inferResourceNameFromPath(path)
                    };
                    /**
                     * Edge case: if request body content-type is not application/json or
                     * application/x-www-form-urlencoded, do not parse it.
                     *
                     * Instead, treat the request body as a black box and send it as a string
                     * with the proper content-type header
                     */
                }
                else {
                    const saneContentTypeName = uncapitalize(payloadContentType.split('/').reduce((name, term) => {
                        return name + capitalize(term);
                    }));
                    let description = `String represents payload of content type '${payloadContentType}'`;
                    if (typeof (payloadSchema === null || payloadSchema === void 0 ? void 0 : payloadSchema.description) === 'string') {
                        description += `\n\nOriginal top level description: '${payloadSchema.description}'`;
                    }
                    // Replacement schema to avoid parsing
                    payloadSchema = {
                        description,
                        type: 'string'
                    };
                    // Determine possible schema names
                    payloadSchemaNames = {
                        fromPath: saneContentTypeName
                    };
                }
            }
        }
    }
    return {
        payloadContentType,
        payloadSchema,
        payloadSchemaNames,
        payloadRequired
    };
}
exports.getRequestSchemaAndNames = getRequestSchemaAndNames;
/**
 * Returns the response schema for the given operation,
 * a successful status code, and a dictionary of names from different sources
 * (if available).
 */
function getResponseSchemaAndNames(path, method, operation, oas, data, options) {
    var _a, _b, _c;
    let responseContentType; // randomly selected content-type, prioritizing application/json
    let responseObject; // response object
    let responseSchema; // response schema with given content-type
    let responseSchemaNames; // dictionary of names
    const statusCode = getResponseStatusCode(path, method, operation, oas, data);
    // Get response object
    const responseObjectOrRef = (_a = operation === null || operation === void 0 ? void 0 : operation.responses) === null || _a === void 0 ? void 0 : _a[statusCode];
    if (typeof responseObjectOrRef === 'object' && responseObjectOrRef !== null) {
        if ('$ref' in responseObjectOrRef &&
            typeof responseObjectOrRef.$ref === 'string') {
            responseObject = resolveRef(responseObjectOrRef.$ref, oas);
        }
        else {
            responseObject = responseObjectOrRef;
        }
        // Determine content-type
        if (typeof responseObject === 'object' && responseObject !== null) {
            const content = responseObject === null || responseObject === void 0 ? void 0 : responseObject.content;
            if (typeof content === 'object' &&
                content !== null &&
                Object.keys(content).length > 0) {
                // Prioritize content-type JSON
                if ('application/json' in content) {
                    responseContentType = 'application/json';
                }
                else {
                    // Pick first (random) content type
                    const randomContentType = Object.keys(content)[0];
                    responseContentType = randomContentType;
                }
                if (responseContentType === 'application/json' ||
                    responseContentType === '*/*') {
                    // Name from reference, if applicable
                    let fromRef;
                    // Determine response schema
                    const responseSchemaOrRef = (_c = (_b = responseObject === null || responseObject === void 0 ? void 0 : responseObject.content) === null || _b === void 0 ? void 0 : _b[responseContentType]) === null || _c === void 0 ? void 0 : _c.schema;
                    // Resolve response schema reference if applicable
                    if ('$ref' in responseSchemaOrRef &&
                        typeof responseSchemaOrRef.$ref === 'string') {
                        fromRef = responseSchemaOrRef.$ref.split('/').pop();
                        responseSchema = resolveRef(responseSchemaOrRef.$ref, oas);
                    }
                    else {
                        responseSchema = responseSchemaOrRef;
                    }
                    // Determine possible schema names
                    responseSchemaNames = {
                        fromExtension: responseSchema[OAS_GRAPHQL_EXTENSIONS.TypeName],
                        fromRef,
                        fromSchema: responseSchema === null || responseSchema === void 0 ? void 0 : responseSchema.title,
                        fromPath: inferResourceNameFromPath(path)
                    };
                    /**
                     * Edge case: if response body content-type is not application/json,
                     * do not parse.
                     */
                }
                else {
                    let description = 'Placeholder to access non-application/json response bodies';
                    if (typeof (responseSchema === null || responseSchema === void 0 ? void 0 : responseSchema.description) === 'string') {
                        description += `\n\nOriginal top level description: '${responseSchema.description}'`;
                    }
                    // Replacement schema to avoid parsing
                    responseSchema = {
                        description,
                        type: 'string'
                    };
                    // Determine possible schema names
                    responseSchemaNames = {
                        fromExtension: responseSchema === null || responseSchema === void 0 ? void 0 : responseSchema[OAS_GRAPHQL_EXTENSIONS.TypeName],
                        fromSchema: responseSchema === null || responseSchema === void 0 ? void 0 : responseSchema.title,
                        fromPath: inferResourceNameFromPath(path)
                    };
                }
                return {
                    responseContentType,
                    responseSchema,
                    responseSchemaNames,
                    statusCode
                };
            }
        }
    }
    // No response schema
    if (options.fillEmptyResponses) {
        return {
            responseSchemaNames: {
                fromPath: inferResourceNameFromPath(path)
            },
            responseSchema: {
                description: 'Placeholder to support operations with no response schema',
                type: 'string'
            }
        };
    }
    else {
        return {};
    }
}
exports.getResponseSchemaAndNames = getResponseSchemaAndNames;
/**
 * Returns a success status code for the given operation
 */
function getResponseStatusCode(path, method, operation, oas, data) {
    if (typeof operation.responses === 'object' && operation.responses !== null) {
        const codes = Object.keys(operation.responses);
        const successCodes = codes.filter((code) => {
            return exports.SUCCESS_STATUS_RX.test(code);
        });
        if (successCodes.length === 1) {
            return successCodes[0];
        }
        else if (successCodes.length > 1) {
            // Select a random success code
            utils_1.handleWarning({
                mitigationType: utils_1.MitigationTypes.MULTIPLE_RESPONSES,
                message: `Operation '${formatOperationString(method, path, oas.info.title)}' ` +
                    `contains multiple possible successful response object ` +
                    `(HTTP code 200-299 or 2XX). Only one can be chosen.`,
                mitigationAddendum: `The response object with the HTTP code ` +
                    `${successCodes[0]} will be selected`,
                data,
                log: translationLog
            });
            return successCodes[0];
        }
    }
}
exports.getResponseStatusCode = getResponseStatusCode;
/**
 * Returns a hash containing the links in the given operation.
 */
function getLinks(path, method, operation, oas, data) {
    const links = {};
    const statusCode = getResponseStatusCode(path, method, operation, oas, data);
    if (!statusCode) {
        return links;
    }
    if (typeof operation.responses === 'object') {
        const responses = operation.responses;
        if (typeof responses[statusCode] === 'object') {
            const responseObjectOrRef = responses[statusCode];
            let response;
            if ('$ref' in responseObjectOrRef &&
                typeof responseObjectOrRef.$ref === 'string') {
                response = resolveRef(responseObjectOrRef.$ref, oas);
            }
            else {
                response = responseObjectOrRef;
            }
            if (typeof response.links === 'object') {
                const epLinks = response.links;
                for (let linkKey in epLinks) {
                    const linkObjectOrRef = epLinks[linkKey];
                    let link;
                    if ('$ref' in linkObjectOrRef &&
                        typeof linkObjectOrRef.$ref === 'string') {
                        link = resolveRef(linkObjectOrRef.$ref, oas);
                    }
                    else {
                        link = linkObjectOrRef;
                    }
                    links[linkKey] = link;
                }
            }
        }
    }
    return links;
}
exports.getLinks = getLinks;
/**
 * Returns the list of parameters in the given operation.
 */
function getParameters(path, method, operation, pathItem, oas) {
    let parameters = [];
    if (!isHttpMethod(method)) {
        translationLog(`Warning: attempted to get parameters for ${method} ${path}, ` +
            `which is not an operation.`);
        return parameters;
    }
    // First, consider parameters in Path Item Object:
    const pathParams = pathItem.parameters;
    if (Array.isArray(pathParams)) {
        const pathItemParameters = pathParams.map((p) => {
            if ('$ref' in p && typeof p.$ref === 'string') {
                // Here we know we have a parameter object:
                return resolveRef(p.$ref, oas);
            }
            else {
                // Here we know we have a parameter object:
                return p;
            }
        });
        parameters = parameters.concat(pathItemParameters);
    }
    // Second, consider parameters in Operation Object:
    const opObjectParameters = operation.parameters;
    if (Array.isArray(opObjectParameters)) {
        const operationParameters = opObjectParameters.map((p) => {
            if ('$ref' in p && typeof p.$ref === 'string') {
                // Here we know we have a parameter object:
                return resolveRef(p.$ref, oas);
            }
            else {
                // Here we know we have a parameter object:
                return p;
            }
        });
        parameters = parameters.concat(operationParameters);
    }
    return parameters;
}
exports.getParameters = getParameters;
/**
 * Returns an array of server objects for the operation at the given path and
 * method. Considers in the following order: global server definitions,
 * definitions at the path item, definitions at the operation, or the OAS
 * default.
 */
function getServers(operation, pathItem, oas) {
    let servers = [];
    // Global server definitions:
    if (Array.isArray(oas.servers) && oas.servers.length > 0) {
        servers = oas.servers;
    }
    // First, consider servers defined on the path
    if (Array.isArray(pathItem.servers) && pathItem.servers.length > 0) {
        servers = pathItem.servers;
    }
    // Second, consider servers defined on the operation
    if (Array.isArray(operation.servers) && operation.servers.length > 0) {
        servers = operation.servers;
    }
    // Default, in case there is no server:
    if (servers.length === 0) {
        let server = {
            url: '/' // TODO: avoid double-slashes
        };
        servers.push(server);
    }
    return servers;
}
exports.getServers = getServers;
/**
 * Returns a map of security scheme definitions, identified by keys. Resolves
 * possible references.
 */
function getSecuritySchemes(oas) {
    // Collect all security schemes:
    const securitySchemes = {};
    if (typeof oas.components === 'object' &&
        typeof oas.components.securitySchemes === 'object') {
        for (let schemeKey in oas.components.securitySchemes) {
            const securitySchemeOrRef = oas.components.securitySchemes[schemeKey];
            // Ensure we have actual SecuritySchemeObject:
            if ('$ref' in securitySchemeOrRef &&
                typeof securitySchemeOrRef.$ref === 'string') {
                // Result of resolution will be SecuritySchemeObject:
                securitySchemes[schemeKey] = resolveRef(securitySchemeOrRef.$ref, oas);
            }
            else {
                // We already have a SecuritySchemeObject:
                securitySchemes[schemeKey] = securitySchemeOrRef;
            }
        }
    }
    return securitySchemes;
}
exports.getSecuritySchemes = getSecuritySchemes;
/**
 * Returns the list of sanitized keys of non-OAuth2 security schemes
 * required by the operation at the given path and method.
 */
function getSecurityRequirements(operation, securitySchemes, oas) {
    const results = [];
    // First, consider global requirements
    const globalSecurity = oas.security;
    if (globalSecurity && typeof globalSecurity !== 'undefined') {
        for (let secReq of globalSecurity) {
            for (let schemaKey in secReq) {
                if (securitySchemes[schemaKey] &&
                    typeof securitySchemes[schemaKey] === 'object' &&
                    securitySchemes[schemaKey].def.type !== 'oauth2') {
                    results.push(schemaKey);
                }
            }
        }
    }
    // Second, consider operation requirements
    const localSecurity = operation.security;
    if (localSecurity && typeof localSecurity !== 'undefined') {
        for (let secReq of localSecurity) {
            for (let schemaKey in secReq) {
                if (securitySchemes[schemaKey] &&
                    typeof securitySchemes[schemaKey] === 'object' &&
                    securitySchemes[schemaKey].def.type !== 'oauth2') {
                    if (!results.includes(schemaKey)) {
                        results.push(schemaKey);
                    }
                }
            }
        }
    }
    return results;
}
exports.getSecurityRequirements = getSecurityRequirements;
var CaseStyle;
(function (CaseStyle) {
    CaseStyle[CaseStyle["simple"] = 0] = "simple";
    CaseStyle[CaseStyle["PascalCase"] = 1] = "PascalCase";
    CaseStyle[CaseStyle["camelCase"] = 2] = "camelCase";
    CaseStyle[CaseStyle["ALL_CAPS"] = 3] = "ALL_CAPS"; // Used for enum values
})(CaseStyle = exports.CaseStyle || (exports.CaseStyle = {}));
/**
 * Checks to see if the provided string is GraphQL-safe
 */
function isSanitized(str) {
    return /[a-zA-Z0-9_]/gi.test(str);
}
exports.isSanitized = isSanitized;
/**
 * First sanitizes given string and then also camelCases it.
 */
function sanitize(str, caseStyle) {
    /**
     * Used in conjunction to simpleNames, which only removes illegal
     * characters and preserves casing
     */
    if (caseStyle === CaseStyle.simple) {
        let sanitized = str.replace(/[^a-zA-Z0-9_]/gi, '');
        // Special case: we cannot start with number, and cannot be empty:
        if (/^[0-9]/.test(sanitized) || sanitized === '') {
            sanitized = '_' + sanitized;
        }
        return sanitized;
    }
    /**
     * Remove all GraphQL unsafe characters
     */
    const regex = caseStyle === CaseStyle.ALL_CAPS
        ? /[^a-zA-Z0-9_]/g // ALL_CAPS has underscores
        : /[^a-zA-Z0-9]/g;
    let sanitized = str.split(regex).reduce((path, part) => {
        if (caseStyle === CaseStyle.ALL_CAPS) {
            return path + '_' + part;
        }
        else {
            return path + capitalize(part);
        }
    });
    switch (caseStyle) {
        case CaseStyle.PascalCase:
            // The first character in PascalCase should be uppercase
            sanitized = capitalize(sanitized);
            break;
        case CaseStyle.camelCase:
            // The first character in camelCase should be lowercase
            sanitized = uncapitalize(sanitized);
            break;
        case CaseStyle.ALL_CAPS:
            sanitized = sanitized.toUpperCase();
            break;
    }
    // Special case: we cannot start with number, and cannot be empty:
    if (/^[0-9]/.test(sanitized) || sanitized === '') {
        sanitized = '_' + sanitized;
    }
    return sanitized;
}
exports.sanitize = sanitize;
/**
 * Sanitizes the given string and stores the sanitized-to-original mapping in
 * the given mapping.
 */
function storeSaneName(saneStr, str, mapping) {
    if (saneStr in mapping && str !== mapping[saneStr]) {
        // TODO: Follow warning model
        translationLog(`Warning: '${str}' and '${mapping[saneStr]}' both sanitize ` +
            `to '${saneStr}' - collision possible. Desanitize to '${str}'.`);
    }
    mapping[saneStr] = str;
    return saneStr;
}
exports.storeSaneName = storeSaneName;
/**
 * Stringifies and possibly trims the given string to the provided length.
 */
function trim(str, length) {
    if (typeof str !== 'string') {
        str = JSON.stringify(str);
    }
    if (str && str.length > length) {
        str = `${str.substring(0, length)}...`;
    }
    return str;
}
exports.trim = trim;
/**
 * Determines if the given "method" is indeed an operation. Alternatively, the
 * method could point to other types of information (e.g., parameters, servers).
 */
function isHttpMethod(method) {
    return Object.keys(HTTP_METHODS).includes(method.toLowerCase());
}
exports.isHttpMethod = isHttpMethod;
/**
 * Formats a string that describes an operation in the form:
 * {name of OAS} {HTTP method in ALL_CAPS} {operation path}
 *
 * Also used in preprocessing.ts where Operation objects are being constructed
 */
function formatOperationString(method, path, title) {
    if (title) {
        return `${title} ${method.toUpperCase()} ${path}`;
    }
    else {
        return `${method.toUpperCase()} ${path}`;
    }
}
exports.formatOperationString = formatOperationString;
/**
 * Capitalizes a given string
 */
function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}
exports.capitalize = capitalize;
/**
 * Uncapitalizes a given string
 */
function uncapitalize(str) {
    return str.charAt(0).toLowerCase() + str.slice(1);
}
exports.uncapitalize = uncapitalize;
/**
 * For operations that do not have an operationId, generate one
 */
function generateOperationId(method, path) {
    return sanitize(`${method} ${path}`, CaseStyle.camelCase);
}
exports.generateOperationId = generateOperationId;
//# sourceMappingURL=oas_3_tools.js.map