/* @flow */

/**
 * We do not really care about OpenAPI specification 2.0 / Swagger, as we
 * translate it to Oas3 immediately anyways.
 */

export type Oas2 = {
  swagger: string,
  [string]: any
}
