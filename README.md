Checkout the [Java](https://github.com/Archarithms/bigio) or the [Python](https://github.com/Archarithms/bigio-python) versions of BigIO.

### BigIO

BigIO is a fast, distributed messaging framework for a variety of languages.
This version of BigIO runs in NodeJS, and is fully interoperable with the
Java version.

Note: BigIO is only compatible with Node versions > 0.12.x.

## Installation
Add bigio to your package.json.

```json
"dependencies": {
    "bigio" : "0.1.13"
}
```

Then type ```npm install```

## Usage

#### Basic Usage

Register a listener on a topic:

```javascript
var bigio = require('bigio');

bigio.initialize(function() {
    bigio.addListener( {
        topic: 'HelloWorld',
        listener: function(message) {
            console.log('Received a message');
            console.log(message[0]);
        }
    });
});
```

Send a message on a topic:

```javascript
var bigio = require('bigio');

bigio.initialize(function() {
    setInterval(function() {
        bigio.send( {
            topic: 'HelloWorld',
            message: { content : 'HelloWorld' }
        });
    }, 1000);
});
```

#### BigIO and JQuery

To use BigIO messages to update a web app, I'd recommend using the awesome project [socket.io](http://socket.io).
This is necessary since the BigIO messages come to the Node.js server and not the browser. To bridge this
gap, we use socket.io.

Here's an example using Express, socket.io, and JQuery:

##### index.js
```javascript
var app = require('express');
var http = require('http').Server(app);
var io = require('socket.io');
var bigio = require('bigio');
var $ = require('jquery');

http.listen(3000, function() {
    console.log('Listening on port 3000');
});

app.get('/', function(req, res) {
    res.sendFile(__dirname + '/index.html');
});

bigio.initialize(function() {
    bigio.addListener( {
        topic: 'HelloWorld',
        listener: function(message) {
            var messageStr = message[0];
            io.emit('hello_world', { 'message': messageStr });
        }
    });
});
```

##### index.html
```html
<!doctype html>
<html>
  <head>
    <title>BigIO Web App</title>
  </head>
  <script src="https://cdn.socket.io/socket.io-1.3.5.js"></script>
  <script src="http://code.jquery.com/jquery-1.11.1.js"></script>
  <script>
    var socket = io();
    socket.on('hello_world', function(msg) {
        $('#messages').append($('<li>' + msg['message'] + '</li>'));
    });
  </script>
  <body>
    <ul id="messages"></ul>
  </body>
</html>
```

#### Configuration

To override the default configuration, add a configuration object to the `initialize()` function:

```javascript
const config = {
  protocol: 'tcp',
  useMulticast: true,
  multicastGroup: '239.0.0.1',
  multicastPort: 8989,
  logLevel: 'debug',
  network: 'wlan0',
};

bigio.initialize(config, function() {
  // ...
});
```


## What's New
#### 0.1.14
- Added configuration option to specify the network

#### 0.1.13
- Fixed port reuse issue

#### 0.1.10
- Implemented encrypted messaging
- Implemented message templates
- Better logging to console
- Added unit tests
- Refactored into fewer files
- Numerous bug fixes

#### 0.1.8
- Better error handling

#### 0.1.7
- Critical bug fix

#### 0.1.6
- Bug fixes on Mac and Linux

#### 0.1.5
- Critical bug fixes

#### 0.1.4
- Interoperability with Java BigIO
