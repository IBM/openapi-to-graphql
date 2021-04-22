"use strict";
// Copyright IBM Corp. 2018. All Rights Reserved.
// Node module: openapi-to-graphql
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT
Object.defineProperty(exports, "__esModule", { value: true });
exports.TargetGraphQLType = void 0;
var TargetGraphQLType;
(function (TargetGraphQLType) {
    // scalars
    TargetGraphQLType["string"] = "string";
    TargetGraphQLType["integer"] = "integer";
    TargetGraphQLType["float"] = "float";
    TargetGraphQLType["boolean"] = "boolean";
    TargetGraphQLType["id"] = "id";
    // JSON
    TargetGraphQLType["json"] = "json";
    // non-scalars
    TargetGraphQLType["object"] = "object";
    TargetGraphQLType["list"] = "list";
    TargetGraphQLType["enum"] = "enum";
    TargetGraphQLType["anyOfObject"] = "anyOfObject";
    TargetGraphQLType["oneOfUnion"] = "oneOfUnion";
})(TargetGraphQLType = exports.TargetGraphQLType || (exports.TargetGraphQLType = {}));
//# sourceMappingURL=operation.js.map