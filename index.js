'use strict';

var http = require('http').Server();
var io = require('socket.io')(http);
var _ = require('lodash');
var uuid = require('node-uuid');
var r = require('rethinkdb');

// Set default port to 3000
var port = 3000;



// Set default node environment to development
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

if( process.env.NODE_ENV === 'production') {
  port = 9000;
}



var dbconn, table;

// get the whiteboards from the db
var getWhiteboards = function(callback) {
	table
		.pluck('id', 'name')
		.run(dbconn, function(err, cursor) {
			cursor.toArray(function(err, whiteboards) {
				callback(whiteboards);
			});
		});
}

var sendWhiteboards = function(socket, type, callback) {
	getWhiteboards( function(whiteboards) {
		console.log('Sending ' + whiteboards.length + ' whiteboards.');
		// send the whiteboard list to all connected clients
		if(type === 'reply')
			socket.emit('updateWhiteboardList', whiteboards);
		else if(type === 'broadcast')
			io.emit('updateWhiteboardList', whiteboards);
		if(typeof callback === 'function') callback();
	});
}

// open DB connection
r.connect({host: '127.0.0.1', port: 28015}, function(err, conn) {
	if (err) throw err;
	dbconn = conn;
	table = r.db('test').table('whiteboard');
	console.log('Connected to RethinkDB.');



	// setup listeners for when a client connects
	io.on('connection', function(socket) {

		// say hello and send the whiteboards to the client
		socket.emit('hello');
		console.log('New client connected, saying hello.');
		sendWhiteboards(socket, 'reply');

		// Client is asking to join a particular whiteboard
		socket.on('joinWhiteboard', function(id) {
			table
				.get(id)
				.run(dbconn, function(err, result){
					if(err) throw err;
					console.log('Client wants to join whiteboard ' + id + '.');
					socket.join(id); // join the client to the room for the specified whiteboard
					console.log('Replying with whiteboard data.');
					socket.emit('updateWhiteboard', result);
				});
		});

		// Client wants to create a new whiteboard
		socket.on('createWhiteboard', function(name) {
			table
				.insert({
					id: uuid.v4(),
					name: name,
					data: []
				}, { returnChanges: true })
				.run(dbconn, function(err, result) {
					if(err) throw err;
					sendWhiteboards(socket, 'broadcast');
					console.log('Replying with whiteboard data.');
					socket.emit('updateWhiteboard', result.changes[0].new_val); // reply with the whiteboard object
				});
		});

		// Client wants to delete a whiteboard
		socket.on('deleteWhiteboard', function(id) {
			table
				.get(id)
				.delete()
				.run(dbconn, function(err, result){
					if(err) throw err;
					console.log('Whiteboard ' + id + ' deleted.');
					sendWhiteboards(socket, 'broadcast');
				});
		});		

		// Client is sending a new name (d.name) and/or new data (d.data) for a whiteboard (specified by d.id)
		socket.on('updateWhiteboard', function(d) {
			table
				.get(d.id)
				.update(_.pick(d, ['name', 'data']), {returnChanges: true})
				.run(dbconn, function(err, result){
					if(err) throw err;
					console.log('Whiteboard ' + d.id + ' ' + Object.keys(d).join(' and ') + ' properties updated.');

					io.to(d.id).emit('updateWhiteboard', result.changes[0].new_val);
				});
		});

		// More granular whiteboard data addition (instead of overwriting all the whiteboard data every time)
		// Client is adding new elements (d.elements) to a whiteboard (specified by d.id)
		socket.on('addElements', function(d) {
			if(!d.id || !d.elements) return;
			// emit to all clients joined to this whiteboard...
			io.to(d.id).emit('elementsAdded', d);
			// ... then save to DB
			table
				.get(d.id)
				.update({data: r.row('data')
						.default([])
						.setUnion(d.elements)
				})
				.run(dbconn, function(err, result){
					if(err) throw err;
					console.log(d.elements.length + ' elements added to whiteboard '  + d.id);
				});
		});

		// More granular whiteboard data removal (instead of overwriting all the whiteboard data every time)
		// Client is removing elements (d.elements) from a whiteboard (specified by d.id)
		socket.on('removeElements', function(d) {
			if(!d.id || !d.elements) return;
			// emit to all clients joined to this whiteboard...
			io.to(d.id).emit('elementsRemoved', d);
			// ... then save to DB
			table
				.get(d.id)
				.update({
					data: r.row('data')
						.default([])
						.difference(d.elements)
				})
				.run(dbconn, function(err, result){
					console.log(d.elements.length + ' elements removed from whiteboard '  + d.id);
				});
		});
	});
	
});

http.listen(port, function(){
  console.log('Listening on port ' + port);
});
