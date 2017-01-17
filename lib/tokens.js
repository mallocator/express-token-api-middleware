const crypto = require('crypto');
const zlib = require('zlib');

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
        config.exp && (config.exp = Tokens._toDate(config.exp));
        let payload = new Buffer(JSON.stringify(config), 'utf8');
        let iv = crypto.randomBytes(12);
        let cipher = crypto.createCipheriv(algo, this._key, iv);
        let encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);
        let authTag = cipher.getAuthTag();
        let combined = Buffer.concat([iv, authTag, encrypted]);
        return encodeURIComponent(zlib.deflateRawSync(combined, {
            strategy: zlib.Z_FILTERED,
            level: zlib.Z_BEST_COMPRESSION
        }).toString('base64'));
    }

    /**
     *
     * @param {Date|number|string} val
     * @returns {Number}
     * @private
     */
    static _toDate(val) {
        if (typeof val == 'string') {
            val = Date.parse(val);
        }
        if (!isNaN(val)) {
            val = new Date(val)
        }
        if (val instanceof Date) {
            if (val.getTime() <= Date.now()) {
                throw new Error('Invalid token configuration: already beyond expiration date');
            }
            return val.getTime();
        }
        throw new Error('Expiration is in an unknown format');
    }

    /**
     * @param {string} token    The auth token on the user request
     * @returns {TokenConfig|null} The token config/user object or null if there was an error decoding the user.
     */
    decode(token) {
        try {
            let inflated = zlib.inflateRawSync(new Buffer(decodeURIComponent(token), 'base64'));
            let iv = inflated.slice(0, 12);
            let tag = inflated.slice(12, 28);
            let encrypted = inflated.slice(28);
            let decipher = crypto.createDecipheriv(algo, this._key, iv);
            decipher.setAuthTag(tag);
            let decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
            let user = JSON.parse(decrypted.toString('utf8'));
            user.path = user.path && (user.path instanceof RegExp ? user.path : new RegExp(user.path));
            return user;
        } catch (e) {
            return null;
        }
    }
}

module.exports = Tokens;



