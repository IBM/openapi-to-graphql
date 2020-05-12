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
const graphql_1 = require("graphql");
const common_def_1 = require("./common_def");
const strToUpperCase = (str) => str.toUpperCase();
const wordRegex = /(?:^|\s)\S/g;
const sentenceRegex = /(?:^|\.\s)\S/g;
const newlineRegex = /[\r\n]+/g;
const newlineWithWSRegex = /\s*[\r\n]+\s*/g;
const linebreakRegex = /\r\n|\r|\n/g;
const whitespace = /\s+/g;
const collapseWS = (str) => str.replace(whitespace, ' ');
const trimAndCollapseWS = (str) => str.trim().replace(whitespace, ' ');
exports.createStringScalar = (config) => {
    const { capitalize, coerce, collapseWhitespace, errorHandler, lowercase, maxEmptyLines, maxLength, minLength, nonEmpty, pattern, sanitize, serialize, singleline, trim, truncate, uppercase, validate } = config, scalarConfig = __rest(config, ["capitalize", "coerce", "collapseWhitespace", "errorHandler", "lowercase", "maxEmptyLines", "maxLength", "minLength", "nonEmpty", "pattern", "sanitize", "serialize", "singleline", "trim", "truncate", "uppercase", "validate"]);
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    const handleError = errorHandler || common_def_1.defaultErrorHandler;
    let emptyLineRegex = null;
    let emptyLineString = null;
    if (maxEmptyLines) {
        emptyLineRegex = new RegExp(`\n{${maxEmptyLines + 2},}`, 'g');
        emptyLineString = '\n'.repeat(maxEmptyLines + 1);
    }
    const parseValue = (unknownValue, ast) => {
        // null inputs don't come here
        // Coersion Phase
        if (unknownValue == null) {
            return null;
        }
        let value;
        if (typeof unknownValue === 'string') {
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
                    config,
                });
            }
        }
        // Sanitization Phase
        if (value) {
            if (trim) {
                value = value.trim();
            }
            if (value) {
                if (singleline) {
                    value = value.replace(newlineRegex, singleline);
                }
                if (collapseWhitespace) {
                    if (singleline) {
                        // newlines replaced already
                        value = value.replace(whitespace, ' ');
                    }
                    else if (maxEmptyLines) {
                        value = value
                            .split(linebreakRegex)
                            .map(trimAndCollapseWS)
                            .join('\n')
                            .replace(emptyLineRegex, emptyLineString);
                    }
                    else {
                        value = value
                            .split(newlineWithWSRegex)
                            .map(collapseWS)
                            .join('\n');
                    }
                }
                if (truncate != null && value.length > truncate) {
                    value = value.substring(0, truncate);
                }
                if (uppercase) {
                    value = value.toUpperCase();
                }
                else if (lowercase) {
                    value = value.toLowerCase();
                }
                if (capitalize) {
                    switch (capitalize) {
                        case 'characters':
                            value = value.toUpperCase();
                            break;
                        case 'words':
                            value = value.replace(wordRegex, strToUpperCase);
                            break;
                        case 'sentences':
                            value = value.replace(sentenceRegex, strToUpperCase);
                            break;
                        case 'first':
                        default:
                            value = value[0].toUpperCase() + value.slice(1);
                            break;
                    }
                }
            }
        }
        if (sanitize) {
            const valueOrNull = sanitize(value);
            if (valueOrNull == null) {
                return null;
            }
            value = valueOrNull;
        }
        // Validation Phase
        if (nonEmpty && !value) {
            return handleError({
                code: 'empty',
                originalValue: unknownValue,
                value,
                ast,
                config,
            });
        }
        if (minLength != null && value.length < minLength) {
            return handleError({
                code: 'minLength',
                originalValue: unknownValue,
                value,
                ast,
                config,
            });
        }
        if (maxLength != null && value.length > maxLength) {
            return handleError({
                code: 'maxLength',
                originalValue: unknownValue,
                value,
                ast,
                config,
            });
        }
        if (regex != null && !regex.test(value)) {
            return handleError({
                code: 'pattern',
                originalValue: unknownValue,
                value,
                ast,
                config,
            });
        }
        if (validate && !validate(value)) {
            return handleError({
                code: 'validate',
                originalValue: unknownValue,
                value,
                ast,
                config,
            });
        }
        return value;
    };
    return new graphql_1.GraphQLScalarType(Object.assign(Object.assign({}, scalarConfig), { serialize: serialize || common_def_1.defaultSerialize, parseValue, parseLiteral: (ast) => parseValue(common_def_1.getValueFromValueNode(ast), ast) }));
};
//# sourceMappingURL=strict_string.js.map