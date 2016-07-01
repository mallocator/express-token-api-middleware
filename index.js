'use strict';

var Limiter = require('./lib/limiter');
var Tokens = require('./lib/tokens');


/**
 * @typedef {Object} Middleware
 * @property {Limiter.nodes} nodes
 * @property {Tokens.encode} getToken
 * @this Context
 */

/**
 * @typedef {Object} Context
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
 */

/**
 * @typedef {Object} TokenConfig
 * @property {string} id                The user id with which to identify the incoming user
 * @property {string|RegExp} [path]     An optional request path that the user is allowed to access (falsey means no restrictions)
 * @property {RateLimit|number} rate    A request rate limit that will prevent a user from sending to many requests per second
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
    var context = {
        config,
        tokens: new Tokens(config.password, config.salt),
        limiter: new Limiter(config.nodes)
    };
    var middleware = handler.bind(context);
    middleware.getToken = context.tokens.encode.bind(context.tokens);
    middleware.nodes = context.limiter.nodes;
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
    var token = req.header('Authorization') || req.params[this.config.param] || req.cookies && req.cookies[this.config.params];
    if (!token || !token.trim().length) {
        return res.status(401).end();
    }
    var user = this.tokens.decode(token);
    if (!user) {
        return res.status(403).end();
    }
    if (user.path && !user.path.test(req.originalUrl)) {
        return res.status(403).end();
    }
    req.user = user;
    this.limiter.check(user, next);
}

module.exports = Middleware;
