'use strict';

/**
 * Utility functions around the OpenAPI Specification 3.
 */

// Type imports:

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.SUCCESS_STATUS_RX = exports.JSON_CONTENT_TYPES = exports.OAS_OPERATIONS = undefined;

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

// Imports:


// Type definitions & exports:


exports.getValidOAS3 = getValidOAS3;
exports.resolveRef = resolveRef;
exports.getBaseUrl = getBaseUrl;
exports.sanitizeObjKeys = sanitizeObjKeys;
exports.desanitizeObjKeys = desanitizeObjKeys;
exports.instantiatePathAndGetQuery = instantiatePathAndGetQuery;
exports.getSchemaType = getSchemaType;
exports.inferResourceNameFromPath = inferResourceNameFromPath;
exports.getResSchema = getResSchema;
exports.getReqSchema = getReqSchema;
exports.getReqSchemaAndNames = getReqSchemaAndNames;
exports.getResSchemaAndNames = getResSchemaAndNames;
exports.getResStatusCode = getResStatusCode;
exports.getEndpointLinks = getEndpointLinks;
exports.getParameters = getParameters;
exports.getServers = getServers;
exports.getSecuritySchemes = getSecuritySchemes;
exports.getSecurityRequirements = getSecurityRequirements;
exports.beautifyAndStore = beautifyAndStore;
exports.beautify = beautify;
exports.trim = trim;
exports.isOperation = isOperation;
exports.resolveAllOf = resolveAllOf;

var _swagger2openapi = require('swagger2openapi');

var _swagger2openapi2 = _interopRequireDefault(_swagger2openapi);

var _validate = require('swagger2openapi/validate.js');

var _validate2 = _interopRequireDefault(_validate);

var _deepEqual = require('deep-equal');

var _deepEqual2 = _interopRequireDefault(_deepEqual);

var _debug = require('debug');

var _debug2 = _interopRequireDefault(_debug);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var logHttp = (0, _debug2.default)('http');
var logPre = (0, _debug2.default)('preprocessing');

var log = (0, _debug2.default)('translation');

// OAS constants
var OAS_OPERATIONS = exports.OAS_OPERATIONS = ['get', 'put', 'post', 'delete', 'options', 'head', 'path', 'trace'];
var JSON_CONTENT_TYPES = exports.JSON_CONTENT_TYPES = ['application/json', '*/*'];
var SUCCESS_STATUS_RX = exports.SUCCESS_STATUS_RX = /2[0-9]{2}/;

/**
 * Resolves on a validated OAS 3 for the given spec (OAS 2 or OAS 3), or rejects
 * if errors occur.
 */
function getValidOAS3(spec) {
  return new Promise(function (resolve, reject) {
    // CASE: translate
    if (typeof spec.swagger === 'string' && spec.swagger === '2.0') {
      logPre('Received OpenAPI Specification 2.0 - going to translate...');
      _swagger2openapi2.default.convertObj(spec, {}).then(function (result) {
        resolve(result.openapi);
      }).catch(reject);
      // CASE: validate
    } else if (typeof spec.openapi === 'string' && /^3/.test(spec.openapi)) {
      logPre('Received OpenAPI Specification 3.0.x - going to validate...');
      var valid = true;
      try {
        valid = _validate2.default.validateSync(spec, {});
      } catch (err) {
        reject(err);
      }
      if (!valid) {
        reject(new Error('Validation of OpenAPI Specification failed.'));
      } else {
        logPre('OpenAPI Specification is validated');
        resolve(spec);
      }
    }
  });
}

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

  var firstElement = parts.splice(0, 1)[0];
  if (firstElement === '#') {
    return resolveRef(ref, obj, parts);
  }
  if (firstElement in obj) {
    return resolveRef(ref, obj[firstElement], parts);
  } else {
    throw new Error('could not resolve reference "' + ref + '"');
  }
}

/**
 * From the given OAS, returns the base URL to use for the given operation.
 */
