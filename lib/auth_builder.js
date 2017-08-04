'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _require = require('graphql'),
    GraphQLString = _require.GraphQLString,
    GraphQLObjectType = _require.GraphQLObjectType,
    GraphQLNonNull = _require.GraphQLNonNull;

var SchemaBuilder = require('./schema_builder.js');
var Oas3Tools = require('./oas_3_tools.js');
var log = require('debug')('translation');

/**
 * Checks if security is required in any operation
 *
 * @param  {Object}  oas Raw OpenAPI Specification 3.0
 *
 * @return {Boolean}
 */
var hasAuth = function hasAuth(oas) {
  if ('security' in oas && oas.security.length > 0) {
    return true;
  } else {
    for (var path in oas.paths) {
      for (var method in oas.paths[path]) {
        if ('security' in oas.paths[path][method] && oas.paths[path][method].security.length > 0) {
          return true;
        }
      }
    }
  }
  return false;
};

/**
 * For a given operation, retrieve all the sercurity protocols that operation uses
 *
 * @param  {String} operationId Operation ID of the operation in question
 * @param  {Object} oas         Raw OpenAPI Specification 3.0
 *
 * @return {Object}
 */
var getSecurityProtocols = function getSecurityProtocols(operationId, oas) {
  for (var path in oas.paths) {
    for (var method in oas.paths[path]) {
      if (oas.paths[path][method].operationId === operationId) {
        return oas.paths[path][method].security;
      }
    }
  }
  return null;
};

/**
 * Load the field object in the appropriate root object
 *
 * i.e. inside either rootQueryFields/rootMutationFields or inside
 * rootQueryFields/rootMutationFields for further processing
 *
 * @param  {Object}  queryFields     Object that contains the fields for either
 *                                     viewer or mutationViewer object types
 * @param  {Object}  rootFields      Object that contains all object types of either
 *                                     query or mutation object
 * @param  {Object}  usedObjectNames Object that contains all previously defined
 *                                     viewer object names
 * @param  {Object}  data            Data produced by preprocessing
 * @param  {Object}  oas             Raw OpenAPI Specification 3.0
 * @param  {Boolean} isMutation      Whether to create a viewer or a mutationViewer
 */
var createAndLoadViewer = function createAndLoadViewer(queryFields, rootFields, usedObjectNames, data, oas) {
  var isMutation = arguments.length > 5 && arguments[5] !== undefined ? arguments[5] : false;

  var allFields = {};
  for (var protocolName in queryFields) {
    Object.assign(allFields, queryFields[protocolName]);

    /**
     * check if the name has already been used (i.e. in the list)
     * if so, create a new name and add it to the list
     */
    var type = data.security[protocolName].def.type;

    /**
     * HTTP is not an authentication protocol
     * HTTP covers a number of different authentication type
     * change the typeName to match the exact authentication type (e.g. basic authentication)
     */
    if (type === 'http') {
      switch (data.security[protocolName].def.scheme) {
        case 'basic':
          type = 'BasicAuth';
          break;

        default:
          if (data.options.strict) {
            throw new Error('Unsupported scheme ' + data.security[protocolName].def.scheme + ' for HTTP authentication');
          }
          log('Unsupported scheme ' + data.security[protocolName].def.scheme + ' for HTTP authentication');
      }
    }

    // create name for the viewer
    var objectName = void 0;

    if (!isMutation) {
      objectName = Oas3Tools.beautify('viewer ' + type);
    } else {
      objectName = Oas3Tools.beautify('mutation viewer ' + type);
    }

    if (!(type in usedObjectNames)) {
      usedObjectNames[type] = [];
    }
    if (usedObjectNames[type].indexOf(objectName) !== -1) {
      objectName += usedObjectNames[type].length + 1;
      usedObjectNames[type].push(objectName);
    }
    usedObjectNames[type].push(objectName);

    // Create the specialized viewer object types

    var _getViewerOT = getViewerOT(objectName, protocolName, queryFields[protocolName], data),
        _viewerOT = _getViewerOT.viewerOT,
        _args = _getViewerOT.args,
        _resolve = _getViewerOT.resolve;

    // Add the viewer object type to the specified root query object type


    rootFields[objectName] = {
      type: _viewerOT,
      resolve: _resolve,
      args: _args,
      description: 'A viewer that wraps all operations authenticated via ' + type
    };
  }

  // create name for the AnyAuth viewer
  var AnyAuthObjectName = void 0;

  if (!isMutation) {
    AnyAuthObjectName = 'viewerAnyAuth';
  } else {
    AnyAuthObjectName = 'mutationViewerAnyAuth';
  }

  // Create the AnyAuth viewer object type

  var _getViewerAnyAuthOT = getViewerAnyAuthOT(AnyAuthObjectName, allFields, data, oas),
      viewerOT = _getViewerAnyAuthOT.viewerOT,
      args = _getViewerAnyAuthOT.args,
      resolve = _getViewerAnyAuthOT.resolve;

  // Add the AnyAuth object type to the specified root query object type


  rootFields[AnyAuthObjectName] = {
    type: viewerOT,
    resolve: resolve,
    args: args,
    description: 'A viewer that wraps operations for all available ' + 'authentication mechanisms'
  };
};

