import { PreprocessingData } from './types/preprocessing_data';
export declare enum MitigationTypes {
    /**
     * Problems with the OAS
     *
     * Should be caught by the module oas-validator
     */
    INVALID_OAS = "INVALID_OAS",
    UNNAMED_PARAMETER = "UNNAMED_PARAMETER",
    AMBIGUOUS_UNION_MEMBERS = "AMBIGUOUS_UNION_MEMBERS",
    CANNOT_GET_FIELD_TYPE = "CANNOT_GET_FIELD_TYPE",
    COMBINE_SCHEMAS = "COMBINE_SCHEMAS",
    DUPLICATE_FIELD_NAME = "DUPLICATE_FIELD_NAME",
    DUPLICATE_LINK_KEY = "DUPLICATE_LINK_KEY",
    INVALID_HTTP_METHOD = "INVALID_HTTP_METHOD",
    INPUT_UNION = "INPUT_UNION",
    MISSING_RESPONSE_SCHEMA = "MISSING_RESPONSE_SCHEMA",
    MISSING_SCHEMA = "MISSING_SCHEMA",
    MULTIPLE_RESPONSES = "MULTIPLE_RESPONSES",
    NON_APPLICATION_JSON_SCHEMA = "NON_APPLICATION_JSON_SCHEMA",
    OBJECT_MISSING_PROPERTIES = "OBJECT_MISSING_PROPERTIES",
    UNKNOWN_TARGET_TYPE = "UNKNOWN_TARGET_TYPE",
    UNRESOLVABLE_SCHEMA = "UNRESOLVABLE_SCHEMA",
    UNSUPPORTED_HTTP_SECURITY_SCHEME = "UNSUPPORTED_HTTP_SECURITY_SCHEME",
    UNSUPPORTED_JSON_SCHEMA_KEYWORD = "UNSUPPORTED_JSON_SCHEMA_KEYWORD",
    CALLBACKS_MULTIPLE_OPERATION_OBJECTS = "CALLBACKS_MULTIPLE_OPERATION_OBJECTS",
    AMBIGUOUS_LINK = "AMBIGUOUS_LINK",
    LINK_NAME_COLLISION = "LINK_NAME_COLLISION",
    UNRESOLVABLE_LINK = "UNRESOLVABLE_LINK",
    DUPLICATE_OPERATIONID = "DUPLICATE_OPERATIONID",
    DUPLICATE_SECURITY_SCHEME = "DUPLICATE_SECURITY_SCHEME",
    MULTIPLE_OAS_SAME_TITLE = "MULTIPLE_OAS_SAME_TITLE",
    CUSTOM_RESOLVER_UNKNOWN_OAS = "CUSTOM_RESOLVER_UNKNOWN_OAS",
    CUSTOM_RESOLVER_UNKNOWN_PATH_METHOD = "CUSTOM_RESOLVER_UNKNOWN_PATH_METHOD",
    LIMIT_ARGUMENT_NAME_COLLISION = "LIMIT_ARGUMENT_NAME_COLLISION",
    OAUTH_SECURITY_SCHEME = "OAUTH_SECURITY_SCHEME"
}
export declare const mitigations: {
    [mitigationType in MitigationTypes]: string;
};
/**
 * Utilities that are specific to OpenAPI-to-GraphQL
 */
export declare function handleWarning<TSource, TContext, TArgs>({ mitigationType, message, mitigationAddendum, path, data, log }: {
    mitigationType: MitigationTypes;
    message: string;
    mitigationAddendum?: string;
    path?: string[];
    data: PreprocessingData<TSource, TContext, TArgs>;
    log?: Function;
}): void;
export declare function sortObject<T>(o: T): T;
/**
 * Finds the common property names between two objects
 */
export declare function getCommonPropertyNames(object1: any, object2: any): string[];
