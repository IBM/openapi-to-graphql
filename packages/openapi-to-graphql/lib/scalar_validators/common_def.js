"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getValueFromValueNode = exports.defaultSerialize = exports.defaultErrorHandler = void 0;
const graphql_1 = require("graphql");
const graphql_2 = require("graphql");
exports.defaultErrorHandler = ({ code, ast }) => {
    throw new graphql_2.GraphQLError(`code=${code}`, ast ? [ast] : []);
};
exports.defaultSerialize = (x) => x;
exports.getValueFromValueNode = (ast) => {
    switch (ast.kind) {
        case graphql_1.Kind.BOOLEAN:
            return ast.value;
        case graphql_1.Kind.FLOAT:
            return parseFloat(ast.value);
        case graphql_1.Kind.INT:
            return parseInt(ast.value, 10);
        case graphql_1.Kind.NULL:
            return null;
        case graphql_1.Kind.STRING:
            return ast.value;
        case graphql_1.Kind.ENUM:
            return ast.value;
    }
    return undefined;
};
//# sourceMappingURL=common_def.js.map