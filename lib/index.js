'use strict';

/**
 * Defines the functions exposed by OASGraph.
 *
 *  Some general notes:
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


var _graphql = require('graphql');

var _schema_builder = require('./schema_builder.js');

var _schema_builder2 = _interopRequireDefault(_schema_builder);

var _resolver_builder = require('./resolver_builder.js');

var _resolver_builder2 = _interopRequireDefault(_resolver_builder);

var _graphql_tools = require('./graphql_tools.js');

var _graphql_tools2 = _interopRequireDefault(_graphql_tools);

var _preprocessor = require('./preprocessor.js');

var _preprocessor2 = _interopRequireDefault(_preprocessor);

var _oas_3_tools = require('./oas_3_tools.js');

var _oas_3_tools2 = _interopRequireDefault(_oas_3_tools);

var _auth_builder = require('./auth_builder.js');

var _auth_builder2 = _interopRequireDefault(_auth_builder);

var _debug = require('debug');

var _debug2 = _interopRequireDefault(_debug);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var log = (0, _debug2.default)('translation');

/**
 * Creates a GraphQL interface from the given OpenAPI Specification (2 or 3).
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
    _oas_3_tools2.default.getValidOAS3(spec).then(function (oas) {
      translateOpenApiToGraphQL(oas, options).then(resolve).catch(reject);
    }).catch(reject);
  });
};

/**
 * Creates a GraphQL interface from the given OpenAPI Specification 3.0.x
 */
var translateOpenApiToGraphQL = function translateOpenApiToGraphQL(oas, _ref) {
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
    var data = _preprocessor2.default.preprocessOas(oas, options);

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
     * operation, so that built up GraphQL object types that are reused contain
     * these links
     *
     * This necessitates a second iteration, though, for the endpoints that DO
     * NOT have links.
     */
    for (var _operationId in data.operations) {
      var _operation = data.operations[_operationId];
      if (Object.keys(_operation.links).length > 0 || Array.isArray(_operation.subOps) && _operation.subOps.length > 0) {
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

    // ...and again for endpoints without links
    for (var _operationId2 in data.operations) {
      var _operation2 = data.operations[_operationId2];
      if (Object.keys(_operation2.links).length === 0 && (!Array.isArray(_operation2.subOps) || _operation2.subOps.length === 0)) {
        loadFields({
          operation: _operation2,
          operationId: _operationId2,
          rootQueryFields: rootQueryFields,
          rootMutationFields: rootMutationFields,
          viewerFields: viewerFields,
          viewerMutationFields: viewerMutationFields,
          data: data,
          oas: oas
        });
      }
    }

    var usedViewerNames = {}; // remember used viewer names
    var usedMutationViewerNames = {}; // remember used mutationViewer names

    // create and add viewer object types to the query and mutation object types
    // if applicable
    if (Object.keys(viewerFields).length > 0) {
      _auth_builder2.default.createAndLoadViewer(viewerFields, rootQueryFields, usedViewerNames, data, oas);
    }

    if (Object.keys(viewerMutationFields).length > 0) {
      _auth_builder2.default.createAndLoadViewer(viewerMutationFields, rootMutationFields, usedMutationViewerNames, data, oas, true);
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
      schemaDef.query = _graphql_tools2.default.getEmptyObjectType();
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
        _operation3.resDef.ot = _graphql_tools2.default.getEmptyObjectType();
      }
    }

    var schema = new _graphql.GraphQLSchema(schemaDef);

    resolve(schema);
  });
};

/**
 * Load the field object in the appropriate root object inside either
 * rootQueryFields/rootMutationFields or inside rootQueryFields/
 * rootMutationFields for further processing
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

          if (_typeof(viewerFields[securityRequirement]) !== 'object') {
            viewerFields[securityRequirement] = {};
          }
          // Avoid overwriting fields that return the same data:
          if (name in viewerFields[securityRequirement]) {
            name = _oas_3_tools2.default.beautifyAndStore(operationId, data.saneMap);
          }
          viewerFields[securityRequirement][name] = field;
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
      if (name in rootQueryFields) {
        name = _oas_3_tools2.default.beautifyAndStore(operationId, data.saneMap);
      }
      rootQueryFields[name] = field;
    }

    // CASE: mutation
  } else {
    // Use operationId to avoid problems differentiating operations with the
    // same path but differnet methods
    var saneName = _oas_3_tools2.default.beautifyAndStore(operationId, data.saneMap);

    if (isAuthenticated) {
      var _iteratorNormalCompletion2 = true;
      var _didIteratorError2 = false;
      var _iteratorError2 = undefined;

      try {
        for (var _iterator2 = operation.securityRequirements[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
          var _securityRequirement = _step2.value;

          if (_typeof(viewerMutationFields[_securityRequirement]) !== 'object') {
            viewerMutationFields[_securityRequirement] = {};
          }
          viewerMutationFields[_securityRequirement][saneName] = field;
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
      rootMutationFields[saneName] = field;
    }
  }
};

/**
 * Creates the field object for a given operation
 */
var getFieldForOperation = function getFieldForOperation(operation, data, oas) {
  // create OT if needed:
  var type = _schema_builder2.default.getGraphQLType({
    name: operation.resDef.otName,
    schema: operation.resDef.schema,
    data: data,
    operation: operation,
    oas: oas
  });

  // determine resolve function:
  var reqSchemaName = operation.reqDef ? operation.reqDef.iotName : null;
  var reqSchema = operation.reqDef ? operation.reqDef.schema : null;
  var resolve = _resolver_builder2.default.getResolver({
    operation: operation,
    oas: oas,
    payloadName: reqSchemaName,
    data: data
  });

  // determine args:
  var args = _schema_builder2.default.getArgs({
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
};

module.exports = {
  createGraphQlSchema: createGraphQlSchema
};