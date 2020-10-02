/**
 * Type definitions for the OpenAPI Specification 3.
 */
declare type ExternalDocumentationObject = {
    description?: string;
    url: string;
};
export declare type SchemaObject = {
    $ref?: string;
    title?: string;
    type?: 'string' | 'number' | 'object' | 'array' | 'boolean' | 'integer';
    format?: string;
    nullable?: boolean;
    description?: string;
    properties?: {
        [key: string]: SchemaObject | ReferenceObject;
    };
    required?: string[];
    default?: any;
    additionalProperties?: SchemaObject | ReferenceObject | boolean;
    items?: SchemaObject | ReferenceObject;
    additionalItems?: boolean | string[];
    enum?: string[];
    allOf?: (SchemaObject | ReferenceObject)[];
    anyOf?: (SchemaObject | ReferenceObject)[];
    oneOf?: (SchemaObject | ReferenceObject)[];
    not?: (SchemaObject | ReferenceObject)[];
};
export declare type ReferenceObject = {
    $ref: string;
};
declare type ExampleObject = {
    summary?: string;
    description?: string;
    value?: any;
    externalValue?: string;
};
declare type HeaderObject = {
    name?: string;
    in?: 'query' | 'header' | 'path' | 'cookie';
    description?: string;
    required?: boolean;
    deprecated?: boolean;
    allowEmptyValue?: boolean;
};
declare type EncodingObject = {
    contentType?: string;
    headers?: {
        [key: string]: HeaderObject | ReferenceObject;
    };
    style?: string;
    explode?: boolean;
    allowReserved?: boolean;
};
export declare type MediaTypeObject = {
    schema?: SchemaObject | ReferenceObject;
    example?: any;
    examples?: {
        [key: string]: ExampleObject | ReferenceObject;
    };
    encoding?: {
        [key: string]: EncodingObject;
    };
};
export declare type ParameterObject = {
    name: string;
    in: 'query' | 'header' | 'path' | 'cookie';
    description?: string;
    required?: boolean;
    deprecated?: boolean;
    allowEmptyValue?: boolean;
    style?: 'form' | 'simple';
    explode?: boolean;
    allowReserved?: boolean;
    schema?: SchemaObject | ReferenceObject;
    example?: any;
    examples?: {
        [key: string]: ExampleObject | ReferenceObject;
    };
    content?: {
        [key: string]: MediaTypeObject;
    };
};
export declare type MediaTypesObject = {
    [key: string]: MediaTypeObject;
};
export declare type ServerObject = {
    url: string;
    description?: string;
    variables?: object;
};
export declare type RequestBodyObject = {
    description?: string;
    content: {
        [key: string]: MediaTypeObject;
    };
    required?: boolean;
};
export declare type LinkObject = {
    operationRef?: string;
    operationId?: string;
    parameters?: {
        [key: string]: any;
    };
    requestBody?: any;
    description?: string;
    server?: ServerObject;
};
export declare type LinksObject = {
    [key: string]: LinkObject | ReferenceObject;
};
export declare type ResponseObject = {
    description: string;
    headers?: {
        [key: string]: HeaderObject | ReferenceObject;
    };
    content?: MediaTypesObject;
    links?: LinksObject;
};
export declare type ResponsesObject = {
    [key: string]: ResponseObject | ReferenceObject;
};
export declare type SecurityRequirementObject = {
    [key: string]: string[];
};
export declare type OperationObject = {
    tags?: string[];
    summary?: string;
    description?: string;
    externalDocs?: ExternalDocumentationObject;
    operationId?: string;
    parameters?: Array<ParameterObject | ReferenceObject>;
    requestBody?: RequestBodyObject | ReferenceObject;
    responses?: ResponsesObject;
    callbacks?: CallbacksObject;
    deprecated?: boolean;
    security?: SecurityRequirementObject[];
    servers?: ServerObject[];
};
export declare type PathItemObject = {
    $ref?: string;
    summary?: string;
    description?: string;
    get: OperationObject;
    put: OperationObject;
    post: OperationObject;
    delete: OperationObject;
    options: OperationObject;
    head: OperationObject;
    patch: OperationObject;
    trace: OperationObject;
    servers?: ServerObject[];
    parameters?: [ParameterObject | ReferenceObject];
};
declare type PathsObject = {
    [key: string]: PathItemObject;
};
export declare type CallbackObject = {
    [key: string]: PathItemObject;
};
export declare type CallbacksObject = {
    [key: string]: CallbackObject | ReferenceObject;
};
declare type OAuthFlowObject = {
    authorizationUrl?: string;
    tokenUrl?: string;
    refreshUrl?: string;
    scopes?: {
        [key: string]: string;
    };
};
declare type OAuthFlowsObject = {
    implicit?: OAuthFlowObject;
    password?: OAuthFlowObject;
    clientCredentials?: OAuthFlowObject;
    authorizationCode?: OAuthFlowObject;
};
export declare type SecuritySchemeObject = {
    type: 'apiKey' | 'http' | 'oauth2' | 'openIdConnect';
    description?: string;
    name?: string;
    in?: string;
    scheme?: string;
    bearerFormat?: string;
    flows?: OAuthFlowsObject;
    openIdConnectUrl?: string;
};
export declare type SecuritySchemesObject = {
    [key: string]: SecuritySchemeObject | ReferenceObject;
};
declare type ComponentsObject = {
    schemas?: {
        [key: string]: SchemaObject | ReferenceObject;
    };
    responses?: ResponsesObject;
    parameters?: {
        [key: string]: ParameterObject | ReferenceObject;
    };
    examples?: {
        [key: string]: ExampleObject | ReferenceObject;
    };
    requestBodies?: {
        [key: string]: RequestBodyObject | ReferenceObject;
    };
    headers?: {
        [key: string]: HeaderObject | ReferenceObject;
    };
    securitySchemes?: SecuritySchemesObject;
    links?: LinksObject;
    callbacks?: {
        [key: string]: CallbackObject | ReferenceObject;
    };
};
declare type TagObject = {
    name: string;
    description?: string;
    externalDocs?: ExternalDocumentationObject;
};
export declare type Oas3 = {
    openapi: string;
    info: {
        title: string;
        description?: string;
        termsOfService?: string;
        contact?: {
            name?: string;
            url?: string;
            email?: string;
        };
        license?: {
            name: string;
            url?: string;
        };
        version: string;
    };
    servers?: ServerObject[];
    paths: PathsObject;
    components?: ComponentsObject;
    security?: SecurityRequirementObject[];
    tags?: TagObject[];
    externalDocs?: ExternalDocumentationObject;
};
export {};
