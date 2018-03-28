var TWILIO_ACCOUNT_SID = 'AC3b75b8759ce3c22dc08fcde2c9a4e3f3',
    TWILIO_AUTH_TOKEN = '73163f7b9f5ca76a056bad0a25106167',
    TWILIO_APP_SID = 'AP29e5e5d9d4e37088020f7170fe0160af',
    STRIPE_TEST_SECRET_KEY = 'sk_test_kK7jDGVqlQsCJOv0oX7sMQu2';

var express = require('express'),
    twilio = require('twilio'),
    Stripe = require('stripe');
var Parse = require('parse');

const stripe = Stripe(STRIPE_TEST_SECRET_KEY);

//Stripe.setApiKey(STRIPE_TEST_SECRET_KEY);
// Stripe.initialize(STRIPE_TEST_SECRET_KEY);

var ROLE_BASIC_ID = 'cWCxO110Mq',
    ROLE_COACH_ID = 'ri2l9nmyl3';

var setRoleToBasicIfNew = function(user, isNew) {
    if ('false' === isNew) {
        return Parse.Promise.as(); // success
    }
    var query = new Parse.Query(Parse.Role);
    return query.get(ROLE_BASIC_ID).then(function(roleBasic) {
        roleBasic.relation('users').add(user);
        console.log("saving basic role for user");
        return roleBasic.save(null ,{userMasterKey: true});
    });
}

var updateFbCache = function(user) {
    console.log("getRoles called");
    var query = new Parse.Query(Parse.Role);
    query.equalTo('users', user);
    return query.find();
}

var getRoles = function(user) {
    console.log("getRoles called");
    var query = new Parse.Query(Parse.Role);
    query.equalTo('users', user);
    return query.find();
}

var getAllCoaches = function() {
    console.log("getAllCoaches called");
    var query = new Parse.Query(Parse.Role);
    return query.get(ROLE_COACH_ID).then(function(roleCoach) {
        return roleCoach.relation('users').query().find();
    });
}

Parse.Cloud.define('afterLogin', function(request, response) {
    setRoleToBasicIfNew(request.user, request.params.isNew)
    .then(function() {
        return updateFbCache(request.user);
    }).then(function() {
        return getRoles(request.user);
    }).then(function(roles) {
        response.success(roles);
    }, function(error) {
        response.error("afterLogin error " + error.code + ": " + error.message);
    });
});

// limitation: 100 coaches max
Parse.Cloud.define('getAllCoaches', function(request, response) {
    getAllCoaches().then(function(coaches) {
        response.success(coaches);
    }, function(error) {
        response.error("getAllCoaches failed " + error.code + ": " + error.message);
    });
});

Parse.Cloud.define('getFavCoaches', function(request, response) {
    request.user.relation('favCoaches').query().find().then(function(coaches) {
        response.success(coaches);
    }, function(error) {
        response.error("getFavCoaches failed " + error.code + ": " + error.message);
    });
});


Parse.Cloud.define('addFavCoach', function(request, response) {
    if (null == request.params.id) {
        response.error("addFavCoach error: no id");
        return;
    }
    var query = new Parse.Query(Parse.User);
    query.get(request.params.id)
    .then(function(coach) {
        if (null == coach) {
            return Parse.Promise.error();
        }
        request.user.relation('favCoaches').add(coach);
        return request.user.save();
    }).then(function(object) {
        response.success();
    }, function(error) {
        response.error("addFavCoach error " + error.code + ": " + error.message);
    });
});

Parse.Cloud.define('removeFavCoach', function(request, response) {
    if (null == request.params.id) {
        response.error("removeFavCoach error: no id");
        return;
    }
    var query = new Parse.Query(Parse.User);
    query.get(request.params.id)
    .then(function(coach) {
        request.user.relation('favCoaches').remove(coach);
        return request.user.save();
    }).then(function() {
        response.success();
    }, function(error) {
        response.error("removeFavCoach error " + error.code + ": " + error.message);
    });
});

