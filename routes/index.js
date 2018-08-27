// A Router instance is a complete middleware
// It creates a router as a module, loads a middleware function in it, defines some routes, and mounts the router module
// on a path in the main app.
var express = require('express');
// var Gun = require('gun');
// var gun = Gun();
var router = express.Router();

/* GET home page. */
router.get('/', function(req, res) {
  res.render('index', { title: 'Profile' });
});
router.post('/',function(req, res){
  // var person = gun.get(req.body.name).put({name:req.body.name,email:req.body.email});
  // gun.get('student').set(person);
  // gun.get('student').once(function(node){
  //     console.log('Student DB existed', node);
  // });
  //
  // gun.get('student').map().once(function(node,id){
  //     console.log(node);
  // });
  res.json();
});

module.exports = router;
