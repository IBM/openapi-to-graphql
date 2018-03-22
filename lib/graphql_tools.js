"use strict";
/**
 * Utilities related to GraphQL.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const graphql_1 = require("graphql");
/**
 * Returns empty GraphQLObjectType.
 */
function getEmptyObjectType(name) {
    return new graphql_1.GraphQLObjectType({
        name: name + 'Placeholder',
        fields: {
            message: {
                type: graphql_1.GraphQLString,
                resolve: () => {
                    return 'This interface offers no query.';
                }
            }
        }
    });
}
exports.getEmptyObjectType = getEmptyObjectType;
/**
 * Returns empty GraphQLInputObjectType.
 */
function getEmptyInputObjectType() {
    return new graphql_1.GraphQLInputObjectType({
        name: 'placeholder',
        fields: {
            message: {
                type: graphql_1.GraphQLString,
                resolve: () => {
                    return 'This interface offers no mutation.';
                }
            }
        }
    });
}
exports.getEmptyInputObjectType = getEmptyInputObjectType;
//# sourceMappingURL=graphql_tools.js.map