function getBaseUrl(oas, operation) {
  // check for servers:
  if (!Array.isArray(operation.servers) || operation.servers.length === 0) {
    throw new Error('No servers defined for operation ' + ('"' + operation.operationId + '"'));
  }

  // check for local servers
  if (Array.isArray(operation.servers) && operation.servers.length > 0) {
    var url = buildUrl(operation.servers[0]);

    if (Array.isArray(operation.servers) && operation.servers.length > 1) {
      logHttp('Warning: randomly selected first server ' + url);
    }

    return url.replace(/\/$/, '');
  }

  if (Array.isArray(oas.servers) && oas.servers.length > 0) {
    var _url = buildUrl(oas.servers[0]);

    if (Array.isArray(oas.servers) && oas.servers.length > 1) {
      logHttp('Warning: randomly selected first server ' + _url);
    }

    return _url.replace(/\/$/, '');
  }

  throw new Error('Cannot find a server to call');
}

/**
 * Returns the default URL for a given OAS server object.
 */
function buildUrl(server) {
  var url = server.url;
  // necessary?
  if (_typeof(server.variables) === 'object' && Object.keys(server.variables).length > 0) {
    for (var variableKey in server.variables) {
      // check for default? Would be invalid OAS
      url = url.replace('{' + variableKey + '}', server.variables[variableKey].default.toString());
    }
  }

  return url;
}

/**
 * Returns object | array where all object keys are sanitized. Keys passed in
 * exceptions are not sanitized.
 */
function sanitizeObjKeys(obj) {
  var exceptions = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : [];

  var cleanKeys = function cleanKeys(obj) {
    if (!obj) {
      return null;
    } else if (Array.isArray(obj)) {
      return obj.map(cleanKeys);
    } else if ((typeof obj === 'undefined' ? 'undefined' : _typeof(obj)) === 'object') {
      var res = {};
      for (var key in obj) {
        if (!exceptions.includes(key)) {
          var saneKey = beautify(key);
          if (Object.prototype.hasOwnProperty.call(obj, key)) {
            res[saneKey] = cleanKeys(obj[key]);
          }
        } else {
          res[key] = cleanKeys(obj[key]);
        }
      }
      return res;
    } else {
      return obj;
    }
  };
  return cleanKeys(obj);
}

/**
 * Desanitizes keys in given object by replacing them with the keys stored in
 * the given mapping.
 */
function desanitizeObjKeys(obj) {
  var mapping = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

  var replaceKeys = function replaceKeys(obj) {
    if (Array.isArray(obj)) {
      return obj.map(replaceKeys);
    } else if ((typeof obj === 'undefined' ? 'undefined' : _typeof(obj)) === 'object') {
      var res = {};
      for (var key in obj) {
        if (key in mapping) {
          var rawKey = mapping[key];
          if (Object.prototype.hasOwnProperty.call(obj, key)) {
            res[rawKey] = replaceKeys(obj[key]);
          }
        } else {
          res[key] = replaceKeys(obj[key]);
        }
      }
      return res;
    } else {
      return obj;
    }
  };
  return replaceKeys(obj);
}

/**
 * Replaces the path parameter in the given path with values in the given args.
 * Furthermore adds the query parameters for a request.
 */
