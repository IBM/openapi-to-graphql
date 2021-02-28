"use strict";
// Copyright IBM Corp. 2018. All Rights Reserved.
// Node module: openapi-to-graphql
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEmptyObjectType = void 0;
/**
 * Utilities related to GraphQL.
 */
const graphql_1 = require("graphql");
/**
 * Returns empty GraphQLObjectType.
 */
function getEmptyObjectType(name) {
    return new graphql_1.GraphQLObjectType({
        name: name + 'Placeholder',
        description: 'Placeholder object',
        fields: {
            message: {
                type: graphql_1.GraphQLString,
                description: 'Placeholder field',
                resolve: () => {
                    return 'This is a placeholder field.';
                }
            }
        }
    });
}
exports.getEmptyObjectType = getEmptyObjectType;
//# sourceMappingURL=graphql_tools.js.map