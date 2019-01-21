var RethinkdbWebsocketClient = require('rethinkdb-websocket-client'); // third-party rethinkdb client
var r = RethinkdbWebsocketClient.rethinkdb;
var username = "test";
var useremail = "";
var userid = "0";
var roomid = "0";
var chat_to;

// Open a WebSocket connection to the server to send RethinkDB queries over
const options = {
    host: '127.0.0.1', // hostname of the websocket server
    port: 3000,        // port number of the websocket server
    path: '/',       // HTTP path to websocket route
    secure: false,     // set true to use secure TLS websockets
    db: 'test',        // default database, passed to rethinkdb.connect
};

/** filter and return a list of all the newly created groups **/
function update_groups_helper(old_array,result){ // 'old_array' is group-key list from profile table; 'result' is group list from group table
    var new_array = [];
    var newreceiver = [];

    result.forEach(function(row){ // Array.forEach is blocking, sync
        if(!old_array.includes(row.id)){
            newreceiver = row.groupname.split('_and_');// get the receiver string

            /** for new friend */
            if (newreceiver.length === 2){
                for(let i=0;i<2;i++){
                    if(newreceiver[i] !== username){
                        new_array.push({
                            newreceiver:newreceiver[i],
                            newid:row.id
                        });
                        console.log("new chat friend: "+newreceiver[i]);
                    }
                }
            }

            /** for new group */
            else {
                new_array.push({
                    newreceiver:row.groupname,
                    newid:row.id
                });
                console.log("newly created chat group: "+row.groupname);
            }

        }
    });
    return new_array;
}

/**
 *  Base on the internal system design, all the student have already added by Moodle
 *  1. check if user has been added by other student when the user is log out
 *  2. update the user profile
 *  3. start the app, get the existed friend list from updated profiles
 *  4. initialisation will return Promise object */

