'use strict';

/**
 * Functions to translate JSON schema to GraphQL (input) object types.
 */

// Type imports:

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

// Imports:


exports.getGraphQLType = getGraphQLType;
exports.getArgs = getArgs;

var _graphqlTypeJson = require('graphql-type-json');

var _graphqlTypeJson2 = _interopRequireDefault(_graphqlTypeJson);

var _oas_3_tools = require('./oas_3_tools.js');

var Oas3Tools = _interopRequireWildcard(_oas_3_tools);

var _jsonSchemaMergeAllof = require('json-schema-merge-allof');

var _jsonSchemaMergeAllof2 = _interopRequireDefault(_jsonSchemaMergeAllof);

var _resolver_builder = require('./resolver_builder.js');

var _preprocessor = require('./preprocessor.js');

var _debug = require('debug');

var _debug2 = _interopRequireDefault(_debug);

var _utils = require('./utils.js');

var _graphql = require('graphql');

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// Type definitions & exports:
var log = (0, _debug2.default)('translation');

/**
 * Creates and returns a GraphQL (Input) Type for the given JSON schema.
 */
function getGraphQLType(_ref) {
  var name = _ref.name,
      schema = _ref.schema,
      operation = _ref.operation,
      data = _ref.data,
      oas = _ref.oas,
      _ref$iteration = _ref.iteration,
      iteration = _ref$iteration === undefined ? 0 : _ref$iteration,
      _ref$isMutation = _ref.isMutation,
      isMutation = _ref$isMutation === undefined ? false : _ref$isMutation;

  // avoid excessive iterations
  if (iteration === 50) {
    throw new Error('Too many iterations when creating schema ' + name);
  }

  // no valid schema name
  if (!name || typeof name !== 'string') {
    throw new Error('Invalid schema name provided');
  }

  // some error checking
  if (!schema || (typeof schema === 'undefined' ? 'undefined' : _typeof(schema)) !== 'object') {
    throw new Error('Invalid schema for ' + name + ' provided of type ' + ('"' + (typeof schema === 'undefined' ? 'undefined' : _typeof(schema)) + '"'));
  }

  // resolve allOf element in schema if applicable
  if ('allOf' in schema) {
    schema = (0, _jsonSchemaMergeAllof2.default)(schema);
  }

  // determine the type of the schema
  var type = Oas3Tools.getSchemaType(schema);

  // CASE: no known type
  if (!type) {
    (0, _utils.handleWarning)({
      typeKey: 'INVALID_SCHEMA_TYPE',
      culprit: JSON.stringify(schema),
      data: data,
      log: log
    });
    return _graphql.GraphQLString;

    // CASE: object - create ObjectType
  } else if (type === 'object') {
    return reuseOrCreateOt({
      name: name,
      schema: schema,
      operation: operation,
      data: data,
      oas: oas,
      iteration: iteration,
      isMutation: isMutation
    });

    // CASE: array - create ArrayType
  } else if (type === 'array') {
    return reuseOrCreateList({
      name: name,
      schema: schema,
      operation: operation,
      data: data,
      oas: oas,
      iteration: iteration,
      isMutation: isMutation
    });

    // CASE: enum - create EnumType
  } else if (type === 'enum') {
    return reuseOrCreateEnum({
      name: name,
      data: data,
      enumList: schema.enum
    });

    // CASE: scalar - return scalar
  } else {
    return getScalarType(type, data);
  }
}

/**
 * Returns an existing (Input) Object Type or creates a new one, and stores it
 * in data
 *
 * A returned GraphQLObjectType has the following internal structure:
 *
 *   new GraphQLObjectType({
 *     name        // optional name of the type
 *     description // optional description of type
 *     fields      // REQUIRED returning fields
 *       type      // REQUIRED definition of the field type
 *       args      // optional definition of types
 *       resolve   // optional function defining how to obtain this type
 *   })
 */
