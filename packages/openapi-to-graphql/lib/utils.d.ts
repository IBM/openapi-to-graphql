import { PreprocessingData } from './types/preprocessing_data';
export declare const mitigations: {
    /**
     * Problems with the OAS
     *
     * Should be caught by the module oas-validator
     */
    INVALID_OAS: string;
    UNNAMED_PARAMETER: string;
    AMBIGUOUS_UNION_MEMBERS: string;
    CANNOT_GET_FIELD_TYPE: string;
    COMBINE_SCHEMAS: string;
    DUPLICATE_FIELD_NAME: string;
    DUPLICATE_LINK_KEY: string;
    MISSING_RESPONSE_SCHEMA: string;
    MISSING_SCHEMA: string;
    MULTIPLE_RESPONSES: string;
    NON_APPLICATION_JSON_SCHEMA: string;
    OBJECT_MISSING_PROPERTIES: string;
    UNKNOWN_TARGET_TYPE: string;
    UNRESOLVABLE_SCHEMA: string;
    UNSUPPORTED_HTTP_SECURITY_SCHEME: string;
    UNSUPPORTED_JSON_SCHEMA_KEYWORD: string;
    CALLBACKS_MULTIPLE_OPERATION_OBJECTS: string;
    AMBIGUOUS_LINK: string;
    LINK_NAME_COLLISION: string;
    UNRESOLVABLE_LINK: string;
    DUPLICATE_OPERATIONID: string;
    DUPLICATE_SECURITY_SCHEME: string;
    MULTIPLE_OAS_SAME_TITLE: string;
    CUSTOM_RESOLVER_UNKNOWN_OAS: string;
    CUSTOM_RESOLVER_UNKNOWN_PATH_METHOD: string;
    LIMIT_ARGUMENT_NAME_COLLISION: string;
    OAUTH_SECURITY_SCHEME: string;
};
/**
 * verify that a variable contains a safe int (2^31)
 */
export declare function isSafeInteger(n: unknown): boolean;
/**
 * verify that a variable contains a safe long (2^53)
 */
export declare function isSafeLong(n: unknown): boolean;
/**
 *
 */
export declare function isSafeFloat(n: unknown): boolean;
/**
 * serialize a date string into the ISO format
 */
export declare function serializeDate(n: string): string;
/**
 * verify that a vriable contains a safe date/date-time string
 */
export declare function isSafeDate(n: string): boolean;
/**
 * verify is a string is a valid URL
 */
export declare function isURL(s: string): boolean;
/**
 * verify if a string is a valid EMAIL
 * See: https://github.com/Urigo/graphql-scalars/blob/master/src/resolvers/EmailAddress.ts#L4
 */
export declare function isEmail(s: string): boolean;
/**
 * verify if a string is a valid GUID/UUID
 * See: https://github.com/Urigo/graphql-scalars/blob/master/src/resolvers/GUID.ts#L4
 */
export declare function isUUIDOrGUID(s: string): boolean;
/**
 * convert the fist letter of a word in a string to upper case
 */
export declare function ucFirst(s: string): string;
/**
 * get the correct type of a variable
 */
export declare function strictTypeOf(value: unknown, type: string): boolean;
/**
 * Utilities that are specific to OpenAPI-to-GraphQL
 */
export declare function handleWarning({ typeKey, message, mitigationAddendum, path, data, log }: {
    typeKey: string;
    message: string;
    mitigationAddendum?: string;
    path?: string[];
    data: PreprocessingData;
    log?: Function;
}): void;
export declare function sortObject(o: any): {};
/**
 * Finds the common property names between two objects
 */
export declare function getCommonPropertyNames(object1: any, object2: any): string[];
