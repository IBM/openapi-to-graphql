/**
 * Utility functions around the OpenAPI Specification 3.
 */
import { Oas2 } from './types/oas2';
import { Operation } from './types/operation';
import { Oas3, ServerObject, ParameterObject, SchemaObject, OperationObject, ReferenceObject, LinkObject, SecuritySchemeObject } from './types/oas3.js';
import { PreprocessingData, ProcessedSecurityScheme } from './types/preprocessing_data';
import { InternalOptions } from './types/options';
export declare type SchemaNames = {
    fromPath?: string;
    fromSchema?: string;
    fromRef?: string;
};
export declare type RequestSchemaAndNames = {
    payloadContentType?: string;
    payloadSchema?: SchemaObject | ReferenceObject;
    payloadSchemaNames?: SchemaNames;
    payloadRequired: boolean;
};
export declare type ResponseSchemaAndNames = {
    responseContentType?: string;
    responseSchema?: SchemaObject | ReferenceObject;
    responseSchemaNames?: SchemaNames;
    statusCode?: string;
};
export declare const OAS_OPERATIONS: string[];
export declare const SUCCESS_STATUS_RX: RegExp;
/**
 * Resolves on a validated OAS 3 for the given spec (OAS 2 or OAS 3), or rejects
 * if errors occur.
 */
export declare function getValidOAS3(spec: Oas2 | Oas3): Promise<Oas3>;
/**
 * Counts the number of operations in an OAS.
 */
export declare function countOperations(oas: Oas3): number;
/**
 * Counts the number of operations that translate to queries in an OAS.
 */
export declare function countOperationsQuery(oas: Oas3): number;
/**
 * Counts the number of operations that translate to mutations in an OAS.
 */
export declare function countOperationsMutation(oas: Oas3): number;
/**
 * Counts the number of operations with a payload definition in an OAS.
 */
export declare function countOperationsWithPayload(oas: Oas3): number;
/**
 * Resolves the given reference in the given object.
 */
export declare function resolveRef(ref: string, obj: Object, parts?: string[]): any;
/**
 * Returns the base URL to use for the given operation.
 */
export declare function getBaseUrl(operation: Operation): string;
/**
 * Returns object | array where all object keys are sanitized. Keys passed in
 * exceptions are not sanitized.
 */
export declare function sanitizeObjKeys(obj: Object | Array<any>, exceptions?: string[]): Object | Array<any>;
/**
 * Desanitizes keys in given object by replacing them with the keys stored in
 * the given mapping.
 */
export declare function desanitizeObjKeys(obj: Object | Array<any>, mapping?: Object): Object | Array<any>;
/**
 * Replaces the path parameter in the given path with values in the given args.
 * Furthermore adds the query parameters for a request.
 */
export declare function instantiatePathAndGetQuery(path: string, parameters: ParameterObject[], args: Object): {
    path: string;
    query: {
        [key: string]: string;
    };
    headers: {
        [key: string]: string;
    };
};
/**
 * Returns the "type" of the given JSON schema. Makes best guesses if the type
 * is not explicitly defined.
 */
export declare function getSchemaType(schema: SchemaObject): string | null;
/**
 * Determines an approximate name for the resource at the given path.
 */
export declare function inferResourceNameFromPath(path: string): string;
/**
 * Returns JSON-compatible schema required by the given endpoint - or null if it
 * does not exist.
 */
export declare function getRequestSchema(endpoint: OperationObject, oas: Oas3): {
    payloadContentType: string;
    payloadSchema: SchemaObject;
} | null;
/**
 * Returns the request schema (if any) for endpoint at given path and method, a
 * dictionary of names from different sources (if available), and whether the
 * request schema is required for the endpoint.
 */
export declare function getRequestSchemaAndNames(path: string, method: string, oas: Oas3): RequestSchemaAndNames;
/**
 * Returns JSON-compatible schema produced by the given endpoint - or null if it
 * does not exist.
 */
export declare function getResponseSchema(endpoint: OperationObject, statusCode: string, oas: Oas3): {
    responseContentType: string;
    responseSchema: SchemaObject;
} | null;
/**
 * Returns the response schema for endpoint at given path and method and with
 * the given status code, and a dictionary of names from different sources (if
 * available).
 */
export declare function getResponseSchemaAndNames(path: string, method: string, oas: Oas3, data: PreprocessingData, options: InternalOptions): ResponseSchemaAndNames;
/**
 * Returns the success status code for the operation at the given path and
 * method (or null).
 */
export declare function getResponseStatusCode(path: string, method: string, oas: Oas3, data: PreprocessingData): string | void;
/**
 * Returns an hash containing the links defined in the given endpoint.
 */
export declare function getEndpointLinks(path: string, method: string, oas: Oas3, data: PreprocessingData): {
    [key: string]: LinkObject;
};
/**
 * Returns the list of parameters for the endpoint at the given method and path.
 * Resolves possible references.
 */
export declare function getParameters(path: string, method: string, oas: Oas3): ParameterObject[];
/**
 * Returns an array of server objects for the opeartion at the given path and
 * method. Considers in the following order: global server definitions,
 * definitions at the path item, definitions at the operation, or the OAS
 * default.
 */
export declare function getServers(path: string, method: string, oas: Oas3): ServerObject[];
/**
 * Returns a map of Security Scheme definitions, identified by keys. Resolves
 * possible references.
 */
export declare function getSecuritySchemes(oas: Oas3): {
    [key: string]: SecuritySchemeObject;
};
/**
 * Returns the list of BEAUTIFIED keys of NON-OAUTH 2 security schemes
 * required by the operation at the given path and method.
 */
export declare function getSecurityRequirements(path: string, method: string, securitySchemes: {
    [key: string]: ProcessedSecurityScheme;
}, oas: Oas3): string[];
/**
 * Beautifies the given string and stores the sanitized-to-original mapping in
 * the given mapping.
 */
export declare function beautifyAndStore(str: string, mapping: {
    [key: string]: string;
}): string;
/**
 * First sanitizes given string and then also camel-cases it.
 */
export declare function beautify(str: string, lowercaseFirstChar?: boolean): string;
/**
 * Stringifies and possibly trims the given string to the provided length.
 */
export declare function trim(str: string, length: number): string;
/**
 * Determines if the given "method" is indeed an operation. Alternatively, the
 * method could point to other types of information (e.g., parameters, servers).
 */
export declare function isOperation(method: string): boolean;
/**
 * Capitalizes a given string
 */
export declare function capitalize(str: string): string;
/**
 * Uncapitalizes a given string
 */
export declare function uncapitalize(str: string): string;
