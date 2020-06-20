/**
 * Custom type definitions for GraphQL.
 */
import { GraphQLObjectType, GraphQLScalarType, GraphQLInputObjectType, GraphQLList, GraphQLEnumType, GraphQLUnionType, GraphQLFieldResolver } from 'graphql';
export declare enum GraphQLOperationType {
    Query = 0,
    Mutation = 1,
    Subscription = 2
}
export declare type GraphQLType = GraphQLObjectType | GraphQLInputObjectType | GraphQLList<any> | GraphQLUnionType | GraphQLEnumType | GraphQLScalarType;
declare type Arg = {
    type: any;
    description?: string;
};
export declare type Args = {
    [key: string]: Arg;
};
export declare type SubscriptionContext = {
    pubsub: any;
    [key: string]: any;
};
export declare type SubscriptionIterator = (root: object, args: object, context: SubscriptionContext, info?: object) => AsyncIterable<string | string[]>;
export declare type Field<TSource, TContext, TArgs> = {
    type: GraphQLType;
    resolve?: GraphQLFieldResolver<TSource, TContext, TArgs>;
    subscribe?: GraphQLFieldResolver<TSource, SubscriptionContext, TArgs>;
    args?: Args;
    description: string;
};
export {};
