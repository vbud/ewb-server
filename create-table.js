'use strict';

var r = require('rethinkdb');

// open DB connection
r.connect({host: '127.0.0.1', port: 28015}, function(err, conn) {
	r.db('test').tableCreate('whiteboard').run(conn, function(err, result) {
		if(err) console.log(err);
		else console.log(result);
		console.log('closing connection...');
		conn.close();
	});
});