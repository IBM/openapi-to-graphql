'use strict';

/**
 * Functions to create resolve functions.
 */

// Type imports:

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

// Imports:


exports.getResolver = getResolver;

var _request = require('request');

var _request2 = _interopRequireDefault(_request);

var _oas_3_tools = require('./oas_3_tools.js');

var Oas3Tools = _interopRequireWildcard(_oas_3_tools);

var _querystring = require('querystring');

var _querystring2 = _interopRequireDefault(_querystring);

var _jsonpath = require('jsonpath');

var _jsonpath2 = _interopRequireDefault(_jsonpath);

var _debug = require('debug');

var _debug2 = _interopRequireDefault(_debug);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// Type definitions & exports:
var log = (0, _debug2.default)('http');

/**
 * Creates and returns a resolver function that performs API requests for the
 * given GraphQL query
 */
function getResolver(_ref) {
  var operation = _ref.operation,
      _ref$argsFromLink = _ref.argsFromLink,
      argsFromLink = _ref$argsFromLink === undefined ? {} : _ref$argsFromLink,
      _ref$argsFromParent = _ref.argsFromParent,
      argsFromParent = _ref$argsFromParent === undefined ? [] : _ref$argsFromParent,
      payloadName = _ref.payloadName,
      data = _ref.data,
      oas = _ref.oas;

  // determine the appropriate URL:
  var baseUrl = Oas3Tools.getBaseUrl(oas, operation);

  // return resolve function:
  return function (root, args) {
    var ctx = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};

    // fetch possibly existing _oasgraph
    // NOTE: _oasgraph is an object used to pass security information
    var _oasgraph = {};
    if (root && (typeof root === 'undefined' ? 'undefined' : _typeof(root)) === 'object' && _typeof(root._oasgraph) === 'object') {
      _oasgraph = root._oasgraph;
    }
    if (typeof _oasgraph.usedParams === 'undefined') {
      _oasgraph.usedParams = {};
    }

    // handle arguments provided by links
    for (var paramName in argsFromLink) {
      var value = argsFromLink[paramName];

      // parameter names can specify location of parameter (e.g., path.id)
      var paramNameWithoutLocation = paramName;
      if (paramName.indexOf('.') !== -1) {
        paramNameWithoutLocation = paramName.split('.')[1];
      }

      // CASE: parameter in body
      if (/body#/.test(value)) {
        var tokens = _jsonpath2.default.query(root, value.split('body#/')[1]);
        if (Array.isArray(tokens) && tokens.length > 0) {
          args[paramNameWithoutLocation] = tokens[0];
        } else {
          log('Warning: could not extract parameter ' + paramName + ' form link');
        }
        // CASE: parameter in previous query parameter
      } else if (/query\./.test(value)) {
        args[paramNameWithoutLocation] = _oasgraph.usedParams[Oas3Tools.beautify(value.split('query.')[1])];
        // CASE: parameter in previous path parameter
      } else if (/path\./.test(value)) {
        args[paramNameWithoutLocation] = _oasgraph.usedParams[Oas3Tools.beautify(value.split('path.')[1])];
        // CASE: link OASGraph currently does not support
      } else {
        log('Warnung: could not process link parameter ' + paramName + ' with ' + ('value ' + value));
      }
    }

    /**
     * handle arguments provided by parent - we reuse parameters populated in
     * previous calls from the context
     */
    var _iteratorNormalCompletion = true;
    var _didIteratorError = false;
    var _iteratorError = undefined;

    try {
      for (var _iterator = argsFromParent[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
        var argName = _step.value;

        args[argName] = _oasgraph.usedParams[argName];
      }

      /**
       * Handle default values of parameters, if they have not yet been defined by
       * the user.
       */
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

    operation.parameters.forEach(function (param) {
      var paramName = Oas3Tools.beautify(param.name);
      if (typeof args[paramName] === 'undefined' && param.schema && _typeof(param.schema) === 'object') {
        var schema = param.schema;
        if (schema && schema.$ref && typeof schema.$ref === 'string') {
          schema = Oas3Tools.resolveRef(schema.$ref, oas);
        }
        if (schema && schema.default && typeof schema.default !== 'undefined') {
          args[paramName] = schema.default;
        }
      }
    });

    // stored used parameters to future requests:
    _oasgraph.usedParams = Object.assign(_oasgraph.usedParams, args);

    // build URL (i.e., fill in path parameters):

    var _Oas3Tools$instantiat = Oas3Tools.instantiatePathAndGetQuery(operation.path, operation.parameters, args),
        path = _Oas3Tools$instantiat.path,
        query = _Oas3Tools$instantiat.query;

    var url = baseUrl + path;
    var options = {
      method: operation.method,
      url: url,
      json: true,
      headers: {},
      qs: query

      /**
       * Determine possible payload
       * GraphQL produces sanitized payload names, so we have to sanitize before
       * lookup here
       */
    };if (payloadName && typeof payloadName === 'string') {
      var sanePayloadName = Oas3Tools.beautify(payloadName);
      if (sanePayloadName in args) {
        // we need to desanitize the payload so the API understands it:
        var rawPayload = Oas3Tools.desanitizeObjKeys(args[sanePayloadName], data.saneMap);
        options.body = rawPayload;
      }
    }

    /**
     * Pass on OASGraph options
     */
    if (_typeof(data.options) === 'object') {
      // headers:
      if (_typeof(data.options.headers) === 'object') {
        for (var header in data.options.headers) {
          var val = data.options.headers[header];
          options.headers[header] = val;
        }
      }
      // query string:
      if (_typeof(data.options.qs) === 'object') {
        for (var _query in data.options.qs) {
          var _val = data.options.qs[_query];
          options.qs[_query] = _val;
        }
      }
    }

    // get authentication headers and query parameters

    var _getAuthOptions = getAuthOptions(operation, _oasgraph, data),
        authHeaders = _getAuthOptions.authHeaders,
        authQs = _getAuthOptions.authQs;

    // ...and pass them to the options


    Object.assign(options.headers, authHeaders);
    Object.assign(options.qs, authQs);

    // extract OAuth token from context (if available)
    if (data.options.sendOAuthTokenInQuery) {
      var oauthQueryObj = createOAuthQS(data, ctx);
      Object.assign(options.qs, oauthQueryObj);
    } else {
      var oauthHeader = createOAuthHeader(data, ctx);
      Object.assign(options.headers, oauthHeader);
    }

    // make the call
    log('Call ' + options.method.toUpperCase() + ' ' + options.url + ('?' + _querystring2.default.stringify(options.qs) + ' ') + ('headers:' + JSON.stringify(options.headers)));
    return new Promise(function (resolve, reject) {
      (0, _request2.default)(options, function (err, response, body) {
        if (err) {
          log(err);
          reject(err);
        } else if (response.statusCode > 299) {
          log(response.statusCode + ' - ' + Oas3Tools.trim(body, 100));
          reject(new Error(response.statusCode + ' - ' + JSON.stringify(body)));
        } else {
          log(response.statusCode + ' - ' + Oas3Tools.trim(body, 100));
          // deal with the fact that the server might send unsanitized data
          var saneData = Oas3Tools.sanitizeObjKeys(body);

          // pass on _oasgraph to subsequent resolvers
          if (saneData && (typeof saneData === 'undefined' ? 'undefined' : _typeof(saneData)) === 'object' && !Array.isArray(saneData)) {
            saneData._oasgraph = _oasgraph;
          }

          resolve(saneData);
        }
      });
    });
  };
}

/**
 * Attempts to create an object to become an OAuth query string by extracting an
 * OAuth token from the ctx based on the JSON path provided in the options.
 */
function createOAuthQS(data, ctx) {
  if (typeof data.options.tokenJSONpath !== 'string') {
    return {};
  }

  // extract token:
  var tokenJSONpath = data.options.tokenJSONpath;
  var tokens = _jsonpath2.default.query(ctx, tokenJSONpath);
  if (Array.isArray(tokens) && tokens.length > 0) {
    var token = tokens[0];
    return {
      access_token: token
    };
  } else {
    log('Warning: could not extract OAuth token from context at ' + ('"' + tokenJSONpath + '"'));
    return {};
  }
}

/**
 * Attempts to create an OAuth authorization header by extracting an OAuth token
 * from the ctx based on the JSON path provided in the options.
 */
function createOAuthHeader(data, ctx) {
  if (typeof data.options.tokenJSONpath !== 'string') {
    return {};
  }

  // extract token
  var tokenJSONpath = data.options.tokenJSONpath;
  var tokens = _jsonpath2.default.query(ctx, tokenJSONpath);
  if (Array.isArray(tokens) && tokens.length > 0) {
    var token = tokens[0];
    return {
      Authorization: 'Bearer ' + token,
      'User-Agent': 'oasgraph'
    };
  } else {
    log('Warning: could not extract OAuth token from context at ' + ('"' + tokenJSONpath + '"'));
    return {};
  }
}

/**
 * Returns the headers and query strings to authenticate a request (if any).
 * Object containing authHeader and authQs object,
 * which hold headers and query parameters respectively to authentication a
 * request.
 */
function getAuthOptions(operation, _oasgraph, data) {
  var authHeaders = {};
  var authQs = {};

  // determine if authentication is required, and which protocol (if any) we
  // can use

  var _getAuthReqAndProtcol = getAuthReqAndProtcolName(operation, _oasgraph, data),
      authRequired = _getAuthReqAndProtcol.authRequired,
      securityRequirement = _getAuthReqAndProtcol.securityRequirement;

  // possibly, we don't need to do anything:


  if (!authRequired) {
    return { authHeaders: authHeaders, authQs: authQs };
  }

  // if authentication is required, but we can't fulfill the protocol, throw:
  if (authRequired && typeof securityRequirement !== 'string') {
    throw new Error('Missing information to authenticate API request.');
  }

  if (typeof securityRequirement === 'string') {
    var security = data.security[securityRequirement];
    switch (security.def.type) {
      case 'apiKey':
        var apiKey = _oasgraph.security[securityRequirement].apiKey;
        if ('in' in security.def) {
          if (security.def.in === 'header' && typeof security.def.name === 'string') {
            authHeaders[security.def.name] = apiKey;
          } else if (security.def.in === 'query' && typeof security.def.name === 'string') {
            authQs[security.def.name] = apiKey;
          } else {
            throw new Error('Cannot send apiKey in ' + ('\'' + JSON.stringify(security.def.in) + '\''));
          }
        }
        break;

      case 'http':
        switch (security.def.scheme) {
          case 'basic':
            var username = _oasgraph.security[securityRequirement].username;
            var password = _oasgraph.security[securityRequirement].password;
            authHeaders['Authorization'] = 'Basic ' + Buffer.from(username + ':' + password).toString('base64');
            break;

          default:
            throw new Error('Cannot recognize http security scheme ' + ('\'' + JSON.stringify(security.def.scheme) + '\''));
        }
        break;

      case 'oauth2':
        break;

      case 'openIdConnect':
        break;

      default:
        throw new Error('Cannot recognize security type \'' + security.def.type + '\'');
    }
  }

  return { authHeaders: authHeaders, authQs: authQs };
}

/**
 * Determines whether given operation requires authentication, and which of the
 * (possibly multiple) authentication protocols can be used based on the data
 * present in the given context.
 */
function getAuthReqAndProtcolName(operation, _oasgraph, data) {
  var authRequired = false;
  if (Array.isArray(operation.securityRequirements) && operation.securityRequirements.length > 0) {
    authRequired = true;

    var _iteratorNormalCompletion2 = true;
    var _didIteratorError2 = false;
    var _iteratorError2 = undefined;

    try {
      for (var _iterator2 = operation.securityRequirements[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
        var _securityRequirement = _step2.value;

        if (_typeof(_oasgraph.security[_securityRequirement]) === 'object') {
          return {
            authRequired: authRequired,
            securityRequirement: _securityRequirement
          };
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
  return {
    authRequired: authRequired
  };
}