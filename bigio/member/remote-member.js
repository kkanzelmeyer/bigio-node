/*
 * Copyright (c) 2014, Archarithms Inc.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 * list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 * this list of conditions and the following disclaimer in the documentation
 * and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
 * ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 * The views and conclusions contained in the software and documentation are those
 * of the authors and should not be interpreted as representing official policies,
 * either expressed or implied, of the FreeBSD Project.
 */

var winston = require('winston')
var logger = new (winston.Logger)({
    transports: [
        new (winston.transports.Console)({ level: 'debug' })
        //new (winston.transports.File)({ filename: 'somefile.log' })
    ]
});

var memberHolder = require('./member-holder');
var MemberStatus = require('./member-status');
var parameters = require('../parameters');
var gossipCodec = require('../codec/gossip-codec');
var envelopeCodec = require('../codec/envelope-codec');

/**
 * A TCP implementation of a remote BigIO cluster member.
 *
 * @author Andy Trimble
 */
var RemoteMember = function(ip, gossipPort, dataPort, useTCP) {

    this.ip = ip;
    this.dataPort = dataPort;
    this.gossipPort = gossipPort;
    this.useTCP = useTCP;

    var MAX_RETRY_COUNT_PROPERTY = "io.bigio.remote.maxRetry";
    var RETRY_INTERVAL_PROPERTY = "io.bigio.remote.retryInterval";
    var CONNECTION_TIMEOUT_PROPERTY = "io.bigio.remote.connectionTimeout";
    var DEFAULT_MAX_RETRY_COUNT = 3;
    var DEFAULT_RETRY_INTERVAL = 2000;
    var DEFAULT_CONNECTION_TIMEOUT = 5000;

    var SSL_PROPERTY = "io.bigio.ssl";
    var DEFAULT_SSL = false;
    var SSL_SELFSIGNED_PROPERTY = "io.bigio.ssl.selfSigned";
    var DEFAULT_SELFSIGNED = true;
    var SSL_CERTCHAINFILE_PROPERTY = "io.bigio.ssl.certChainFile";
    var DEFAULT_CERTCHAINFILE = "conf/certChain.pem";
    var SSL_KEYFILE_PROPERTY = "io.bigio.ssl.keyFile";
    var DEFAULT_KEYFILE = "conf/keyfile.pem";
    var SSL_KEYPASSWORD_PROPERTY = "io.bigio.ssl.keyPassword";

    var maxRetry = parameters.getInstance().getProperty(MAX_RETRY_COUNT_PROPERTY, DEFAULT_MAX_RETRY_COUNT);
    var retryInterval = parameters.getInstance().getProperty(RETRY_INTERVAL_PROPERTY, DEFAULT_RETRY_INTERVAL);
    var timeout = parameters.getInstance().getProperty(CONNECTION_TIMEOUT_PROPERTY, DEFAULT_CONNECTION_TIMEOUT);

    var cipher = undefined;
    var symmetricCipher = undefined;
    var secretKey = undefined;
    var key = undefined;

    var gossipSocket;
    var dataClient;

    var useSSL = parameters.getInstance().getProperty(SSL_PROPERTY, DEFAULT_SSL);
    var useSelfSigned = parameters.getInstance().getProperty(SSL_SELFSIGNED_PROPERTY, DEFAULT_SELFSIGNED);
    var certChainFile = parameters.getInstance().getProperty(SSL_CERTCHAINFILE_PROPERTY, DEFAULT_CERTCHAINFILE);
    var keyFile = parameters.getInstance().getProperty(SSL_KEYFILE_PROPERTY, DEFAULT_KEYFILE);
    var keyPassword = parameters.getInstance().getProperty(SSL_KEYPASSWORD_PROPERTY);

    var gossipConnected = false;
    var dataConnected = false;
};

RemoteMember.prototype.tags = {};
RemoteMember.prototype.sequence = 0;
RemoteMember.prototype.status = MemberStatus.Unknown;
RemoteMember.prototype.ip = '';
RemoteMember.prototype.dataPort = -1;
RemoteMember.prototype.gossipPort = -1;
RemoteMember.prototype.useTCP = true;
RemoteMember.prototype.publicKey = undefined;

