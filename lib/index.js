'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _graphql = require('graphql');

var SchemaBuilder = require('./schema_builder.js');
var ResolverBuilder = require('./resolver_builder.js');
var GraphQLTools = require('./graphql_tools.js');
var Preprocessor = require('./preprocessor.js');
var Oas3Tools = require('./oas_3_tools.js');
var AuthBuilder = require('./auth_builder.js');
var log = require('debug')('translation');

// Increase stack trace logging for better debugging:
Error.stackTraceLimit = Infinity;

/**
 * Creates a GraphQL interface from the given OpenAPI Specification.
 *
 * Some general notes:
 *
 * - GraphQL interfaces rely on sanitized strings for (Input) Object Type names
 *   and fields. We perform sanitization only when assigning (field-) names, but
 *   keep keys in the OAS otherwise as-is, to ensure that inner-OAS references
 *   work as expected.
 *
 * - GraphQL (Input) Object Types must have a unique name. Thus, sometimes Input
 *   Object Types and Object Types need separate names, despite them having the
 *   same structure. We thus append 'Input' to every Input Object Type's name
 *   as a convention.
 *
 * - To pass data between resolve functions, OASGraph uses a _oasgraph object
 *   returned by every resolver in addition to its original data (OASGraph does
 *   not use the context to do so, which is an anti-pattern according to=
 *   https://github.com/graphql/graphql-js/issues/953).
 *
 * - OasGraph can handle basic authentication and api key-based authentication
 *   through GraphQL. To do this, OASGraph creates two new intermediate Object
 *   Types called QueryViewer and MutationViewer that take as input security
 *   credentials and pass them on using the _oasgraph object to other resolve
 *   functions.
 *
 */
var createGraphQlSchema = function createGraphQlSchema(spec) {
  var options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {
    // some default values:
    strict: true,
    addSubOperations: true,
    viewer: true,
    sendOAuthTokenInQuery: false
  };

  return new Promise(function (resolve, reject) {
    // Some basic validation
    if ((typeof spec === 'undefined' ? 'undefined' : _typeof(spec)) !== 'object') {
      throw new Error('Invalid specification provided');
    }

    /**
     * Check if the spec is a valid OAS 3.0.x
     * If the spec is OAS 2.0, attempt to translate it into 3.0.x, then try to
     * translate the spec into a GraphQL schema
     */
    Oas3Tools.getValidOAS3(spec).then(function (oas) {
      translateOpenApiToGraphQL(oas, options).then(resolve).catch(reject);
    }).catch(reject);
  });
};

/**
 * Creates a GraphQL interface from the given OpenAPI Specification 3.0.x
 *
 * Here is a list of the options we have currently implemented:
 * {
 *  {Boolean} strict           Adhere to the OAS as closely as possible
 *  {Object}  headers          Additional headers sent with every request while resolving queries
 *  {Object}  qs               Additional query parameters sent with every request while resolving queries
 *  {Boolean} viewer           Do not create authentication viewers. Intended to be used with the headers option
 *                              (i.e. if you provide all your authentication data in the headers options, you do not
 *                              have to authenticate through the authentication viewers)
 *  {String}  tokenJSONpath    Path to the OAuth 2.0 token. Because of technical reasons, wevcan create an OAuth 2.0
 *                              authentication viewer. Hence, the only way for OASGraph to bypass OAuth 2.0 is when the
 *                              outer application provides it
 *  {Boolean} addSubOperations Combine queries with similar paths and inputs
 * }
 *
 * @param  {Object} oas      OpenAPI Specification 3.0
 * @param  {Options} options A few different options that we have implemented to
 *                           allow users to customize how they would like use our tool
 *
 * @return {Promise}        Resolves on GraphQLSchema, rejects on error during schema creation
 */
