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
// Imports:
const Swagger2OpenAPI = require("swagger2openapi");
const OASValidator = require("oas-validator");
const debug_1 = require("debug");
const utils_1 = require("./utils");
const httpLog = debug_1.default('http');
const preprocessingLog = debug_1.default('preprocessing');
const translationLog = debug_1.default('translation');
// OAS constants
exports.OAS_OPERATIONS = [
    'get',
    'put',
    'post',
    'patch',
    'delete',
    'options',
    'head'
];
exports.SUCCESS_STATUS_RX = /2[0-9]{2}|2XX/;
/**
 * Resolves on a validated OAS 3 for the given spec (OAS 2 or OAS 3), or rejects
 * if errors occur.
 */
function getValidOAS3(spec) {
    return __awaiter(this, void 0, void 0, function* () {
        // CASE: translate
        if (typeof spec.swagger === 'string' &&
            spec.swagger === '2.0') {
            preprocessingLog(`Received OpenAPI Specification 2.0 - going to translate...`);
            const result = yield Swagger2OpenAPI.convertObj(spec, {});
            return result.openapi;
            // CASE: validate
        }
        else if (typeof spec.openapi === 'string' &&
            /^3/.test(spec.openapi)) {
            preprocessingLog(`Received OpenAPI Specification 3.0.x - going to validate...`);
            const valid = OASValidator.validateSync(spec, {});
            if (!valid) {
                throw new Error(`Validation of OpenAPI Specification failed.`);
            }
            preprocessingLog(`OpenAPI Specification is validated`);
            return spec;
        }
        else {
            throw new Error(`Invalid specification provided`);
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
            if (isOperation(method)) {
                numOps++;
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
            if (isOperation(method) && method.toLowerCase() === 'get') {
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
            if (isOperation(method) && method.toLowerCase() !== 'get') {
                numOps++;
            }
        }
    }
    return numOps;
}
exports.countOperationsMutation = countOperationsMutation;
/**
 * Counts the number of operations with a payload definition in an OAS.
 */
function countOperationsWithPayload(oas) {
    let numOps = 0;
    for (let path in oas.paths) {
        for (let method in oas.paths[path]) {
            if (isOperation(method) &&
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
    // Break path into individual tokens
    const parts = ref.split('/');
    const resolvedObject = resolveRefHelper(oas, parts);
    if (resolvedObject !== null) {
        return resolvedObject;
    }
    else {
        throw new Error(`Could not resolve reference '${ref}'`);
    }
}
exports.resolveRef = resolveRef;
/**
 * Helper for resolveRef
 *
 * @param parts The path to be resolved, but broken into tokens
 */
function resolveRefHelper(obj, parts) {
    if (parts.length === 0) {
        return obj;
    }
    const firstElement = parts.splice(0, 1)[0];
    if (firstElement in obj) {
        return resolveRefHelper(obj[firstElement], parts);
    }
    else if (firstElement === '#') {
        return resolveRefHelper(obj, parts);
    }
    else {
        return null;
    }
}
/**
 * Returns the base URL to use for the given operation.
 */
function getBaseUrl(operation) {
    // Check for servers:
    if (!Array.isArray(operation.servers) || operation.servers.length === 0) {
        throw new Error(`No servers defined for operation '${operation.operationId}'`);
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
 * Returns object | array where all object keys are sanitized. Keys passed in
 * exceptions are not sanitized.
 */
function sanitizeObjKeys(obj, exceptions = []) {
    const cleanKeys = (obj) => {
        if (obj === null || typeof obj === 'undefined') {
            return null;
        }
        else if (Array.isArray(obj)) {
            return obj.map(cleanKeys);
        }
        else if (typeof obj === 'object') {
            const res = {};
            for (let key in obj) {
                if (!exceptions.includes(key)) {
                    const saneKey = sanitize(key, CaseStyle.camelCase);
                    if (Object.prototype.hasOwnProperty.call(obj, key)) {
                        res[saneKey] = cleanKeys(obj[key]);
                    }
                }
                else {
                    res[key] = cleanKeys(obj[key]);
                }
            }
            return res;
        }
        else {
            return obj;
        }
    };
    return cleanKeys(obj);
}
exports.sanitizeObjKeys = sanitizeObjKeys;
/**
 * Desanitizes keys in given object by replacing them with the keys stored in
 * the given mapping.
 */
function desanitizeObjKeys(obj, mapping = {}) {
    const replaceKeys = obj => {
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
exports.desanitizeObjKeys = desanitizeObjKeys;
/**
 * Replaces the path parameter in the given path with values in the given args.
 * Furthermore adds the query parameters for a request.
 */
function instantiatePathAndGetQuery(path, parameters, args // NOTE: argument keys are sanitized!
) {
    const query = {};
    const headers = {};
    // Case: nothing to do
    if (Array.isArray(parameters)) {
        // Iterate parameters:
        for (let param of parameters) {
            const sanitizedParamName = sanitize(param.name, CaseStyle.camelCase);
            if (sanitizedParamName && sanitizedParamName in args) {
                switch (param.in) {
                    // Path parameters
                    case 'path':
                        path = path.replace(`{${param.name}}`, args[sanitizedParamName]);
                        break;
                    // Query parameters
                    case 'query':
                        query[param.name] = args[sanitizedParamName];
                        break;
                    // Header parameters
                    case 'header':
                        headers[param.name] = args[sanitizedParamName];
                        break;
                    // Cookie parameters
                    case 'cookie':
                        if (!('cookie' in headers)) {
                            headers['cookie'] = '';
                        }
                        headers['cookie'] += `${param.name}=${args[sanitizedParamName]}; `;
                        break;
                    default:
                        httpLog(`Warning: The parameter location '${param.in}' in the ` +
                            `parameter '${param.name}' of operation '${path}' is not ` +
                            `supported`);
                }
            }
            else {
                httpLog(`Warning: The parameter '${param.name}' of operation '${path}' ` +
                    `could not be found`);
            }
        }
    }
    return { path, query, headers };
}
exports.instantiatePathAndGetQuery = instantiatePathAndGetQuery;
/**
 * Returns the "type" of the given JSON schema. Makes best guesses if the type
 * is not explicitly defined.
 */
function getSchemaType(schema, data) {
    // CASE: object
    if (schema.type === 'object' ||
        'properties' in schema ||
        Array.isArray(schema.allOf)) {
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
        return 'array';
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
exports.getSchemaType = getSchemaType;
/**
 * Determines an approximate name for the resource at the given path.
 */
function inferResourceNameFromPath(path) {
    /**
     * Remove the path parameters from the path
     *
     * For example, turn /user/{userId}/car into userCar
     */
    let pathNoPathParams = path.split('/').reduce((path, part) => {
        if (!/{|}/g.test(part)) {
            return path + capitalize(part);
        }
        else {
            return path;
        }
    });
    return pathNoPathParams;
}
exports.inferResourceNameFromPath = inferResourceNameFromPath;
/**
 * Returns JSON-compatible schema required by the given endpoint - or null if it
 * does not exist.
 */
function getRequestBodyObject(endpoint, oas) {
    if (typeof endpoint.requestBody === 'object') {
        let requestBodyObject = endpoint.requestBody;
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
 * Returns the request schema (if any) for an endpoint at given path and method,
 * a dictionary of names from different sources (if available), and whether the
 * request schema is required for the endpoint.
 */
function getRequestSchemaAndNames(path, method, oas) {
    const endpoint = oas.paths[path][method];
    const { payloadContentType, requestBodyObject } = getRequestBodyObject(endpoint, oas);
    if (payloadContentType) {
        let payloadSchema = requestBodyObject.content[payloadContentType].schema;
        // Get resource name from different sources
        let fromRef;
        if ('$ref' in payloadSchema) {
            fromRef = payloadSchema['$ref'].split('/').pop();
            payloadSchema = resolveRef(payloadSchema['$ref'], oas);
        }
        let payloadSchemaNames = {
            fromPath: inferResourceNameFromPath(path),
            fromRef,
            fromSchema: payloadSchema.title
        };
        // Determine if request body is required:
        const payloadRequired = typeof requestBodyObject.required === 'boolean'
            ? requestBodyObject.required
            : false;
        /**
         * Edge case: if request body content-type is not application/json, do not
         * parse. Instead, treat the request body as a black box (allowing it to be
         * defined as a string) and sending it with the appropriate content-type
         */
        if (payloadContentType !== 'application/json') {
            const saneContentTypeName = uncapitalize(payloadContentType.split('/').reduce((name, term) => {
                return name + capitalize(term);
            }));
            payloadSchemaNames = {
                fromPath: saneContentTypeName
            };
            let description = payloadContentType + ' request placeholder object';
            if ('description' in payloadSchema &&
                typeof payloadSchema['description'] === 'string') {
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
 * Returns JSON-compatible schema produced by the given endpoint - or null if it
 * does not exist.
 */
function getResponseObject(endpoint, statusCode, oas) {
    if (typeof endpoint.responses === 'object') {
        const responses = endpoint.responses;
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
 * Returns the response schema for endpoint at given path and method and with
 * the given status code, and a dictionary of names from different sources (if
 * available).
 */
function getResponseSchemaAndNames(path, method, oas, data, options) {
    const endpoint = oas.paths[path][method];
    const statusCode = getResponseStatusCode(path, method, oas, data);
    if (!statusCode) {
        return {};
    }
    let { responseContentType, responseObject } = getResponseObject(endpoint, statusCode, oas);
    if (responseContentType) {
        let responseSchema = responseObject.content[responseContentType].schema;
        let fromRef;
        if ('$ref' in responseSchema) {
            fromRef = responseSchema['$ref'].split('/').pop();
            responseSchema = resolveRef(responseSchema['$ref'], oas);
        }
        const responseSchemaNames = {
            fromPath: inferResourceNameFromPath(path),
            fromRef,
            fromSchema: responseSchema.title
        };
        /**
         * Edge case: if request body content-type is not application/json, do not
         * parse. Instead, treat the request body as a black box (allowing it to be
         * defined as a string) and sending it with the appropriate content-type
         */
        if (responseContentType !== 'application/json') {
            let description = 'Placeholder object to access non-application/json ' + 'response bodies';
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
         * GraphQL requires that objects must have some properties. To allow some
         * operations (such as those with a 204 HTTP code) to be included in the
         * GraphQL interface, we added the fillEmptyResponses option, which will
         * simply create a placeholder object with a placeholder property.
         */
        if (options.fillEmptyResponses) {
            return {
                responseSchemaNames: {
                    fromPath: inferResourceNameFromPath(path)
                },
                responseContentType: 'application/json',
                responseSchema: {
                    description: 'Placeholder object to support operations with no response schema',
                    type: 'string'
                }
            };
        }
        return {};
    }
}
exports.getResponseSchemaAndNames = getResponseSchemaAndNames;
/**
 * Returns the success status code for the operation at the given path and
 * method (or null).
 */
function getResponseStatusCode(path, method, oas, data) {
    const endpoint = oas.paths[path][method];
    if (typeof endpoint.responses === 'object') {
        const codes = Object.keys(endpoint.responses);
        const successCodes = codes.filter(code => {
            return exports.SUCCESS_STATUS_RX.test(code);
        });
        if (successCodes.length === 1) {
            return successCodes[0];
        }
        else if (successCodes.length > 1) {
            utils_1.handleWarning({
                typeKey: 'MULTIPLE_RESPONSES',
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
 * Returns an hash containing the links defined in the given endpoint.
 */
function getEndpointLinks(path, method, oas, data) {
    const links = {};
    const endpoint = oas.paths[path][method];
    const statusCode = getResponseStatusCode(path, method, oas, data);
    if (!statusCode) {
        return links;
    }
    if (typeof endpoint.responses === 'object') {
        const responses = endpoint.responses;
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
exports.getEndpointLinks = getEndpointLinks;
/**
 * Returns the list of parameters for the endpoint at the given method and path.
 * Resolves possible references.
 */
function getParameters(path, method, oas) {
    let parameters = [];
    if (!isOperation(method)) {
        translationLog(`Warning: attempted to get parameters for ${method} ${path}, ` +
            `which is not an operation.`);
        return parameters;
    }
    const pathItemObject = oas.paths[path];
    const pathParams = pathItemObject.parameters;
    // First, consider parameters in Path Item Object:
    if (Array.isArray(pathParams)) {
        const pathItemParameters = pathParams.map(p => {
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
    const opObject = oas.paths[path][method];
    const opObjectParameters = opObject.parameters;
    if (Array.isArray(opObjectParameters)) {
        const opParameters = opObjectParameters.map(p => {
            if (typeof p.$ref === 'string') {
                // Here we know we have a parameter object:
                return resolveRef(p['$ref'], oas);
            }
            else {
                // Here we know we have a parameter object:
                return p;
            }
        });
        parameters = parameters.concat(opParameters);
    }
    return parameters;
}
exports.getParameters = getParameters;
/**
 * Returns an array of server objects for the opeartion at the given path and
 * method. Considers in the following order: global server definitions,
 * definitions at the path item, definitions at the operation, or the OAS
 * default.
 */
function getServers(path, method, oas) {
    let servers = [];
    // Global server definitions:
    if (Array.isArray(oas.servers) && oas.servers.length > 0) {
        servers = oas.servers;
    }
    // Path item server definitions override global:
    const pathItem = oas.paths[path];
    if (Array.isArray(pathItem.servers) && pathItem.servers.length > 0) {
        servers = pathItem.servers;
    }
    // Operation server definitions override path item:
    const operationObj = pathItem[method];
    if (Array.isArray(operationObj.servers) && operationObj.servers.length > 0) {
        servers = operationObj.servers;
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
 * Returns a map of Security Scheme definitions, identified by keys. Resolves
 * possible references.
 */
function getSecuritySchemes(oas) {
    // Collect all security schemes:
    const securitySchemes = {};
    if (typeof oas.components === 'object' &&
        typeof oas.components.securitySchemes === 'object') {
        for (let schemeKey in oas.components.securitySchemes) {
            const obj = oas.components.securitySchemes[schemeKey];
            // Ensure we have actual SecuritySchemeObject:
            if (typeof obj.$ref === 'string') {
                // Result of resolution will be SecuritySchemeObject:
                securitySchemes[schemeKey] = resolveRef(obj.$ref, oas);
            }
            else {
                // We already have a SecuritySchemeObject:
                securitySchemes[schemeKey] = obj;
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
function getSecurityRequirements(path, method, securitySchemes, oas) {
    const results = [];
    // First, consider global requirements:
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
    // Local:
    const operation = oas.paths[path][method];
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
    CaseStyle[CaseStyle["PascalCase"] = 0] = "PascalCase";
    CaseStyle[CaseStyle["camelCase"] = 1] = "camelCase";
    CaseStyle[CaseStyle["ALL_CAPS"] = 2] = "ALL_CAPS"; // Used for enum values
})(CaseStyle = exports.CaseStyle || (exports.CaseStyle = {}));
/**
 * First sanitizes given string and then also camel-cases it.
 */
function sanitize(str, caseStyle) {
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
            // Delete first underscore
            if (sanitized.charAt(0) === '_') {
                sanitized = sanitized.substr(0);
            }
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
 * Return an object similar to the input object except the keys are all
 * sanitized
 */
function sanitizeObjectKeys(obj) {
    return Object.keys(obj).reduce((acc, key) => {
        acc[sanitize(key, CaseStyle.camelCase)] = obj[key];
        return acc;
    }, {});
}
exports.sanitizeObjectKeys = sanitizeObjectKeys;
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
function isOperation(method) {
    return exports.OAS_OPERATIONS.includes(method.toLowerCase());
}
exports.isOperation = isOperation;
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
    return sanitize(`${method}:${path}`, CaseStyle.camelCase);
}
exports.generateOperationId = generateOperationId;
//# sourceMappingURL=oas_3_tools.js.map