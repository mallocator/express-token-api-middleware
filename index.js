const events = require('events');
const util = require('util');

const Limiter = require('./lib/limiter');
const Tokens = require('./lib/tokens');


/**
 * @typedef {Object} Middleware
 * @property {Limiter.nodes} nodes
 * @property {Tokens.encode} getToken
 * @property {Limiter.notify} notify
 * @this Context
 */

/**
 * @typedef {Object} Context
 * @property {EventEmitter} emitter     The event emitter
 * @property {MiddlewareConfig} config  The global configuration for the middleware instance
 * @property {Tokens} tokens            The token encoder/decoder
 * @property {Limiter} limiter          The rate limiter
 */

/**
 * @typedef {Object} MiddlewareConfig
 * @property {string} [param=token] The get/cookie parameter name to use to look for the auth token
 * @property {number} [nodes=1]     If this node is part of a round robin cluster you can specify how many nodes there are.
 *                                  This will be used to determine the proper rate limit for a user without having to
 *                                  synchronize with other nodes. (a simple "ratelimit * nodes" calculation is applied)
 * @property {string} password      The password used to encrypt and decrypt user tokens
 * @property {String|Buffer} salt   Used to generate unique passwords for this server. You can easily generate a salt using
 *                                  the nodejs crypto library with crypto.randomBytes(16).
 * @property {function} [logger]    A logger function that accepts a log message as first parameter (e.g. console.log)
 * @property {number} [timeout]     A maximum waiting time for incoming requests. If the queue of requests being processed
 *                                  is going to wait longer than this value (in ms) any subsequent requests will be rejected
 *                                  until the queue is cleared up again.
 * @property {ErrorHandler} error   Specify your own custom error handler if you don't want the middleware to respond with
 *                                  standard error codes.
 */

/**
 * @callback ErrorHandler
 * @param {ClientRequest} req   The client request object
 * @param {ServerResponse} res  The server response object
 * @param {function} next       The chain handler function to progress to the next request handler in the request chain
 * @param {number} statusCode   The status code that the middleware would send to the client
 * @param {string} errorMessage The error message generated by the middleware
 */

/**
 * @typedef {Object} TokenConfig
 * @property {string|number} id         The user id with which to identify the incoming user
 * @property {string|RegExp} [path]     An optional request path that the user is allowed to access (falsey means no restrictions)
 * @property {RateLimit|number} [rate]  A request rate limit that will prevent a user from sending to many requests per second
 * @property {string|number|Date} [exp] An expiration date when the token will no longer be valid
 */

/**
 * @typedef {Object} RateLimit
 * @property {number} value
 * @property {string} unit
 */

/**
 *
 * @param {MiddlewareConfig} config
 * @returns {Middleware}
 */
function Middleware(config = {}) {
    if (!config.password) {
        throw new Error('Unable to initialize token api middleware without password');
    }
    if (!config.salt) {
        throw new Error('Unable to initialize token api middleware without a password salt');
    } else {
        config.salt = config.salt instanceof Buffer ? config.salt : new Buffer(config.salt, 'utf8');
        if (config.salt.length < 16) {
            throw new Error('The given salt is too short, please generate one with at lest 16 bytes length');
        }
    }
    config.param = config.param || 'token';
    config.logger = config.logger || (() => {});
    config.nodes = parseInt(config.nodes) || 1;
    config.error = config.error || error;
    let context = {
        config,
        emitter: new events.EventEmitter(),
        tokens: new Tokens(config),
        limiter: new Limiter(config)
    };
    let middleware = handler.bind(context);
    for (let prop in context.emitter) {
        if (typeof context.emitter[prop] == 'function') {
            middleware[prop] = context.emitter[prop].bind(context.emitter);
        }
    }
    middleware.getToken = context.tokens.encode.bind(context.tokens);
    middleware.notify = context.limiter.notify.bind(context.limiter);
    middleware.__defineSetter__('nodes', val => context.config.nodes = val);
    return middleware;
}

/**
 * The handler that check for valid api tokens and converts them to a usable user object.
 * @param {ClientRequest} req
 * @param {ServerResponse} res
 * @param {function} next
 * @this Context
 */
function handler(req, res, next) {
    let token = req.header('Authorization') || req.query[this.config.param] || req.cookies && req.cookies[this.config.params];
    if (!token || !token.trim().length) {
        this.emitter.emit('missing', req);
        let message = 'No token found on request';
        this.config.logger(message);
        return this.config.error(req, res, next, 401, message);
    }
    let user = this.tokens.decode(token);
    if (!user) {
        this.emitter.emit('fail', req);
        let message = 'Unable to decode token on request';
        this.config.logger(message);
        return this.config.error(req, res, next, 403, message);
    }
    req.user = user;
    if (user.path && !user.path.test(req.originalUrl)) {
        this.emitter.emit('reject', req);
        let message = 'The user has not been granted access to this endpoint: ' + req.originalUrl;
        this.config.logger(message);
        return this.config.error(req, res, next, 403, message);
    }
    if (user.exp && user.exp < Date.now()) {
        this.emitter.emit('expired', req);
        let message = 'The user token has expired: ' + new Date(user.exp).toISOString();
        this.config.logger(message);
        return this.config.error(req, res, next, 403, message);
    }
    try {
        this.limiter.check(user, next);
        this.emitter.emit('success', req);
    } catch (e) {
        this.emitter.emit('timeout', req);
        let message = 'The user has exceeded the timeout threshold by making too many requests';
        this.config.logger(message);
        return this.config.error(req, res, next, 429, message);
    }
}

/**
 * @type ErrorHandler
 */
function error(req, res, next, status, message) {
    res.status(status).end();
}

module.exports = Middleware;
