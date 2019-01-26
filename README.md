# Real-time Messenger

## Demo
The demo of this messenger application has been put on an EC2 instance (ubuntu 18.04) with Rethinkdb docker official images: 
[click here](http://18.218.221.72) 

## Introduction
Simple real time messenger application, which works as an internal communication tool for peer-to-peer chat or multi-people 
group chat online. 

## Features
The usage of real time database make it possible to set the listener subscribe to all the change events, 
including every single new coming message or new group creation. Such a way allows users/clients to continuously receive the result 
of updated query in real time instead of polling for changes in traditional architecture.

The relational data modeling structure includes multiple tables and embedded arrays to suit large amounts of data and, 
in the same time, simply queries for accessing some data that not saved in the current table ( like user name)

## Configuration
open a port 28015 on rethinkdb server 
```
app.wsListen = require('rethinkdb-websocket-server');
app.wsListen.listen({
    httpServer: server,
    httpPath:'/',
    dbHost: 'localhost',
    dbPort: 28015,
    unsafelyAllowAnyQuery: true
});
```
create a WebSocket connection to send queries 
```
const options = {
    host: '18.218.221.72', 
    port: 3000,       
    path: '/',       
    secure: false,     
    db: 'test',        
};
```
open a connection from client to run queries 
```
var RethinkdbWebsocketClient = require('rethinkdb-websocket-client'); 
var r = RethinkdbWebsocketClient.rethinkdb;
RethinkdbWebsocketClient.connect(options).then(function(conn) {
    // functional codes
})
```
start scripts:
```
"scripts": {
    "start": "webpack --config webpack.config.js && node ./bin/www",
    "postinstall": "webpack"
  }
```
start app with ``npm start``
## Functionality
1. peer-to-peer chat
2. multi-people group chat
3. missing message notification
4. friend invitation and authentication

## Development Environment
1. NodeJs (Express module)
2. JavaScript (jQuery library)
3. Rethinkdb (rethinkdb-websocket-client module)
4. Webpack (bundler library)
5. Bootstrap 4.1 

## Technologies

Database structure includes 3 relational tables - Profiles, Groups and Messages. They are contacted with each other by id
and sub-indexes. The usage of `changes()` in Rethinkdb and rethinkdb-websocket-client module make it possible to send data 
and push the result to the client in real time.

Async function and promise-based code are implemented for handling multiple asynchronous processing to make sure all the 
updated query results will happen sequentially. `$.when().apply()` is also used to make sure an array of deferred actions
can be interacted at the right time.









