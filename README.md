# Real-time Messenger

Simple real time messenger application, which works as an internal communication tool for peer-to-peer chat or multi-people 
group chat online. 

The usage of real time database make it possible to set the listener subscribe to all the change events, 
including every single new coming message or new group creation. Such a way allows users to receive the result of a single 
change happen on the table or document instead of polling for changes in most traditional database architecture.


The relational data modeling structure includes multiple tables and embedded arrays to suit large amounts of data and, 
in the same time, simply queries for accessing some data that not saved in the current talbe ( like user name)
#
Functionality:
1. peer-to-peer chat
2. multi-people group chat
3. missing message notification
4. friend invitation and authentication
#
Development Environment:

1. NodeJs (Express module)
2. Rethinkdb (rethinkdb-websocket-client module)
3. Webpack (library)
4. Bootstrap 4.1 
5. jQuery (library)
#
Technologies:

Async function and promise-based code are implemented for handling multiple asynchronous processing to make sure all the 
updated query results will happen sequentially. `$.when().apply()` is also used to make sure an array of deferred actions
can be interacted at the right time.









