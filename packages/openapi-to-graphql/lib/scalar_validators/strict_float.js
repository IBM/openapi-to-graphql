"use strict";
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createFloatScalar = void 0;
const graphql_1 = require("graphql");
const common_def_1 = require("./common_def");
const utils_1 = require("../utils");
// https://github.com/graphql/graphql-js/blob/master/src/type/scalars.js
exports.createFloatScalar = (config) => {
    const { coerce, errorHandler, maximum, minimum, parse, sanitize, validate, serialize } = config, scalarConfig = __rest(config, ["coerce", "errorHandler", "maximum", "minimum", "parse", "sanitize", "validate", "serialize"]);
    const handleError = errorHandler || common_def_1.defaultErrorHandler;
    const parseValue = (unknownValue, ast) => {
        // null inputs don't come here
        // Coersion Phase
        if (unknownValue == null) {
            return null;
        }
        let value;
        if (utils_1.isTypeOf(unknownValue, 'number')) {
            value = unknownValue;
        }
        else {
            if (coerce) {
                const valueOrNull = coerce(unknownValue);
                if (valueOrNull == null) {
                    return null;
                }
                value = valueOrNull;
            }
            else {
                return handleError({
                    code: 'type',
                    originalValue: unknownValue,
                    value: unknownValue,
                    ast,
                    config
                });
            }
        }
        // Sanitization Phase
        if (sanitize && value != null) {
            const valueOrNull = sanitize(value);
            if (valueOrNull == null) {
                return null;
            }
            value = valueOrNull;
        }
        // Validation Phase
        if (minimum != null && value < minimum) {
            return handleError({
                code: 'minimum',
                originalValue: unknownValue,
                value,
                ast,
                config
            });
        }
        if (maximum != null && value > maximum) {
            return handleError({
                code: 'maximum',
                originalValue: unknownValue,
                value,
                ast,
                config
            });
        }
        if (validate && !validate(value)) {
            return handleError({
                code: 'validate',
                originalValue: unknownValue,
                value,
                ast,
                config
            });
        }
        return value;
    };
    return new graphql_1.GraphQLScalarType(Object.assign(Object.assign({}, scalarConfig), { serialize: serialize || common_def_1.defaultSerialize, parseValue, parseLiteral: (ast) => parseValue(common_def_1.getValueFromValueNode(ast), ast) }));
};
//# sourceMappingURL=strict_float.js.map