RemoteMember.prototype.toString = function() {
    var ret = "\nMember ";
    ret += this.ip;
    ret += ":";
    ret += this.gossipPort;
    ret += ":";
    ret += this.dataPort;
    if (this.status == MemberStatus.Alive || this.status == MemberStatus.Unknown) {
        ret += "\n    is ";
    } else {
        ret += "\n    has ";
    }
    ret += this.status;

    ret += "\n    with properties";
    for (var key in this.tags) {
        ret += "\n        ";
        ret += key;
        ret += " -> ";
        ret += this.tags[key];
    }

    ret += "\n";

    return ret;
};

RemoteMember.prototype.equals = function(obj) {
    var them = obj;

    return them.ip != undefined
        && them.ip == this.ip
        && them.gossipPort == this.gossipPort
        && them.dataPort == this.dataPort;
};

RemoteMember.prototype.initialize = function() {
    if (this.useSSL) {

    } else if (this.useTCP) {
        var net = require('net');

        var self = this;

        this.gossipSocket = new net.Socket();
        this.gossipSocket.connect(this.gossipPort, this.ip, function () {
            logger.debug('TCP gossip socket connected with remote member ' + self.ip + ':' + self.gossipPort);
            self.gossipConnected = true;
        });
        this.gossipSocket.on('end', function () {
            logger.debug('TCP gossip socket disconnected');
        });
        this.gossipSocket.on('error', function (err) {
            self.gossipSocket.destroy();
            self.gossipConnected = false;
        });

        this.dataClient = net.connect({port: this.dataPort, host: this.ip}, function() {
            logger.debug('TCP data socket connected with remote member ' + self.ip + ':' + self.dataPort);
            self.dataConnected = true;
        });
        this.dataClient.setNoDelay(true);
        this.dataClient.on('end', function() {
            logger.debug('TCP data socket disconnected');
        });
        this.dataClient.on('error', function(err) {
            self.dataClient.destroy();
            self.dataConnected = false;
            self.status = MemberStatus.Left;
            memberHolder.updateMemberStatus(self);
        });
    } else {
        var dgram = require('dgram');

        var self = this;

        this.gossipSocket = dgram.createSocket('udp4');
        this.gossipSocket.on('listening', function () {
            logger.debug('UDP gossip socket connected with remote member ' + self.ip + ':' + self.gossipPort);
            self.gossipConnected = true;
        });
        this.gossipSocket.on('end', function () {
            logger.debug('UDP gossip server disconnected');
        });
        this.gossipSocket.on('error', function (err) {
            self.gossipSocket().destroy();
            self.gossipConnected = false;
        });
        this.gossipSocket.bind(this.gossipPort, this.ip);

        this.dataClient = dgram.createSocket('udp4');
        this.dataClient.on('listening', function () {
            logger.debug('UDP data socket connected with remote member ' + self.ip + ':' + self.dataPort);
            self.dataConnected = true;
        });
        this.dataClient.on('end', function () {
            logger.debug('UDP data server disconnected');
        });
        this.dataClient.on('error', function (err) {
            self.dataClient.destroy();
            self.dataConnected = false;
            self.status = MemberStatus.Left;
            memberHolder.updateMemberStatus(self);
        });
        this.dataClient.bind(this.dataPort, this.ip);
    }

    if(this.publicKey != undefined) {

    }
};

RemoteMember.prototype.send = function(message) {
    var bytes = envelopeCodec.encode(message);
    this.dataClient.write(bytes);
};

RemoteMember.prototype.gossip = function(message) {
    if (this.gossipConnected) {
        var bytes = gossipCodec.encode(message);
        this.gossipSocket.write(bytes);
    }
};

RemoteMember.prototype.shutdown = function(cb) {
    logger.debug("Closed remote sockets.");
    if (this.useTCP) {
        this.gossipSocket.end();
        this.dataClient.end();
    } else {
        this.gossipSocket.close();
        this.dataClient.close();
    }

    typeof cb === 'function' && cb();
};

module.exports = RemoteMember;
