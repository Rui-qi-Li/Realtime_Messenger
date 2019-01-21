var express = require('express');
var router = express.Router();


/* GET users listing. */
// root url : "/users"
router.get('/', function(req, res, next) {
    var cookie = req.cookies["useremail"];
    if (cookie == null ){
        res.redirect("/login");
    }
    else{
        console.log(cookie);
        res.clearCookie("useremail",{httpOnly: true});
        res.render('index',cookie);
    }
});
router.get('/login', function(req, res, next) {
    res.render('login');
});
router.post('/', function(req, res, next) {
    console.log(req.body);
    res.cookie("useremail",req.body,{maxAge: 900000, httpOnly: true});
    res.redirect("/");
});
module.exports = function(io){
    /** socket.io */
    io.on('connection',function(socket){
        //count sockets
        console.log(' %s sockets connected, id:', io.engine.clientsCount,socket.id);
        //get list of connected clients in a room - 'room'
        socket.on('chatlist',function(loginname){
            socket.join('room');
            io.nsps['/'].adapter.rooms['room'].sockets[socket.id] = loginname;
            console.log(io.nsps['/'].adapter.rooms['room']);
            io.emit('connected client',Object.values(io.nsps['/'].adapter.rooms['room'].sockets));
        });

        socket.on('disconnect', function() {
            // leave ask for 2 args
            socket.leave('room',function(err){if (err) throw err});
            console.log("disconnect: ", socket.id);
        });

    });//socket end


    return router;
};
// module.exports = router;
