'use strict';

// Type imports:

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

// Type definitions & exports:

// Imports:


exports.preprocessOas = preprocessOas;
exports.createOrReuseDataDef = createOrReuseDataDef;

var _oas_3_tools = require('./oas_3_tools.js');

var Oas3Tools = _interopRequireWildcard(_oas_3_tools);

var _deepEqual = require('deep-equal');

var _deepEqual2 = _interopRequireDefault(_deepEqual);

var _debug = require('debug');

var _debug2 = _interopRequireDefault(_debug);

var _utils = require('./utils.js');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

var log = (0, _debug2.default)('preprocessing');

/**
 * Extract information from the OAS and put it inside a data structure that
 * is easier for OASGraph to use
 */
function preprocessOas(oas, options) {
  var data = {
    usedOTNames: [],
    defs: [],
    operations: {},
    saneMap: {},
    security: {},
    options: options

    // Security schemas
  };data.security = getProcessedSecuritySchemes(oas, data);

  // Process all operations
  for (var path in oas.paths) {
    for (var method in oas.paths[path]) {
      //  Only consider Operation Objects
      if (!Oas3Tools.isOperation(method)) {
        continue;
      }

      var endpoint = oas.paths[path][method];

      // Determine description
      var description = endpoint.description;
      if ((typeof description !== 'string' || description === '') && typeof endpoint.summary === 'string') {
        description = endpoint.summary;
      }
      if (typeof description !== 'string') {
        description = 'No description available.';
      }

      // Hold on to the operationId
      var operationId = endpoint.operationId;

      // Fill in possibly missing operationId
      if (typeof operationId === 'undefined') {
        operationId = Oas3Tools.beautify(method + ':' + path);
      }

      // Request schema

      var _Oas3Tools$getReqSche = Oas3Tools.getReqSchemaAndNames(path, method, oas),
          reqSchema = _Oas3Tools$getReqSche.reqSchema,
          reqSchemaNames = _Oas3Tools$getReqSche.reqSchemaNames,
          reqRequired = _Oas3Tools$getReqSche.reqRequired;

      var reqDef = void 0;
      if (reqSchema && typeof reqSchema !== 'undefined') {
        reqDef = createOrReuseDataDef(reqSchema, reqSchemaNames, data);
      }

      // Response schema

      var _Oas3Tools$getResSche = Oas3Tools.getResSchemaAndNames(path, method, oas, data),
          resSchema = _Oas3Tools$getResSche.resSchema,
          resSchemaNames = _Oas3Tools$getResSche.resSchemaNames;

      if (!resSchema || (typeof resSchema === 'undefined' ? 'undefined' : _typeof(resSchema)) !== 'object') {
        (0, _utils.handleWarning)('Operation \'' + method.toUpperCase() + ' ' + path + '\' has no valid response ' + 'schema.', 'Will ignore operation.', data, log);
        continue;
      }

      var resDef = createOrReuseDataDef(resSchema, resSchemaNames, data);

      // Links
      var links = Oas3Tools.getEndpointLinks(path, method, oas, data);

      // Parameters
      var parameters = Oas3Tools.getParameters(path, method, oas);

      // Security protocols
      var securityRequirements = [];
      if (options.viewer) {
        securityRequirements = Oas3Tools.getSecurityRequirements(path, method, data.security, oas);
      }

      // servers
      var servers = Oas3Tools.getServers(path, method, oas);

      // Store determined information for operation
      var operation = {
        operationId: operationId,
        description: description,
        path: path,
        method: method.toLowerCase(),
        reqDef: reqDef,
        reqRequired: reqRequired,
        resDef: resDef,
        links: links,
        parameters: parameters,
        securityRequirements: securityRequirements,
        servers: servers
      };
      data.operations[operationId] = operation;
    }
  }

  /**
   * SubOperation option
   * Determine "links" based on sub-paths
   * (Only now, when operations have been defined)
   */
  if (data.options.addSubOperations) {
    for (var operationIndex in data.operations) {
      var _operation = data.operations[operationIndex];
      _operation.subOps = getSubOps(_operation, data.operations);
    }
  }

  return data;
}