/**
 * Gets the viewer Object, resolve function, and arguments
 *
 * @param  {String} name
 * @param  {String} protocolName Optional. Used to identify specific arguments rather than return all possible arguments
 * @param  {Object} queryFields  Object that contains the fields for object types
 *                                 that require the specified authentication protocol
 * @param  {Object} data
 *
 * @return {Object}              Contains viewer GraphQL Object Type, resolver, and arguments
 */
var getViewerOT = function getViewerOT(name, protocolName, queryFields, data) {
  var protocol = data.security[protocolName];

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

  var args = {};
  if ((typeof protocol === 'undefined' ? 'undefined' : _typeof(protocol)) === 'object') {
    for (var parameterName in protocol.parameters) {
      args[parameterName] = { type: new GraphQLNonNull(GraphQLString) };
    }
  } else {
    for (var _protocolName in data.security) {
      for (var _parameterName in data.security[_protocolName].parameters) {
        args[protocol.parameters[_parameterName]] = { type: GraphQLString };
      }
    }
  }

  return {
    viewerOT: new GraphQLObjectType({
      name: name,
      description: 'A viewer for the security protocol: "' + protocol.rawName + '"',
      fields: queryFields
    }),
    resolve: resolve,
    args: args
  };
};

/**
 * Create an object containing an AnyAuth viewer, its resolve function, and its args
 *
 * @param  {String}  name              Name of the AnyAuth object
 * @param  {Object}  queryFields       Object that contains the fields for all
 *                                       authenticated object types
 * @param  {Object}  data              Data produced by preprocessing
 * @param  {Object}  oas               Raw OpenAPI Specification 3.0
 *
 * @return {Object}                    Contains AnyAuth viewer, resolver, and args
 */
var getViewerAnyAuthOT = function getViewerAnyAuthOT(name, queryFields, data, oas) {
  var args = {};

  for (var protocolName in data.security) {
    // create input object types for the viewer arguments
    // NOTE: does not need to check for OAuth 2.0 anymore
    args[protocolName] = { type: SchemaBuilder.getGraphQLType({
        name: protocolName,
        schema: data.security[protocolName].schema,
        data: data,
        oas: oas,
        isMutation: true
      }) };
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
    viewerOT: new GraphQLObjectType({
      name: name,
      description: 'Warning: Not every request will work with this Viewer object type',
      fields: queryFields
    }),
    resolve: resolve,
    args: args
  };
};

module.exports = {
  hasAuth: hasAuth,
  getSecurityProtocols: getSecurityProtocols,
  createAndLoadViewer: createAndLoadViewer
};