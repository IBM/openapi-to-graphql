"use strict";
// Copyright IBM Corp. 2018. All Rights Reserved.
// Node module: oasgraph
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT
Object.defineProperty(exports, "__esModule", { value: true });
exports.WarningTypes = {
    /**
     * Authentication
     */
    UNSUPPORTED_HTTP_AUTH_SCHEME: (culprit, solution) => {
        return {
            type: 'UnsupportedHTTPAuthScheme',
            message: `Unsupported HTTP authentication scheme '${culprit}'.`,
            mitigation: `Ignore operation`
        };
    },
    MULTIPLE_RESPONSES: (culprit, solution) => {
        return {
            type: 'MultipleResponses',
            message: `Operation '${culprit}' has more than one success status ` +
                `codes (200 - 299).`,
            mitigation: `Will select response for status code '${solution}'`
        };
    },
    MISSING_RESPONSE_SCHEMA: (culprit, solution) => {
        return {
            type: 'MissingResponseSchema',
            message: `Operation '${culprit}' has no (valid) response schema.`,
            mitigation: `Ignore operation`
        };
    },
    INVALID_SCHEMA_TYPE: (culprit, solution) => {
        return {
            type: 'InvalidSchemaType',
            message: `Request / response schema has no (valid) type: ${culprit}`,
            mitigation: `Fall back to type 'GraphQL String'`
        };
    },
    INVALID_SCHEMA_TYPE_LIST_ITEM: (culprit, solution) => {
        return {
            type: 'InvalidSchemaTypeListItem',
            message: `Request / response schema has no (valid) type: ${culprit}`,
            mitigation: `Fall back to type 'GraphQL String'`
        };
    },
    INVALID_SCHEMA_TYPE_SCALAR: (culprit, solution) => {
        return {
            type: 'InvalidSchemaTypeScalar',
            message: `Request / response schema has no (valid) type: ${culprit}`,
            mitigation: `Fall back to type 'GraphQL String'`
        };
    },
    UNRESOLVABLE_LINK: (culprit, solution) => {
        return {
            type: 'UnresolvableLink',
            message: `Cannot resolve target of link: ${culprit}.`,
            mitigation: `Ignore link`
        };
    },
    AMBIGUOUS_LINK: (culprit, solution) => {
        return {
            type: 'AmbiguousLink',
            message: `Cannot unambiguously resolve operationRef '${culprit}' in link.`,
            mitigation: `Use first occurance of '#/' - may cause runtime errors`
        };
    },
    LINK_NAME_COLLISION: (culprit, solution) => {
        return {
            type: 'LinkNameCollision',
            message: `Cannot create link '${culprit}' because Object Type already ` +
                `contains field of the same name.`,
            mitigation: `Ignore link`
        };
    },
    UNNAMED_PARAMETER: (culprit, solution) => {
        return {
            type: 'UnnamedParameter',
            message: `Parameter misses 'name' property: ${culprit}.`,
            mitigation: `Ignore parameter`
        };
    }
};
/**
 * Utilities that are specific to OASGraph
 */
function handleWarning({ typeKey, culprit, solution = '', data, log }) {
    let warning = exports.WarningTypes[typeKey](culprit, solution);
    if (data.options.strict) {
        throw new Error(`${warning.type} - ${warning.message}`);
    }
    else {
        let output = `Warning: ${warning.message} - ${warning.mitigation}`;
        if (typeof log === 'function') {
            log(output);
        }
        else {
            console.log(output);
        }
        data.options.report.warnings.push(warning);
    }
}
exports.handleWarning = handleWarning;
//# sourceMappingURL=utils.js.map