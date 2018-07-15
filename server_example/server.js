// Load required modules
var http    = require("http");              // http server core module
var https   = require("https");             // https server core module
var basicAuth = 
    require("express-basic-auth");          // Make P2P require shared auth secret
var socketAuth = require("socketio-auth");
var express = require("express");           // web framework external module
var serveStatic = require('serve-static');  // serve static files
var socketIo = require("socket.io");        // web socket external module
var easyrtc = require("../");               // EasyRTC external module
var fs = require("fs");                     // Node filesystem tools
var parseArgs = require('minimist');        // Parse command line args

var argv = parseArgs(process.argv.slice(2));
function getCmdArg(cmdKey, defaultVal) {
    if (argv[cmdKey]) {
        return argv[cmdKey];
    }
    return defaultVal;
}

/* 
    To modify from command line, 
    append "--name=value" to the command, i.e.:
    node server.js --port=8080 --httpPassword=blahblah
*/
var options = {
    port: getCmdArg("port", 9000),
    privateKey:  // File path to HTTPS private key
        getCmdArg("privateKey", '../privkey7.pem'),
    certificate: // File path to HTTPS public cert
        getCmdArg("certificate", '../cert7.pem'),
    httpUser: getCmdArg("httpUser", "admin"),
    httpPassword: getCmdArg("httpPassword", "IAdmitImInsecure"),
};

var createServer = function (app) {
    return http.createServer(app);
}

if (options.privateKey) {
    createServer = function (app) {
        return https.createServer({
            key: fs.readFileSync(options.privateKey), 
            cert: fs.readFileSync(options.certificate)
        }, app);
    }
}
else {
    console.warn("Warning: Starting EasyRTC Server WITHOUT HTTPS encryption. Be sure you're behind a secure proxy if on production or risk leaking client data.");
}

// Set process name
process.title = "node-easyrtc";

// Setup and configure Express http server. Expect a subfolder called "static" to be the web root.
var app = express();
app.use(serveStatic('static', {'index': ['index.html']}));

if (options.httpPassword === "IAdmitImInsecure") {
    console.warn("Warning: Using DEFAULT PUBLICLY KNOWN credentials for Basic HTTP Authentication");
}
// Add Basic HTTP Authentication for minimal security
var authUsers = {};
authUsers[options.httpUser] = options.httpPassword;
app.use(basicAuth({
    users: authUsers,
    challenge: true,
}));

// Create an htt(p/ps) server
var webServer = createServer(app);

// Start Socket.io so it attaches itself to Express server
var socketServer = socketIo.listen(webServer, {"log level":1});
socketAuth(socketServer, {
    authenticate: function (socket, data, callback) {
        if (data.username === options.httpUser && 
            data.password === options.httpPassword) {
            callback(null, true);
        }
        callback(new Error("Wrong httpUser or httpPassword"));
    }
});

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