/**
 * Extracts the security schemes from given OAS and organizes the information in
 * a data structure that is easier for OASGraph to use
 *
 * Here is the structure of the data:
 * {
 *   {String} [beautified name] { Contains information about the security protocol
 *     {String} rawName           Stores the raw security protocol name
 *     {Object} def               Definition provided by OAS
 *     {Object} parameters        Stores the names of the authentication credentials
 *                                  NOTE: Structure will depend on the type of the protocol
 *                                    (e.g. basic authentication, API key, etc.)
 *                                  NOTE: Mainly used for the AnyAuth viewers
 *     {Object} schema            Stores the GraphQL schema to create the viewers
 *   }
 * }
 *
 * Here is an example:
 * {
 *   MyApiKey: {
 *     rawName: "My_api_key",
 *     def: { ... },
 *     parameters: {
 *       apiKey: MyKeyApiKey
 *     },
 *     schema: { ... }
 *   }
 *   MyBasicAuth: {
 *     rawName: "My_basic_auth",
 *     def: { ... },
 *     parameters: {
 *       username: MyBasicAuthUsername,
 *       password: MyBasicAuthPassword,
 *     },
 *     schema: { ... }
 *   }
 * }
 */
function getProcessedSecuritySchemes(oas, data) {
  var result = {};
  var security = Oas3Tools.getSecuritySchemes(oas);

  // Loop through all the security protocols
  for (var key in security) {
    var protocol = security[key];

    // We use a separate mechanisms to handle OAuth 2.0:
    if (protocol.type === 'oauth2') {
      continue;
    }

    var schema = void 0;
    // Determine the parameters and the schema for the security protocol
    var parameters = {};
    switch (protocol.type) {
      case 'apiKey':
        parameters = {
          apiKey: Oas3Tools.beautify(key + '_apiKey')
        };
        schema = {
          type: 'object',
          description: 'API key credentials for the protocol \'' + key + '\'',
          properties: {
            apiKey: {
              type: 'string'
            }
          }
        };
        break;

      case 'http':
        switch (protocol.scheme) {
          // HTTP a number of authentication types (see
          // http://www.iana.org/assignments/http-authschemes/
          // http-authschemes.xhtml)
          case 'basic':
            parameters = {
              username: Oas3Tools.beautify(key + '_username'),
              password: Oas3Tools.beautify(key + '_password')
            };
            schema = {
              type: 'object',
              description: 'Basic auth credentials for protocol \'' + key + '\'',
              properties: {
                username: {
                  type: 'string'
                },
                password: {
                  type: 'string'
                }
              }
            };
            break;
          default:
            (0, _utils.handleWarning)('OASgraph currently does not support the HTTP authentication ' + ('scheme \'' + String(protocol.scheme) + '\'.'), 'Will ignore authentication scheme.', data, log);
        }
        break;

      // TODO: Implement
      case 'openIdConnect':
        break;

      default:
        (0, _utils.handleWarning)('OASgraph currently does not support the HTTP authentication ' + ('scheme \'' + String(protocol.scheme) + '\'.'), 'Will ignore authentication scheme.', data, log);
    }

    // Add protocol data to the output
    result[key] = {
      rawName: key,
      def: protocol,
      parameters: parameters,
      schema: schema
    };
  }
  return result;
}

/**
 * Method to either create a new or reuse an existing, centrally stored data
 * definition. Data definitions are objects that hold a schema (= JSON schema),
 * an otName (= String to use as the name for Object Types), and an iotName
 * (= String to use as the name for Input Object Types). Eventually, data
 * definitions also hold an ot (= the Object Type for the schema) and an iot
 * (= the Input Object Type for the schema).
 *
 * NOTE: The data definition will contain an ot GraphQLObjectType and/or an
 * iot GraphQLInputObjectType down the pipeline
 */
