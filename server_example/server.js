// Load required modules
var http    = require("http");              // http server core module
var express = require("express");           // web framework external module
var serveStatic = require('serve-static');  // serve static files
var socketIo = require("socket.io");        // web socket external module
var easyrtc = require("../");               // EasyRTC external module

function getCmdArg(cmdKey, defaultVal) {
//Object.keys(process.env).forEach(key => console.log(key));
    //return process.env["npm_config_" + cmdKey] || defaultVal;
return defaultVal;
}

/* To modify from command line, 
   append a -- followed by  "--name=value" to the command, i.e.:
   node server.js -- --port=8080
   (npm >= 2.0.0 only)
*/
var options = {
    port: getCmdArg("port", 9000),
    privateKey:  // File path to HTTPS private key
        getCmdArg("privateKey", false),
    certificate: // File path to HTTPS public cert
        getCmdArg("certificate", false)
};

var httpOptions = {};

if (options.privateKey) {
    http = require("https");
    httpOptions = { key: options.privateKey, cert: options.certificate };
}
else {
    console.warn("Warning: Starting EasyRTC Server WITHOUT HTTPS encryption. Be sure you're behind a secure proxy if on production or risk leaking client data.");
}

// Set process name
process.title = "node-easyrtc";

// Setup and configure Express http server. Expect a subfolder called "static" to be the web root.
var app = express();
app.use(serveStatic('static', {'index': ['index.html']}));

// Start Express http server on port 8080
var webServer = http.createServer(app, httpOptions);

// Start Socket.io so it attaches itself to Express server
var socketServer = socketIo.listen(webServer, {"log level":1});

easyrtc.setOption("logLevel", "debug");

// Overriding the default easyrtcAuth listener, only so we can directly access its callback
easyrtc.events.on("easyrtcAuth", function(socket, easyrtcid, msg, socketCallback, callback) {
    easyrtc.events.defaultListeners.easyrtcAuth(socket, easyrtcid, msg, socketCallback, function(err, connectionObj){
        if (err || !msg.msgData || !msg.msgData.credential || !connectionObj) {
            callback(err, connectionObj);
            return;
        }

        connectionObj.setField("credential", msg.msgData.credential, {"isShared":false});

        console.log("["+easyrtcid+"] Credential saved!", connectionObj.getFieldValueSync("credential"));

        callback(err, connectionObj);
    });
});

// To test, lets print the credential to the console for every room join!
easyrtc.events.on("roomJoin", function(connectionObj, roomName, roomParameter, callback) {
    console.log("["+connectionObj.getEasyrtcid()+"] Credential retrieved!", connectionObj.getFieldValueSync("credential"));
    easyrtc.events.defaultListeners.roomJoin(connectionObj, roomName, roomParameter, callback);
});

// Start EasyRTC server
var rtc = easyrtc.listen(app, socketServer, null, function(err, rtcRef) {
    console.log("Initiated");

    rtcRef.events.on("roomCreate", function(appObj, creatorConnectionObj, roomName, roomOptions, callback) {
        console.log("roomCreate fired! Trying to create: " + roomName);

        appObj.events.defaultListeners.roomCreate(appObj, creatorConnectionObj, roomName, roomOptions, callback);
    });
});

//listen on port (default is 8080)
webServer.listen(options.port, function () {
    var protocol = (options.privateKey ? 'https' : 'http');
    console.log(
        'listening on ' + protocol + '://localhost:' + options.port);
});
