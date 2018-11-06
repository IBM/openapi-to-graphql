# OASGraph Quickstart tutorial

The purpose of this tutorial is to show how easy it is to use OASGraph CLI in combination with LoopBack.

With just a single command line instruction, `oasgraph <OAS JSON file path or remote url>`, you can get a GraphQL server running.

Please note that while the CLI tool will satisfy most needs, it does not offer the flexibility or functionality of OASGraph's intended usage, as an integrated library. See the [README.md](../../README.md) for more information.

## Video demo

[![OASGraph](../conveyor_belt.png)](https://www.youtube.com/watch?v=KXUTmM6y-LM "Click here to watch!")

## Do it yourself

### Make sure you have installed Node.js

Before you install OASGraph, make sure to download and install Node.js (version 8.9.x or higher), a JavaScript runtime.

To install Node.js, click [here](https://nodejs.org/en/download/).

### Install OASGraph

OASGraph can be used either as a library, or via its Command Line Interface (CLI). To install the CLI tool, run the following command.

```sh
npm i -g oasgraph-cli
```

### Save or locate the OAS

OASGraph relies on the OpenAPI Specification (OAS) of an existing API to create a GraphQL interface around that API. OASGraph can also retrieve a web-hosted OAS.

If you are using LoopBack, you can simply copy the URL location of the web-hosted OAS, which should be located at http://127.0.0.1:3000/openapi.json after starting the API.

```sh
# in the LoopBack project folder:
npm start
```

***

If you want to generate a GraphQL interface for another API, make sure that API is running and proceed in the same way or save the OAS.

### Start GraphQL server

Once OASGraph is installed and the OAS is obtained, you can create and start the GraphQL server. The created GraphQL server is then accessible by default at [http://127.0.0.1:3001/graphql](http://127.0.0.1:3001/graphql).

You can specify a local file containing the OAS specification or a remote url such as `http://127.0.0.1:3000/openapi.json`. Additionally, you can specify an optional port number so you can have multiple GraphQL servers for testing in the same machine.

```sh
oasgraph <OAS JSON file path or remote url> [port number]
```
