# OASGraph Quickstart

## Video demo

[![Video demo](https://i9.ytimg.com/vi/_u7artgCqAw/sddefault.jpg?sqp=CMCFlN0F&rs=AOn4CLAdVpvBiqEMJDYGkWY1TbuRCTQd9Q&time=1537541032962)](https://www.youtube.com/watch?v=_u7artgCqAw&feature=youtu.be)

## Do it yourself

### Start API server

In your LoopBack application, run the following command.

```
npm start
```

***

Or boot up whichever backend that supports your API.

### Save the OAS

In your Loopback application, go to [http://localhost:3000/openapi.json](http://localhost:3000/openapi.json) to access the OAS.

***

Or get whichever OAS you would like to use.


### Clone OASGraph

You can find the repository [here](https://github.com/strongloop/oasgraph).

```
git clone git@github.com:strongloop/oasgraph.git
```

### Create CLI tool

Go into the OASGraph directory...

```
cd oasgraph
```

... and build the CLI tool.

```
npm link
```

### Start GraphQL server

```
oasgraph [OAS path]
```

To see your GraphQL server in action, go to [http://localhost:3001/graphql](http://localhost:3001/graphql).
