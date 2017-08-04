'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var Oas3Tools = require('./oas_3_tools.js');
var deepEqual = require('deep-equal');
var log = require('debug')('preprocessing');

/**
 * Extract information from the OAS and put it inside a data structure that
 * is easier for OASGraph to use
 *
 * Here is the data structure:
 * {
 *   {Object} operations {         Information on a per-operation level
 *     {String}  operationId       Contains the operation Id
 *     {String}  description       Contains the description
 *     {String}  path              Path of the operation
 *     {String}  method            REST verb of the operation
 *     {Object}  reqDef            Information about the request payload
 *                                   NOTE: An element from defs (see below)
 *     {Boolean} reqRequired       Request payload is required for the request
 *     {Object}  resDef            Information about the response payload
 *                                   NOTE: An element from defs (see below)
 *     {Hash}    links             Contains the links
 *     {Array}   parameters        Contains the parameters
 *     {Array}   securityProtocols Contains the security protocols
 *                                   NOTE: Does not contain OAuth 2.0
 *   }
 *   {Array}  defs [               Master list of all the defs
 *                                   NOTE: List will most likely grow even after preprocessing
 *                                   NOTE: Each def may be populated with an ot GraphQL Object Type
 *                                     and/or an iot GraphQL Input Object Type later in OASGraph
 *     {
 *       {Object} schema           JSON schema describing the structure of the payload
 *       {String} otName           Name to be used as a GraphQL Object Type
 *       {String} iotName          Name to be used as a GraphQL Input Object Type
 *     }
 *   ]
 *   {Array}  usedOTNames          List of all the used object names to avoid collision
 *   {Hash}   security             Contains all of the security schemas
 *                                   NOTE: Does not contain OAuth 2.0
 *   {Hash}   saneMap              Hash that relates beautified strings to their original forms
 *   {Object} options              Customizable features that the user can use to adjust OASGraph
 * }
 *
 * @param  {Object} oas     Raw OAS 3.0.x specification
 * @param  {Object} options Customizable options
 *
 * @return {Object}         See above
 */

var preprocessOas = function preprocessOas(oas, options) {
  var data = {
    usedOTNames: [],
    defs: [],
    operations: {},
    saneMap: {},
    security: {},
    options: options

    // Security schemas
  };data.security = getProcessedSecuritySchemes(oas, options);

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

      // Fill in possibly missing operationId
      if (typeof endpoint.operationId === 'undefined') {
        endpoint.operationId = Oas3Tools.beautify(method + ':' + path);
      }

      // Hold on to the operationId
      var operationId = endpoint.operationId;

      // Request schema

      var _Oas3Tools$getReqSche = Oas3Tools.getReqSchemaAndNames(path, method, oas),
          reqSchema = _Oas3Tools$getReqSche.reqSchema,
          reqSchemaNames = _Oas3Tools$getReqSche.reqSchemaNames,
          reqRequired = _Oas3Tools$getReqSche.reqRequired;

      var reqDef = createOrReuseDataDef(reqSchema, reqSchemaNames, data);

      // Response schema

      var _Oas3Tools$getResSche = Oas3Tools.getResSchemaAndNames(path, method, oas),
          resSchema = _Oas3Tools$getResSche.resSchema,
          resSchemaNames = _Oas3Tools$getResSche.resSchemaNames;

      if (!resSchema || (typeof resSchema === 'undefined' ? 'undefined' : _typeof(resSchema)) !== 'object') {
        log('Warning: "' + method.toUpperCase() + ' ' + path + '" has no valid ' + 'response schema. Ignore operation.');
        continue;
      }

      var resDef = createOrReuseDataDef(resSchema, resSchemaNames, data);

      // Links
      var links = Oas3Tools.getEndpointLinks(path, method, oas);

      // Parameters
      var parameters = Oas3Tools.getParameters(path, method, oas);

      // Security protocols
      var securityProtocols = [];
      if (options.viewer) {
        securityProtocols = Oas3Tools.getSecurityRequirements(path, method, data.security, oas);
      }

      // Store determined information for operation
      data.operations[operationId] = {
        operationId: operationId,
        description: description,
        path: path,
        method: method.toLowerCase(),
        reqDef: reqDef,
        reqRequired: reqRequired,
        resDef: resDef,
        links: links,
        parameters: parameters,
        securityProtocols: securityProtocols
      };
    }
  }

  /**
   * SubOperation option
   * Determine "links" based on sub-paths
   * (Only now, when every operation is guaranteed to have an operationId)
   */
  if (data.options.addSubOperations) {
    for (var operationIndex in data.operations) {
      var operation = data.operations[operationIndex];
      operation.subOps = getSubOps(operation, data.operations);
    }
  }

  return data;
};

