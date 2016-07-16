var request = require('request')
var geocoder = require('geocoder');

var Logins = require('./logins')

var fs = require("fs");

var EventEmitter = require('events').EventEmitter

var api_url = 'https://pgorelease.nianticlabs.com/plfe/rpc'
var login_url = 'https://sso.pokemon.com/sso/login?service=https%3A%2F%2Fsso.pokemon.com%2Fsso%2Foauth2.0%2FcallbackAuthorize'
var login_oauth = 'https://sso.pokemon.com/sso/oauth2.0/accessToken'

var ProtoBuf = require("protobufjs");
var builder = ProtoBuf.loadProtoFile('pokemon.proto')
if (builder == null) {
    builder = ProtoBuf.loadProtoFile(__dirname + '/pokemon.proto')
}
if (builder == null) {
    builder = ProtoBuf.loadProtoFile('./node_modules/pokemon-go-node-api/pokemon.proto')
}
var pokemonProto = builder.build()
var RequestEnvelop = pokemonProto.RequestEnvelop
var ResponseEnvelop = pokemonProto.ResponseEnvelop

function Pokeio() {
    var self = this
    var events;
    self.events = new EventEmitter()
    self.j = request.jar()
    self.request = request.defaults({jar:self.j})

    self.playerInfo = {
        'accessToken'       : '',
        'debug'             : true,
        'latitude'          : 0,
        'longitude'         : 0,
        'altitude'          : 0,
        'apiEndpoint'      : ''
    }

    self.DebugPrint = function(str) {
        if(self.playerInfo.debug==true) {
            //self.events.emit('debug',str)
            console.log(str)
        }
    }

    function api_req(api_endpoint, access_token, req, callback) {
        // Auth
        var auth = new RequestEnvelop.AuthInfo({
            "provider"  : "ptc",
            "token"     : new RequestEnvelop.AuthInfo.JWT(access_token,59)
        })

        var f_req = new RequestEnvelop({
            'unknown1'  : 2,
            'rpc_id'    : 8145806132888207460,

            'requests'  : req,

            'latitude'  : self.playerInfo.latitude,
            'longitude' : self.playerInfo.longitude,
            'altitude'  : self.playerInfo.altitude,

            'auth'      : auth,
            'unknown12' : 989
        })

        var protobuf = f_req.encode().toBuffer()

        options = {
            url: api_endpoint,
            body: protobuf,
            encoding: null,
            headers: {
                'User-Agent': 'Niantic App'
            }
        };

        self.request.post(options, function(e, r, body) {

            if(r==undefined || r.body==undefined) {
                console.log("[!] RPC Server offline")
                return
            }

            try {
                var f_ret = ResponseEnvelop.decode(r.body)
            } catch (e) {
                if (e.decoded) { // Truncated
                    console.log(e)
                    f_ret = e.decoded; // Decoded message with missing required fields
                }
            }
            callback(f_ret)
        });

    }

    self.GetAccessToken = function(user,pass,callback) {
        self.DebugPrint("[i] Logging with user: " + user)
        Logins.PokemonClub(user,pass,self, function(token) {
            self.playerInfo.accessToken = token
            callback(token)
        });
    }


    self.GetApiEndpoint = function(callback) {
        var req = []
        req.push(
            new RequestEnvelop.Requests(2),
            new RequestEnvelop.Requests(126),
            new RequestEnvelop.Requests(4),
            new RequestEnvelop.Requests(129),
            new RequestEnvelop.Requests(5, new RequestEnvelop.Unknown3("4a2e9bc330dae60e7b74fc85b98868ab4700802e"))
        )

        api_req(api_url, self.playerInfo.accessToken, req, function(f_ret) {
            var api_endpoint = 'https://' + f_ret.api_url + '/rpc'
            self.playerInfo.apiEndpoint = api_endpoint
            self.DebugPrint("[i] Received API Endpoint: " + api_endpoint)
            callback(api_endpoint)
        })
    }

    self.GetProfile = function(callback) {
        var req = new RequestEnvelop.Requests(2)
        api_req(self.playerInfo.apiEndpoint, self.playerInfo.accessToken, req, function(f_ret) {
            if(f_ret.payload[0].profile) {
                self.DebugPrint("[i] Logged in!")
            }
            callback(f_ret.payload[0].profile)
        });
    }

    self.GetLocation = function(callback) {
        geocoder.reverseGeocode( self.playerInfo.latitude, self.playerInfo.longitude, function ( err, data ) {
            console.log("[i] lat/long/alt: " + self.playerInfo.latitude + " " + self.playerInfo.longitude + " " + self.playerInfo.altitude)
            if(data.status=="ZERO_RESULTS") {
                callback("location not found")
            }
            callback(data.results[0].formatted_address)
        });
    }
}

module.exports = new Pokeio();
module.exports.Pokeio = Pokeio;