function reuseOrCreateOt(_ref2) {
  var name = _ref2.name,
      schema = _ref2.schema,
      operation = _ref2.operation,
      data = _ref2.data,
      oas = _ref2.oas,
      iteration = _ref2.iteration,
      isMutation = _ref2.isMutation;

  // some validation
  if (typeof schema === 'undefined') {
    throw new Error('No schema passed to reuseOrCreateOt for name \'' + name + '\'.');
  }

  // fetch or create data definition
  var def = (0, _preprocessor.createOrReuseDataDef)(schema, { fromRef: name }, data);

  // CASE: query - create or reuse OT
  if (!isMutation) {
    if (def.ot && typeof def.ot !== 'undefined') {
      log('reuse  Object Type "' + def.otName + '"' + ((typeof operation === 'undefined' ? 'undefined' : _typeof(operation)) === 'object' ? ' (for operation "' + operation.operationId + '")' : ''));
      return def.ot;
    } else {
      log('create Object Type "' + def.otName + '"' + ((typeof operation === 'undefined' ? 'undefined' : _typeof(operation)) === 'object' ? ' (for operation "' + operation.operationId + '")' : ''));

      var _description = typeof schema.description !== 'undefined' ? schema.description : 'No description available.';
      def.ot = new _graphql.GraphQLObjectType({
        name: def.otName,
        description: _description,
        fields: function fields() {
          return createFields({
            name: def.otName,
            schema: schema,
            operation: operation,
            data: data,
            oas: oas,
            iteration: iteration,
            isMutation: isMutation
          });
        }
      });
      return def.ot;
    }
    // CASE: mutation - create or reuse IOT
  } else {
    if (typeof def.iot !== 'undefined') {
      log('reuse  Input Object Type "' + def.iotName + '"' + ((typeof operation === 'undefined' ? 'undefined' : _typeof(operation)) === 'object' ? ' (for operation "' + operation.operationId + '")' : ''));
      return def.iot;
    } else {
      log('create Input Object Type "' + def.iotName + '"' + ((typeof operation === 'undefined' ? 'undefined' : _typeof(operation)) === 'object' ? ' (for operation "' + operation.operationId + '")' : ''));
      def.iot = new _graphql.GraphQLInputObjectType({
        name: def.iotName,
        description: schema.description, // might be undefined
        // $FlowFixMe: this is a valid thunk being returned
        fields: function fields() {
          // $FlowFixMe
          return createFields({
            name: def.iotName,
            schema: schema,
            operation: operation,
            data: data,
            oas: oas,
            iteration: iteration,
            isMutation: isMutation
          });
        }
      });
      return def.iot;
    }
  }
}

/**
 * Returns an existing List or creates a new one, and stores it in data
 */
function reuseOrCreateList(_ref3) {
  var name = _ref3.name,
      operation = _ref3.operation,
      schema = _ref3.schema,
      data = _ref3.data,
      oas = _ref3.oas,
      iteration = _ref3.iteration,
      isMutation = _ref3.isMutation;

  // minimal error-checking
  if (!('items' in schema)) {
    throw new Error('Items property missing in array schema definition of ' + ('\'' + name + '\'.'));
  }

  var def = (0, _preprocessor.createOrReuseDataDef)(schema, { fromRef: name + 'List' }, data);

  // try to reuse existing Object Type
  if (!isMutation && def.ot && typeof def.ot !== 'undefined') {
    log('reuse  GraphQLList "' + def.otName + '"');
    return def.ot;
  } else if (isMutation && def.iot && typeof def.iot !== 'undefined') {
    log('reuse  GraphQLList "' + def.iotName + '"');
    return def.iot;
  }

  // create new List Object Type
  log('create GraphQLList "' + def.otName + '"');

  // determine the type of the list elements
  var itemsSchema = schema.items;
  var itemsName = name + 'ListItem';
  if ('$ref' in itemsSchema) {
    itemsSchema = Oas3Tools.resolveRef(itemsSchema['$ref'], oas);
    itemsName = schema.items['$ref'].split('/').pop();
  }

  var itemsType = getGraphQLType({
    name: itemsName,
    schema: itemsSchema,
    data: data,
    operation: operation,
    oas: oas,
    iteration: iteration + 1,
    isMutation: isMutation
  });

  if (itemsType !== null) {
    var listObjectType = new _graphql.GraphQLList(itemsType);

    // store newly created List Object Type
    if (!isMutation) {
      def.ot = listObjectType;
    } else {
      def.iot = listObjectType;
    }
    return listObjectType;
  } else {
    (0, _utils.handleWarning)({
      typeKey: 'INVALID_SCHEMA_TYPE_LIST_ITEM',
      culprit: 'List item \'' + itemsName + '\' in list \'' + name + '\' with schema: ' + ('' + JSON.stringify(itemsSchema)),
      data: data,
      log: log
    });
    return new _graphql.GraphQLList(_graphql.GraphQLString);
  }
}