RethinkdbWebsocketClient.connect(options).then(function(conn) {

    // start the app when user email has found
    if ($('.param').text() !== undefined){
        useremail = $('.param').text();
        console.log(useremail);
        start();
    }

    /** create friend list on the view*/
    function friendList_helper(key,receiver){ // 'key' is group id; 'receiver' is group name
        //1. add friend/group name button
        $('#clients').append(
            $('<button>',{id:key,class: 'chatbtn list-group-item bg-dark text-white text-left',text:receiver})
        );
        //2. add badge
        $('#'+key).append($('<span>',{id:'badge'+receiver,class:'badge badge-danger float-right',text:'New',style:'display:none'}));

        //3. add friend's name and id to group creation modal list
        if(!receiver.includes('_and_')){

            r.table('groups').get(key).run(conn,function(err,result) {
                if (err) throw err;
                console.log(result.groupmember);
                result.groupmember.forEach(function (i) {
                    if (i !== userid){
                        $('#modal_list').append(
                            $('<button>',{id:'modal'+ i,class:"create-group-list list-group-item list-group-item-action border",text:receiver})
                        )
                    }
                });
            });
        }
    }

    /** init user status **/
    function init_user_status() {
            return new Promise(function (resolve) {
                r.table('profiles').getAll(useremail, {index: 'email'}).run(conn, function (err, cursor) {
                    if (err) throw err;
                    cursor.each(function (err, result) {
                        if (err) throw err;
                        if (result !== null) {
                            username = result.username;
                            userid = result.id;
                            $('.loginname').text(username);
                            console.log("1. get basic status, user: " + userid + " name: " + username);

                            var old_array = Object.keys(result.group);// old groups list in profile
                            console.log(old_array);
                            resolve(old_array);
                        } else {
                            console.log("user not existed!");
                            resolve(['null']); //?
                        }
                    })
                });
            });
    }

    /** init new friend/groups **/
    function init_update_groups(old_array){
        return new Promise(function (resolve) {
            r.table('groups').filter(function(doc){
                return doc('groupmember').contains(userid);// multiple filter results
            }).run(conn,function(err,cursor){
                if (err) throw err;
                cursor.toArray(function (err, result) {
                    console.log("2. get all groups contains the user as member");
                    resolve (update_groups_helper(old_array,result));
                })
            })
        });
    }

    function init_update_profile(new_array){
        return new Promise(function (resolve) {
            // resolve(value) equals return, will stop the process of current code
            // use [].push to make sure forEach has finished completely
            var Promise = [];
            new_array.forEach(function(row){ //forEach is blocking, sync
                Promise.push(
                    r.table('profiles').get(userid).update({
                        group:r.row("group").merge(
                            r.object(row.newid,{ // r.object (A,B) -> {A:B}
                                receiver:row.newreceiver,
                                hasread:0 // init hasread
                            })
                        )
                    }).run(conn,function(err,result){
                        if (err) throw err;
                        console.log("profile update working");
                    })
                );
            });
            // .apply() make sure $.when() can take an array instead of
            // a promise which is used to be the expected parameter for
            // $.when()
            $.when.apply($,Promise).done(function(){
                resolve("3. update any new friend/groups to the user profiles")
            })
        });
    }

    /** missing badge of messages from each group */
    function init_messages_badge(key,item){ // 'key': group id ; 'item' : each group instance
        r.table('messages').getAll(key,{index:'group_id'}).count().run(conn,function(err,result){
            if (err) throw err;
            // r.count() returns a value
            if(result !== item.hasread){
                $('#badge' + item.receiver).text(result-item.hasread).show();
            }
        })

    }
    /** CHANGEFEED
     *  set the changefeed to listen new coming message from each (new or old) group */
    function message_changeFeed(key){ // 'key' : group id
        var currentgroupid;
        var currentgroup;
        var currentsender;

        r.table('messages').getAll(key,{index:'group_id'}).changes().run(conn,function(err,cursor) {
            if (err) throw err;

            //cursor.each returns the latest changefeed
            cursor.each(function(err,row) {
                if (err) throw err;
                currentgroupid = row.new_val.group_id;
                currentsender = row.new_val.message.sender;
                currentgroup = row.new_val.groupchat;

                // change happens on the other rooms, show the missing message badge:
                if (currentgroupid !== roomid){
                    r.table('messages').getAll(currentgroupid,{index:'group_id'}).count().sub(
                        r.table('profiles').get(userid)('group')(currentgroupid)('hasread')
                    ).run(conn,function(err,result) {
                        if (err) throw err;
                        $('#badge'+currentgroup).text(result).show();
                    });
                }
                // change happens in the current room, show the message and update hasread
                else{
                    $('#messages').append(
                        $('<li>',{text: row.new_val.message.content}).append(
                            $('<span>',{class: 'float-right',text: currentsender})
                        )
                    );
                    r.table('profiles').get(userid).update(function(row){
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

    /** listen to new friend/group creation */
    function group_changeFeed(){
        r.table('groups').filter(function(doc){return doc('groupmember').contains(userid)}).changes()
            .run(conn,function(err,cursor){ // cannot use r.row for nested queries
                if (err) throw err;
                cursor.each(function(err,row) {
                    if (err) throw err;
                    console.log("group change listener working");
                    // similar steps as adding new friend/groups in initialisation
                    var feed = update_groups_helper([],[row.new_val]);
                    init_update_profile(feed).then(function(){// promise.then(handler)
                        console.log("init_update_profile promise working");
                        friendList_helper(feed[0].newid,feed[0].newreceiver);
                        message_changeFeed(feed[0].newid);
                    });
                })
            });

    }

    /** START APP */
    async function start(){
        // 1. initialisation
        const init_old_array = await init_user_status();
        if(init_old_array[0] !== 'null'){
            const init_new_array = await init_update_groups(init_old_array);
            console.log(await init_update_profile(init_new_array));

            var item;
            r.table('profiles').get(userid).run(conn, function (err, result) { // result: object
                if (err) throw err;

                for (var key in result.group) {//for-loop can handle with []
                    item = result.group[key];
                    // 2. show friend list and missing badge
                    friendList_helper(key, item.receiver);
                    init_messages_badge(key,item);

                    // 3. set changefeed to new messages coming
                    message_changeFeed(key);
                }
                // 4. set changefeed to new group created by others
                group_changeFeed();
            });
        }
        else{
            $('.page3').show();
        }
    };

    /** login
     *  get the user's email and redirect existed user to the chat page
     *  !! The authentication process is ignored here*/

    $('.page1').submit(function(e){
        e.preventDefault();
        var temp  = $('.email').val();
        r.table('profiles').getAll(temp,{index:'email'}).run(conn,function(err,cursor){
            if (err) throw err;
            if(cursor._responses.length === 0){
                console.log("User not found, try again or register");
                $('#testalert').show();
            }
            else{
                cursor.each(function (err, result) {
                    $('.not_found').hide();
                    $('.hidden_input').val(temp);
                    $('.hidden_form').submit();
                });
            }

        });
    });

    // register


    /** Friend search and invitation:
     *  1. search friends who already in the database with their email
     *  2. add new friend into list
     *  3. set the changefeed to receiver
     * */
    $('#addBtn').on('click',function(e){
       e.preventDefault();
       var friendemail = $('#add').val();// get the friend's email
        console.log("friend email: " + friendemail);
       r.table('profiles').getAll(friendemail,{index:'email'}).run(conn,function(err,cursor) {
           if (err) throw err;
           // check if friend exist
           if(cursor._responses.length === 0){
               $('.nonexiste_alert').show();
           }
           else{
               cursor.each(function(err, result) {
                   // once friend is added to groups, changefeed for groups will be fired
                   r.table('groups').insert({
                       groupname: username+"_and_"+result.username,
                       groupmember: [userid,result.id],
                       timestamp: new Date()
                   }).run(conn,function(err,result){
                       if (err) throw err;
                       console.log("You have added a new friend, the group id is: " + result.generated_keys[0]);
                   })
               })
           }
       });

       $('#add').val('');//clear input field
    });

    /** Chat
     *  1. get the chat_to name text
     *  2. empty messages area and hide the badge
     *  3. get the current group id
     *  4. retrieve all messages history
     *  5. reset unread to 0 */

    // update missing badge when user 'click' the chat button
    function update_messages_badge(){
        $('#badge'+chat_to).hide();
        return new Promise(function (resolve) {
            r.table('profiles').get(userid).update(function(row){
                return {
                    group:row('group').merge(
                        r.object(roomid,{
                            hasread:r.table('messages').getAll(roomid,{index:'group_id'}).count() // set hasread to total number
                        })
                    )}
                    },{nonAtomic:true}).run(conn,function(err,result) {
                if (err) throw err;
                console.log(result);
                resolve("you enter a chat group, set hasread to the total number")
            });
        })
    }

    // (Event delegation allows us to attach a single event listener, to a parent element, that will fire for all descendants
    // matching a selector, whether those descendants exist now or are added in the future) */
    $('#clients').on('click','.chatbtn',function(e){
        e.preventDefault();
        $('.defaultarea').hide();
        $('.chatarea').show();

        if(roomid !== $(this).attr('id')){
            roomid = $(this).attr('id');
            $('.chatarea').find('h5').empty();
            $('#messages').empty();

            // get text node that belong to this <button> DOM
            var temp = $(this).contents().filter(function () {
                return this.nodeType == 3;
            });

            chat_to = temp.text();
            $('.chatarea').prepend($('<h5>').text('Talk to: '+ chat_to));

            // update missing badge, retrieve all message history
            update_messages_badge().then(function (result) {
                console.log(result);
                r.table('messages').getAll(roomid,{index:'group_id'}).run(conn,function(err,cursor) {
                    if (err) throw err;
                    cursor.each(function(err, msg) {
                        if (err) throw err;
                        $('#messages').append(
                            $('<li>',{text: msg.message.content}).append(
                                $('<span>',{class: 'float-right',text: msg.message.sender})
                            )
                        );
                    });
                    window.scrollTo(0, document.body.scrollHeight);
                });
            });
        }
    });

    /** Create new group
     *  1. select friend on the modal (only friend name will shown)**/
    $('#createBtn').on('click',function (e) {
        e.preventDefault();
        var group_name = username+'_and_';
        var group_member = [userid];
        var headcount = 0;

        /** combine selected name and their id*/
        $( ".create-group-list" ).each(function( index ) {
             if($(this).hasClass('active')){
                 group_name += $( this ).text() + '_and_';
                 group_member.push($( this ).attr('id').substring(5));
             }
             headcount++;
        });

        console.log(headcount);
        if(headcount >= 2){
            /** empty markers and hide the modal */
            group_name = group_name.substring(0, group_name.length - 5); // remove the last '_and_'
            console.log(group_name + " " + group_member);
            $('#exampleModal').modal('hide');
            $( ".create-group-list" ).each(function( index ) {
                $( this ).removeClass('active');
            });

            /** add the new created group */
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
        // peer-to-peer or group chat
        var groupchat = chat_to;
        if (groupchat.includes("_and_")){
            groupchat += "_and_" + username;
        }
        r.table('messages').insert({
            group_id:roomid,groupchat:groupchat,message:{content:$('#m').val(),sender:username},sender_id:userid,timestamp:new Date()
        }).run(conn,function(err,result){
            if (err) throw err;
        });
        $('#m').val('');//clear input field
    });

});
