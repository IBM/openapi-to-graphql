'use strict';

/**
 * Functions to create viewers that allow users to pass credentials to resolve
 * functions used by OASGraph.
 */

// Type imports:

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

// Imports:


var _schema_builder = require('./schema_builder.js');

var _oas_3_tools = require('./oas_3_tools.js');

var Oas3Tools = _interopRequireWildcard(_oas_3_tools);

var _debug = require('debug');

var _debug2 = _interopRequireDefault(_debug);

var _graphql = require('graphql');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

// Type definitions & exports:
var log = (0, _debug2.default)('translation');

/**
 * Load the field object in the appropriate root object
 *
 * i.e. inside either rootQueryFields/rootMutationFields or inside
 * rootQueryFields/rootMutationFields for further processing
 */
var createAndLoadViewer = function createAndLoadViewer(queryFields, data, oas) {
  var isMutation = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : false;

  var results = {};
  /**
   * Object that contains all previously defined viewer object names.
   * The key is the security scheme type (apiKey or BasicAuth) and the value is
   * a list of the names for the viewers for that security scheme type.
   */
  var usedViewerNames = {};

  /**
   * Used to collect all fields in the given querFields object, no matter which
   * protocol. Used to populate anyAuthViewer.
   */
  var anyAuthFields = {};

  for (var protocolName in queryFields) {
    Object.assign(anyAuthFields, queryFields[protocolName]);

    /**
     * check if the name has already been used (i.e. in the list)
     * if so, create a new name and add it to the list
     */
    var _type = data.security[protocolName].def.type;

    /**
     * HTTP is not an authentication protocol
     * HTTP covers a number of different authentication type
     * change the typeName to match the exact authentication type (e.g. basic
     * authentication)
     */
    if (_type === 'http') {
      var scheme = data.security[protocolName].def.scheme;
      switch (scheme) {
        case 'basic':
          _type = 'basicAuth';
          break;

        default:
          if (data.options.strict) {
            throw new Error('Unsupported scheme ' + String(scheme) + ' for HTTP ' + 'authentication');
          }
          log('Unsupported scheme ' + String(scheme) + ' for HTTP authentication');
      }
    }

    // create name for the viewer
    var viewerName = void 0;

    if (!isMutation) {
      viewerName = Oas3Tools.beautify('viewer ' + _type);
    } else {
      viewerName = Oas3Tools.beautify('mutation viewer ' + _type);
    }

    if (!(_type in usedViewerNames)) {
      usedViewerNames[_type] = [];
    }
    if (usedViewerNames[_type].indexOf(viewerName) !== -1) {
      viewerName += usedViewerNames[_type].length + 1;
      usedViewerNames[_type].push(viewerName);
    }
    usedViewerNames[_type].push(viewerName);

    // Add the viewer object type to the specified root query object type
    results[viewerName] = getViewerOT(viewerName, protocolName, _type, queryFields[protocolName], data);
  }

  // create name for the AnyAuth viewer
  var anyAuthObjectName = void 0;

  if (!isMutation) {
    anyAuthObjectName = 'viewerAnyAuth';
  } else {
    anyAuthObjectName = 'mutationViewerAnyAuth';
  }

  // Add the AnyAuth object type to the specified root query object type
  results[anyAuthObjectName] = getViewerAnyAuthOT(anyAuthObjectName, anyAuthFields, data, oas);

  return results;
};

/**
 * Gets the viewer Object, resolve function, and arguments
 */
var getViewerOT = function getViewerOT(name, protocolName, type, queryFields, data) {
  var scheme = data.security[protocolName];

  // resolve function:
  var resolve = function resolve(root, args, ctx) {
    var security = {};
    if (typeof protocolName === 'string') {
      security[protocolName] = args;
    } else {
      security.anyAuth = args;
    }

    /**
     * viewers are always root, so we can instantiate _oasgraph here without
     * previously checking for its existence
     */
    return {
      _oasgraph: {
        security: security
      }
    };
  };

  // arguments:
  var args = {};
  if ((typeof scheme === 'undefined' ? 'undefined' : _typeof(scheme)) === 'object') {
    for (var parameterName in scheme.parameters) {
      args[parameterName] = { type: new _graphql.GraphQLNonNull(_graphql.GraphQLString) };
    }
  }

  return {
    type: new _graphql.GraphQLObjectType({
      name: name,
      description: 'A viewer for the security protocol: "' + scheme.rawName + '"',
      fields: queryFields
    }),
    resolve: resolve,
    args: args,
    description: 'A viewer that wraps all operations authenticated via ' + type
  };
};

/**
 * Create an object containing an AnyAuth viewer, its resolve function,
 * and its args.
 */
var getViewerAnyAuthOT = function getViewerAnyAuthOT(name, queryFields, data, oas) {
  var args = {};
  for (var protocolName in data.security) {
    // create input object types for the viewer arguments
    // NOTE: does not need to check for OAuth 2.0 anymore
    // TODO: This is bad. We don't pass an operation, which is needed for
    // creating the GraphQLType, though.
    var _type2 = (0, _schema_builder.getGraphQLType)({
      name: protocolName,
      schema: data.security[protocolName].schema,
      data: data,
      oas: oas,
      isMutation: true
    });
    args[Oas3Tools.beautify(protocolName)] = { type: _type2 };
  }

  // pass object containing security information to fields
  var resolve = function resolve(root, args, ctx) {
    return {
      _oasgraph: {
        security: args
      }
    };
  };

  return {
    type: new _graphql.GraphQLObjectType({
      name: name,
      description: 'Warning: Not every request will work with this viewer type',
      fields: queryFields
    }),
    resolve: resolve,
    args: args,
    description: 'A viewer that wraps operations for all available ' + 'authentication mechanisms'
  };
};

module.exports = {
  createAndLoadViewer: createAndLoadViewer
};