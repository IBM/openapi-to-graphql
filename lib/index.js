'use strict';

/**
 * Defines the functions exposed by OASGraph.
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
 */

// Type imports:

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

// Imports:


// Type definitions & exports:


var _schema_builder = require('./schema_builder.js');

var _resolver_builder = require('./resolver_builder.js');

var _graphql_tools = require('./graphql_tools.js');

var GraphQLTools = _interopRequireWildcard(_graphql_tools);

var _preprocessor = require('./preprocessor.js');

var _oas_3_tools = require('./oas_3_tools.js');

var Oas3Tools = _interopRequireWildcard(_oas_3_tools);

var _auth_builder = require('./auth_builder.js');

var _auth_builder2 = _interopRequireDefault(_auth_builder);

var _debug = require('debug');

var _debug2 = _interopRequireDefault(_debug);

var _graphql = require('graphql');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

var log = (0, _debug2.default)('translation');

/**
 * Creates a GraphQL interface from the given OpenAPI Specification (2 or 3).
 */
function createGraphQlSchema(spec, options) {
  // deal with defaults:
  if (typeof options === 'undefined') options = {};
  options.strict = options.strict || true;
  options.addSubOperations = options.addSubOperations || true;
  options.viewer = options.viewer || true;
  options.sendOAuthTokenInQuery = options.sendOAuthTokenInQuery || false;

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
}

/**
 * Creates a GraphQL interface from the given OpenAPI Specification 3.0.x
 */
function translateOpenApiToGraphQL(oas, _ref) {
  var strict = _ref.strict,
      headers = _ref.headers,
      qs = _ref.qs,
      viewer = _ref.viewer,
      tokenJSONpath = _ref.tokenJSONpath,
      addSubOperations = _ref.addSubOperations,
      sendOAuthTokenInQuery = _ref.sendOAuthTokenInQuery;

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
    var data = (0, _preprocessor.preprocessOas)(oas, options);

    // holds unauthenticated query fields
    var queryFields = {};

    // holds unauthenticated mutation fields
    var mutationFields = {};

    // holds authenticated query fields
    var authQueryFields = {};

    // holds authenticated mutation fields
    var authMutationFields = {};

    /**
     * Translate every endpoint to GraphQL schemes.
     *
     * Do this first for endpoints that DO contain links OR that DO contain sub
     * operation, so that built up GraphQL object types that are reused contain
     * these links
     *
     * This necessitates a second iteration, though, for the endpoints that DO
     * NOT have links.
     */
    for (var _operationId in data.operations) {
      var _operation = data.operations[_operationId];
      if (Object.keys(_operation.links).length > 0 || Array.isArray(_operation.subOps) && _operation.subOps.length > 0) {
        loadField({
          operation: _operation,
          operationId: _operationId,
          queryFields: queryFields,
          mutationFields: mutationFields,
          authQueryFields: authQueryFields,
          authMutationFields: authMutationFields,
          data: data,
          oas: oas
        });
      }
    }

    // ...and again for endpoints without links
    for (var _operationId2 in data.operations) {
      var _operation2 = data.operations[_operationId2];
      if (Object.keys(_operation2.links).length === 0 && (!Array.isArray(_operation2.subOps) || _operation2.subOps.length === 0)) {
        loadField({
          operation: _operation2,
          operationId: _operationId2,
          queryFields: queryFields,
          mutationFields: mutationFields,
          authQueryFields: authQueryFields,
          authMutationFields: authMutationFields,
          data: data,
          oas: oas
        });
      }
    }

    // create and add viewer object types to the query and mutation object types
    // if applicable
    var rootQueryFields = Object.assign({}, queryFields);
    var queryViewers = {};
    if (Object.keys(authQueryFields).length > 0) {
      queryViewers = _auth_builder2.default.createAndLoadViewer(authQueryFields, data, oas, false);
    }
    Object.assign(rootQueryFields, queryViewers);

    var rootMutationFields = Object.assign({}, mutationFields);
    if (Object.keys(authMutationFields).length > 0) {
      var mutationViewers = _auth_builder2.default.createAndLoadViewer(authMutationFields, data, oas, true);
      Object.assign(rootMutationFields, mutationViewers);
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
      var _operation3 = data.operations[i];
      if (typeof _operation3.resDef.ot === 'undefined') {
        _operation3.resDef.ot = GraphQLTools.getEmptyObjectType();
      }
    }

    var schema = new _graphql.GraphQLSchema(schemaDef);

    resolve(schema);
  });
}