function instantiatePathAndGetQuery(path, parameters, args // NOTE: argument keys are sanitized!
) {
  var query = {};

  // case: nothing to do
  if (Array.isArray(parameters)) {
    // iterate parameters:
    var _iteratorNormalCompletion = true;
    var _didIteratorError = false;
    var _iteratorError = undefined;

    try {
      for (var _iterator = parameters[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
        var param = _step.value;

        var sanitizedParamName = beautify(param.name);

        // path parameters:
        if (param.in === 'path') {
          path = path.replace('{' + param.name + '}', args[sanitizedParamName]);
        }

        // query parameters:
        if (param.in === 'query' && sanitizedParamName && sanitizedParamName in args) {
          query[param.name] = args[sanitizedParamName];
        }
      }
    } catch (err) {
      _didIteratorError = true;
      _iteratorError = err;
    } finally {
      try {
        if (!_iteratorNormalCompletion && _iterator.return) {
          _iterator.return();
        }
      } finally {
        if (_didIteratorError) {
          throw _iteratorError;
        }
      }
    }
  }

  return { path: path, query: query };
}

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
    // if there are no properties:
    if (typeof schema.properties === 'undefined' || Object.keys(schema.properties).length === 0) {
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

/**
 * Determines an approximate name for the resource at the given path.
 */
function inferResourceNameFromPath(path) {
  var name = '';
  var parts = path.split('/');
  parts.forEach(function (part, i) {
    if (!/{|}/g.test(part)) {
      var partClean = sanitize(parts[i]);
      if (i === 0) {
        name += partClean;
      } else {
        name += partClean.charAt(0).toUpperCase() + partClean.slice(1);
      }
    }
  });

  return name;
}

/**
 * Returns JSON-compatible schema produced by the given endpoint - or null if it
 * does not exist.
 */
function getResSchema(endpoint, statusCode, oas) {
  if (_typeof(endpoint.responses) === 'object') {
    var responses = endpoint.responses;
    if (_typeof(responses[statusCode]) === 'object') {
      var response = responses[statusCode];

      // make sure we have a ResponseObject:
      if (typeof response.$ref === 'string') {
        response = resolveRef(response.$ref, oas);
      } else {
        response = response;
      }

      if (response.content && typeof response.content !== 'undefined') {
        var content = response.content;
        for (var contentType in content) {
          var mediaTypeObject = content[contentType];
          if (JSON_CONTENT_TYPES.includes(contentType) && _typeof(mediaTypeObject.schema) === 'object') {
            return mediaTypeObject.schema;
          }
        }
      }
    }
  }
  return null;
}

/**
 * Returns JSON-compatible schema required by the given endpoint - or null if it
 * does not exist.
 */
function getReqSchema(endpoint, oas) {
  if (_typeof(endpoint.requestBody) === 'object') {
    var requestBody = endpoint.requestBody;

    // make sure we have a RequestBodyObject:
    if (typeof requestBody.$ref === 'string') {
      requestBody = resolveRef(requestBody.$ref, oas);
    } else {
      requestBody = requestBody;
    }

    if (_typeof(requestBody.content) === 'object') {
      var content = requestBody.content;
      for (var contentType in content) {
        if (JSON_CONTENT_TYPES.includes(contentType) && _typeof(content[contentType].schema) === 'object') {
          return content[contentType].schema;
        }
      }
    }
  }
  return null;
}

/**
 * Returns the request schema (if any) for endpoint at given path and method, a
 * dictionary of names from different sources (if available), and whether the
 * request schema is required for the endpoint.
 */
function getReqSchemaAndNames(path, method, oas) {
  var endpoint = oas.paths[path][method];
  var reqRequired = false;
  var reqSchemaNames = {};
  var reqSchema = getReqSchema(endpoint, oas);

  if (reqSchema) {
    var requestBody = endpoint.requestBody;

    // determine if request body is required:
    if ((typeof requestBody === 'undefined' ? 'undefined' : _typeof(requestBody)) === 'object') {
      // resolve reference if needed:
      if (typeof requestBody.$ref === 'string') {
        requestBody = resolveRef(requestBody['$ref'], oas);
      }
      if (typeof requestBody.required === 'boolean') {
        reqRequired = requestBody.required;
      }
    }

    reqSchemaNames.fromPath = inferResourceNameFromPath(path);

    if ('$ref' in reqSchema) {
      reqSchemaNames.fromRef = reqSchema['$ref'].split('/').pop();
      reqSchema = resolveRef(reqSchema['$ref'], oas);
    }
    if ('title' in reqSchema) {
      reqSchemaNames.fromSchema = reqSchema.title;
    }

    return {
      reqSchema: reqSchema,
      reqSchemaNames: reqSchemaNames,
      reqRequired: reqRequired
    };
  }
  return {
    reqRequired: false
  };
}

/**
 * Returns the response schema for endpoint at given path and method and with
 * the given status code, and a dictionary of names from different sources (if
 * available).
 */
function getResSchemaAndNames(path, method, oas) {
  var endpoint = oas.paths[path][method];
  var resSchemaNames = {};
  var statusCode = getResStatusCode(path, method, oas);
  if (!statusCode) {
    return {};
  }
  var resSchema = getResSchema(endpoint, statusCode, oas);

  if (resSchema) {
    resSchemaNames.fromPath = inferResourceNameFromPath(path);

    if ('$ref' in resSchema) {
      resSchemaNames.fromRef = resSchema['$ref'].split('/').pop();
      resSchema = resolveRef(resSchema['$ref'], oas);
    }
    if ('title' in resSchema) {
      resSchemaNames.fromSchema = resSchema.title;
    }

    return {
      resSchema: resSchema,
      resSchemaNames: resSchemaNames
    };
  } else {
    return {};
  }
}

/**
 * Returns the success status code for the operation at the given path and
 * method (or null).
 */
function getResStatusCode(path, method, oas) {
  var endpoint = oas.paths[path][method];

  if (_typeof(endpoint.responses) === 'object') {
    var codes = Object.keys(endpoint.responses);
    var successCodes = codes.filter(function (code) {
      return SUCCESS_STATUS_RX.test(code);
    });
    if (successCodes.length === 1) {
      return successCodes[0];
    } else if (successCodes.length > 1) {
      log('Warning: operation ' + method.toUpperCase() + ' ' + path + ' has more than ' + ('one success status code (200 - 299) - use ' + successCodes[0]));
      return successCodes[0];
    }
  }
  return null;
}

/**
 * Returns an hash containing the links defined in the given endpoint.
 */
function getEndpointLinks(path, method, oas) {
  var links = {};
  var endpoint = oas.paths[path][method];
  var statusCode = getResStatusCode(path, method, oas);
  if (!statusCode) {
    return links;
  }
  if (_typeof(endpoint.responses) === 'object') {
    var responses = endpoint.responses;
    if (_typeof(responses[statusCode]) === 'object') {
      var response = responses[statusCode];

      if (typeof response.$ref === 'string') {
        response = resolveRef(response.$ref, oas);
      }

      // here, we can be ceratain we have a ResponseObject:
      response = response;

      if (_typeof(response.links) === 'object') {
        var epLinks = response.links;
        for (var linkKey in epLinks) {
          var link = epLinks[linkKey];

          // make sure we have LinkObjects:
          if (typeof link.$ref === 'string') {
            link = resolveRef(link['$ref'], oas);
          } else {
            link = link;
          }
          links[linkKey] = link;
        }
      }
    }
  }
  return links;
}

/**
 * Returns the list of parameters for the endpoint at the given method and path.
 * Resolves possible references.
 */
function getParameters(path, method, oas) {
  var parameters = [];

  if (!isOperation(method)) {
    log('Warning: attempted to get parameters for ' + method + ' ' + path + ', ' + 'which is not an operation.');
    return parameters;
  }

  var pathItemObject = oas.paths[path];

  var pathParams = pathItemObject.parameters;

  // first, consider parameters in Path Item Object:
  if (Array.isArray(pathParams)) {
    var pathItemParameters = pathParams.map(function (p) {
      if (typeof p.$ref === 'string') {
        // here we know we have a parameter object:
        return resolveRef(p['$ref'], oas);
      } else {
        // here we know we have a parameter object:
        return p;
      }
    });
    parameters = parameters.concat(pathItemParameters);
  }

  // second, consider parameters in Operation Object:
  var opObject = oas.paths[path][method];

  var opObjectParameters = opObject.parameters;

  if (Array.isArray(opObjectParameters)) {
    var opParameters = opObjectParameters.map(function (p) {
      if (typeof p.$ref === 'string') {
        // here we know we have a parameter object:
        return resolveRef(p['$ref'], oas);
      } else {
        // here we know we have a parameter object:
        return p;
      }
    });
    parameters = parameters.concat(opParameters);
  }

  return parameters;
}

/**
 * Returns an array of server objects for the opeartion at the given path and
 * method. Considers in the following order: global server definitions,
 * definitions at the path item, definitions at the operation, or the OAS
 * default.
 */
function getServers(path, method, oas) {
  var servers = [];
  // global server definitions:
  if (Array.isArray(oas.servers) && oas.servers.length > 0) {
    servers = oas.servers;
  }

  // path item server definitions override global:
  var pathItem = oas.paths[path];
  if (Array.isArray(pathItem.servers) && pathItem.servers.length > 0) {
    servers = pathItem.servers;
  }

  // operation server definitions override path item:
  var operationObj = pathItem[method];
  if (Array.isArray(operationObj.servers) && operationObj.servers.length > 0) {
    servers = operationObj.servers;
  }

  // default, in case there is no server:
  if (servers.length === 0) {
    var server = {
      url: '/' // TODO: avoid double-slashes
    };
    servers.push(server);
  }

  return servers;
}

/**
 * Returns a map of Security Scheme definitions, identified by keys. Resolves
 * possible references.
 */
function getSecuritySchemes(oas) {
  // collect all security schemes:
  var securitySchemes = {};
  if (_typeof(oas.components) === 'object' && _typeof(oas.components.securitySchemes) === 'object') {
    for (var schemeKey in oas.components.securitySchemes) {
      var obj = oas.components.securitySchemes[schemeKey];

      // ensure we have actual SecuritySchemeObject:
      if (typeof obj.$ref === 'string') {
        // result of resolution will be SecuritySchemeObject:
        securitySchemes[schemeKey] = resolveRef(obj.$ref, oas);
      } else {
        // we already have a SecuritySchemeObject:
        securitySchemes[schemeKey] = obj;
      }
    }
  }
  return securitySchemes;
}

/**
 * Returns the list of BEAUTIFIED keys of NON-OAUTH 2 security schemes
 * required by the operation at the given path and method.
 */
function getSecurityRequirements(path, method, securitySchemes, oas) {
  var results = [];

  // first, consider global requirements:
  var globalSecurity = oas.security;
  if (globalSecurity && typeof globalSecurity !== 'undefined') {
    var _iteratorNormalCompletion2 = true;
    var _didIteratorError2 = false;
    var _iteratorError2 = undefined;

    try {
      for (var _iterator2 = globalSecurity[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
        var secReq = _step2.value;

        for (var schemaKey in secReq) {
          if (securitySchemes[schemaKey] && _typeof(securitySchemes[schemaKey]) === 'object' && securitySchemes[schemaKey].type !== 'oauth2') {
            results.push(schemaKey);
          }
        }
      }
    } catch (err) {
      _didIteratorError2 = true;
      _iteratorError2 = err;
    } finally {
      try {
        if (!_iteratorNormalCompletion2 && _iterator2.return) {
          _iterator2.return();
        }
      } finally {
        if (_didIteratorError2) {
          throw _iteratorError2;
        }
      }
    }
  }

  // local:
  var operation = oas.paths[path][method];
  var localSecurity = operation.security;
  if (localSecurity && typeof localSecurity !== 'undefined') {
    var _iteratorNormalCompletion3 = true;
    var _didIteratorError3 = false;
    var _iteratorError3 = undefined;

    try {
      for (var _iterator3 = localSecurity[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
        var _secReq = _step3.value;

        for (var _schemaKey in _secReq) {
          if (securitySchemes[_schemaKey] && _typeof(securitySchemes[_schemaKey]) === 'object' && securitySchemes[_schemaKey].type !== 'oauth2') {
            if (!results.includes(_schemaKey)) {
              results.push(_schemaKey);
            }
          }
        }
      }
    } catch (err) {
      _didIteratorError3 = true;
      _iteratorError3 = err;
    } finally {
      try {
        if (!_iteratorNormalCompletion3 && _iterator3.return) {
          _iterator3.return();
        }
      } finally {
        if (_didIteratorError3) {
          throw _iteratorError3;
        }
      }
    }
  }
  return results;
}

/**
 * Beautifies the given string and stores the sanitized-to-original mapping in
 * the given mapping.
 */
function beautifyAndStore(str, mapping) {
  if (!((typeof mapping === 'undefined' ? 'undefined' : _typeof(mapping)) === 'object')) {
    throw new Error('No/invalid mapping passed to beautifyAndStore');
  }
  var clean = beautify(str);
  if (!clean) {
    throw new Error('Cannot beautifyAndStore ' + str);
  } else if (clean !== str) {
    if (clean in mapping && str !== mapping[clean]) {
      log('Warning: "' + str + '" and "' + mapping[clean] + '" both sanitize ' + ('to ' + clean + ' - collusion possible. Desanitize to ' + str + '.'));
    }
    mapping[clean] = str;
  }
  return clean;
}

/**
 * First sanitizes given string and then also camel-cases it.
 */
function beautify(str) {
  // only apply to strings:
  if (typeof str !== 'string') {
    throw new Error('Cannot beautify "' + str + '" of type "' + (typeof str === 'undefined' ? 'undefined' : _typeof(str)) + '"');
  }

  var charToRemove = '_';
  var sanitized = sanitize(str);
  while (sanitized.indexOf(charToRemove) !== -1) {
    var pos = sanitized.indexOf(charToRemove);
    if (sanitized.length >= pos + 2) {
      sanitized = sanitized.slice(0, pos) + sanitized.charAt(pos + 1).toUpperCase() + sanitized.slice(pos + 2, sanitized.length);
    } else if (sanitized.length === pos + 1) {
      sanitized = sanitized.slice(0, pos) + sanitized.charAt(pos + 1).toUpperCase();
    } else {
      sanitized = sanitized.slice(0, pos);
    }
  }

  // special case: we cannot start with number, and cannot be empty:
  if (/^[0-9]/.test(sanitized) || sanitized === '') {
    sanitized = '_' + sanitized;
  }

  // first character should be lowercase
  sanitized = sanitized.charAt(0).toLowerCase() + sanitized.slice(1, sanitized.length);

  return sanitized;
}

/**
 * Sanitizes the given string so that it can be used as the name for a GraphQL
 * Object Type.
 */
function sanitize(str) {
  var clean = str.replace(/[^_a-zA-Z0-9]/g, '_');
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
    str = str.substring(0, length) + '...';
  }

  return str;
}

/**
 * Determines if the given "method" is indeed an operation. Alternatively, the
 * method could point to other types of information (e.g., parameters, servers).
 */
function isOperation(method) {
  return OAS_OPERATIONS.includes(method.toLowerCase());
}

/**
 * Aggregates the subschemas in the allOf field into the mother schema
 * Please note that the allOfSchema may not necessarily be an element of the
 * mother schema. The purpose of this construction is to resolve nested allOf
 * schemas inside references.
 *
 * TODO: Tidy this up and return aggregated schema, rather than changing the OAS
 *
 * TODO: Output may not be a SchemaObject
 */
function resolveAllOf(schema, oas) {
  if ('allOf' in schema && _typeof(schema.allOf) === 'object') {
    // copy the original schema
    // let temp = Object.assign({}, schema)

    var temp = JSON.parse(JSON.stringify(schema));

    // remove the allOf property
    delete temp.allOf;
    // add the allOf properties and return
    return resolveAllOfRec(temp, schema.allOf, oas);
  } else {
    throw new Error('schema \'' + JSON.stringify(schema) + '\' does not contain an \'allOf\' property');
  }
}

function resolveAllOfRec(resolvedSchema, allOfSchema, oas) {
  var _loop = function _loop(allOfSchemaIndex) {
    var subschema = allOfSchema[allOfSchemaIndex];

    // resolve the reference if applicable
    if ('$ref' in subschema) {
      subschema = resolveRef(subschema.$ref, oas);
    }

    // iterate through all the subschema keys
    Object.keys(subschema).forEach(function (subschemaKey) {
      switch (subschemaKey) {
        case 'type':
          // TODO: strict?
          if (typeof resolvedSchema.type === 'string' && resolvedSchema.type !== subschema.type) {
            /**
             * if the schema is an object type but does not contain a properties
             * field, than we can overwrite the type because a schema with
             * an object tye and no properties field is equivalent to an empty
             * schema
             */
            if (resolvedSchema.type === 'object' && !('properties' in resolvedSchema)) {
              resolvedSchema.type = subschema.type;
            } else {
              throw new Error('allOf will overwrite a preexisting type ' + ('definition \'type: ' + resolvedSchema.type + '\' with \'type: ') + (subschema.type + '\' in schema \'' + JSON.stringify(resolvedSchema) + '\''));
            }
          } else {
            resolvedSchema.type = subschema.type;
          }
          break;

        case 'properties':
          // imply type object from properties field
          if (!(typeof resolvedSchema.type === 'string')) {
            resolvedSchema.type = 'object';
            // cannot replace an object type with a scalar or array type
          } else if (resolvedSchema.type !== 'object') {
            throw new Error('allOf will overwrite a preexisting type ' + ('definition \'type: ' + resolvedSchema.type + '\' with \'type: object\' in ') + ('schema \'' + JSON.stringify(resolvedSchema) + '\''));
          }

          var properties = subschema.properties;

          var propertyNames = Object.keys(properties);

          if (!('properties' in resolvedSchema)) {
            resolvedSchema.properties = {};
          }

          var _iteratorNormalCompletion4 = true;
          var _didIteratorError4 = false;
          var _iteratorError4 = undefined;

          try {
            for (var _iterator4 = propertyNames[Symbol.iterator](), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
              var propertyName = _step4.value;

              if (!(propertyName in resolvedSchema.properties)) {
                resolvedSchema.properties[propertyName] = properties[propertyName];

                // check if the preexisting schema is the same
              } else if (!(0, _deepEqual2.default)(resolvedSchema.properties[propertyName], subschema.properties[propertyName])) {
                throw new Error('allOf will overwrite a preexisting property ' + ('\'' + propertyName + ': ' + JSON.stringify(resolvedSchema.properties[propertyName]) + '\' ') + ('with \'' + propertyName + ': ' + JSON.stringify(subschema.properties[propertyName]) + '\' ') + ('in schema \'' + JSON.stringify(resolvedSchema)));
              }
            }
          } catch (err) {
            _didIteratorError4 = true;
            _iteratorError4 = err;
          } finally {
            try {
              if (!_iteratorNormalCompletion4 && _iterator4.return) {
                _iterator4.return();
              }
            } finally {
              if (_didIteratorError4) {
                throw _iteratorError4;
              }
            }
          }

          break;

        case 'items':
          // imply type array from items field
          if (!(typeof resolvedSchema.type === 'string')) {
            resolvedSchema.type = 'array';
            // cannot replace an array type with a scalar or object type
          } else if (resolvedSchema.type !== 'array') {
            throw new Error('allOf will overwrite a preexisting type definition' + ('\'type: ' + resolvedSchema.type + '\' with \'type: array\' in schema \'' + JSON.stringify(resolvedSchema) + '\''));
          }
          if (!('items' in resolvedSchema)) {
            resolvedSchema.items = {};
          }

          for (var itemIndex in subschema.items) {
            resolvedSchema.items = subschema.items[itemIndex];
          }
          break;

        case 'allOf':
          resolveAllOfRec(resolvedSchema, subschema.allOf, oas);
          break;

        default:
          log('allOf contains currently unsupported element\'' + subschemaKey + '\'');
      }
    });
  };

  for (var allOfSchemaIndex in allOfSchema) {
    _loop(allOfSchemaIndex);
  }
  return resolvedSchema;
}