/**
 * Returns an existing Enum Type or creates a new one, and stores it in data
 */
function reuseOrCreateEnum(_ref4) {
  var name = _ref4.name,
      data = _ref4.data,
      enumList = _ref4.enumList;

  // try to reuse existing Enum Type
  var def = (0, _preprocessor.createOrReuseDataDef)(enumList, { fromRef: name }, data);

  if (def.ot && typeof def.ot !== 'undefined') {
    log('reuse  GraphQLEnumType "' + def.otName + '"');
    return def.ot;
  } else {
    log('create GraphQLEnumType "' + def.otName + '"');
    var values = {};
    enumList.forEach(function (e) {
      values[Oas3Tools.beautify(e)] = {
        value: e
      };
    });

    // store newly created Enum Object Type
    def.ot = new _graphql.GraphQLEnumType({
      name: def.otName,
      values: values
    });
    return def.ot;
  }
}

/**
 * Returns the GraphQL scalar type matching the given JSON schema type
 */
function getScalarType(type, data) {
  switch (type) {
    case 'string':
      return _graphql.GraphQLString;
    case 'integer':
      return _graphql.GraphQLInt;
    case 'number':
      return _graphql.GraphQLFloat;
    case 'boolean':
      return _graphql.GraphQLBoolean;
    case 'json':
      return _graphqlTypeJson2.default;
    default:
      (0, _utils.handleWarning)({
        typeKey: 'INVALID_SCHEMA_TYPE_SCALAR',
        culprit: 'Unknown JSON scalar type \'' + type + '\'',
        data: data,
        log: log
      });
      return _graphql.GraphQLString;
  }
}

/**
 * Creates the fields object to be used by an ObjectType
 */