function createOrReuseDataDef(schema, names, data) {
  // Do a basic validation check
  if (!schema || typeof schema === 'undefined') {
    throw new Error('Cannot create data definition for invalid schema ' + ('"' + String(schema) + '"'));
  }

  // Determine the index of possible existing data definition
  var index = getSchemaIndex(schema, data.defs);
  if (index !== -1) {
    return data.defs[index];
  }

  // Else, define a new name, store the def, and return it
  var name = getSchemaName(names, data.usedOTNames);

  // Store and beautify the name
  var saneName = Oas3Tools.beautifyAndStore(name, data.saneMap);

  // Add the name to the master list
  data.usedOTNames.push(saneName);

  var def = {
    schema: schema,
    otName: saneName,
    iotName: saneName + 'Input'

    // Add the def to the master list
  };data.defs.push(def);

  return def;
}

/**
 * Returns the index of the data definition object in the given list that
 * contains the same schema as the given one. Returns -1 if that schema could
 * not be found.
 */
function getSchemaIndex(schema, dataDefs) {
  var index = -1;
  var _iteratorNormalCompletion = true;
  var _didIteratorError = false;
  var _iteratorError = undefined;

  try {
    for (var _iterator = dataDefs[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
      var def = _step.value;

      index++;
      if ((0, _deepEqual2.default)(schema, def.schema)) {
        return index;
      }
    }
    // If the schema could not be found in the master list
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

  return -1;
}

/**
 * Determines name to use for schema from previously determined schemaNames and
 * considering not reusing existing names.
 */
function getSchemaName(names, usedNames) {
  if (!names || typeof names === 'undefined') {
    throw new Error('Cannot create data definition without name(s).');
  }

  var schemaName = void 0;

  // CASE: name from reference
  if (typeof names.fromRef === 'string') {
    var saneName = Oas3Tools.beautify(names.fromRef);
    if (!usedNames.includes(saneName)) {
      schemaName = names.fromRef;
    }
  }

  // CASE: name from schema (i.e., "title" property in schema)
  if (!schemaName && typeof names.fromSchema === 'string') {
    var _saneName = Oas3Tools.beautify(names.fromSchema);
    if (!usedNames.includes(_saneName)) {
      schemaName = names.fromSchema;
    }
  }

  // CASE: name from path
  if (!schemaName && typeof names.fromPath === 'string') {
    var _saneName2 = Oas3Tools.beautify(names.fromPath);
    if (!usedNames.includes(_saneName2)) {
      schemaName = names.fromPath;
    }
  }

  // CASE: all names are already used - create approximate name
  if (!schemaName) {
    var tempName = Oas3Tools.beautify(typeof names.fromRef === 'string' ? names.fromRef : typeof names.fromSchema === 'string' ? names.fromSchema : typeof names.fromPath === 'string' ? names.fromPath : 'RandomName');
    var appendix = 2;

    /**
     * GraphQL Objects cannot share the name so if the name already exists in
     * the master list append an incremental number until the name does not
     * exist anymore.
     */
    while (usedNames.includes('' + tempName + appendix)) {
      appendix++;
    }
    schemaName = '' + tempName + appendix;
  }

  return schemaName;
}

/**
 * Returns an array of operations whose path contains the path of the given
 * operation. E.g., output could be an array with an operation having a path
 * '/users/{id}/profile' for a given operation with a path of '/users/{id}'.
 * Sub operations are only returned if the path of the given operation contains
 * at least one path parameter.
 */
function getSubOps(operation, operations) {
  var subOps = [];
  var hasPathParams = /\{.*\}/g.test(operation.path);
  if (!hasPathParams) return subOps;

  for (var operationIndex in operations) {
    var subOp = operations[operationIndex];
    if (subOp.method === 'get' && operation.method === 'get' && subOp.operationId !== operation.operationId && subOp.path.includes(operation.path)) {
      subOps.push(subOp);
    }
  }
  return subOps;
}