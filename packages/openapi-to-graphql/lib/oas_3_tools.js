"use strict";
// Copyright IBM Corp. 2018. All Rights Reserved.
// Node module: openapi-to-graphql
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateOperationId = exports.uncapitalize = exports.capitalize = exports.formatOperationString = exports.isHttpMethod = exports.trim = exports.storeSaneName = exports.sanitize = exports.CaseStyle = exports.getSecurityRequirements = exports.getSecuritySchemes = exports.getServers = exports.getParameters = exports.getLinks = exports.getResponseStatusCode = exports.getResponseSchemaAndNames = exports.getResponseObject = exports.getRequestSchemaAndNames = exports.getRequestBodyObject = exports.inferResourceNameFromPath = exports.getSchemaTargetGraphQLType = exports.desanitizeObjectKeys = exports.sanitizeObjectKeys = exports.getBaseUrl = exports.resolveRef = exports.countOperationsWithPayload = exports.countOperationsSubscription = exports.countOperationsMutation = exports.countOperationsQuery = exports.countOperations = exports.getValidOAS3 = exports.methodToHttpMethod = exports.SUCCESS_STATUS_RX = exports.HTTP_METHODS = void 0;
// Imports:
const Swagger2OpenAPI = require("swagger2openapi");
const OASValidator = require("oas-validator");
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
function getValidOAS3(spec) {
    return new Promise((resolve, reject) => {
        // CASE: translate
        if (typeof spec.swagger === 'string' &&
            spec.swagger === '2.0') {
            preprocessingLog(`Received Swagger - going to translate to OpenAPI Specification...`);
            Swagger2OpenAPI.convertObj(spec, {})
                .then((options) => resolve(options.openapi))
                .catch((error) => reject(`Could not convert Swagger '${spec.info.title}' to OpenAPI Specification. ${error.message}`));
            // CASE: validate
        }
        else if (typeof spec.openapi === 'string' &&
            /^3/.test(spec.openapi)) {
            preprocessingLog(`Received OpenAPI Specification - going to validate...`);
            OASValidator.validate(spec, {})
                .then(() => resolve(spec))
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
 *
 * Does not consider allOf, anyOf, oneOf, or not (handled separately)
 */
function getSchemaTargetGraphQLType(schema, data) {
    // CASE: object
    if (schema.type === 'object' || typeof schema.properties === 'object') {
        // TODO: additionalProperties is more like a flag than a type itself
        // CASE: arbitrary JSON
        if (typeof schema.additionalProperties === 'object') {
            return 'json';
        }
        else {
            return 'object';
        }
    }
    // CASE: array
    if (schema.type === 'array' || 'items' in schema) {
        return 'list';
    }
    // CASE: enum
    if (Array.isArray(schema.enum)) {
        return 'enum';
    }
    // CASE: a type is present
    if (typeof schema.type === 'string') {
        // Special edge cases involving the schema format
        if (typeof schema.format === 'string') {
            /**
             * CASE: 64 bit int - return number instead of integer, leading to use of
             * GraphQLFloat, which can support 64 bits:
             */
            if (schema.type === 'integer' && schema.format === 'int64') {
                return 'number';
                // CASE: id
            }
            else if (schema.type === 'string' &&
                (schema.format === 'uuid' ||
                    // Custom ID format
                    (Array.isArray(data.options.idFormats) &&
                        data.options.idFormats.includes(schema.format)))) {
                return 'id';
            }
        }
        return schema.type;
    }
    return null;
}
exports.getSchemaTargetGraphQLType = getSchemaTargetGraphQLType;
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
 * Returns JSON-compatible schema required by the given operation
 */
function getRequestBodyObject(operation, oas) {
    if (typeof operation.requestBody === 'object') {
        let requestBodyObject = operation.requestBody;
        // Make sure we have a RequestBodyObject:
        if (typeof requestBodyObject.$ref === 'string') {
            requestBodyObject = resolveRef(requestBodyObject.$ref, oas);
        }
        else {
            requestBodyObject = requestBodyObject;
        }
        if (typeof requestBodyObject.content === 'object') {
            const content = requestBodyObject.content;
            // Prioritize content-type JSON
            if (Object.keys(content).includes('application/json')) {
                return {
                    payloadContentType: 'application/json',
                    requestBodyObject
                };
            }
            else if (Object.keys(content).includes('application/x-www-form-urlencoded')) {
                return {
                    payloadContentType: 'application/x-www-form-urlencoded',
                    requestBodyObject
                };
            }
            else {
                // Pick first (random) content type
                const randomContentType = Object.keys(content)[0];
                return {
                    payloadContentType: randomContentType,
                    requestBodyObject
                };
            }
        }
    }
    return { payloadContentType: null, requestBodyObject: null };
}
exports.getRequestBodyObject = getRequestBodyObject;
/**
 * Returns the request schema (if any) for the given operation,
 * a dictionary of names from different sources (if available), and whether the
 * request schema is required for the operation.
 */
function getRequestSchemaAndNames(path, method, operation, oas) {
    const { payloadContentType, requestBodyObject } = getRequestBodyObject(operation, oas);
    if (payloadContentType) {
        let payloadSchema = requestBodyObject.content[payloadContentType].schema;
        // Get resource name from different sources
        let fromRef;
        if ('$ref' in payloadSchema) {
            fromRef = payloadSchema['$ref'].split('/').pop();
            payloadSchema = resolveRef(payloadSchema['$ref'], oas);
        }
        let payloadSchemaNames = {
            fromRef,
            fromSchema: payloadSchema.title,
            fromPath: inferResourceNameFromPath(path)
        };
        // Determine if request body is required:
        const payloadRequired = typeof requestBodyObject.required === 'boolean'
            ? requestBodyObject.required
            : false;
        /**
         * Edge case: if request body content-type is not application/json or
         * application/x-www-form-urlencoded, do not parse it.
         *
         * Instead, treat the request body as a black box and send it as a string
         * with the proper content-type header
         */
        if (payloadContentType !== 'application/json' &&
            payloadContentType !== 'application/x-www-form-urlencoded') {
            const saneContentTypeName = uncapitalize(payloadContentType.split('/').reduce((name, term) => {
                return name + capitalize(term);
            }));
            payloadSchemaNames = {
                fromPath: saneContentTypeName
            };
            let description = `String represents payload of content type '${payloadContentType}'`;
            if ('description' in payloadSchema &&
                typeof payloadSchema.description === 'string') {
                description += `\n\nOriginal top level description: '${payloadSchema['description']}'`;
            }
            payloadSchema = {
                description: description,
                type: 'string'
            };
        }
        return {
            payloadContentType,
            payloadSchema,
            payloadSchemaNames,
            payloadRequired
        };
    }
    return {
        payloadRequired: false
    };
}
exports.getRequestSchemaAndNames = getRequestSchemaAndNames;
/**
 * Returns JSON-compatible schema produced by the given operation
 */
function getResponseObject(operation, statusCode, oas) {
    if (typeof operation.responses === 'object') {
        const responses = operation.responses;
        if (typeof responses[statusCode] === 'object') {
            let responseObject = responses[statusCode];
            // Make sure we have a ResponseObject:
            if (typeof responseObject.$ref === 'string') {
                responseObject = resolveRef(responseObject.$ref, oas);
            }
            else {
                responseObject = responseObject;
            }
            if (responseObject.content &&
                typeof responseObject.content !== 'undefined') {
                const content = responseObject.content;
                // Prioritize content-type JSON
                if (Object.keys(content).includes('application/json')) {
                    return {
                        responseContentType: 'application/json',
                        responseObject
                    };
                }
                else {
                    // Pick first (random) content type
                    const randomContentType = Object.keys(content)[0];
                    return {
                        responseContentType: randomContentType,
                        responseObject
                    };
                }
            }
        }
    }
    return { responseContentType: null, responseObject: null };
}
exports.getResponseObject = getResponseObject;
/**
 * Returns the response schema for the given operation,
 * a successful  status code, and a dictionary of names from different sources
 * (if available).
 */
function getResponseSchemaAndNames(path, method, operation, oas, data, options) {
    const statusCode = getResponseStatusCode(path, method, operation, oas, data);
    if (!statusCode) {
        return {};
    }
    let { responseContentType, responseObject } = getResponseObject(operation, statusCode, oas);
    if (responseContentType) {
        let responseSchema = responseObject.content[responseContentType].schema;
        let fromRef;
        if ('$ref' in responseSchema) {
            fromRef = responseSchema['$ref'].split('/').pop();
            responseSchema = resolveRef(responseSchema['$ref'], oas);
        }
        const responseSchemaNames = {
            fromRef,
            fromSchema: responseSchema.title,
            fromPath: inferResourceNameFromPath(path)
        };
        /**
         * Edge case: if response body content-type is not application/json, do not
         * parse.
         */
        if (responseContentType !== 'application/json') {
            let description = 'Placeholder to access non-application/json response bodies';
            if ('description' in responseSchema &&
                typeof responseSchema['description'] === 'string') {
                description += `\n\nOriginal top level description: '${responseSchema['description']}'`;
            }
            responseSchema = {
                description: description,
                type: 'string'
            };
        }
        return {
            responseContentType,
            responseSchema,
            responseSchemaNames,
            statusCode
        };
    }
    else {
        /**
         * GraphQL requires that objects must have some properties.
         *
         * To allow some operations (such as those with a 204 HTTP code) to be
         * included in the GraphQL interface, we added the fillEmptyResponses
         * option, which will simply create a placeholder to allow access.
         */
        if (options.fillEmptyResponses) {
            return {
                responseSchemaNames: {
                    fromPath: inferResourceNameFromPath(path)
                },
                responseContentType: 'application/json',
                responseSchema: {
                    description: 'Placeholder to support operations with no response schema',
                    type: 'object'
                }
            };
        }
        return {};
    }
}
exports.getResponseSchemaAndNames = getResponseSchemaAndNames;
/**
 * Returns a success status code for the given operation
 */
function getResponseStatusCode(path, method, operation, oas, data) {
    if (typeof operation.responses === 'object') {
        const codes = Object.keys(operation.responses);
        const successCodes = codes.filter((code) => {
            return exports.SUCCESS_STATUS_RX.test(code);
        });
        if (successCodes.length === 1) {
            return successCodes[0];
        }
        else if (successCodes.length > 1) {
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
    return null;
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
            let response = responses[statusCode];
            if (typeof response.$ref === 'string') {
                response = resolveRef(response.$ref, oas);
            }
            // Here, we can be certain we have a ResponseObject:
            response = response;
            if (typeof response.links === 'object') {
                const epLinks = response.links;
                for (let linkKey in epLinks) {
                    let link = epLinks[linkKey];
                    // Make sure we have LinkObjects:
                    if (typeof link.$ref === 'string') {
                        link = resolveRef(link['$ref'], oas);
                    }
                    else {
                        link = link;
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
            if (typeof p.$ref === 'string') {
                // Here we know we have a parameter object:
                return resolveRef(p['$ref'], oas);
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
            if (typeof p.$ref === 'string') {
                // Here we know we have a parameter object:
                return resolveRef(p['$ref'], oas);
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
            const securityScheme = oas.components.securitySchemes[schemeKey];
            // Ensure we have actual SecuritySchemeObject:
            if (typeof securityScheme.$ref === 'string') {
                // Result of resolution will be SecuritySchemeObject:
                securitySchemes[schemeKey] = resolveRef(securityScheme.$ref, oas);
            }
            else {
                // We already have a SecuritySchemeObject:
                securitySchemes[schemeKey] = securityScheme;
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
 * First sanitizes given string and then also camelCases it.
 */
function sanitize(str, caseStyle) {
    /**
     * Used in conjunction to simpleNames, which only removes illegal
     * characters and preserves casing
     */
    if (caseStyle === CaseStyle.simple) {
        return str.replace(/[^a-zA-Z0-9_]/gi, '');
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