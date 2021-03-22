/// <reference types="node" />
/**
 * Functions to create resolve functions.
 */
import { ParameterObject } from './types/oas3';
import { ConnectOptions } from './types/options';
import { Operation } from './types/operation';
import { SubscriptionContext } from './types/graphql';
import { PreprocessingData } from './types/preprocessing_data';
import { RequestOptions, RequestOptionsFunction } from './types/options';
import { GraphQLFieldResolver } from 'graphql';
import { IncomingHttpHeaders } from 'http';
export declare const OPENAPI_TO_GRAPHQL = "_openAPIToGraphQL";
declare type GetResolverParams<TSource, TContext, TArgs> = {
    operation: Operation;
    argsFromLink?: {
        [key: string]: string;
    };
    payloadName?: string;
    responseName?: string;
    data: PreprocessingData<TSource, TContext, TArgs>;
    baseUrl?: string;
    requestOptions?: Partial<RequestOptions<TSource, TContext, TArgs>> | RequestOptionsFunction<TSource, TContext, TArgs>;
};
declare type GetSubscribeParams<TSource, TContext, TArgs> = {
    operation: Operation;
    argsFromLink?: {
        [key: string]: string;
    };
    payloadName?: string;
    data: PreprocessingData<TSource, TContext, TArgs>;
    baseUrl?: string;
    connectOptions?: ConnectOptions;
};
declare type ResolveData<TSource, TContext, TArgs> = {
    /**
     * TODO: Determine type
     *
     * Is it related to TArgs?
     */
    usedParams: any;
    usedPayload: any;
    usedRequestOptions: RequestOptions<TSource, TContext, TArgs>;
    usedStatusCode: string;
    responseHeaders: IncomingHttpHeaders;
};
declare type OpenAPIToGraphQLRoot<TSource, TContext, TArgs> = {
    data?: {
        [identifier: string]: ResolveData<TSource, TContext, TArgs>;
    };
    /**
     * TODO: We can define more specific types. See getProcessedSecuritySchemes().
     *
     * Is it related TArgs?
     */
    security: {
        [saneProtocolName: string]: any;
    };
};
declare type OpenAPIToGraphQLSource<TSource, TContext, TArgs> = {
    _openAPIToGraphQL: OpenAPIToGraphQLRoot<TSource, TContext, TArgs>;
};
export declare function getSubscribe<TSource, TContext, TArgs>({ operation, payloadName, data, baseUrl, connectOptions }: GetSubscribeParams<TSource, TContext, TArgs>): GraphQLFieldResolver<TSource, SubscriptionContext, TArgs>;
export declare function getPublishResolver<TSource, TContext, TArgs>({ operation, responseName, data }: GetResolverParams<TSource, TContext, TArgs>): GraphQLFieldResolver<TSource, TContext, TArgs>;
/**
 * If the operation type is Query or Mutation, create and return a resolver
 * function that performs API requests for the given GraphQL query
 */
export declare function getResolver<TSource, TContext, TArgs>({ operation, argsFromLink, payloadName, data, baseUrl, requestOptions }: GetResolverParams<TSource, TContext, TArgs>): GraphQLFieldResolver<TSource & OpenAPIToGraphQLSource<TSource, TContext, TArgs>, TContext, TArgs>;
/**
 * Extracts data from the GraphQL arguments of a particular field
 *
 * Replaces the path parameter in the given path with values in the given args.
 * Furthermore adds the query parameters for a request.
 */
export declare function extractRequestDataFromArgs<TSource, TContext, TArgs>(path: string, parameters: ParameterObject[], args: TArgs, // NOTE: argument keys are sanitized!
data: PreprocessingData<TSource, TContext, TArgs>): {
    path: string;
    qs: {
        [key: string]: string;
    };
    headers: {
        [key: string]: string;
    };
};
export {};
