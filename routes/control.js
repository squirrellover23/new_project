var express = require('express');
var router = express.Router();
const {send_email} = require('../email_control')


/* GET users listing. */
router.get('/', function(req, res, next) {
    send_email( 'petersonwingate@gmail.com', 'test email', 'yess!!! yes yes yes!! http://localhost:3000')    

    res.send('respond with a email');
});

module.exports = router;
