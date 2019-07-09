import { PreprocessingData } from './types/preprocessing_data';
export declare const mitigations: {
    /**
     * Problems with the OAS
     *
     * Should be caught by the module oas-validator
     */
    INVALID_OAS: string;
    UNNAMED_PARAMETER: string;
    MULTIPLE_RESPONSES: string;
    MISSING_RESPONSE_SCHEMA: string;
    DUPLICATE_FIELD_NAME: string;
    DUPLICATE_LINK_KEY: string;
    UNRESOLVABLE_REFERENCE: string;
    UNSUPPORTED_HTTP_SECURITY_SCHEME: string;
    NON_APPLICATION_JSON_SCHEMA: string;
    OBJECT_MISSING_PROPERTIES: string;
    UNRESOLVABLE_LINK: string;
    AMBIGUOUS_LINK: string;
    LINK_NAME_COLLISION: string;
    MULTIPLE_OAS_SAME_TITLE: string;
    DUPLICATE_OPERATIONID: string;
    DUPLICATE_SECURITY_SCHEME: string;
    CUSTOM_RESOLVER_UNKNOWN_OAS: string;
    CUSTOM_RESOLVER_UNKNOWN_PATH_METHOD: string;
    LIMIT_ARGUMENT_NAME_COLLISION: string;
    OAUTH_SECURITY_SCHEME: string;
};
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
