'use strict';

class Limiter {
    constructor(config) {
        this._config = config;
        this.queues = {};
    }

    /**
     * @param {number|string|RateLimit} rate
     * @returns {number} How many ms to wait between requests
     */
    validateRate(rate) {
        if (typeof rate == 'string') {
            let value = parseInt(rate);
            let unit = rate.match(/([nm]?s|m|h)$/)[0];
            rate = { value, unit };
        }
        if (typeof rate == 'object') {
            switch(rate.unit.toLowerCase()) {
                case 'ns':
                    rate = Math.ceil(rate.value / 1000);
                    break;
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
        user.rate = this.validateRate(user.rate);
        if (!this.queues[user.id]) {
            this.queues[user.id] = [];
            cb();
            setTimeout(this._process.bind(this), user.rate * this._config.nodes, user);
        } else {
            this.queues[user.id].push(cb)
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