/**
 * Method to either create a new or reuse an existing, centrally stored data
 * definition. Data definitions are objects that hold a schema (= JSON schema),
 * an otName (= String to use as the name for Object Types), and an iotName
 * (= String to use as the name for Input Object Types). Eventually, data
 * definitions also hold an ot (= the Object Type for the schema) and an iot
 * (= the Input Object Type for the schema).
 *
 * Here is the structure of the output:
 * {
 *   {Object} schema  JSON schema
 *   {String} otName  A potential name for a GraphQL Object Type with this JSON schema
 *   {String} iotName A potential name for a GraphQL Input Object Type with this JSON schema
 * }
 *
 * NOTE: The data definition will contain an ot GraphQL Object Type and/or an iot GraphQL
 * Input Object Type down the pipeline
 *
 * @param  {Object} schema JSON schema
 * @param  {Object} names  A list of potential base names for the otName and iotName
 * @param  {Object} data   Result of preprocessing
 *
 * @return {Object}
 */
var createOrReuseDataDef = function createOrReuseDataDef(schema, names, data) {
  // Do a basic validation check
  if (typeof schema === 'undefined') {
    return null;
  }

  // Determine the index of possible existing data definition
  var index = getSchemaIndex(schema, data.defs);
  if (index !== -1) {
    return data.defs[index];
  }

  // Else, define a new name, store the def, and return it
  var name = getSchemaName(names, data);

  var def = {
    schema: schema,
    otName: name,
    iotName: name + 'Input'

    // Add the def to the master list
  };data.defs.push(def);

  return def;
};

/**
 * Determines the index of the data definition object that contains the same
 * schema as the given one
 *
 * @param  {Object} schema   JSON schema
 * @param  {Array}  dataDefs List of data definition objects
 *                             NOTE: Usually refers to data.defs, the master list of defs
 *
 * @return {Number}          Index of the data definition object or -1
 */
var getSchemaIndex = function getSchemaIndex(schema, dataDefs) {
  for (var defIndex in dataDefs) {
    if (deepEqual(schema, dataDefs[defIndex].schema)) {
      return defIndex;
    }
  }
  // If the schema could not be found in the master list
  return -1;
};

/**
 * Determines name to use for schema from previously determined schemaNames
 *
 * @param  {Object} names Contains fromRef, fromSchema, fromPath
 * @param  {Object} data  Result of preprocessing
 *
 * @return {String}       Determined name for the schema
 */
