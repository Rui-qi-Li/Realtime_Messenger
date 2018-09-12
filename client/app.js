/** Client side script to let the browser download and use it */

// Import third-party libraries (managed by npm and webpack)
var RethinkdbWebsocketClient = require('rethinkdb-websocket-client');
var r = RethinkdbWebsocketClient.rethinkdb;

var loginname = "test";
var senderid = "0";
var roomid = "0";
var chat_to;

// Open a WebSocket connection to the server to send RethinkDB queries over
const options = {
    host: 'localhost', // hostname of the websocket server
    port: 3000,        // port number of the websocket server
    path: '/',       // HTTP path to websocket route
    secure: false,     // set true to use secure TLS websockets
    db: 'test',        // default database, passed to rethinkdb.connect
};
const socket = io();//import socket.io library

function fiendList_helper(key,receiver){
    /** id for list item: group_id
     *  id for badge item: receiver name */
    //1. add friend list
    $('#clients').append(
        $('<button>',{id:key,class: 'chatbtn list-group-item bg-dark text-white text-left',text:receiver})
    );
    $('#'+key).append($('<span>',{id:'badge'+receiver,class:'badge badge-danger float-right',text:'New',style:'display:none'}));

    /** filter existed group name out of creation list */
    if(!receiver.includes('_and_')){
        $('#modal_list').append(
            $('<button>',{id:'modal'+key,class:"create-group-list list-group-item list-group-item-action border",text:receiver})
        )
    }
}

function update_groups_helper(old_array,result){
    var new_array = [];
    // Array.forEach is blocking, sync
    result.forEach(function(row){
        if(!old_array.includes(row.id)){
            let newreceiver = row.groupname.split('_and_');// get the receiver string
            if (newreceiver.length === 2){
                /** for peer-to-peer chat group */
                for(let i=0;i<2;i++){
                    if(newreceiver[i] !== loginname){
                        newreceiver = newreceiver[i];
                        console.log("new group name: "+newreceiver);
                        new_array.push({
                            newreceiver:newreceiver,
                            newid:row.id
                        });
                        break;// break the loop, not modify the original array
                    }
                }
            }
            else{
                /** for multi peole group */
                console.log("new multi group name: "+row.groupname);
                new_array.push({
                    newreceiver:row.groupname,
                    newid:row.id
                });

            }
        }// if !include end
    });
    return new_array;
}

