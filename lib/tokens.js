'use strict';

var crypto = require('crypto');
var zlib = require('zlib');

const algo = 'aes-256-gcm';


class Tokens {
    constructor(config) {
        this._config = config;
        this._key = crypto.pbkdf2Sync(config.password, config.salt, 1001, 32, 'sha256');
    }

    /**
     *
     * @param {TokenConfig} config
     * @returns {string}
     */
    encode(config) {
        config.path = config.path instanceof RegExp ? config.path.source : config.path;
        var payload = new Buffer(JSON.stringify(config), 'utf8');
        var iv = crypto.randomBytes(12);
        var cipher = crypto.createCipheriv(algo, this._key, iv);
        var encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);
        var authTag = cipher.getAuthTag();
        var combined = Buffer.concat([iv, authTag, encrypted]);
        return encodeURIComponent(zlib.deflateRawSync(combined, {
            strategy: zlib.Z_FILTERED,
            level: zlib.Z_BEST_COMPRESSION
        }).toString('base64'));
    }

    /**
     * @param {string} token    The auth token on the user request
     * @returns {TokenConfig|null} The token config/user object or null if there was an error decoding the user.
     */
    decode(token) {
        try {
            var inflated = zlib.inflateRawSync(new Buffer(decodeURIComponent(token), 'base64'));
            var iv = inflated.slice(0, 12);
            var tag = inflated.slice(12, 28);
            var encrypted = inflated.slice(28);
            var decipher = crypto.createDecipheriv(algo, this._key, iv);
            decipher.setAuthTag(tag);
            var decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
            var user = JSON.parse(decrypted.toString('utf8'));
            user.path = user.path && (user.path instanceof RegExp ? user.path : new RegExp(user.path));
            return user;
        } catch (e) {
            return null;
        }
    }
}

module.exports = Tokens;