var getSchemaName = function getSchemaName(names, data) {
  if (typeof names === 'undefined') {
    throw new Error('Cannot create data definition without name(s).');
  }

  var schemaName = void 0;

  // CASE: name from reference
  if (typeof names.fromRef === 'string') {
    var _saneName = Oas3Tools.beautify(names.fromRef);
    if (!data.usedOTNames.includes(_saneName)) {
      schemaName = names.fromRef;
    }
  }

  // CASE: name from schema (i.e., "title" property in schema)
  if (!schemaName && typeof names.fromSchema === 'string') {
    var _saneName2 = Oas3Tools.beautify(names.fromSchema);
    if (!data.usedOTNames.includes(_saneName2)) {
      schemaName = names.fromSchema;
    }
  }

  // CASE: name from path
  if (!schemaName && typeof names.fromPath === 'string') {
    var _saneName3 = Oas3Tools.beautify(names.fromPath);
    if (!data.usedOTNames.includes(_saneName3)) {
      schemaName = names.fromPath;
    }
  }

  // CASE: create approximate name
  if (!schemaName) {
    var tempName = Oas3Tools.beautify(typeof names.fromRef === 'string' ? names.fromRef : typeof names.fromSchema === 'string' ? names.fromSchema : names.fromPath);
    var appendix = 2;

    /**
     * GraphQL Objects cannot share the name so if the name already exists in the master list
     * append an incremental number until the name does not exist anymore
     */
    while (data.usedOTNames.includes('' + tempName + appendix)) {
      appendix++;
    }
    schemaName = '' + tempName + appendix;
  }

  // Store and beautify the name
  var saneName = Oas3Tools.beautifyAndStore(schemaName, data.saneMap);

  // Add the name to the master list
  data.usedOTNames.push(saneName);

  return saneName;
};

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
 *
 * @param  {Object} oas Raw OpenAPI Specification 3.0.x
 *
 * @return {Object}     Extracted security definitions (see above)
 */
var getProcessedSecuritySchemes = function getProcessedSecuritySchemes(oas, options) {
  var security = Oas3Tools.getSecuritySchemes(oas);

  // Loop through all the security protocols
  for (var protocolKey in security) {
    var protocol = security[protocolKey];

    // OASGraph uses separate mechanisms to handle OAuth 2.0 (see the tokenJSONpath option)
    if (protocol.type === 'oauth2') {
      continue;
    }

    var schema = void 0;
    // Determine the parameters and the schema for the security protocol
    var parameters = {};
    switch (protocol.type) {
      case 'apiKey':
        parameters = {
          apiKey: Oas3Tools.beautify(protocolKey + '_apiKey')
        };
        schema = {
          type: 'object',
          description: 'API key credentials for the protocol \'' + protocolKey + '\'',
          properties: {
            apiKey: {
              type: 'string'
            }
          }
        };
        break;

      case 'http':
        switch (protocol.scheme) {
          // HTTP a number of authentication types (see http://www.iana.org/assignments/http-authschemes/http-authschemes.xhtml)
          case 'basic':
            parameters = {
              username: Oas3Tools.beautify(protocolKey + '_username'),
              password: Oas3Tools.beautify(protocolKey + '_password')
            };
            schema = {
              type: 'object',
              description: 'Basic auth credentials for the protocol \'' + protocolKey + '\'',
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
            if (options.strict) {
              throw new Error('OASgraph currently does not support the HTTP authentication scheme \'' + protocol.scheme + '\'');
            }
            log('OASgraph currently does not support the HTTP authentication scheme \'' + protocol.scheme + '\'');
        }
        break;

      // TODO: Implement
      case 'openIdConnect':
        break;

      default:
        if (options.strict) {
          throw new Error('OASgraph currently does not support the HTTP authentication scheme \'' + protocol.scheme + '\'');
        }
        log('OASgraph currently does not support the HTTP authentication scheme \'' + protocol.scheme + '\'');
    }

    // Add protocol data to the output
    security[Oas3Tools.beautify(protocolKey)] = {
      rawName: protocolKey,
      def: protocol,
      parameters: parameters,
      schema: schema
    };
  }
  return security;
};

/**
 * Returns an array of operations whose path contains the path of the given
 * operation. E.g., output could be an array with an operation having a path
 * '/users/{id}/profile' for a given operation with a path of '/users/{id}'.
 * Sub operations are only returned if the path of the given operation contains
 * at least one path parameter.
 *
 * @param  {Object} operation  Operation object created by preprocessing
 * @param  {Array} operations  List of operation objects
 *
 * @return {Array}             List of operation objects
 */
var getSubOps = function getSubOps(operation, operations) {
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
};

module.exports = {
  preprocessOas: preprocessOas,
  createOrReuseDataDef: createOrReuseDataDef
};