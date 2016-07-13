/* global describe, it, beforeEach, afterEach */
'use strict';

var crypto = require('crypto');

var async = require('async');
var expect = require('chai').expect;
var express = require('express');
var request = require('supertest');

var middleware = require('..');

describe('middleware', () => {
    it('should create a basic token for authentication', done => {
        var app = express();
        var tokenManager = middleware({
            password: 'test',
            salt: crypto.randomBytes(16)
        });
        expect(tokenManager.on).to.be.a('function');

        app.use(tokenManager);
        app.get('/test', (req, res) => {
            expect(req.user.id).to.equal('1');
            res.end();
        });

        var token = tokenManager.getToken({
            id: '1'
        });

        request(app).get('/test').set('Authorization', token).expect(200).end(done);
    });

    it('should create a token that is limited to a request path', done => {
        var app = express();
        var tokenManager = middleware({
            password: 'test',
            salt: crypto.randomBytes(16)
        });
        app.use(tokenManager);
        app.get('/test', (req, res) => res.end());
        app.get('/secure', (req, res) => res.end());

        var token = tokenManager.getToken({
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
        var app = express();
        var tokenManager = middleware({
            password: 'test',
            salt: crypto.randomBytes(16)
        });
        app.use(tokenManager);
        app.get('/test', (req, res) => res.end());

        var token = tokenManager.getToken({
            id: '1',
            exp: Date.now() + 20
        });

        setTimeout(() => {
            request(app).get('/test').set('Authorization', token).expect(403, done);
        }, 50);
    });

    it('should create a token that is rate limited', done => {
        var app = express();
        var tokenManager = middleware({
            password: 'test',
            salt: crypto.randomBytes(16)
        });
        app.use(tokenManager);
        app.get('/test', (req, res) => {
            res.end();
        });

        var token = tokenManager.getToken({
            id: '1',
            rate: '100ms'
        });

        var token2 = tokenManager.getToken({
            id: '2',
            rate: '100ms'
        });

        var start = process.hrtime();
        async.parallel([
            cb => request(app).get('/test').set('Authorization', token).expect(200, cb),
            cb => request(app).get('/test').set('Authorization', token).expect(200, cb),
            cb => request(app).get('/test').set('Authorization', token2).expect(200, cb)
        ], err => {
            var elapsed = process.hrtime(start);
            var ms = (elapsed[0] * 1e9 + elapsed[1]) / 1000000;
            expect(ms).to.be.gt(100);
            expect(ms).to.be.lt(150);
            done(err);
        });
    });

    it('should rate limit while being manually notified', done => {
        var app = express();
        var tokenManager = middleware({
            password: 'test',
            salt: crypto.randomBytes(16)
        });
        app.use(tokenManager);
        app.get('/test', (req, res) => res.end());

        var user = {
            id: '1',
            rate: '100ms'
        };
        var token = tokenManager.getToken(user);

        var start = process.hrtime();
        async.series([
            cb => {
                tokenManager.notify(user);
                cb();
            },
            cb => request(app).get('/test').set('Authorization', token).expect(200, cb)
        ], err => {
            var elapsed = process.hrtime(start);
            var ms = (elapsed[0] * 1e9 + elapsed[1]) / 1000000;
            expect(ms).to.be.gt(100);
            expect(ms).to.be.lt(150);
            done(err);
        });
    });

    it('should rate limit while being manually notified even if a request is already being processed', done => {
        var app = express();
        var tokenManager = middleware({
            password: 'test',
            salt: crypto.randomBytes(16)
        });
        app.use(tokenManager);
        app.get('/test', (req, res) => res.end());

        var user = {
            id: '1',
            rate: '100ms'
        };
        var token = tokenManager.getToken(user);

        var start = process.hrtime();
        async.series([
            cb => request(app).get('/test').set('Authorization', token).expect(200, cb),
            cb => {
                tokenManager.notify(user);
                cb();
            },
            cb => request(app).get('/test').set('Authorization', token).expect(200, cb)
        ], err => {
            var elapsed = process.hrtime(start);
            var ms = (elapsed[0] * 1e9 + elapsed[1]) / 1000000;
            expect(ms).to.be.gt(200);
            expect(ms).to.be.lt(250);
            done(err);
        });
    });

    it('should reject requests if the requests queue is already too long', done => {
        var app = express();
        var tokenManager = middleware({
            password: 'test',
            salt: crypto.randomBytes(16),
            timeout: 100
        });
        app.use(tokenManager);
        app.get('/test', (req, res) => res.end() );

        var user = {
            id: '1',
            rate: '50ms'
        };
        var token = tokenManager.getToken(user);

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
