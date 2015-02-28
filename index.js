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
  port = 80;
}




// Whiteboards (unique ID mapped to an object containing whiteboard metadata, i.e. name, and an array of whiteboard data)
var whiteboards = {},
		rooms = {};

// open DB connection
var dbconn, table;
r.connect({host: '127.0.0.1', port: 28015}, function(err, conn) {
	if (err) throw err;
	dbconn = conn;
	table = r.db('test').table('whiteboard');
	console.log('Connected to RethinkDB.');


	io.on('connection', function(socket) {

		// send a list of whiteboards to the client
		console.log('New client connected, sending available whiteboards.');
		table.pluck('id', 'name').run(dbconn, function(err, cursor) {
			cursor.toArray(function(err, whiteboards) {
				debugger;
				console.log('Sent whiteboards: ', whiteboards.length);
				socket.emit('hello', whiteboards);
			});
		});

		// Client is asking to join a particular whiteboard
		socket.on('joinWhiteboard', function(id) {
			table.get(id).run(dbconn, function(err, result){
				if(err) throw err;
				console.log('Client wants to join whiteboard ' + id + '.');
				socket.join(id); // join the client to the room for the specified whiteboard
				socket.emit('updateWhiteboard', result); // sends the whiteboard object
			});
		});

		// Client wants to create a new whiteboard
		socket.on('createWhiteboard', function(name) {
			table.insert({id: uuid.v4(), name: name}).run(dbconn, function(err, result) {
				if(err) throw err;
				socket.emit('whiteboardCreated', result);
			});
		});

		// Client is sending new name for a whiteboard
		socket.on('changeWhiteboardName', function(d) { // 'd' holds two properties, 'id' and 'name'
			table.get(d.id).update({name: d.name}, {return_vals: true}).run(dbconn, function(err, result){
				if(err) throw err;
				console.log('Whiteboard (id: ' + d.id + ') data updated.');
				socket.to(d.id).broadcast.emit('whiteboardNameChanged', result.new_val);
			});
		});

		socket.on('addElements', function(d) { // 'd' holds two properties: 'id' and 'elements'
			if(!d.id || !d.elements) return;
			// emit to clients...
			socket.to(d.id).broadcast.emit('elementsAdded', d);
			// ... then save to DB
			table
				.get(d.id)
				.update({data: r.row('data')
				.default([])
				.setUnion(d.elements)})
				.run(dbconn, function(err, result){
					if(err) throw err;
					console.log('Element added: ', d.elements, result);
				});
		});

		socket.on('removeElements', function(d) { // 'd' holds two properties: 'id' and 'elements'
			if(!d.id || !d.elements) return;
			// emit to clients...
			socket.to(d.id).broadcast.emit('elementsRemoved', d);
			// ... then save to DB
			table.get(d.id).update({data: r.row('data')
						.default([]).difference(d.elements)}).run(dbconn, function(err, result){
				console.log('Element removed: ', d.element, result);
			});
		});
	});
});

/*
 // Whiteboards (unique ID mapped to an object containing whiteboard metadata, i.e. name, and an array of whiteboard data)
 var whiteboards = {},
 rooms = {};

 //TODO: get whiteboards from a database
 // Setup some whiteboards
 _.times(5, function(n) {
 createWhiteboard('wb' + (n + 1));
 });

 // Creates new whiteboard
 function createWhiteboard(name) {
 var newId = uuid.v4();
 whiteboards[ newId ] = {
 id: newId,
 name: name,
 data: []
 };
 }
 */

//TODO: I'm currently just sending the whole whiteboard object over and over again. There are several things to improve.
// 1: just send diffs to the right rooms. I'll need some logic to handle ordering if I do this
// 2: Update Whiteboard Name event for clients as well?
//io.on('connection', function(socket) {
//	console.log('New client connected, sending available whiteboards.');
//
//	r.table('whiteboard').pluck('id', 'name').run(dbconn, function(err, cursor) {
//		cursor.toArray(function(err, whiteboards) {
//			console.log('Sent: ', whiteboards.length);
//			socket.emit('hello', whiteboards);
//		}); //sends an array of objects defining 'id' and 'name' of available whiteboards (don't send the data right now)
////		cursor.each(function(err, row){
////			if(err) throw err;
////			socket.emit('hello')
////		});
////		socket.emit('hello', _.map(whiteboards, function(obj) {
////		return _.pick(obj, 'id', 'name');
////	}));
//	});
//
//
//	// Client is asking to join a particular whiteboard
//	socket.on('joinWhiteboard', function(id) {
//		console.log('Client wants to join whiteboard ' + id + '.')
//		socket.join(id); //join the client to the room for the specified whiteboard
//		socket.emit('updateWhiteboard', whiteboards[id]); //sends the whiteboard object
//	});
//
//	// Client is sending new data for a whiteboard
//	socket.on('updateWhiteboardData', function(d) { // 'd' holds two properties: 'id' and 'data'
//		// Update the whiteboard specified by 'id'
//		whiteboards[d.id].data = d.data;
//		console.log('Whiteboard (id: ' + d.id + ') data updated.');
//		// Send the updated whiteboard to all other clients using the same whiteboard
//		socket.to(d.id).broadcast.emit('updateWhiteboard', whiteboards[d.id]);
//	});
//
//	// Client is sending new name for a whiteboard
//	socket.on('updateWhiteboardName', function(d) { // 'd' holds two properties, 'id' and 'name'
//		// Update the whiteboard specified by 'id'
//		whiteboards[d.id].name = d.name;
//		console.log('Whiteboard (id: ' + d.id + ') name updated.');
//		// Send the updated whiteboard to all other clients using the same whiteboard
//		socket.to(id).broadcast.emit('updateWhiteboard', whiteboards[d.id]);
//	})
//
//});

http.listen(port, function(){
  console.log('Listening on port ' + port);
});
