# express-token-api-middleware
[![npm version](https://badge.fury.io/js/express-token-api-middleware.svg)](http://badge.fury.io/js/express-token-api-middleware)
[![Build Status](https://travis-ci.org/mallocator/express-token-api-middleware.svg?branch=master)](https://travis-ci.org/mallocator/express-token-api-middleware)
[![Coverage Status](https://coveralls.io/repos/mallocator/express-token-api-middleware/badge.svg?branch=master&service=github)](https://coveralls.io/github/mallocator/express-token-api-middleware?branch=master)
[![Dependency Status](https://david-dm.org/mallocator/express-token-api-middleware.svg)](https://david-dm.org/mallocator/express-token-api-middleware) 

An express middleware that allows to protect an api behind token authentication, rate limiting and endpoint permissions.


## About

This is a middleware for express that will hopefully make your life easier if you want to make your api available to 3rd party developer 
by using token to authenticate. The philosophy behind this middleware is to be completely database independent and rely on token to 
retrieve information about the user such as access rights and rate limitations.

Tokens are encrypted using AES256 with GCM and can be given out to users without them having access to the data within. Tokens can also
be used to store additional metadata, note though that token will increase in size if you do.
 
 
## Getting Started

First let's initialize the middleware

```Javascript
var express = require('express');
var tokens = require('express-token-api-middleware');

var app = express();
var mw = tokens({
    password: 'my super secret password',
    salt: 'something that will be at least 16 bytes long (preferably a Buffer)'
});
app.use(mw);
app.get('/', (req, res) => {
    console.log(req.user);      // => { id: 'My own user id' } 
    res.end();
}):
```

We've now set up the token authentication for all requests. Sending requests to the server will all be blocked with a 401 status (No auth provided). 
Now we need a token to authenticate our requests:

```Javascript
var token = mw.getToken({ id: 'My own user id' })
```

This token will hold additional data such as a rate limit or access rights (more on that in the API section). Now we need to use the token to
authenticate our server (we make use of the supertest request helper, but the code should be self explanatory):

```Javascript
request(app).get('/').set('Authorization', token).end();
// => Status 200 "OK"
```

And that's all. Now let's dive into the API for more details:


# Api

### <constructor>(config)

There are a few options that you can set to change the behavior of the middleware:

```Javascript
var mw = tokens({
    param: 'token',
    nodes: 1,
    password: <needs to be set>,
    salt: <needs to be set>,
    logger: null,
    timeout: undefined
})
```

A look at the individual options:

* param:    The token can be sent either as Authorization header or as a get parameter or even as a cookie parameter (if enabled). This option specifies the parameter name.
* nodes:    If this server is running as part of a cluster, you can specify how many nodes are in the cluster. This will be factored in when calculating wait times based on the rate limit. 
* password: This is the password used to encrypt tokens. A unique password is recommended.
* salt:     The password will be salted to make it more secure. A longer salt means better randomness (recommended min length is 16 byte). You can generate on using the crypto library: ```crypto.randomBytes(16)```.
* logger:   In case you want to know what's going on you can pass in a logger function that accepts a string as first parameter (e.g. console.log)
* timeout:  Sets how long a request will be made to wait to fulfill the rate limit before it will be rejected with status 429 - Too Many Requests. Protects against overflowing request queues.
* error:    A custom error handler that will be used instead of letting the middleware respond to requests. The signature is ```error(req, res, next, status, message)```.

Note that password and salt are used to create a single key tha will encrypt all tokens. This tool does not use a key per user as this 
would require much more memory or a database tie in. In most cases this should be safe enough, but if you require higher security a different
solution is probably better suited. 


### getToken(config)

To authenticate your users you need to give them the tokens they can authenticate with. This where this method comes in.
There are a few standard properties that are used by the middleware, but you can add any additional properties which will
be stored in the token alongside the user configuration.

```Javascript

var token = mw.getToken({
    id: 'user id',
    path: '/path',
    rate: 100,
    custom: 'whatever'
});
```

Again a few options that need explaining:

* id:   The unique user id e.g. from your database. This will be used to associate incoming requests to the same user.
* path: A regular expression or string that will be treated as regex that decides whether the user is allowed to access an endpoint on the server.
* rate: Define the minimum interval between requests that a user can make. This setting can be a number (in ms) or a string with a unit (e.g. "100ms")

Rate limitation works in such a way that incoming requests will have a minimum interval of the given value. If 2 requests come in faster than that,
the second request will be delayed until the desired rate has been reached. The rate format supports multiple units: ns, ms, s, m, h, d, w. Note
though that if you use ns (= nano seconds) the minimum wait time between 2 requests is 1 ms).


## Cluster support

Now if you're running this server in any serious environment you'll probably have a cluster with more than 1 node running. Since there's no
communication between the middleware on the nodes built in, there's 2 ways you can still get a global rate emulated:
  
   
### set nodes

*Nodes configuration*

The simplest method is to specify how many nodes are in the cluster. The middleware will use that number to multiply the wait factors for
allowed rates. There are two ways how you can set the current number of nodes: 

1. _Set the configuration on the constructor_
   Remember that nodes configuration option on the constructor? That's what that is for. 
2. _Set it on the middleware instance_
   Since nodes will join and leave a cluster you might want to update the number of nodes dynamically. That's where the next api call comes in:

The nodes setter on the middleware allows you to change the number of nodes that are active even after the middleware has been initialized.

```Javascript
mw.nodes = 10;
```


### notify(user, requests = 1)

*Notify requests*
 
The second method to use for cluster support is to notify the middleware of requests on other nodes. Unfortunately you will have to take care
of setting up the infrastructure for communicating such information between nodes. You'll also have to specify a user object with rate limit to
make use of this feature. 


```Javascript
mw.notify({ 
    id: 'user on other node', 
    rate: 100 
}
```

You can specify the number of requests the user has made on other nodes and thereby make any requests to this instance wait even more. How well
this approach will work with your setup depends on how good the communication is set up between nodes. 

In any case I would recommend to only use this if you know what you're doing and otherwise stick to the nodes configuration method.


## Events

The middleware also emits events in case you want to react to some of the possible error events. All events have the same signature and can 
be used as such:

```Javascript
mw.on('missing', req => console.log('Missing auth token from request', req));
```


### missing(req)

Triggered whenever the middleware rejects a request because no token has been found. The request object does not include the user object as 
there is nothing to decrypt.


### fail(req)

Triggered whenever the middleware was unable to decrypt a token. The request object does not include the user object as we were unable to 
decrypt it.


### reject(req)

Triggered whenever a user is rejected access to a specific path. The request object includes the decrypted user object.


### timeout(req)

The timeout event is triggered whenever the request queue is full and request get rejected. The request object includes the decrypted
user object.


### success(req)

Triggered when a request has successfully been queued up and has already been processed or will be processed once the rate limit queue
has caught up.


## Tests / Examples

For more examples and to check out the tests you can look at [middleware.test.js](test/middleware.test.js) in the test directory.  


## Roadmap

Some ideas to maybe work on in the future:

* Rate limit based on number of calls instead of timing
* Maximum wait time for requests (e.g. if delay is > 1 minute, reject request)
* Events/custom handlers for different steps... but then again you can just use your own handler with the user object in the request chain.