/**
 * Generates a field for the given operation and stores it in the given field
 * objects (depending on whether the operation is a mutation, and on its
 * authentication requirements).
 */
function loadField(_ref2) {
  var operation = _ref2.operation,
      operationId = _ref2.operationId,
      queryFields = _ref2.queryFields,
      mutationFields = _ref2.mutationFields,
      authQueryFields = _ref2.authQueryFields,
      authMutationFields = _ref2.authMutationFields,
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
  var isAuthenticated = operation.securityRequirements.length > 0 && data.options.viewer !== false;

  // CASE: query
  if (operation.method.toLowerCase() === 'get') {
    // Use name of the response data schema as field name:
    var name = operation.resDef.otName;

    if (isAuthenticated) {
      var _iteratorNormalCompletion = true;
      var _didIteratorError = false;
      var _iteratorError = undefined;

      try {
        for (var _iterator = operation.securityRequirements[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
          var securityRequirement = _step.value;

          if (_typeof(authQueryFields[securityRequirement]) !== 'object') {
            authQueryFields[securityRequirement] = {};
          }
          // Avoid overwriting fields that return the same data:
          if (name in authQueryFields[securityRequirement]) {
            name = Oas3Tools.beautifyAndStore(operationId, data.saneMap);
          }
          authQueryFields[securityRequirement][name] = field;
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
    } else {
      // Avoid overwriting fields that return the same data:
      if (name in queryFields) {
        name = Oas3Tools.beautifyAndStore(operationId, data.saneMap);
      }
      queryFields[name] = field;
    }

    // CASE: mutation
  } else {
    // Use operationId to avoid problems differentiating operations with the
    // same path but differnet methods
    var saneName = Oas3Tools.beautifyAndStore(operationId, data.saneMap);

    if (isAuthenticated) {
      var _iteratorNormalCompletion2 = true;
      var _didIteratorError2 = false;
      var _iteratorError2 = undefined;

      try {
        for (var _iterator2 = operation.securityRequirements[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
          var _securityRequirement = _step2.value;

          if (_typeof(authMutationFields[_securityRequirement]) !== 'object') {
            authMutationFields[_securityRequirement] = {};
          }
          authMutationFields[_securityRequirement][saneName] = field;
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
    } else {
      mutationFields[saneName] = field;
    }
  }
}

/**
 * Creates the field object for the given operation.
 */
function getFieldForOperation(operation, data, oas) {
  // create OT returned by operation:
  var type = (0, _schema_builder.getGraphQLType)({
    name: operation.resDef.otName,
    schema: operation.resDef.schema,
    data: data,
    operation: operation,
    oas: oas
  });

  // craete resolve function:
  var reqSchemaName = operation.reqDef ? operation.reqDef.iotName : null;
  var reqSchema = operation.reqDef ? operation.reqDef.schema : null;
  var resolve = (0, _resolver_builder.getResolver)({
    operation: operation,
    oas: oas,
    payloadName: reqSchemaName,
    data: data
  });

  // create args:
  var args = (0, _schema_builder.getArgs)({
    parameters: operation.parameters,
    reqSchemaName: reqSchemaName,
    reqSchema: reqSchema,
    operation: operation,
    data: data,
    oas: oas
  });

  return {
    type: type,
    resolve: resolve,
    args: args,
    description: operation.description
  };
}

module.exports = {
  createGraphQlSchema: createGraphQlSchema
};