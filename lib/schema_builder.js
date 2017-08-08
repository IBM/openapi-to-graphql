'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _graphql = require('graphql');

var _oas_3_tools = require('./oas_3_tools.js');

var _oas_3_tools2 = _interopRequireDefault(_oas_3_tools);

var _resolver_builder = require('./resolver_builder.js');

var _resolver_builder2 = _interopRequireDefault(_resolver_builder);

var _preprocessor = require('./preprocessor.js');

var _preprocessor2 = _interopRequireDefault(_preprocessor);

var _debug = require('debug');

var _debug2 = _interopRequireDefault(_debug);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var log = (0, _debug2.default)('translation');

/**
 * Type definitions
 */


/**
 * Creates and returns a GraphQL (Input) Type for the given JSON schema.
 */
var getGraphQLType = function getGraphQLType(_ref) {
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
  if (iteration === 20) {
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
    // TODO: replace schema here, rather than change OAS
    _oas_3_tools2.default.resolveAllOf(schema.allOf, schema, oas);
    delete schema.allOf;
  }

  // determine the type of the schema
  var type = _oas_3_tools2.default.getSchemaType(schema);

  // CASE: no known type
  if (!type) {
    log('Warning: skipped creation of (Input) Type "' + name + '", which has no ' + ('valid schema type. Schema: ' + JSON.stringify(schema)));
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
};

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
var reuseOrCreateOt = function reuseOrCreateOt(_ref2) {
  var name = _ref2.name,
      schema = _ref2.schema,
      operation = _ref2.operation,
      data = _ref2.data,
      oas = _ref2.oas,
      iteration = _ref2.iteration,
      isMutation = _ref2.isMutation;

  // some validation
  if (typeof schema === 'undefined') {
    throw new Error('no schema passed to reuseOrCreateOt for name ' + name);
  }

  // fetch or create data definition
  var def = _preprocessor2.default.createOrReuseDataDef(schema, { fromRef: name }, data);

  // CASE: query - create or reuse OT
  if (!isMutation) {
    if (def.ot && typeof def.ot !== 'undefined') {
      log('reuse  Object Type "' + def.otName + '"');
      return def.ot;
    } else {
      log('create Object Type "' + def.otName + '"');

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
      log('reuse  Input Object Type "' + def.iotName + '"');
      return def.iot;
    } else {
      log('create Input Object Type "' + def.iotName + '"');
      def.iot = new _graphql.GraphQLInputObjectType({
        name: def.iotName,
        description: schema.description, // might be undefined
        fields: function fields() {
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
};

/**
 * Returns an existing List or creates a new one, and stores it in data
 */
var reuseOrCreateList = function reuseOrCreateList(_ref3) {
  var name = _ref3.name,
      operation = _ref3.operation,
      schema = _ref3.schema,
      data = _ref3.data,
      oas = _ref3.oas,
      iteration = _ref3.iteration,
      isMutation = _ref3.isMutation;

  // minimal error-checking
  if (!('items' in schema)) {
    throw new Error('Items property missing in array schema definition of ' + ('' + name));
  }

  var def = _preprocessor2.default.createOrReuseDataDef(schema, { fromRef: name + 'List' }, data);

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
    itemsSchema = _oas_3_tools2.default.resolveRef(itemsSchema['$ref'], oas);
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
    log('Warning: skipped creation of list \'' + name + '\' because list item ' + ('\'' + itemsName + '\' has no valid schema: ' + JSON.stringify(itemsSchema)));
    return new _graphql.GraphQLList(_graphql.GraphQLString);
  }
};

/**
 * Returns an existing Enum Type or creates a new one, and stores it in data
 */
var reuseOrCreateEnum = function reuseOrCreateEnum(_ref4) {
  var name = _ref4.name,
      data = _ref4.data,
      enumList = _ref4.enumList;

  // try to reuse existing Enum Type
  var def = _preprocessor2.default.createOrReuseDataDef(enumList, { fromRef: name }, data);

  if (def.ot && typeof def.ot !== 'undefined') {
    log('reuse  GraphQLEnumType "' + def.otName + '"');
    return def.ot;
  } else {
    log('create GraphQLEnumType "' + def.otName + '"');
    var values = {};
    enumList.forEach(function (e) {
      values[_oas_3_tools2.default.beautify(e)] = {
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
};

/**
 * Returns the GraphQL scalar type matching the given JSON schema type
 */
var getScalarType = function getScalarType(type, data) {
  switch (type) {
    case 'string':
      return _graphql.GraphQLString;
    case 'integer':
      return _graphql.GraphQLInt;
    case 'number':
      return _graphql.GraphQLFloat;
    case 'boolean':
      return _graphql.GraphQLBoolean;
    default:
      if (!data.options.strict) {
        log('Warning: can\'t resolve type "' + type + '" - default to GraphQLString');
        return _graphql.GraphQLString;
      } else {
        throw new Error('Unknown JSON scalar "' + type + '"');
      }
  }
};

/**
 * Creates the fields object to be used by an ObjectType
 */
var createFields = function createFields(_ref5) {
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
    schema = _oas_3_tools2.default.resolveRef(schema['$ref'], oas);
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
      propSchema = _oas_3_tools2.default.resolveRef(propSchema['$ref'], oas);
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
      var sanePropName = _oas_3_tools2.default.beautifyAndStore(propertyKey, data.saneMap);
      fields[sanePropName] = {
        type: reqMutationProp ? new _graphql.GraphQLNonNull(objectType) : objectType,
        description: propSchema.description // might be undefined
      };
    }
  }

  // create fields for links
  if (iteration === 0 && operation && (typeof operation === 'undefined' ? 'undefined' : _typeof(operation)) === 'object' && _typeof(operation.links) === 'object' && !isMutation) {
    var _loop = function _loop(linkKey) {
      log('create link "' + linkKey + '"...');

      // get linked operation
      var linkedOpId = void 0;
      // TODO: href is yet another alternative to operationRef and operationId
      if (typeof operation.links[linkKey].operationId === 'string') {
        linkedOpId = operation.links[linkKey].operationId;
      } else {
        throw new Error('Link definition has neither "operationRef",\n          "operationId", or "hRef" property');
      }
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
      var linkResolver = _resolver_builder2.default.getResolver({
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
      var saneLinkKey = _oas_3_tools2.default.beautifyAndStore(linkKey, data.saneMap);
      fields[saneLinkKey] = {
        type: resObjectType,
        resolve: linkResolver,
        args: args,
        description: operation.links[linkKey].description // may be undefined
      };
    };

    for (var linkKey in operation.links) {
      _loop(linkKey);
    }
  }

  // create fields for subOperations
  if (iteration === 0 && operation && (typeof operation === 'undefined' ? 'undefined' : _typeof(operation)) === 'object' && Array.isArray(operation.subOps)) {
    var _iteratorNormalCompletion = true;
    var _didIteratorError = false;
    var _iteratorError = undefined;

    try {
      var _loop2 = function _loop2() {
        var subOp = _step.value;

        // here, we know the operatoin is present
        operation = operation;
        var fieldName = subOp.resDef.otName;
        var otName = operation.resDef.otName;
        if (typeof fields[fieldName] !== 'undefined') {
          log('Warning: cannot add sub operation "' + fieldName + '" to ' + ('"' + otName + '". Collision detected.'));
          return 'continue';
        }

        log('add sub operation "' + fieldName + '" to ' + ('"' + otName + '"'));

        // determine parameters provided via parent operation
        var argsFromParent = operation.parameters.filter(function (param) {
          return param.in === 'path';
        }).map(function (args) {
          return args.name;
        });

        var subOpResolver = _resolver_builder2.default.getResolver({
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
        var _ret2 = _loop2();

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
};

/**
 * Creates an object with the arguments for resolving a GraphQL (Input) Object
 * Type
 */
var getArgs = function getArgs(_ref6) {
  var parameters = _ref6.parameters,
      reqSchema = _ref6.reqSchema,
      reqSchemaName = _ref6.reqSchemaName,
      data = _ref6.data,
      oas = _ref6.oas,
      operation = _ref6.operation;

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
        log('Warning: ignore parameter with no "name" property: ' + ('' + JSON.stringify(parameter)));
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
      var _saneName = _oas_3_tools2.default.beautify(parameter.name);

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

      args[_saneName] = {
        type: parameter.required ? new _graphql.GraphQLNonNull(_type) : _type,
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
    var saneName = _oas_3_tools2.default.beautify(reqSchemaName);
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
};

module.exports = {
  getGraphQLType: getGraphQLType,
  getArgs: getArgs
};