RethinkdbWebsocketClient.connect(options).then(function(conn) {
    /**
     *  Base on the internal system design, all the student have already added by Moodle
     *  1. check if user has been added by other student when the user is log out
     *  2. update the user profile
     *  3. start the app, get the existed friend list from updated profiles */

    /** INITIALISE
     *  Update the user status to the latest
     *  include: new group created by others, missing messages from existed groups
     *  return Promise object */

        function init_user_status(){
            return new Promise(function(resolve){
                r.table('profiles').getAll(loginname,{index:'username'}).run(conn,function(err,cursor){
                    if (err) throw err;
                    cursor.toArray(function (err, result) {
                        if (err) throw err;
                        if(result.length !== 0) { // existed user

                            senderid = result[0].id;// get the user id
                            console.log("1. get basic status, sender: " + senderid);

                            var old_array = Object.keys(result[0].group);// friend groups in profile
                            console.log(old_array); // can be [] or [....]
                            resolve(old_array);
                        }else{
                            console.log("user not existed!");
                            resolve(['null']); //?
                        }
                    })
                });
            });
        }

        function init_update_groups(old_array){
            return new Promise(function (resolve) {
                r.table('groups').filter(function(doc){
                    return doc('groupname').match(loginname);// multiple filter results
                }).run(conn,function(err,cursor){
                    if (err) throw err;
                    cursor.toArray(function (err, result) {
                        console.log("2. get info of new added groups");
                        resolve (update_groups_helper(old_array,result));
                    })
                })
            });
        }

        function init_update_profile(new_array){
            return new Promise(function (resolve) {
                var Promise = [];
                new_array.forEach(function(row){ //forEach is blocking, sync
                    /** resovle(value) equals return, will stop the process of current code
                     *  use [].push to make sure forEach has all finished first */
                    Promise.push(
                        r.table('profiles').get(senderid).update({
                            group:r.row("group").merge(
                                r.object(row.newid,{
                                    receiver:row.newreceiver,
                                    hasread:0 // new group, miss ALL the msg
                                })
                            )
                        }).run(conn,function(err,result){
                            if (err) throw err;
                        })
                    );// push end
                });// forEach end

                /**.apply() make sure $.when() can take an array instead of
                 *  a promise which is used to be the expected parameter for
                 *  $.when() */
                $.when.apply($,Promise).done(function(){
                    resolve("3. push any groups updates to the user profiles")
                })
            });
        }

        /** COUNTING
         *  count the number of group messages for each single group_id */
        function messages_badge(key,item){
            r.table('messages').getAll(key,{index:'group_id'}).count().run(conn,function(err,result){
                if (err) throw err;
                if(result !== item.hasread){
                    $('#badge' + item.receiver).text(result);
                    $('#badge' + item.receiver).show();
                }
            })

        }
        /** CHANGEFEED
         *  set the changefeed to new coming message and new groups created by others
         *  listen to each new message coming */
        function message_changeFeed(key){
            var currentsender;
            var currentgroupid;

            // 1st nested callback - changes()
            r.table('messages').getAll(key,{index:'group_id'}).changes().run(conn,function(err,cursor) {
                if (err) throw err;
                cursor.each(function(err,row) {
                    if (err) throw err;
                    currentsender = row.new_val.message.sender;
                    currentgroupid = row.new_val.group_id;

                    if (currentgroupid !== roomid){
                        /** if new message comes from the multi people group, use the group name */
                        if(row.new_val.groupchat !== 'null'){
                            currentsender = row.new_val.groupchat;
                        }
                        /** user is not on the changing happened room, show the missing message badge
                         *  total number - hasread number */
                        r.table('messages').getAll(currentgroupid,{index:'group_id'}).count().sub(
                            r.table('profiles').get(senderid)('group')(currentgroupid)('hasread')
                        ).run(conn,function(err,result) {
                            if (err) throw err;
                            $('#badge'+currentsender).text(result);
                            $('#badge'+currentsender).show();
                        });
                    }
                    else{
                        /** user is in the room now, so show the message */
                        $('#messages').append(
                            $('<li>',{text: row.new_val.message.content}).append(
                                $('<span>',{class: 'float-right',text: currentsender})
                            )
                        );
                        r.table('profiles').get(senderid).update(function(row){
                            return {group:row('group').merge(
                                    r.object(currentgroupid,{
                                        hasread:row('group')(currentgroupid)('hasread').add(1)
                                    })
                                )}
                        }).run(conn,function(err,result) {
                            if (err) throw err;
                        });
                    }
                })
            })
        }

        /** listen to new group creation */
        function group_changeFeed(){
            r.table('groups').filter(function(doc){return doc('groupname').match(loginname)}).changes()
                .run(conn,function(err,cursor){
                    if (err) throw err;
                    cursor.each(function(err,row) {
                        if (err) throw err;

                        var new_array = update_groups_helper([],[row.new_val]);

                        /** when find a new group created by other people:
                         * 1. add it to profile
                         * 2. show it on list
                         * 3. set messages changefeed */
                        init_update_profile(new_array).then(function(){// promise.then(handler)
                            // console.log(new_array.newid);
                            fiendList_helper(new_array[0].newid,new_array[0].newreceiver);
                            message_changeFeed(new_array[0].newid);
                        });
                    })
                });

        }

        /** START APP */
        var start = async function(){
            // initialise
            const init_old_array = await init_user_status();
            if(init_old_array[0] !== 'null'){
                const init_new_array = await init_update_groups(init_old_array);
                console.log(await init_update_profile(init_new_array));

                r.table('profiles').get(senderid).run(conn, function (err, result) { // result: object
                    if (err) throw err;

                    /** what you need to do for every group (old or new) */
                    for (var key in result.group) {//for-loop can handle with []
                        var item = result.group[key];
                        // add friend list item + show missing badge
                        fiendList_helper(key, item.receiver);
                        messages_badge(key,item);

                        // set changefeed to new messages coming
                        message_changeFeed(key);
                    }
                    // set changefeed to new group created by others
                    group_changeFeed();
                });
            }
            else{
                $('.page2').hide();
                $('.page3').show();
            }
        };

    /** After login
     *  get the login name, ready to initialise the user status */
    $('.page1').submit(function(e){
        e.preventDefault();

        /** hide the page1 and show page2 */
        loginname = $('.name').val();
        $(this).hide();
        $('.page2').show();
        $('.loginname').text($('.name').val());

        /** start the messager */
        start();

    });// "submit" event end


    // socket.on('connected client', function(m){
    //     $('#clients').empty();
    //     m.forEach(function(e){
    //         if(e != socket.username)
    //             $('#clients').append(
    //                 $('<li>',{id:e,class: 'list-group-item bg-dark',text: e}).append(
    //                     $('<button>',{class:'chatbtn float-right btn btn-primary',text:'chat'})
    //                 ));
    //     });
    // });

    $('.page3').submit(function(e) {
        e.preventDefault();

        /** hide the page3 and show page2 */
        loginname = $('.signup_name').val();
        var email = $('.signup_email').val();
        $(this).hide();
        $('.page2').show();
        $('.loginname').text($('.signup_name').val());

        r.table('profiles').insert({
            email:email,
            username:loginname,
            group:{},
            timestamp:new Date()
        }).run(conn,function(err,cursor) {
            if (err) throw err;
        })
    });

    $('#registerBtn').on('click',function(e){
        e.preventDefault();

        $('.page1').hide();
        $('.page2').hide();
        $('.page3').show();
    });

    /** Friend search and invitation:
     *  1. search friend who already in the database
     *  2. create a new group of 2 and save receiver's name into profiles
     *  3. set the changefeed to receiver
     * */
    $('#addBtn').on('click',function(e){
       e.preventDefault();
       var friend = $('#add').val();// get the friend's name

       r.table('profiles').getAll(friend,{index:'username'}).run(conn,function(err,cursor) {
           if (err) throw err;
           cursor.toArray(function(err, result) {
               /** check if friend exist */
               if(result.length === 0){
                   $('.nonexiste_alert').show();
               }
               else{
                   /** once friend is added to groups, changefeed to groups will be fired */
                   r.table('groups').insert({
                       groupname:loginname+"_and_"+result[0].username,
                       groupmember:[senderid,result[0].id],
                       timestamp:new Date()
                   }).run(conn,function(err,result){
                       if (err) throw err;
                       console.log("friend group id: "+result.generated_keys[0] +" you create a new chat group!");
                   })// groups insert end
               }// else end
           })
       });

       $('#add').val('');//clear input field
    });
    /** Click "chat" and begin to chat
     *  1. get the chat_to name text
     *  2. empty messages area and hide the badge
     *  3. get the current group id
     *  4. retrieve all messages history
     *  5. reset unread to 0 */

    function update_hasread(){
        return new Promise(function (resolve) {
            //set hasread to total number
            r.table('profiles').get(senderid).update(function(row){
                return {
                    group:row('group').merge(
                        r.object(roomid,{
                            hasread:r.table('messages').getAll(roomid,{index:'group_id'}).count()
                        })
                    )}
                    },{nonAtomic:true}).run(conn,function(err,result) {
                if (err) throw err;
                console.log(result);// show replaced or unchanged
                resolve("you enter a chat group, set hasread to the total number")
            });
        })
    }

    /** (Event delegation allows us to attach a single event listener, to a parent element, that will fire for all descendants
     *  matching a selector, whether those descendants exist now or are added in the future) */
    $('#clients').on('click','.chatbtn',function(e){
        e.preventDefault();
        $('.defaultarea').hide();
        $('.chatarea').show();

        if(roomid !== $(this).attr('id')){

            // get the current group id that saved in id attr
            roomid = $(this).attr('id');

            $('.chatarea').find('h5').empty();
            $('#messages').empty();

            // get text node that belong to this <button> DOM
            var temp = $(this).contents().filter(function () {
                return this.nodeType == 3;
            });
            chat_to = temp.text();

            $('.chatarea').prepend($('<h5>').text('Now you can talk to: '+ chat_to));
            $('#badge'+chat_to).hide();

            /** update the hasread and retrieve all message history */
            update_hasread().then(function (result) {
                console.log(result);

                r.table('messages').getAll(roomid,{index:'group_id'}).run(conn,function(err,cursor) {
                    if (err) throw err;
                    cursor.toArray(function(err, result) {
                        if (err) throw err;
                        result.forEach(function(item){
                            $('#messages').append(
                                $('<li>',{text: item.message.content}).append(
                                    $('<span>',{class: 'float-right',text: item.message.sender})
                                )
                            );
                        })
                    });
                    window.scrollTo(0, document.body.scrollHeight);
                });
            });
        }
    });

    $('#createBtn').on('click',function (e) {
        e.preventDefault();
        var group_name = loginname+'_and_';
        var group_member = [senderid];
        var active_count = 0;

        /** mark selected contacts and their id*/
        $( ".create-group-list" ).each(function( index ) {
             if($(this).hasClass('active')){
                 group_name += $( this ).text() + '_and_';
                 group_member.push($(this).attr('id').substring(5));
                 active_count++;
             }
        });

        if(active_count >= 2){
            /** empty markers and hide the modal */
            group_name = group_name.substring(0, group_name.length - 5); // remove the last '_and_'
            console.log(group_name);
            console.log(group_member);
            $('#exampleModal').modal('hide');
            $( ".create-group-list" ).each(function( index ) {
                $( this ).removeClass('active');
            });

            /** update this new group */
            r.table('groups').insert({
                groupmember:group_member,
                groupname:group_name,
                timestamp:new Date()
            }).run(conn,function(err,result) {
                if (err) throw err;
            })

        }else{
            $('.lesspeople_alert').show();
        }
    });

    $('.chat').submit(function(e){
        e.preventDefault();
        var groupchat = 'null';
        /** save the name of multi people chat group */
        if(chat_to.includes('_and_')){
            groupchat = chat_to;
        }
        r.table('messages').insert({
            group_id:roomid,groupchat:groupchat,message:{content:$('#m').val(),sender:loginname},sender_id:senderid,timestamp:new Date()
        }).run(conn,function(err,result){
            if (err) throw err;
        });
        $('#m').val('');//clear input field
    });

});
