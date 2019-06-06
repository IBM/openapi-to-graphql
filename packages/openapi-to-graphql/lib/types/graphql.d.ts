/**
 * Custom type definitions for GraphQL.
 */
import { GraphQLObjectType, GraphQLScalarType, GraphQLInputObjectType, GraphQLList, GraphQLEnumType } from 'graphql';
export declare type GraphQLType = GraphQLScalarType | GraphQLObjectType | GraphQLEnumType | GraphQLInputObjectType | GraphQLList<any>;
declare type Arg = {
    type: any;
    description?: string;
};
export declare type Args = {
    [key: string]: Arg;
};
export declare type ResolveFunction = (root: object, args: object, ctx: object, info: object) => Promise<any> | any;
export declare type Field = {
    type: GraphQLType;
    resolve?: ResolveFunction;
    args?: Args;
    description: string;
};
export {};
