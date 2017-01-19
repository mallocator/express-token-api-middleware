/* global describe, it, beforeEach, afterEach */
const async = require('async');
const crypto = require('crypto');
const expect = require('chai').expect;
const express = require('express');
const request = require('supertest');

const middleware = require('..');

describe('middleware', () => {
    it('should create a basic token for authentication', done => {
        let app = express();
        let tokenManager = middleware({
            password: 'test',
            salt: crypto.randomBytes(16)
        });
        expect(tokenManager.on).to.be.a('function');

        app.use(tokenManager);
        app.get('/test', (req, res) => {
            expect(req.user.id).to.equal('1');
            res.end();
        });

        let token = tokenManager.getToken({
            id: '1'
        });

        request(app).get('/test').set('Authorization', token).expect(200).end(done);
    });

    it('should support async responses', done => {
        let app = express();
        let tokenManager = middleware({
            password: 'test',
            salt: crypto.randomBytes(16)
        });

        app.get('/test', tokenManager, (req, res) => {
            setTimeout(() => res.end(), 1);
        });

        let token = tokenManager.getToken({
            id: '1'
        });

        request(app).get('/test').set('Authorization', token).expect(200).end(done);
    });

    it('should support authentication using a parameter', done => {
        let app = express();
        let tokenManager = middleware({
            password: 'test',
            salt: crypto.randomBytes(16)
        });

        app.use(tokenManager);
        app.get('/test', (req, res) => {
            expect(req.user.id).to.equal('1');
            res.end();
        });

        let token = tokenManager.getToken({
            id: '1'
        });

        request(app).get('/test?token=' + token).expect(200).end(done);
    });

    it('should create a token that is limited to a request path', done => {
        let app = express();
        let tokenManager = middleware({
            password: 'test',
            salt: crypto.randomBytes(16)
        });
        app.use(tokenManager);
        app.get('/test', (req, res) => res.end());
        app.get('/secure', (req, res) => res.end());

        let token = tokenManager.getToken({
            id: '1',
            path: /^\/secure.*/
        });

        async.parallel([
            cb => request(app).get('/test').set('Authorization', token).expect(403, cb),
            cb => request(app).get('/secure').expect(401, cb),
            cb => request(app).get('/secure').set('Authorization', 'wrong').expect(403, cb),
            cb => request(app).get('/secure').set('Authorization', token).expect(200, cb)
        ], done);
    });

    it('should create a token that is time limited', done => {
        let app = express();
        let tokenManager = middleware({
            password: 'test',
            salt: crypto.randomBytes(16)
        });
        app.use(tokenManager);
        app.get('/test', (req, res) => res.end());

        let token = tokenManager.getToken({
            id: '1',
            exp: Date.now() + 20
        });

        setTimeout(() => {
            request(app).get('/test').set('Authorization', token).expect(403, done);
        }, 50);
    });

    it('should create a token that is rate limited', done => {
        let app = express();
        let tokenManager = middleware({
            password: 'test',
            salt: crypto.randomBytes(16)
        });
        app.use(tokenManager);
        app.get('/test', (req, res) => {
            res.end();
        });

        let token = tokenManager.getToken({
            id: '1',
            rate: '100ms'
        });

        let token2 = tokenManager.getToken({
            id: '2',
            rate: '100ms'
        });

        let start = process.hrtime();
        async.parallel([
            cb => request(app).get('/test').set('Authorization', token).expect(200, cb),
            cb => request(app).get('/test').set('Authorization', token).expect(200, cb),
            cb => request(app).get('/test').set('Authorization', token2).expect(200, cb)
        ], err => {
            let elapsed = process.hrtime(start);
            let ms = (elapsed[0] * 1e9 + elapsed[1]) / 1000000;
            expect(ms).to.be.gt(100);
            expect(ms).to.be.lt(150);
            done(err);
        });
    });

    it('should support time limited tokens on async requests', done => {
        let app = express();
        let tokenManager = middleware({
            password: 'test',
            salt: crypto.randomBytes(16)
        });
        app.get('/test', tokenManager, (req, res) => {
            setTimeout(() => res.end(), 10);
        });

        let token = tokenManager.getToken({
            id: '1',
            rate: '100ms'
        });

        request(app).get('/test').set('Authorization', token).expect(200, done);
    });

    it('should rate limit while being manually notified', done => {
        let app = express();
        let tokenManager = middleware({
            password: 'test',
            salt: crypto.randomBytes(16)
        });
        app.use(tokenManager);
        app.get('/test', (req, res) => res.end());

        let user = {
            id: '1',
            rate: '100ms'
        };
        let token = tokenManager.getToken(user);

        let start = process.hrtime();
        async.series([
            cb => {
                tokenManager.notify(user);
                cb();
            },
            cb => request(app).get('/test').set('Authorization', token).expect(200, cb)
        ], err => {
            let elapsed = process.hrtime(start);
            let ms = (elapsed[0] * 1e9 + elapsed[1]) / 1000000;
            expect(ms).to.be.gt(100);
            expect(ms).to.be.lt(150);
            done(err);
        });
    });

    it('should rate limit while being manually notified even if a request is already being processed', done => {
        let app = express();
        let tokenManager = middleware({
            password: 'test',
            salt: crypto.randomBytes(16)
        });
        app.use(tokenManager);
        app.get('/test', (req, res) => res.end());

        let user = {
            id: '1',
            rate: '100ms'
        };
        let token = tokenManager.getToken(user);

        let start = process.hrtime();
        async.series([
            cb => request(app).get('/test').set('Authorization', token).expect(200, cb),
            cb => {
                tokenManager.notify(user);
                cb();
            },
            cb => request(app).get('/test').set('Authorization', token).expect(200, cb)
        ], err => {
            let elapsed = process.hrtime(start);
            let ms = (elapsed[0] * 1e9 + elapsed[1]) / 1000000;
            expect(ms).to.be.gt(200);
            expect(ms).to.be.lt(250);
            done(err);
        });
    });

    it('should reject requests if the requests queue is already too long', done => {
        let app = express();
        let tokenManager = middleware({
            password: 'test',
            salt: crypto.randomBytes(16),
            timeout: 100
        });
        app.use(tokenManager);
        app.get('/test', (req, res) => res.end() );

        let user = {
            id: '1',
            rate: '50ms'
        };
        let token = tokenManager.getToken(user);

        request(app).get('/test').set('Authorization', token).expect(200);
        request(app).get('/test').set('Authorization', token).expect(200);
        request(app).get('/test').set('Authorization', token).expect(200);


        async.parallel([
            cb => request(app).get('/test').set('Authorization', token).expect(200, cb), // processed now
            cb => request(app).get('/test').set('Authorization', token).expect(200, cb), // queued (50ms)
            cb => request(app).get('/test').set('Authorization', token).expect(200, cb)  // queued (100ms)
        ], () => {
            request(app).get('/test').set('Authorization', token).expect(429, done) // rejected (more than 100ms waiting)
        });
    });

    it('should not initialize if configuration properties are missing or invalid', () => {
        try {
            middleware({
                password: 'test'
            });
            throw new Error('Test Failed');
        } catch(e) {
            expect(e.message).to.equal('Unable to initialize token api middleware without a password salt');
        }

        try {
            middleware({
                salt: crypto.randomBytes(16)
            });
            throw new Error('Test Failed');
        } catch(e) {
            expect(e.message).to.equal('Unable to initialize token api middleware without password');
        }

        try {
            middleware({
                password: 'test',
                salt: 'too short'
            });
            throw new Error('Test Failed');
        } catch(e) {
            expect(e.message).to.equal('The given salt is too short, please generate one with at lest 16 bytes length');
        }
    });
});