// returns a Stripe.Customer object
var createOrUpdateCustomer = function(user, token) {
    var ccId = user.get('ccId');
    if (null == ccId) {
        return Stripe.Customers.create({
            card: token
        });
    }
    else {
        return Stripe.Customers.update(ccId, {
            card: token
        });
    }
}

Parse.Cloud.define('saveCreditCard', function(request, response) {
    createOrUpdateCustomer(request.user, request.params.token)
    .then(function(customer) {
        if (null == customer) {
            return Parse.Promise.error();
        }
        request.user.set('ccId', customer.id);
        return request.user.save();
    }).then(function() {
        response.success();
    }, function(error) {
        response.error("saveCreditCard error " + error.code + ": " + error.message);
    });
});

/*
// Require and initialize the Twilio module with your credentials
var client = require('twilio');

// Send an SMS message
// "responseData" is a JavaScript object containing data received from Twilio.
// A sample response from sending an SMS message is here (click "JSON" to see how the data appears in JavaScript):
// http://www.twilio.com/docs/api/rest/sending-sms#example-1
client.sendSms({
               to:'+16515556677',// Any number Twilio can deliver to
               from: '+14506667788',// A number you bought from Twilio and can use for outbound communication
               body: 'Hello world!'
               }, function(err, responseData) {//this function is executed when a response is received from Twilio
               if (err) {
               console.log(err);
               } else {
               console.log(responseData.from);// outputs "+14506667788"
               console.log(responseData.body);// outputs "word to your mother."
               }
               }
               );

//Place a phone call, and respond with TwiML instructions from the given URL
client.makeCall({

                to:'+16515556677', // Any number Twilio can call
                from: '+14506667788', // A number you bought from Twilio and can use for outbound communication
                url: 'http://www.example.com/twiml.php' // A URL that produces an XML document (TwiML) which contains instructions for the call

                }, function(err, responseData) {

                //executed when the call has been initiated.
                console.log(responseData.from); // outputs "+14506667788"

                });
*/

// Set up a dynamic Parse webapp using Express
var app = express();
app.use(express.bodyParser());

app.get('/capability', function(request, response) {
    var capability = new twilio.Capability(
        TWILIO_ACCOUNT_SID,
        TWILIO_AUTH_TOKEN
        );
    capability.allowClientOutgoing(TWILIO_APP_SID);
    var client = request.param('client');
    if (client) {
        capability.allowClientIncoming(client);
    }
    response.type('text/plain');
    response.send(capability.generate());
});

app.post('/call', function(request, response) {
    /*
     This method routes calls from/to client
     Rules:
     1. From can be either client:name or PSTN number
     2. To value specifies target. When call is coming from PSTN, To value is ignored and call is routed to client named CLIENT
    */
    var client = new twilio.RestClient(
        TWILIO_ACCOUNT_SID,
        TWILIO_AUTH_TOKEN
        );
    var twiml = new twilio.TwimlResponse();
    // set the content type of our ultimate response
    response.type('text/xml');
    var from = request.param('From');
    var to = request.param('To');
    if (!from || !to) {
        twiml.say('Invalid request');
        response.send(twiml.toString);
        return;
    }
    var isFromClient = from.lastIndexOf('client', 0) === 0; // starts with 'client'
    callerId = '+19793832546';
    if (!isFromClient) {
        // PSTN -> client
        twiml.say('connected to LuvTomDev');
        twiml.dial({callerId: from}, function(){this.client('thomas')});
    }
    else if (to.lastIndexOf('client:', 0) == 0) { // starts with 'client:'
        // client -> client
        twiml.dial({callerId: from}, function(){this.client(to)});
    }
    else {
        // client -> PSTN
        twiml.dial(to, {callerId: callerId});
    }
    response.type('text/xml');
    response.send(twiml.toString());
});

app.post('/call_ended', function(request, response) {
    console.log("call ended");
    console.log(request.body);
});

app.post('/stripe_webhook', function(request, response) {
  // Retrieve the request's body and parse it as JSON
  var event = request.body;
  console.log("event.type: " + event['type']);

  response.send(200);
});


app.listen();