var translateOpenApiToGraphQL = function translateOpenApiToGraphQL(oas, _ref) {
  var _ref$strict = _ref.strict,
      strict = _ref$strict === undefined ? false : _ref$strict,
      headers = _ref.headers,
      qs = _ref.qs,
      _ref$viewer = _ref.viewer,
      viewer = _ref$viewer === undefined ? true : _ref$viewer,
      tokenJSONpath = _ref.tokenJSONpath,
      _ref$addSubOperations = _ref.addSubOperations,
      addSubOperations = _ref$addSubOperations === undefined ? false : _ref$addSubOperations,
      _ref$sendOAuthTokenIn = _ref.sendOAuthTokenInQuery,
      sendOAuthTokenInQuery = _ref$sendOAuthTokenIn === undefined ? false : _ref$sendOAuthTokenIn;

  return new Promise(function (resolve, reject) {
    var options = {
      headers: headers,
      qs: qs,
      viewer: viewer,
      tokenJSONpath: tokenJSONpath,
      strict: strict,
      addSubOperations: addSubOperations,
      sendOAuthTokenInQuery: sendOAuthTokenInQuery
    };
    log('Options: ' + JSON.stringify(options));

    /**
     * Extract information from the OAS and put it inside a data structure that
     * is easier for OASGraph to use
     */
    var data = Preprocessor.preprocessOas(oas, options);

    /**
     * Holds on to the highest-level (entry-level) object types for queries that
     * are accessible in the schema to build
     */
    var rootQueryFields = {};

    /**
     * Holds on to the highest-level (entry-level) object types for mutations
     * that are accessible in the schema to build
     */
    var rootMutationFields = {};

    // Intermediate field used to input authentication credentials for queries
    var viewerFields = {};

    // Intermediate field used to input authentication credentials for mutations
    var viewerMutationFields = {};

    /**
     * Translate every endpoint to GraphQL schemes.
     *
     * Do this first for endpoints that DO contain links OR that DO contain sub
     * operation, so that built up GraphQL object types that are reused contain these links
     *
     * This necessitates a second iteration, though, for the endpoints that DO NOT have links.
     */
    for (var operationId in data.operations) {
      var operation = data.operations[operationId];
      if (Object.keys(operation.links).length > 0 || Array.isArray(operation.subOps) && operation.subOps.length > 0) {
        loadFields({
          operation: operation,
          operationId: operationId,
          rootQueryFields: rootQueryFields,
          rootMutationFields: rootMutationFields,
          viewerFields: viewerFields,
          viewerMutationFields: viewerMutationFields,
          data: data,
          oas: oas
        });
      }
    }

    // ...and again for endpoints without links
    for (var _operationId in data.operations) {
      var _operation = data.operations[_operationId];
      if (Object.keys(_operation.links).length === 0 && (!Array.isArray(_operation.subOps) || _operation.subOps.length === 0)) {
        loadFields({
          operation: _operation,
          operationId: _operationId,
          rootQueryFields: rootQueryFields,
          rootMutationFields: rootMutationFields,
          viewerFields: viewerFields,
          viewerMutationFields: viewerMutationFields,
          data: data,
          oas: oas
        });
      }
    }

    var usedViewerNames = {}; // keep track of viewer names we already used
    var usedMutationViewerNames = {}; // keep track of mutationViewer names we already used

    // create and add viewer object types to the query and mutation object types if applicable
    if (Object.keys(viewerFields).length > 0) {
      AuthBuilder.createAndLoadViewer(viewerFields, rootQueryFields, usedViewerNames, data, oas);
    }

    if (Object.keys(viewerMutationFields).length > 0) {
      AuthBuilder.createAndLoadViewer(viewerMutationFields, rootMutationFields, usedMutationViewerNames, data, oas, true);
    }

    // build up the schema:
    var schemaDef = {};
    if (Object.keys(rootQueryFields).length > 0) {
      schemaDef.query = new _graphql.GraphQLObjectType({
        name: 'RootQueryType',
        description: 'The start of any query',
        fields: rootQueryFields
      });
    } else {
      schemaDef.query = GraphQLTools.getEmptyObjectType();
    }
    if (Object.keys(rootMutationFields).length > 0) {
      schemaDef.mutation = new _graphql.GraphQLObjectType({
        name: 'RootMutationType',
        description: 'The start of any mutation',
        fields: rootMutationFields
      });
    }

    // fill in yet undefined Object Types to avoid GraphQLSchema from breaking:
    for (var i in data.operations) {
      var _operation2 = data.operations[i];
      if (typeof _operation2.resDef.ot === 'undefined') {
        _operation2.resDef.ot = GraphQLTools.getEmptyObjectType();
      }
    }

    var schema = new _graphql.GraphQLSchema(schemaDef);

    resolve(schema);
  });
};