function createFields(_ref5) {
  var name = _ref5.name,
      schema = _ref5.schema,
      operation = _ref5.operation,
      data = _ref5.data,
      oas = _ref5.oas,
      iteration = _ref5.iteration,
      isMutation = _ref5.isMutation;

  var fields = {};

  // resolve reference if applicable
  if ('$ref' in schema) {
    schema = Oas3Tools.resolveRef(schema['$ref'], oas);
  }

  // create fields for properties
  for (var propertyKey in schema.properties) {
    var propSchema = schema.properties[propertyKey];
    var propSchemaName = propertyKey; // name of schema for this prop's field

    // determine if this property is required in mutations
    var reqMutationProp = isMutation && 'required' in schema && schema.required.includes(propertyKey);

    // if properties are referenced, try to reuse schemas
    if ('$ref' in propSchema) {
      propSchemaName = propSchema['$ref'].split('/').pop();
      propSchema = Oas3Tools.resolveRef(propSchema['$ref'], oas);
    }

    // get object type describing the property
    var objectType = getGraphQLType({
      name: propSchemaName,
      schema: propSchema,
      operation: operation,
      data: data,
      oas: oas,
      iteration: iteration + 1,
      isMutation: isMutation
    });

    // finally, add the object type to the fields (using sanitized field name)
    if (objectType) {
      var sanePropName = Oas3Tools.beautifyAndStore(propertyKey, data.saneMap);
      fields[sanePropName] = {
        type: reqMutationProp ? new _graphql.GraphQLNonNull(objectType) : objectType,
        description: propSchema.description // might be undefined
      };
    }
  }

  // create fields for links
  if (iteration === 0 && // only for operation-level object types
  operation && (typeof operation === 'undefined' ? 'undefined' : _typeof(operation)) === 'object' && // operation is provided
  _typeof(operation.links) === 'object' && // links are present
  !isMutation // only if we are not talking INPUT object type
  ) {
      for (var linkKey in operation.links) {
        log('create link "' + linkKey + '"...');

        // get linked operation
        var linkedOpId = void 0;
        // TODO: href is yet another alternative to operationRef and operationId
        if (typeof operation.links[linkKey].operationId === 'string') {
          linkedOpId = operation.links[linkKey].operationId;
        } else if (typeof operation.links[linkKey].operationRef === 'string') {
          linkedOpId = linkOpRefToOpId({
            linkKey: linkKey,
            operation: operation,
            name: name,
            data: data,
            oas: oas
          });
        }

        // linkedOpId may not be initialized because operationRef may lead to an
        // operation object that does not have an operationId

        if (typeof linkedOpId === 'string' && linkedOpId in data.operations) {
          (function () {
            var linkedOp = data.operations[linkedOpId];

            // determine parameters provided via link
            var argsFromLink = operation.links[linkKey].parameters;

            // remove argsFromLinks from operation parameters
            var dynamicParams = linkedOp.parameters;
            if ((typeof argsFromLink === 'undefined' ? 'undefined' : _typeof(argsFromLink)) === 'object') {
              dynamicParams = dynamicParams.filter(function (p) {
                // here, we know argsFromLink is present:
                argsFromLink = argsFromLink;
                return typeof argsFromLink[p.name] === 'undefined';
              });
            }

            // get resolve function for link
            var linkResolver = (0, _resolver_builder.getResolver)({
              operation: linkedOp,
              argsFromLink: argsFromLink,
              data: data,
              oas: oas
            });

            // get args for link
            var args = getArgs({
              parameters: dynamicParams,
              operation: operation,
              data: data,
              oas: oas
            });

            /**
             * get response object type
             * use the reference here
             * OT will be built up some other time
             */
            var resObjectType = linkedOp.resDef.ot;

            // finally, add the object type to the fields (using sanitized field name)
            var saneLinkKey = Oas3Tools.beautifyAndStore(linkKey, data.saneMap);
            fields[saneLinkKey] = {
              type: resObjectType,
              resolve: linkResolver,
              args: args,
              description: operation.links[linkKey].description // may be undefined
            };
          })();
        } else {
          (0, _utils.handleWarning)({
            typeKey: 'UNRESOLVABLE_LINK',
            culprit: linkKey,
            data: data,
            log: log
          });
        }
      }
    }

  // create fields for subOperations
  if (data.options.addSubOperations && iteration === 0 && operation && (typeof operation === 'undefined' ? 'undefined' : _typeof(operation)) === 'object' && Array.isArray(operation.subOps)) {
    var _iteratorNormalCompletion = true;
    var _didIteratorError = false;
    var _iteratorError = undefined;

    try {
      var _loop = function _loop() {
        var subOp = _step.value;

        // here, we know the operation is present
        operation = operation;
        var fieldName = subOp.resDef.otName;
        var otName = operation.resDef.otName;

        // check for collision with existing field name:
        if (typeof fields[fieldName] !== 'undefined') {
          (0, _utils.handleWarning)({
            typeKey: 'LINK_NAME_COLLISION',
            culprit: fieldName,
            data: data,
            log: log
          });
          return 'continue';
        }

        log('add sub operation \'' + fieldName + '\' to ' + ('\'' + otName + '\''));

        // determine parameters provided via parent operation
        var argsFromParent = operation.parameters.filter(function (param) {
          return param.in === 'path';
        }).map(function (args) {
          return args.name;
        });

        var subOpResolver = (0, _resolver_builder.getResolver)({
          operation: subOp,
          argsFromParent: argsFromParent,
          data: data,
          oas: oas
        });

        var dynamicParams = subOp.parameters.filter(function (parameter) {
          return !argsFromParent.includes(parameter.name);
        });

        // get args
        var args = getArgs({
          parameters: dynamicParams,
          operation: operation,
          data: data,
          oas: oas
        });

        fields[fieldName] = {
          type: subOp.resDef.ot,
          resolve: subOpResolver,
          args: args,
          description: subOp.resDef.schema.description
        };
      };

      for (var _iterator = operation.subOps[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
        var _ret2 = _loop();

        if (_ret2 === 'continue') continue;
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
  return fields;
}

/**
 * Returns the operationId that an operationRef is associated to
 *
 * NOTE: If the operation does not natively have operationId, this function
 *  will try to produce an operationId the same way preprocessor.js does it.
 *
 *  Any changes to constructing operationIds in preprocessor.js should be
 *  reflected here.
 */
function linkOpRefToOpId(_ref6) {
  var linkKey = _ref6.linkKey,
      operation = _ref6.operation,
      name = _ref6.name,
      data = _ref6.data,
      oas = _ref6.oas;

  var linkedOpId = void 0;

  if (typeof operation.links[linkKey].operationRef === 'string') {
    // TODO: external refs

    var operationRef = operation.links[linkKey].operationRef;
    var linkRelativePathAndMethod = void 0;

    // example relative path: '#/paths/~12.0~1repositories~1{username}/get'
    // example absolute path: 'https://na2.gigantic-server.com/#/paths/~12.0~1repositories~1{username}/get'
    //
    // extract relative path from relative path
    if (operationRef.substring(0, 8) === '#/paths/') {
      linkRelativePathAndMethod = operationRef;

      // extract relative path from absolute path
    } else {
      // '#' may exist in other places in the path
      // '/#/' is more likely to point to the beginning of the path
      var firstPathIndex = operationRef.indexOf('/#/paths/');

      // found a relative path candidate
      if (firstPathIndex !== -1) {
        // check to see if there are other relative path candidates
        var lastPathIndex = operationRef.lastIndexOf('/#/paths/');
        if (firstPathIndex !== lastPathIndex) {
          (0, _utils.handleWarning)({
            typeKey: 'AMBIGUOUS_LINK',
            culprit: operationRef,
            data: data,
            log: log
          });
        }

        // +1 to avoid the first '/'
        linkRelativePathAndMethod = operationRef.substring(firstPathIndex + 1);

        // cannot find relative path candidate
      } else {
        (0, _utils.handleWarning)({
          typeKey: 'UNRESOLVABLE_LINK',
          culprit: 'Link \'' + linkKey + '\' has not relative path in operationRef ' + ('\'' + operationRef + '\''),
          data: data,
          log: log
        });
        return;
      }
    }

    // infer operationId from relative path
    if (typeof linkRelativePathAndMethod === 'string') {
      var linkPath = void 0;
      var linkMethod = void 0;

      // NOTE: I wish we could extract the linkedOpId by matching the
      //  linkedOpObject with an operation in data and extracting the
      //  operationId there but that does not seem to be possible
      //  especiially because you need to know the operationId just to
      //  access the operations so what I have to do is reconstruct the
      //  operationId the same way preprocessing does it

      // linkPath should be the path followed by the method
      // find the slash that divides the path from the method
      var pivotSlashIndex = linkRelativePathAndMethod.lastIndexOf('/');

      // check if there are any '/' in the linkPath
      if (pivotSlashIndex !== -1) {
        // getting method
        // check if there is a method at the end of the linkPath
        if (pivotSlashIndex !== linkRelativePathAndMethod.length - 1) {
          // start at +1 because we do not want the starting '/'
          linkMethod = linkRelativePathAndMethod.substring(pivotSlashIndex + 1);

          // check if method is a valid method
          if (!Oas3Tools.OAS_OPERATIONS.includes(linkMethod)) {
            (0, _utils.handleWarning)({
              typeKey: 'UNRESOLVABLE_LINK',
              culprit: 'Method \'' + linkMethod + '\' in operationRef ' + ('\'' + operationRef + '\' is invalid'),
              data: data,
              log: log
            });
            return;
          }
          // there is no method at the end of the path
        } else {
          (0, _utils.handleWarning)({
            typeKey: 'UNRESOLVABLE_LINK',
            culprit: 'No valid method targeted by operationRef ' + ('\'' + operationRef + '\''),
            data: data,
            log: log
          });
          return;
        }

        // getting path
        // substring ends at pivotSlashIndex to exclude '/'
        // TODO: improve removing '/#/paths'?
        linkPath = linkRelativePathAndMethod.substring(7, pivotSlashIndex);

        if (typeof linkMethod === 'string' && typeof linkPath === 'string') {
          if (linkPath in oas.paths && linkMethod in oas.paths[linkPath]) {
            var linkedOpObject = oas.paths[linkPath][linkMethod];

            if ('operationId' in linkedOpObject) {
              linkedOpId = linkedOpObject.operationId;
            }
          }

          if (typeof linkedOpId !== 'string') {
            linkedOpId = Oas3Tools.beautify(linkMethod + ':' + linkPath);
          }

          if (linkedOpId in data.operations) {
            return linkedOpId;
          } else {
            (0, _utils.handleWarning)({
              typeKey: 'UNRESOLVABLE_LINK',
              culprit: 'Could not find operationId \'' + linkedOpId + '\' in link ' + ('\'' + linkKey + '\''),
              data: data,
              log: log
            });
          }
          // path and method could not be found
        } else {
          (0, _utils.handleWarning)({
            typeKey: 'UNRESOLVABLE_LINK',
            culprit: 'Could not find path and/or method from operationRef ' + ('\'' + operationRef + '\' in link \'' + linkKey + '\''),
            data: data,
            log: log
          });
        }

        // Cannot split relative path into path and method sections
      } else {
        (0, _utils.handleWarning)({
          typeKey: 'UNRESOLVABLE_LINK',
          culprit: 'Could not extract path and/or method from operationRef ' + ('\'' + operationRef + '\' in link \'' + linkKey + '\''),
          data: data,
          log: log
        });
      }

      // Cannot extract relative path from absolute path
    } else {
      (0, _utils.handleWarning)({
        typeKey: 'UNRESOLVABLE_LINK',
        culprit: 'Could not extract relative path from operationRef ' + ('\'' + operationRef + '\' in link \'' + linkKey + '\''),
        data: data,
        log: log
      });
    }
  }
}

/**
 * Creates an object with the arguments for resolving a GraphQL (Input) Object
 * Type
 */
function getArgs(_ref7) {
  var parameters = _ref7.parameters,
      reqSchema = _ref7.reqSchema,
      reqSchemaName = _ref7.reqSchemaName,
      data = _ref7.data,
      oas = _ref7.oas,
      operation = _ref7.operation;

  var args = {};

  // handle params:
  var _iteratorNormalCompletion2 = true;
  var _didIteratorError2 = false;
  var _iteratorError2 = undefined;

  try {
    for (var _iterator2 = parameters[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
      var parameter = _step2.value;

      // we need at least a name
      if (typeof parameter.name !== 'string') {
        (0, _utils.handleWarning)({
          typeKey: 'UNNAMED_PARAMETER',
          culprit: JSON.stringify(parameter),
          data: data,
          log: log
        });
        continue;
      }

      // if this parameter is provided via options, ignore
      if (_typeof(data.options) === 'object') {
        if (_typeof(data.options.headers) === 'object' && parameter.name in data.options.headers) {
          continue;
        }
        if (_typeof(data.options.qs) === 'object' && parameter.name in data.options.qs) {
          continue;
        }
      }

      // sanitize the argument name
      // NOTE: when matching these parameters back to requests, we need to again
      // use the real parameter name
      var _saneName = Oas3Tools.beautify(parameter.name);

      // determine type of parameter (often, there is none - assume string)
      var _type = _graphql.GraphQLString;
      if (_typeof(parameter.schema) === 'object') {
        _type = getGraphQLType({
          name: _saneName,
          schema: parameter.schema,
          operation: operation,
          data: data,
          oas: oas,
          iteration: 0,
          isMutation: true
        });
      }

      // parameters are not required when a default exists:
      var hasDefault = false;
      if (_typeof(parameter.schema) === 'object') {
        var _schema = parameter.schema;
        if (typeof _schema.$ref === 'string') {
          _schema = Oas3Tools.resolveRef(parameter.schema.$ref, oas);
        }
        if (typeof _schema.default !== 'undefined') {
          hasDefault = true;
        }
      }
      var paramRequired = parameter.required && !hasDefault;

      args[_saneName] = {
        type: paramRequired ? new _graphql.GraphQLNonNull(_type) : _type,
        description: parameter.description // might be undefined
      };
    }

    // handle request schema (if present):
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

  if (typeof reqSchemaName === 'string' && reqSchema && (typeof reqSchema === 'undefined' ? 'undefined' : _typeof(reqSchema)) === 'object') {
    var reqObjectType = getGraphQLType({
      name: reqSchemaName,
      schema: reqSchema,
      data: data,
      operation: operation,
      oas: oas,
      isMutation: true
    });

    // sanitize the argument name
    var saneName = Oas3Tools.beautify(reqSchemaName);
    var reqRequired = false;
    if (operation && (typeof operation === 'undefined' ? 'undefined' : _typeof(operation)) === 'object' && typeof operation.reqRequired === 'boolean') {
      reqRequired = operation.reqRequired;
    }
    args[saneName] = {
      type: reqRequired ? new _graphql.GraphQLNonNull(reqObjectType) : reqObjectType,
      description: typeof reqSchema.description === 'undefined' ? 'No description available.' : reqSchema.description
    };
  }
  return args;
}