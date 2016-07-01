'use strict';

class Limiter {
    constructor(config) {
        this._config = config;
        this.queues = {};
        this.timers = {};
    }

    /**
     * A function that does nothing, but is used in reference when counting foreign requests that we should wait on.
     * @private
     */
    _noop() {}

    /**
     * @param {number|string|RateLimit} rate
     * @returns {number} How many ms to wait between requests
     * @private
     */
    static _validateRate(rate) {
        if (typeof rate == 'string') {
            let value = parseInt(rate);
            let unit = rate.match(/([a-zA-Z]*)\s*$/)[0];
            rate = { value, unit };
        }
        if (typeof rate == 'object') {
            switch(rate.unit.toLowerCase()) {
                case 'ns':
                    rate = Math.ceil(rate.value / 1000000);
                    break;
                case '':
                case 'ms':
                    rate = rate.value;
                    break;
                case 's':
                    rate = rate.value * 1000;
                    break;
                case 'm':
                    rate = rate.value * 1000 * 60;
                    break;
                case 'h':
                    rate = rate.value * 1000 * 60 * 60;
                    break;
                case 'd':
                    rate = rate.value * 1000 * 60 * 60 * 24;
                    break;
                case 'w':
                    rate = rate.value * 1000 * 60 * 60 * 24 * 7;
                    break;
                default:
                    throw new Error('Unknown unit specified for rate limit: ' + rate.unit);
            }
        }
        if (rate < 1) {
            throw new Error('Invalid number of nodes specified for determining rate limits:' + rate);
        }
        return rate;
    }

    /**
     * Check's whether there's another request blocking this one based on the rate limit configuration of the token.
     * Users without a rate limit settings will not be blocked.
     * @param {TokenConfig} user    The user object that has the rate configuration
     * @param {function} cb         The next() handler passed in from express
     */
    check(user, cb) {
        if (!user.rate) {
            cb();
        }
        var rate = Limiter._validateRate(user.rate);
        if (!this.queues[user.id]) {
            this.queues[user.id] = [];
            cb();
            setTimeout(this._process.bind(this), rate * this._config.nodes, user);
        } else {
            this.queues[user.id].push(cb)
        }
    }

    /**
     * Allows a third party to notify this limiter that requests have been made somewhere else that should be counted
     * towards the request limit.
     * @param {TokenConfig} user    The user for which to update the request count
     * @param {number} [requests=1] How many requests have been made somewhere else
     */
    notify(user, requests = 1) {
        if (!this.queues[user.id]) {
            var rate = Limiter._validateRate(user.rate);
            this.queues[user.id] = [];
            for (let i = 1; i < requests; i++) {
                this.queues[user.id].push(this._noop);
            }
            return setTimeout(this._process.bind(this), rate * this._config.nodes, user);
        }
        for (let i = 0; i < requests; i++) {
            this.queues[user.id].push(this._noop);
        }
    }

    /**
     * Processes the next request on the queue after a timeout.
     * @param {TokenConfig} user
     * @private
     */
    _process(user) {
        if (!this.queues[user.id].length) {
            return delete this.queues[user.id];
        }
        var cb = this.queues[user.id].shift();
        cb();
        setTimeout(this._process.bind(this), user.rate * this._config.nodes, user);
    }
}

module.exports = Limiter;
