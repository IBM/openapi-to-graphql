"use strict";
// Copyright IBM Corp. 2018. All Rights Reserved.
// Node module: oasgraph
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT
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
const Swagger2OpenAPI = require("swagger2openapi");
const OASValidator = require("oas-validator");
const debug_1 = require("debug");
const utils_1 = require("./utils");
const logHttp = debug_1.default('http');
const logPre = debug_1.default('preprocessing');
const log = debug_1.default('translation');
// OAS constants
exports.OAS_OPERATIONS = ['get', 'put', 'post', 'patch', 'delete', 'options', 'head'];
exports.SUCCESS_STATUS_RX = /2[0-9]{2}|2XX/;
/**
 * Resolves on a validated OAS 3 for the given spec (OAS 2 or OAS 3), or rejects
 * if errors occur.
 */
function getValidOAS3(spec) {
    return __awaiter(this, void 0, void 0, function* () {
        // CASE: translate
        if (typeof spec.swagger === 'string'
            && spec.swagger === '2.0') {
            logPre(`Received OpenAPI Specification 2.0 - going to translate...`);
            let result = yield Swagger2OpenAPI.convertObj(spec, {});
            return result.openapi;
            // CASE: validate
        }
        else if (typeof spec.openapi === 'string'
            && /^3/.test(spec.openapi)) {
            logPre(`Received OpenAPI Specification 3.0.x - going to validate...`);
            let valid = OASValidator.validateSync(spec, {});
            if (!valid) {
                throw new Error(`Validation of OpenAPI Specification failed.`);
            }
            logPre(`OpenAPI Specification is validated`);
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
function resolveRef(ref, obj, parts) {
    if (typeof parts === 'undefined') {
        parts = ref.split('/');
    }
    if (parts.length === 0) {
        return obj;
    }
    let firstElement = parts.splice(0, 1)[0];
    if (firstElement === '#') {
        return resolveRef(ref, obj, parts);
    }
    if (firstElement in obj) {
        return resolveRef(ref, obj[firstElement], parts);
    }
    else {
        throw new Error(`Could not resolve reference "${ref}"`);
    }
}
exports.resolveRef = resolveRef;
/**
 * From the given OAS, returns the base URL to use for the given operation.
 */
function getBaseUrl(oas, operation) {
    // check for servers:
    if (!Array.isArray(operation.servers) || operation.servers.length === 0) {
        throw new Error(`No servers defined for operation ` +
            `"${operation.operationId}"`);
    }
    // check for local servers
    if (Array.isArray(operation.servers) && operation.servers.length > 0) {
        let url = buildUrl(operation.servers[0]);
        if (Array.isArray(operation.servers) && operation.servers.length > 1) {
            logHttp(`Warning: Randomly selected first server ${url}`);
        }
        return url.replace(/\/$/, '');
    }
    if (Array.isArray(oas.servers) && oas.servers.length > 0) {
        let url = buildUrl(oas.servers[0]);
        if (Array.isArray(oas.servers) && oas.servers.length > 1) {
            logHttp(`Warning: Randomly selected first server ${url}`);
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
    // necessary?
    if (typeof server.variables === 'object' &&
        Object.keys(server.variables).length > 0) {
        for (let variableKey in server.variables) {
            // check for default? Would be invalid OAS
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
            let res = {};
            for (let key in obj) {
                if (!exceptions.includes(key)) {
                    let saneKey = beautify(key);
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
    const replaceKeys = (obj) => {
        if (Array.isArray(obj)) {
            return obj.map(replaceKeys);
        }
        else if (typeof obj === 'object') {
            let res = {};
            for (let key in obj) {
                if (key in mapping) {
                    let rawKey = mapping[key];
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
    let query = {};
    let headers = {};
    // case: nothing to do
    if (Array.isArray(parameters)) {
        // iterate parameters:
        for (let param of parameters) {
            let sanitizedParamName = beautify(param.name);
            if (sanitizedParamName && sanitizedParamName in args) {
                switch (param.in) {
                    // path parameters
                    case 'path':
                        path = path.replace(`{${param.name}}`, args[sanitizedParamName]);
                        break;
                    // query parameters
                    case 'query':
                        query[param.name] = args[sanitizedParamName];
                        break;
                    // header parameters
                    case 'header':
                        headers[param.name] = args[sanitizedParamName];
                        break;
                    // cookie parameters
                    case 'cookie':
                        if (!('cookie' in headers)) {
                            headers['cookie'] = '';
                        }
                        headers['cookie'] += `${param.name}=${args[sanitizedParamName]}; `;
                        break;
                    default:
                        logHttp(`Warning: The parameter location "${param.in}" in the ` +
                            `parameter "${param.name}" of operation "${path}" is not supported`);
                }
            }
            else {
                logHttp(`Warning: The parameter "${param.name}" of operation "${path}" ` +
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
function getSchemaType(schema) {
    // CASE: enum
    if (Array.isArray(schema.enum)) {
        return 'enum';
    }
    // CASE: object
    if (schema.type === 'object') {
        // CASE: arbitrary JSON
        if (typeof schema.additionalProperties === 'object') {
            return 'json';
        }
        // if there are no properties:
        if (typeof schema.properties === 'undefined' ||
            Object.keys(schema.properties).length === 0) {
            return null;
        }
        return 'object';
    }
    if ('properties' in schema) {
        return 'object';
    }
    // CASE: array
    if ('items' in schema) {
        return 'array';
    }
    // CASE: 64 bit int - return number, leading to use of GraphQLFloat:
    if (schema.type === 'integer' && schema.format === 'int64') {
        return 'number';
    }
    // CASE: a type is present
    if (typeof schema.type === 'string') {
        return schema.type;
    }
    // CASE: nullable - default to string
    if (typeof schema.nullable !== 'undefined') {
        return 'string';
    }
    return null;
}
exports.getSchemaType = getSchemaType;
/**
 * Determines an approximate name for the resource at the given path.
 */
function inferResourceNameFromPath(path) {
    let name = '';
    let parts = path.split('/');
    parts.forEach((part, i) => {
        if (!/{|}/g.test(part)) {
            let partClean = sanitize(parts[i]);
            if (i === 0) {
                name += partClean;
            }
            else {
                name += partClean.charAt(0).toUpperCase() + partClean.slice(1);
            }
        }
    });
    return name;
}
exports.inferResourceNameFromPath = inferResourceNameFromPath;
/**
 * Returns JSON-compatible schema required by the given endpoint - or null if it
 * does not exist.
 */
function getRequestSchema(endpoint, oas) {
    if (typeof endpoint.requestBody === 'object') {
        let requestBody = endpoint.requestBody;
        // make sure we have a RequestBodyObject:
        if (typeof requestBody.$ref === 'string') {
            requestBody = resolveRef(requestBody.$ref, oas);
        }
        else {
            requestBody = requestBody;
        }
        if (typeof requestBody.content === 'object') {
            let content = requestBody.content;
            // Prioritizes content-type JSON
            if (Object.keys(content).includes('application/json')) {
                return { payloadContentType: 'application/json', payloadSchema: content['application/json'].schema };
            }
            else {
                // Picks a random content type
                for (let contentType in content) {
                    return { payloadContentType: contentType, payloadSchema: content[contentType].schema };
                }
            }
        }
    }
    return { payloadContentType: null, payloadSchema: null };
}
exports.getRequestSchema = getRequestSchema;
/**
 * Returns the request schema (if any) for endpoint at given path and method, a
 * dictionary of names from different sources (if available), and whether the
 * request schema is required for the endpoint.
 */
function getRequestSchemaAndNames(path, method, oas) {
    let endpoint = oas.paths[path][method];
    let payloadRequired = false;
    let payloadSchemaNames = {};
    let { payloadContentType, payloadSchema } = getRequestSchema(endpoint, oas);
    if (payloadSchema) {
        let requestBody = endpoint.requestBody;
        // determine if request body is required:
        if (typeof requestBody === 'object') {
            // resolve reference if needed:
            if (typeof requestBody.$ref === 'string') {
                requestBody = resolveRef(requestBody['$ref'], oas);
            }
            if (typeof requestBody.required === 'boolean') {
                payloadRequired = requestBody.required;
            }
        }
        payloadSchemaNames.fromPath = inferResourceNameFromPath(path);
        if ('$ref' in payloadSchema) {
            payloadSchemaNames.fromRef = payloadSchema['$ref'].split('/').pop();
            payloadSchema = resolveRef(payloadSchema['$ref'], oas);
        }
        if ('title' in payloadSchema) {
            payloadSchemaNames.fromSchema = payloadSchema.title;
        }
        // if request body content-type is not application/json, do not parse.
        // interpret the request body as a string
        if (payloadContentType !== 'application/json') {
            let saneContentTypeName = '';
            let terms = payloadContentType.split('/');
            for (let index in terms) {
                saneContentTypeName += terms[index].charAt(0).toUpperCase() + terms[index].slice(1);
            }
            payloadSchemaNames = {
                fromPath: saneContentTypeName
            };
            let description = payloadContentType + ' request placeholder object';
            if ('description' in payloadSchema && typeof (payloadSchema['description']) === 'string') {
                description += `\n\nOriginal top level description: ${payloadSchema['description']}`;
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
function getResponseSchema(endpoint, statusCode, oas) {
    if (typeof endpoint.responses === 'object') {
        let responses = endpoint.responses;
        if (typeof responses[statusCode] === 'object') {
            let response = responses[statusCode];
            // make sure we have a ResponseObject:
            if (typeof response.$ref === 'string') {
                response = resolveRef(response.$ref, oas);
            }
            else {
                response = response;
            }
            if (response.content && typeof response.content !== 'undefined') {
                let content = response.content;
                // Prioritizes content-type JSON
                if (Object.keys(content).includes('application/json')) {
                    return { responseContentType: 'application/json', responseSchema: content['application/json'].schema };
                }
                else {
                    // Picks a random content type
                    for (let contentType in content) {
                        return { responseContentType: contentType, responseSchema: content[contentType].schema };
                    }
                }
            }
        }
    }
    return { responseContentType: null, responseSchema: null };
}
exports.getResponseSchema = getResponseSchema;
/**
 * Returns the response schema for endpoint at given path and method and with
 * the given status code, and a dictionary of names from different sources (if
 * available).
 */
function getResponseSchemaAndNames(path, method, oas, data, options) {
    let endpoint = oas.paths[path][method];
    let responseSchemaNames = {};
    let statusCode = getResponseStatusCode(path, method, oas, data);
    if (!statusCode) {
        return {};
    }
    let { responseContentType, responseSchema } = getResponseSchema(endpoint, statusCode, oas);
    if (responseSchema) {
        responseSchemaNames.fromPath = inferResourceNameFromPath(path);
        if ('$ref' in responseSchema) {
            responseSchemaNames.fromRef = responseSchema['$ref'].split('/').pop();
            responseSchema = resolveRef(responseSchema['$ref'], oas);
        }
        if ('title' in responseSchema) {
            responseSchemaNames.fromSchema = responseSchema.title;
        }
        // if request body content-type is not application/json, do not parse.
        // interpret the request body as a string
        if (responseContentType !== 'application/json') {
            let description = 'Placeholder object to access non-application/json ' +
                'response bodies';
            if ('description' in responseSchema && typeof (responseSchema['description']) === 'string') {
                description += `\n\nOriginal top level description: ${responseSchema['description']}`;
            }
            responseSchema = {
                description: description,
                type: 'string'
            };
        }
        return {
            responseContentType,
            responseSchema,
            responseSchemaNames
        };
    }
    else {
        /**
         * 204 is a special case in which a successful call does not return a
         * response. GraphQL does not support that kind of functionality so by
         * default, these operations will be ignored.
         *
         * However, if the following condition is true, then OASGraph will inject
         * a placeholder response schema.
         */
        if (statusCode === '204' && options.fillEmptyResponses) {
            return {
                responseSchemaNames: {
                    fromPath: inferResourceNameFromPath(path),
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
    let endpoint = oas.paths[path][method];
    if (typeof endpoint.responses === 'object') {
        let codes = Object.keys(endpoint.responses);
        let successCodes = codes.filter(code => {
            return exports.SUCCESS_STATUS_RX.test(code);
        });
        if (successCodes.length === 1) {
            return successCodes[0];
        }
        else if (successCodes.length > 1) {
            utils_1.handleWarning({
                typeKey: 'MULTIPLE_RESPONSES',
                culprit: `${method.toUpperCase()} ${path}`,
                solution: `${successCodes[0]}`,
                data,
                log
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
    let links = {};
    let endpoint = oas.paths[path][method];
    let statusCode = getResponseStatusCode(path, method, oas, data);
    if (!statusCode) {
        return links;
    }
    if (typeof endpoint.responses === 'object') {
        let responses = endpoint.responses;
        if (typeof responses[statusCode] === 'object') {
            let response = responses[statusCode];
            if (typeof response.$ref === 'string') {
                response = resolveRef(response.$ref, oas);
            }
            // here, we can be ceratain we have a ResponseObject:
            response = response;
            if (typeof response.links === 'object') {
                let epLinks = response.links;
                for (let linkKey in epLinks) {
                    let link = epLinks[linkKey];
                    // make sure we have LinkObjects:
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
        log(`Warning: attempted to get parameters for ${method} ${path}, ` +
            `which is not an operation.`);
        return parameters;
    }
    let pathItemObject = oas.paths[path];
    let pathParams = pathItemObject.parameters;
    // first, consider parameters in Path Item Object:
    if (Array.isArray(pathParams)) {
        let pathItemParameters = pathParams.map(p => {
            if (typeof p.$ref === 'string') {
                // here we know we have a parameter object:
                return resolveRef(p['$ref'], oas);
            }
            else {
                // here we know we have a parameter object:
                return p;
            }
        });
        parameters = parameters.concat(pathItemParameters);
    }
    // second, consider parameters in Operation Object:
    let opObject = oas.paths[path][method];
    let opObjectParameters = opObject.parameters;
    if (Array.isArray(opObjectParameters)) {
        let opParameters = opObjectParameters.map(p => {
            if (typeof p.$ref === 'string') {
                // here we know we have a parameter object:
                return resolveRef(p['$ref'], oas);
            }
            else {
                // here we know we have a parameter object:
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
    // global server definitions:
    if (Array.isArray(oas.servers) && oas.servers.length > 0) {
        servers = oas.servers;
    }
    // path item server definitions override global:
    let pathItem = oas.paths[path];
    if (Array.isArray(pathItem.servers) && pathItem.servers.length > 0) {
        servers = pathItem.servers;
    }
    // operation server definitions override path item:
    let operationObj = pathItem[method];
    if (Array.isArray(operationObj.servers) && operationObj.servers.length > 0) {
        servers = operationObj.servers;
    }
    // default, in case there is no server:
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
    // collect all security schemes:
    let securitySchemes = {};
    if (typeof oas.components === 'object' &&
        typeof oas.components.securitySchemes === 'object') {
        for (let schemeKey in oas.components.securitySchemes) {
            let obj = oas.components.securitySchemes[schemeKey];
            // ensure we have actual SecuritySchemeObject:
            if (typeof obj.$ref === 'string') {
                // result of resolution will be SecuritySchemeObject:
                securitySchemes[schemeKey] =
                    resolveRef(obj.$ref, oas);
            }
            else {
                // we already have a SecuritySchemeObject:
                securitySchemes[schemeKey] = obj;
            }
        }
    }
    return securitySchemes;
}
exports.getSecuritySchemes = getSecuritySchemes;
/**
 * Returns the list of BEAUTIFIED keys of NON-OAUTH 2 security schemes
 * required by the operation at the given path and method.
 */
function getSecurityRequirements(path, method, securitySchemes, oas) {
    let results = [];
    // first, consider global requirements:
    let globalSecurity = oas.security;
    if (globalSecurity && typeof globalSecurity !== 'undefined') {
        for (let secReq of globalSecurity) {
            for (let schemaKey in secReq) {
                if (securitySchemes[schemaKey] &&
                    typeof securitySchemes[schemaKey] === 'object' &&
                    securitySchemes[schemaKey].type !== 'oauth2') {
                    results.push(schemaKey);
                }
            }
        }
    }
    // local:
    let operation = oas.paths[path][method];
    let localSecurity = operation.security;
    if (localSecurity && typeof localSecurity !== 'undefined') {
        for (let secReq of localSecurity) {
            for (let schemaKey in secReq) {
                if (securitySchemes[schemaKey] &&
                    typeof securitySchemes[schemaKey] === 'object' &&
                    securitySchemes[schemaKey].type !== 'oauth2') {
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
/**
 * Beautifies the given string and stores the sanitized-to-original mapping in
 * the given mapping.
 */
function beautifyAndStore(str, mapping) {
    if (!(typeof mapping === 'object')) {
        throw new Error(`No/invalid mapping passed to beautifyAndStore`);
    }
    let clean = beautify(str);
    if (!clean) {
        throw new Error(`Cannot beautifyAndStore ${str}`);
    }
    else if (clean !== str) {
        if (clean in mapping && str !== mapping[clean]) {
            log(`Warning: "${str}" and "${mapping[clean]}" both sanitize ` +
                `to ${clean} - collusion possible. Desanitize to ${str}.`);
        }
        mapping[clean] = str;
    }
    return clean;
}
exports.beautifyAndStore = beautifyAndStore;
/**
 * First sanitizes given string and then also camel-cases it.
 */
function beautify(str, lowercaseFirstChar = true) {
    // only apply to strings:
    if (typeof str !== 'string') {
        throw new Error(`Cannot beautify "${str}" of type "${typeof str}"`);
    }
    let charToRemove = '_';
    let sanitized = sanitize(str);
    while (sanitized.indexOf(charToRemove) !== -1) {
        let pos = sanitized.indexOf(charToRemove);
        if (sanitized.length >= pos + 2) {
            sanitized = sanitized.slice(0, pos) +
                sanitized.charAt(pos + 1).toUpperCase() +
                sanitized.slice(pos + 2, sanitized.length);
        }
        else if (sanitized.length === pos + 1) {
            sanitized = sanitized.slice(0, pos) +
                sanitized.charAt(pos + 1).toUpperCase();
        }
        else {
            sanitized = sanitized.slice(0, pos);
        }
    }
    // special case: we cannot start with number, and cannot be empty:
    if (/^[0-9]/.test(sanitized) || sanitized === '') {
        sanitized = '_' + sanitized;
    }
    // first character should be lowercase
    if (lowercaseFirstChar) {
        sanitized = sanitized.charAt(0).toLowerCase() +
            sanitized.slice(1, sanitized.length);
    }
    return sanitized;
}
exports.beautify = beautify;
/**
 * Sanitizes the given string so that it can be used as the name for a GraphQL
 * Object Type.
 */
function sanitize(str) {
    let clean = str.replace(/[^_a-zA-Z0-9]/g, '_');
    return clean;
}
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
//# sourceMappingURL=oas_3_tools.js.map