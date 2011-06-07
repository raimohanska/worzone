var http = require('http'),
    io = require('socket.io'),
    StaticContentServer = require('./staticcontentserver').StaticContentServer

var staticContentServer = new StaticContentServer()
console.log(staticContentServer.requestHandler)
var server = http.createServer(staticContentServer.requestHandler)
server.listen(8080)

var socket = io.listen(server); 
socket.on('connection', function(client){ 
  console.log("client connected")
  client.on('message', function(message){ 
    console.log("Received " + message + " from " + client)
    socket.broadcast(message, [client]) 
  }) 
  client.on('disconnect', function(){ console.log("client disconnected") }) 
}); 