/**
 * Load the field object in the appropriate root object inside either
 * rootQueryFields/rootMutationFields or inside rootQueryFields/rootMutationFields
 * for further processing
 *
 * @param  {object} operation            Operation as produced by preprocessing
 * @param  {string} operationId          Name used to identify a particular operation
 * @param  {object} rootQueryFields      Object that contains the definition all
 *                                        query objects type
 * @param  {object} rootMutationFields   Object that contains the definition all
 *                                        mutation objects type
 * @param  {object} viewerFields         Object that contains the definition of all
 *                                        authenticated query object types
 * @param  {object} viewerMutationFields Object that contains the definition of
 *                                        all authenticated mutation object types
 * @param  {object} data                 Data produced by preprocessing
 * @param  {object} oas                  Raw OpenAPI Specification 3.0
 */
var loadFields = function loadFields(_ref2) {
  var operation = _ref2.operation,
      operationId = _ref2.operationId,
      rootQueryFields = _ref2.rootQueryFields,
      rootMutationFields = _ref2.rootMutationFields,
      viewerFields = _ref2.viewerFields,
      viewerMutationFields = _ref2.viewerMutationFields,
      data = _ref2.data,
      oas = _ref2.oas;

  // Get the fields for an operation
  var field = getFieldForOperation(operation, data, oas);

  // If the operation has no valid type, abort
  if (!field.type || typeof field.type === 'undefined') {
    log('Warning: skipped operation "' + operation.method.toUpperCase() + ' ' + (operation.path + '" without defined Object Type.'));
    return;
  }

  // Determine if the operation is authenticated
  var isAuthenticated = Object.keys(operation.securityProtocols).length > 0 && data.options.viewer !== false;

  // CASE: query
  if (operation.method.toLowerCase() === 'get') {
    // Use name of the response data schema as field name:
    var name = operation.resDef.otName;

    if (isAuthenticated) {
      for (var protocolIndex in operation.securityProtocols) {
        for (var protocolName in operation.securityProtocols[protocolIndex]) {
          if (_typeof(viewerFields[protocolName]) !== 'object') {
            viewerFields[protocolName] = {};
          }
          // Avoid overwriting fields that return the same data:
          if (name in viewerFields[protocolName]) {
            name = Oas3Tools.beautifyAndStore(operationId, data.saneMap);
          }
          viewerFields[protocolName][name] = field;
        }
      }
    } else {
      // Avoid overwriting fields that return the same data:
      if (name in rootQueryFields) {
        name = Oas3Tools.beautifyAndStore(operationId, data.saneMap);
      }
      rootQueryFields[name] = field;
    }

    // CASE: mutation
  } else {
    // Use operationId to avoid problems differentiating operations with the same path but differnet methods
    var saneName = Oas3Tools.beautifyAndStore(operationId, data.saneMap);

    if (isAuthenticated) {
      for (var _protocolIndex in operation.securityProtocols) {
        for (var _protocolName in operation.securityProtocols[_protocolIndex]) {
          if (_typeof(viewerMutationFields[_protocolName]) !== 'object') {
            viewerMutationFields[_protocolName] = {};
          }
          viewerMutationFields[_protocolName][saneName] = field;
        }
      }
    } else {
      rootMutationFields[saneName] = field;
    }
  }
};

/**
 * Creates the field object for a given operation
 *
 * @param  {object} operation Operation as produced by preprocessing
 * @param  {object} data      Data produced by preprocessing
 * @param  {object} oas       OpenAPI Specification 3.0
 *
 * @return {object}           Field object
 */
var getFieldForOperation = function getFieldForOperation(operation, data, oas) {
  // create OT if needed:
  var type = SchemaBuilder.getGraphQLType({
    name: operation.resDef.otName,
    schema: operation.resDef.schema,
    data: data,
    operation: operation,
    links: operation.links,
    oas: oas
  });

  // determine resolve function:
  var reqSchemaName = operation.reqDef ? operation.reqDef.iotName : null;
  var reqSchema = operation.reqDef ? operation.reqDef.schema : null;
  var resolve = ResolverBuilder.getResolver({
    operation: operation,
    oas: oas,
    payloadName: reqSchemaName,
    data: data
  });

  // determine args:
  var args = SchemaBuilder.getArgs({
    parameters: operation.parameters,
    reqSchemaName: reqSchemaName,
    reqSchema: reqSchema,
    oas: oas,
    data: data,
    reqRequired: operation.reqRequired
  });

  return {
    type: type,
    resolve: resolve,
    args: args,
    description: operation.description
  };
};

module.exports = {
  createGraphQlSchema: createGraphQlSchema
};