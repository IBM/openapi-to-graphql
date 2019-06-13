/**
 * Defines the functions exposed by OpenAPI-to-GraphQL.
 *
 * Some general notes:
 *
 * - GraphQL interfaces rely on sanitized strings for (Input) Object Type names
 *   and fields. We perform sanitization only when assigning (field-) names, but
 *   keep keys in the OAS otherwise as-is, to ensure that inner-OAS references
 *   work as expected.
 *
 * - GraphQL (Input) Object Types must have a unique name. Thus, sometimes Input
 *   Object Types and Object Types need separate names, despite them having the
 *   same structure. We thus append 'Input' to every Input Object Type's name
 *   as a convention.
 *
 * - To pass data between resolve functions, OpenAPI-to-GraphQL uses a _openapiToGraphql object
 *   returned by every resolver in addition to its original data (OpenAPI-to-GraphQL does
 *   not use the context to do so, which is an anti-pattern according to=
 *   https://github.com/graphql/graphql-js/issues/953).
 *
 * - OpenAPI-to-GraphQL can handle basic authentication and api key-based authentication
 *   through GraphQL. To do this, OpenAPI-to-GraphQL creates two new intermediate Object
 *   Types called QueryViewer and MutationViewer that take as input security
 *   credentials and pass them on using the _openapiToGraphql object to other resolve
 *   functions.
 */
import { Options, Report } from './types/options';
import { Oas3 } from './types/oas3';
import { Oas2 } from './types/oas2';
import { GraphQLSchema } from 'graphql';
declare type Result = {
    schema: GraphQLSchema;
    report: Report;
};
/**
 * Creates a GraphQL interface from the given OpenAPI Specification (2 or 3).
 */
export declare function createGraphQlSchema(spec: Oas3 | Oas2 | (Oas3 | Oas2)[], options?: Options): Promise<Result>;
export { sanitize } from './oas_3_tools';
